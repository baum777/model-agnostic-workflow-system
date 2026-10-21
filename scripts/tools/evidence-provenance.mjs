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
export const EVIDENCE_PROVENANCE_VERSION = 'evidence-provenance 1.0.0';
export const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 90;
// The canonical runner that produces (and can re-execute) a behavioral eval
// record. The attestation names it and binds its digest, so a receipt names
// the exact evaluation code that reproduces it.
export const EVIDENCE_RUNNER_REF = 'scripts/tools/run-skill-effectiveness-evals.mjs';

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
  return { absolute, relative };
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
const EXECUTION_FIELDS = [
  'schema_version',
  'eval_id',
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

// reExecute({ corpusDir, record }) -> { corpus, rederived }. The evaluation
// is re-executed over the corpus on disk. The corpus is loaded fresh for
// every execution: the runner mutates the positive family per variant, so a
// shared corpus object would leak one variant into the other.
async function reExecute({ corpusDir, record }) {
  let corpus = null;
  try {
    corpus = loadCorpus(corpusDir);
  } catch (error) {
    provenanceError('EVIDENCE_CORPUS_INVALID', `the behavioral eval corpus could not be loaded: ${error.message}`);
  }
  let rederived = null;
  try {
    rederived = await runVariant({
      corpus,
      variant: record.variant,
      mode: 'recorded_replay',
      evalId: record.eval_id,
      instructionRevision: record.subject?.instruction_revision,
      evidenceRefs: record.evidence_refs
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
function runnerDigest() {
  try {
    const runnerPath = fileURLToPath(new URL('./run-skill-effectiveness-evals.mjs', import.meta.url));
    return sha256Canonical(fs.readFileSync(runnerPath, 'utf8'));
  } catch {
    return null;
  }
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
    provenanceError('EVIDENCE_CORPUS_INVALID', `the behavioral eval corpus ${corpus.relative} could not be loaded: ${error.message}`);
  }
  if (loadedCorpus.subject?.ref !== record.subject?.ref) {
    provenanceError('EVIDENCE_SUBJECT_MISMATCH', `the corpus ${corpus.relative} measures subject "${String(loadedCorpus.subject?.ref)}", the record ${candidate.relative} claims subject "${String(record.subject?.ref)}"`);
  }
  if (skillId !== null && record.subject?.ref !== skillId) {
    provenanceError('EVIDENCE_SUBJECT_MISMATCH', `the behavioral eval record ${candidate.relative} measured subject "${String(record.subject?.ref)}", not the promoted skill "${skillId}"`);
  }

  // E5: the evaluation is re-executed over the corpus on disk and must
  // reproduce the record field for field.
  const candidateRun = await reExecute({ corpusDir: corpus.absolute, record });
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
  const baselineRun = await reExecute({ corpusDir: corpus.absolute, record: baselineRecord });
  const baselineDifferences = executionDifferences(baselineRecord, baselineRun.rederived);
  if (baselineDifferences.length > 0) {
    provenanceError('EVIDENCE_EXECUTION_MISMATCH', `the baseline record ${baseline.relative} does not reproduce from the corpus ${corpus.relative}: ${baselineDifferences.join('; ')}`);
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

  // A blocked evaluation never supports a promotion.
  if (record.verdict === 'BLOCKED') {
    provenanceError('EVIDENCE_BLOCKED', `the behavioral eval ${candidate.relative} is BLOCKED and can never support a promotion`);
  }

  // E7: the evidence age stays inside the contract bound.
  const nowMs = resolveNowMs(now);
  if (Number.isNaN(nowMs)) {
    provenanceError('EVIDENCE_STALE', `the behavioral eval ${candidate.relative} could not be compared against a valid clock`);
  }
  const createdAt = Date.parse(record.created_at);
  if (Number.isNaN(createdAt)) {
    provenanceError('EVIDENCE_STALE', `the behavioral eval ${candidate.relative} carries no usable created_at`);
  }
  const ageDays = (nowMs - createdAt) / 86400000;
  if (ageDays > maxEvidenceAgeDays) {
    provenanceError('EVIDENCE_STALE', `the behavioral eval ${candidate.relative} is ${ageDays.toFixed(1)} days old, the bound is ${maxEvidenceAgeDays} days`);
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
    created_at: record.created_at,
    execution_mode: record.model_run.mode,
    execution_rederived: true,
    comparison_rederived: true,
    runner_ref: EVIDENCE_RUNNER_REF,
    runner_digest: runnerDigest(),
    verified_at: nowIso(now)
  };
}
