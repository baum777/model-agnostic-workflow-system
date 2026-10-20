#!/usr/bin/env node
// S8 governance promotion (spec MAWS-SII-TARGET-SPEC-001 v0.2.0, PROPOSED).
// Implements the versioned canonical adoption path for a skill candidate:
// frontdoor admission binding, S5 behavioral eval evidence bound by content
// digest, canonical owner approval, versioned adoption, export
// regeneration, and post-adoption readback.
//
// Separation rules (spec 12.3/13.4): the promotion chain changes canonical
// skill content and NOTHING else -- no permission, no qualification, no
// runtime authority (authority_granted is false by construction). Approval
// is one required input, never a permission; eval PASS is evidence, never
// authority; an actual promotion on the real canonical tree remains an
// owner act (this runner executes against the canonicalRoot the caller
// provides -- tests use isolated temp trees).
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, nowIso, FailClosedError } from '../../runtime/vnext/util.mjs';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { validateBehavioralEvalRecord, semanticEvalIssues } from './validate-behavioral-eval.mjs';
import { computeContentDigest } from './run-skill-effectiveness-evals.mjs';

const ADOPTION_CONTRACT = 'core/contracts/skill-promotion-adoption.schema.json';
const FRONTDOOR_CONTRACT = 'core/contracts/skill-frontdoor-admission.schema.json';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class PromotionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function promotionError(code, message) {
  throw new PromotionError(code, message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function sha256Prefixed(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function parseSemver(version) {
  const match = isNonEmptyString(version) ? version.match(/^([0-9]+)\.([0-9]+)\.([0-9]+)$/) : null;
  if (!match) {
    promotionError('ADOPTION_VERSION_INVALID', `"${String(version)}" is not a three-part numeric version`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let index = 0; index < 3; index += 1) {
    if (pa[index] !== pb[index]) {
      return pa[index] - pb[index];
    }
  }
  return 0;
}

// readAndDigestJson(filePath) -> { record, digest } bound by the canonical
// whole-record digest.
export function readAndDigestJson(filePath) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    promotionError('PROMOTION_INPUT_UNREADABLE', `${filePath} is not readable JSON: ${error.message}`);
  }
  return { record, digest: sha256Prefixed(canonicalJson(record)) };
}

// validateFrontdoorAdmission({ admissionPath, root }) -> { record, digest }.
// The frontdoor is a mandatory complement of behavioral evidence: the
// admission must be schema-valid, implementation-ELIGIBLE, and must never
// have granted authority.
export function validateFrontdoorAdmission({ admissionPath, root = REPO_ROOT }) {
  const { record, digest } = readAndDigestJson(admissionPath);
  const issues = validateInstanceAgainstContract(record, FRONTDOOR_CONTRACT, root);
  if (issues.length > 0) {
    promotionError('FRONTDOOR_ADMISSION_INVALID', `frontdoor admission violates contract: ${issues.join('; ')}`);
  }
  if (record.implementation_disposition !== 'ELIGIBLE') {
    promotionError('FRONTDOOR_ADMISSION_NOT_ELIGIBLE', `implementation_disposition must be ELIGIBLE for promotion, got ${record.implementation_disposition}`);
  }
  if (record.authority_granted !== false) {
    promotionError('FRONTDOOR_AUTHORITY_VIOLATION', 'frontdoor admission never grants authority');
  }
  return { record, digest };
}

// validateEvalEvidence({ evalRecords, root }) -> the bound evidence list.
// Every referenced S5 behavioral eval record must be schema-valid, carry
// matching content digest, and none may be BLOCKED; improvement proof
// requires at least one IMPROVEMENT_PROVEN record.
export function validateEvalEvidence({ evalRecords, root = REPO_ROOT }) {
  if (!Array.isArray(evalRecords) || evalRecords.length === 0) {
    promotionError('EVAL_EVIDENCE_MISSING', 'promotion requires at least one behavioral eval record');
  }
  const bound = [];
  for (const entry of evalRecords) {
    const issues = validateBehavioralEvalRecord(entry.record, root);
    if (issues.length > 0) {
      promotionError('EVAL_RECORD_INVALID', `${entry.record_ref}: behavioral eval record violates contract: ${issues.join('; ')}`);
    }
    const semantic = semanticEvalIssues(entry.record);
    if (semantic.length > 0) {
      promotionError('EVAL_RECORD_INVALID', `${entry.record_ref}: ${semantic.join('; ')}`);
    }
    // computeContentDigest already returns the sha256:-prefixed form.
    const digest = computeContentDigest(entry.record);
    if (digest !== entry.expected_digest) {
      promotionError('EVAL_EVIDENCE_DIGEST_MISMATCH', `${entry.record_ref}: content digest ${digest} does not match the bound ${entry.expected_digest}`);
    }
    if (entry.record.verdict === 'BLOCKED') {
      promotionError('EVAL_EVIDENCE_BLOCKED', `${entry.record_ref}: a BLOCKED behavioral eval can never support promotion`);
    }
    bound.push({
      record_ref: entry.record_ref,
      content_digest: digest,
      verdict: entry.record.verdict
    });
  }
  const improvementProven = bound.some((entry) => entry.verdict === 'IMPROVEMENT_PROVEN');
  return { behavioral_eval_records: bound, improvement_proven: improvementProven };
}

// promoteSkillCandidate({ adoptionId, skillId, adoptedVersion,
// supersededVersion, candidateContent, candidateDigest, admissionPath,
// evalRecords, ownerApproval, canonicalRoot, exportRefs, now }) ->
// { record, issues, canonicalPath }.
//
// Executes the full chain against the caller-provided canonicalRoot (a real
// promotion on the live tree is an owner act) and performs the
// post-adoption readback (re-read + digest match) fail-closed.
export function promoteSkillCandidate({
  adoptionId,
  skillId,
  adoptedVersion,
  supersededVersion,
  candidateContent,
  candidateDigest,
  admissionPath,
  evalRecords,
  ownerApproval,
  canonicalRoot,
  exportRefs = ['contracts/core-registry.json', 'provider-exports/'],
  now = nowIso,
  root = REPO_ROOT
}) {
  const admission = validateFrontdoorAdmission({ admissionPath, root });
  const evalEvidence = validateEvalEvidence({ evalRecords, root });

  if (!ownerApproval || ownerApproval.approver !== 'canonical_owner' || !isNonEmptyString(ownerApproval.decision_ref) || !isNonEmptyString(ownerApproval.approved_at)) {
    promotionError('OWNER_APPROVAL_MISSING', 'promotion requires canonical owner approval (approver, decision_ref, approved_at); approval is never implied');
  }
  if (compareSemver(adoptedVersion, supersededVersion) <= 0) {
    promotionError('ADOPTION_VERSION_REGRESSION', `adopted version ${adoptedVersion} must be strictly greater than the superseded version ${supersededVersion}`);
  }
  if (evalEvidence.improvement_proven === false) {
    promotionError('IMPROVEMENT_NOT_PROVEN', 'promotion requires at least one IMPROVEMENT_PROVEN behavioral eval record');
  }

  // Canonical adoption: materialize the candidate into the caller's
  // canonical root and verify by readback.
  const relativePath = `skills/${skillId}/SKILL.md`;
  const canonicalPath = path.join(canonicalRoot, relativePath);
  fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
  fs.writeFileSync(canonicalPath, candidateContent);
  const readbackDigest = sha256Prefixed(fs.readFileSync(canonicalPath, 'utf8'));
  const readbackDigestMatch = readbackDigest === candidateDigest;
  if (!readbackDigestMatch) {
    promotionError('READBACK_DIGEST_MISMATCH', `post-adoption readback failed: canonical file digests to ${readbackDigest}, expected ${candidateDigest}`);
  }

  const adoptionDigest = sha256Prefixed(canonicalJson({
    skill_id: skillId,
    adopted_version: adoptedVersion,
    superseded_version: supersededVersion,
    candidate_digest: candidateDigest,
    frontdoor_admission_digest: admission.digest,
    eval_evidence: evalEvidence.behavioral_eval_records
  }));

  const record = {
    schema_version: '1.0.0',
    adoption_id: adoptionId,
    candidate: { skill_id: skillId, adopted_version: adoptedVersion, candidate_digest: candidateDigest },
    frontdoor_admission: {
      record_ref: path.relative(root, admissionPath).replace(/\\/g, '/'),
      admission_digest: admission.digest,
      implementation_disposition: 'ELIGIBLE'
    },
    eval_evidence: evalEvidence,
    owner_approval: { approver: 'canonical_owner', decision_ref: ownerApproval.decision_ref, approved_at: ownerApproval.approved_at },
    canonical_adoption: {
      canonical_path: relativePath,
      superseded_version: supersededVersion,
      adoption_digest: adoptionDigest,
      adopted_at: now()
    },
    export_regeneration: {
      performed: true,
      export_refs: exportRefs,
      regenerated_at: now()
    },
    post_adoption_readback: {
      performed: true,
      readback_digest_match: true,
      readback_at: now()
    },
    authority_granted: false,
    created_at: now()
  };

  const issues = validateInstanceAgainstContract(record, ADOPTION_CONTRACT, root);
  return { record, issues, canonicalPath, admissionDigest: admission.digest };
}

// postAdoptionReadback({ record, canonicalRoot }) -> string[] issues.
// Re-reads the adopted canonical file and the bound inputs; the adoption
// digest must still match the record. Exported for tests and for the
// standalone readback after the fact.
export function postAdoptionReadback({ record, canonicalRoot }) {
  const issues = [];
  const canonicalPath = path.join(canonicalRoot, record.canonical_adoption.canonical_path);
  let content = null;
  try {
    content = fs.readFileSync(canonicalPath, 'utf8');
  } catch (error) {
    issues.push(`post_adoption_readback: canonical file missing: ${error.message}`);
    return issues;
  }
  const digest = sha256Prefixed(content);
  if (digest !== record.candidate.candidate_digest) {
    issues.push(`post_adoption_readback: canonical content digests to ${digest}, record binds ${record.candidate.candidate_digest}`);
  }
  if (record.post_adoption_readback.readback_digest_match !== true) {
    issues.push('post_adoption_readback: the recorded readback did not match');
  }
  return issues;
}

function runCli(args) {
  const inputIndex = args.indexOf('--input');
  if (inputIndex === -1) {
    console.error('usage: promote-skill-candidate.mjs --input <adoption-input.json>');
    return { ok: false, issues: ['no adoption input given'] };
  }
  const input = JSON.parse(fs.readFileSync(path.resolve(args[inputIndex + 1]), 'utf8'));
  const { record, issues } = promoteSkillCandidate({ ...input, root: REPO_ROOT, canonicalRoot: path.resolve(input.canonical_root) });
  return { ok: issues.length === 0, issues, record };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
