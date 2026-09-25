// MAWS vNext routing core (MAWS-VN-600, OD-09/OD-13/OD-14/OD-18).
//
// Deterministic routing engine: it consumes a RoutingRequest (built by
// buildRoutingRequest from WorkUnit capability requirements plus the
// evidence-backed eligible set) and produces a RoutingDecision-shaped object
// that validates against core/contracts/routing-decision.schema.json.
//
// Authority semantics (fail-closed, never widening):
//   - The selected executor ALWAYS comes from the deterministic eligible set.
//   - A Jev answer is advisory: it binds only when its preferred executor is
//     inside the eligible set AND its threshold was met; otherwise it is
//     ignored and never binds outside the set (OD-18).
//   - Scores are verified-only (MAWS-VN-601); flagged/unverifiable or
//     out-of-set score entries are filtered before ranking.
//   - Exploration is bounded by the exploration gate (MAWS-VN-602) and is
//     additionally restricted to safe / reversible_only workloads.
//
// Pure module: no filesystem, no network, no Math.random. IDs/timestamps come
// from the shared vnext util (or are passed in by the caller).
import { FailClosedError, newId, nowIso } from '../vnext/util.mjs';
import { decideExploration, EXPLORATION_SAFE_CLASSES, WORKLOAD_SAFETY_CLASSES } from './exploration.mjs';
import { UNVERIFIED_SIGNAL_FLAG } from './scoring.mjs';

const EXECUTOR_ID_PATTERN = /^exec_[a-z0-9_]+$/;
const WORK_UNIT_ID_PATTERN = /^wu_[a-z0-9_]+$/;
const CAPABILITY_ID_PATTERN = /^cap_[a-z0-9_]+$/;
const REQUEST_ID_PATTERN = /^route_[a-z0-9_]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isUnique(strings) {
  return new Set(strings).size === strings.length;
}

function lexicographicCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// RoutingRequest builder
// ---------------------------------------------------------------------------

// buildRoutingRequest returns the RoutingRequest contract shape
// (request_id, work_unit_id, capability_requirements,
// eligible_executor_ids, policy_context_ref, workload_safety_class,
// session_model_preference) enriched with an `eligible` array
// ({executor_id, qualification_ref} per candidate) that carries the
// evidence-backed qualification references route() must be able to prove for
// the finally selected executor. The contract-shaped projection (spread
// minus `eligible`) validates against routing-request.schema.json. The
// session model preference is inert metadata: it never narrows or forces the
// candidate set (OD-18: InteractionSessionModel != WorkUnitExecutor).
export function buildRoutingRequest({
  work_unit_id: workUnitId,
  capability_requirements: capabilityRequirements,
  eligible,
  policy_context_ref: policyContextRef,
  workload_safety_class: workloadSafetyClass,
  session_model_preference: sessionModelPreference = null
} = {}) {
  if (!isNonEmptyString(workUnitId) || !WORK_UNIT_ID_PATTERN.test(workUnitId)) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', `work_unit_id must match ${WORK_UNIT_ID_PATTERN}`);
  }
  if (
    !Array.isArray(capabilityRequirements) ||
    capabilityRequirements.length === 0 ||
    !capabilityRequirements.every((capabilityId) => isNonEmptyString(capabilityId) && CAPABILITY_ID_PATTERN.test(capabilityId)) ||
    !isUnique(capabilityRequirements)
  ) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', 'capability_requirements must be a non-empty unique array of cap_ ids');
  }
  if (
    !Array.isArray(eligible) ||
    eligible.length === 0 ||
    !eligible.every((entry) => entry !== null && typeof entry === 'object' && isNonEmptyString(entry.executor_id) && EXECUTOR_ID_PATTERN.test(entry.executor_id) && isNonEmptyString(entry.qualification_ref)) ||
    !isUnique(eligible.map((entry) => entry.executor_id))
  ) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', 'eligible must be a non-empty unique array of {executor_id, qualification_ref}');
  }
  if (!isNonEmptyString(policyContextRef)) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', 'policy_context_ref must be a non-empty string');
  }
  if (!WORKLOAD_SAFETY_CLASSES.includes(workloadSafetyClass)) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', `workload_safety_class must be one of ${WORKLOAD_SAFETY_CLASSES.join(', ')}`);
  }
  if (sessionModelPreference !== null && !isNonEmptyString(sessionModelPreference)) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', 'session_model_preference must be null or a non-empty string');
  }

  return {
    request_id: newId('route'),
    work_unit_id: workUnitId,
    capability_requirements: [...capabilityRequirements],
    eligible_executor_ids: eligible.map((entry) => entry.executor_id),
    policy_context_ref: policyContextRef,
    workload_safety_class: workloadSafetyClass,
    session_model_preference: sessionModelPreference,
    eligible: eligible.map((entry) => ({ executor_id: entry.executor_id, qualification_ref: entry.qualification_ref }))
  };
}

// ---------------------------------------------------------------------------
// Selection rules
// ---------------------------------------------------------------------------

function isFlaggedScoreEntry(entry) {
  const flags = entry.flags;
  return Array.isArray(flags) && flags.includes(UNVERIFIED_SIGNAL_FLAG);
}

function usableScoreEntries(scores, eligibleIds) {
  return scores.filter(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof entry.executor_id === 'string' &&
      eligibleIds.includes(entry.executor_id) &&
      typeof entry.score === 'number' &&
      Number.isFinite(entry.score) &&
      !isFlaggedScoreEntry(entry)
  );
}

function executionsCountFor(executionsCount, executorId) {
  const count = executionsCount[executorId];
  if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
    return count;
  }
  return 0;
}

// Exploration candidate: eligible executor with the fewest recorded
// executions (0 default), ties broken by lexicographically smallest
// executor id. Deterministic.
function pickExplorationCandidate(eligibleIds, executionsCount) {
  return eligibleIds
    .slice()
    .sort((a, b) => executionsCountFor(executionsCount, a) - executionsCountFor(executionsCount, b) || lexicographicCompare(a, b))[0];
}

// Selection precedence (documented design choices where the spec leaves the
// interaction open; every branch stays inside the eligible set):
//   E) EXPLORATION when an exploration policy was explicitly passed, the
//      exploration gate allows it, and the workload is safe/reversible_only.
//      The caller passing the policy owns the traffic-share budget, so an
//      admitted exploration takes precedence over the deterministic rules.
//   1) Jev answer binds (NORMAL_SELECTION + jev_receipt_ref) only when
//      present, threshold_met, and preferred is inside the eligible set;
//      otherwise the Jev answer is ignored (never binds outside).
//   2) Verified scores: highest score wins, ties broken by lexicographically
//      smallest executor id. Out-of-set and UNVERIFIED_SIGNAL_REJECTED
//      entries are filtered first, so a self-scored/unverifiable candidate
//      can never win, including zero-score ties.
//   3) A single eligible executor binds directly.
//   4) Fallback: with a failed primary, the first available eligible member
//      of the fallback chain binds (FALLBACK + fallback_of).
//   5) Otherwise: FailClosedError ROUTING_INDETERMINATE.
function selectExecutor(input, request, eligibleIds) {
  const safetyClass = request.workload_safety_class;

  if (input.exploration_policy !== null && input.exploration_policy !== undefined) {
    const gate = decideExploration({
      explorationPolicy: input.exploration_policy,
      workloadSafetyClass: safetyClass,
      candidateCount: eligibleIds.length
    });
    if (gate.allowed && EXPLORATION_SAFE_CLASSES.includes(safetyClass)) {
      return {
        executor_id: pickExplorationCandidate(eligibleIds, input.executions_count && typeof input.executions_count === 'object' ? input.executions_count : {}),
        selection_mode: 'EXPLORATION',
        jev_receipt_ref: null,
        exploration: {
          policy_ref: input.exploration_policy.policy_ref,
          traffic_share: gate.traffic_share
        },
        fallback_of: null
      };
    }
  }

  const jevAnswer = input.jev_answer;
  if (
    jevAnswer !== null &&
    jevAnswer !== undefined &&
    typeof jevAnswer === 'object' &&
    jevAnswer.threshold_met === true &&
    typeof jevAnswer.preferred_executor_id === 'string' &&
    eligibleIds.includes(jevAnswer.preferred_executor_id) &&
    isNonEmptyString(jevAnswer.receipt_ref)
  ) {
    return {
      executor_id: jevAnswer.preferred_executor_id,
      selection_mode: 'NORMAL_SELECTION',
      jev_receipt_ref: jevAnswer.receipt_ref,
      exploration: null,
      fallback_of: null
    };
  }

  if (Array.isArray(input.scores)) {
    const usable = usableScoreEntries(input.scores, eligibleIds);
    if (usable.length > 0) {
      const winner = usable.slice().sort(
        (a, b) => b.score - a.score || lexicographicCompare(a.executor_id, b.executor_id)
      )[0];
      return {
        executor_id: winner.executor_id,
        selection_mode: 'NORMAL_SELECTION',
        jev_receipt_ref: null,
        exploration: null,
        fallback_of: null
      };
    }
  }

  if (eligibleIds.length === 1) {
    return {
      executor_id: eligibleIds[0],
      selection_mode: 'NORMAL_SELECTION',
      jev_receipt_ref: null,
      exploration: null,
      fallback_of: null
    };
  }

  if (Array.isArray(input.fallback_chain) && input.failed_primary !== null && input.failed_primary !== undefined) {
    const member = input.fallback_chain.find(
      (executorId) => typeof executorId === 'string' && executorId !== input.failed_primary && eligibleIds.includes(executorId)
    );
    if (member !== undefined) {
      return {
        executor_id: member,
        selection_mode: 'FALLBACK',
        jev_receipt_ref: null,
        exploration: null,
        fallback_of: input.failed_primary
      };
    }
  }

  throw new FailClosedError('ROUTING_INDETERMINATE', 'no deterministic selection rule produced a binding executor inside the eligible set');
}

// ---------------------------------------------------------------------------
// route()
// ---------------------------------------------------------------------------

// route(input) -> RoutingDecision-shaped output (schema-valid against
// core/contracts/routing-decision.schema.json).
//
// input = {
//   routing_request,                      // buildRoutingRequest() output (or equal shape)
//   jev_answer: {preferred_executor_id, receipt_ref, threshold_met} | null,
//   scores | null,                        // scoreCandidates() output
//   exploration_policy | null,            // {policy_ref, max_traffic_share, allowed_safety_classes}
//   executions_count | null,              // {executor_id: count} for exploration
//   fallback_chain | null,                // ordered executor ids
//   failed_primary: executor id | null,   // set when the primary failed (fallback)
//   decided_at                            // optional fixed timestamp
// }
export function route(input = {}) {
  const request = input.routing_request;
  if (request === null || typeof request !== 'object') {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', 'routing_request must be an object');
  }
  if (!isNonEmptyString(request.request_id) || !REQUEST_ID_PATTERN.test(request.request_id)) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', `routing_request.request_id must match ${REQUEST_ID_PATTERN}`);
  }
  const eligibleIds = request.eligible_executor_ids;
  if (
    !Array.isArray(eligibleIds) ||
    eligibleIds.length === 0 ||
    !eligibleIds.every((executorId) => isNonEmptyString(executorId) && EXECUTOR_ID_PATTERN.test(executorId)) ||
    !isUnique(eligibleIds)
  ) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', 'routing_request.eligible_executor_ids must be a non-empty unique array of exec_ ids');
  }
  if (!WORKLOAD_SAFETY_CLASSES.includes(request.workload_safety_class)) {
    throw new FailClosedError('ROUTING_REQUEST_INVALID', 'routing_request.workload_safety_class is unknown');
  }
  if (input.failed_primary !== null && input.failed_primary !== undefined) {
    if (typeof input.failed_primary !== 'string' || !EXECUTOR_ID_PATTERN.test(input.failed_primary)) {
      throw new FailClosedError('ROUTING_INPUT_INVALID', 'failed_primary must be an exec_ id or null');
    }
  }

  const selection = selectExecutor(input, request, eligibleIds);

  // Hard invariant: the selected executor MUST be in the eligible set.
  if (!eligibleIds.includes(selection.executor_id)) {
    throw new FailClosedError('SELECTED_NOT_ELIGIBLE', `selected executor ${selection.executor_id} is not in the eligible set`);
  }

  // Qualification proof for the finally selected executor (OD-09:
  // ELIGIBLE != ASSIGNED; the assignment records its qualification ref).
  const qualifications = new Map(
    (Array.isArray(request.eligible) ? request.eligible : [])
      .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.executor_id === 'string')
      .map((entry) => [entry.executor_id, entry.qualification_ref])
  );
  const qualificationRef = qualifications.get(selection.executor_id);
  if (!isNonEmptyString(qualificationRef)) {
    throw new FailClosedError('QUALIFICATION_MISSING', `no qualification_ref recorded for selected executor ${selection.executor_id}`);
  }

  // scoring_evidence: verified signals (with evidence_ref) of the winning
  // candidate, empty when scoring was not used for the winner.
  const scoreEntry = Array.isArray(input.scores)
    ? input.scores.find((entry) => entry !== null && typeof entry === 'object' && entry.executor_id === selection.executor_id)
    : undefined;
  const scoringEvidence = (scoreEntry && Array.isArray(scoreEntry.contributing_signals) ? scoreEntry.contributing_signals : [])
    .filter((item) => item !== null && typeof item === 'object' && isNonEmptyString(item.signal) && isNonEmptyString(item.evidence_ref))
    .map((item) => ({ signal: item.signal, evidence_ref: item.evidence_ref }));

  return {
    decision_id: newId('rd'),
    request_ref: request.request_id,
    selected_executor_id: selection.executor_id,
    selection_mode: selection.selection_mode,
    qualification_ref: qualificationRef,
    workload_safety_class: request.workload_safety_class,
    scoring_evidence: scoringEvidence,
    jev_receipt_ref: selection.jev_receipt_ref,
    exploration: selection.exploration,
    fallback_of: selection.fallback_of,
    decided_at: isNonEmptyString(input.decided_at) ? input.decided_at : nowIso()
  };
}
