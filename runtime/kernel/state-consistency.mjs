import { listEvents } from './runtime-event-log.mjs';
import { loadCheckpoint } from './checkpoint-store.mjs';
import { findTransition, isKnownState, isTerminalState } from './loop-state-machine.mjs';

// CLG P10 independent state consistency — evidence-only evaluator.
//
//   RuntimeState / Checkpoint = canonical execution-state authority (unchanged)
//   EventLog                  = evidence / observation history
//
// This module may read, project, compare and report — NOTHING else.
// Structural boundaries (enforced by construction: the module contains no
// write capability):
//   StateConsistency != RuntimeState mutation
//   StateConsistency != Checkpoint rewrite
//   StateConsistency != Transition application
//   StateConsistency != Stream repair
//   StateConsistency != Authority
//   StateConsistency != Completion    (CONSISTENT is not a verification PASS)
//
// Independence note (honest): event emission and checkpoint writes both
// originate from the same in-process transition records. This evaluator proves
// that the two persistence tracks AGREE (per-event digests vs dual checkpoint
// digests) and that the claimed history is SM-valid and continuous — it cannot
// detect a controller bug writing the same wrong fact to both stores
// (INDEPENDENCE_WEAK, documented in the P10 recon).

const TRANSITION_EVENT_TYPE = 'TRANSITION_APPLIED';
const TERMINAL_EVENT_TYPE = 'RUN_TERMINATED';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// Validation-first (P10-S3): the stream must be intact (no taint), sequence-
// contiguous, task-bound, and every transition event's causation must resolve.
// Any failure -> STATE_PROJECTION_DENIED; never best-effort.
function validateStreamForProjection(events, taskRef, failures) {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index].sequence !== index + 1) {
      failures.push(`event sequence gap at position ${index + 1} (sequence ${sorted[index].sequence}).`);
      return null;
    }
  }
  const eventIds = new Set(sorted.map((event) => event.event_id));
  for (const event of sorted) {
    if (event.event_type !== TRANSITION_EVENT_TYPE) {
      continue;
    }
    if (taskRef !== null && event.task_ref !== taskRef) {
      failures.push(`transition event ${event.event_id} has task_ref ${event.task_ref}, expected ${taskRef} (cross-task binding).`);
    }
    if (event.causation_ref === null) {
      if (sorted[0].event_id !== event.event_id) {
        failures.push(`transition event ${event.event_id} has unresolved (null) causation outside the stream head.`);
      }
    } else if (!eventIds.has(event.causation_ref)) {
      failures.push(`transition event ${event.event_id} causation_ref ${event.causation_ref} does not resolve to any event in the stream.`);
    }
  }
  return sorted;
}

// P10-S2: project the expected lifecycle state from ordered validated events
// using ONLY existing kernel semantics. A projected step is either a real SM
// edge (findTransition) or the documented non-terminal controller
// self-transition (CONTINUE / loop_iteration: from === to, state unchanged).
function projectStateFromEvents({ repoRoot, runRef, taskRef = null }) {
  const failures = [];
  const read = listEvents({ repoRoot, runRef });
  if (!read.ok) {
    failures.push('event stream integrity failed (tainted or unreadable).', ...read.issues);
    return { ok: false, denied: 'STATE_PROJECTION_DENIED', failures, projected: null };
  }
  const sorted = validateStreamForProjection(read.events, taskRef, failures);
  if (sorted === null || failures.length > 0) {
    return { ok: false, denied: 'STATE_PROJECTION_DENIED', failures, projected: null };
  }
  const transitions = sorted.filter((event) => event.event_type === TRANSITION_EVENT_TYPE);
  if (transitions.length === 0) {
    failures.push('no TRANSITION_APPLIED evidence in stream (nothing to project).');
    return { ok: false, denied: 'STATE_PROJECTION_DENIED', failures, projected: null };
  }

  let current = null;
  const transitionRefs = [];
  const eventRefs = [];
  for (const event of transitions) {
    const from = event.payload ? event.payload.from : undefined;
    const to = event.payload ? event.payload.to : undefined;
    if (!isKnownState(from) || !isKnownState(to)) {
      failures.push(`transition event ${event.event_id} carries unknown states (${String(from)} -> ${String(to)}).`);
      break;
    }
    if (current !== null && event.payload.from !== current) {
      failures.push(`continuity break at event ${event.event_id}: history ends at ${current} but transition claims from ${event.payload.from}.`);
      break;
    }
    const smEdge = findTransition(from, to);
    const selfTransition = from === to && !isTerminalState(from);
    if (!smEdge && !selfTransition) {
      failures.push(`transition event ${event.event_id} claims ${from} -> ${to}, which is invalid under the kernel state machine (unspecified transition).`);
      break;
    }
    current = to;
    transitionRefs.push(event.correlation_ref);
    eventRefs.push(event.event_id);
  }

  if (failures.length > 0) {
    return { ok: false, denied: 'STATE_PROJECTION_DENIED', failures, projected: null };
  }

  for (const event of sorted) {
    if (event.event_type !== TERMINAL_EVENT_TYPE) {
      continue;
    }
    const claimed = event.payload ? event.payload.lifecycle_state : undefined;
    if (claimed !== current) {
      failures.push(`terminal evidence mismatch: RUN_TERMINATED claims ${String(claimed)} but transition history projects ${current}.`);
      return { ok: false, denied: 'STATE_PROJECTION_DENIED', failures, projected: null };
    }
  }

  return {
    ok: true,
    denied: null,
    failures: [],
    projected: {
      initial_state: transitions[0].payload.from,
      final_state: current,
      applied_transition_refs: transitionRefs,
      event_refs: eventRefs
    }
  };
}

// P10-S4/S5: compare the event-projected final lifecycle state against the
// canonical checkpoint RuntimeState. Minimum comparison only — the full
// RuntimeState is deliberately NOT reconstructed (events do not prove it).
function evaluateStateConsistency({ repoRoot, runRef, checkpointRef, taskRef = null }) {
  const loaded = loadCheckpoint({ repoRoot, checkpointRef });
  const base = {
    task_ref: taskRef,
    run_ref: runRef,
    checkpoint_ref: checkpointRef,
    projected_state: null,
    checkpoint_state: null,
    transition_refs: [],
    event_refs: [],
    failures: []
  };
  if (!loaded.ok) {
    return { ...base, status: 'INSUFFICIENT_EVIDENCE', failures: [`checkpoint load failed: ${loaded.denied}`, ...loaded.issues] };
  }
  const projection = projectStateFromEvents({ repoRoot, runRef, taskRef });
  if (!projection.ok) {
    return { ...base, status: 'INSUFFICIENT_EVIDENCE', failures: projection.failures };
  }
  const checkpointState = loaded.checkpoint.runtime_state.lifecycle_state;
  const failures = [];
  if (projection.projected.final_state !== checkpointState) {
    failures.push(`state divergence: event history projects ${projection.projected.final_state}, checkpoint claims ${checkpointState}.`);
  }
  return {
    task_ref: taskRef,
    run_ref: runRef,
    checkpoint_ref: checkpointRef,
    projected_state: projection.projected,
    checkpoint_state: { lifecycle_state: checkpointState },
    transition_refs: projection.projected.applied_transition_refs,
    event_refs: projection.projected.event_refs,
    failures,
    status: failures.length === 0 ? 'CONSISTENT' : 'INCONSISTENT'
  };
}

export { evaluateStateConsistency, projectStateFromEvents };
