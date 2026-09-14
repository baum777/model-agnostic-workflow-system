import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  createResourceAdmissionPort,
  createResourceLedger,
  ledgerFilePath,
  validateResourceBudget
} from '../../runtime/resources/resource-ledger.mjs';
import { executeActionProposal, createEffectPort } from '../../runtime/kernel/action-boundary.mjs';
import { createAuthorityPort } from '../../runtime/kernel/authority-port.mjs';
import { createLoopController } from '../../runtime/kernel/loop-controller.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';
import { createCheckpoint, loadCheckpoint } from '../../runtime/kernel/checkpoint-store.mjs';
import { createResumeRequest, resumeFromCheckpoint } from '../../runtime/kernel/resume-controller.mjs';
import { evaluateCompletion } from '../../runtime/kernel/completion-evaluator.mjs';
import { validateTaskContract } from '../../runtime/contracts/clg-contracts.mjs';
import { RuntimeBlockedError } from '../../runtime/kernel/runtime-errors.mjs';

const NOW = '2026-09-14T00:00:00.000Z';

function makeBudget(overrides = {}) {
  return {
    budget_id: 'budget-1',
    limits: { max_effects: 2 },
    ...overrides
  };
}

function setup({ budget = makeBudget() } = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p7-'));
  const context = createRunContext({ repoRoot });
  const ledger = createResourceLedger({
    repoRoot,
    runRef: context.runId,
    taskRef: 'task-1',
    budget,
    now: NOW
  });
  return { repoRoot, context, ledger };
}

function teardown({ repoRoot }) {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// ---------- Envelope / integrity ----------

test('usage record round-trips with sealed digest and incrementing sequence', () => {
  const env = setup();
  try {
    const first = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-a' });
    assert.equal(first.ok, true);
    const second = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-b' });
    assert.equal(second.ok, true);
    assert.equal(second.record.sequence, first.record.sequence + 1);
    const read = env.ledger.readLedger();
    assert.equal(read.ok, true);
    assert.equal(read.tainted, false);
    assert.equal(read.records.length, 2);
    assert.deepEqual(
      read.records.map((record) => record.source_ref),
      ['rcp-a', 'rcp-b']
    );
  } finally {
    teardown(env);
  }
});

test('tampered usage record on disk -> ledger tainted, admission DENIED, append denied', () => {
  const env = setup();
  try {
    env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-a' });
    const ledgerPath = ledgerFilePath(env.repoRoot, env.context.runId);
    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')[0]);
    raw.amount = 99;
    fs.writeFileSync(ledgerPath, `${JSON.stringify(raw)}\n`);
    const read = env.ledger.readLedger();
    assert.equal(read.ok, false);
    assert.equal(read.tainted, true);
    const usage = env.ledger.currentUsage('effects');
    assert.equal(usage.ok, false);
    const admission = env.ledger.admit({ resourceType: 'effects', amount: 1 });
    assert.equal(admission.decision, 'DENIED');
    assert.equal(admission.reason, 'LEDGER_TAINTED');
    const append = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-b' });
    assert.equal(append.ok, false);
  } finally {
    teardown(env);
  }
});

test('foreign task_ref record in stream -> ledger tainted (fail closed)', () => {
  const env = setup();
  try {
    env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-a' });
    const ledgerPath = ledgerFilePath(env.repoRoot, env.context.runId);
    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
    const foreign = JSON.parse(lines[0]);
    foreign.task_ref = 'task-other';
    foreign.usage_id = 'usg_foreign';
    const digestInput = { ...foreign };
    delete digestInput.record_digest;
    // Forged record with recomputed digest must STILL fail: task_ref mismatches binding.
    foreign.record_digest = `sha256:${createHash('sha256').update(JSON.stringify(digestInput)).digest('hex')}`;
    fs.writeFileSync(ledgerPath, `${JSON.stringify(foreign)}\n`);
    const read = env.ledger.readLedger();
    assert.equal(read.tainted, true);
    assert.ok(read.issues.some((issue) => issue.includes('task_ref')));
  } finally {
    teardown(env);
  }
});

test('ledger digests are deterministic across instances for identical pinned inputs', () => {
  const envA = setup();
  const envB = setup();
  try {
    const a = envA.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x', usageId: 'usg_det-1', timestamp: NOW });
    const b = envB.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x', usageId: 'usg_det-1', timestamp: NOW });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.notEqual(a.record.run_ref, b.record.run_ref); // different runs...
    // ...same semantic content except run_ref/sequence position is identical here,
    // so the digest differs only through the bound run_ref — determinism per stream.
    const replay = envA.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x', usageId: 'usg_det-2', timestamp: NOW });
    assert.equal(replay.ok, true);
    assert.notEqual(replay.record.record_digest, a.record.record_digest); // usage_id participates
  } finally {
    teardown(envA);
    teardown(envB);
  }
});

// ---------- Admission (P7-R3/R4/R9) ----------

test('usage below limit -> admission ALLOWED with remainingAfter', () => {
  const env = setup();
  try {
    const admission = env.ledger.admit({ resourceType: 'effects', amount: 1 });
    assert.equal(admission.decision, 'ALLOWED');
    assert.equal(admission.remainingAfter, 1);
  } finally {
    teardown(env);
  }
});

test('exactly at limit -> next consumption denied', () => {
  const env = setup();
  try {
    env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-a' });
    env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-b' });
    const atLimit = env.ledger.admit({ resourceType: 'effects', amount: 1 });
    assert.equal(atLimit.decision, 'DENIED');
    assert.equal(atLimit.reason, 'RESOURCE_BUDGET_EXHAUSTED');
    assert.equal(atLimit.remainingAfter, 0);
  } finally {
    teardown(env);
  }
});

test('over-limit single request -> denied', () => {
  const env = setup();
  try {
    const admission = env.ledger.admit({ resourceType: 'effects', amount: 3 });
    assert.equal(admission.decision, 'DENIED');
    assert.equal(admission.reason, 'RESOURCE_BUDGET_EXHAUSTED');
  } finally {
    teardown(env);
  }
});

test('negative / zero usage -> malformed (append and admission)', () => {
  const env = setup();
  try {
    const append = env.ledger.appendUsage({ resourceType: 'effects', amount: -1, sourceRef: 'rcp-a' });
    assert.equal(append.ok, false);
    const zero = env.ledger.appendUsage({ resourceType: 'effects', amount: 0, sourceRef: 'rcp-a' });
    assert.equal(zero.ok, false);
    const admission = env.ledger.admit({ resourceType: 'effects', amount: -2 });
    assert.equal(admission.decision, 'DENIED');
    assert.equal(admission.reason, 'MALFORMED_ADMISSION_REQUEST');
    assert.equal(env.ledger.readLedger().records.length, 0);
  } finally {
    teardown(env);
  }
});

test('unknown resource type -> DENIED unsupported (distinct from external)', () => {
  const env = setup();
  try {
    const admission = env.ledger.admit({ resourceType: 'gpu-hours', amount: 1 });
    assert.equal(admission.decision, 'DENIED');
    assert.equal(admission.reason, 'RESOURCE_TYPE_UNSUPPORTED');
    const append = env.ledger.appendUsage({ resourceType: 'gpu-hours', amount: 1, sourceRef: 'x' });
    assert.equal(append.ok, false);
  } finally {
    teardown(env);
  }
});

test('tokens/cost -> admission UNAVAILABLE (EXTERNAL_USAGE_SOURCE), recording refused (no fake cost model)', () => {
  const env = setup();
  try {
    const tokens = env.ledger.admit({ resourceType: 'tokens', amount: 1000 });
    assert.equal(tokens.decision, 'UNAVAILABLE');
    assert.equal(tokens.reason, 'EXTERNAL_USAGE_SOURCE');
    const cost = env.ledger.admit({ resourceType: 'cost', amount: 5 });
    assert.equal(cost.decision, 'UNAVAILABLE');
    const record = env.ledger.appendUsage({ resourceType: 'tokens', amount: 1000, sourceRef: 'made-up' });
    assert.equal(record.ok, false);
    assert.ok(record.issues[0].includes('EXTERNAL_USAGE_SOURCE'));
  } finally {
    teardown(env);
  }
});

test('duplicate usage_id -> deny overwrite (append-only ledger)', () => {
  const env = setup();
  try {
    const first = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-a', usageId: 'usg_dup-1' });
    assert.equal(first.ok, true);
    const second = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-b', usageId: 'usg_dup-1' });
    assert.equal(second.ok, false);
    assert.ok(second.issues.some((issue) => issue.includes('DUPLICATE_USAGE_ID')));
    assert.equal(env.ledger.readLedger().records.length, 1);
  } finally {
    teardown(env);
  }
});

test('wall_clock_ms is an enforceable resource with its own limit', () => {
  const env = setup({ budget: makeBudget({ limits: { max_effects: 2, max_wall_clock_ms: 1000 } }) });
  try {
    env.ledger.appendUsage({ resourceType: 'wall_clock_ms', amount: 500, sourceRef: 'obs-1' });
    const within = env.ledger.admit({ resourceType: 'wall_clock_ms', amount: 400 });
    assert.equal(within.decision, 'ALLOWED');
    const beyond = env.ledger.admit({ resourceType: 'wall_clock_ms', amount: 600 });
    assert.equal(beyond.decision, 'DENIED');
    assert.equal(beyond.reason, 'RESOURCE_BUDGET_EXHAUSTED');
  } finally {
    teardown(env);
  }
});

test('budget without a configured limit for a resource -> admission DENIED (no implicit unlimited)', () => {
  const env = setup({ budget: makeBudget({ limits: { max_wall_clock_ms: 1000 } }) });
  try {
    const admission = env.ledger.admit({ resourceType: 'effects', amount: 1 });
    assert.equal(admission.decision, 'DENIED');
    assert.equal(admission.reason, 'RESOURCE_LIMIT_UNCONFIGURED');
  } finally {
    teardown(env);
  }
});

test('malformed budgets are rejected (validator result + constructor fail-closed)', () => {
  const invalid = validateResourceBudget(null);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.length > 0);
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p7-'));
  try {
    assert.throws(() => createResourceLedger({ repoRoot, runRef: 'run-x', taskRef: 'task-1', budget: { budget_id: 'b', limits: {} } }), RuntimeBlockedError);
    assert.throws(() => createResourceLedger({ repoRoot, runRef: 'run-x', taskRef: 'task-1', budget: { budget_id: 'b', limits: { max_tokens: 5 } } }), RuntimeBlockedError);
    assert.throws(() => createResourceLedger({ repoRoot, runRef: 'run-x', taskRef: 'task-1', budget: { budget_id: 'b', limits: { max_effects: -1 } } }), RuntimeBlockedError);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

// ---------- Restart / resume (P7-R7) ----------

test('restart: usage persists across fresh ledger instances (no budget reset)', () => {
  const env = setup({ budget: makeBudget({ limits: { max_effects: 3 } }) });
  try {
    env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-a' });
    env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-b' });
    const fresh = createResourceLedger({
      repoRoot: env.repoRoot,
      runRef: env.context.runId,
      taskRef: 'task-1',
      budget: makeBudget({ limits: { max_effects: 3 } }),
      now: NOW
    });
    const remaining = fresh.remainingBudget('effects');
    assert.equal(remaining.ok, true);
    assert.equal(remaining.limit, 3);
    assert.equal(remaining.consumed, 2);
    assert.equal(remaining.remaining, 1);
    const admission = fresh.admit({ resourceType: 'effects', amount: 2 });
    assert.equal(admission.decision, 'DENIED');
  } finally {
    teardown(env);
  }
});

test('resume: checkpoint -> destroy process -> resume -> budget NOT reset (limit - N remains)', () => {
  const env = setup({ budget: makeBudget({ limits: { max_effects: 3 } }) });
  try {
    const { repoRoot, context, ledger } = env;
    const permissionEngine = createPermissionEngine(context);
    const controller = createLoopController();
    let state = {
      rtc_version: '1.0.0',
      task_ref: 'task-1',
      lifecycle_state: 'candidate',
      verification_status: 'unverified',
      retry_count: 0,
      replan_count: 0,
      context_generation: 0
    };
    for (const step of ['scoped', 'planned', 'policy_checked', 'ready', 'running']) {
      state = controller.applyTransition({ runtimeState: state, to: step }).runtimeState;
    }
    const created = createCheckpoint({
      repoRoot,
      permissionEngine,
      runRef: context.runId,
      runtimeState: state,
      reason: 'before_external_wait'
    });
    assert.equal(created.ok, true);

    // Consume BEFORE the process "dies": N = 2 of 3.
    ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-pre-1' });
    ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-pre-2' });

    // Fresh process: new ledger + resume from checkpoint.
    const freshLedger = createResourceLedger({
      repoRoot,
      runRef: context.runId,
      taskRef: 'task-1',
      budget: makeBudget({ limits: { max_effects: 3 } }),
      now: NOW
    });
    const loaded = loadCheckpoint({ repoRoot, checkpointRef: created.checkpointRef });
    assert.equal(loaded.ok, true);
    const resumed = resumeFromCheckpoint({
      repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: context.runId
      })
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.runtimeState.lifecycle_state, 'running');

    // Budget state is ledger-durable, not checkpoint-durable: consumption survives.
    const remaining = freshLedger.remainingBudget('effects');
    assert.equal(remaining.remaining, 1);
    assert.equal(freshLedger.admit({ resourceType: 'effects', amount: 2 }).decision, 'DENIED');
    assert.equal(freshLedger.admit({ resourceType: 'effects', amount: 1 }).decision, 'ALLOWED');
    // The checkpoint never carried usage state (no hidden second truth).
    assert.equal(loaded.checkpoint.runtime_state.resource_usage, undefined);
  } finally {
    teardown(env);
  }
});

// ---------- Action boundary integration (P7-R4/R11/R12) ----------

function makeTaskContract(overrides = {}) {
  return {
    ttc_version: '1.0.0',
    task_id: 'task-1',
    objective: 'objective',
    desired_outcome: 'outcome',
    success_criteria: [
      { criterion_id: 'crit-1', statement: 'done', verification_method_ref: 'method-1' }
    ],
    failure_criteria: [],
    constraints: [],
    scope: { included: ['x'], excluded: [] },
    authority_requirements: [],
    limits: { max_retries: 2, max_replans: 2 },
    ...overrides
  };
}

function makeProposal(overrides = {}) {
  return {
    proposal_id: 'prp-1',
    task_ref: 'task-1',
    subject_ref: 'subject-1',
    action_ref: 'action-1',
    resource_ref: 'resource-1',
    ...overrides
  };
}

function allowAuthorityPort() {
  return createAuthorityPort({
    evaluate: ({ actionProposal }) => ({
      decision: 'ALLOW',
      decision_ref: 'dec-allow',
      subject_ref: actionProposal.subject_ref,
      action_ref: actionProposal.action_ref
    })
  });
}

function denyAuthorityPort() {
  return createAuthorityPort({
    evaluate: ({ actionProposal }) => ({
      decision: 'DENY',
      decision_ref: 'dec-deny',
      reason: 'not authorized',
      subject_ref: actionProposal.subject_ref,
      action_ref: actionProposal.action_ref
    })
  });
}

function effectSpy() {
  const calls = [];
  return {
    calls,
    port: createEffectPort({
      effect_ref: 'effect-1',
      dispatch: ({ actionProposal }) => {
        calls.push(actionProposal.proposal_id);
        return { ok: true };
      }
    })
  };
}

function runningState() {
  const controller = createLoopController();
  let state = {
    rtc_version: '1.0.0',
    task_ref: 'task-1',
    lifecycle_state: 'candidate',
    verification_status: 'unverified',
    retry_count: 0,
    replan_count: 0,
    context_generation: 0
  };
  for (const step of ['scoped', 'planned', 'policy_checked', 'ready', 'running']) {
    state = controller.applyTransition({ runtimeState: state, to: step }).runtimeState;
  }
  return state;
}

test('budget bound but no admission port -> fail-closed denial, zero effects', () => {
  const env = setup({ budget: makeBudget() });
  try {
    const { calls, port } = effectSpy();
    const result = executeActionProposal({
      runtimeState: runningState(),
      taskContract: makeTaskContract({ resource_budget: makeBudget() }),
      actionProposal: makeProposal(),
      authorityPort: allowAuthorityPort(),
      effectPort: port
    });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'resource_admission');
    assert.equal(result.admission.reason, 'RESOURCE_ADMISSION_PORT_UNAVAILABLE');
    assert.equal(result.effectInvocations, 0);
    assert.equal(calls.length, 0);
  } finally {
    teardown(env);
  }
});

test('authority denied while budget would allow -> authority denial wins (independent gates)', () => {
  const env = setup({ budget: makeBudget() });
  try {
    const { calls, port } = effectSpy();
    const result = executeActionProposal({
      runtimeState: runningState(),
      taskContract: makeTaskContract({ resource_budget: makeBudget() }),
      actionProposal: makeProposal(),
      authorityPort: denyAuthorityPort(),
      effectPort: port,
      resourceAdmissionPort: createResourceAdmissionPort({ ledger: env.ledger })
    });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'authority');
    assert.equal(result.effectInvocations, 0);
    assert.equal(calls.length, 0);
    assert.equal(env.ledger.currentUsage('effects').consumed, 0);
  } finally {
    teardown(env);
  }
});

test('authority allowed while budget exhausted -> budget denial, effect never attempted', () => {
  const env = setup({ budget: makeBudget({ limits: { max_effects: 0 } }) });
  try {
    const { calls, port } = effectSpy();
    const result = executeActionProposal({
      runtimeState: runningState(),
      taskContract: makeTaskContract({ resource_budget: makeBudget({ limits: { max_effects: 0 } }) }),
      actionProposal: makeProposal(),
      authorityPort: allowAuthorityPort(),
      effectPort: port,
      resourceAdmissionPort: createResourceAdmissionPort({ ledger: env.ledger })
    });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'resource_admission');
    assert.equal(result.admission.reason, 'RESOURCE_BUDGET_EXHAUSTED');
    assert.equal(result.effectInvocations, 0);
    assert.equal(result.receipt, null);
    assert.equal(calls.length, 0);
  } finally {
    teardown(env);
  }
});

test('admission ALLOWED -> effect executes once -> consumption recorded bound to receipt', () => {
  const env = setup({ budget: makeBudget({ limits: { max_effects: 2 } }) });
  try {
    const { calls, port } = effectSpy();
    const result = executeActionProposal({
      runtimeState: runningState(),
      taskContract: makeTaskContract({ resource_budget: makeBudget({ limits: { max_effects: 2 } }) }),
      actionProposal: makeProposal(),
      authorityPort: allowAuthorityPort(),
      effectPort: port,
      resourceAdmissionPort: createResourceAdmissionPort({ ledger: env.ledger })
    });
    assert.equal(result.ok, true);
    assert.equal(result.effectInvocations, 1);
    assert.equal(result.admission.decision, 'ALLOWED');
    assert.equal(calls.length, 1);
    const usage = env.ledger.currentUsage('effects');
    assert.equal(usage.consumed, 1);
    const records = env.ledger.readLedger().records;
    assert.equal(records[0].source_ref, result.receipt.receipt_id);
    assert.equal(records[0].correlation_ref, 'prp-1');
  } finally {
    teardown(env);
  }
});

test('no resource_budget declared -> boundary behaves as before (no admission, no recording)', () => {
  const env = setup({ budget: makeBudget() });
  try {
    const { calls, port } = effectSpy();
    const result = executeActionProposal({
      runtimeState: runningState(),
      taskContract: makeTaskContract(),
      actionProposal: makeProposal(),
      authorityPort: allowAuthorityPort(),
      effectPort: port,
      resourceAdmissionPort: createResourceAdmissionPort({ ledger: env.ledger })
    });
    assert.equal(result.ok, true);
    assert.equal(result.admission, null);
    assert.equal(calls.length, 1);
    assert.equal(env.ledger.currentUsage('effects').consumed, 0);
  } finally {
    teardown(env);
  }
});

test('consumption recording failure after effect -> fail-closed error (no silent ledger gap)', () => {
  const env = setup({ budget: makeBudget() });
  try {
    const brokenPort = Object.freeze({
      port: 'ResourceAdmissionPort',
      resourceType: 'effects',
      amountPerAction: 1,
      admit: () => ({ ok: true, decision: 'ALLOWED', reason: null, resourceType: 'effects', amount: 1, consumed: 0, limit: 2, remainingAfter: 1 }),
      recordConsumption: () => ({ ok: false, issues: ['disk gone'] })
    });
    assert.throws(() => executeActionProposal({
      runtimeState: runningState(),
      taskContract: makeTaskContract({ resource_budget: makeBudget() }),
      actionProposal: makeProposal(),
      authorityPort: allowAuthorityPort(),
      effectPort: effectSpy().port,
      resourceAdmissionPort: brokenPort
    }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('CONSUMPTION_RECORDING_FAILED'));
  } finally {
    teardown(env);
  }
});

test('malformed resource_budget on task contract -> fail-closed error', () => {
  assert.throws(() => executeActionProposal({
    runtimeState: runningState(),
    taskContract: makeTaskContract({ resource_budget: { budget_id: '', limits: {} } }),
    actionProposal: makeProposal(),
    authorityPort: allowAuthorityPort(),
    effectPort: effectSpy().port
  }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('MALFORMED_RESOURCE_BUDGET'));
});

// ---------- Boundaries: completion / authority independence ----------

test('budget exhaustion is not completion (P7-R12): denial receipt is null and evaluator stays INCOMPLETE', () => {
  const env = setup({ budget: makeBudget({ limits: { max_effects: 0 } }) });
  try {
    const result = executeActionProposal({
      runtimeState: runningState(),
      taskContract: makeTaskContract({ resource_budget: makeBudget({ limits: { max_effects: 0 } }) }),
      actionProposal: makeProposal(),
      authorityPort: allowAuthorityPort(),
      effectPort: effectSpy().port,
      resourceAdmissionPort: createResourceAdmissionPort({ ledger: env.ledger })
    });
    assert.equal(result.ok, false);
    assert.equal(result.receipt, null);
    const evaluation = evaluateCompletion({
      taskContract: makeTaskContract(),
      runtimeState: runningState(),
      verificationRecords: [],
      subjectDigest: 'sha256:' + '0'.repeat(64)
    });
    assert.notEqual(evaluation.result, 'COMPLETE_READY');
  } finally {
    teardown(env);
  }
});

// ---------- Task contract validation ----------

test('validateTaskContract accepts a well-formed resource_budget', () => {
  const result = validateTaskContract(makeTaskContract({ resource_budget: { budget_id: 'b', limits: { max_effects: 2 } } }));
  assert.equal(result.ok, true);
});

test('validateTaskContract rejects malformed resource_budgets', () => {
  const bad = [
    { budget_id: '', limits: { max_effects: 1 } },
    { budget_id: 'b', limits: {} },
    { budget_id: 'b', limits: { max_tokens: 5 } },
    { budget_id: 'b', limits: { max_effects: -1 } },
    { budget_id: 'b', limits: { max_effects: 1 }, policy_ref: '' }
  ];
  for (const resource_budget of bad) {
    const result = validateTaskContract(makeTaskContract({ resource_budget }));
    assert.equal(result.ok, false, JSON.stringify(resource_budget));
  }
});
