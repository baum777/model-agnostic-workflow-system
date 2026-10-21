#!/usr/bin/env node
// S8 governance promotion (spec MAWS-SII-TARGET-SPEC-001 v0.2.0, PROPOSED).
// Implements the versioned canonical adoption path for a skill candidate:
// frontdoor admission bound to the exact candidate identity and content, S5
// behavioral eval evidence bound by content digest, subject, corpus and age,
// canonical owner approval VERIFIED against the canonical owner authority
// anchor (a self-declared approver and decision reference authorise
// nothing), versioned adoption with the superseded version READ FROM THE
// CANONICAL TREE, the canonical registry and provider export regeneration
// with readback, an append-only adoption ledger, and the post-adoption
// readback.
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
import { canonicalJson, nowIso } from '../../runtime/vnext/util.mjs';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { validateBehavioralEvalRecord, semanticEvalIssues } from './validate-behavioral-eval.mjs';
import { computeContentDigest } from './run-skill-effectiveness-evals.mjs';
import {
  loadOwnerAuthority,
  readOwnerApproval,
  verifyOwnerApproval,
  CANONICAL_OWNER_AUTHORITY_PATH,
  OWNER_AUTHORITY_CONTRACT,
  OWNER_APPROVAL_CONTRACT
} from '../../runtime/skills/owner-authority.mjs';
import {
  exportPlan,
  snapshotExports,
  restoreExports,
  regenerateCanonicalExports
} from '../../runtime/skills/export-regeneration.mjs';
import { assertCanonicalTarget, CanonicalPathError } from '../../runtime/skills/canonical-path.mjs';

const ADOPTION_CONTRACT = 'core/contracts/skill-promotion-adoption.schema.json';
const FRONTDOOR_CONTRACT = 'core/contracts/skill-frontdoor-admission.schema.json';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 90;
// An owner decision expires like every other evidence input.
const DEFAULT_MAX_APPROVAL_AGE_DAYS = 90;

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

// screenedDigestOf(admission) -> the sha256 digest the frontdoor recorded for
// the screened candidate. The frontdoor binds the immutable source identity
// of the candidate it screened; a promotion may only adopt exactly what was
// screened.
export function screenedDigestOf(admission) {
  const sourceRevision = admission?.candidate?.source_revision;
  if (!isNonEmptyString(sourceRevision)) {
    promotionError('FRONTDOOR_SOURCE_REVISION_UNBOUND', 'the frontdoor admission carries no candidate source revision');
  }
  const match = sourceRevision.match(/sha256:[a-f0-9]{64}/);
  if (!match) {
    promotionError('FRONTDOOR_SOURCE_REVISION_UNBOUND', `the frontdoor source revision "${sourceRevision}" carries no sha256 content digest`);
  }
  return match[0];
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

// validateEvalEvidence({ evalRecords, root, skillId, now, maxEvidenceAgeDays })
// -> the bound evidence list. Every referenced S5 behavioral eval record must
// be schema-valid, carry a matching content digest, measure THE promoted
// skill, come from ONE corpus, be within the evidence age bound, and none may
// be BLOCKED; improvement proof requires at least one IMPROVEMENT_PROVEN
// record.
export function validateEvalEvidence({
  evalRecords,
  root = REPO_ROOT,
  skillId,
  now = nowIso,
  maxEvidenceAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS
}) {
  if (!Array.isArray(evalRecords) || evalRecords.length === 0) {
    promotionError('EVAL_EVIDENCE_MISSING', 'promotion requires at least one behavioral eval record');
  }
  const bound = [];
  const corpusDigests = new Set();
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
    // The evidence must measure the promoted skill itself: an eval of a
    // different subject never authorizes this promotion.
    if (isNonEmptyString(skillId) && entry.record.subject?.ref !== skillId) {
      promotionError('EVAL_EVIDENCE_SUBJECT_MISMATCH', `${entry.record_ref}: the eval measured subject "${entry.record.subject?.ref}", not the promoted skill "${skillId}"`);
    }
    const corpusDigest = entry.record.reproducibility?.corpus_digest;
    if (!DIGEST_PATTERN.test(String(corpusDigest))) {
      promotionError('EVAL_EVIDENCE_CORPUS_MISMATCH', `${entry.record_ref}: the eval carries no corpus digest`);
    }
    corpusDigests.add(corpusDigest);
    // Evidence freshness: a stale measurement cannot support a promotion.
    const createdAt = Date.parse(entry.record.created_at);
    if (Number.isNaN(createdAt)) {
      promotionError('EVAL_EVIDENCE_STALE', `${entry.record_ref}: created_at "${entry.record.created_at}" is not a timestamp`);
    }
    const ageDays = (Date.parse(now()) - createdAt) / 86400000;
    if (ageDays > maxEvidenceAgeDays) {
      promotionError('EVAL_EVIDENCE_STALE', `${entry.record_ref}: the evidence is ${ageDays.toFixed(1)} days old, the bound is ${maxEvidenceAgeDays} days`);
    }
    bound.push({
      record_ref: entry.record_ref,
      content_digest: digest,
      verdict: entry.record.verdict,
      subject_ref: entry.record.subject.ref,
      corpus_digest: corpusDigest,
      created_at: entry.record.created_at
    });
  }
  if (corpusDigests.size !== 1) {
    promotionError('EVAL_EVIDENCE_CORPUS_MISMATCH', `the bound evidence comes from ${corpusDigests.size} different corpora; one promotion binds one corpus`);
  }
  const improvementProven = bound.some((entry) => entry.verdict === 'IMPROVEMENT_PROVEN');
  return {
    behavioral_eval_records: bound,
    improvement_proven: improvementProven,
    corpus_digest: [...corpusDigests][0],
    max_evidence_age_days: maxEvidenceAgeDays
  };
}

// validateOwnerApproval({ ownerApprovalRef, ownerAuthorityPath, canonicalRoot,
// candidateDigest, skillId, root, now, maxApprovalAgeDays }) -> the verified
// approval.
//
// The approval is NOT a self-declared object: it is an artifact in the
// canonical decision surface of the target tree, verified against the
// canonical owner authority anchor (a published public key). An approver
// name and a decision reference without a valid signature are caller input
// and authorize nothing.
//
// TEST SEAM: `ownerAuthorityPath` and `maxApprovalAgeDays` exist so the
// verification can be exercised against a generated key in a test. The
// production entry point (runCli) pins BOTH: the anchor is read from the
// canonical location of this installation and the age bound is the contract
// bound. A caller that can pass these parameters can widen the gate, so no
// production path may expose them.
export function validateOwnerApproval({
  ownerApprovalRef,
  ownerAuthorityPath = path.join(REPO_ROOT, CANONICAL_OWNER_AUTHORITY_PATH),
  canonicalRoot,
  candidateDigest,
  skillId = null,
  root = REPO_ROOT,
  now = new Date(),
  maxApprovalAgeDays = DEFAULT_MAX_APPROVAL_AGE_DAYS
}) {
  if (!isNonEmptyString(ownerApprovalRef)) {
    promotionError('OWNER_APPROVAL_MISSING', 'promotion requires a canonical owner approval artifact; approval is never implied');
  }
  let authority;
  try {
    authority = loadOwnerAuthority({
      authorityPath: ownerAuthorityPath,
      root,
      validate: (record) => validateInstanceAgainstContract(record, OWNER_AUTHORITY_CONTRACT, root)
    });
  } catch (error) {
    promotionError(error?.code || 'OWNER_AUTHORITY_INVALID', error.message);
  }
  let approval;
  try {
    approval = readOwnerApproval({ approvalRef: ownerApprovalRef, canonicalRoot });
  } catch (error) {
    promotionError(error?.code || 'OWNER_APPROVAL_INVALID', error.message);
  }
  const contractIssues = validateInstanceAgainstContract(approval.record, OWNER_APPROVAL_CONTRACT, root);
  if (contractIssues.length > 0) {
    promotionError('OWNER_APPROVAL_INVALID', `the owner approval violates its contract: ${contractIssues.join('; ')}`);
  }
  let verified;
  try {
    verified = verifyOwnerApproval({
      approval: approval.record,
      authority,
      candidateDigest,
      skillId,
      now,
      maxApprovalAgeDays
    });
  } catch (error) {
    promotionError(error?.code || 'OWNER_APPROVAL_INVALID', error.message);
  }
  return {
    ...verified,
    approval_record_ref: approval.relative,
    approval_record_digest: approval.digest
  };
}

// readFrontmatterVersion(content) -> the version declared in the artifact's
// own frontmatter, or null when the artifact declares none.
export function readFrontmatterVersion(content) {
  if (!isNonEmptyString(content)) return null;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const versionLine = match[1].split(/\r?\n/).find((line) => /^version\s*:/.test(line));
  if (!versionLine) return null;
  const value = versionLine.replace(/^version\s*:\s*/, '').trim().replace(/^["']|["']$/g, '');
  return isNonEmptyString(value) ? value : null;
}

// resolveCanonicalPaths({ canonicalRoot, skillId }) -> { canonicalPath,
// canonicalPathRelative, ledgerPath, ledgerPathRelative } with the resolved
// path proven to stay INSIDE the canonical root.
export function resolveCanonicalPaths({ canonicalRoot, skillId }) {
  if (!isNonEmptyString(skillId) || !SKILL_ID_PATTERN.test(skillId)) {
    promotionError('PROMOTION_SKILL_ID_INVALID', `skill id "${String(skillId)}" must match ${SKILL_ID_PATTERN}`);
  }
  const root = path.resolve(canonicalRoot);
  const canonicalPathRelative = `skills/${skillId}/SKILL.md`;
  const ledgerPathRelative = `skills/${skillId}/ADOPTIONS.jsonl`;
  const canonicalPath = path.resolve(root, canonicalPathRelative);
  const ledgerPath = path.resolve(root, ledgerPathRelative);
  if (!canonicalPath.startsWith(`${root}${path.sep}`) || !ledgerPath.startsWith(`${root}${path.sep}`)) {
    promotionError('PROMOTION_PATH_ESCAPE', `the canonical path for "${skillId}" escapes the canonical root`);
  }
  return { canonicalPath, canonicalPathRelative, ledgerPath, ledgerPathRelative };
}

// readAdoptionLedger({ ledgerPath }) -> the recorded prior adoptions. The
// ledger makes the applied change reconstructable and the promotion
// replay-protected.
export function readAdoptionLedger({ ledgerPath }) {
  let content;
  try {
    content = fs.readFileSync(ledgerPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    promotionError('ADOPTION_LEDGER_CORRUPT', `the adoption ledger ${ledgerPath} is not readable: ${error.message}`);
  }
  const entries = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      promotionError('ADOPTION_LEDGER_CORRUPT', `the adoption ledger ${ledgerPath} holds an unreadable entry: ${error.message}`);
    }
  }
  return entries;
}

// assertAdoptionAllowed({ adoptionId, skillId, adoptedVersion, ledger }) ->
// fail closed on a replayed adoption id or on an adoption that does not move
// the skill past the version it was already adopted at. The ledger is the
// applied-change history, so a promotion is always reconstructable.
export function assertAdoptionAllowed({ adoptionId, skillId, adoptedVersion, ledger }) {
  for (const entry of ledger) {
    if (entry.adoption_id === adoptionId) {
      promotionError('PROMOTION_REPLAYED', `adoption id "${adoptionId}" was already applied at ${String(entry.adopted_at)}`);
    }
    if (entry.skill_id === skillId && compareSemver(adoptedVersion, entry.adopted_version) <= 0) {
      promotionError('PROMOTION_ALREADY_ADOPTED', `skill "${skillId}" was already adopted at version ${entry.adopted_version} by adoption "${entry.adoption_id}"`);
    }
  }
}

// semanticPromotionIssues(record) -> string[]. The invariants the minimal
// schema engine cannot express: the evidence proves an improvement, the
// evidence measured the promoted skill, the admission screened the adopted
// content, the approval binds the adopted content AND was verified against
// the canonical owner authority, the canonical exports were regenerated and
// read back, and the record grants no authority.
export function semanticPromotionIssues(record) {
  const issues = [];
  if (record.authority_granted !== false) {
    issues.push('authority_granted: a promotion never grants authority');
  }
  const records = record.eval_evidence?.behavioral_eval_records ?? [];
  if (record.eval_evidence?.improvement_proven === true && !records.some((entry) => entry.verdict === 'IMPROVEMENT_PROVEN')) {
    issues.push('eval_evidence: improvement_proven is asserted without an IMPROVEMENT_PROVEN record');
  }
  for (const entry of records) {
    if (entry.subject_ref !== record.candidate?.skill_id) {
      issues.push(`eval_evidence: ${entry.record_ref} measured subject "${entry.subject_ref}", not the promoted skill`);
    }
  }
  if (record.candidate?.screened_digest !== record.candidate?.candidate_digest) {
    issues.push('candidate: the screened content digest differs from the adopted content digest');
  }
  if (record.frontdoor_admission?.screened_digest !== record.candidate?.candidate_digest) {
    issues.push('frontdoor_admission: the frontdoor screened other content than the adopted content');
  }
  if (record.owner_approval?.candidate_digest !== record.candidate?.candidate_digest) {
    issues.push('owner_approval: the approval does not bind the adopted content');
  }
  if (record.owner_approval?.signature_verified !== true) {
    issues.push('owner_approval: the approval was not verified against the canonical owner authority');
  }
  if (record.owner_approval?.skill_id !== record.candidate?.skill_id) {
    issues.push('owner_approval: the approval approves another skill than the adopted one');
  }
  if (record.export_regeneration?.performed !== true) {
    issues.push('export_regeneration: the canonical exports were not regenerated');
  }
  if (record.export_regeneration?.readback_verified !== true) {
    issues.push('export_regeneration: the regenerated exports were not read back');
  }
  if (!Array.isArray(record.export_regeneration?.export_digests) || record.export_regeneration.export_digests.length === 0) {
    issues.push('export_regeneration: the record names no regenerated export');
  }
  if (record.post_adoption_readback?.readback_digest_match !== true) {
    issues.push('post_adoption_readback: the readback did not match');
  }
  return issues;
}

// promoteSkillCandidate({ adoptionId, skillId, adoptedVersion,
// supersededVersion, candidateContent, candidateDigest, admissionPath,
// evalRecords, ownerApprovalRef, ownerAuthorityPath, canonicalRoot, now,
// maxEvidenceAgeDays, maxApprovalAgeDays, onExportsWritten }) ->
// { record, issues, canonicalPath }.
//
// TEST SEAMS: `ownerAuthorityPath`, `maxEvidenceAgeDays`,
// `maxApprovalAgeDays` and `onExportsWritten` are injection points for the
// tests. The production entry point (runCli) pins the first three and never
// passes the fourth. `onExportsWritten` runs between the export write and
// the export readback; the adopted content is verified AGAIN after the
// export step, so a hook cannot make the promotion report success over a
// tree state that violates its own invariant.
//
// Executes the full chain against the caller-provided canonicalRoot (a real
// promotion on the live tree is an owner act), regenerates the canonical
// registry and provider exports and verifies them by readback, and performs
// the post-adoption readback fail-closed. A record that does not satisfy the
// contract leaves NO mutation behind: the canonical file AND the regenerated
// exports are restored before the issues are returned.
export function promoteSkillCandidate({
  adoptionId,
  skillId,
  adoptedVersion,
  supersededVersion,
  candidateContent,
  candidateDigest,
  admissionPath,
  evalRecords,
  ownerApprovalRef,
  ownerAuthorityPath = path.join(REPO_ROOT, CANONICAL_OWNER_AUTHORITY_PATH),
  canonicalRoot,
  now = nowIso,
  root = REPO_ROOT,
  maxEvidenceAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS,
  maxApprovalAgeDays = DEFAULT_MAX_APPROVAL_AGE_DAYS,
  onExportsWritten = null
}) {
  const paths = resolveCanonicalPaths({ canonicalRoot, skillId });
  const admission = validateFrontdoorAdmission({ admissionPath, root });
  const screenedDigest = screenedDigestOf(admission.record);

  // The promotion may only adopt what the frontdoor screened, for the skill
  // the frontdoor screened: an admission for another skill or another
  // content never authorizes this adoption.
  if (admission.record.candidate.skill_id !== skillId) {
    promotionError('PROMOTION_CANDIDATE_IDENTITY_MISMATCH', `the frontdoor screened skill "${admission.record.candidate.skill_id}", not "${skillId}"`);
  }
  if (screenedDigest !== candidateDigest) {
    promotionError('PROMOTION_CANDIDATE_CONTENT_MISMATCH', `the frontdoor screened content ${screenedDigest}, the promoted content digests to ${candidateDigest}`);
  }

  const evalEvidence = validateEvalEvidence({ evalRecords, root, skillId, now, maxEvidenceAgeDays });
  const approval = validateOwnerApproval({
    ownerApprovalRef,
    ownerAuthorityPath,
    canonicalRoot,
    candidateDigest,
    skillId,
    root,
    now,
    maxApprovalAgeDays
  });

  // Replay protection comes FIRST: the ledger records every applied
  // adoption, so a replayed adoption id or an adoption that does not move
  // the skill past its last adopted version is refused before anything is
  // read or written.
  const ledger = readAdoptionLedger({ ledgerPath: paths.ledgerPath });
  assertAdoptionAllowed({ adoptionId, skillId, adoptedVersion, ledger });

  // The superseded version is READ FROM THE CANONICAL TREE, never asserted
  // by the caller: a self-declared prior version would allow a silent
  // downgrade of a live skill.
  // The canonical skill file is a regular file inside the canonical tree: no
  // symlinked file, no symlinked parent directory. The adoption ledger is
  // checked the same way: it is the record of the applied change and must
  // land inside the tree that was changed.
  try {
    assertCanonicalTarget({ root: canonicalRoot, absolutePath: paths.canonicalPath, label: 'canonical skill' });
  } catch (error) {
    if (error instanceof CanonicalPathError) {
      promotionError('PROMOTION_CANONICAL_PATH_NOT_A_FILE', error.message);
    }
    throw error;
  }
  try {
    assertCanonicalTarget({ root: canonicalRoot, absolutePath: paths.ledgerPath, label: 'adoption ledger' });
  } catch (error) {
    if (error instanceof CanonicalPathError) {
      promotionError('PROMOTION_LEDGER_PATH_NOT_A_FILE', error.message);
    }
    throw error;
  }
  const priorContent = fs.existsSync(paths.canonicalPath) ? fs.readFileSync(paths.canonicalPath, 'utf8') : null;
  let effectiveSupersededVersion = supersededVersion;
  let supersededVersionSource = 'no_prior_canonical_version';
  if (priorContent !== null) {
    const canonicalVersion = readFrontmatterVersion(priorContent);
    if (canonicalVersion === null) {
      promotionError('ADOPTION_SUPERSEDED_VERSION_UNDECLARED', `the canonical skill file ${paths.canonicalPathRelative} declares no version; the superseded version cannot be read from the canonical tree`);
    }
    effectiveSupersededVersion = canonicalVersion;
    supersededVersionSource = 'canonical_skill_file';
  }
  if (compareSemver(adoptedVersion, effectiveSupersededVersion) <= 0) {
    promotionError('ADOPTION_VERSION_REGRESSION', `adopted version ${adoptedVersion} must be strictly greater than the superseded version ${effectiveSupersededVersion} (${supersededVersionSource})`);
  }
  // The adopted version must be the version the artifact itself declares.
  const artifactVersion = readFrontmatterVersion(candidateContent);
  if (artifactVersion === null) {
    promotionError('ADOPTION_VERSION_UNDECLARED', 'the promoted artifact declares no version in its frontmatter');
  }
  if (artifactVersion !== adoptedVersion) {
    promotionError('ADOPTION_VERSION_ARTIFACT_MISMATCH', `the promoted artifact declares version ${artifactVersion}, the adoption records ${adoptedVersion}`);
  }
  if (evalEvidence.improvement_proven === false) {
    promotionError('IMPROVEMENT_NOT_PROVEN', 'promotion requires at least one IMPROVEMENT_PROVEN behavioral eval record');
  }

  const adoptionDigest = sha256Prefixed(canonicalJson({
    skill_id: skillId,
    adopted_version: adoptedVersion,
    superseded_version: effectiveSupersededVersion,
    candidate_digest: candidateDigest,
    screened_digest: screenedDigest,
    frontdoor_admission_digest: admission.digest,
    eval_evidence: evalEvidence.behavioral_eval_records,
    owner_approval: approval
  }));

  // Canonical adoption: materialize the candidate into the caller's
  // canonical root and verify by readback. A contract-invalid record leaves
  // no mutation behind.
  fs.mkdirSync(path.dirname(paths.canonicalPath), { recursive: true });
  fs.writeFileSync(paths.canonicalPath, candidateContent);
  const readbackDigest = sha256Prefixed(fs.readFileSync(paths.canonicalPath, 'utf8'));
  const readbackDigestMatch = readbackDigest === candidateDigest;
  if (!readbackDigestMatch) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot: null });
    if (failures.length > 0) {
      promotionError('PROMOTION_ROLLBACK_FAILED', `the post-adoption readback failed and the rollback did not restore every surface: ${failures.join('; ')}`);
    }
    promotionError('READBACK_DIGEST_MISMATCH', `post-adoption readback failed: canonical file digests to ${readbackDigest}, expected ${candidateDigest}`);
  }

  // The canonical tree changed, so its projections are regenerated: the
  // neutral core registry and every provider export are rebuilt from the
  // tree and read back. An incomplete regeneration is fail-closed and rolls
  // the tree back to the state it had before the promotion.
  let planned;
  try {
    planned = exportPlan({ canonicalRoot });
  } catch (error) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot: null });
    if (failures.length > 0) {
      promotionError('PROMOTION_ROLLBACK_FAILED', `the export plan failed (${error.message}) and the rollback did not restore every surface: ${failures.join('; ')}`);
    }
    promotionError(error?.code || 'EXPORT_REGENERATION_FAILED', error.message);
  }
  let exportSnapshot;
  try {
    exportSnapshot = snapshotExports({ canonicalRoot, plan: planned.plan });
  } catch (error) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot: null });
    if (failures.length > 0) {
      promotionError('PROMOTION_ROLLBACK_FAILED', `the export surfaces could not be snapshotted (${error.message}) and the rollback did not restore every surface: ${failures.join('; ')}`);
    }
    promotionError('EXPORT_REGENERATION_FAILED', `the export surfaces could not be snapshotted before the regeneration: ${error.message}`);
  }
  let exportState;
  try {
    exportState = regenerateCanonicalExports({
      canonicalRoot,
      adoptedSkillId: skillId,
      adoptionDigest,
      now,
      planned,
      onWritten: onExportsWritten
    });
  } catch (error) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot, canonicalRoot });
    if (failures.length > 0) {
      promotionError('PROMOTION_ROLLBACK_FAILED', `the export regeneration failed (${error.message}) and the rollback did not restore every surface: ${failures.join('; ')}`);
    }
    promotionError(error?.code || 'EXPORT_REGENERATION_FAILED', error.message);
  }

  // The canonical file is verified AGAIN after the export regeneration: the
  // adoption is only valid if the adopted content is still the content that
  // was adopted.
  const finalCanonicalDigest = sha256Prefixed(fs.readFileSync(paths.canonicalPath, 'utf8'));
  if (finalCanonicalDigest !== candidateDigest) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot, canonicalRoot });
    if (failures.length > 0) {
      promotionError('PROMOTION_ROLLBACK_FAILED', `the adopted content changed during the export regeneration and the rollback did not restore every surface: ${failures.join('; ')}`);
    }
    promotionError('READBACK_DIGEST_MISMATCH', `the adopted file digests to ${finalCanonicalDigest} after the export regeneration, expected ${candidateDigest}`);
  }

  const record = {
    schema_version: '1.0.0',
    adoption_id: adoptionId,
    candidate: {
      skill_id: skillId,
      adopted_version: adoptedVersion,
      candidate_digest: candidateDigest,
      screened_digest: screenedDigest
    },
    frontdoor_admission: {
      record_ref: path.relative(root, admissionPath).replace(/\\/g, '/'),
      admission_digest: admission.digest,
      implementation_disposition: 'ELIGIBLE',
      screened_digest: screenedDigest
    },
    eval_evidence: evalEvidence,
    owner_approval: approval,
    canonical_adoption: {
      canonical_path: paths.canonicalPathRelative,
      superseded_version: effectiveSupersededVersion,
      superseded_version_source: supersededVersionSource,
      adoption_digest: adoptionDigest,
      adopted_at: now(),
      adoption_ledger_ref: paths.ledgerPathRelative
    },
    export_regeneration: exportState,
    post_adoption_readback: {
      performed: true,
      readback_digest_match: readbackDigestMatch,
      readback_at: now()
    },
    authority_granted: false,
    created_at: now()
  };

  const issues = [
    ...validateInstanceAgainstContract(record, ADOPTION_CONTRACT, root),
    ...semanticPromotionIssues(record)
  ];
  if (issues.length > 0) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot, canonicalRoot });
    if (failures.length > 0) {
      issues.push(`rollback: the promotion left surfaces behind: ${failures.join('; ')}`);
    }
    return { record, issues, canonicalPath: paths.canonicalPath, admissionDigest: admission.digest };
  }

  // The readback runs BEFORE the ledger entry is written: the adopted file,
  // the regenerated exports and the owner approval must still be the ones
  // the record describes. (The ledger entry itself is checked by the
  // standalone readback after the append.)
  const readbackIssues = postAdoptionReadback({ record, canonicalRoot, expectLedgerEntry: false });
  if (readbackIssues.length > 0) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot, canonicalRoot });
    if (failures.length > 0) {
      promotionError('PROMOTION_ROLLBACK_FAILED', `the post-adoption readback failed (${readbackIssues.join('; ')}) and the rollback did not restore every surface: ${failures.join('; ')}`);
    }
    promotionError('READBACK_MISMATCH', `the post-adoption readback failed: ${readbackIssues.join('; ')}`);
  }

  // The applied change is recorded: the ledger makes it reconstructable. A
  // ledger that cannot be written means the applied change is not
  // reconstructable - the promotion is rolled back instead of applied
  // without a record.
  try {
    fs.appendFileSync(paths.ledgerPath, `${JSON.stringify({
      adoption_id: adoptionId,
      skill_id: skillId,
      adopted_version: adoptedVersion,
      superseded_version: effectiveSupersededVersion,
      adoption_digest: adoptionDigest,
      candidate_digest: candidateDigest,
      adopted_at: record.canonical_adoption.adopted_at
    })}\n`);
  } catch (error) {
    const failures = rollbackPromotion({ canonicalPath: paths.canonicalPath, priorContent, exportSnapshot, canonicalRoot });
    if (failures.length > 0) {
      promotionError('PROMOTION_ROLLBACK_FAILED', `the adoption ledger could not be written (${error.message}) and the rollback did not restore every surface: ${failures.join('; ')}`);
    }
    promotionError('PROMOTION_LEDGER_UNWRITABLE', `the adoption ledger could not be written: ${error.message}`);
  }

  return { record, issues, canonicalPath: paths.canonicalPath, admissionDigest: admission.digest };
}

// rollbackPromotion({ canonicalPath, priorContent, exportSnapshot,
// canonicalRoot }) -> string[] of surfaces that could NOT be restored.
//
// The rollback is fail-safe by construction: every surface is restored
// independently, a failing restore never aborts the remaining restores, and
// the caller receives the list of surfaces that are still changed. A failed
// restore is a hard, named failure - never a silently half-applied adoption.
function rollbackPromotion({ canonicalPath, priorContent, exportSnapshot, canonicalRoot = null }) {
  const failures = [];
  const skillFailure = restoreCanonicalFile({ canonicalPath, priorContent });
  if (skillFailure) {
    failures.push(skillFailure);
  }
  if (exportSnapshot && canonicalRoot) {
    const exportFailures = restoreExports({ canonicalRoot, snapshot: exportSnapshot });
    failures.push(...exportFailures);
  }
  return failures;
}

// restoreCanonicalFile -> undo a canonical write when the record does not
// satisfy the contract: the failed promotion leaves no mutation behind.
// It NEVER throws: a failing restore is returned as a named failure so the
// remaining surfaces can still be restored and the caller can report the
// incomplete rollback.
function restoreCanonicalFile({ canonicalPath, priorContent }) {
  try {
    if (priorContent === null) {
      fs.rmSync(canonicalPath, { force: true });
      return null;
    }
    fs.writeFileSync(canonicalPath, priorContent);
    return null;
  } catch (error) {
    return `the canonical skill file ${canonicalPath} could not be restored: ${error.message}`;
  }
}

// postAdoptionReadback({ record, canonicalRoot }) -> string[] issues.
// Re-reads the adopted canonical file and the bound inputs; the adoption
// digest must still match the record. Exported for tests and for the
// standalone readback after the fact.
export function postAdoptionReadback({ record, canonicalRoot, expectLedgerEntry = true }) {
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
  if (expectLedgerEntry) {
    try {
      const ledger = readAdoptionLedger({ ledgerPath: path.join(canonicalRoot, record.canonical_adoption.adoption_ledger_ref) });
      if (!ledger.some((entry) => entry.adoption_digest === record.canonical_adoption.adoption_digest)) {
        issues.push('post_adoption_readback: the adoption ledger holds no entry for this adoption');
      }
    } catch (error) {
      // The readback REPORTS; it never throws: a caller of the exported
      // readback receives issues, not an exception.
      issues.push(`post_adoption_readback: the adoption ledger could not be read: ${error.message}`);
    }
  }
  // The owner approval artifact is re-read as well: the recorded approval
  // digest must still describe the artifact that vouched for the adoption.
  const approvalRef = record.owner_approval?.approval_record_ref;
  if (approvalRef) {
    try {
      const approvalContent = fs.readFileSync(path.join(canonicalRoot, approvalRef), 'utf8');
      const approvalDigest = sha256Prefixed(canonicalJson(JSON.parse(approvalContent)));
      if (approvalDigest !== record.owner_approval.approval_record_digest) {
        issues.push(`post_adoption_readback: the owner approval ${approvalRef} digests to ${approvalDigest}, record binds ${record.owner_approval.approval_record_digest}`);
      }
    } catch (error) {
      issues.push(`post_adoption_readback: the owner approval is not readable: ${error.message}`);
    }
  }
  // The regenerated exports are re-read as well: a projection that drifted
  // away from the adoption is a failed readback, not a detail.
  for (const entry of record.export_regeneration?.export_digests ?? []) {
    let exportContent = null;
    try {
      exportContent = fs.readFileSync(path.join(canonicalRoot, entry.ref), 'utf8');
    } catch (error) {
      issues.push(`post_adoption_readback: regenerated export missing: ${entry.ref}`);
      continue;
    }
    const exportDigest = sha256Prefixed(exportContent);
    if (exportDigest !== entry.digest) {
      issues.push(`post_adoption_readback: regenerated export ${entry.ref} digests to ${exportDigest}, record binds ${entry.digest}`);
    }
  }
  return issues;
}

export function runCli(args) {
  const inputIndex = args.indexOf('--input');
  if (inputIndex === -1) {
    console.error('usage: promote-skill-candidate.mjs --input <adoption-input.json>');
    return { ok: false, issues: ['no adoption input given'] };
  }
  let input;
  try {
    input = JSON.parse(fs.readFileSync(path.resolve(args[inputIndex + 1]), 'utf8'));
  } catch (error) {
    return { ok: false, issues: [`PROMOTION_INPUT_UNREADABLE: ${error.message}`] };
  }
  // The CLI accepts an ALLOWLIST of inputs. Neither the trust anchor nor the
  // evidence age bound is part of it: the canonical owner authority is read
  // from the pinned canonical location of this installation, and the
  // freshness bound is fixed by the contract, so an input file can never
  // widen a gate of the promotion chain.
  const {
    adoption_id: adoptionId,
    skill_id: skillId,
    adopted_version: adoptedVersion,
    superseded_version: supersededVersion,
    candidate_content: candidateContent,
    candidate_digest: candidateDigest,
    admission_path: admissionPath,
    eval_records: evalRecords,
    owner_approval_ref: ownerApprovalRef,
    canonical_root: canonicalRoot
  } = input ?? {};
  try {
    const { record, issues } = promoteSkillCandidate({
      adoptionId,
      skillId,
      adoptedVersion,
      supersededVersion,
      candidateContent,
      candidateDigest,
      admissionPath,
      evalRecords,
      ownerApprovalRef,
      ownerAuthorityPath: path.join(REPO_ROOT, CANONICAL_OWNER_AUTHORITY_PATH),
      canonicalRoot: path.resolve(canonicalRoot ?? ''),
      root: REPO_ROOT,
      now: nowIso,
      maxEvidenceAgeDays: DEFAULT_MAX_EVIDENCE_AGE_DAYS
    });
    return { ok: issues.length === 0, issues, record };
  } catch (error) {
    if (error instanceof PromotionError) {
      return { ok: false, issues: [`${error.code}: ${error.message}`], record: null };
    }
    // Every failure of the promotion chain is a structured refusal; the CLI
    // never dies with an unhandled stack trace.
    return { ok: false, issues: [`PROMOTION_FAILED: ${error?.message ?? String(error)}`], record: null };
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
