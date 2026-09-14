import { isKnownState, isTerminalState } from './loop-state-machine.mjs';
import { validateRuntimeState } from '../contracts/clg-contracts.mjs';
import { CHECKPOINT_REF_PATTERN } from './checkpoint-integrity.mjs';
import { getLatestCheckpoint, loadCheckpoint } from './checkpoint-store.mjs';
import { RUNTIME_VERSION } from './runtime-context.mjs';
import { CHECKPOINT_CONTRACT_VERSION } from './checkpoint-integrity.mjs';

// CLG P4-005/006/007 resume controller.
//
// Resume is explicit only: a resume request names checkpoint_ref,
// expected_task_ref, expected_run_ref and the runtime_version it was written
// for. "Find something recent and continue" is not a resume mechanism
// (getLatestCheckpoint is only usable when task/run scope is already bound).
//
// Before rehydration, ALL of these must hold (fail-closed, evaluated DENY):
//   checkpoint exists / schema valid / digests valid / task_ref matches /
//   run_ref matches / runtime version compatible / contract version
//   compatible / RuntimeState valid / lifecycle state resumable (non-terminal,
//   known) / sequence consistent (no implicit rollback, no forward anomaly) /
//   previous-chain link intact.
//
// Resume ONLY restores valid runtime execution state. It never performs an
// effect, never grants authority (a previous ALLOW is not renewed — the
// AuthorityPort re-evaluates fresh per effect, expiry included), never marks
// verification passed, never completes a task. Afterwards the existing
// LoopController owns the runtime again.
//
// Version policy (P4 v1): exact-match only. There is no migration
// infrastructure, so unknown runtime/contract versions DENY. This is
// fail-closed and sufficient.
//
// Rollback policy: resuming sequence N < latest known N is DENIED by default.
// EXPLICIT_ROLLBACK_AUTHORIZATION is a future capability and is NOT granted
// implicitly in P4.

const ROLLBACK_FUTURE_CAPABILITY = 'EXPLICIT_ROLLBACK_AUTHORIZATION';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function createResumeRequest({ checkpointRef, expectedTaskRef, expectedRunRef, runtimeVersion = RUNTIME_VERSION }) {
  return {
    checkpoint_ref: checkpointRef,
    expected_task_ref: expectedTaskRef,
    expected_run_ref: expectedRunRef,
    runtime_version: runtimeVersion
  };
}

function validateResumeRequest(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['Resume request must be an object.'] };
  }
  for (const field of ['checkpoint_ref', 'expected_task_ref', 'expected_run_ref', 'runtime_version']) {
    if (!isNonEmptyString(candidate[field])) {
      issues.push(`Resume request.${field} must be a non-empty string.`);
    }
  }
  if (isNonEmptyString(candidate.checkpoint_ref) && !CHECKPOINT_REF_PATTERN.test(candidate.checkpoint_ref)) {
    issues.push('Resume request.checkpoint_ref is malformed or not path-safe.');
  }
  return { ok: issues.length === 0, issues };
}

function deny(denied, issues) {
  return { ok: false, denied, runtimeState: null, checkpoint: null, issues };
}

// The single resume entry point. On success the rehydrated RuntimeState
// carries checkpoint_ref bound to the resumed checkpoint (CLG-002 coherence);
// every other field is byte-identical to the persisted snapshot.
function resumeFromCheckpoint({ repoRoot, resumeRequest }) {
  const requestCheck = validateResumeRequest(resumeRequest);
  if (!requestCheck.ok) {
    return deny('MALFORMED_RESUME_REQUEST', requestCheck.issues);
  }

  const loaded = loadCheckpoint({ repoRoot, checkpointRef: resumeRequest.checkpoint_ref });
  if (!loaded.ok) {
    return deny(loaded.denied, loaded.issues);
  }
  const checkpoint = loaded.checkpoint;
  const runtimeState = checkpoint.runtime_state;

  if (checkpoint.task_ref !== resumeRequest.expected_task_ref) {
    return deny('CROSS_TASK_RESUME_DENIED', [
      `checkpoint belongs to task ${checkpoint.task_ref}, resume requested for ${resumeRequest.expected_task_ref}.`
    ]);
  }
  if (checkpoint.run_ref !== resumeRequest.expected_run_ref) {
    return deny('RUN_MISMATCH_DENIED', [
      `checkpoint belongs to run ${checkpoint.run_ref}, resume requested for ${resumeRequest.expected_run_ref}.`
    ]);
  }
  if (checkpoint.runtime_version !== resumeRequest.runtime_version) {
    return deny('RUNTIME_VERSION_UNSUPPORTED', [
      `checkpoint runtime_version ${checkpoint.runtime_version} != requested ${resumeRequest.runtime_version} (exact-match policy, no migration path in P4 v1).`
    ]);
  }
  if (checkpoint.contract_version !== CHECKPOINT_CONTRACT_VERSION) {
    return deny('CONTRACT_VERSION_UNSUPPORTED', [
      `checkpoint contract_version ${checkpoint.contract_version} != supported ${CHECKPOINT_CONTRACT_VERSION} (no best-effort coercion).`
    ]);
  }

  const stateCheck = validateRuntimeState(runtimeState);
  if (!stateCheck.ok) {
    return deny('INVALID_RUNTIME_STATE', ['Persisted RuntimeState violates the CLG-002 contract.', ...stateCheck.issues]);
  }
  if (!isKnownState(runtimeState.lifecycle_state)) {
    return deny('UNKNOWN_LIFECYCLE_STATE', [`Unknown lifecycle state: ${String(runtimeState.lifecycle_state)}.`]);
  }
  if (isTerminalState(runtimeState.lifecycle_state)) {
    return deny('TERMINAL_RESUME_DENIED', [
      `Terminal state ${runtimeState.lifecycle_state} cannot be resumed (no silent reactivation).`
    ]);
  }

  const latest = getLatestCheckpoint({ repoRoot, runRef: checkpoint.run_ref });
  if (!latest.ok) {
    return deny('SEQUENCE_ANOMALY', ['Checkpoint store inspection failed during resume.', ...latest.issues]);
  }
  if (latest.latest) {
    if (checkpoint.sequence > latest.latest.sequence) {
      return deny('SEQUENCE_ANOMALY', [
        `requested sequence ${checkpoint.sequence} exceeds latest known ${latest.latest.sequence}.`
      ]);
    }
    if (checkpoint.sequence < latest.latest.sequence) {
      return deny('ROLLBACK_DENIED', [
        `requested sequence ${checkpoint.sequence} is behind latest known ${latest.latest.sequence}; implicit rollback denied (${ROLLBACK_FUTURE_CAPABILITY} required, not granted in P4).`
      ]);
    }
  }

  if (checkpoint.previous_checkpoint_ref !== null && checkpoint.previous_checkpoint_ref !== undefined) {
    const previous = loadCheckpoint({ repoRoot, checkpointRef: checkpoint.previous_checkpoint_ref });
    if (!previous.ok) {
      return deny('CHAIN_BROKEN', ['previous_checkpoint_ref does not load.', ...previous.issues]);
    }
    const prev = previous.checkpoint;
    if (prev.sequence !== checkpoint.sequence - 1 || prev.task_ref !== checkpoint.task_ref || prev.run_ref !== checkpoint.run_ref) {
      return deny('CHAIN_BROKEN', ['previous_checkpoint_ref does not chain to this checkpoint (sequence/identity mismatch).']);
    }
  }

  const rehydrated = Object.freeze({
    ...runtimeState,
    checkpoint_ref: resumeRequest.checkpoint_ref
  });
  return {
    ok: true,
    denied: null,
    runtimeState: rehydrated,
    checkpoint,
    resume: {
      checkpoint_ref: resumeRequest.checkpoint_ref,
      resumed_at: new Date().toISOString()
    },
    issues: []
  };
}

export {
  ROLLBACK_FUTURE_CAPABILITY,
  createResumeRequest,
  resumeFromCheckpoint,
  validateResumeRequest
};
