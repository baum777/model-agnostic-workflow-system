// MAWS vNext routing — policy-bounded multi-executor composition
// (MAWS-VN-603, OD-15).
//
// The workflow's CompositionPolicy declares whether composition is allowed,
// which modes are permitted, and the count bounds; this builder only binds
// participants INSIDE those constraints. Composition never aggregates
// authority: authority_aggregation is always 'none' and the authority
// ceiling stays the WorkUnit ceiling (each participant carries its own
// routing decision elsewhere).
//
// Pure module: no I/O, no randomness, no authority widening. Every violation
// (malformed policy, disallowed mode, participant overflow, duplicate
// executors) fails closed with COMPOSITION_POLICY_VIOLATION.
import { FailClosedError, newId, nowIso } from '../vnext/util.mjs';

export const COMPOSITION_MODES = Object.freeze(['independent_parallel', 'producer_verifier', 'specialist_synthesis']);

const POLICY_ID_PATTERN = /^comp_[a-z0-9_]+$/;
const EXECUTOR_ID_PATTERN = /^exec_[a-z0-9_]+$/;
const SAFETY_CLASSES = ['safe', 'reversible_only', 'high_risk', 'production_critical', 'irreversible'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function violation(message) {
  throw new FailClosedError('COMPOSITION_POLICY_VIOLATION', message);
}

function isIntegerInRange(value, minimum, maximum) {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

// Structural policy validation (contract shape of
// composition-policy.schema.json, enforced without filesystem access).
function validatePolicyShape(policy) {
  if (policy === null || typeof policy !== 'object') {
    violation('composition_policy must be an object');
  }
  if (!isNonEmptyString(policy.policy_id) || !POLICY_ID_PATTERN.test(policy.policy_id)) {
    violation(`composition_policy.policy_id must match ${POLICY_ID_PATTERN}`);
  }
  if (
    !Array.isArray(policy.allowed_modes) ||
    policy.allowed_modes.length === 0 ||
    !policy.allowed_modes.every((mode) => COMPOSITION_MODES.includes(mode)) ||
    new Set(policy.allowed_modes).size !== policy.allowed_modes.length
  ) {
    violation('composition_policy.allowed_modes must be a non-empty unique array of composition modes');
  }
  if (!isIntegerInRange(policy.max_executors, 1, 8)) {
    violation('composition_policy.max_executors must be an integer between 1 and 8');
  }
  if (!isIntegerInRange(policy.max_parallelism, 1, 8)) {
    violation('composition_policy.max_parallelism must be an integer between 1 and 8');
  }
  if (
    !Array.isArray(policy.workload_safety_classes_allowed) ||
    policy.workload_safety_classes_allowed.length === 0 ||
    !policy.workload_safety_classes_allowed.every((safetyClass) => SAFETY_CLASSES.includes(safetyClass))
  ) {
    violation('composition_policy.workload_safety_classes_allowed must be a non-empty array of safety classes');
  }
}

// buildComposition({ composition_policy, mode, participants,
// authority_ceiling_ref, created_at? }) -> CompositionDecision-shaped output
// (schema-valid against core/contracts/composition-decision.schema.json).
export function buildComposition({ composition_policy: compositionPolicy, mode, participants, authority_ceiling_ref: authorityCeilingRef, created_at: createdAt } = {}) {
  validatePolicyShape(compositionPolicy);

  if (typeof mode !== 'string' || !COMPOSITION_MODES.includes(mode) || !compositionPolicy.allowed_modes.includes(mode)) {
    violation(`composition mode ${JSON.stringify(mode)} is not allowed by policy ${compositionPolicy.policy_id}`);
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    violation('participants must be a non-empty array of {executor_id, routing_decision_ref}');
  }
  if (participants.length > compositionPolicy.max_executors) {
    violation(`composition has ${participants.length} participants, policy ${compositionPolicy.policy_id} allows at most ${compositionPolicy.max_executors}`);
  }
  if (participants.length > 8) {
    violation('composition decision cannot carry more than 8 participants');
  }
  if (
    !participants.every(
      (participant) =>
        participant !== null &&
        typeof participant === 'object' &&
        isNonEmptyString(participant.executor_id) &&
        EXECUTOR_ID_PATTERN.test(participant.executor_id) &&
        isNonEmptyString(participant.routing_decision_ref)
    )
  ) {
    violation('each participant must be {executor_id: exec_ id, routing_decision_ref: non-empty string}');
  }
  const executorIds = participants.map((participant) => participant.executor_id);
  if (new Set(executorIds).size !== executorIds.length) {
    violation(`composition participants must have unique executor ids, found duplicates in [${executorIds.join(', ')}]`);
  }
  if (!isNonEmptyString(authorityCeilingRef)) {
    violation('authority_ceiling_ref must be a non-empty string');
  }

  return {
    decision_id: newId('cd'),
    policy_ref: compositionPolicy.policy_id,
    mode,
    participants: participants.map((participant) => ({
      executor_id: participant.executor_id,
      routing_decision_ref: participant.routing_decision_ref
    })),
    authority_aggregation: 'none',
    authority_ceiling_ref: authorityCeilingRef,
    created_at: isNonEmptyString(createdAt) ? createdAt : nowIso()
  };
}
