// S13 — comparative benchmark harness tests (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, section 10.6, PROPOSED). The benchmark measures the orchestration
// form itself over a fixed task set; every recorded result is comparison
// evidence only — never an approval, never a qualification.
//
// The tests bind the DERIVATION of every measured dimension: a measurement
// that cannot flip under a tampered input is a constant, and a constant is
// not a measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadBenchmarkTaskSet,
  runComparativeBenchmark,
  runVariant,
  semanticBenchmarkIssues,
  deriveCounterproductiveCases,
  checkAuthorityBudgetInheritance,
  BenchmarkConfigError
} from '../../scripts/tools/run-comparative-benchmarks.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TASKS_PATH = path.join(root, 'evals/benchmark/comparison/tasks.json');

function writeTamperedTaskSet(mutate) {
  const taskSet = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
  mutate(taskSet);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's13-bench-'));
  const filePath = path.join(dir, 'tasks.json');
  fs.writeFileSync(filePath, JSON.stringify(taskSet, null, 2));
  return filePath;
}

// Task lookup by id — never by array position: a position-based test binds
// the fixture order, not the behaviour under test.
function taskById(taskSet, taskId) {
  const task = taskSet.tasks.find((entry) => entry.task_id === taskId);
  assert.ok(task, `task ${taskId} must exist in the task set`);
  return task;
}

function expectConfigError(code, fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof BenchmarkConfigError, `expected BenchmarkConfigError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected BenchmarkConfigError ${code}`);
}

test('S13 the committed task set runs end-to-end into a schema-valid benchmark record', () => {
  const { record, issues } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  assert.deepEqual(issues, []);
  const schemaIssues = validateInstanceAgainstContract(record, 'core/contracts/benchmark-record.schema.json', root);
  assert.deepEqual(schemaIssues, []);
  assert.equal(record.comparison_only, true);
  assert.equal(record.baseline_variant.variant, 'single_executor');
  assert.equal(record.candidate_variant.variant, 'policy_bound_multi_executor');
  assert.ok(record.candidate_variant.composition_policy_ref);
});

test('S13 single-executor baseline and policy-bound candidate drive the same fixed task set', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  const ids = taskSet.tasks.map((task) => task.task_id).sort();
  for (const measures of [record.measures_baseline, record.measures_candidate]) {
    assert.deepEqual(measures.per_task.map((entry) => entry.task_id).sort(), ids);
  }
});

test('S13 baseline and candidate share one eval family, one authority domain and one executor profile', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  assert.equal(record.eval_family, taskSet.eval_family);
  assert.equal(record.authority_domain, taskSet.authority_domain);
  assert.equal(record.baseline_variant.eval_family, record.candidate_variant.eval_family);
  assert.equal(record.baseline_variant.executor_profile_ref, record.candidate_variant.executor_profile_ref);
  assert.equal(record.baseline_variant.executor_profile_ref, taskSet.executor_profile.profile_ref);
  // The comparison differs in orchestration form only: every executor that
  // runs in either variant implements the one shared profile.
  const profileExecutors = new Set(taskSet.executor_profile.executor_ids);
  for (const executorId of [...record.baseline_variant.executor_ids, ...record.candidate_variant.executor_ids]) {
    assert.ok(profileExecutors.has(executorId), `${executorId} must implement ${taskSet.executor_profile.profile_ref}`);
  }
});

test('S13 measured dimensions cover tokens, cost, latency, interventions, verification, artifact quality', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  for (const measures of [record.measures_baseline, record.measures_candidate]) {
    for (const metric of ['tokens_in', 'tokens_out', 'cost_units', 'latency_ms', 'interventions']) {
      assert.equal(typeof measures.totals[metric], 'number');
    }
    for (const entry of measures.per_task) {
      assert.ok(['PASS', 'FAIL', 'BLOCKED'].includes(entry.verification_outcome));
      assert.ok(['MEETS_CRITERIA', 'BELOW_CRITERIA'].includes(entry.artifact_quality));
    }
  }
});

test('S13 the verification outcome is derived: a missing required artifact field turns the verdict into FAIL', () => {
  const tampered = writeTamperedTaskSet((set) => {
    const task = taskById(set, 'bench_task_atomic_summary');
    delete task.dynamic_variant.artifact.summary;
  });
  const { record } = runComparativeBenchmark({ tasksPath: tampered });
  const entry = record.measures_candidate.per_task.find((item) => item.task_id === 'bench_task_atomic_summary');
  assert.equal(entry.verification_outcome, 'FAIL', 'the verification outcome must follow the artifact, not a constant');
});

test('S13 the artifact quality is derived and independent of the verification outcome', () => {
  const tampered = writeTamperedTaskSet((set) => {
    const task = taskById(set, 'bench_task_atomic_policy_lookup');
    // Both required fields are present (verification stays PASS) but the
    // recorded content is below the quality floor.
    task.dynamic_variant.artifact = { resolution: 'ok', source_refs: ['f'] };
  });
  const { record } = runComparativeBenchmark({ tasksPath: tampered });
  const entry = record.measures_candidate.per_task.find((item) => item.task_id === 'bench_task_atomic_policy_lookup');
  assert.equal(entry.verification_outcome, 'PASS');
  assert.equal(entry.artifact_quality, 'BELOW_CRITERIA');
});

test('S13 the verification is independent: a verifier that produced part of the artifact fails closed', () => {
  const tampered = writeTamperedTaskSet((set) => {
    set.verification.verifier_executor_id = 'exec_bench_generalist';
  });
  expectConfigError('BENCHMARK_VERIFICATION_NOT_INDEPENDENT', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 a task set without an independent verification block fails closed', () => {
  const tampered = writeTamperedTaskSet((set) => {
    set.verification.independent = false;
  });
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 the composed task goes through the real composition policy gate', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const composed = record.measures_candidate.per_task.find((entry) => entry.task_id === 'bench_task_decomposable_audit');
  assert.ok(composed.composition_ref, 'the decomposable task must carry a composition decision ref');
  assert.match(composed.composition_ref, /^cd_/);
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  assert.equal(taskSet.composition_policy.policy_id, record.candidate_variant.composition_policy_ref);
});

test('S13 the real composition gate is bound: a policy executor bound below the participant count rejects the composition', () => {
  const tampered = writeTamperedTaskSet((set) => {
    set.composition_policy.max_executors = 1;
  });
  expectConfigError('BENCHMARK_COMPOSITION_REJECTED', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 the real composition gate is bound: a policy that forbids the mode rejects the composition', () => {
  const tampered = writeTamperedTaskSet((set) => {
    set.composition_policy.allowed_modes = ['producer_verifier'];
  });
  expectConfigError('BENCHMARK_COMPOSITION_REJECTED', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 the policy parallelism bound is enforced: two parallel participants exceed a bound of one', () => {
  const tampered = writeTamperedTaskSet((set) => {
    set.composition_policy.max_parallelism = 1;
  });
  expectConfigError('BENCHMARK_PARALLELISM_LIMIT_EXCEEDED', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 selection criteria: parallel win on the decomposable task, counterproductive overhead on the atomic tasks', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  assert.deepEqual(record.selection_criteria.composed_tasks, ['bench_task_decomposable_audit']);
  assert.deepEqual(
    [...record.selection_criteria.single_executor_tasks].sort(),
    ['bench_task_atomic_policy_lookup', 'bench_task_atomic_summary']
  );
  const baselineAudit = record.measures_baseline.per_task.find((entry) => entry.task_id === 'bench_task_decomposable_audit');
  const candidateAudit = record.measures_candidate.per_task.find((entry) => entry.task_id === 'bench_task_decomposable_audit');
  assert.ok(candidateAudit.latency_ms < baselineAudit.latency_ms, 'dynamic orchestration must be measurably faster on the parallelizable workload');
  assert.ok(candidateAudit.cost_units < baselineAudit.cost_units, 'dynamic orchestration must be measurably cheaper on the parallelizable workload');
});

test('S13 the counterproductive cases are derived from compositions the candidate actually evaluated', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const cases = record.selection_criteria.counterproductive_cases;
  assert.deepEqual(cases.map((entry) => entry.task_id).sort(), ['bench_task_atomic_policy_lookup', 'bench_task_atomic_summary']);
  for (const entry of cases) {
    assert.match(entry.composition_ref, /^cd_/, 'a counterproductive case must reference the evaluated composition');
    assert.ok(entry.worse_on.length > 0, 'a counterproductive case must name the measured dimension');
    assert.ok(entry.reason.includes(entry.worse_on.join(', ')), 'the reason must be derived from the measured dimensions');
    assert.ok(!record.selection_criteria.composed_tasks.includes(entry.task_id));
  }
});

test('S13 the counterproductive list follows the measurement: a better counterfactual drops the case', () => {
  const tampered = writeTamperedTaskSet((set) => {
    const task = taskById(set, 'bench_task_atomic_summary');
    task.counterfactual.cost_units = 1;
    task.counterfactual.latency_ms = 100;
    task.counterfactual.interventions = 0;
  });
  const { record } = runComparativeBenchmark({ tasksPath: tampered });
  const ids = record.selection_criteria.counterproductive_cases.map((entry) => entry.task_id);
  assert.ok(!ids.includes('bench_task_atomic_summary'), 'a counterfactual that is not worse is not a counterproductive case');
  assert.ok(ids.includes('bench_task_atomic_policy_lookup'), 'the untouched task keeps its measured case');
});

test('S13 the counterproductive derivation compares the evaluated composition against the baseline', () => {
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  const baseline = runVariant({ taskSet, variant: 'static' });
  const candidate = runVariant({ taskSet, variant: 'dynamic' });
  assert.equal(candidate.counterfactual_evaluations.length, 2, 'both atomic tasks declare an evaluated composition option');
  const cases = deriveCounterproductiveCases({
    baseline,
    counterfactualEvaluations: candidate.counterfactual_evaluations
  });
  assert.equal(cases.length, 2);
  for (const entry of cases) {
    assert.ok(entry.worse_on.includes('cost_units'));
    assert.ok(entry.worse_on.includes('latency_ms'));
  }
  // A counterfactual that beats the baseline is not counterproductive.
  const none = deriveCounterproductiveCases({
    baseline,
    counterfactualEvaluations: [{
      task_id: 'bench_task_atomic_summary',
      composition_ref: 'cd_probe',
      executor_ids: ['exec_bench_specialist_a', 'exec_bench_specialist_b'],
      metrics: { tokens_in: 1, tokens_out: 1, cost_units: 0, latency_ms: 1, interventions: 0 }
    }]
  });
  assert.deepEqual(none, []);
});

test('S13 a task may never be composed and counterproductive at the same time', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  const drifted = structuredClone(record);
  drifted.selection_criteria.counterproductive_cases.push({
    task_id: 'bench_task_decomposable_audit',
    reason: 'contradictory disposition',
    composition_ref: 'cd_drift_0001',
    worse_on: ['cost_units']
  });
  assert.ok(semanticBenchmarkIssues(drifted, taskSet).some((issue) => issue.includes('composed and as a counterproductive case')));
});

test('S13 a composed task without a measured advantage is refused by the semantic rules', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  const drifted = structuredClone(record);
  const candidateEntry = drifted.measures_candidate.per_task.find((entry) => entry.task_id === 'bench_task_decomposable_audit');
  candidateEntry.cost_units = 99;
  candidateEntry.latency_ms = 9999;
  candidateEntry.interventions = 5;
  assert.ok(semanticBenchmarkIssues(drifted, taskSet).some((issue) => issue.includes('no measured advantage')));
});

test('S13 context isolation: every worker session carries its own bound harness context', () => {
  const { workerSessions, verifierSessions } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const sessions = [...workerSessions, ...verifierSessions];
  const contextIds = sessions.map((session) => session.harness_context.context_id);
  assert.equal(new Set(contextIds).size, sessions.length);
  assert.equal(new Set(sessions.map((session) => session.session_id)).size, sessions.length);
  for (const session of sessions) {
    assert.equal(session.harness_context.authority_grant, 'none');
    assert.equal(session.harness_context.run_ref, session.session_id, 'a session must run under its own harness context');
  }
  // No shared payload objects between workers.
  const payloads = workerSessions.map((worker) => worker.payload);
  for (let i = 0; i < payloads.length; i += 1) {
    for (let j = i + 1; j < payloads.length; j += 1) {
      assert.notEqual(payloads[i], payloads[j]);
    }
  }
  // No worker payload leaks a foreign session id.
  for (const worker of workerSessions) {
    const payloadText = JSON.stringify(worker.payload);
    for (const other of workerSessions) {
      if (other === worker) continue;
      assert.ok(!payloadText.includes(other.session_id), `${worker.session_id} must not carry ${other.session_id}`);
    }
  }
});

test('S13 inherited authority and budget boundaries: child ceilings within parent, budget within cap', () => {
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  const candidate = runVariant({ taskSet, variant: 'dynamic' });
  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate, compositions: candidate.compositions });
  assert.equal(inheritance.checked, true);
  assert.equal(inheritance.child_ceilings_within_parent, true);
  assert.equal(inheritance.budget_within_parent_cap, true);
  assert.deepEqual(inheritance.violations, []);
});

test('S13 the authority inheritance check fails closed for a child ceiling outside the parent scope', () => {
  const tampered = writeTamperedTaskSet((set) => {
    taskById(set, 'bench_task_atomic_summary').authority_ceiling_ref = 'scope/outside_parent';
  });
  const taskSet = loadBenchmarkTaskSet(tampered);
  const candidate = runVariant({ taskSet, variant: 'dynamic' });
  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate, compositions: candidate.compositions });
  assert.equal(inheritance.child_ceilings_within_parent, false);
  assert.ok(inheritance.violations.some((violation) => violation.includes('outside the parent scope')));
});

test('S13 the authority inheritance check fails closed for a safety class the policy forbids', () => {
  const tampered = writeTamperedTaskSet((set) => {
    taskById(set, 'bench_task_atomic_summary').workload_safety_class = 'production_critical';
  });
  const taskSet = loadBenchmarkTaskSet(tampered);
  const candidate = runVariant({ taskSet, variant: 'dynamic' });
  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate, compositions: candidate.compositions });
  assert.equal(inheritance.child_ceilings_within_parent, false);
  assert.ok(inheritance.violations.some((violation) => violation.includes('safety class')));
});

test('S13 budget cap enforcement: a cap below the candidate cost fails the inheritance check', () => {
  const tampered = writeTamperedTaskSet((set) => { set.composition_policy.max_total_cost_units = 5; });
  const taskSet = loadBenchmarkTaskSet(tampered);
  const candidate = runVariant({ taskSet, variant: 'dynamic' });
  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate, compositions: candidate.compositions });
  assert.equal(inheritance.budget_within_parent_cap, false);
});

test('S13 the budget cap is mandatory: a policy without a parent cap fails the task set', () => {
  const tampered = writeTamperedTaskSet((set) => { delete set.composition_policy.max_total_cost_units; });
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 decomposition is never chosen merely because executors are available', () => {
  // A task set whose ATOMIC task declares two dynamic executors must fail
  // closed instead of composing the atomic task.
  const tampered = writeTamperedTaskSet((set) => {
    taskById(set, 'bench_task_atomic_summary').dynamic_variant.executor_ids = ['exec_bench_generalist', 'exec_bench_specialist_a'];
  });
  expectConfigError('BENCHMARK_POLICY_VIOLATION', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 an executor outside the shared profile fails closed: the comparison is not confounded', () => {
  const tampered = writeTamperedTaskSet((set) => {
    taskById(set, 'bench_task_atomic_summary').dynamic_variant.executor_ids = ['exec_bench_outsider'];
  });
  expectConfigError('BENCHMARK_EXECUTOR_PROFILE_MISMATCH', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 task set loading fails closed on duplicate ids, unknown kinds, and missing profiles', () => {
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () =>
    loadBenchmarkTaskSet(writeTamperedTaskSet((set) => {
      taskById(set, 'bench_task_atomic_policy_lookup').task_id = 'bench_task_atomic_summary';
    }))
  );
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () =>
    loadBenchmarkTaskSet(writeTamperedTaskSet((set) => { taskById(set, 'bench_task_atomic_summary').kind = 'hybrid'; }))
  );
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () =>
    loadBenchmarkTaskSet(writeTamperedTaskSet((set) => { delete taskById(set, 'bench_task_atomic_summary').static_variant; }))
  );
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () =>
    loadBenchmarkTaskSet(writeTamperedTaskSet((set) => { delete set.composition_policy; }))
  );
});

test('S13 semantics: totals add up, inheritance and isolation must pass, comparison_only stays true', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  assert.deepEqual(semanticBenchmarkIssues(record, taskSet), []);

  const drifted = structuredClone(record);
  drifted.measures_candidate.totals.cost_units += 1;
  assert.ok(semanticBenchmarkIssues(drifted, taskSet).some((issue) => issue.includes('totals.cost_units')));

  const incomplete = structuredClone(record);
  incomplete.selection_criteria.single_executor_tasks = [];
  assert.ok(semanticBenchmarkIssues(incomplete, taskSet).some((issue) => issue.includes('bench_task_atomic_summary')));

  const failingInheritance = structuredClone(record);
  failingInheritance.authority_budget_inheritance.budget_within_parent_cap = false;
  assert.ok(semanticBenchmarkIssues(failingInheritance, taskSet).some((issue) => issue.includes('authority_budget_inheritance')));

  const openIsolation = structuredClone(record);
  openIsolation.context_isolation.worker_sessions_isolated = false;
  assert.ok(semanticBenchmarkIssues(openIsolation, taskSet).some((issue) => issue.includes('context_isolation')));

  const approvalClaim = structuredClone(record);
  approvalClaim.comparison_only = false;
  assert.ok(semanticBenchmarkIssues(approvalClaim, taskSet).some((issue) => issue.includes('comparison_only')));

  const foreignFamily = structuredClone(record);
  foreignFamily.candidate_variant.eval_family = 'other-family';
  assert.ok(semanticBenchmarkIssues(foreignFamily, taskSet).some((issue) => issue.includes('same eval family')));

  const foreignProfile = structuredClone(record);
  foreignProfile.candidate_variant.executor_profile_ref = 'prof_other';
  assert.ok(semanticBenchmarkIssues(foreignProfile, taskSet).some((issue) => issue.includes('same executor profile')));
});

test('S13 the committed schema fixture stays schema-decidable and green', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'evals/fixtures/maws-vnext/benchmark-record.contracts.json'), 'utf8'));
  for (const caseEntry of fixture.cases) {
    const issues = validateInstanceAgainstContract(caseEntry.instance, caseEntry.schema, root);
    if (caseEntry.valid) {
      assert.deepEqual(issues, [], caseEntry.case_id);
    } else {
      assert.ok(issues.length > 0, `${caseEntry.case_id} must be schema-invalid`);
    }
  }
});
