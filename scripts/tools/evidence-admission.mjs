#!/usr/bin/env node
// MAWS vNext — trusted evidence admission (extension of slice S8,
// Governance Promotion; spec MAWS-SII-TARGET-SPEC-001 v0.2.0, section 13).
//
// S8 proved that a behavioral evaluation REPRODUCES: the record is read from
// the canonical evidence surface, the corpus is re-hashed, the evaluation is
// re-executed over it and the verdict is re-derived from the baseline on
// disk. What S8 does not prove is the question that stands above it:
//
//   Is EXACTLY this evaluation result assigned to the skill that is actually
//   being adopted, and to a trustworthy admitted source?
//
// Two bindings are missing, and this module adds them:
//
//   A1  the CONTENT assignment. The corpus declares the subject content it
//       carries, the corpus loader verifies those bytes against the declared
//       digest before any case runs, and the S8 re-execution re-derives the
//       subject from the corpus. The admission binds an evaluation only when
//       that MEASURED content digest is exactly the digest of the content
//       being adopted — the assignment is a verified digest equality, not a
//       caller declaration.
//
//   A2  the SOURCE trust. S8 re-hashes the material it reads, but nothing
//       binds the evidence TREE: no tree identity, no commit, no file set.
//       The same bytes are equally acceptable at any path, and a record that
//       was never published is accepted as long as it re-executes. The
//       admission names the commit that published the admitted material, and
//       the material is proved to be that commit's content, unmodified.
//
// Rules enforced here (all fail closed):
//
//   A1  the admission artifact lives in the canonical admission surface
//       evidence/admissions/ of the evidence tree, is read through the
//       shared confinement primitive and is validated against its contract;
//   A2  the admission names the promoted skill and the subject the
//       evaluation measured;
//   A3  the admission names the CONTENT digest the evaluation is admitted
//       for; the promotion requires it to be the digest of the content that
//       is being adopted;
//   A4  the admission names the EXACT material the S8 gate bound: the same
//       record, the same baseline, the same corpus, with the same digests.
//       A substituted path or a manipulated digest is refused;
//   A5  the admitted material is the COMMITTED content of the evidence tree:
//       the named commit exists, is part of the published history, and the
//       bytes of the material at that commit are the bytes on disk;
//   A6  the admission artifact itself is committed and unmodified, so the
//       admission is a reviewed repository change and not a working-tree
//       fabrication.
//
// The two source kinds state DIFFERENT trust levels, and the level that was
// proved is recorded. `git_commit` establishes a reviewable source: the
// material is committed, unmodified content, and the admission is a committed
// change. `content` identifies the material by its content alone and
// establishes NO committed source; it is admitted ONLY where the tree is not
// versioned at all, so the source trust can never be downgraded by whoever
// may write into a versioned working copy.
//
// RESIDUALS carried forward from the shared confinement primitive
// (scripts/tools/path-confinement.mjs, R1-R4). The admission artifact, the
// eval record and the baseline record are read THROUGH that primitive, so
// the symlink, hardlink and replacement guards apply to them. The corpus
// files and the on-disk admission copy are read plainly, on purpose: their
// integrity guard is the byte-for-byte comparison against the named content
// commit (and, for the corpus, the file-set comparison), which refuses any
// bytes that differ from the committed content however the file on disk is
// named or linked; a file the tree does not carry at all is refused by the
// file-set and not-carried checks before any read. A confinement proof for
// these reads would add no refusal the committed-content comparison does not
// already make. The residuals below attach to the primitive-guarded reads;
// a hung filesystem (R3) can still block a plain read in the kernel.
//   R1  the replacement of a target is detected, not an IN-PLACE rewrite of
//       the same inode: a writer that truncates and rewrites a file between
//       the check and the read keeps its identity. Such a writer holds write
//       access to the material and could equally have written the corpus
//       before the run; the change is visible in the digests the admission
//       binds.
//   R2  a concurrent writer that replaces the PARENT DIRECTORY of a target
//       between the check and the open is detected as long as the new parent
//       has a fresh inode.
//   R3  a filesystem that has stopped responding can block in the kernel.
//   R4  a bind mount inside the tree is not detected: its real path is its
//       own path inside the tree.
//
// TEST SEAMS: `root` is the tree the evidence and the admitted material are
// read from. The production path pins it to the installation's own
// canonical tree, so a caller can never point the chain at a tree it
// controls; the promotion library exposes it so the mechanism can be
// exercised against an isolated tree.
//
// Admission != Authority: an admission is a BINDING, not a decision. It names
// what may support an adoption; the owner approval remains the decision, and
// this module grants no permission, no qualification and no authority.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { canonicalJson } from '../../runtime/vnext/util.mjs';
import {
  confineFileToBase,
  readConfinedFile,
  PathConfinementError
} from './path-confinement.mjs';

export const EVIDENCE_ADMISSION_CONTRACT = 'core/contracts/evidence-admission.schema.json';
// The canonical admission surface inside the evidence tree.
export const EVIDENCE_ADMISSION_DIRECTORY = 'evidence/admissions';
export const EVIDENCE_ADMISSION_REF_PATTERN = /^evidence\/admissions\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
export const EVIDENCE_ADMISSION_SOURCE_KIND = 'git_commit';
// The weaker source form: the material is identified by its CONTENT, because
// the tree is not versioned. It establishes no committed source, and the kind
// is recorded so that the weaker guarantee is never mistaken for the
// stronger one.
export const EVIDENCE_ADMISSION_SOURCE_KIND_CONTENT = 'content';
// The maximum time a single read-only git invocation may take.
const GIT_TIMEOUT_MS = 10000;

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

export class EvidenceAdmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceAdmissionError';
    this.code = code;
  }
}

function admissionError(code, message) {
  throw new EvidenceAdmissionError(code, message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function sha256Prefixed(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

// materialDigest(material) -> the identity of the admitted MATERIAL SET: the
// ordered (reference, digest) pairs the admission covers. Two admissions of
// the same set share this digest; an admission of a different set does not.
export function materialDigest(material) {
  return sha256Prefixed(canonicalJson({
    record: { ref: material.record_ref, digest: material.record_digest },
    baseline: { ref: material.baseline_record_ref, digest: material.baseline_record_digest },
    corpus: { ref: material.corpus_ref, digest: material.corpus_digest }
  }));
}

// resolveAdmissionPath({ root, admissionRef }) -> { absolute, relative }.
// The admission must live in the canonical admission surface of the evidence
// tree. The reference is pattern-constrained and the path is proven to stay
// inside the tree, so neither a caller-supplied path nor a symlink can move
// the admission out of the governed surface.
export function resolveAdmissionPath({ root, admissionRef }) {
  if (!isNonEmptyString(admissionRef)) {
    admissionError('EVIDENCE_ADMISSION_REF_INVALID', 'the promotion requires an evidence admission artifact; admission is never implied');
  }
  const relative = path.posix.normalize(String(admissionRef).replace(/\\/g, '/'));
  if (path.posix.isAbsolute(relative) || relative === '..' || relative.startsWith('../')) {
    admissionError('EVIDENCE_ADMISSION_REF_INVALID', `the evidence admission reference "${admissionRef}" escapes the evidence tree`);
  }
  if (!EVIDENCE_ADMISSION_REF_PATTERN.test(relative)) {
    admissionError('EVIDENCE_ADMISSION_REF_INVALID', `the evidence admission reference "${admissionRef}" does not name an artifact of the canonical admission surface ${EVIDENCE_ADMISSION_DIRECTORY}/`);
  }
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, relative);
  if (!absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
    admissionError('EVIDENCE_ADMISSION_REF_INVALID', `the evidence admission reference "${admissionRef}" escapes the evidence tree`);
  }
  return { absolute, relative };
}

// readEvidenceAdmission({ root, admissionRef }) -> { record, digest,
// relative, absolute }. The artifact is read through the SHARED confinement
// primitive: the containment is proved twice and the read is bound to a
// verified descriptor, so a symlinked file, a symlinked parent directory, a
// hardlinked file and a file replaced between the check and the read are all
// refused.
export function readEvidenceAdmission({ root, admissionRef }) {
  const { absolute, relative } = resolveAdmissionPath({ root, admissionRef });
  let confined;
  try {
    confined = confineFileToBase(path.resolve(root), relative);
  } catch (error) {
    if (error instanceof PathConfinementError) {
      admissionError('EVIDENCE_ADMISSION_REF_INVALID', `the evidence admission ${relative} is not a contained file of the evidence tree: ${error.message}`);
    }
    throw error;
  }
  let content;
  try {
    content = readConfinedFile(confined);
  } catch (error) {
    if (error instanceof PathConfinementError) {
      admissionError('EVIDENCE_ADMISSION_MISSING', `the evidence admission ${relative} could not be read: ${error.message}`);
    }
    throw error;
  }
  let record;
  try {
    record = JSON.parse(content.toString('utf8'));
  } catch (error) {
    admissionError('EVIDENCE_ADMISSION_INVALID', `the evidence admission ${relative} is not readable JSON: ${error.message}`);
  }
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    admissionError('EVIDENCE_ADMISSION_INVALID', `the evidence admission ${relative} must be an object`);
  }
  return { record, digest: sha256Prefixed(canonicalJson(record)), relative, absolute };
}

// --- git identity ------------------------------------------------------------
//
// The git calls are read-only and take their arguments as an array, so no
// shell is involved and no caller-supplied string is interpreted. The
// evidence tree must be inside a git checkout: a tree that is not versioned
// has no reviewable source, and an admission that claims a commit in such a
// tree is refused rather than silently downgraded.

function gitBytes(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_TIMEOUT_MS,
      shell: false,
      maxBuffer: 32 * 1024 * 1024
    });
  } catch (error) {
    return { failed: true, detail: error?.stderr ? String(error.stderr).trim() : error?.message };
  }
}

function gitText(root, args) {
  const result = gitBytes(root, args);
  if (typeof result === 'object' && result.failed) return null;
  return result.toString('utf8').trim();
}

// gitContext({ root }) -> { topLevel, prefix }. The repository the evidence
// tree belongs to, and the tree's path inside it.
export function gitContext({ root }) {
  const topLevel = gitText(root, ['rev-parse', '--show-toplevel']);
  if (!topLevel) return null;
  const prefix = gitText(root, ['rev-parse', '--show-prefix']);
  if (prefix === null) return null;
  return { topLevel: path.resolve(topLevel), prefix: prefix === '' ? '' : prefix.replace(/\\/g, '/') };
}

// listFilesUnder(directory) -> the relative paths of every regular file
// under a directory, sorted. Used to compare the working tree's material
// with the committed material.
export function listFilesUnder(directory) {
  const found = [];
  const walk = (current, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else if (entry.isFile()) {
        found.push(relative);
      }
    }
  };
  walk(directory, '');
  return found.sort();
}

// committedFileBytes({ topLevel, commit, repoRelativePath }) -> the bytes of
// a file at a commit, or null when the commit does not carry it.
function committedFileBytes({ topLevel, commit, repoRelativePath }) {
  const result = gitBytes(topLevel, ['cat-file', 'blob', `${commit}:${repoRelativePath}`]);
  if (typeof result === 'object' && result.failed) return null;
  return result;
}

// committedTreeFiles({ topLevel, commit, repoRelativeDirectory }) -> the
// paths a commit carries under a directory.
function committedTreeFiles({ topLevel, commit, repoRelativeDirectory }) {
  const listing = gitText(topLevel, ['ls-tree', '-r', '--full-tree', commit, '--', repoRelativeDirectory]);
  if (listing === null) return null;
  const files = [];
  for (const line of listing.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^\d+\s+blob\s+[0-9a-f]+\s+(.+)$/);
    if (match) files.push(match[1]);
  }
  return files.sort();
}

// readConfinedMaterial(root, ref, label) -> the bytes of a material file,
// read through the SHARED confinement primitive. The plain read is not used:
// the confinement primitive refuses a file that shares its inode with a name
// outside the tree (the hardlink rule) and a file that is replaced between
// the containment check and the read.
function readConfinedMaterial(root, ref, label) {
  let confined;
  try {
    confined = confineFileToBase(path.resolve(root), ref);
  } catch (error) {
    if (error instanceof PathConfinementError) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `${label} ${ref} is not a contained file of the evidence tree: ${error.message}`);
    }
    throw error;
  }
  try {
    return readConfinedFile(confined);
  } catch (error) {
    if (error instanceof PathConfinementError) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `${label} ${ref} could not be read: ${error.message}`);
    }
    throw error;
  }
}

// verifyGitSource({ root, material, source, admissionRef }) -> the identity
// of the source that was proved. Every check fails closed.
function verifyGitSource({ root, material, source, admissionRef }) {
  const context = gitContext({ root });
  if (!context) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the evidence tree ${root} is not inside a git checkout, so the committed identity of the admitted material cannot be established`);
  }
  if (!isNonEmptyString(source?.commit) || !COMMIT_PATTERN.test(source.commit)) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', 'the evidence admission names no canonical commit');
  }
  const resolved = gitText(context.topLevel, ['rev-parse', '--verify', '--quiet', `${source.commit}^{commit}`]);
  if (!resolved) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the commit ${source.commit} named by the evidence admission does not exist in ${context.topLevel}`);
  }
  const head = gitText(context.topLevel, ['rev-parse', 'HEAD']);
  if (!head) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_NOT_PUBLISHED', `the evidence tree ${context.topLevel} has no published history, so no commit can be part of it`);
  }
  {
    const ancestor = gitBytes(context.topLevel, ['merge-base', '--is-ancestor', resolved, head]);
    if (typeof ancestor === 'object' && ancestor.failed) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_NOT_PUBLISHED', `the commit ${resolved} named by the evidence admission is not part of the published history of ${context.topLevel}`);
    }
  }

  // A1: the single-file material must be the committed content, byte for byte.
  // The material is read through the SHARED confinement primitive, so the
  // hardlink rule and the replacement guard apply to it as well: a file that
  // shares its inode with a name outside the tree is refused rather than
  // compared.
  for (const [ref, label] of [[material.record_ref, 'the behavioral eval record'], [material.baseline_record_ref, 'the baseline record']]) {
    const repoPath = `${context.prefix}${ref}`;
    const committed = committedFileBytes({ topLevel: context.topLevel, commit: resolved, repoRelativePath: repoPath });
    if (committed === null) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `${label} ${ref} is not carried by commit ${resolved}`);
    }
    const onDisk = readConfinedMaterial(root, ref, label);
    if (!committed.equals(onDisk)) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_MODIFIED', `${label} ${ref} differs from the content commit ${resolved} published; the admitted material is not the committed material`);
    }
  }

  // A1: the corpus must be the committed content as well, file set included.
  const corpusRepoPath = `${context.prefix}${material.corpus_ref}`;
  const committedCorpus = committedTreeFiles({ topLevel: context.topLevel, commit: resolved, repoRelativeDirectory: corpusRepoPath});
  if (committedCorpus === null) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the corpus ${material.corpus_ref} is not carried by commit ${resolved}`);
  }
  const corpusDir = path.join(root, material.corpus_ref);
  const onDiskCorpus = listFilesUnder(corpusDir);
  if (committedCorpus.length !== onDiskCorpus.length) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_MODIFIED', `the corpus ${material.corpus_ref} holds ${onDiskCorpus.length} file(s) on disk and ${committedCorpus.length} in commit ${resolved}; the admitted material is not the committed material`);
  }
  for (const relative of onDiskCorpus) {
    const repoPath = `${corpusRepoPath}/${relative}`;
    const committed = committedFileBytes({ topLevel: context.topLevel, commit: resolved, repoRelativePath: repoPath });
    if (committed === null) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_MODIFIED', `the corpus file ${repoPath} is not carried by commit ${resolved}`);
    }
    let onDisk;
    try {
      onDisk = fs.readFileSync(path.join(corpusDir, relative));
    } catch (error) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the corpus file ${relative} could not be read: ${error.message}`);
    }
    if (!committed.equals(onDisk)) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_MODIFIED', `the corpus file ${relative} differs from the content commit ${resolved} published`);
    }
  }

  // A2: the admission artifact itself is a reviewed repository change: it
  // must be committed, and it must be unmodified since it was published.
  const admissionRepoPath = `${context.prefix}${admissionRef}`;
  const published = gitText(context.topLevel, ['log', '-1', '--format=%H', '--', admissionRepoPath]);
  if (!published) {
    admissionError('EVIDENCE_ADMISSION_NOT_COMMITTED', `the evidence admission ${admissionRef} is not committed in ${context.topLevel}; an admission is a reviewed repository change`);
  }
  const committedAdmission = committedFileBytes({ topLevel: context.topLevel, commit: published, repoRelativePath: admissionRepoPath });
  if (committedAdmission === null) {
    // The commit that last touched the path does not carry it: the
    // admission was removed or renamed there, so it is not committed content.
    admissionError('EVIDENCE_ADMISSION_NOT_COMMITTED', `the evidence admission ${admissionRef} is not committed content: the commit ${published} that last touched it does not carry it; an admission is a reviewed repository change`);
  }
  let admissionOnDisk;
  try {
    admissionOnDisk = fs.readFileSync(path.join(root, admissionRef));
  } catch (error) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the evidence admission ${admissionRef} could not be read: ${error.message}`);
  }
  if (!committedAdmission.equals(admissionOnDisk)) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_MODIFIED', `the evidence admission ${admissionRef} differs from the content its publishing commit carries`);
  }

  return { top_level: context.topLevel, commit: resolved, admission_commit: published };
}

// verifyEvidenceAdmission({ root, admissionRef, attestations, skillId,
// candidateDigest, validate }) -> the admission attestation.
//
// The S8 attestations are the material the promotion actually bound. The
// admission must admit EXACTLY one of them, for EXACTLY the content that is
// being adopted, from a source whose committed identity is proved.
export function verifyEvidenceAdmission({
  root,
  admissionRef,
  attestations = [],
  skillId = null,
  candidateDigest = null,
  validate = null
}) {
  const admission = readEvidenceAdmission({ root, admissionRef });
  const record = admission.record;

  if (typeof validate === 'function') {
    const issues = validate(record) ?? [];
    if (issues.length > 0) {
      admissionError('EVIDENCE_ADMISSION_INVALID', `the evidence admission ${admission.relative} violates its contract: ${issues.join('; ')}`);
    }
  }
  if (record.authority_granted !== false) {
    admissionError('EVIDENCE_ADMISSION_INVALID', 'an evidence admission is a binding and never grants authority');
  }

  // A2: the admission names the skill.
  if (skillId !== null && record.skill_id !== skillId) {
    admissionError('EVIDENCE_ADMISSION_SKILL_MISMATCH', `the evidence admission ${admission.relative} admits skill "${String(record.skill_id)}", the promotion promotes "${skillId}"`);
  }

  // A1: the CONTENT assignment. The admission names the content digest the
  // evaluation is admitted for, and it must be the content being adopted.
  if (!DIGEST_PATTERN.test(String(record.content_digest))) {
    admissionError('EVIDENCE_ADMISSION_INVALID', `the evidence admission ${admission.relative} names no canonical content digest`);
  }
  if (candidateDigest !== null && record.content_digest !== candidateDigest) {
    admissionError('EVIDENCE_ADMISSION_CONTENT_MISMATCH', `the evidence admission ${admission.relative} admits the evidence for content ${record.content_digest}, the adoption promotes content ${candidateDigest}`);
  }

  // A1: the admitted MATERIAL is the material the S8 gate bound. A
  // substituted path or a manipulated digest is refused here.
  const material = record.material;
  if (material === null || typeof material !== 'object' || Array.isArray(material)) {
    admissionError('EVIDENCE_ADMISSION_INVALID', `the evidence admission ${admission.relative} names no admitted material`);
  }
  if (material.material_digest !== materialDigest(material)) {
    admissionError('EVIDENCE_ADMISSION_MATERIAL_MISMATCH', `the evidence admission ${admission.relative} does not carry the digest of its own admitted material set`);
  }
  const matches = (attestations ?? []).filter((attestation) => (
    attestation.record_ref === material.record_ref
    && attestation.record_digest === material.record_digest
    && attestation.baseline_record_ref === material.baseline_record_ref
    && attestation.baseline_record_digest === material.baseline_record_digest
    && attestation.corpus_ref === material.corpus_ref
    && attestation.corpus_digest === material.corpus_digest
  ));
  if (matches.length === 0) {
    admissionError('EVIDENCE_ADMISSION_MATERIAL_MISMATCH', `the evidence admission ${admission.relative} admits the material ${material.record_ref} / ${material.baseline_record_ref} / ${material.corpus_ref}, which is not the material the promotion bound`);
  }
  if (matches.length > 1) {
    admissionError('EVIDENCE_ADMISSION_MATERIAL_MISMATCH', `the evidence admission ${admission.relative} admits a material that the promotion bound ${matches.length} times; the same evaluation is bound more than once, and an admission must name exactly one of them`);
  }
  const attestation = matches[0];
  if (record.subject_ref !== attestation.subject_ref) {
    admissionError('EVIDENCE_ADMISSION_SUBJECT_MISMATCH', `the evidence admission ${admission.relative} admits the subject "${String(record.subject_ref)}", the bound evaluation measured "${String(attestation.subject_ref)}"`);
  }

  // A1: the SUBJECT CONTENT assignment. The S8 gate re-executes the
  // evaluation over the corpus on disk, and the corpus loader verifies the
  // subject content against its declared digest BEFORE any case runs, so the
  // attestation's subject content digest is the content the corpus actually
  // carries and the re-execution actually measured. The admission may only
  // bind an evaluation whose measured content IS the content being adopted:
  // an evaluation of other content stays inadmissible even when its record,
  // baseline and corpus digests all match, and a corpus without a subject
  // content binding measures content it cannot name, so it is refused here
  // as well.
  if (attestation.subject_content_digest !== record.content_digest) {
    admissionError('EVIDENCE_ADMISSION_SUBJECT_CONTENT_MISMATCH', `the evaluation bound by the admission ${admission.relative} measured subject content ${String(attestation.subject_content_digest)}, the admission binds content ${record.content_digest}; an evaluation may only be admitted for the content it actually measured`);
  }

  // A1/A2: the source identity of the admitted material. The two kinds state
  // DIFFERENT trust levels, and the kind that was proved is recorded, so a
  // reader of the adoption record always knows which one it has.
  const kind = record.source?.kind;
  if (kind !== EVIDENCE_ADMISSION_SOURCE_KIND && kind !== EVIDENCE_ADMISSION_SOURCE_KIND_CONTENT) {
    admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the evidence admission ${admission.relative} declares the source kind "${String(kind)}"; the admitted kinds are "${EVIDENCE_ADMISSION_SOURCE_KIND}" and "${EVIDENCE_ADMISSION_SOURCE_KIND_CONTENT}"`);
  }
  let source = { commit: null, admission_commit: null };
  if (kind === EVIDENCE_ADMISSION_SOURCE_KIND) {
    source = verifyGitSource({
      root,
      material,
      source: record.source,
      admissionRef: admission.relative
    });
  } else {
    // The weaker form is admitted ONLY where the stronger one is not
    // available: a tree that is not versioned. In a VERSIONED tree the
    // committed identity must be used, or the source trust could be
    // downgraded at will by anyone who can write into the working copy.
    if (gitContext({ root })) {
      admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the evidence tree ${root} is versioned, so the committed source identity must be used; the weaker "${EVIDENCE_ADMISSION_SOURCE_KIND_CONTENT}" kind is not admitted in a versioned tree`);
    }
    if (record.source.content_digest !== material.material_digest) {
      // The weaker form: the material is identified by its content and no
      // committed source is established. The identity must still be the
      // admitted material's own.
      admissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', `the evidence admission ${admission.relative} names the content identity ${String(record.source.content_digest)}, which is not the identity of the admitted material ${material.material_digest}`);
    }
  }

  return {
    schema_version: '1.0.0',
    admission_id: record.admission_id,
    admission_ref: admission.relative,
    admission_digest: admission.digest,
    skill_id: record.skill_id,
    subject_ref: record.subject_ref,
    content_digest: record.content_digest,
    material_digest: material.material_digest,
    source_kind: kind,
    source_commit: source.commit,
    source_admission_commit: source.admission_commit,
    admitted_at: record.admitted_at,
    authority_granted: false
  };
}
