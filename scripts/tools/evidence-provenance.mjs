#!/usr/bin/env node
// MAWS vNext — evidence provenance (slice S8, spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, spec sections 12.3/13.1/13.4).
//
// A behavioral eval record is a RECEIPT. A receipt is not verification: a
// caller that hands the promotion chain a record object, a digest and a
// verdict has asserted nothing that was executed. The evidence is only
// legitimate when it can be traced back to immutable execution results.
//
// This module is that trace. It does not trust the record, the digest or the
// verdict it is given:
//
//   E1  the evidence record is READ FROM DISK at a constrained reference; it
//       is never supplied by the caller;
//   E2  the record must satisfy its own content seal (it was not edited after
//       it was sealed);
//   E3  the record must name the corpus it was produced from, and the corpus
//       must exist in the same tree;
//   E4  the corpus is RE-HASHED from disk: every family and every variant
//       file is re-digested, so a corpus that moved under the record breaks
//       the binding;
//   E5  the evaluation is RE-EXECUTED over that corpus (the recorded replay
//       of the corpus transcripts) and the re-executed metrics, per-family
//       results and security gate must reproduce the record field for field.
//       A record whose measurements do not follow from the corpus is refused;
//   E6  the baseline record is read from disk, re-executed the same way, and
//       the comparison AND the verdict are RE-DERIVED from it. A verdict that
//       the baseline does not support is refused;
//   E7  the corpus subject, the record subject and the promoted skill are the
//       same subject, and the evidence age stays inside the contract bound.
//
// Only a recorded_replay evaluation can be re-executed deterministically, so
// only a recorded_replay record is verifiable here. A live_model record is
// refused with a named reason instead of being silently accepted.
//
// Receipt != Verification: this module proves that a receipt reproduces. It
// grants no permission, no qualification and no authority, and it never
// promotes a skill.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { canonicalJson, nowIso } from '../../runtime/vnext/util.mjs';
import { assertCanonicalTarget, CanonicalPathError } from '../../runtime/skills/canonical-path.mjs';
import {
  loadCorpus,
  runVariant,
  compareRecords,
  computeContentDigest
} from './run-skill-effectiveness-evals.mjs';

export const EVIDENCE_PROVENANCE_CONTRACT = 'core/contracts/evidence-provenance.schema.json';
// The canonical evidence surface inside the governed tree.
export const EVIDENCE_RECORD_BASE = 'evidence';
// The canonical corpus surface inside the governed tree.
export const EVAL_CORPUS_BASE = 'evals';
export const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 90;
// The canonical runner that produces (and can re-execute) a behavioral eval
// record. The attestation names it and binds its digest, so a receipt names
// the exact evaluation code that reproduces it.
export const EVIDENCE_RUNNER_REF = 'scripts/tools/run-skill-effectiveness-evals.mjs';
// Clock skew allowance for a record's declared creation time (minutes). A
// record dated in the future is refused: a measurement cannot have been
// taken before it claims to have been taken.
export const EVIDENCE_CLOCK_SKEW_MINUTES = 5;

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RECORD_REF_PATTERN = /^evidence\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.json$/;
const CORPUS_REF_PATTERN = /^evals\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export class EvidenceProvenanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceProvenanceError';
    this.code = code;
  }
}

function provenanceError(code, message) {
  throw new EvidenceProvenanceError(code, message);
}

// The S5 corpus loader refuses a corpus file that leaves the corpus
// directory BEFORE the corpus is loaded: a symlink out of the corpus, a
// declared path that leaves it, or a file that carries more than one link
// and so may carry material from outside. That is the same defect this
// module's own containment proof reports, detected one layer earlier - the
// loader refuses it before there is a corpus object to inspect. The
// specific code is therefore kept in both layers, so that a corpus whose
// content leaves the tree is reported as exactly that and not as a generic
// "could not be loaded".
const CORPUS_CONTENT_ESCAPE_CODES = new Set([
  'CORPUS_PATH_SYMLINK_ESCAPE',
  'CORPUS_PATH_ESCAPES_ROOT',
  'CORPUS_PATH_MULTIPLE_LINKS'
]);

function corpusLoadError(error, prefix) {
  if (error && typeof error.code === 'string' && CORPUS_CONTENT_ESCAPE_CODES.has(error.code)) {
    provenanceError('EVIDENCE_CORPUS_CONTENT_ESCAPES', `the corpus content does not stay inside the corpus directory: ${error.message}`);
  }
  provenanceError('EVIDENCE_CORPUS_INVALID', `${prefix}: ${error.message}`);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function sha256Canonical(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function resolveNowMs(clock) {
  if (typeof clock === 'function') return resolveNowMs(clock());
  if (clock instanceof Date) return clock.getTime();
  return Date.parse(String(clock));
}

// resolveEvidencePath({ root, ref, base, pattern, label }) -> { absolute,
// relative }. The reference is constrained twice: by the canonical pattern
// (so it can only address a surface of this kind) and by the containment
// proof of the path (so it can only address a file inside the tree, never
// through a symlink and never through a parent directory that leaves it).
function resolveEvidencePath({ root, ref, base, pattern, label }) {
  if (!isNonEmptyString(ref)) {
    provenanceError('EVIDENCE_REF_INVALID', `the ${label} reference is missing`);
  }
  const relative = path.posix.normalize(String(ref).replace(/\\/g, '/'));
  if (path.posix.isAbsolute(relative) || relative === '..' || relative.startsWith('../')) {
    provenanceError('EVIDENCE_REF_INVALID', `the ${label} reference "${ref}" escapes the evidence tree`);
  }
  if (!pattern.test(relative)) {
    provenanceError('EVIDENCE_REF_INVALID', `the ${label} reference "${ref}" does not match the canonical reference pattern`);
  }
  if (!relative.startsWith(`${base}/`)) {
    provenanceError('EVIDENCE_REF_INVALID', `the ${label} reference "${ref}" must live under ${base}/`);
  }
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, relative);
  if (!absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
    provenanceError('EVIDENCE_REF_INVALID', `the ${label} reference "${ref}" escapes the evidence tree`);
  }
  try {
    assertCanonicalTarget({ root: resolvedRoot, absolutePath: absolute, label });
  } catch (error) {
    if (error instanceof CanonicalPathError) {
      provenanceError('EVIDENCE_REF_INVALID', `the ${label} reference "${ref}" is not a contained file of the tree: ${error.message}`);
    }
    throw error;
  }
  return { absolute, relative };
}

// readEvidenceRecord({ root, ref }) -> { record, digest, relative, absolute }.
// The record is read from the canonical evidence surface and its whole-record
// digest is computed from the bytes on disk.
export function readEvidenceRecord({ root, ref }) {
  const { absolute, relative } = resolveEvidencePath({
    root,
    ref,
    base: EVIDENCE_RECORD_BASE,
    pattern: RECORD_REF_PATTERN,
    label: 'behavioral eval record'
  });
  let content;
  try {
    content = fs.readFileSync(absolute, 'utf8');
  } catch (error) {
    provenanceError('EVIDENCE_RECORD_MISSING', `the behavioral eval record ${relative} is not readable: ${error.message}`);
  }
  let record;
  try {
    record = JSON.parse(content);
  } catch (error) {
    provenanceError('EVIDENCE_RECORD_INVALID', `the behavioral eval record ${relative} is not readable JSON: ${error.message}`);
  }
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    provenanceError('EVIDENCE_RECORD_INVALID', `the behavioral eval record ${relative} must be an object`);
  }
  return { record, digest: sha256Canonical(record), relative, absolute };
}

// resolveCorpus({ root, corpusRef }) -> { absolute, relative }. The corpus is
// a directory in the canonical corpus surface.
function resolveCorpus({ root, corpusRef }) {
  const { absolute, relative } = resolveEvidencePath({
    root,
    ref: corpusRef,
    base: EVAL_CORPUS_BASE,
    pattern: CORPUS_REF_PATTERN,
    label: 'behavioral eval corpus'
  });
  let stats = null;
  try {
    stats = fs.statSync(absolute);
  } catch (error) {
    provenanceError('EVIDENCE_CORPUS_MISSING', `the behavioral eval corpus ${relative} is not readable: ${error.message}`);
  }
  if (!stats.isDirectory()) {
    provenanceError('EVIDENCE_CORPUS_INVALID', `the behavioral eval corpus ${relative} is not a directory`);
  }
  return { absolute, relative, dev: stats.dev, ino: stats.ino };
}

// corpusTreeDigest(corpus) -> the digest of the WHOLE corpus, recomputed
// from the files on disk. It covers every family file and every variant file,
// so a corpus that moved under a record changes this digest. The per-family
// digest form is the producer's own form (sha256 over {file, cases}), so the
// corpus digest is comparable with the digests the record itself carries.
export function corpusTreeDigest(corpus) {
  const families = [];
  for (const [name, family] of corpus.families) {
    // The positive family is variant specific; both variants are covered
    // below, so it must not be counted twice.
    if (name === 'positive') continue;
    families.push({
      family: name,
      blocking: family.blocking === true,
      digest: sha256Canonical({ file: family.logical_file, cases: family.cases })
    });
  }
  families.sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0));
  const variants = [];
  for (const [name, variant] of corpus.variants) {
    variants.push({
      variant: name,
      file: variant.positive_cases_logical_file,
      digest: sha256Canonical({ file: variant.positive_cases_logical_file, cases: variant.positive_cases })
    });
  }
  variants.sort((a, b) => (a.variant < b.variant ? -1 : a.variant > b.variant ? 1 : 0));
  return sha256Canonical({
    corpus_id: corpus.manifest?.corpus_id ?? null,
    subject: corpus.subject,
    families,
    variants
  });
}

// The fields the runner produces from the corpus. The verdict and the
// comparison are NOT among them: they are derived from the comparison with
// the baseline and are re-derived separately.
//
// `eval_id` is deliberately NOT among them: it is an identity LABEL of the
// evaluation, not a measurement, and no corpus determines it. A label that
// the record carries and the re-execution copies back would only ever
// compare equal to itself, so claiming it "reproduces" would be tautology.
// The record itself is bound by its digest in the attestation.
const EXECUTION_FIELDS = [
  'schema_version',
  'variant',
  'subject',
  'model_run',
  'case_families',
  'metrics',
  'security_gate',
  'evidence_refs'
];

// executionDifferences(record, rederived) -> string[]. The fields of the
// record that the re-execution must reproduce exactly.
export function executionDifferences(record, rederived) {
  const differences = [];
  for (const field of EXECUTION_FIELDS) {
    if (canonicalJson(record?.[field]) !== canonicalJson(rederived?.[field])) {
      differences.push(`${field}: record=${canonicalJson(record?.[field])} rederived=${canonicalJson(rederived?.[field])}`);
    }
  }
  const recordCorpusDigest = record?.reproducibility?.corpus_digest;
  const rederivedCorpusDigest = rederived?.reproducibility?.corpus_digest;
  if (recordCorpusDigest !== rederivedCorpusDigest) {
    differences.push(`reproducibility.corpus_digest: record=${recordCorpusDigest} rederived=${rederivedCorpusDigest}`);
  }
  const recordRunner = record?.reproducibility?.runner;
  const rederivedRunner = rederived?.reproducibility?.runner;
  if (recordRunner !== rederivedRunner) {
    differences.push(`reproducibility.runner: record=${recordRunner} rederived=${rederivedRunner}`);
  }
  return differences;
}

// assertCorpusContentInside({ corpus, corpusDir }) -> the corpus content
// files, each proven to stay inside the corpus directory.
//
// The corpus DIRECTORY is already proven to stay inside the tree. Its
// CONTENT was not: a family file that is a symbolic link to a file outside
// the tree would be read by the loader, and the measured material would then
// live outside the governed tree while the corpus digest still binds it. The
// containment proof is therefore repeated for every file the corpus names.
function assertCorpusContentInside({ corpus, corpusDir }) {
  const files = [];
  for (const family of corpus.families.values()) {
    if (family.file) files.push(family.file);
  }
  for (const variant of corpus.variants.values()) {
    if (variant.positive_cases_file) files.push(variant.positive_cases_file);
  }
  if (corpus.subjectContentPath) files.push(corpus.subjectContentPath);
  for (const absolute of files) {
    try {
      assertCanonicalTarget({ root: corpusDir, absolutePath: absolute, label: 'corpus content file' });
    } catch (error) {
      if (error instanceof CanonicalPathError) {
        provenanceError('EVIDENCE_CORPUS_CONTENT_ESCAPES', `the corpus content file ${absolute} does not stay inside the corpus directory: ${error.message}`);
      }
      throw error;
    }
  }
}

// reExecute({ corpus, record }) -> { corpus, rederived }. The evaluation is
// re-executed over the CORPUS OBJECT the caller loaded, never over a fresh
// load of the directory: a second load would be a second read of the
// filesystem, and a writer racing the verification could then let the
// attestation describe one corpus while the measurements derive from
// another. Every execution gets its own STRUCTURED CLONE of the one loaded
// corpus instead — the runner mutates the positive family per variant, so
// sharing one object between executions would leak one variant into the
// other, but the clone derives from the same single read.
//
// The re-execution is seeded from the CORPUS, not from the record: the
// instruction revision is the corpus' own declaration, and the evidence
// references are the corpus default. A record that seeds the re-execution
// with its own values would only ever be compared with itself.
async function reExecute({ corpus, record }) {
  let rederived = null;
  try {
    rederived = await runVariant({
      corpus: structuredClone(corpus),
      variant: record.variant,
      mode: 'recorded_replay',
      evalId: record.eval_id,
      instructionRevision: corpus.manifest?.subject?.instruction_revision ?? null
    });
  } catch (error) {
    provenanceError('EVIDENCE_EXECUTION_FAILED', `the evaluation could not be re-executed over the corpus: ${error.message}`);
  }
  return { corpus, rederived };
}

// assertRecordSealed({ record, relative }) -> the recomputed content seal.
function assertRecordSealed({ record, relative }) {
  const sealed = computeContentDigest(record);
  const claimed = record.reproducibility?.content_digest;
  if (claimed !== sealed) {
    provenanceError('EVIDENCE_RECORD_SEAL_MISMATCH', `the behavioral eval record ${relative} does not satisfy its own content seal: it carries ${String(claimed)}, the recomputed seal is ${sealed}`);
  }
  return sealed;
}

// assertRecordValid({ record, relative, validate }) -> the contract and
// semantic issues of the record. A record that violates its own contract is
// not evidence.
function assertRecordValid({ record, relative, validate }) {
  if (typeof validate === 'function') {
    const issues = validate(record) ?? [];
    if (issues.length > 0) {
      provenanceError('EVIDENCE_RECORD_INVALID', `the behavioral eval record ${relative} violates its contract: ${issues.join('; ')}`);
    }
  }
}

// assertRecordReplayable({ record, relative }) -> the mode gate.
function assertRecordReplayable({ record, relative }) {
  const mode = record.model_run?.mode;
  if (mode !== 'recorded_replay') {
    provenanceError('EVIDENCE_MODE_UNVERIFIABLE', `the behavioral eval record ${relative} was produced in ${String(mode)} mode; only a recorded_replay evaluation can be re-executed and traced back to immutable execution results`);
  }
}

// runnerDigest() -> the digest of the canonical runner source, so the
// attestation names the exact evaluation code that reproduces the record.
// A runner that cannot be read is a NAMED refusal: an attestation that
// names no code reproduces nothing.
function runnerDigest() {
  let content;
  try {
    const runnerPath = fileURLToPath(new URL('./run-skill-effectiveness-evals.mjs', import.meta.url));
    content = fs.readFileSync(runnerPath, 'utf8');
  } catch (error) {
    provenanceError('EVIDENCE_RUNNER_UNREADABLE', `the canonical runner ${EVIDENCE_RUNNER_REF} could not be read, so no attestation can name the code that reproduces the record: ${error.message}`);
  }
  return sha256Canonical(content);
}

// verifyEvidenceProvenance({ root, recordRef, corpusRef, baselineRecordRef,
// expectedDigest, skillId, now, maxEvidenceAgeDays, validate })
//   -> the provenance attestation.
//
// The attestation is the proof that the bound record is the receipt of an
// execution that reproduces: the record reproduces from the corpus, the
// corpus reproduces from its files, and the verdict reproduces from the
// baseline. Every check fails closed.
export async function verifyEvidenceProvenance({
  root,
  recordRef,
  corpusRef,
  baselineRecordRef = null,
  expectedDigest = null,
  skillId = null,
  now = nowIso,
  maxEvidenceAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS,
  validate = null
}) {
  // E1: the record is read from disk. Nothing about it is supplied by the
  // caller.
  const candidate = readEvidenceRecord({ root, ref: recordRef });
  const record = candidate.record;

  // E2: the record must satisfy its own seal.
  const sealedDigest = assertRecordSealed({ record, relative: candidate.relative });

  // The record must be a valid behavioral eval record.
  assertRecordValid({ record, relative: candidate.relative, validate });

  // E3/E4: the corpus is resolved in the same tree and re-hashed from disk.
  const corpus = resolveCorpus({ root, corpusRef: corpusRef });
  if (record.reproducibility?.corpus_ref !== path.posix.basename(corpus.relative)) {
    provenanceError('EVIDENCE_CORPUS_MISMATCH', `the behavioral eval record ${candidate.relative} names corpus "${String(record.reproducibility?.corpus_ref)}", the resolved corpus is "${path.posix.basename(corpus.relative)}"`);
  }

  // E5: only a replayable evaluation can be traced back to immutable
  // execution results.
  assertRecordReplayable({ record, relative: candidate.relative });

  if (record.variant !== 'CANDIDATE') {
    provenanceError('EVIDENCE_VARIANT_UNSUPPORTED', `the promotion binds candidate evaluations; ${candidate.relative} is a ${String(record.variant)} record`);
  }

  // The corpus subject and the record subject are the same subject.
  let loadedCorpus = null;
  try {
    loadedCorpus = loadCorpus(corpus.absolute);
  } catch (error) {
    corpusLoadError(error, `the behavioral eval corpus ${corpus.relative} could not be loaded`);
  }
  if (loadedCorpus.subject?.ref !== record.subject?.ref) {
    provenanceError('EVIDENCE_SUBJECT_MISMATCH', `the corpus ${corpus.relative} measures subject "${String(loadedCorpus.subject?.ref)}", the record ${candidate.relative} claims subject "${String(record.subject?.ref)}"`);
  }
  if (skillId !== null && record.subject?.ref !== skillId) {
    provenanceError('EVIDENCE_SUBJECT_MISMATCH', `the behavioral eval record ${candidate.relative} measured subject "${String(record.subject?.ref)}", not the promoted skill "${skillId}"`);
  }

  // The ONE corpus load of this verification: the containment sweep, the
  // subject check, both re-executions and the attestation's corpus digest
  // all derive from this single object, so a writer racing the verification
  // cannot let the attestation describe one corpus while the measurements
  // derive from another.
  assertCorpusContentInside({ corpus: loadedCorpus, corpusDir: corpus.absolute });

  // E5: the evaluation is re-executed over that corpus and must reproduce
  // the record field for field.
  const candidateRun = await reExecute({ corpus: loadedCorpus, record });
  const candidateDifferences = executionDifferences(record, candidateRun.rederived);
  if (candidateDifferences.length > 0) {
    provenanceError('EVIDENCE_EXECUTION_MISMATCH', `the behavioral eval record ${candidate.relative} does not reproduce from the corpus ${corpus.relative}: ${candidateDifferences.join('; ')}`);
  }

  // E6: the baseline is read from disk, sealed, valid, replayable and
  // re-executed the same way.
  if (!isNonEmptyString(baselineRecordRef)) {
    provenanceError('EVIDENCE_BASELINE_MISSING', `the candidate evaluation ${candidate.relative} names no baseline record; a candidate verdict is only derivable against a baseline`);
  }
  const baseline = readEvidenceRecord({ root, ref: baselineRecordRef });
  const baselineRecord = baseline.record;
  assertRecordSealed({ record: baselineRecord, relative: baseline.relative });
  assertRecordValid({ record: baselineRecord, relative: baseline.relative, validate });
  assertRecordReplayable({ record: baselineRecord, relative: baseline.relative });
  if (baselineRecord.variant !== 'BASELINE') {
    provenanceError('EVIDENCE_BASELINE_MISMATCH', `the baseline ${baseline.relative} is a ${String(baselineRecord.variant)} record, not a BASELINE record`);
  }
  if (baselineRecord.verdict !== 'BASELINE_RECORDED') {
    provenanceError('EVIDENCE_BASELINE_MISMATCH', `the baseline ${baseline.relative} carries verdict "${String(baselineRecord.verdict)}", a baseline that is not BASELINE_RECORDED cannot support a comparison`);
  }
  if (baselineRecord.subject?.ref !== record.subject?.ref) {
    provenanceError('EVIDENCE_SUBJECT_MISMATCH', `the baseline ${baseline.relative} measured subject "${String(baselineRecord.subject?.ref)}", the candidate ${candidate.relative} measured "${String(record.subject?.ref)}"`);
  }
  const baselineRun = await reExecute({ corpus: loadedCorpus, record: baselineRecord });
  const baselineDifferences = executionDifferences(baselineRecord, baselineRun.rederived);
  if (baselineDifferences.length > 0) {
    provenanceError('EVIDENCE_EXECUTION_MISMATCH', `the baseline record ${baseline.relative} does not reproduce from the corpus ${corpus.relative}: ${baselineDifferences.join('; ')}`);
  }

  // The corpus directory is re-anchored after the re-executions: a corpus
  // that was REPLACED while it was being verified is refused before any
  // attestation is produced. A same-inode in-place rewrite is the documented
  // residual R1 of the confinement primitive: such a writer holds write
  // access to the corpus and the change is visible in the digests the
  // attestation binds (the corpus digest and the subject content digest are
  // computed from the one loaded corpus the measurements derive from).
  let corpusNow = null;
  try {
    corpusNow = fs.statSync(corpus.absolute);
  } catch (error) {
    provenanceError('EVIDENCE_CORPUS_CHANGED', `the behavioral eval corpus ${corpus.relative} could not be re-anchored after the re-execution: ${error.message}`);
  }
  if (corpusNow.dev !== corpus.dev || corpusNow.ino !== corpus.ino) {
    provenanceError('EVIDENCE_CORPUS_CHANGED', `the behavioral eval corpus ${corpus.relative} changed while it was being verified; the measurements and the attestation would not describe the same corpus`);
  }

  // E6: the comparison and the verdict are re-derived from the baseline that
  // is on disk. A verdict the baseline does not support is refused.
  const derivedCandidate = structuredClone(record);
  const derivedBaseline = structuredClone(baselineRecord);
  try {
    compareRecords(derivedBaseline, derivedCandidate);
  } catch (error) {
    provenanceError('EVIDENCE_COMPARISON_MISMATCH', `the comparison of ${candidate.relative} against ${baseline.relative} could not be derived: ${error.message}`);
  }
  if (canonicalJson(derivedCandidate.comparison) !== canonicalJson(record.comparison)) {
    provenanceError('EVIDENCE_COMPARISON_MISMATCH', `the comparison of ${candidate.relative} against ${baseline.relative} does not reproduce: record=${canonicalJson(record.comparison)} rederived=${canonicalJson(derivedCandidate.comparison)}`);
  }
  if (derivedCandidate.verdict !== record.verdict) {
    provenanceError('EVIDENCE_COMPARISON_MISMATCH', `the verdict of ${candidate.relative} does not follow from its baseline: record=${String(record.verdict)} rederived=${String(derivedCandidate.verdict)}`);
  }
  if (derivedCandidate.baseline_ref !== record.baseline_ref) {
    provenanceError('EVIDENCE_COMPARISON_MISMATCH', `the baseline reference of ${candidate.relative} does not follow from the baseline on disk: record=${String(record.baseline_ref)} rederived=${String(derivedCandidate.baseline_ref)}`);
  }

  // A blocked evaluation never supports a promotion.
  if (record.verdict === 'BLOCKED') {
    provenanceError('EVIDENCE_BLOCKED', `the behavioral eval ${candidate.relative} is BLOCKED and can never support a promotion`);
  }

  // E7: the DECLARED age of the evidence stays inside the contract bound.
  //
  // The bound is a property the record DECLARES: the content seal does not
  // cover the creation time, so an editor of the evidence tree can re-date a
  // record. The gate therefore states the bound honestly: it refuses a stale
  // declaration and a declaration from the future, and it does NOT claim to
  // authenticate the timestamp. The freshness of the MEASUREMENT is carried
  // by the re-execution, which happens now, over the corpus on disk. The
  // binding of the corpus to the MEASURED CONTENT is carried by the subject
  // content digest: the corpus loader verified the subject content against
  // its declared digest before any case ran, the re-execution re-derives the
  // subject from the corpus, and the admission gate binds that digest to the
  // adopted content.
  const nowMs = resolveNowMs(now);
  if (Number.isNaN(nowMs)) {
    provenanceError('EVIDENCE_STALE', `the behavioral eval ${candidate.relative} could not be compared against a valid clock`);
  }
  const createdAt = Date.parse(record.created_at);
  if (Number.isNaN(createdAt)) {
    provenanceError('EVIDENCE_STALE', `the behavioral eval ${candidate.relative} carries no usable created_at`);
  }
  if (createdAt > nowMs + EVIDENCE_CLOCK_SKEW_MINUTES * 60000) {
    provenanceError('EVIDENCE_STALE', `the behavioral eval ${candidate.relative} is dated in the future (${record.created_at}); a measurement cannot have been taken before it claims to have been taken`);
  }
  const ageDays = (nowMs - createdAt) / 86400000;
  if (ageDays > maxEvidenceAgeDays) {
    provenanceError('EVIDENCE_STALE', `the behavioral eval ${candidate.relative} declares an age of ${ageDays.toFixed(1)} days, the bound is ${maxEvidenceAgeDays} days`);
  }

  // The caller's expectation is checked against the truth, never the other
  // way round: a caller digest can only narrow the gate, never widen it.
  if (expectedDigest !== null && expectedDigest !== undefined) {
    if (!DIGEST_PATTERN.test(String(expectedDigest))) {
      provenanceError('EVIDENCE_DIGEST_MISMATCH', `the expected digest "${String(expectedDigest)}" is not a canonical digest`);
    }
    if (expectedDigest !== sealedDigest) {
      provenanceError('EVIDENCE_DIGEST_MISMATCH', `the expected digest ${expectedDigest} does not match the seal of the record on disk ${sealedDigest}`);
    }
  }

  return {
    schema_version: '1.0.0',
    record_ref: candidate.relative,
    record_digest: candidate.digest,
    content_digest: sealedDigest,
    corpus_ref: corpus.relative,
    corpus_digest: corpusTreeDigest(loadedCorpus),
    baseline_record_ref: baseline.relative,
    baseline_record_digest: baseline.digest,
    verdict: record.verdict,
    subject_ref: record.subject.ref,
    subject_content_digest: record.subject?.content_digest ?? null,
    created_at: record.created_at,
    execution_mode: record.model_run.mode,
    execution_rederived: true,
    comparison_rederived: true,
    runner_ref: EVIDENCE_RUNNER_REF,
    runner_digest: runnerDigest(),
    verified_at: nowIso(now)
  };
}
