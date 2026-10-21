// MAWS vNext — DSI skill selector.
//
// Given a request fingerprint and the available skill registry snapshot, the
// selector produces a DETERMINISTIC ordered candidate list and one selection
// (or one typed refusal).
//
// Determinism is a hard requirement. The same inputs always yield the same
// ordering and the same selection:
//   - no wall clock enters the comparison (the timestamp is an injected
//     evidence field and is not part of the ordering or of the selection id);
//   - no randomness enters the comparison;
//   - no filesystem order enters the comparison (every list is sorted by a
//     stable key before it is used);
//   - the comparison itself is a total order, so a tie is impossible: the
//     last key of the rule is the ascending skill id.
//
// The ordering rule (one rule, named in the contract):
//   CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC
//   1. context footprint ascending — among the candidates that fully satisfy
//      the request, the skill that demands the least from the caller wins;
//   2. skill id ascending — the explicit, documented tie-break that makes the
//      order total and the selection unique.
//
// Fail-closed posture: when no eligible candidate can satisfy the request the
// selector REFUSES with a typed refusal code. It never falls back to "no
// skill", and it never guesses a candidate.
//
// Posture: a selection is not authority. Selecting a skill grants no
// permission, promotes no skill, changes no qualification state and activates
// no runtime path; the activation decision stays with the caller.
import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { loadSkill, findSkillInSnapshot } from './skill-registry-loader.mjs';

export const SELECTION_SCHEMA_VERSION = '1.0.0';
export const SELECTION_CONTRACT = 'core/contracts/skill-selection.schema.json';
export const SNAPSHOT_REF = 'skill_registry_snapshot@1.0.0';
export const ORDERING_RULE = 'CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC';

// Closed refusal vocabulary. A refusal is always one of these two codes.
export const REFUSAL_CODES = ['EMPTY_CANDIDATE_SET', 'NO_ELIGIBLE_CANDIDATE'];

// Closed eligibility vocabulary. The first five are the loader's denial
// codes; the last one is the selector's own rejection.
export const ELIGIBILITY_REASONS = [
  'ELIGIBLE',
  'SKILL_NOT_FOUND',
  'SKILL_DIGEST_MISMATCH',
  'SKILL_STATE_NOT_ALLOWED',
  'SKILL_CAPABILITY_MISSING',
  'REQUIRED_CAPABILITY_NOT_PROVIDED'
];

const REQUEST_ID_PATTERN = /^req_[a-z0-9_]+$/;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;

function fail(code, message, details = {}) {
  throw new FailClosedError(code, message, details);
}

function assertRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    fail('SELECTION_REQUEST_REQUIRED', 'a selection request is required');
  }
  if (typeof request.request_id !== 'string' || !REQUEST_ID_PATTERN.test(request.request_id)) {
    fail('SELECTION_REQUEST_ID_INVALID', `request id outside the canonical shape: ${String(request.request_id)}`);
  }
  if (typeof request.intent_fingerprint !== 'string' || !HEX64_PATTERN.test(request.intent_fingerprint)) {
    fail('SELECTION_INTENT_FINGERPRINT_INVALID', 'the request intent fingerprint must be a sha256 hex digest');
  }
  if (typeof request.scope !== 'string' || request.scope.length === 0) {
    fail('SELECTION_SCOPE_REQUIRED', 'the request must name the scope it belongs to');
  }
  if (!Array.isArray(request.required_capabilities)) {
    fail('SELECTION_REQUIRED_CAPABILITIES_INVALID', 'required_capabilities must be an array');
  }
  for (const capabilityId of request.required_capabilities) {
    if (typeof capabilityId !== 'string' || !/^cap_[a-z0-9_]+$/.test(capabilityId)) {
      fail('SELECTION_REQUIRED_CAPABILITIES_INVALID', `required capability outside the canonical shape: ${String(capabilityId)}`);
    }
  }
}

// computeRequestDigest(request) -> sha256 hex
//
// The digest is recomputed over the request fields, so a decision can never be
// attributed to a request it was not made for.
export function computeRequestDigest(request) {
  assertRequest(request);
  return sha256Hex(canonicalJson({
    request_id: request.request_id,
    intent_fingerprint: request.intent_fingerprint,
    scope: request.scope,
    required_capabilities: [...request.required_capabilities].sort()
  }));
}

// deriveScopeCandidates({ snapshot, scope }) -> [{ skill_id, expected_digest }]
//
// The default candidate set: every skill the registry snapshot registers as
// ACTIVE for the request's scope. The result is sorted by skill id, so the
// candidate set never depends on the order of the snapshot.
export function deriveScopeCandidates({ snapshot, scope }) {
  if (!snapshot || !Array.isArray(snapshot.skills)) {
    fail('SKILL_REGISTRY_SNAPSHOT_INVALID', 'the skill registry snapshot is missing or malformed');
  }
  if (typeof scope !== 'string' || scope.length === 0) {
    fail('SELECTION_SCOPE_REQUIRED', 'the request must name the scope it belongs to');
  }
  const candidates = snapshot.skills
    .filter((skill) => skill.scope_states && skill.scope_states[scope] === 'ACTIVE')
    .map((skill) => ({ skill_id: skill.skill_id, expected_digest: null }))
    .sort((left, right) => (left.skill_id < right.skill_id ? -1 : left.skill_id > right.skill_id ? 1 : 0));
  return candidates;
}

function normalizeCandidates(candidates) {
  return candidates.map((entry) => {
    if (typeof entry === 'string') {
      return { skill_id: entry, expected_digest: null };
    }
    if (!entry || typeof entry !== 'object' || typeof entry.skill_id !== 'string') {
      fail('SELECTION_CANDIDATE_INVALID', 'a candidate must be a skill id or an object carrying a skill id');
    }
    const expectedDigest = entry.expected_digest === undefined ? null : entry.expected_digest;
    if (expectedDigest !== null && (typeof expectedDigest !== 'string' || !HEX64_PATTERN.test(expectedDigest))) {
      fail('SELECTION_CANDIDATE_INVALID', 'a candidate expected digest must be a sha256 hex digest');
    }
    return { skill_id: entry.skill_id, expected_digest: expectedDigest };
  });
}

// The comparison behind ORDERING_RULE. It is a total order over the eligible
// candidates: the footprint is a number, and the skill id is unique, so no two
// distinct candidates can compare equal.
function compareEligible(left, right) {
  const leftFootprint = left.skill.requires_capabilities.length;
  const rightFootprint = right.skill.requires_capabilities.length;
  if (leftFootprint !== rightFootprint) return leftFootprint - rightFootprint;
  if (left.skill.skill_id < right.skill.skill_id) return -1;
  if (left.skill.skill_id > right.skill.skill_id) return 1;
  return 0;
}

// selectSkill({ request, registry_snapshot, candidates, context, now })
//   -> the selection record (core/contracts/skill-selection.schema.json)
//
// `candidates` is optional: when it is absent the candidate set is derived
// from the request scope. When it is given it is the evaluated candidate set.
export function selectSkill({ request, registry_snapshot, candidates = null, context = {}, now = new Date().toISOString() }) {
  assertRequest(request);
  if (!registry_snapshot || !Array.isArray(registry_snapshot.skills)) {
    fail('SKILL_REGISTRY_SNAPSHOT_INVALID', 'the skill registry snapshot is missing or malformed');
  }
  if (typeof registry_snapshot.snapshot_digest !== 'string' || !HEX64_PATTERN.test(registry_snapshot.snapshot_digest)) {
    fail('SKILL_REGISTRY_SNAPSHOT_INVALID', 'the skill registry snapshot carries no digest: the decision would not be bound to a registry state');
  }

  const requestDigest = computeRequestDigest(request);
  const evaluated = candidates === null || candidates === undefined
    ? deriveScopeCandidates({ snapshot: registry_snapshot, scope: request.scope })
    : normalizeCandidates(candidates);

  const candidateRecords = [];
  const eligibility = [];
  const eligible = [];

  for (const candidate of evaluated) {
    const loaded = loadSkill({
      snapshot: registry_snapshot,
      skill_id: candidate.skill_id,
      expected_digest: candidate.expected_digest,
      scope: request.scope,
      context
    });

    if (loaded.outcome === 'DENIED') {
      // A candidate that could not even be resolved has no digest to record,
      // so it stays visible in the eligibility list only.
      eligibility.push({ skill_id: candidate.skill_id, verdict: 'INELIGIBLE', reason: loaded.denial.code });
      continue;
    }

    const skill = loaded.skill;
    candidateRecords.push({
      skill_id: skill.skill_id,
      skill_path: skill.skill_path,
      digest: skill.digest
    });

    const provided = new Set(skill.provides_capabilities || []);
    const missing = request.required_capabilities.filter((capabilityId) => !provided.has(capabilityId));
    if (missing.length > 0) {
      eligibility.push({
        skill_id: skill.skill_id,
        verdict: 'INELIGIBLE',
        reason: 'REQUIRED_CAPABILITY_NOT_PROVIDED'
      });
      continue;
    }

    eligibility.push({ skill_id: skill.skill_id, verdict: 'ELIGIBLE', reason: 'ELIGIBLE' });
    eligible.push({ skill });
  }

  eligible.sort(compareEligible);
  const orderedCandidateIds = eligible.map((entry) => entry.skill.skill_id);
  const orderingKey = sha256Hex(canonicalJson({ rule: ORDERING_RULE, ordered_candidate_ids: orderedCandidateIds }));

  let outcome;
  let selection = null;
  let refusal = null;

  if (evaluated.length === 0) {
    outcome = 'REFUSED';
    refusal = {
      code: 'EMPTY_CANDIDATE_SET',
      reason: 'the candidate set is empty: no skill could even be considered for the request'
    };
  } else if (eligible.length === 0) {
    outcome = 'REFUSED';
    refusal = {
      code: 'NO_ELIGIBLE_CANDIDATE',
      reason: 'no candidate passed the eligibility gate: the request cannot be satisfied by the current registry snapshot'
    };
  } else {
    outcome = 'SELECTED';
    const chosen = eligible[0].skill;
    selection = {
      skill_id: chosen.skill_id,
      skill_path: chosen.skill_path,
      digest: chosen.digest,
      rank: 1
    };
  }

  const evidenceDigest = sha256Hex(canonicalJson({
    request_digest: requestDigest,
    registry_snapshot_digest: registry_snapshot.snapshot_digest,
    ordering_key: orderingKey,
    outcome,
    selected_skill_id: selection ? selection.skill_id : null,
    refusal_code: refusal ? refusal.code : null
  }));

  const selectionId = `sel_${sha256Hex(canonicalJson({
    request_digest: requestDigest,
    registry_snapshot_digest: registry_snapshot.snapshot_digest,
    ordering_key: orderingKey,
    outcome,
    selected_skill_id: selection ? selection.skill_id : null
  })).slice(0, 16)}`;

  return {
    schema_version: SELECTION_SCHEMA_VERSION,
    selection_id: selectionId,
    created_at: now,
    request: {
      request_id: request.request_id,
      intent_fingerprint: request.intent_fingerprint,
      scope: request.scope,
      required_capabilities: [...request.required_capabilities].sort(),
      request_digest: requestDigest
    },
    registry_snapshot: {
      snapshot_ref: SNAPSHOT_REF,
      snapshot_digest: registry_snapshot.snapshot_digest,
      skill_count: registry_snapshot.skills.length
    },
    candidates: candidateRecords,
    eligibility,
    outcome,
    selection,
    refusal,
    ordering_key: {
      rule: ORDERING_RULE,
      ordered_candidate_ids: orderedCandidateIds,
      key: orderingKey
    },
    evidence_digest: evidenceDigest,
    authority_granted: false
  };
}

// The skill the selection named, resolved against the same snapshot. Fails
// closed when the record names no skill.
export function resolveSelectedSkill({ selection_record, registry_snapshot }) {
  if (!selection_record || selection_record.outcome !== 'SELECTED' || !selection_record.selection) {
    fail('SELECTION_NOT_RESOLVED', 'the selection record names no skill');
  }
  const skill = findSkillInSnapshot(registry_snapshot, selection_record.selection.skill_id);
  if (!skill) {
    fail('SKILL_NOT_FOUND', `the selected skill is not part of the registry snapshot: ${selection_record.selection.skill_id}`);
  }
  if (skill.digest !== selection_record.selection.digest) {
    fail('SKILL_DIGEST_MISMATCH', `the selected skill digest drifted: ${selection_record.selection.skill_id}`);
  }
  return skill;
}
