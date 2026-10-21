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
import { validateBehavioralEvalRecord } from './validate-behavioral-eval.mjs';
import { verifyEvidenceProvenance } from './evidence-provenance.mjs';
import { verifyEvidenceAdmission, EVIDENCE_ADMISSION_CONTRACT } from './evidence-admission.mjs';
import { classifyReport, formatTimestamp } from './preinstall-skill-risk-check.mjs';
import {
  classifySkillEvaluator,
  deriveSecuritySeverity,
  normalizeSeverityCounts
} from './skill-frontdoor-check.mjs';
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

// validateFrontdoorAdmission({ admissionPath, root }) -> { record, digest,
// relative }.
//
// The frontdoor admission is EVIDENCE, not caller input, and it is verified
// as such:
//
//   F1  the receipt is read FROM THE CANONICAL SCREENING SURFACE of the
//       canonical tree (sandbox/runs/<run>/skill-frontdoor-admission.json)
//       through the canonical containment proof: a caller-supplied path
//       outside the tree, a symlinked file or a symlinked parent directory
//       is refused;
//   F2  the receipt is INTERNALLY CONSISTENT: its admission id re-derives
//       from the screened content identity it records, from the run
//       directory it lives in and from its own decision time — the same
//       derivation the checker performs when it writes the receipt — so a
//       relocated, retimestamped or rewritten receipt cannot pose as the
//       checker's output;
//   F3  the analyzer evidence is RE-DERIVED FROM THE REPORTS: both named
//       report files are read from the SAME screening run inside the tree,
//       and the declared statuses, severities and counts must follow from
//       the report content under the very classifiers the checker used. The
//       analyzer guarantees constrain the chain through their reports, not
//       through the receipt's claims about them;
//   F4  the admission must be schema-valid, implementation-ELIGIBLE, and
//       must never have granted authority.
//
// RESIDUAL (stated, not hidden): the receipt and its reports carry no
// signature, so this gate proves coherence, not authorship. What ties the
// screening to a trusted decision is the owner approval: it binds the
// admission digest in its SIGNED payload (frontdoor_admission_digest), so a
// fabricated receipt fails the owner signature. Without a published owner
// key the chain refuses anyway.
export function validateFrontdoorAdmission({ admissionPath, canonicalRoot, root = REPO_ROOT }) {
  // `canonicalRoot` is the tree the receipt must live in; `root` is the
  // installation root the CONTRACT schemas are resolved from. They are
  // different roots and must never be confused: the confinement attaches to
  // the tree that is adopted into, the contract to the code that verifies.
  const resolvedRoot = path.resolve(canonicalRoot);
  const relative = path.relative(resolvedRoot, path.resolve(String(admissionPath))).replace(/\\/g, '/');
  if (relative.startsWith('../') || relative === '' || path.isAbsolute(relative)) {
    promotionError('FRONTDOOR_ADMISSION_SURFACE_INVALID', `the frontdoor admission ${String(admissionPath)} does not live inside the canonical tree`);
  }
  const runMatch = relative.match(/^sandbox\/runs\/([0-9]{8}T[0-9]{6}\.[0-9]{3}Z)\/skill-frontdoor-admission\.json$/);
  if (!runMatch) {
    promotionError('FRONTDOOR_ADMISSION_SURFACE_INVALID', `the frontdoor admission must live at sandbox/runs/<run>/skill-frontdoor-admission.json inside the canonical tree, got "${relative}"`);
  }
  const absolute = path.resolve(resolvedRoot, relative);
  try {
    assertCanonicalTarget({ root: resolvedRoot, absolutePath: absolute, label: 'frontdoor admission' });
  } catch (error) {
    if (error instanceof CanonicalPathError) {
      promotionError('FRONTDOOR_ADMISSION_SURFACE_INVALID', `the frontdoor admission ${relative} is not a contained regular file of the canonical tree: ${error.message}`);
    }
    throw error;
  }
  const { record, digest } = readAndDigestJson(absolute);
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

  // F2: the identity re-derivation. The checker writes
  // `sfa_<tree digest prefix>_<run timestamp>` and derives the run timestamp
  // from the decision time; a receipt that does not reproduce that
  // derivation is not the receipt the checker wrote at that path.
  const idMatch = String(record.admission_id).match(/^sfa_([0-9a-f]{12})_([0-9]{8}T[0-9]{6}\.[0-9]{3}Z)$/);
  if (!idMatch) {
    promotionError('FRONTDOOR_ADMISSION_IDENTITY_MISMATCH', `the admission id "${String(record.admission_id)}" does not follow the canonical admission identity form sfa_<12 hex>_<run timestamp>`);
  }
  if (idMatch[2] !== runMatch[1]) {
    promotionError('FRONTDOOR_ADMISSION_IDENTITY_MISMATCH', `the admission names screening run ${idMatch[2]} but lives in the run directory ${runMatch[1]}`);
  }
  const treeDigest = String(record.candidate?.source_revision ?? '').match(/sha256:([0-9a-f]{64})/);
  if (!treeDigest || treeDigest[1].slice(0, 12) !== idMatch[1]) {
    promotionError('FRONTDOOR_ADMISSION_IDENTITY_MISMATCH', 'the admission id does not re-derive from the screened content identity recorded in candidate.source_revision');
  }
  const decidedMs = Date.parse(String(record.decided_at ?? ''));
  if (!Number.isFinite(decidedMs) || formatTimestamp(new Date(decidedMs)) !== idMatch[2]) {
    promotionError('FRONTDOOR_ADMISSION_IDENTITY_MISMATCH', `the decision time ${String(record.decided_at)} does not re-derive the admission's screening run timestamp`);
  }

  // F3: the analyzer reports are opened and the declared evidence is
  // re-derived from their content. A report outside the receipt's own
  // screening run is refused before it is read.
  const runPrefix = `sandbox/runs/${runMatch[1]}/`;
  const reportChecks = [
    ['skillspector', record.evidence?.skillspector, rederiveSkillspectorEvidence],
    ['skillevaluator_tier1', record.evidence?.skillevaluator_tier1, rederiveSkillevaluatorEvidence]
  ];
  for (const [label, evidence, rederive] of reportChecks) {
    const reportRef = String(evidence?.report_path ?? '');
    if (!reportRef.startsWith(runPrefix)) {
      promotionError('FRONTDOOR_REPORT_MISMATCH', `the ${label} report "${reportRef}" does not belong to the screening run ${runMatch[1]} that produced the admission`);
    }
    const reportPath = path.resolve(resolvedRoot, reportRef);
    try {
      assertCanonicalTarget({ root: resolvedRoot, absolutePath: reportPath, label: `${label} report` });
    } catch (error) {
      if (error instanceof CanonicalPathError) {
        promotionError('FRONTDOOR_REPORT_MISSING', `the ${label} report ${reportRef} is not a contained regular file of the canonical tree: ${error.message}`);
      }
      throw error;
    }
    let report;
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        promotionError('FRONTDOOR_REPORT_MISSING', `the ${label} report ${reportRef} named by the admission does not exist in the screening run; analyzer evidence that is not on disk proves nothing`);
      }
      promotionError('FRONTDOOR_REPORT_INVALID', `the ${label} report ${reportRef} is not readable JSON: ${error.message}`);
    }
    const difference = rederive(evidence, report);
    if (difference !== null) {
      promotionError('FRONTDOOR_REPORT_MISMATCH', `the ${label} evidence declared in the admission does not follow from its report ${reportRef}: ${difference}`);
    }
  }

  // The declared disposition needs no separate re-derivation here: F3 has
  // pinned every derivation input (both analyzers' status, severity and
  // counts) to the report files, the contract pins the legal disposition
  // pairs, and the ELIGIBLE gate above pins the implementation requirement.
  // A disposition that does not follow from the evidence therefore cannot
  // reach this point — a separate derivation branch would be unreachable
  // code, and unreachable guards are removed in this repository rather
  // than kept as untestable code.

  return { record, digest, relative };
}

// rederiveSkillspectorEvidence(evidence, report) -> null when the declared
// SkillSpector evidence follows from the report under the checker's own
// classifier, or the difference as text. Mirrors the classification the
// checker performed when it wrote the receipt.
function rederiveSkillspectorEvidence(evidence, report) {
  const classification = classifyReport(report);
  let status = 'INCOMPLETE';
  if (evidence.version !== 'unknown' && evidence.exit_code === 0 && classification.ok === true) {
    status = 'PASS';
  } else if (report && classification.ok === false && classification.incomplete !== true) {
    status = 'BLOCKED';
  }
  if (status !== evidence.status) {
    return `status re-derives to ${status}, the admission declares ${evidence.status}`;
  }
  const severity = deriveSecuritySeverity(report, classification);
  if (severity !== evidence.severity) {
    return `severity re-derives to ${severity}, the admission declares ${evidence.severity}`;
  }
  const counts = normalizeSeverityCounts(classification?.counts);
  if (canonicalJson(counts) !== canonicalJson(evidence.severity_counts)) {
    return `severity counts re-derive to ${canonicalJson(counts)}, the admission declares ${canonicalJson(evidence.severity_counts)}`;
  }
  return null;
}

// rederiveSkillevaluatorEvidence(evidence, report) -> null when the declared
// SkillEvaluator Tier-1 evidence follows from the report under the checker's
// own classifier, or the difference as text.
function rederiveSkillevaluatorEvidence(evidence, report) {
  const derived = classifySkillEvaluator({
    report,
    reportPath: 'report',
    reportError: null,
    result: { status: evidence.exit_code }
  }, evidence.version);
  for (const field of ['status', 'overall_status', 'overall_passed']) {
    if (canonicalJson(derived[field]) !== canonicalJson(evidence[field])) {
      return `${field} re-derives to ${canonicalJson(derived[field])}, the admission declares ${canonicalJson(evidence[field])}`;
    }
  }
  const counts = normalizeSeverityCounts(report?.severity_counts);
  if (canonicalJson(counts) !== canonicalJson(evidence.severity_counts)) {
    return `severity counts re-derive to ${canonicalJson(counts)}, the admission declares ${canonicalJson(evidence.severity_counts)}`;
  }
  return null;
}

// validateEvalEvidence({ evalRecords, root, evidenceRoot, skillId, now,
// maxEvidenceAgeDays }) -> the bound evidence with its provenance
// attestations.
//
// The evidence is NOT supplied by the caller. Every entry names a record in
// the canonical evidence surface, the corpus it was produced from and the
// baseline it was compared against. The record is READ FROM DISK, the corpus
// is re-hashed from disk, the evaluation is RE-EXECUTED over that corpus and
// the verdict is re-derived from the baseline on disk. A caller-supplied
// record object, digest or verdict legitimizes nothing: the caller's
// expectation is only ever checked AGAINST that truth.
//
// A caller digest can therefore only narrow this gate, never widen it.
export async function validateEvalEvidence({
  evalRecords,
  root = REPO_ROOT,
  evidenceRoot = null,
  skillId,
  now = nowIso,
  maxEvidenceAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS
}) {
  if (!Array.isArray(evalRecords) || evalRecords.length === 0) {
    promotionError('EVAL_EVIDENCE_MISSING', 'promotion requires at least one behavioral eval record');
  }
  const tree = evidenceRoot ?? root;
  const bound = [];
  const corpusRefs = new Set();
  for (const entry of evalRecords) {
    if (!isNonEmptyString(entry?.record_ref) || !isNonEmptyString(entry?.corpus_ref) || !isNonEmptyString(entry?.baseline_record_ref)) {
      promotionError('EVAL_EVIDENCE_SHAPE_INVALID', 'every bound evaluation names a record_ref, a corpus_ref and a baseline_record_ref');
    }
    if (entry.record !== undefined) {
      promotionError('EVAL_EVIDENCE_INLINE_RECORD_FORBIDDEN', `${entry.record_ref}: the evaluation is read from the canonical evidence surface; a caller-supplied record object legitimizes nothing`);
    }
    let attestation;
    try {
      attestation = await verifyEvidenceProvenance({
        root: tree,
        recordRef: entry.record_ref,
        corpusRef: entry.corpus_ref,
        baselineRecordRef: entry.baseline_record_ref,
        expectedDigest: entry.expected_digest ?? null,
        skillId,
        now,
        maxEvidenceAgeDays,
        validate: (record) => validateBehavioralEvalRecord(record, root)
      });
    } catch (error) {
      promotionError(error?.code || 'EVIDENCE_PROVENANCE_FAILED', error.message);
    }
    corpusRefs.add(attestation.corpus_ref);
    bound.push(attestation);
  }
  if (corpusRefs.size !== 1) {
    promotionError('EVIDENCE_CORPUS_MISMATCH', `the bound evidence comes from ${corpusRefs.size} different corpora; one promotion binds one corpus`);
  }
  const corpusDigests = new Set(bound.map((entry) => entry.corpus_digest));
  if (corpusDigests.size !== 1) {
    promotionError('EVIDENCE_CORPUS_MISMATCH', `the bound evidence resolves to ${corpusDigests.size} different corpus digests; one promotion binds one corpus`);
  }
  const improvementProven = bound.some((entry) => entry.verdict === 'IMPROVEMENT_PROVEN');
  return {
    behavioral_eval_records: bound,
    improvement_proven: improvementProven,
    corpus_ref: [...corpusRefs][0],
    corpus_digest: [...corpusDigests][0],
    max_evidence_age_days: maxEvidenceAgeDays,
    provenance_verified: true
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
  frontdoorAdmissionDigest = null,
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
      frontdoorAdmissionDigest,
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
  // The canonical root is mandatory and must be a directory: an empty value
  // would resolve to the process working directory and retarget the whole
  // write set.
  if (!isNonEmptyString(canonicalRoot)) {
    promotionError('PROMOTION_CANONICAL_ROOT_MISSING', 'the promotion requires a canonical root; it never targets the process working directory');
  }
  const root = path.resolve(canonicalRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    promotionError('PROMOTION_CANONICAL_ROOT_MISSING', `the canonical root ${root} is not a readable directory`);
  }
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
  if (record.eval_evidence?.provenance_verified !== true) {
    issues.push('eval_evidence: the evidence was not traced back to its immutable execution results');
  }
  for (const entry of records) {
    if (entry.subject_ref !== record.candidate?.skill_id) {
      issues.push(`eval_evidence: ${entry.record_ref} measured subject "${entry.subject_ref}", not the promoted skill`);
    }
    if (entry.execution_rederived !== true) {
      issues.push(`eval_evidence: ${entry.record_ref} was not re-executed over its corpus`);
    }
    if (entry.comparison_rederived !== true) {
      issues.push(`eval_evidence: ${entry.record_ref} was not re-derived from its baseline`);
    }
  }
  if (record.candidate?.content_digest !== record.candidate?.candidate_digest) {
    issues.push('candidate: the screened content digest differs from the adopted content digest');
  }
  if (record.frontdoor_admission?.content_digest !== record.candidate?.candidate_digest) {
    issues.push('frontdoor_admission: the frontdoor screened other content than the adopted content');
  }
  if (record.owner_approval?.frontdoor_admission_digest !== record.frontdoor_admission?.admission_digest) {
    issues.push('frontdoor_admission: the owner approval does not bind the admission digest of this adoption');
  }
  if (record.owner_approval?.candidate_digest !== record.candidate?.candidate_digest) {
    issues.push('owner_approval: the approval does not bind the adopted content');
  }
  // The admission binds the evidence to the adopted content and to a proved
  // source. An adoption record without it is not representable.
  if (record.evidence_admission?.content_digest !== record.candidate?.candidate_digest) {
    issues.push('evidence_admission: the admitted evidence is not admitted for the adopted content');
  }
  if (record.evidence_admission?.authority_granted !== false) {
    issues.push('evidence_admission: an admission is a binding and never grants authority');
  }
  if (!['git_commit', 'content'].includes(record.evidence_admission?.source_kind)) {
    issues.push('evidence_admission: the admitted evidence has no proved source identity');
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
// evalRecords, ownerApprovalRef, ownerAuthorityPath, canonicalRoot,
// evidenceRoot, now, maxEvidenceAgeDays, maxApprovalAgeDays,
// onExportsWritten }) -> { record, issues, canonicalPath }.
//
// TEST SEAMS: `ownerAuthorityPath`, `maxEvidenceAgeDays`,
// `maxApprovalAgeDays`, `evidenceRoot` and `onExportsWritten` are injection
// points for the tests. The production entry point (runCli) pins the first
// four and never passes the fifth: the trust anchor, the age bounds and the
// evidence tree are read from the pinned canonical location of this
// installation, so an input file can never widen a gate of the promotion
// chain. `onExportsWritten` runs between the export write and the export
// readback; the adopted content is verified AGAIN after the export step, so
// a hook cannot make the promotion report success over a tree state that
// violates its own invariant.
//
// Executes the full chain against the caller-provided canonicalRoot (a real
// promotion on the live tree is an owner act), regenerates the canonical
// registry and provider exports and verifies them by readback, and performs
// the post-adoption readback fail-closed. A record that does not satisfy the
// contract leaves NO mutation behind: the canonical file AND the regenerated
// exports are restored before the issues are returned.
export async function promoteSkillCandidate({
  adoptionId,
  skillId,
  adoptedVersion,
  supersededVersion,
  candidateContent,
  candidateDigest,
  admissionPath,
  evalRecords,
  evidenceAdmissionRef,
  ownerApprovalRef,
  ownerAuthorityPath = path.join(REPO_ROOT, CANONICAL_OWNER_AUTHORITY_PATH),
  canonicalRoot,
  evidenceRoot = null,
  now = nowIso,
  root = REPO_ROOT,
  maxEvidenceAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS,
  maxApprovalAgeDays = DEFAULT_MAX_APPROVAL_AGE_DAYS,
  onExportsWritten = null
}) {
  const paths = resolveCanonicalPaths({ canonicalRoot, skillId });
  const admission = validateFrontdoorAdmission({ admissionPath, canonicalRoot, root });
  // The screened TREE identity (the whole-candidate directory digest in
  // candidate.source_revision) is provenance: it names the exact tree the
  // analyzers ran over and is recorded in the adoption record.
  const screenedDigest = screenedDigestOf(admission.record);

  // The promotion may only adopt what the frontdoor screened, for the skill
  // the frontdoor screened and in the CONTENT form both sides bind: an
  // admission for another skill or another content never authorizes this
  // adoption. The content digest is the receipt's own candidate.content_digest
  // (the sha256 of the screened SKILL.md bytes) — the same form as the
  // promoted content; the whole-tree source_revision digest is a different
  // identity and is never compared against it.
  if (admission.record.candidate.skill_id !== skillId) {
    promotionError('PROMOTION_CANDIDATE_IDENTITY_MISMATCH', `the frontdoor screened skill "${admission.record.candidate.skill_id}", not "${skillId}"`);
  }
  if (admission.record.candidate.content_digest !== candidateDigest) {
    promotionError('PROMOTION_CANDIDATE_CONTENT_MISMATCH', `the frontdoor screened content ${admission.record.candidate.content_digest}, the promoted content digests to ${candidateDigest}`);
  }

  // The evidence tree is resolved ONCE: the gate and the post-adoption
  // readback must read the SAME evidence, otherwise the readback would
  // verify a different tree than the one the gate verified.
  const evidenceTree = evidenceRoot ?? root;
  const evalEvidence = await validateEvalEvidence({
    evalRecords,
    root,
    evidenceRoot: evidenceTree,
    skillId,
    now,
    maxEvidenceAgeDays
  });
  // The S8 gate proved that the bound evaluation REPRODUCES. The owner
  // approval is the DECISION that the content may be adopted. The approval
  // binds the frontdoor admission in its SIGNED payload: the owner decision
  // covers exactly the screened receipt this promotion consumes, so a
  // fabricated or substituted admission fails the owner signature. The
  // admission gate then proves the two bindings that stand above both: the
  // evidence is admitted FOR the content that is being adopted (and that the
  // evaluation MEASURED that content), and it comes from a source whose
  // committed identity is proved. The admission is verified against the
  // attestation the S8 gate just produced, so a substituted path or a
  // manipulated digest cannot be admitted.
  const approval = validateOwnerApproval({
    ownerApprovalRef,
    ownerAuthorityPath,
    canonicalRoot,
    candidateDigest,
    skillId,
    frontdoorAdmissionDigest: admission.digest,
    root,
    now,
    maxApprovalAgeDays
  });
  let evidenceAdmission;
  try {
    evidenceAdmission = verifyEvidenceAdmission({
      root: evidenceTree,
      admissionRef: evidenceAdmissionRef,
      attestations: evalEvidence.behavioral_eval_records,
      skillId,
      candidateDigest,
      validate: (candidate) => validateInstanceAgainstContract(candidate, EVIDENCE_ADMISSION_CONTRACT, root)
    });
  } catch (error) {
    promotionError(error?.code || 'EVIDENCE_ADMISSION_FAILED', error.message);
  }

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
    evidence_admission: evidenceAdmission,
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
      screened_digest: screenedDigest,
      // The CONTENT digest the frontdoor screened — the same form as the
      // candidate digest; the readback compares the two.
      content_digest: admission.record.candidate.content_digest
    },
    frontdoor_admission: {
      record_ref: admission.relative,
      admission_digest: admission.digest,
      implementation_disposition: 'ELIGIBLE',
      screened_digest: screenedDigest,
      content_digest: admission.record.candidate.content_digest
    },
    eval_evidence: evalEvidence,
    evidence_admission: evidenceAdmission,
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
    // The adoption was NOT applied: the record is not returned, so no
    // consumer can read a record that claims a promotion that never
    // happened. The issues carry the reasons.
    return { record: null, issues, canonicalPath: paths.canonicalPath, admissionDigest: admission.digest };
  }

  // The readback runs BEFORE the ledger entry is written: the adopted file,
  // the regenerated exports, the owner approval and the bound evidence must
  // still be the ones the record describes. (The ledger entry itself is
  // checked by the standalone readback after the append.)
  const readbackIssues = await postAdoptionReadback({
    record,
    canonicalRoot,
    evidenceRoot: evidenceTree,
    validate: (candidate) => validateBehavioralEvalRecord(candidate, root),
    root,
    now,
    expectLedgerEntry: false
  });
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

// postAdoptionReadback({ record, canonicalRoot, evidenceRoot, validate,
// now }) -> string[] issues.
// Re-reads the adopted canonical file and the bound inputs; the adoption
// digest must still match the record. Exported for tests and for the
// standalone readback after the fact.
//
// The bound evidence is re-VERIFIED, not merely re-read: the evaluation is
// executed again over the corpus and the verdict is derived again from the
// baseline. A receipt that stopped reproducing between the gate and the
// adoption is a failed readback.
export async function postAdoptionReadback({ record, canonicalRoot, evidenceRoot = null, validate = null, root = REPO_ROOT, now = nowIso, expectLedgerEntry = true }) {
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
  // The approval must bind exactly the admission the record consumed: a
  // record whose approval binding and admission digest disagree does not
  // describe a coherent chain, even when both artifacts individually
  // verify.
  if (record.frontdoor_admission?.admission_digest !== undefined
    && record.owner_approval?.frontdoor_admission_digest !== record.frontdoor_admission.admission_digest) {
    issues.push('post_adoption_readback: the owner approval does not bind the admission digest of this adoption');
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
  // The bound evidence is re-VERIFIED: the evaluation is executed again over
  // the corpus and the verdict is derived again from the baseline. The
  // evidence that vouched for the adoption must still reproduce.
  const boundEvidence = record.eval_evidence?.behavioral_eval_records ?? [];
  if (boundEvidence.length > 0 && !evidenceRoot) {
    // A silent skip would turn the readback into a weaker check than the
    // claim says it is. The gap is reported instead.
    issues.push('post_adoption_readback: the bound evidence was not re-verified: no evidence tree was given');
  } else if (boundEvidence.length > 0 && !record.evidence_admission) {
    // A record with bound evidence and no admission is a record whose
    // evidence was never admitted for the adopted content. The gap is
    // reported, not skipped.
    issues.push('post_adoption_readback: the bound evidence has no admission: the evidence was not admitted for the adopted content');
  } else if (evidenceRoot) {
    for (const entry of boundEvidence) {
      try {
        const reattested = await verifyEvidenceProvenance({
          root: evidenceRoot,
          recordRef: entry.record_ref,
          corpusRef: entry.corpus_ref,
          baselineRecordRef: entry.baseline_record_ref,
          expectedDigest: entry.content_digest,
          skillId: record.candidate?.skill_id ?? null,
          now,
          validate
        });
        if (reattested.record_digest !== entry.record_digest) {
          issues.push(`post_adoption_readback: the behavioral eval record ${entry.record_ref} digests to ${reattested.record_digest}, record binds ${entry.record_digest}`);
        }
        if (reattested.corpus_digest !== entry.corpus_digest) {
          issues.push(`post_adoption_readback: the corpus of ${entry.record_ref} digests to ${reattested.corpus_digest}, record binds ${entry.corpus_digest}`);
        }
        if (reattested.verdict !== entry.verdict) {
          issues.push(`post_adoption_readback: the verdict of ${entry.record_ref} re-derives to ${reattested.verdict}, record binds ${entry.verdict}`);
        }
      } catch (error) {
        issues.push(`post_adoption_readback: the bound evidence ${entry.record_ref} no longer reproduces: ${error.message}`);
      }
    }
  }
  // The evidence admission is re-VERIFIED as well: the admission artifact
  // must still be the committed artifact that admitted the evidence for the
  // adopted content.
  const admissionRef = record.evidence_admission?.admission_ref;
  if (admissionRef) {
    if (!evidenceRoot) {
      issues.push('post_adoption_readback: the evidence admission was not re-verified: no evidence tree was given');
    } else {
      try {
        const readmitted = verifyEvidenceAdmission({
          root: evidenceRoot,
          admissionRef,
          attestations: boundEvidence,
          skillId: record.candidate?.skill_id ?? null,
          candidateDigest: record.candidate?.candidate_digest ?? null,
          validate: (candidate) => validateInstanceAgainstContract(candidate, EVIDENCE_ADMISSION_CONTRACT, root)
        });
        if (readmitted.admission_digest !== record.evidence_admission.admission_digest) {
          issues.push(`post_adoption_readback: the evidence admission ${admissionRef} digests to ${readmitted.admission_digest}, record binds ${record.evidence_admission.admission_digest}`);
        }
        if (readmitted.source_commit !== record.evidence_admission.source_commit) {
          issues.push(`post_adoption_readback: the committed source of the admitted material is ${readmitted.source_commit}, record binds ${record.evidence_admission.source_commit}`);
        }
      } catch (error) {
        issues.push(`post_adoption_readback: the evidence admission ${admissionRef} no longer holds: ${error.message}`);
      }
    }
  }
  return issues;
}

export async function runCli(args) {
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
  // The CLI accepts an ALLOWLIST of inputs. Neither the trust anchor, nor the
  // evidence age bound, nor the evidence tree is part of it: the canonical
  // owner authority and the behavioral evidence are read from the pinned
  // canonical location of this installation, and the freshness bound is
  // fixed by the contract, so an input file can never widen a gate of the
  // promotion chain.
  const {
    adoption_id: adoptionId,
    skill_id: skillId,
    adopted_version: adoptedVersion,
    superseded_version: supersededVersion,
    candidate_content: candidateContent,
    candidate_digest: candidateDigest,
    admission_path: admissionPath,
    eval_records: evalRecords,
    evidence_admission_ref: evidenceAdmissionRef,
    owner_approval_ref: ownerApprovalRef,
    canonical_root: canonicalRoot
  } = input ?? {};
  // The canonical root is MANDATORY: without it the write set would silently
  // target the process working directory, and the containment proof would
  // hold relative to that directory instead of the tree the owner chose.
  if (!isNonEmptyString(canonicalRoot)) {
    return { ok: false, issues: ['PROMOTION_CANONICAL_ROOT_MISSING: the adoption input names no canonical_root; the promotion never targets the process working directory'], record: null };
  }
  const resolvedCanonicalRoot = path.resolve(canonicalRoot);
  if (!fs.existsSync(resolvedCanonicalRoot) || !fs.statSync(resolvedCanonicalRoot).isDirectory()) {
    return { ok: false, issues: [`PROMOTION_CANONICAL_ROOT_MISSING: the canonical root ${resolvedCanonicalRoot} is not a readable directory`], record: null };
  }
  try {
    const { record, issues } = await promoteSkillCandidate({
      adoptionId,
      skillId,
      adoptedVersion,
      supersededVersion,
      candidateContent,
      candidateDigest,
      admissionPath,
      evalRecords,
      evidenceAdmissionRef,
      ownerApprovalRef,
      ownerAuthorityPath: path.join(REPO_ROOT, CANONICAL_OWNER_AUTHORITY_PATH),
      canonicalRoot: resolvedCanonicalRoot,
      evidenceRoot: REPO_ROOT,
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
  const result = await runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
