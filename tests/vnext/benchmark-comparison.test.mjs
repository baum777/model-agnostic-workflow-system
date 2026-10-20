// S13 — comparative benchmark harness tests (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, section 10.6, PROPOSED). The benchmark measures the orchestration
// form itself over a fixed task set; every recorded result is comparison
// evidence only — never an approval, never a qualification.
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

function expectConfigError(code, fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof BenchmarkConfigError, `expected BenchmarkConfigError, got ${error?.constructor?.name}`);
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

test('S13 measured dimensions cover tokens, cost, latency, interventions, verification, artifact quality', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  for (const measures of [record.measures_baseline, record.measures_candidate]) {
    for (const metric of ['tokens_in', 'tokens_out', 'cost_units', 'latency_ms', 'interventions']) {
      assert.equal(typeof measures.totals[metric], 'number');
    }
    for (const entry of measures.per_task) {
      assert.equal(entry.verification_outcome, 'PASS');
      assert.equal(entry.artifact_quality, 'MEETS_CRITERIA');
    }
  }
});

test('S13 the composed task goes through the real composition policy gate', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const composed = record.measures_candidate.per_task.find((entry) => entry.task_id === 'bench_task_decomposable_audit');
  assert.ok(composed.composition_ref, 'the decomposable task must carry a composition decision ref');
  assert.match(composed.composition_ref, /^cd_/);
});

test('S13 selection criteria: parallel win on the decomposable task, counterproductive overhead documented on atomic tasks', () => {
  const { record } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  assert.deepEqual(record.selection_criteria.composed_tasks, ['bench_task_decomposable_audit']);
  assert.deepEqual(
    record.selection_criteria.single_executor_tasks.sort(),
    ['bench_task_atomic_policy_lookup', 'bench_task_atomic_summary']
  );
  const baselineAudit = record.measures_baseline.per_task.find((entry) => entry.task_id === 'bench_task_decomposable_audit');
  const candidateAudit = record.measures_candidate.per_task.find((entry) => entry.task_id === 'bench_task_decomposable_audit');
  assert.ok(candidateAudit.latency_ms < baselineAudit.latency_ms, 'dynamic orchestration must be measurably faster on the parallelizable workload');

  const counterproductiveIds = record.selection_criteria.counterproductive_cases.map((entry) => entry.task_id).sort();
  assert.deepEqual(counterproductiveIds, ['bench_task_atomic_policy_lookup', 'bench_task_atomic_summary']);
  assert.ok(record.selection_criteria.counterproductive_cases.every((entry) => entry.reason.length > 0));
});

test('S13 context isolation: every worker session carries its own bound harness context', () => {
  const { workerSessions } = runComparativeBenchmark({ tasksPath: TASKS_PATH });
  const contextIds = workerSessions.map((worker) => worker.harness_context.context_id);
  assert.equal(new Set(contextIds).size, workerSessions.length);
  assert.ok(workerSessions.every((worker) => worker.harness_context.authority_grant === 'none'));
  // No shared payload objects between workers.
  const payloads = workerSessions.map((worker) => worker.payload);
  for (let i = 0; i < payloads.length; i += 1) {
    for (let j = i + 1; j < payloads.length; j += 1) {
      assert.notEqual(payloads[i], payloads[j]);
    }
  }
});

test('S13 inherited authority and budget boundaries: child ceilings within parent, budget within cap', () => {
  const taskSet = loadBenchmarkTaskSet(TASKS_PATH);
  const candidate = runVariant({ taskSet, variant: 'dynamic' });
  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate });
  assert.equal(inheritance.checked, true);
  assert.equal(inheritance.child_ceilings_within_parent, true);
  assert.equal(inheritance.budget_within_parent_cap, true);
});

test('S13 decomposition is never chosen merely because executors are available', () => {
  // A tampered set whose atomic task declares two dynamic executors must
  // fail closed instead of composing the atomic task.
  const tampered = writeTamperedTaskSet((set) => {
    set.tasks[0].dynamic_variant.executor_ids = ['exec_bench_generalist', 'exec_bench_specialist_a'];
  });
  expectConfigError('BENCHMARK_POLICY_VIOLATION', () => runComparativeBenchmark({ tasksPath: tampered }));
});

test('S13 task set loading fails closed on duplicate ids, unknown kinds, and missing profiles', () => {
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () =>
    loadBenchmarkTaskSet(writeTamperedTaskSet((set) => { set.tasks[1].task_id = set.tasks[0].task_id; }))
  );
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () =>
    loadBenchmarkTaskSet(writeTamperedTaskSet((set) => { set.tasks[0].kind = 'hybrid'; }))
  );
  expectConfigError('BENCHMARK_TASK_SET_INVALID', () =>
    loadBenchmarkTaskSet(writeTamperedTaskSet((set) => { delete set.tasks[0].static_variant; }))
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
});

test('S13 budget cap enforcement: a cap below the candidate cost fails the inheritance check', () => {
  const tampered = writeTamperedTaskSet((set) => { set.composition_policy.max_total_cost_units = 5; });
  const taskSet = loadBenchmarkTaskSet(tampered);
  const candidate = runVariant({ taskSet, variant: 'dynamic' });
  const inheritance = checkAuthorityBudgetInheritance({ taskSet, candidate });
  assert.equal(inheritance.budget_within_parent_cap, false);
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
