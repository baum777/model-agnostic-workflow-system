// MAWS vNext routing — typed disagreement classification and resolution
// (MAWS-VN-604, OD-16).
//
// Multi-executor disagreement is classified before resolution and each class
// resolves only through its declared DisagreementPolicy. A synthesizer never
// gains independent authority: synthesizer_independent_authority is always
// false and synthesizer_authority must be 'none' on every accepted policy.
//
// Class rules (fail-closed, never authority-widening):
//   - authority_conflict: NEVER RESOLVED by the runtime. A present human
//     decision escalates to the human gate (ESCALATED); without one the
//     disagreement BLOCKS. Evidence results cannot resolve it.
//   - factual_conflict: RESOLVED only via independent verification (true) or
//     a human decision; never via evidence review or synthesis alone.
//   - all other classes: RESOLVED only when every action the policy marks
//     required is satisfied, otherwise ESCALATED — or BLOCKED when the
//     policy is fail_closed.
//
// Pure module: no I/O, no randomness.
import { FailClosedError, newId, nowIso } from '../vnext/util.mjs';

export const DISAGREEMENT_CLASSES = Object.freeze([
  'factual_conflict',
  'implementation_conflict',
  'verification_conflict',
  'evidence_conflict',
  'policy_conflict',
  'authority_conflict'
]);

const POLICY_ID_PATTERN = /^dis_[a-z0-9_]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

// classifyDisagreement({ conflict_kind_hint }) returns the typed disagreement
// class. Hints outside the typed enum fail closed: untyped conflicts are
// never silently coerced into a resolvable class.
export function classifyDisagreement({ conflict_kind_hint: conflictKindHint } = {}) {
  if (typeof conflictKindHint !== 'string' || !DISAGREEMENT_CLASSES.includes(conflictKindHint)) {
    throw new FailClosedError(
      'DISAGREEMENT_CLASS_UNKNOWN',
      `conflict_kind_hint ${JSON.stringify(conflictKindHint)} is not a typed disagreement class (${DISAGREEMENT_CLASSES.join(', ')})`
    );
  }
  return conflictKindHint;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function validatePolicy(policy, disagreementClass) {
  if (policy === null || typeof policy !== 'object') {
    throw new FailClosedError('DISAGREEMENT_POLICY_INVALID', 'policy must be an object');
  }
  if (!isNonEmptyString(policy.policy_id) || !POLICY_ID_PATTERN.test(policy.policy_id)) {
    throw new FailClosedError('DISAGREEMENT_POLICY_INVALID', `policy.policy_id must match ${POLICY_ID_PATTERN}`);
  }
  if (policy.synthesizer_authority !== 'none') {
    throw new FailClosedError('SYNTHESIZER_AUTHORITY_FORBIDDEN', 'a disagreement policy must declare synthesizer_authority "none"');
  }
  const requiredActions = policy.required_actions;
  if (
    requiredActions === null ||
    typeof requiredActions !== 'object' ||
    Array.isArray(requiredActions) ||
    typeof requiredActions.independent_verification !== 'boolean' ||
    typeof requiredActions.evidence_review !== 'boolean' ||
    typeof requiredActions.human_gate !== 'boolean'
  ) {
    throw new FailClosedError('DISAGREEMENT_POLICY_INVALID', 'policy.required_actions must declare independent_verification, evidence_review, human_gate as booleans');
  }
  if (typeof policy.fail_closed !== 'boolean') {
    throw new FailClosedError('DISAGREEMENT_POLICY_INVALID', 'policy.fail_closed must be a boolean');
  }
  if (policy.disagreement_class !== disagreementClass) {
    throw new FailClosedError(
      'DISAGREEMENT_POLICY_MISMATCH',
      `policy ${policy.policy_id} governs class ${policy.disagreement_class}, cannot resolve a ${disagreementClass}`
    );
  }
}

function isTrue(value) {
  return value === true;
}

// resolveDisagreement({ disagreement_class, policy, evidence:
// {independent_verification_result, evidence_review_result}, human_decision,
// decided_at? }) -> DisagreementDecision-shaped output (schema-valid against
// core/contracts/disagreement-decision.schema.json).
//
// Evidence results count only when literally true; string values are opaque
// evidence references and are recorded in evidence_refs without ever
// satisfying a required action on their own.
export function resolveDisagreement({
  disagreement_class: disagreementClass,
  policy,
  evidence = {},
  human_decision: humanDecision = null,
  decided_at: decidedAt
} = {}) {
  if (typeof disagreementClass !== 'string' || !DISAGREEMENT_CLASSES.includes(disagreementClass)) {
    throw new FailClosedError('DISAGREEMENT_CLASS_UNKNOWN', `unknown disagreement class ${JSON.stringify(disagreementClass)}`);
  }
  validatePolicy(policy, disagreementClass);

  const independentVerification = isTrue(evidence.independent_verification_result);
  const evidenceReview = isTrue(evidence.evidence_review_result);
  const humanPresent = humanDecision === true || (humanDecision !== null && typeof humanDecision === 'object');
  const evidenceRefs = [evidence.independent_verification_result, evidence.evidence_review_result]
    .filter((value) => isNonEmptyString(value))
    .map((value) => value.trim());

  const failClosed = policy.fail_closed === true;
  const escalatedOrBlocked = () => ({
    outcome: failClosed ? 'BLOCKED' : 'ESCALATED',
    resolved_by: 'deterministic_policy'
  });

  let outcome;
  let resolvedBy;
  if (disagreementClass === 'authority_conflict') {
    // Never RESOLVED via runtime/synthesis: escalate to the human gate or block.
    if (humanPresent) {
      outcome = 'ESCALATED';
      resolvedBy = 'human_gate';
    } else {
      outcome = 'BLOCKED';
      resolvedBy = 'deterministic_policy';
    }
  } else if (disagreementClass === 'factual_conflict') {
    if (independentVerification || humanPresent) {
      outcome = 'RESOLVED';
      resolvedBy = humanPresent ? 'human_gate' : 'independent_verification';
    } else {
      ({ outcome, resolved_by: resolvedBy } = escalatedOrBlocked());
    }
  } else {
    const required = policy.required_actions;
    const satisfied =
      (!required.independent_verification || independentVerification) &&
      (!required.evidence_review || evidenceReview) &&
      (!required.human_gate || humanPresent);
    if (satisfied) {
      outcome = 'RESOLVED';
      // resolved_by names the strongest mechanism the policy actually
      // required and that fired; with no required actions the policy itself
      // resolved the disagreement deterministically.
      if (required.human_gate && humanPresent) {
        resolvedBy = 'human_gate';
      } else if (required.independent_verification && independentVerification) {
        resolvedBy = 'independent_verification';
      } else if (required.evidence_review && evidenceReview) {
        resolvedBy = 'evidence_review';
      } else {
        resolvedBy = 'deterministic_policy';
      }
    } else {
      ({ outcome, resolved_by: resolvedBy } = escalatedOrBlocked());
    }
  }

  return {
    decision_id: newId('dgd'),
    disagreement_class: disagreementClass,
    policy_ref: policy.policy_id,
    outcome,
    resolved_by: resolvedBy,
    synthesizer_independent_authority: false,
    evidence_refs: [...new Set(evidenceRefs)],
    decided_at: isNonEmptyString(decidedAt) ? decidedAt : nowIso()
  };
}
