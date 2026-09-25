// MAWS vNext routing — bounded exploration gate (MAWS-VN-602, OD-14).
//
// Exploration is allowed only inside the qualified candidate set and inside
// explicit policy limits, and must be disabled for high-risk,
// production-critical, and irreversible workloads (OD-14). This gate is pure
// and deterministic: it never decides randomly whether a particular decision
// explores; it only answers whether the policy admits exploration at all and
// at what bounded traffic share. Rejections are returned (allowed: false),
// never thrown — callers fail closed on the returned verdict.

export const WORKLOAD_SAFETY_CLASSES = Object.freeze([
  'safe',
  'reversible_only',
  'high_risk',
  'production_critical',
  'irreversible'
]);

// Safety classes for which exploration can ever be considered. The three
// dangerous classes below are rejected even if a malformed policy lists them.
export const EXPLORATION_SAFE_CLASSES = Object.freeze(['safe', 'reversible_only']);
export const EXPLORATION_FORBIDDEN_CLASSES = Object.freeze(['high_risk', 'production_critical', 'irreversible']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function rejected(reason) {
  return { allowed: false, reason, traffic_share: 0 };
}

// decideExploration({ explorationPolicy: {policy_ref, max_traffic_share,
// allowed_safety_classes}, workloadSafetyClass, candidateCount })
//   -> { allowed, reason, traffic_share }
//
// Rejection conditions (checked in order, all deterministic):
//   - malformed policy (missing policy_ref / empty or invalid
//     allowed_safety_classes)                       -> EXPLORATION_POLICY_INVALID
//   - declared share outside the absolute 0..1 bound ("share exceeds max")
//                                                   -> TRAFFIC_SHARE_OUT_OF_BOUNDS
//   - fewer than 2 candidates                       -> CANDIDATE_COUNT_BELOW_MINIMUM
//   - unknown workload safety class                 -> SAFETY_CLASS_UNKNOWN
//   - high_risk / production_critical / irreversible-> SAFETY_CLASS_FORBIDDEN
//   - class not in the policy's allowed classes     -> SAFETY_CLASS_NOT_ALLOWED
export function decideExploration({ explorationPolicy, workloadSafetyClass, candidateCount } = {}) {
  if (explorationPolicy === null || typeof explorationPolicy !== 'object') {
    return rejected('EXPLORATION_POLICY_INVALID');
  }
  const { policy_ref: policyRef, max_traffic_share: maxTrafficShare, allowed_safety_classes: allowedSafetyClasses } = explorationPolicy;
  if (!isNonEmptyString(policyRef)) {
    return rejected('EXPLORATION_POLICY_INVALID');
  }
  if (
    typeof maxTrafficShare !== 'number' ||
    !Number.isFinite(maxTrafficShare) ||
    maxTrafficShare < 0 ||
    maxTrafficShare > 1
  ) {
    return rejected('TRAFFIC_SHARE_OUT_OF_BOUNDS');
  }
  if (
    !Array.isArray(allowedSafetyClasses) ||
    allowedSafetyClasses.length === 0 ||
    !allowedSafetyClasses.every((safetyClass) => WORKLOAD_SAFETY_CLASSES.includes(safetyClass))
  ) {
    return rejected('EXPLORATION_POLICY_INVALID');
  }
  if (typeof candidateCount !== 'number' || !Number.isInteger(candidateCount) || candidateCount < 2) {
    return rejected('CANDIDATE_COUNT_BELOW_MINIMUM');
  }
  if (!WORKLOAD_SAFETY_CLASSES.includes(workloadSafetyClass)) {
    return rejected('SAFETY_CLASS_UNKNOWN');
  }
  if (EXPLORATION_FORBIDDEN_CLASSES.includes(workloadSafetyClass)) {
    return rejected('SAFETY_CLASS_FORBIDDEN');
  }
  if (!allowedSafetyClasses.includes(workloadSafetyClass)) {
    return rejected('SAFETY_CLASS_NOT_ALLOWED');
  }
  return { allowed: true, reason: 'EXPLORATION_ALLOWED', traffic_share: maxTrafficShare };
}
