import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CHECKPOINT_CONTRACT_VERSION,
  canonicalize,
  sha256OfCanonical,
  validateCheckpointEnvelope
} from '../../runtime/kernel/checkpoint-integrity.mjs';
import {
  createCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
  loadCheckpoint
} from '../../runtime/kernel/checkpoint-store.mjs';
import {
  createResumeRequest,
  resumeFromCheckpoint
} from '../../runtime/kernel/resume-controller.mjs';
import { createLoopController } from '../../runtime/kernel/loop-controller.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';
import { createAuthorityPort } from '../../runtime/kernel/authority-port.mjs';
import { executeActionProposal } from '../../runtime/kernel/action-boundary.mjs';
import { RuntimeBlockedError } from '../../runtime/kernel/runtime-errors.mjs';

function makeRuntimeState(lifecycleState = 'candidate', overrides = {}) {
  return {
    rtc_version: '1.0.0',
    task_ref: 'task-1',
    lifecycle_state: lifecycleState,
    verification_status: 'unverified',
    retry_count: 0,
    replan_count: 0,
    context_generation: 0,
    ...overrides
  };
}

const SETUP_STEPS = ['scoped', 'planned', 'policy_checked', 'ready', 'running'];

function toRunning(controller, overrides = {}) {
  let state = makeRuntimeState('candidate', overrides);
  for (const to of SETUP_STEPS) {
    state = controller.applyTransition({ runtimeState: state, to }).runtimeState;
  }
  return state;
}

function setup() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p4-'));
  const context = createRunContext({ repoRoot });
  const permissionEngine = createPermissionEngine(context);
  return { repoRoot, context, permissionEngine };
}

function teardown({ repoRoot }) {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

function checkpointRunning(env, { overrides = {}, checkpointId = null } = {}) {
  const { repoRoot, context, permissionEngine } = env;
  const controller = createLoopController();
  const runtimeState = toRunning(controller, overrides);
  const created = createCheckpoint({
    repoRoot,
    permissionEngine,
    runRef: context.runId,
    runtimeState,
    reason: 'manual',
    checkpointId
  });
  assert.equal(created.ok, true);
  return { controller, runtimeState, created };
}

// ---------- Integrity ----------

test('valid checkpoint round-trips: save -> load -> integrity PASS', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const loaded = loadCheckpoint({ repoRoot: env.repoRoot, checkpointRef: created.checkpointRef });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.checkpoint.checkpoint_id, created.checkpoint.checkpoint_id);
    assert.equal(loaded.checkpoint.integrity.payload_digest, created.checkpoint.integrity.payload_digest);
  } finally {
    teardown(env);
  }
});

test('canonical digest is deterministic and JSON-key-order independent', () => {
  const a = { z: 1, a: { y: 2, b: 3 } };
  const b = { a: { b: 3, y: 2 }, z: 1 };
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(sha256OfCanonical(a), sha256OfCanonical(b));
});

test('mutated runtime_state on disk -> DIGEST_MISMATCH', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    raw.runtime_state.retry_count = 99;
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw, null, 2));
    const loaded = loadCheckpoint({ repoRoot: env.repoRoot, checkpointRef: created.checkpointRef });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.denied, 'DIGEST_MISMATCH');
  } finally {
    teardown(env);
  }
});

test('mutated payload field on disk -> DIGEST_MISMATCH', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    raw.reason = 'before_containment';
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw, null, 2));
    const loaded = loadCheckpoint({ repoRoot: env.repoRoot, checkpointRef: created.checkpointRef });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.denied, 'DIGEST_MISMATCH');
  } finally {
    teardown(env);
  }
});

test('corrupt JSON on disk -> MALFORMED_CHECKPOINT (fail closed)', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    fs.writeFileSync(created.checkpointPath, '{not json');
    const loaded = loadCheckpoint({ repoRoot: env.repoRoot, checkpointRef: created.checkpointRef });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.denied, 'MALFORMED_CHECKPOINT');
  } finally {
    teardown(env);
  }
});

test('unexpected additional field -> MALFORMED_CHECKPOINT', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    raw.tenant_authority = 'sneaky';
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw, null, 2));
    const loaded = loadCheckpoint({ repoRoot: env.repoRoot, checkpointRef: created.checkpointRef });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.denied, 'MALFORMED_CHECKPOINT');
    assert.ok(loaded.issues.some((issue) => issue.includes('unexpected field')));
  } finally {
    teardown(env);
  }
});

test('checkpoint missing -> DENY', () => {
  const env = setup();
  try {
    const loaded = loadCheckpoint({
      repoRoot: env.repoRoot,
      checkpointRef: `artifacts/runtime-runs/${env.context.runId}/checkpoints/cp_000001_chk_doesnotexist.json`
    });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.denied, 'CHECKPOINT_MISSING');
  } finally {
    teardown(env);
  }
});

// ---------- Identity ----------

test('task A checkpoint + task A resume -> PASS', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.runtimeState.lifecycle_state, 'running');
  } finally {
    teardown(env);
  }
});

test('task A checkpoint + task B resume -> DENY (cross-task isolation)', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-2',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.denied, 'CROSS_TASK_RESUME_DENIED');
  } finally {
    teardown(env);
  }
});

test('foreign run_ref -> DENY (run binding)', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: 'run_some-other-run'
      })
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.denied, 'RUN_MISMATCH_DENIED');
  } finally {
    teardown(env);
  }
});

// ---------- Version ----------

test('matching runtime version -> PASS; unsupported runtime version -> DENY', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const base = { checkpointRef: created.checkpointRef, expectedTaskRef: 'task-1', expectedRunRef: env.context.runId };
    assert.equal(resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({ ...base, runtimeVersion: '0.1.0' })
    }).ok, true);
    const denied = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({ ...base, runtimeVersion: '9.9.9' })
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.denied, 'RUNTIME_VERSION_UNSUPPORTED');
  } finally {
    teardown(env);
  }
});

test('unsupported checkpoint contract version -> DENY (no coercion)', () => {
  const env = setup();
  try {
    const { created, runtimeState } = checkpointRunning(env);
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    raw.contract_version = '9.9.9';
    // Re-sign honestly: an old-but-valid checkpoint must still DENY.
    raw.runtime_state_digest = sha256OfCanonical(runtimeState);
    const { integrity, ...payload } = raw;
    payload.contract_version = '9.9.9';
    raw.integrity = { algorithm: 'sha256', payload_digest: sha256OfCanonical(payload) };
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw, null, 2));
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.denied, 'CONTRACT_VERSION_UNSUPPORTED');
  } finally {
    teardown(env);
  }
});

// ---------- State ----------

test('checkpoint of terminal states -> DENY resume (succeeded/failed/cancelled)', () => {
  for (const terminal of ['succeeded', 'failed', 'cancelled']) {
    const env = setup();
    try {
      const created = createCheckpoint({
        repoRoot: env.repoRoot,
        permissionEngine: env.permissionEngine,
        runRef: env.context.runId,
        runtimeState: makeRuntimeState(terminal),
        reason: 'manual'
      });
      assert.equal(created.ok, true);
      const resumed = resumeFromCheckpoint({
        repoRoot: env.repoRoot,
        resumeRequest: createResumeRequest({
          checkpointRef: created.checkpointRef,
          expectedTaskRef: 'task-1',
          expectedRunRef: env.context.runId
        })
      });
      assert.equal(resumed.ok, false, terminal);
      assert.equal(resumed.denied, 'TERMINAL_RESUME_DENIED', terminal);
    } finally {
      teardown(env);
    }
  }
});

test('unknown lifecycle state -> DENY', () => {
  const env = setup();
  try {
    const created = createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: makeRuntimeState('running'),
      reason: 'manual'
    });
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    raw.runtime_state.lifecycle_state = 'bogus-state';
    raw.runtime_state_digest = sha256OfCanonical(raw.runtime_state);
    const { integrity, ...payload } = raw;
    raw.integrity = { algorithm: 'sha256', payload_digest: sha256OfCanonical(payload) };
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw, null, 2));
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.denied, 'UNKNOWN_LIFECYCLE_STATE');
  } finally {
    teardown(env);
  }
});

test('contained state resumes as contained; containment exit still requires authorized human recovery', () => {
  const env = setup();
  try {
    const created = createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: makeRuntimeState('contained'),
      reason: 'before_containment'
    });
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.runtimeState.lifecycle_state, 'contained');
    const controller = createLoopController();
    // contained -> running is not even a defined edge (UNSPECIFIED_TRANSITION);
    // the defined containment-exit edge contained -> recovering must demand
    // the authorized human recovery decision.
    assert.throws(() => controller.applyTransition({
      runtimeState: resumed.runtimeState,
      to: 'running'
    }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('UNSPECIFIED_TRANSITION'));
    assert.throws(() => controller.applyTransition({
      runtimeState: resumed.runtimeState,
      to: 'recovering'
    }), (error) => error instanceof RuntimeBlockedError
      && error.issues.includes('CONTAINMENT_EXIT_AUTHORIZED_RECOVERY_REQUIRED'));
  } finally {
    teardown(env);
  }
});

// ---------- Context reset (P4-008) ----------

test('context reset: fresh runtime context resumes from durable checkpoint and continues deterministically', () => {
  const env = setup();
  let checkpointRefBeforeLoss;
  let snapshotBeforeLoss;
  try {
    {
      const { runtimeState, created } = checkpointRunning(env);
      checkpointRefBeforeLoss = created.checkpointRef;
      snapshotBeforeLoss = JSON.parse(JSON.stringify(runtimeState));
      // Destroy all in-memory runtime state (block scope ends; nothing survives).
    }
    // Fresh runtime context, no shared JS references with the lost run.
    const freshContext = createRunContext({ repoRoot: env.repoRoot });
    assert.notEqual(freshContext.runId, env.context.runId);
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: checkpointRefBeforeLoss,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, true);
    // Replay consistency (P4-009): identical except the explicit resume
    // metadata field checkpoint_ref.
    const { checkpoint_ref: _ignored, ...restoredRest } = resumed.runtimeState;
    assert.deepEqual(restoredRest, snapshotBeforeLoss);
    assert.equal(resumed.runtimeState.checkpoint_ref, checkpointRefBeforeLoss);
    // The loop controller continues deterministically on the rehydrated state.
    const controller = createLoopController();
    const continued = controller.applyDecision({
      runtimeState: resumed.runtimeState,
      taskContract: {
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
        limits: { max_retries: 2, max_replans: 2 }
      },
      decision: 'ACQUIRE_CONTEXT',
      contextEnginePort: {
        engine_ref: 'test-context',
        assemble: () => ({
          ctx_version: '1.0.0',
          context_id: 'ctx-1',
          task_ref: 'task-1',
          token_budget: 10,
          sections: [
            { source_ref: 's', source_type: 'repo_file', provenance: 'p', token_estimate: 1, inclusion_reason: 'r' }
          ],
          omitted_sources: [],
          compression_applied: []
        })
      }
    });
    assert.equal(continued.ok, true);
    assert.equal(continued.runtimeState.lifecycle_state, 'running');
    assert.equal(continued.runtimeState.context_generation, 1);
  } finally {
    teardown(env);
  }
});

// ---------- Mutation after validation ----------

test('checkpoint validated, file mutated afterwards, resume -> DENY', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    assert.equal(loadCheckpoint({ repoRoot: env.repoRoot, checkpointRef: created.checkpointRef }).ok, true);
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    // Mutate a non-identity field: envelope stays valid, only the digest breaks.
    raw.runtime_state.retry_count = 5;
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw, null, 2));
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.denied, 'DIGEST_MISMATCH');
  } finally {
    teardown(env);
  }
});

// ---------- Chain / rollback (P4-010) ----------

test('resume of a superseded sequence -> ROLLBACK_DENIED by default', () => {
  const env = setup();
  try {
    const { controller, created: first } = checkpointRunning(env);
    let state = toRunning(controller);
    const second = createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: { ...state, retry_count: 1 },
      reason: 'after_verified_state_update',
      previousCheckpointRef: first.checkpointRef
    });
    assert.equal(second.ok, true);
    assert.equal(second.checkpoint.sequence, 2);

    const latest = getLatestCheckpoint({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(latest.latest.sequence, 2);

    const rollback = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: first.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(rollback.ok, false);
    assert.equal(rollback.denied, 'ROLLBACK_DENIED');

    const current = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: second.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(current.ok, true);
    assert.equal(current.runtimeState.retry_count, 1);
  } finally {
    teardown(env);
  }
});

test('broken previous-chain -> CHAIN_BROKEN', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env);
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    raw.previous_checkpoint_ref = `artifacts/runtime-runs/${env.context.runId}/checkpoints/cp_000000_chk_ghost.json`;
    const { integrity, ...payload } = raw;
    raw.integrity = { algorithm: 'sha256', payload_digest: sha256OfCanonical(payload) };
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw, null, 2));
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, false);
    assert.equal(resumed.denied, 'CHAIN_BROKEN');
  } finally {
    teardown(env);
  }
});

// ---------- Negative security / integrity ----------

test('path traversal and absolute paths via checkpoint_ref -> DENY', () => {
  const env = setup();
  try {
    for (const evil of [
      'artifacts/runtime-runs/../../secrets/checkpoints/cp_000001_chk_x.json',
      '/etc/passwd',
      `artifacts/runtime-runs/${env.context.runId}/checkpoints/../../../etc/passwd`
    ]) {
      const loaded = loadCheckpoint({ repoRoot: env.repoRoot, checkpointRef: evil });
      assert.equal(loaded.ok, false, evil);
      assert.equal(loaded.denied, 'MALFORMED_CHECKPOINT_REF', evil);
    }
  } finally {
    teardown(env);
  }
});

test('duplicate checkpoint (same sequence + id) -> no silent overwrite', () => {
  const env = setup();
  try {
    const { created } = checkpointRunning(env, { checkpointId: 'chk_dup' });
    // Pre-create the next expected slot with the same id, holding a VALID
    // payload (a copy of the existing checkpoint) — the store must refuse to
    // silently overwrite it.
    const nextPath = path.join(
      path.dirname(created.checkpointPath),
      'cp_000002_chk_dup.json'
    );
    fs.copyFileSync(created.checkpointPath, nextPath);
    assert.throws(() => createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: makeRuntimeState('running'),
      reason: 'manual',
      checkpointId: 'chk_dup'
    }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('DUPLICATE_CHECKPOINT'));
  } finally {
    teardown(env);
  }
});

test('permission-denied write fails closed', () => {
  const env = setup();
  try {
    assert.throws(() => createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: { decide: () => ({ decision: 'deny', reason: 'test gate' }) },
      runRef: env.context.runId,
      runtimeState: makeRuntimeState('running'),
      reason: 'manual'
    }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('WRITE_DENIED'));
  } finally {
    teardown(env);
  }
});

test('invalid safepoint reason -> DENY at creation', () => {
  const env = setup();
  try {
    assert.throws(() => createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: makeRuntimeState('running'),
      reason: 'whenever_i_feel_like_it'
    }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('INVALID_CHECKPOINT_REASON'));
  } finally {
    teardown(env);
  }
});

test('oversized payload -> DENY (practical size cap)', () => {
  const env = setup();
  try {
    const big = makeRuntimeState('running', {
      blockers: new Array(120000).fill('x'.repeat(10))
    });
    assert.throws(() => createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: big,
      reason: 'manual'
    }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('CHECKPOINT_OVERSIZED'));
  } finally {
    teardown(env);
  }
});

test('listCheckpoints is ordered and reports malformed entries fail-closed', () => {
  const env = setup();
  try {
    const { controller, created } = checkpointRunning(env);
    const state = toRunning(controller);
    createCheckpoint({
      repoRoot: env.repoRoot,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: { ...state, retry_count: 3 },
      reason: 'manual',
      previousCheckpointRef: created.checkpointRef
    });
    fs.writeFileSync(
      path.join(path.dirname(created.checkpointPath), 'cp_000003_chk_broken.json'),
      '{broken'
    );
    const list = listCheckpoints({ repoRoot: env.repoRoot, runRef: env.context.runId });
    assert.equal(list.ok, false);
    assert.equal(list.checkpoints.length, 2);
    assert.deepEqual(list.checkpoints.map((entry) => entry.sequence), [1, 2]);
    assert.ok(list.issues.length > 0);
  } finally {
    teardown(env);
  }
});

// ---------- Authority / completion boundaries ----------

test('authority expired while runtime down: resume does not renew it', () => {
  const env = setup();
  try {
    const { runtimeState, created } = checkpointRunning(env);
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.ok, true);
    // An authority decision that ALLOWed before the checkpoint expires; after
    // resume the AuthorityPort is evaluated fresh and must still deny.
    const expiredPort = createAuthorityPort({
      evaluate: ({ actionProposal }) => ({
        decision: 'ALLOW',
        decision_ref: 'dec-expired',
        subject_ref: actionProposal.subject_ref,
        action_ref: actionProposal.action_ref,
        expires_at: '2000-01-01T00:00:00.000Z'
      })
    });
    const effect = executeActionProposal({
      runtimeState: resumed.runtimeState,
      taskContract: { ttc_version: '1.0.0', task_id: 'task-1' },
      actionProposal: {
        proposal_id: 'prp-1',
        task_ref: 'task-1',
        subject_ref: 'subject-1',
        action_ref: 'action-1',
        resource_ref: 'resource-1'
      },
      authorityPort: expiredPort,
      effectPort: {
        port: 'EffectPort',
        effectRef: 'effect-1',
        dispatch: () => {
          throw new Error('effect must never run after resume with expired authority');
        }
      }
    });
    assert.equal(effect.ok, false);
    assert.equal(effect.effectInvocations, 0);
    assert.equal(effect.authority.decision, 'DENY');
  } finally {
    teardown(env);
  }
});

test('checkpoint of running state resumes as running; checkpoint existence never completes a task', () => {
  const env = setup();
  try {
    const { runtimeState, created } = checkpointRunning(env);
    assert.equal(runtimeState.verification_status, 'unverified');
    const resumed = resumeFromCheckpoint({
      repoRoot: env.repoRoot,
      resumeRequest: createResumeRequest({
        checkpointRef: created.checkpointRef,
        expectedTaskRef: 'task-1',
        expectedRunRef: env.context.runId
      })
    });
    assert.equal(resumed.runtimeState.lifecycle_state, 'running');
    assert.equal(resumed.runtimeState.verification_status, 'unverified');

    const controller = createLoopController();
    const completion = controller.applyDecision({
      runtimeState: resumed.runtimeState,
      taskContract: {
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
        limits: { max_retries: 2, max_replans: 2 }
      },
      decision: 'COMPLETE',
      evidenceRefs: [created.checkpointRef],
      completionDisposition: null,
      verificationRecords: []
    });
    assert.equal(completion.ok, false);
    assert.equal(completion.outcome, 'completion_not_met');
  } finally {
    teardown(env);
  }
});

// ---------- Envelope contract sanity ----------

test('envelope validation rejects malformed candidates', () => {
  assert.equal(validateCheckpointEnvelope(null).ok, false);
  assert.equal(validateCheckpointEnvelope({}).ok, false);
  const probe = {
    checkpoint_id: 'bad id with spaces',
    task_ref: 'task-1',
    run_ref: 'run_x',
    runtime_state: makeRuntimeState('running'),
    runtime_state_digest: 'sha256:' + '0'.repeat(64),
    runtime_version: '0.1.0',
    contract_version: CHECKPOINT_CONTRACT_VERSION,
    created_at: '2026-09-14T00:00:00.000Z',
    previous_checkpoint_ref: null,
    sequence: 1,
    reason: 'manual',
    integrity: { algorithm: 'sha256', payload_digest: 'sha256:' + '0'.repeat(64) }
  };
  assert.equal(validateCheckpointEnvelope(probe).ok, false);
});
