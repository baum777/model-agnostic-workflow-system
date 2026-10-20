// MAWS vNext — S4 stage 2 feedback analyzer (MAWS-SII-TARGET-SPEC-001, PROPOSED).
//
// Spec 9 Stage 2 (Diagnose). The analyzer consumes a validated S1 feedback
// record plus run/skill/executor evidence and emits the primary spec 8.3 error
// class, an evidence-anchored inferred cause and a confidence value.
//
// Posture: the diagnosis is analysis output, never authority. It grants no
// permission, promotes no skill, activates no runtime path and changes no
// qualification state. It never guesses: when the cause cannot be attributed
// the error class stays UNKNOWN_ROOT_CAUSE, the inferred cause is null and
// owner review is forced.
//
// The diagnosis record is a runtime record, not a registered contract. S4
// registers exactly one new contract (core/contracts/skill-improvement-proposal.schema.json);
// a diagnosis contract is deliberately out of this slice's scope.
import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

export const DIAGNOSIS_SCHEMA_VERSION = '1.0.0';
export const FEEDBACK_CONTRACT = 'core/contracts/skill-feedback.schema.json';

// Closed spec 8.3 error-class taxonomy (identical to the S1 contract).
export const ERROR_CLASSES = [
  'SKILL_SELECTION_ERROR',
  'SKILL_INSTRUCTION_ERROR',
  'INSTRUCTION_CONFLICT',
  'CONTEXT_SELECTION_ERROR',
  'TOOL_CONTRACT_ERROR',
  'EXECUTOR_BEHAVIOR_ERROR',
  'VERIFICATION_GAP',
  'POLICY_ENFORCEMENT_ERROR',
  'EVIDENCE_GAP',
  'UNKNOWN_ROOT_CAUSE'
];

// Closed cause-location vocabulary of the spec 9 Stage-2 checklist ("Liegt die
// Ursache im Modell, Skill, Tool, Harness oder Validator?").
export const ATTRIBUTIONS = ['model', 'skill', 'tool', 'harness', 'validator', 'unattributed'];

// Closed evidence source-kind scheme (identical to the S1 contract): model
// self-report has no scheme and therefore can never appear as evidence.
const EVIDENCE_REF_PATTERN = /^(artifact|edge|eval|file|graph|operator|path|review|run|sandbox|session|ticket|url):\S.*$/;

function isBooleanOrNull(value) {
  return value === null || typeof value === 'boolean';
}

function fail(code, message, details = {}) {
  throw new FailClosedError(code, message, details);
}

function assertEvidenceRef(ref) {
  if (typeof ref !== 'string' || !EVIDENCE_REF_PATTERN.test(ref)) {
    fail(
      'EVIDENCE_REF_INVALID',
      `evidence ref must carry a closed source-kind scheme: ${String(ref)}`
    );
  }
  return ref;
}

// The cause location proven by the run/skill/executor evidence, mapped onto the
// spec 8.3 primary error class. `skill` is resolved through the Stage-2 checks
// because the spec distinguishes selection, instruction and context failures.
function classFromAttribution(attribution) {
  switch (attribution) {
    case 'tool':
      return 'TOOL_CONTRACT_ERROR';
    case 'harness':
    case 'model':
      return 'EXECUTOR_BEHAVIOR_ERROR';
    case 'validator':
      return 'VERIFICATION_GAP';
    default:
      return null;
  }
}

function classFromChecks(checks) {
  if (checks.skill_active === false) return 'SKILL_SELECTION_ERROR';
  if (checks.instruction_loaded === false) return 'SKILL_INSTRUCTION_ERROR';
  if (checks.context_present === false) return 'CONTEXT_SELECTION_ERROR';
  if (checks.reproducible === false) return 'EVIDENCE_GAP';
  return null;
}

function causeStatement(errorClass, attribution) {
  switch (errorClass) {
    case 'TOOL_CONTRACT_ERROR':
      return 'the demonstrated cause lies in the tool contract, not in the skill surface';
    case 'EXECUTOR_BEHAVIOR_ERROR':
      return attribution === 'model'
        ? 'the demonstrated cause lies in the executing model, not in the skill surface'
        : 'the demonstrated cause lies in the execution runtime or harness, not in the skill surface';
    case 'VERIFICATION_GAP':
      return 'the demonstrated cause lies in the verification surface, not in the skill surface';
    case 'SKILL_SELECTION_ERROR':
      return 'the active skill did not cover the task';
    case 'SKILL_INSTRUCTION_ERROR':
      return 'the required skill instruction was missing or wrong';
    case 'CONTEXT_SELECTION_ERROR':
      return 'the required context was not present';
    case 'EVIDENCE_GAP':
      return 'the deviation could not be reproduced from the available evidence';
    case 'INSTRUCTION_CONFLICT':
      return 'conflicting instruction sources were loaded for the task';
    case 'POLICY_ENFORCEMENT_ERROR':
      return 'the policy enforcement surface did not hold';
    default:
      return null;
  }
}

// A class that is carried forward from the captured feedback record was not
// re-derived from run evidence. The cause statement says so instead of
// restating the capture as a fresh finding.
function carriedCauseStatement(errorClass) {
  const statement = causeStatement(errorClass, null);
  if (!statement) return null;
  return `carried forward from the captured feedback record without contradicting run evidence: ${statement}`;
}

function deriveConfidence(facts, attribution) {
  const attributed = typeof attribution === 'string' && attribution !== 'unattributed';
  if (attributed && facts.reproducible === true) return 'high';
  if (attributed) return 'medium';
  if (classFromChecks(facts) !== null) return 'medium';
  return 'low';
}

// deriveDiagnosis({ feedback, evidence, now }) -> diagnosis record.
//
// Pure: no filesystem, no network, no clock of its own (the timestamp is
// injected). The feedback record must already satisfy the S1 contract; use
// analyzeFeedback for the fail-closed validating entrypoint.
export function deriveDiagnosis({ feedback, evidence = {}, now }) {
  if (!feedback || typeof feedback !== 'object') {
    fail('FEEDBACK_RECORD_REQUIRED', 'a feedback record is required: a diagnosis without a captured finding is not reconstructable');
  }
  if (!Array.isArray(feedback.evidence_refs) || feedback.evidence_refs.length === 0) {
    fail(
      'FEEDBACK_EVIDENCE_MISSING',
      'the feedback record carries no evidence ref: a diagnosis without evidence would be a guess'
    );
  }
  if (feedback.schema_version !== '1.0.0') {
    fail('FEEDBACK_SCHEMA_VERSION_UNSUPPORTED', `unsupported feedback schema version: ${String(feedback.schema_version)}`);
  }
  if (!ERROR_CLASSES.includes(feedback.error_class)) {
    fail('FEEDBACK_ERROR_CLASS_INVALID', `feedback error class outside the closed spec 8.3 taxonomy: ${String(feedback.error_class)}`);
  }
  if (typeof now !== 'string' || now.length === 0) {
    fail('DIAGNOSIS_TIMESTAMP_REQUIRED', 'a diagnosis must carry an injected creation timestamp');
  }

  const attribution = evidence.attribution === undefined ? null : evidence.attribution;
  if (attribution !== null && !ATTRIBUTIONS.includes(attribution)) {
    fail('DIAGNOSIS_ATTRIBUTION_INVALID', `cause attribution outside the closed vocabulary: ${String(attribution)}`);
  }

  const facts = {
    skill_active: evidence.skill_active === undefined ? null : evidence.skill_active,
    instruction_loaded: evidence.instruction_loaded === undefined ? null : evidence.instruction_loaded,
    context_present: evidence.context_present === undefined ? null : evidence.context_present,
    reproducible: evidence.reproducible === undefined ? null : evidence.reproducible
  };
  for (const [key, value] of Object.entries(facts)) {
    if (!isBooleanOrNull(value)) {
      fail('DIAGNOSIS_CHECK_INVALID', `evidence check ${key} must be a boolean or null`);
    }
  }
  const checks = {
    right_skill_active: facts.skill_active,
    right_instruction_loaded: facts.instruction_loaded,
    required_context_present: facts.context_present,
    deviation_reproducible: facts.reproducible,
    cause_attribution: attribution
  };

  // Precedence: a proven cause location wins over the captured class, the
  // Stage-2 checks win over an unproven capture, and the captured class is the
  // last resort. The analyzer never invents a class it cannot point at.
  let errorClass = null;
  let causeOwner = attribution;
  let carriedForward = false;
  if (attribution && attribution !== 'unattributed') {
    errorClass = classFromAttribution(attribution);
    if (!errorClass) {
      // attribution === 'skill': resolve through the Stage-2 checks.
      errorClass = classFromChecks(facts) || 'SKILL_INSTRUCTION_ERROR';
    }
  } else {
    const checkedClass = classFromChecks(facts);
    errorClass = checkedClass || feedback.error_class;
    if (!checkedClass) {
      carriedForward = true;
      causeOwner = attribution || 'unattributed';
    } else {
      causeOwner = 'unattributed';
    }
  }

  const confidence = deriveConfidence(facts, carriedForward ? null : causeOwner);
  const inferredCause = errorClass === 'UNKNOWN_ROOT_CAUSE'
    ? null
    : carriedForward
      ? carriedCauseStatement(errorClass)
      : causeStatement(errorClass, causeOwner);

  const evidenceRefs = [...new Set([
    ...feedback.evidence_refs.map((ref) => assertEvidenceRef(ref)),
    ...(Array.isArray(evidence.refs) ? evidence.refs.map((ref) => assertEvidenceRef(ref)) : [])
  ])].sort();

  const requiresOwnerReview = errorClass === 'UNKNOWN_ROOT_CAUSE';

  const diagnosisId = `dg_${sha256Hex(canonicalJson({
    feedback_id: feedback.feedback_id,
    error_class: errorClass,
    inferred_cause: inferredCause,
    evidence_refs: evidenceRefs
  })).slice(0, 16)}`;

  return {
    schema_version: DIAGNOSIS_SCHEMA_VERSION,
    diagnosis_id: diagnosisId,
    created_at: now,
    feedback_ref: {
      feedback_id: feedback.feedback_id,
      feedback_schema_version: feedback.schema_version,
      source_ref: feedback.evidence_refs[0]
    },
    error_class: errorClass,
    inferred_cause: inferredCause,
    confidence,
    requires_owner_review: requiresOwnerReview,
    checks,
    evidence_refs: evidenceRefs,
    authority_granted: false
  };
}

// analyzeFeedback({ feedback, root, evidence, now }) -> diagnosis record.
//
// Fail-closed entrypoint: the feedback record is validated against the
// canonical S1 contract before it is analysed, so a malformed or unsupported
// record can never reach a diagnosis.
export function analyzeFeedback({ feedback, root, evidence = {}, now = new Date().toISOString() }) {
  if (!root) {
    fail('DIAGNOSIS_ROOT_REQUIRED', 'repository root is required for feedback contract validation');
  }
  const issues = validateInstanceAgainstContract(feedback, FEEDBACK_CONTRACT, root);
  if (issues.length > 0) {
    fail('FEEDBACK_CONTRACT_INVALID', 'feedback record does not satisfy the canonical S1 contract', { issues });
  }
  return deriveDiagnosis({ feedback, evidence, now });
}
