// MAWS vNext — S4 stage 3 improvement classifier (MAWS-SII-TARGET-SPEC-001,
// PROPOSED).
//
// Spec 9 Stage 3 (Proposal) on top of the spec 8.4 reuse/extend/create gate.
// classifyImprovement is a PURE function over the available skill universe: it
// never touches the filesystem, never opens a network connection and never
// invents evidence. buildSkillUniverse is the only adapter that reads the
// repository; it enumerates the skill instruction files of all three
// instruction trees (core/skills/, skills/, .agents/skills/) through the
// canonical S2 instruction inventory and marks which of them are registered in
// core/contracts/portable-skill-manifest.json.
//
// Posture: the proposal is analysis output, never authority. It grants no
// permission, promotes no skill, activates no runtime path and changes no
// qualification state; authority_granted is false by construction.
//
// The skill universe gap is handled explicitly, not silently: a candidate that
// is a known skill instruction file but is not registered in the portable
// skill manifest is REJECTED with the reason NOT_IN_PORTABLE_SKILL_MANIFEST,
// so it can never be selected and never disappears unnoticed. Extending the
// manifest is an owner decision and is deliberately not done by this module.
import fs from 'node:fs';
import path from 'node:path';

import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { listInstructionSources } from '../instructions/instruction-inventory.mjs';

export const PROPOSAL_SCHEMA_VERSION = '1.0.0';
export const SKILL_UNIVERSE_REF = 'instruction_inventory@1.0.0';
export const PROPOSAL_CONTRACT = 'core/contracts/skill-improvement-proposal.schema.json';
export const PORTABLE_SKILL_MANIFEST = 'core/contracts/portable-skill-manifest.json';

// Spec 8.3: the error class determines the responsible improvement area. The
// mapping mirrors the closed mapping enforced by
// core/contracts/skill-improvement-proposal.schema.json.
export const RESPONSIBLE_AREA_BY_ERROR_CLASS = {
  SKILL_SELECTION_ERROR: 'routing',
  SKILL_INSTRUCTION_ERROR: 'skill',
  INSTRUCTION_CONFLICT: 'instruction',
  CONTEXT_SELECTION_ERROR: 'instruction',
  TOOL_CONTRACT_ERROR: 'tool_contract',
  EXECUTOR_BEHAVIOR_ERROR: 'runtime',
  VERIFICATION_GAP: 'validator',
  POLICY_ENFORCEMENT_ERROR: 'validator',
  EVIDENCE_GAP: 'validator',
  UNKNOWN_ROOT_CAUSE: null
};

// Areas whose cause is a matter of which skill applies. Only there can the
// §8.4 gate name an existing skill (REUSE); every other area owns its repair
// elsewhere, so the skill surface is not changed.
const SKILL_OR_ROUTING_AREAS = new Set(['skill', 'routing']);

const EVIDENCE_REF_PATTERN = /^(artifact|edge|eval|file|graph|operator|path|review|run|sandbox|session|ticket|url):\S.*$/;
const SKILL_PATH_PATTERN = /^(core\/skills|skills|\.agents\/skills)\/[A-Za-z0-9._-]+\/(SKILL\.md|[A-Za-z0-9._-]+\.skill\.yaml)$/;

// The S2 instruction inventory declares the three skill instruction trees by
// role. The tree is taken from that declaration, not guessed from the path,
// so the universe stays aligned with the canonical inventory.
const SKILL_TREE_BY_ROLE = {
  portable_skill_instruction: 'core/skills',
  shared_exported_skill_instruction: 'skills',
  local_skill_instruction: '.agents/skills'
};

// A reusable pattern must be proven by recurrence: one-off corrections do not
// justify a new skill (spec 8.4).
export const MIN_PATTERN_RECURRENCE = 2;

// Bound on the consulted candidate set. The proposal contract caps
// candidate_evaluation at the same number, so an oversized candidate set is
// rejected instead of being silently truncated.
export const MAX_CANDIDATES = 32;

function fail(code, message, details = {}) {
  throw new FailClosedError(code, message, details);
}

function assertEvidenceRef(ref) {
  if (typeof ref !== 'string' || !EVIDENCE_REF_PATTERN.test(ref)) {
    fail('EVIDENCE_REF_INVALID', `evidence ref must carry a closed source-kind scheme: ${String(ref)}`);
  }
  return ref;
}

function readFrontmatterFields(absPath) {
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return {};
  }
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---', 3);
  if (end === -1) return {};
  const fields = {};
  for (const line of content.slice(4, end).split('\n')) {
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

// buildSkillUniverse({ root }) ->
//   { universe_ref, universe_digest, skills: [{skill_id, path, tree,
//    instruction_file, description, manifest_registered}] }
//
// The universe is the complete skill instruction surface of the repository:
// the S2 instruction inventory enumerates all three declared skill trees, so a
// skill that is not listed in the portable skill manifest is present as a
// candidate and is rejected explicitly instead of being invisible.
export function buildSkillUniverse({ root }) {
  if (!root) {
    fail('SKILL_UNIVERSE_ROOT_REQUIRED', 'repository root is required to build the skill universe');
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, PORTABLE_SKILL_MANIFEST), 'utf8'));
  } catch (error) {
    fail('SKILL_MANIFEST_UNREADABLE', `portable skill manifest is not readable: ${error.message}`);
  }
  const manifestNames = new Set(
    (Array.isArray(manifest.skills) ? manifest.skills : []).map((entry) => entry && entry.name).filter(Boolean)
  );

  const skills = [];
  for (const source of listInstructionSources(root)) {
    const tree = SKILL_TREE_BY_ROLE[source.role];
    if (!tree) continue;
    const parts = source.path.split('/');
    if (parts.length < 3) continue;
    const skillId = parts[parts.length - 2];
    const instructionFile = parts[parts.length - 1];
    const frontmatter = readFrontmatterFields(path.join(root, source.path));
    skills.push({
      skill_id: skillId,
      path: source.path,
      tree,
      instruction_file: instructionFile,
      description: frontmatter.description || null,
      manifest_registered: manifestNames.has(frontmatter.name) || manifestNames.has(skillId)
    });
  }
  skills.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  const universeDigest = sha256Hex(canonicalJson(
    skills.map((skill) => ({
      path: skill.path,
      skill_id: skill.skill_id,
      manifest_registered: skill.manifest_registered
    }))
  ));

  return {
    universe_ref: SKILL_UNIVERSE_REF,
    universe_digest: universeDigest,
    skills
  };
}

function resolveCandidates({ coverage_evidence, skill_universe }) {
  if (coverage_evidence.length > MAX_CANDIDATES) {
    fail(
      'COVERAGE_EVIDENCE_TOO_MANY',
      `the candidate set is not bounded: ${coverage_evidence.length} candidates exceed the bound of ${MAX_CANDIDATES}`
    );
  }
  const universeByPath = new Map(skill_universe.skills.map((skill) => [skill.path, skill]));
  const considered = [];
  const rejected = [];
  const accepted = [];

  for (const entry of coverage_evidence) {
    if (!entry || typeof entry !== 'object') {
      fail('COVERAGE_EVIDENCE_INVALID', 'a coverage evidence entry must be an object');
    }
    const ref = entry.skill_ref;
    if (typeof ref !== 'string' || !SKILL_PATH_PATTERN.test(ref)) {
      fail('COVERAGE_SKILL_REF_INVALID', `coverage candidate is not a skill instruction path: ${String(ref)}`);
    }
    if (entry.relation !== 'covers' && entry.relation !== 'extendable') {
      fail('COVERAGE_RELATION_INVALID', `coverage relation must be covers or extendable: ${String(entry.relation)}`);
    }
    considered.push(ref);

    const skill = universeByPath.get(ref);
    if (!skill) {
      rejected.push({ candidate_ref: ref, reason: 'NOT_IN_SKILL_UNIVERSE' });
      continue;
    }
    if (!skill.manifest_registered) {
      // The manifest gap is recorded, not hidden: the candidate exists as an
      // instruction file but is not registered in the portable skill manifest,
      // so it is not eligible as a proposal target.
      rejected.push({ candidate_ref: ref, reason: 'NOT_IN_PORTABLE_SKILL_MANIFEST' });
      continue;
    }
    if (!Array.isArray(entry.evidence_refs) || entry.evidence_refs.length === 0) {
      rejected.push({ candidate_ref: ref, reason: 'NO_COVERAGE_EVIDENCE' });
      continue;
    }
    accepted.push({ skill_ref: ref, relation: entry.relation, evidence_refs: entry.evidence_refs.map((ref2) => assertEvidenceRef(ref2)) });
  }

  accepted.sort((left, right) => (left.skill_ref < right.skill_ref ? -1 : left.skill_ref > right.skill_ref ? 1 : 0));
  return {
    considered: [...new Set(considered)].sort(),
    rejected,
    accepted
  };
}

// classifyImprovement({ diagnosis, feedback, skill_universe, coverage_evidence,
// pattern_evidence, new_skill_ref, now }) -> proposal record
//
// Pure. The §8.4 gate order is: existing skill sufficient (REUSE), existing
// skill extendable (EXTEND_SKILL), reusable pattern proven (CREATE_SKILL),
// otherwise no new skill (NO_CHANGE). Missing evidence is blocking
// (NEEDS_MORE_EVIDENCE) and never produces a guessed cause.
export function classifyImprovement({
  diagnosis,
  feedback,
  skill_universe,
  coverage_evidence = [],
  pattern_evidence = null,
  new_skill_ref = null,
  now = new Date().toISOString()
}) {
  if (!diagnosis || typeof diagnosis !== 'object') {
    fail('DIAGNOSIS_REQUIRED', 'a stage-2 diagnosis is required: a proposal without a diagnosis has no proven cause');
  }
  if (!Object.prototype.hasOwnProperty.call(RESPONSIBLE_AREA_BY_ERROR_CLASS, diagnosis.error_class)) {
    fail('DIAGNOSIS_ERROR_CLASS_INVALID', `diagnosis error class outside the closed spec 8.3 taxonomy: ${String(diagnosis.error_class)}`);
  }
  if (!Array.isArray(diagnosis.evidence_refs) || diagnosis.evidence_refs.length === 0) {
    fail('DIAGNOSIS_EVIDENCE_MISSING', 'the diagnosis carries no evidence ref: a proposal without evidence would be a guess');
  }
  if (!['low', 'medium', 'high'].includes(diagnosis.confidence)) {
    fail('DIAGNOSIS_CONFIDENCE_INVALID', `diagnosis confidence outside the closed vocabulary: ${String(diagnosis.confidence)}`);
  }
  if (!skill_universe || !Array.isArray(skill_universe.skills) || skill_universe.skills.length === 0) {
    fail('SKILL_UNIVERSE_EMPTY', 'the skill universe is empty: the reuse/extend/create gate cannot decide without candidates');
  }
  if (!feedback || typeof feedback !== 'object' || typeof feedback.feedback_id !== 'string') {
    fail('FEEDBACK_RECORD_REQUIRED', 'the bound S1 feedback record is required');
  }
  if (feedback.schema_version !== '1.0.0') {
    fail('FEEDBACK_SCHEMA_VERSION_UNSUPPORTED', `unsupported feedback schema version: ${String(feedback.schema_version)}`);
  }
  if (diagnosis.schema_version !== '1.0.0') {
    fail('DIAGNOSIS_SCHEMA_VERSION_UNSUPPORTED', `unsupported diagnosis schema version: ${String(diagnosis.schema_version)}`);
  }
  if (typeof skill_universe.universe_digest !== 'string' || !/^[0-9a-f]{64}$/.test(skill_universe.universe_digest)) {
    fail('SKILL_UNIVERSE_DIGEST_MISSING', 'the consulted skill universe carries no digest: the consulted universe would not be reconstructable');
  }
  if (diagnosis.feedback_ref && diagnosis.feedback_ref.feedback_id !== feedback.feedback_id) {
    fail('FEEDBACK_BINDING_MISMATCH', 'the diagnosis does not describe the bound feedback record');
  }

  const errorClass = diagnosis.error_class;
  const responsibleArea = RESPONSIBLE_AREA_BY_ERROR_CLASS[errorClass];
  const { considered, rejected, accepted } = resolveCandidates({ coverage_evidence, skill_universe });

  const covers = accepted.filter((candidate) => candidate.relation === 'covers');
  const extendable = accepted.filter((candidate) => candidate.relation === 'extendable');

  const patternProven = Boolean(
    pattern_evidence
    && Number.isInteger(pattern_evidence.recurrence_count)
    && pattern_evidence.recurrence_count >= MIN_PATTERN_RECURRENCE
    && Array.isArray(pattern_evidence.evidence_refs)
    && pattern_evidence.evidence_refs.length > 0
  );

  const checks = diagnosis.checks && typeof diagnosis.checks === 'object' ? diagnosis.checks : {};
  const insufficient = diagnosis.confidence === 'low' || checks.deviation_reproducible === false;

  let decision;
  let targetSkillRef = null;
  let changeScope;
  let requiresOwnerReview;

  if (insufficient) {
    // Fail closed: without proven evidence the gate stops. No cause is guessed
    // and no skill is named.
    decision = 'NEEDS_MORE_EVIDENCE';
    changeScope = {
      surface: 'none',
      summary: 'the available evidence does not prove a cause, so no skill improvement is proposed and no cause is guessed',
      paths: []
    };
    requiresOwnerReview = true;
  } else if ((responsibleArea === 'skill' || responsibleArea === 'routing') && covers.length > 0) {
    decision = 'REUSE';
    targetSkillRef = covers[0].skill_ref;
    changeScope = {
      surface: 'none',
      summary: `existing skill ${targetSkillRef} already covers the diagnosed case; the skill surface is not changed`,
      paths: []
    };
    requiresOwnerReview = false;
  } else if (responsibleArea === 'skill' && extendable.length > 0) {
    decision = 'EXTEND_SKILL';
    targetSkillRef = extendable[0].skill_ref;
    changeScope = {
      surface: 'skill_instruction_file',
      summary: `extend ${targetSkillRef} with the proven instruction gap of the diagnosed case`,
      paths: [targetSkillRef]
    };
    requiresOwnerReview = true;
  } else if (responsibleArea === 'skill' && patternProven && newSkillRefIsUsable(new_skill_ref)) {
    decision = 'CREATE_SKILL';
    changeScope = {
      surface: 'skill_instruction_file',
      summary: boundedSummary(
        `create a new skill instruction file for the proven recurring pattern behind ${diagnosis.inferred_cause || 'the diagnosed case'}`
      ),
      paths: [new_skill_ref]
    };
    requiresOwnerReview = true;
  } else if (responsibleArea === 'skill' && patternProven) {
    // A proven recurring pattern without a bounded target path cannot be
    // scoped, so the proposal stops instead of guessing a file name.
    decision = 'NEEDS_MORE_EVIDENCE';
    changeScope = {
      surface: 'none',
      summary: 'a recurring pattern is proven but no bounded target instruction file is proposed, so no change scope can be stated',
      paths: []
    };
    requiresOwnerReview = true;
  } else {
    decision = 'NO_CHANGE';
    changeScope = {
      surface: 'none',
      summary: responsibleArea === null
        ? 'no cause is attributed to any surface, so no skill change is proposed'
        : `the demonstrated cause belongs to the ${responsibleArea} surface, not to the skill surface, so no skill change is proposed`,
      paths: []
    };
    requiresOwnerReview = false;
  }

  if (errorClass === 'UNKNOWN_ROOT_CAUSE') {
    requiresOwnerReview = true;
  }

  const evidenceRefs = [...new Set([
    ...diagnosis.evidence_refs.map((ref) => assertEvidenceRef(ref)),
    ...(Array.isArray(feedback.evidence_refs) ? feedback.evidence_refs.map((ref) => assertEvidenceRef(ref)) : []),
    ...accepted.flatMap((candidate) => candidate.evidence_refs),
    ...(patternProven ? pattern_evidence.evidence_refs.map((ref) => assertEvidenceRef(ref)) : [])
  ])].sort();

  const proposal = {
    schema_version: PROPOSAL_SCHEMA_VERSION,
    proposal_id: '',
    created_at: now,
    feedback_ref: {
      feedback_id: feedback.feedback_id,
      feedback_schema_version: feedback.schema_version,
      source_ref: diagnosis.feedback_ref ? diagnosis.feedback_ref.source_ref : feedback.evidence_refs[0]
    },
    diagnosis_ref: {
      diagnosis_id: diagnosis.diagnosis_id,
      diagnosis_schema_version: diagnosis.schema_version
    },
    error_class: errorClass,
    responsible_area: responsibleArea,
    decision,
    inferred_cause: errorClass === 'UNKNOWN_ROOT_CAUSE' ? null : (diagnosis.inferred_cause || null),
    change_scope: changeScope,
    evidence_refs: evidenceRefs,
    candidate_evaluation: {
      universe_ref: skill_universe.universe_ref || SKILL_UNIVERSE_REF,
      universe_digest: skill_universe.universe_digest,
      candidates_considered: considered,
      rejected_candidates: rejected
    },
    requires_owner_review: requiresOwnerReview,
    authority_granted: false
  };

  if (targetSkillRef !== null) {
    proposal.target_skill_ref = targetSkillRef;
  }

  proposal.proposal_id = `sip_${sha256Hex(canonicalJson({
    feedback_id: feedback.feedback_id,
    diagnosis_id: diagnosis.diagnosis_id,
    decision: proposal.decision,
    target_skill_ref: proposal.target_skill_ref || null,
    change_scope: proposal.change_scope
  })).slice(0, 16)}`;

  return proposal;
}

function newSkillRefIsUsable(newSkillRef) {
  if (typeof newSkillRef !== 'string' || newSkillRef.length === 0) return false;
  if (!/^[A-Za-z0-9._][A-Za-z0-9._/-]*$/.test(newSkillRef)) return false;
  return true;
}

// The change scope summary is bounded by the contract. A cause statement that
// would push the summary past the bound is shortened, never dropped.
function boundedSummary(summary) {
  const limit = 500;
  if (summary.length <= limit) return summary;
  return `${summary.slice(0, limit - 3)}...`;
}
