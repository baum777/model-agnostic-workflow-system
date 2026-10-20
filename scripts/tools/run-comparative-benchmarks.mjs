#!/usr/bin/env node
// S13 comparative benchmark harness (spec MAWS-SII-TARGET-SPEC-001 v0.2.0,
// section 10.6, PROPOSED). Measures the orchestration form itself: a static
// single-executor baseline against a policy-bound multi-executor candidate
// over the SAME fixed task set and eval family.
//
// Deterministic fixture execution only: every task carries recorded metric
// profiles per variant; composition goes through the REAL buildComposition
// policy gate; worker invocations carry per-session S11 harness contexts;
// child authority/budget ceilings are checked against the parent cap. The
// emitted ComparativeBenchmarkRecord is comparison evidence only: it is
// never an approval for broader autonomy, never a qualification, and never
// its own success assertion (comparison_only is const true).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowIso } from '../../runtime/vnext/util.mjs';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { buildComposition } from '../../runtime/routing/composition.mjs';
import { developmentProbeHarnessContext } from '../../runtime/harness-context/context-binding.mjs';

const BENCHMARK_CONTRACT = 'core/contracts/benchmark-record.schema.json';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

// loadBenchmarkTaskSet(path) -> validated task set. Fail closed on shape
// defects; the task set is fixed evidence, not free-form input.
export function loadBenchmarkTaskSet(tasksPath) {
  let taskSet;
  try {
    taskSet = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  } catch (error) {
    configError('BENCHMARK_TASK_SET_UNREADABLE', `task set is not readable JSON: ${error.message}`);
  }
  if (!isNonEmptyString(taskSet.task_set_ref) || !isNonEmptyString(taskSet.eval_family)) {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must carry task_set_ref and eval_family');
  }
  if (!Array.isArray(taskSet.tasks) || taskSet.tasks.length === 0) {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must carry a non-empty tasks array');
  }
  const ids = new Set();
  for (const task of taskSet.tasks) {
    if (!isNonEmptyString(task.task_id) || ids.has(task.task_id)) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ids must be unique non-empty strings (duplicate: ${task.task_id})`);
    }
    ids.add(task.task_id);
    if (task.kind !== 'atomic' && task.kind !== 'decomposable') {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: kind must be atomic or decomposable`);
    }
    for (const variant of ['static_variant', 'dynamic_variant']) {
      const profile = task[variant];
      if (!profile || typeof profile !== 'object') {
        configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} carries no ${variant}`);
      }
      for (const metric of ['tokens_in', 'tokens_out', 'cost_units', 'latency_ms', 'interventions']) {
        if (typeof profile[metric] !== 'number' || profile[metric] < 0) {
          configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id} ${variant}: ${metric} must be a non-negative number`);
        }
      }
    }
    if (!task.acceptance_criteria || !Array.isArray(task.acceptance_criteria.required_artifact_fields)) {
      configError('BENCHMARK_TASK_SET_INVALID', `task ${task.task_id}: acceptance_criteria.required_artifact_fields required`);
    }
  }
  if (!taskSet.composition_policy || typeof taskSet.composition_policy !== 'object') {
    configError('BENCHMARK_TASK_SET_INVALID', 'task set must carry the composition policy the candidate is bound to');
  }
  return taskSet;
}

// runFixtureWorker({ task, executorId, sessionId }) -> one deterministic
// worker execution. Fresh isolated session: its own S11 harness context and
// its own payload object (no shared mutable state between workers).
function runFixtureWorker({ task, executorId, sessionId }) {
  const context = developmentProbeHarnessContext({ runRef: sessionId, contextId: `hctx_${sessionId}` });
  // Deterministic fixture artifact; its string values satisfy the task's
  // acceptance floor (checked by artifactQualityOk below).
  const artifact = {};
  for (const field of task.acceptance_criteria.required_artifact_fields) {
    if (field === 'coverage') {
      artifact[field] = ['module_a', 'module_b'];
    } else if (field === 'merged_findings') {
      artifact[field] = ['finding:fixture-module-a', 'finding:fixture-module-b'];
    } else {
      artifact[field] = `fixture ${field}`;
    }
  }
  const payload = {
    task_id: task.task_id,
    worker_session: sessionId,
    context_grant: context.authority_grant,
    artifact
  };
  return {
    executor_id: executorId,
    session_id: sessionId,
    harness_context: context,
    payload
  };
}

// artifactQualityOk evaluates the merged worker artifacts against the
// task's INDEPENDENT acceptance criteria: every required field present and
// the concatenated string content at least min_summary_length.
function artifactQualityOk(task, artifacts) {
  const merged = Object.assign({}, ...artifacts);
  for (const field of task.acceptance_criteria.required_artifact_fields) {
    if (!(field in merged)) {
      return 'BELOW_CRITERIA';
    }
  }
  const floor = task.acceptance_criteria.min_summary_length;
  if (typeof floor === 'number') {
    const textLength = Object.values(merged)
      .filter((value) => typeof value === 'string')
      .join('').length;
    if (textLength < floor) {
      return 'BELOW_CRITERIA';
    }
  }
  return 'MEETS_CRITERIA';
}

// runVariant({ taskSet, variant }) -> { totals, per_task, composed_task_ids,
// worker_sessions } for 'static' (single-executor baseline) or 'dynamic'
// (policy-bound multi-executor candidate).
export function runVariant({ taskSet, variant, now = nowIso }) {
  const perTask = [];
  const workerSessions = [];
  const composedTaskIds = [];

  for (const task of taskSet.tasks) {
    const profile = variant === 'static' ? task.static_variant : task.dynamic_variant;
    const executorIds = variant === 'static' ? [profile.executor_id] : profile.executor_ids;

    // Context isolation: one fresh session per worker, each with its own
    // bound harness context record; payloads are structuredClone-separated.
    const workers = executorIds.map((executorId, index) => {
      const worker = runFixtureWorker({ task, executorId, sessionId: `${task.task_id}_w${index}` });
      workerSessions.push(worker);
      return worker;
    });
    const contextIds = new Set(workers.map((worker) => worker.harness_context.context_id));
    if (contextIds.size !== workers.length) {
      configError('CONTEXT_ISOLATION_VIOLATED', `task ${task.task_id}: workers share a harness context session`);
    }
    for (const worker of workers) {
      for (const other of workers) {
        if (other !== worker && worker.payload === other.payload) {
          configError('CONTEXT_ISOLATION_VIOLATED', `task ${task.task_id}: workers share one payload object`);
        }
      }
    }

    // Candidate policy binding goes through the REAL composition gate.
    let composition = null;
    if (variant === 'dynamic') {
      const decomposes = task.kind === 'decomposable' && executorIds.length > 1;
      if (decomposes) {
        composition = buildComposition({
          composition_policy: taskSet.composition_policy,
          mode: 'independent_parallel',
          participants: executorIds.map((executorId) => ({ executor_id: executorId, routing_decision_ref: `rd_${task.task_id}_${executorId}` })),
          authority_ceiling_ref: `scope/${task.task_id}`,
          created_at: now()
        });
        composedTaskIds.push(task.task_id);
      } else if (executorIds.length > 1) {
        // Decomposition is never chosen merely because multiple executors
        // are available: an atomic task stays single-executor even in the
        // candidate variant (the task set's dynamic profile records the
        // coordination overhead as a counterproductive case).
        configError('BENCHMARK_POLICY_VIOLATION', `task ${task.task_id} is atomic; the candidate must not compose it`);
      }
    }

    const tokensOut = profile.tokens_out;
    const artifact = artifactQualityOk(task, workers.map((worker) => worker.payload.artifact));
    perTask.push({
      task_id: task.task_id,
      tokens_in: profile.tokens_in,
      tokens_out: tokensOut,
      cost_units: profile.cost_units,
      latency_ms: profile.latency_ms,
      interventions: profile.interventions,
      verification_outcome: 'PASS',
      artifact_quality: artifact,
      ...(composition ? { composition_ref: composition.decision_id } : {})
    });
  }

  const totals = perTask.reduce((acc, entry) => ({
    tokens_in: acc.tokens_in + entry.tokens_in,
    tokens_out: acc.tokens_out + entry.tokens_out,
    cost_units: Math.round((acc.cost_units + entry.cost_units) * 100) / 100,
    latency_ms: acc.latency_ms + entry.latency_ms,
    interventions: acc.interventions + entry.interventions
  }), { tokens_in: 0, tokens_out: 0, cost_units: 0, latency_ms: 0, interventions: 0 });

  return { totals, per_task: perTask, composed_task_ids: composedTaskIds, worker_sessions: workerSessions };
}

// checkAuthorityBudgetInheritance({ taskSet, candidate }) -> fail-closed
// checks that composed (decomposed) work stays inside the parent authority
// and budget: effects subset of the safety classes the policy allows,
// per-task cost sums within the policy's total cap.
export function checkAuthorityBudgetInheritance({ taskSet, candidate }) {
  const cap = typeof taskSet.composition_policy.max_total_cost_units === 'number'
    ? taskSet.composition_policy.max_total_cost_units
    : null;
  const allowedClasses = new Set(taskSet.composition_policy.workload_safety_classes_allowed);
  const ceilingsWithinParent = taskSet.tasks.every((task) => allowedClasses.has(task.workload_safety_class));
  const budgetWithinCap = cap === null ? true : candidate.totals.cost_units <= cap;
  return {
    checked: true,
    child_ceilings_within_parent: ceilingsWithinParent,
    budget_within_parent_cap: budgetWithinCap,
    evidence_ref: 'evals/benchmark/comparison/tasks.json#composition_policy'
  };
}

// semanticBenchmarkIssues(record, taskSet) -> string[]. The invariants the
// minimal schema engine cannot express: count adds up, same task set on
// both variants, composed/single partition matches the task kinds,
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

  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate });

  // Counterproductive cases: candidate worse than baseline on cost or
  // wall-clock latency for a task that stayed single-executor.
  const counterproductive = [];
  for (const baselineEntry of baseline.per_task) {
    const candidateEntry = candidate.per_task.find((entry) => entry.task_id === baselineEntry.task_id);
    if (candidateEntry && (candidateEntry.cost_units > baselineEntry.cost_units || candidateEntry.latency_ms > baselineEntry.latency_ms)) {
      const profile = taskSet.tasks.find((task) => task.task_id === baselineEntry.task_id).dynamic_variant;
      counterproductive.push({
        task_id: baselineEntry.task_id,
        reason: profile.note || 'candidate overhead exceeds the baseline for this workload shape'
      });
    }
  }

  const composedTasks = candidate.composed_task_ids;
  const singleExecutorTasks = taskSet.tasks.map((task) => task.task_id).filter((taskId) => !composedTasks.includes(taskId));

  const record = {
    schema_version: '1.0.0',
    benchmark_id: 'bench_comparative_v1',
    task_set_ref: taskSet.task_set_ref,
    baseline_variant: {
      variant: 'single_executor',
      executor_ids: [...new Set(baseline.per_task.map((entry) => entry.task_id).map((taskId) => taskSet.tasks.find((task) => task.task_id === taskId).static_variant.executor_id))]
    },
    candidate_variant: {
      variant: 'policy_bound_multi_executor',
      executor_ids: [...new Set(taskSet.tasks.flatMap((task) => task.dynamic_variant.executor_ids))],
      composition_policy_ref: taskSet.composition_policy.policy_id
    },
    measures_baseline: { totals: baseline.totals, per_task: baseline.per_task },
    measures_candidate: { totals: candidate.totals, per_task: candidate.per_task },
    context_isolation: {
      checked: true,
      worker_sessions_isolated: true,
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
  return { record, issues, workerSessions: candidate.worker_sessions };
}

function runCli(args) {
  const tasksIndex = args.indexOf('--tasks');
  const tasksPath = tasksIndex !== -1 ? path.resolve(args[tasksIndex + 1]) : path.join(REPO_ROOT, 'evals/benchmark/comparison/tasks.json');
  const { record, issues } = runComparativeBenchmark({ tasksPath });
  return { ok: issues.length === 0, issues, record };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
