#!/usr/bin/env node
// S13 comparative benchmark harness (spec MAWS-SII-TARGET-SPEC-001 v0.2.0,
// section 10.6, PROPOSED). Measures the orchestration form itself: a static
// single-executor baseline against a policy-bound multi-executor candidate
// over the SAME fixed task set, executor profile and eval family.
//
// Every measured dimension is DERIVED, never asserted:
//   * verification_outcome comes from an independent verifier executor that
//     inspects the merged artifact against the required acceptance fields
//     (the verifier must not be one of the producing executors);
//   * artifact_quality comes from the recorded artifact content measured
//     against the task's quality floor;
//   * the composed/kept-single routing comes from the REAL buildComposition
//     policy gate (mode, executor count and parallelism bound);
//   * the counterproductive cases come from compositions the candidate
//     actually evaluated through that gate and then rejected because the
//     measurement was worse than the single-executor baseline.
//
// The emitted ComparativeBenchmarkRecord is comparison evidence only: it is
// never an approval for broader autonomy, never a qualification, and never
// its own success assertion (comparison_only is const true).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FailClosedError, nowIso } from '../../runtime/vnext/util.mjs';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { buildComposition } from '../../runtime/routing/composition.mjs';
import { developmentProbeHarnessContext } from '../../runtime/harness-context/context-binding.mjs';

const BENCHMARK_CONTRACT = 'core/contracts/benchmark-record.schema.json';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const METRIC_KEYS = ['tokens_in', 'tokens_out', 'cost_units', 'latency_ms', 'interventions'];
const EXECUTOR_ID_PATTERN = /^exec_[a-z0-9_]+$/;

export class BenchmarkConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function configError(code, message) {
  throw new BenchmarkConfigError(code, message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

// A value counts as present when it carries actual content: a non-empty
// string, a non-empty array, a non-empty object, or a scalar.
function isPresentValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

// The textual content of an artifact: string values plus the string elements
// of array values. This is what the quality floor is measured against.
function artifactTextLength(artifact) {
  if (artifact === null || typeof artifact !== 'object') return 0;
  let length = 0;
  for (const value of Object.values(artifact)) {
    if (typeof value === 'string') {
      length += value.length;
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') length += entry.length;
      }
    }
  }
  return length;
}

function validateMetrics(scope, profile) {
  for (const metric of METRIC_KEYS) {
    if (typeof profile[metric] !== 'number' || profile[metric] < 0) {
      configError('BENCHMARK_TASK_SET_INVALID', `${scope}: ${metric} must be a non-negative number`);
    }
  }
}

function validateArtifact(scope, profile) {
  if (profile.artifact === null || typeof profile.artifact !== 'object' || Array.isArray(profile.artifact)) {
    configError('BENCHMARK_TASK_SET_INVALID', `${scope}: artifact must be the recorded artifact object of this variant`);
  }
}

// loadBenchmarkTaskSet(path) -> validated task set. Fail closed on shape
// defects; the task set is fixed evidence, not free-form input.
export function loadBenchmarkTaskSet(tasksPath) {
  let taskSet;
  try {
    taskSet = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  } catch (error) {
    configError('BENCHMARK_TASK_SET_UNREADABLE', `task set is not readable JSON: ${error.message}`);
  }
  if (taskSet === null || typeof taskSet !== 'object' || Array.isArray(taskSet)) {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must be a JSON object');
  }
  if (!isNonEmptyString(taskSet.task_set_ref) || !isNonEmptyString(taskSet.eval_family) || !isNonEmptyString(taskSet.authority_domain)) {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must carry task_set_ref, eval_family and authority_domain');
  }

  // The verification block is live input: the independent verifier executor
  // is the executor that produces the verification_outcome measurement.
  const verification = taskSet.verification;
  if (verification === null || typeof verification !== 'object' || Array.isArray(verification)) {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must carry the verification block with the independent verifier executor');
  }
  if (!isNonEmptyString(verification.verifier_executor_id) || !EXECUTOR_ID_PATTERN.test(verification.verifier_executor_id)) {
    configError('BENCHMARK_TASK_SET_INVALID', 'verification.verifier_executor_id must be a non-empty exec_ id');
  }
  if (verification.independent !== true) {
    configError('BENCHMARK_TASK_SET_INVALID', 'verification.independent must be true: the benchmark measures verification against independent acceptance criteria');
  }

  const parentAuthority = taskSet.parent_authority;
  if (
    parentAuthority === null || typeof parentAuthority !== 'object' || Array.isArray(parentAuthority)
    || !isNonEmptyString(parentAuthority.ceiling_ref)
    || !Array.isArray(parentAuthority.allowed_child_scopes) || parentAuthority.allowed_child_scopes.length === 0
  ) {
    configError('BENCHMARK_TASK_SET_INVALID', 'parent_authority must carry ceiling_ref and a non-empty allowed_child_scopes list');
  }

  // One executor profile for the whole comparison: baseline and candidate
  // differ in orchestration form, never in the executor profile (spec 10.6
  // step 2: identical input, identical executor profile).
  const profile = taskSet.executor_profile;
  if (
    profile === null || typeof profile !== 'object' || Array.isArray(profile)
    || !isNonEmptyString(profile.profile_ref)
    || !Array.isArray(profile.executor_ids) || profile.executor_ids.length === 0
  ) {
    configError('BENCHMARK_TASK_SET_INVALID', 'executor_profile must carry profile_ref and a non-empty executor_ids list');
  }
  for (const executorId of profile.executor_ids) {
    if (!isNonEmptyString(executorId) || !EXECUTOR_ID_PATTERN.test(executorId)) {
      configError('BENCHMARK_TASK_SET_INVALID', `executor_profile executor id ${executorId} must be a non-empty exec_ id`);
    }
  }

  const policy = taskSet.composition_policy;
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must carry the composition policy the candidate is bound to');
  }
  if (typeof policy.max_total_cost_units !== 'number' || policy.max_total_cost_units < 0) {
    configError('BENCHMARK_TASK_SET_INVALID', 'composition_policy.max_total_cost_units must be a non-negative number: the budget inheritance check requires a declared parent cap');
  }
  if (!Array.isArray(policy.workload_safety_classes_allowed) || policy.workload_safety_classes_allowed.length === 0) {
    configError('BENCHMARK_TASK_SET_INVALID', 'composition_policy.workload_safety_classes_allowed must be a non-empty list');
  }

  if (!Array.isArray(taskSet.tasks) || taskSet.tasks.length === 0) {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must carry a non-empty tasks array');
  }

  const ids = new Set();
  for (const task of taskSet.tasks) {
    if (task === null || typeof task !== 'object' || Array.isArray(task)) {
      configError('BENCHMARK_TASK_SET_INVALID', 'task entries must be objects');
    }
    if (!isNonEmptyString(task.task_id) || ids.has(task.task_id)) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ids must be unique non-empty strings (duplicate: ${task.task_id})`);
    }
    ids.add(task.task_id);
    if (task.kind !== 'atomic' && task.kind !== 'decomposable') {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: kind must be atomic or decomposable`);
    }
    if (!isNonEmptyString(task.workload_safety_class)) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: workload_safety_class is required`);
    }
    if (!isNonEmptyString(task.authority_ceiling_ref)) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: authority_ceiling_ref is required`);
    }
    if (task.executor_profile_ref !== profile.profile_ref) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: the comparison holds the executor profile constant; every task must reference ${profile.profile_ref}`);
    }
    const criteria = task.acceptance_criteria;
    if (
      criteria === null || typeof criteria !== 'object' || Array.isArray(criteria)
      || !Array.isArray(criteria.required_artifact_fields) || criteria.required_artifact_fields.length === 0
    ) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: acceptance_criteria.required_artifact_fields required`);
    }
    if (typeof criteria.min_summary_length !== 'number' || criteria.min_summary_length < 0) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: acceptance_criteria.min_summary_length must be a non-negative number`);
    }

    if (!task.static_variant || typeof task.static_variant !== 'object') {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} carries no static_variant`);
    }
    if (!isNonEmptyString(task.static_variant.executor_id)) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} static_variant: executor_id is required`);
    }
    validateMetrics(`task ${task.task_id} static_variant`, task.static_variant);
    validateArtifact(`task ${task.task_id} static_variant`, task.static_variant);

    if (!task.dynamic_variant || typeof task.dynamic_variant !== 'object') {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} carries no dynamic_variant`);
    }
    if (!Array.isArray(task.dynamic_variant.executor_ids) || task.dynamic_variant.executor_ids.length === 0) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} dynamic_variant: executor_ids must be a non-empty list`);
    }
    validateMetrics(`task ${task.task_id} dynamic_variant`, task.dynamic_variant);
    validateArtifact(`task ${task.task_id} dynamic_variant`, task.dynamic_variant);

    if (task.counterfactual !== undefined && task.counterfactual !== null) {
      const counterfactual = task.counterfactual;
      if (!Array.isArray(counterfactual.executor_ids) || counterfactual.executor_ids.length < 2) {
        configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} counterfactual: executor_ids must list at least two executors (a parallel composition option)`);
      }
      if (!isNonEmptyString(counterfactual.mode)) {
        configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} counterfactual: mode is required`);
      }
      validateMetrics(`task ${task.task_id} counterfactual`, counterfactual);
    }

    // Every executor that may run in this comparison must implement the one
    // shared profile; otherwise the measured difference would be confounded
    // by a profile change instead of the orchestration form.
    const producing = [
      task.static_variant.executor_id,
      ...task.dynamic_variant.executor_ids,
      ...(task.counterfactual ? task.counterfactual.executor_ids : [])
    ];
    for (const executorId of producing) {
      if (!profile.executor_ids.includes(executorId)) {
        configError('BENCHMARK_EXECUTOR_PROFILE_MISMATCH', `task ${task.task_id}: executor ${executorId} does not implement the shared profile ${profile.profile_ref}`);
      }
    }
  }
  return taskSet;
}

// partitionArtifact(artifact, workerIndex, workerCount) -> the disjoint
// field slice one worker contributes. The union over all workers reproduces
// the recorded artifact; the split is deterministic and never derived from
// the acceptance criteria.
function partitionArtifact(artifact, workerIndex, workerCount) {
  const slice = {};
  Object.entries(artifact).forEach(([field, value], position) => {
    if (position % workerCount === workerIndex) {
      slice[field] = value;
    }
  });
  return slice;
}

// runWorker -> one deterministic worker execution. Fresh isolated session:
// its own S11 harness context, its own payload object.
function runWorker({ task, executorId, sessionId, artifactSlice }) {
  const context = developmentProbeHarnessContext({ runRef: sessionId, contextId: `hctx_${sessionId}` });
  return {
    executor_id: executorId,
    session_id: sessionId,
    harness_context: context,
    payload: {
      task_id: task.task_id,
      worker_session: sessionId,
      context_grant: context.authority_grant,
      artifact: structuredClone(artifactSlice)
    }
  };
}

// assertWorkerIsolation -> fail closed when two workers of one task share a
// context, a payload, or leak a foreign session id.
function assertWorkerIsolation(task, workers) {
  const contextIds = new Set(workers.map((worker) => worker.harness_context.context_id));
  if (contextIds.size !== workers.length) {
    configError('CONTEXT_ISOLATION_VIOLATED', `task ${task.task_id}: workers share a harness context session`);
  }
  for (const worker of workers) {
    if (worker.harness_context.run_ref !== worker.session_id) {
      configError('CONTEXT_ISOLATION_VIOLATED', `task ${task.task_id}: worker ${worker.session_id} runs under a foreign harness context`);
    }
    if (worker.harness_context.authority_grant !== 'none') {
      configError('CONTEXT_ISOLATION_VIOLATED', `task ${task.task_id}: worker ${worker.session_id} carries an authority grant`);
    }
    const payloadText = JSON.stringify(worker.payload);
    for (const other of workers) {
      if (other === worker) continue;
      if (worker.payload === other.payload) {
        configError('CONTEXT_ISOLATION_VIOLATED', `task ${task.task_id}: workers share one payload object`);
      }
      if (payloadText.includes(other.session_id)) {
        configError('CONTEXT_ISOLATION_VIOLATED', `task ${task.task_id}: worker ${worker.session_id} payload leaks the session of ${other.session_id}`);
      }
    }
  }
}

// runVerifier -> the INDEPENDENT verifier executor inspects the merged
// artifact against the required acceptance fields. Its verdict is the
// verification_outcome measurement. A verifier that also produced part of
// the artifact is not independent: the harness fails closed.
function runVerifier({ task, artifact, verifierExecutorId, producingExecutorIds, sessionId }) {
  if (producingExecutorIds.includes(verifierExecutorId)) {
    configError('BENCHMARK_VERIFICATION_NOT_INDEPENDENT', `task ${task.task_id}: verifier ${verifierExecutorId} also produced part of the artifact; verification must be independent`);
  }
  const context = developmentProbeHarnessContext({ runRef: sessionId, contextId: `hctx_${sessionId}` });
  const missing = task.acceptance_criteria.required_artifact_fields.filter((field) => !isPresentValue(artifact?.[field]));
  return {
    executor_id: verifierExecutorId,
    session_id: sessionId,
    harness_context: context,
    verdict: missing.length === 0 ? 'PASS' : 'FAIL',
    missing_fields: missing
  };
}

// assessArtifactQuality -> the artifact quality measurement: the recorded
// artifact content measured against the task's quality floor.
function assessArtifactQuality(task, artifact) {
  const floor = task.acceptance_criteria.min_summary_length;
  return artifactTextLength(artifact) >= floor ? 'MEETS_CRITERIA' : 'BELOW_CRITERIA';
}

// composeThroughPolicyGate -> a composition that only exists because the
// REAL composition policy gate accepted it. A gate rejection is translated
// into the runner's fail-closed error contract; the parallelism bound is
// enforced here because buildComposition only bounds the executor count.
function composeThroughPolicyGate({ policy, mode, executorIds, authorityCeilingRef, now, label }) {
  if (executorIds.length > policy.max_parallelism) {
    configError('BENCHMARK_PARALLELISM_LIMIT_EXCEEDED', `${label}: ${executorIds.length} parallel participants exceed the policy parallelism bound ${policy.max_parallelism}`);
  }
  try {
    return buildComposition({
      composition_policy: policy,
      mode,
      participants: executorIds.map((executorId) => ({
        executor_id: executorId,
        routing_decision_ref: `rd_${label}_${executorId}`
      })),
      authority_ceiling_ref: authorityCeilingRef,
      created_at: now()
    });
  } catch (error) {
    if (error instanceof FailClosedError) {
      configError('BENCHMARK_COMPOSITION_REJECTED', `${label}: the composition policy rejected this composition (${error.code}): ${error.message}`);
    }
    throw error;
  }
}

// runVariant({ taskSet, variant, now? }) -> { totals, per_task,
// composed_task_ids, worker_sessions, verifier_sessions, compositions,
// counterfactual_evaluations } for 'static' (single-executor baseline) or
// 'dynamic' (policy-bound multi-executor candidate).
export function runVariant({ taskSet, variant, now = nowIso }) {
  const perTask = [];
  const workerSessions = [];
  const verifierSessions = [];
  const composedTaskIds = [];
  const compositions = [];
  const counterfactualEvaluations = [];

  for (const task of taskSet.tasks) {
    const profile = variant === 'static' ? task.static_variant : task.dynamic_variant;
    const executorIds = variant === 'static' ? [profile.executor_id] : profile.executor_ids;

    const workers = executorIds.map((executorId, index) => runWorker({
      task,
      executorId,
      sessionId: `${task.task_id}_w${index}`,
      artifactSlice: partitionArtifact(profile.artifact, index, executorIds.length)
    }));
    workerSessions.push(...workers);
    assertWorkerIsolation(task, workers);

    let composition = null;
    if (variant === 'dynamic') {
      if (executorIds.length > 1) {
        // Decomposition is never chosen merely because multiple executors
        // are available: an atomic task stays single-executor in the
        // candidate variant.
        if (task.kind !== 'decomposable') {
          configError('BENCHMARK_POLICY_VIOLATION', `task ${task.task_id} is atomic; the candidate must not compose it`);
        }
        composition = composeThroughPolicyGate({
          policy: taskSet.composition_policy,
          mode: 'independent_parallel',
          executorIds,
          authorityCeilingRef: task.authority_ceiling_ref,
          now,
          label: task.task_id
        });
        composedTaskIds.push(task.task_id);
        compositions.push({ task_id: task.task_id, decision: composition });
      } else if (task.counterfactual) {
        // The candidate evaluated this composition option through the same
        // policy gate and then kept the task single-executor.
        const counterfactualDecision = composeThroughPolicyGate({
          policy: taskSet.composition_policy,
          mode: task.counterfactual.mode,
          executorIds: task.counterfactual.executor_ids,
          authorityCeilingRef: task.authority_ceiling_ref,
          now,
          label: `${task.task_id}_counterfactual`
        });
        counterfactualEvaluations.push({
          task_id: task.task_id,
          composition_ref: counterfactualDecision.decision_id,
          executor_ids: [...task.counterfactual.executor_ids],
          metrics: Object.fromEntries(METRIC_KEYS.map((key) => [key, task.counterfactual[key]]))
        });
      }
    }

    const mergedArtifact = Object.assign({}, ...workers.map((worker) => worker.payload.artifact));
    const verifier = runVerifier({
      task,
      artifact: mergedArtifact,
      verifierExecutorId: taskSet.verification.verifier_executor_id,
      producingExecutorIds: executorIds,
      sessionId: `verify_${task.task_id}`
    });
    verifierSessions.push(verifier);

    perTask.push({
      task_id: task.task_id,
      tokens_in: profile.tokens_in,
      tokens_out: profile.tokens_out,
      cost_units: profile.cost_units,
      latency_ms: profile.latency_ms,
      interventions: profile.interventions,
      verification_outcome: verifier.verdict,
      artifact_quality: assessArtifactQuality(task, mergedArtifact),
      ...(composition ? { composition_ref: composition.decision_id } : {})
    });
  }

  const totals = perTask.reduce((acc, entry) => ({
    tokens_in: acc.tokens_in + entry.tokens_in,
    tokens_out: acc.tokens_out + entry.tokens_out,
    cost_units: acc.cost_units + entry.cost_units,
    latency_ms: acc.latency_ms + entry.latency_ms,
    interventions: acc.interventions + entry.interventions
  }), { tokens_in: 0, tokens_out: 0, cost_units: 0, latency_ms: 0, interventions: 0 });

  return {
    totals,
    per_task: perTask,
    composed_task_ids: composedTaskIds,
    worker_sessions: workerSessions,
    verifier_sessions: verifierSessions,
    compositions,
    counterfactual_evaluations: counterfactualEvaluations
  };
}

// deriveCounterproductiveCases -> the cases in which parallelization is
// counterproductive. A case exists only where the candidate actually
// evaluated a policy-permitted composition and the measurement was worse
// than the single-executor baseline. The reason is derived from the
// measured dimensions, never authored prose.
export function deriveCounterproductiveCases({ baseline, counterfactualEvaluations }) {
  const cases = [];
  for (const evaluation of counterfactualEvaluations) {
    const baselineEntry = baseline.per_task.find((entry) => entry.task_id === evaluation.task_id);
    if (!baselineEntry) continue;
    const worseOn = [];
    if (evaluation.metrics.cost_units > baselineEntry.cost_units) worseOn.push('cost_units');
    if (evaluation.metrics.latency_ms > baselineEntry.latency_ms) worseOn.push('latency_ms');
    if (evaluation.metrics.interventions > baselineEntry.interventions) worseOn.push('interventions');
    if (worseOn.length === 0) continue;
    cases.push({
      task_id: evaluation.task_id,
      reason: `a policy-permitted composition of ${evaluation.executor_ids.length} executors would exceed the single-executor baseline on ${worseOn.join(', ')}`,
      composition_ref: evaluation.composition_ref,
      worse_on: worseOn
    });
  }
  return cases;
}

// checkAuthorityBudgetInheritance({ taskSet, candidate, compositions }) ->
// fail-closed checks that composed (decomposed) work stays inside the parent
// authority and budget: every child ceiling inside the parent scope, every
// workload safety class allowed by the policy, no authority aggregation in
// a composition, and the candidate cost inside the declared parent cap.
export function checkAuthorityBudgetInheritance({ taskSet, candidate, compositions = [] }) {
  const cap = taskSet.composition_policy.max_total_cost_units;
  const allowedClasses = new Set(taskSet.composition_policy.workload_safety_classes_allowed);
  const allowedScopes = new Set(taskSet.parent_authority.allowed_child_scopes);
  const compositionByTask = new Map(compositions.map((entry) => [entry.task_id, entry.decision]));
  const violations = [];
  for (const task of taskSet.tasks) {
    if (!allowedScopes.has(task.authority_ceiling_ref)) {
      violations.push(`${task.task_id}: child ceiling ${task.authority_ceiling_ref} is outside the parent scope ${taskSet.parent_authority.ceiling_ref}`);
    }
    if (!allowedClasses.has(task.workload_safety_class)) {
      violations.push(`${task.task_id}: workload safety class ${task.workload_safety_class} is not allowed by the composition policy`);
    }
    const decision = compositionByTask.get(task.task_id);
    if (decision) {
      if (decision.authority_aggregation !== 'none') {
        violations.push(`${task.task_id}: the composition aggregated authority instead of staying inside the work unit ceiling`);
      }
      if (decision.authority_ceiling_ref !== task.authority_ceiling_ref) {
        violations.push(`${task.task_id}: the composition ceiling ${decision.authority_ceiling_ref} does not match the task child ceiling ${task.authority_ceiling_ref}`);
      }
    }
  }
  return {
    checked: true,
    child_ceilings_within_parent: violations.length === 0,
    budget_within_parent_cap: candidate.totals.cost_units <= cap,
    violations,
    evidence_ref: 'evals/benchmark/comparison/tasks.json#composition_policy'
  };
}

// semanticBenchmarkIssues(record, taskSet) -> string[]. The invariants the
// minimal schema engine cannot express: count adds up, same task set on
// both variants, composed/single partition matches the task kinds, the
// shared eval family and executor profile, the measured advantage of a
// composed task, the disjointness of composed and counterproductive tasks,
// inheritance checks true, candidate is policy-bound.
export function semanticBenchmarkIssues(record, taskSet) {
  const issues = [];
  const taskIds = taskSet.tasks.map((task) => task.task_id);

  for (const [label, measures] of [['baseline', record.measures_baseline], ['candidate', record.measures_candidate]]) {
    const ids = measures.per_task.map((entry) => entry.task_id);
    if (ids.length !== taskIds.length || [...taskIds].sort().join('|') !== [...ids].sort().join('|')) {
      issues.push(`${label}: per_task must cover the same fixed task set exactly once (B2 same eval family)`);
    }
    const sums = measures.per_task.reduce((acc, entry) => ({
      tokens_in: acc.tokens_in + entry.tokens_in,
      tokens_out: acc.tokens_out + entry.tokens_out,
      cost_units: acc.cost_units + entry.cost_units,
      latency_ms: acc.latency_ms + entry.latency_ms,
      interventions: acc.interventions + entry.interventions
    }), { tokens_in: 0, tokens_out: 0, cost_units: 0, latency_ms: 0, interventions: 0 });
    for (const metric of Object.keys(sums)) {
      if (Math.abs(sums[metric] - measures.totals[metric]) > 1e-9) {
        issues.push(`${label}: totals.${metric} (${measures.totals[metric]}) does not equal the per_task sum (${sums[metric]})`);
      }
    }
  }

  const decomposable = new Set(taskSet.tasks.filter((task) => task.kind === 'decomposable').map((task) => task.task_id));
  const allIds = new Set(taskIds);
  for (const taskId of record.selection_criteria.composed_tasks) {
    if (!decomposable.has(taskId)) {
      issues.push(`selection_criteria: composed task ${taskId} is not a decomposable task; decomposition is never chosen merely because executors are available`);
    }
    if (!allIds.has(taskId)) {
      issues.push(`selection_criteria: composed task ${taskId} is not in the task set`);
    }
  }
  for (const taskId of record.selection_criteria.single_executor_tasks) {
    if (!allIds.has(taskId)) {
      issues.push(`selection_criteria: single-executor task ${taskId} is not in the task set`);
    }
  }
  const covered = new Set([...record.selection_criteria.composed_tasks, ...record.selection_criteria.single_executor_tasks]);
  for (const taskId of taskIds) {
    if (!covered.has(taskId)) {
      issues.push(`selection_criteria: task ${taskId} has no selection decision`);
    }
  }

  // A composed task must be composed, and a task must never be both
  // composed and documented as a counterproductive case.
  const composedSet = new Set(record.selection_criteria.composed_tasks);
  const singleSet = new Set(record.selection_criteria.single_executor_tasks);
  for (const entry of record.selection_criteria.counterproductive_cases) {
    if (composedSet.has(entry.task_id)) {
      issues.push(`selection_criteria: task ${entry.task_id} is recorded as composed and as a counterproductive case`);
    }
    if (!singleSet.has(entry.task_id)) {
      issues.push(`selection_criteria: counterproductive case ${entry.task_id} is not a single-executor task`);
    }
    if (!isNonEmptyString(entry.composition_ref)) {
      issues.push(`selection_criteria: counterproductive case ${entry.task_id} carries no evaluated composition reference`);
    }
    if (!Array.isArray(entry.worse_on) || entry.worse_on.length === 0) {
      issues.push(`selection_criteria: counterproductive case ${entry.task_id} names no measured dimension`);
    }
  }

  // A composed task must show a measured advantage over the baseline;
  // otherwise the record claims a win it did not measure.
  for (const taskId of record.selection_criteria.composed_tasks) {
    const baselineEntry = record.measures_baseline.per_task.find((entry) => entry.task_id === taskId);
    const candidateEntry = record.measures_candidate.per_task.find((entry) => entry.task_id === taskId);
    if (!baselineEntry || !candidateEntry) {
      issues.push(`selection_criteria: composed task ${taskId} has no measured baseline/candidate entry`);
      continue;
    }
    const advantage = candidateEntry.cost_units < baselineEntry.cost_units
      || candidateEntry.latency_ms < baselineEntry.latency_ms
      || candidateEntry.interventions < baselineEntry.interventions;
    if (!advantage) {
      issues.push(`selection_criteria: composed task ${taskId} shows no measured advantage over the single-executor baseline`);
    }
  }

  // Same eval family, same authority domain, same executor profile.
  if (record.eval_family !== taskSet.eval_family) {
    issues.push('eval_family: the record does not carry the eval family of the fixed task set');
  }
  if (record.authority_domain !== taskSet.authority_domain) {
    issues.push('authority_domain: the record does not carry the authority domain of the fixed task set');
  }
  if (record.baseline_variant.eval_family !== record.candidate_variant.eval_family) {
    issues.push('eval_family: baseline and candidate must run in the same eval family');
  }
  if (record.baseline_variant.executor_profile_ref !== record.candidate_variant.executor_profile_ref) {
    issues.push('executor_profile: baseline and candidate must share the same executor profile');
  }
  const profileExecutors = new Set(taskSet.executor_profile.executor_ids);
  for (const executorId of [...record.baseline_variant.executor_ids, ...record.candidate_variant.executor_ids]) {
    if (!profileExecutors.has(executorId)) {
      issues.push(`executor_profile: executor ${executorId} does not implement ${taskSet.executor_profile.profile_ref}`);
    }
  }

  if (!record.authority_budget_inheritance.checked || !record.authority_budget_inheritance.child_ceilings_within_parent || !record.authority_budget_inheritance.budget_within_parent_cap) {
    issues.push('authority_budget_inheritance: checked inheritance must pass before a comparison is recorded');
  }
  if (!record.context_isolation.checked || !record.context_isolation.worker_sessions_isolated) {
    issues.push('context_isolation: worker context isolation must be checked and pass');
  }
  if (record.comparison_only !== true) {
    issues.push('comparison_only: a benchmark result is a comparison basis, never an approval or qualification');
  }
  return issues;
}

// runComparativeBenchmark({ tasksPath, now? }) -> { record, issues }.
export function runComparativeBenchmark({ tasksPath, now = nowIso }) {
  const taskSet = loadBenchmarkTaskSet(tasksPath);

  const baseline = runVariant({ taskSet, variant: 'static', now });
  const candidate = runVariant({ taskSet, variant: 'dynamic', now });

  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate, compositions: candidate.compositions });
  const counterproductive = deriveCounterproductiveCases({
    baseline,
    counterfactualEvaluations: candidate.counterfactual_evaluations
  });

  // Context isolation across every session of the candidate run (workers and
  // the independent verifier): one context per session, no shared session.
  const allSessions = [...candidate.worker_sessions, ...candidate.verifier_sessions];
  const allContextIds = allSessions.map((session) => session.harness_context.context_id);
  const sessionsIsolated = new Set(allContextIds).size === allSessions.length
    && allSessions.every((session) => session.harness_context.run_ref === session.session_id)
    && new Set(allSessions.map((session) => session.session_id)).size === allSessions.length;

  const composedTasks = candidate.composed_task_ids;
  const singleExecutorTasks = taskSet.tasks.map((task) => task.task_id).filter((taskId) => !composedTasks.includes(taskId));

  const record = {
    schema_version: '1.0.0',
    benchmark_id: 'bench_comparative_v1',
    task_set_ref: taskSet.task_set_ref,
    eval_family: taskSet.eval_family,
    authority_domain: taskSet.authority_domain,
    baseline_variant: {
      variant: 'single_executor',
      executor_ids: [...new Set(taskSet.tasks.map((task) => task.static_variant.executor_id))],
      executor_profile_ref: taskSet.executor_profile.profile_ref,
      eval_family: taskSet.eval_family
    },
    candidate_variant: {
      variant: 'policy_bound_multi_executor',
      executor_ids: [...new Set(taskSet.tasks.flatMap((task) => task.dynamic_variant.executor_ids))],
      executor_profile_ref: taskSet.executor_profile.profile_ref,
      eval_family: taskSet.eval_family,
      composition_policy_ref: taskSet.composition_policy.policy_id
    },
    measures_baseline: { totals: baseline.totals, per_task: baseline.per_task },
    measures_candidate: { totals: candidate.totals, per_task: candidate.per_task },
    context_isolation: {
      checked: true,
      worker_sessions_isolated: sessionsIsolated,
      worker_session_count: allSessions.length,
      evidence_ref: 'evals/benchmark/comparison/tasks.json'
    },
    authority_budget_inheritance: inheritance,
    selection_criteria: {
      single_executor_tasks: singleExecutorTasks,
      composed_tasks: composedTasks,
      counterproductive_cases: counterproductive
    },
    comparison_only: true,
    created_at: now()
  };

  const schemaIssues = validateInstanceAgainstContract(record, BENCHMARK_CONTRACT, REPO_ROOT);
  const issues = [...schemaIssues, ...semanticBenchmarkIssues(record, taskSet)];
  return {
    record,
    issues,
    workerSessions: candidate.worker_sessions,
    verifierSessions: candidate.verifier_sessions,
    sessions: allSessions
  };
}

function runCli(args) {
  const tasksIndex = args.indexOf('--tasks');
  const tasksPath = tasksIndex !== -1 ? path.resolve(args[tasksIndex + 1]) : path.join(REPO_ROOT, 'evals/benchmark/comparison/tasks.json');
  try {
    const { record, issues } = runComparativeBenchmark({ tasksPath });
    return { ok: issues.length === 0, issues, record };
  } catch (error) {
    if (error instanceof BenchmarkConfigError) {
      return { ok: false, issues: [`${error.code}: ${error.message}`], record: null };
    }
    throw error;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
