import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  appendEvent,
  explainState,
  getEventChain,
  getLatestSequence,
  listEvents,
  readEvent,
  validateEventEnvelope
} from '../../runtime/kernel/runtime-event-log.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRootForScan = path.resolve(here, '../..');

function setup() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p5-'));
  const context = createRunContext({ repoRoot });
  const permissionEngine = createPermissionEngine(context);
  return { repoRoot, context, permissionEngine };
}

function teardown({ repoRoot }) {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

function emit(env, overrides = {}) {
  return appendEvent({
    repoRoot: env.repoRoot,
    permissionEngine: env.permissionEngine,
    runRef: env.context.runId,
    taskRef: 'task-1',
    eventType: 'DECISION_RECORDED',
    actorRef: 'runtime/loop-controller',
    subjectRef: 'task-1',
    correlationRef: 'corr-1',
    payload: { note: 'test' },
    ...overrides
  });
}

test('append + list round-trips with strictly increasing chronological sequences', () => {
  const env = setup();
  try {
    for (let i = 0; i < 4; i += 1) {
      const result = emit(env, { payload: { i } });
      assert.equal(result.ok, true);
    }
    const list = listEvents({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(list.ok, true);
    assert.deepEqual(list.events.map((event) => event.sequence), [1, 2, 3, 4]);
    const latest = getLatestSequence({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(latest.sequence, 4);
  } finally {
    teardown(env);
  }
});

test('digest boundary: event_id and timestamp are outside the digest', () => {
  const env = setup();
  try {
    const first = emit(env);
    assert.equal(first.ok, true);
    const filePath = path.join(env.repoRoot, 'artifacts', 'runtime-runs', env.context.runId, 'loop-events.jsonl');
    const raw = JSON.parse(readFileSync(filePath, 'utf8').trim());
    // Rewrite the same semantic event with different identity/clock metadata:
    // the digest must still verify (boundary behavior), so list stays clean.
    const reidentified = { ...raw, event_id: 'evt_reidentified', timestamp: '1999-01-01T00:00:00.000Z' };
    const lines = readFileSync(filePath, 'utf8').trimEnd().split('\n');
    lines[0] = JSON.stringify(reidentified);
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
    const list = listEvents({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(list.ok, true);
    assert.equal(list.events[0].event_id, 'evt_reidentified');
    assert.equal(first.event.payload_digest, list.events[0].payload_digest);
  } finally {
    teardown(env);
  }
});

test('payload tampering on disk -> stream tainted and readEvent denied', () => {
  const env = setup();
  try {
    const first = emit(env);
    const filePath = path.join(env.repoRoot, 'artifacts', 'runtime-runs', env.context.runId, 'loop-events.jsonl');
    const raw = JSON.parse(readFileSync(filePath, 'utf8').trim());
    raw.payload.note = 'tampered';
    fs.writeFileSync(filePath, `${JSON.stringify(raw)}\n`);
    const list = listEvents({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(list.ok, false);
    assert.equal(list.events.length, 0);
    assert.ok(list.issues.some((issue) => issue.includes('payload_digest mismatch')));
    const single = readEvent({ repoRoot: env.repoRoot, runRef: env.context.runId, sequence: first.event.sequence });
    assert.equal(single.ok, false);
    assert.equal(single.denied, 'EVENT_STREAM_TAINTED');
  } finally {
    teardown(env);
  }
});

test('unknown event_type -> MALFORMED_EVENT at append', () => {
  const env = setup();
  try {
    const result = emit(env, { eventType: 'VIBES_SHIFTED' });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'MALFORMED_EVENT');
  } finally {
    teardown(env);
  }
});

test('envelope validation rejects malformed candidates and extra fields', () => {
  assert.equal(validateEventEnvelope(null).ok, false);
  assert.equal(validateEventEnvelope({}).ok, false);
  assert.equal(validateEventEnvelope({ event_id: 'evt_x', authority_grant: 'sneaky' }).ok, false);
});

test('restart observability: a fresh context reads the full stream without shared references', () => {
  const env = setup();
  let checkpointRefBeforeLoss;
  try {
    {
      emit(env, { eventType: 'RUN_CREATED', correlationRef: 'run' });
      emit(env, { eventType: 'TRANSITION_APPLIED', correlationRef: 'trt_1' });
      checkpointRefBeforeLoss = listEvents({ repoRoot: env.repoRoot, runRef: env.context.runId }).events.length;
    }
    const freshContext = createRunContext({ repoRoot: env.repoRoot });
    assert.notEqual(freshContext.runId, env.context.runId);
    const list = listEvents({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(list.ok, true);
    assert.equal(list.events.length, 2);
    assert.equal(list.events.length, checkpointRefBeforeLoss);
    assert.deepEqual(list.events.map((event) => event.event_type), ['RUN_CREATED', 'TRANSITION_APPLIED']);
  } finally {
    teardown(env);
  }
});

test('correlation: authority -> effect -> receipt -> observation share one chain', () => {
  const env = setup();
  try {
    emit(env, { eventType: 'AUTHORITY_EVALUATED', correlationRef: 'prp-1', payload: { decision: 'DENY' } });
    emit(env, { eventType: 'AUTHORITY_EVALUATED', correlationRef: 'prp-1', payload: { decision: 'ALLOW' } });
    emit(env, { eventType: 'EFFECT_ATTEMPTED', correlationRef: 'prp-1' });
    emit(env, { eventType: 'EFFECT_RECEIPT_RECORDED', correlationRef: 'prp-1' });
    emit(env, { eventType: 'OBSERVATION_RECORDED', correlationRef: 'prp-1' });
    emit(env, { eventType: 'DECISION_RECORDED', correlationRef: 'unrelated' });
    const chain = getEventChain({ repoRoot: env.repoRoot, runRef: env.context.runId, correlationRef: 'prp-1' });
    assert.equal(chain.ok, true);
    assert.deepEqual(chain.events.map((event) => event.event_type), [
      'AUTHORITY_EVALUATED',
      'AUTHORITY_EVALUATED',
      'EFFECT_ATTEMPTED',
      'EFFECT_RECEIPT_RECORDED',
      'OBSERVATION_RECORDED'
    ]);
  } finally {
    teardown(env);
  }
});

test('why-state query reconstructs the causation chain deterministically', () => {
  const env = setup();
  try {
    const decision = emit(env, {
      eventType: 'DECISION_RECORDED',
      taskRef: 'task-budget',
      subjectRef: 'task-budget',
      correlationRef: 'trt_d1',
      payload: { decision: 'RETRY' }
    });
    const transition = emit(env, {
      eventType: 'TRANSITION_APPLIED',
      taskRef: 'task-budget',
      subjectRef: 'task-budget',
      correlationRef: 'trt_d2',
      causationRef: decision.event.event_id,
      payload: { from: 'running', to: 'contained', reason_code: 'budget_exceeded' }
    });
    emit(env, {
      eventType: 'RUN_CONTAINED',
      taskRef: 'task-budget',
      subjectRef: 'task-budget',
      correlationRef: 'trt_d2',
      causationRef: transition.event.event_id,
      payload: { lifecycle_state: 'contained' }
    });
    const why = explainState({ repoRoot: env.repoRoot, runRef: env.context.runId, taskRef: 'task-budget' });
    assert.equal(why.ok, true);
    assert.equal(why.current_state.event_type, 'RUN_CONTAINED');
    assert.deepEqual(why.chain.map((event) => event.event_type), [
      'DECISION_RECORDED',
      'TRANSITION_APPLIED',
      'RUN_CONTAINED'
    ]);
    assert.equal(why.chain[1].payload.reason_code, 'budget_exceeded');
  } finally {
    teardown(env);
  }
});

test('explainState for unknown task fails with explicit issue', () => {
  const env = setup();
  try {
    const why = explainState({ repoRoot: env.repoRoot, runRef: env.context.runId, taskRef: 'task-ghost' });
    assert.equal(why.ok, false);
    assert.equal(why.chain.length, 0);
  } finally {
    teardown(env);
  }
});

test('cross-run isolation: another run sees an empty stream', () => {
  const env = setup();
  try {
    emit(env, { eventType: 'RUN_CREATED', correlationRef: 'run' });
    const other = listEvents({ repoRoot: env.repoRoot, runRef: 'run_other-run-1' });
    assert.equal(other.ok, true);
    assert.equal(other.events.length, 0);
  } finally {
    teardown(env);
  }
});

test('permission-denied event write is classified, not silent', () => {
  const env = setup();
  try {
    const result = appendEvent({
      repoRoot: env.repoRoot,
      permissionEngine: { decide: () => ({ decision: 'deny', reason: 'test gate' }) },
      runRef: env.context.runId,
      taskRef: 'task-1',
      eventType: 'RUN_CREATED',
      actorRef: 'runtime/test',
      subjectRef: 'task-1',
      correlationRef: 'corr-x'
    });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'EVENT_WRITE_DENIED');
  } finally {
    teardown(env);
  }
});

test('append-only: earlier events are never rewritten', () => {
  const env = setup();
  try {
    const first = emit(env, { eventType: 'RUN_CREATED', correlationRef: 'run' });
    const before = listEvents({ repoRoot: env.repoRoot, runRef: env.context.runId }).events[0];
    emit(env, { eventType: 'DECISION_RECORDED', correlationRef: 'corr-2' });
    const after = listEvents({ repoRoot: env.repoRoot, runRef: env.context.runId }).events[0];
    assert.deepEqual(before, after);
    assert.equal(first.event.sequence, 1);
  } finally {
    teardown(env);
  }
});

test('oversized event -> EVENT_OVERSIZED', () => {
  const env = setup();
  try {
    const result = emit(env, { payload: { blob: 'x'.repeat(1100000) } });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'EVENT_OVERSIZED');
  } finally {
    teardown(env);
  }
});

test('non-serializable payload -> MALFORMED_EVENT (fail closed, no crash)', () => {
  const env = setup();
  try {
    const result = emit(env, { payload: { fn: () => 'not serializable' } });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'MALFORMED_EVENT');
  } finally {
    teardown(env);
  }
});

test('readEvent edge cases: missing sequence and malformed argument', () => {
  const env = setup();
  try {
    emit(env);
    const missing = readEvent({ repoRoot: env.repoRoot, runRef: env.context.runId, sequence: 99 });
    assert.equal(missing.ok, false);
    assert.equal(missing.denied, 'EVENT_MISSING');
    const bad = readEvent({ repoRoot: env.repoRoot, runRef: env.context.runId, sequence: 'one' });
    assert.equal(bad.ok, false);
    assert.equal(bad.denied, 'MALFORMED_SEQUENCE');
  } finally {
    teardown(env);
  }
});

test('empty store: latest sequence is 0', () => {
  const env = setup();
  try {
    const latest = getLatestSequence({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(latest.ok, true);
    assert.equal(latest.sequence, 0);
  } finally {
    teardown(env);
  }
});

test('event log carries no authority: module imports no authority/effect/verification surface', () => {
  const source = readFileSync(path.join(repoRootForScan, 'runtime/kernel/runtime-event-log.mjs'), 'utf8');
  assert.equal(/executeActionProposal|evaluateCompletionGuard|VerificationRecord|AuthorityPort/.test(source), false);
  const domainPattern = /Unitera|tenant|TenantNodeBinding|RuntimeAdmission|CapabilityGrant|CCA-02|sovereignty|PersonalRealm|CommitmentStage|Mews|Companion|RPA/i;
  assert.equal(domainPattern.test(source), false);
});
