import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { evaluateStateConsistency, projectStateFromEvents } from '../../runtime/kernel/state-consistency.mjs';
import { appendEvent } from '../../runtime/kernel/runtime-event-log.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createLoopController } from '../../runtime/kernel/loop-controller.mjs';
import { createCheckpoint, loadCheckpoint } from '../../runtime/kernel/checkpoint-store.mjs';
import { sha256OfCanonical } from '../../runtime/kernel/checkpoint-integrity.mjs';

// CLG P10: the event history and the checkpoint must independently witness the
// same state evolution. The evaluator is evidence-only: read, project, compare,
// report — it never mutates anything and CONSISTENT is not a verification PASS.

const SETUP_STEPS = ['scoped', 'planned', 'policy_checked', 'ready', 'running'];

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p10-'));
  const context = createRunContext({ repoRoot: root });
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
  const records = [];
  for (const step of SETUP_STEPS) {
    const result = controller.applyTransition({ runtimeState: state, to: step });
    state = result.runtimeState;
    records.push(...result.transitionRecords);
  }
  return { root, context, permissionEngine, controller, state, records, runRef: context.runId };
}

function teardown(env) {
  fs.rmSync(env.root, { recursive: true, force: true });
}

let emitCounter = 0;

function emitTransitionEvents(env, records, { causationRef = null } = {}) {
  let last = causationRef;
  const events = [];
  for (const record of records) {
    emitCounter += 1;
    const result = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.runRef,
      taskRef: 'task-1',
      eventType: 'TRANSITION_APPLIED',
      actorRef: 'runtime/kernel/loop-controller.mjs',
      subjectRef: 'task-1',
      correlationRef: record.transition_id,
      causationRef: last,
      payload: { from: record.from, to: record.to, reason_code: record.reason_code }
    });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    last = result.event.event_id;
    events.push(result.event);
  }
  return { events, lastEventId: last };
}

function emitRunCreated(env) {
  const result = appendEvent({
    repoRoot: env.root,
    permissionEngine: env.permissionEngine,
    runRef: env.runRef,
    taskRef: 'task-1',
    eventType: 'RUN_CREATED',
    actorRef: 'test',
    subjectRef: 'task-1',
    correlationRef: env.runRef,
    causationRef: null,
    payload: { mode: 'test' }
  });
  assert.equal(result.ok, true);
  return result.event;
}

function emitTerminated(env, lifecycleState, causationRef) {
  const result = appendEvent({
    repoRoot: env.root,
    permissionEngine: env.permissionEngine,
    runRef: env.runRef,
    taskRef: 'task-1',
    eventType: 'RUN_TERMINATED',
    actorRef: 'runtime/kernel/loop-controller.mjs',
    subjectRef: 'task-1',
    correlationRef: env.runRef,
    causationRef,
    payload: { lifecycle_state: lifecycleState }
  });
  assert.equal(result.ok, true);
  return result.event;
}

function checkpointRunning(env, lifecycleStateOverride = null) {
  let checkpointState = env.state;
  if (lifecycleStateOverride !== null) {
    checkpointState = { ...env.state, lifecycle_state: lifecycleStateOverride };
  }
  const created = createCheckpoint({
    repoRoot: env.root,
    permissionEngine: env.permissionEngine,
    runRef: env.runRef,
    runtimeState: checkpointState,
    reason: 'manual'
  });
  assert.equal(created.ok, true);
  return created;
}

// ---------- CONSISTENT ----------

test('matching event history and checkpoint -> CONSISTENT', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const { lastEventId } = emitTransitionEvents(env, env.records, { causationRef: created.event_id });
    emitTerminated(env, 'running', lastEventId);
    const checkpoint = checkpointRunning(env);
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'CONSISTENT');
    assert.equal(result.projected_state.final_state, 'running');
    assert.equal(result.projected_state.initial_state, 'candidate');
    assert.equal(result.transition_refs.length, 5);
  } finally {
    teardown(env);
  }
});

test('controller self-transition (CONTINUE loop_iteration) projects as no-op continuity', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const loopRecord = { transition_id: 'tr_loop_1', from: 'running', to: 'running', reason_code: 'loop_iteration' };
    const { lastEventId } = emitTransitionEvents(env, [...env.records, loopRecord], { causationRef: created.event_id });
    emitTerminated(env, 'running', lastEventId);
    const checkpoint = checkpointRunning(env);
    const projection = projectStateFromEvents({ repoRoot: env.root, runRef: env.runRef, taskRef: 'task-1' });
    assert.equal(projection.ok, true);
    assert.equal(projection.projected.final_state, 'running');
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'CONSISTENT');
  } finally {
    teardown(env);
  }
});

test('resume continuity: history across a RESUME_PERFORMED still projects and compares', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const { lastEventId } = emitTransitionEvents(env, env.records, { causationRef: created.event_id });
    const checkpoint = checkpointRunning(env);
    // Resume happened (evidence event), then the run continues and terminates.
    const resumed = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.runRef,
      taskRef: 'task-1',
      eventType: 'RESUME_PERFORMED',
      actorRef: 'runtime/kernel/resume-controller.mjs',
      subjectRef: 'task-1',
      correlationRef: checkpoint.checkpointRef,
      causationRef: lastEventId,
      payload: { checkpoint_ref: checkpoint.checkpointRef }
    });
    assert.equal(resumed.ok, true);
    emitTerminated(env, 'running', resumed.event.event_id);
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'CONSISTENT');
  } finally {
    teardown(env);
  }
});

// ---------- INCONSISTENT ----------

test('digest-recomputed forged checkpoint claiming another state -> INCONSISTENT (compare layer catches what digests cannot)', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const { lastEventId } = emitTransitionEvents(env, env.records, { causationRef: created.event_id });
    emitTerminated(env, 'running', lastEventId);
    const checkpoint = checkpointRunning(env);
    // Forge: claim 'validating' with internally fresh digests (passes load).
    const raw = JSON.parse(fs.readFileSync(checkpoint.checkpointPath, 'utf8'));
    raw.runtime_state.lifecycle_state = 'validating';
    raw.runtime_state_digest = sha256OfCanonical(raw.runtime_state);
    const { integrity, ...payload } = raw;
    raw.integrity.payload_digest = sha256OfCanonical(payload);
    fs.writeFileSync(checkpoint.checkpointPath, JSON.stringify(raw));
    const loaded = loadCheckpoint({ repoRoot: env.root, checkpointRef: checkpoint.checkpointRef });
    assert.equal(loaded.ok, true); // forgery is internally consistent
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'INCONSISTENT');
    assert.ok(result.failures.some((failure) => failure.includes('divergence')));
  } finally {
    teardown(env);
  }
});

test('missing final transition event -> INCONSISTENT (projected ready vs checkpoint running)', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const partialRecords = env.records.slice(0, 4); // drop ready -> running
    emitTransitionEvents(env, partialRecords, { causationRef: created.event_id });
    const checkpoint = checkpointRunning(env);
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'INCONSISTENT');
    assert.equal(result.projected_state.final_state, 'ready');
  } finally {
    teardown(env);
  }
});

test('terminal checkpoint but history ends non-terminal (no RUN_TERMINATED event) -> INCONSISTENT', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const terminalRecords = [
      ...env.records,
      { transition_id: 'tr_finish', from: 'running', to: 'validating', reason_code: 'execution_finished' },
      { transition_id: 'tr_done', from: 'validating', to: 'succeeded', reason_code: 'completion_verified' }
    ];
    emitTransitionEvents(env, terminalRecords, { causationRef: created.event_id });
    // No RUN_TERMINATED event; history projects succeeded, but the checkpoint
    // claims the earlier non-terminal state.
    const checkpoint = createCheckpoint({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.runRef,
      runtimeState: { ...env.state, lifecycle_state: 'running' },
      reason: 'manual'
    });
    assert.equal(checkpoint.ok, true);
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'INCONSISTENT');
    assert.equal(result.projected_state.final_state, 'succeeded');
    assert.equal(result.checkpoint_state.lifecycle_state, 'running');
  } finally {
    teardown(env);
  }
});

// ---------- INSUFFICIENT_EVIDENCE (STATE_PROJECTION_DENIED) ----------

test('no transition events at all -> INSUFFICIENT_EVIDENCE', () => {
  const env = setup();
  try {
    emitRunCreated(env);
    const checkpoint = checkpointRunning(env);
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
    assert.ok(result.failures.some((failure) => failure.includes('no TRANSITION_APPLIED')));
  } finally {
    teardown(env);
  }
});

test('sequence gap (removed middle event) -> projection DENIED -> INSUFFICIENT_EVIDENCE', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    emitTransitionEvents(env, env.records, { causationRef: created.event_id });
    const eventsPath = path.join(env.root, 'artifacts', 'runtime-runs', env.runRef, 'loop-events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
    fs.writeFileSync(eventsPath, `${lines.slice(0, 1).concat(lines.slice(2)).join('\n')}\n`);
    const checkpoint = checkpointRunning(env);
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
    assert.ok(result.failures.some((failure) => failure.includes('sequence gap')));
  } finally {
    teardown(env);
  }
});

test('foreign-task transition event -> projection DENIED -> INSUFFICIENT_EVIDENCE', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    emitTransitionEvents(env, env.records, { causationRef: created.event_id });
    const foreign = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.runRef,
      taskRef: 'task-other',
      eventType: 'TRANSITION_APPLIED',
      actorRef: 'attacker',
      subjectRef: 'task-other',
      correlationRef: 'tr_foreign',
      causationRef: null,
      payload: { from: 'running', to: 'contained', reason_code: 'budget_exceeded' }
    });
    assert.equal(foreign.ok, true);
    const checkpoint = checkpointRunning(env);
    const result = evaluateStateConsistency({
      repoRoot: env.root,
      runRef: env.runRef,
      checkpointRef: checkpoint.checkpointRef,
      taskRef: 'task-1'
    });
    assert.equal(result.status, 'INSUFFICIENT_EVIDENCE');
    assert.ok(result.failures.some((failure) => failure.includes('cross-task')));
  } finally {
    teardown(env);
  }
});

test('SM-invalid claimed transition (candidate -> succeeded) -> projection DENIED', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    emitTransitionEvents(env, [
      { transition_id: 'tr_skip', from: 'candidate', to: 'succeeded', reason_code: 'fabricated' }
    ], { causationRef: created.event_id });
    const projection = projectStateFromEvents({ repoRoot: env.root, runRef: env.runRef, taskRef: 'task-1' });
    assert.equal(projection.ok, false);
    assert.equal(projection.denied, 'STATE_PROJECTION_DENIED');
    assert.ok(projection.failures.some((failure) => failure.includes('invalid under the kernel state machine')));
  } finally {
    teardown(env);
  }
});

test('reordered history (continuity break) -> projection DENIED', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    // Emit steps out of order: last transition first, then the prefix.
    const reordered = [env.records[env.records.length - 1], ...env.records.slice(0, 4)];
    emitTransitionEvents(env, reordered, { causationRef: created.event_id });
    const projection = projectStateFromEvents({ repoRoot: env.root, runRef: env.runRef, taskRef: 'task-1' });
    assert.equal(projection.ok, false);
    assert.ok(projection.failures.some((failure) => failure.includes('continuity break')));
  } finally {
    teardown(env);
  }
});

test('terminal evidence contradicting the transition chain -> projection DENIED', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const { lastEventId } = emitTransitionEvents(env, env.records, { causationRef: created.event_id });
    emitTerminated(env, 'succeeded', lastEventId); // claims terminal, history ends running
    const projection = projectStateFromEvents({ repoRoot: env.root, runRef: env.runRef, taskRef: 'task-1' });
    assert.equal(projection.ok, false);
    assert.ok(projection.failures.some((failure) => failure.includes('terminal evidence mismatch')));
  } finally {
    teardown(env);
  }
});

// ---------- P10-S6: structural read-only proof ----------

test('evaluator is read-only: repeated evaluation leaves every byte on disk unchanged', () => {
  const env = setup();
  try {
    const created = emitRunCreated(env);
    const { lastEventId } = emitTransitionEvents(env, env.records, { causationRef: created.event_id });
    emitTerminated(env, 'running', lastEventId);
    const checkpoint = checkpointRunning(env);

    const hashTree = () => {
      const rootDir = path.join(env.root, 'artifacts', 'runtime-runs', env.runRef);
      const hashes = {};
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else {
            hashes[path.relative(rootDir, full)] = fs.statSync(full).mtimeMs + ':' + fs.readFileSync(full).length;
          }
        }
      };
      walk(rootDir);
      return hashes;
    };

    const before = hashTree();
    for (let i = 0; i < 3; i += 1) {
      const result = evaluateStateConsistency({
        repoRoot: env.root,
        runRef: env.runRef,
        checkpointRef: checkpoint.checkpointRef,
        taskRef: 'task-1'
      });
      assert.equal(result.status, 'CONSISTENT');
    }
    assert.deepEqual(hashTree(), before);
  } finally {
    teardown(env);
  }
});
