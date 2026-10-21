#!/usr/bin/env node
// Trusted evidence admission calculator (extension of slice S8, Governance
// Promotion; spec MAWS-SII-TARGET-SPEC-001 v0.2.0, section 13).
//
// It computes the admission of one behavioral evaluation to the skill content
// it is admitted FOR and to the committed source that published it. The
// result is the artifact the promotion chain verifies.
//
// It is a CALCULATOR, not an authority: it grants no capability, qualifies no
// model or executor, changes no permission, promotes no skill and activates
// nothing. The ADMISSION decision itself stays with the owner, whose
// approval remains the decision the promotion chain requires. This tool only
// recomputes the bindings of an admission; the result is a reviewed change of
// the evidence tree, like every other change to a committed artifact.
//
// The digests are the SAME the promotion chain recomputes: the record and
// baseline digests are the canonical digests of the parsed records, and the
// corpus digest is the whole-corpus digest, so an admission written here and
// an admission verified there can never disagree by construction.
//
// Usage:
//   node scripts/tools/admit-evidence.mjs --skill <id> --record <ref> --baseline <ref> --corpus <ref> [--evidence-root <dir>] [--canonical-root <dir>] [--out <ref>]
//   node scripts/tools/admit-evidence.mjs ... --write
//
// The dry run is the default; --write is the explicit apply switch.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { canonicalJson, nowIso } from '../../runtime/vnext/util.mjs';
import { readEvidenceRecord, corpusTreeDigest } from './evidence-provenance.mjs';
import { materialDigest, gitContext, EVIDENCE_ADMISSION_DIRECTORY } from './evidence-admission.mjs';
import { loadCorpus } from './run-skill-effectiveness-evals.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

function sha256Prefixed(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function gitText(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
      shell: false
    }).trim();
  } catch {
    return null;
  }
}

// materialCommit({ root, recordRef, baselineRef, corpusRef }) -> the commit
// that published the admitted material. The commit is the identity of the
// SOURCE; the promotion chain proves that the material on disk is that
// commit's content, unmodified.
function materialCommit({ root, recordRef, baselineRef, corpusRef }) {
  const context = gitContext({ root });
  if (!context) {
    throw new Error(`the evidence tree ${root} is not inside a git checkout; an admission names a committed source, so an unversioned tree cannot be admitted`);
  }
  const paths = [
    `${context.prefix}${recordRef}`,
    `${context.prefix}${baselineRef}`,
    `${context.prefix}${corpusRef}`
  ];
  const commit = gitText(context.topLevel, ['log', '-1', '--format=%H', '--', ...paths]);
  if (!commit) {
    throw new Error(`the admitted material is not committed in ${context.topLevel}; commit it before admitting it`);
  }
  return commit;
}

// computeAdmission({ skillId, recordRef, baselineRef, corpusRef, evidenceRoot,
// canonicalRoot, contentPath, sourceKind, admittedAt }) -> the admission
// record.
//
// The content digest is COMPUTED from the candidate artifact, never
// asserted: the admission names the content the evaluation is admitted FOR,
// and the tool reads that content from the artifact under consideration.
export function computeAdmission({
  skillId,
  recordRef,
  baselineRef,
  corpusRef,
  evidenceRoot = REPO_ROOT,
  canonicalRoot = REPO_ROOT,
  contentPath = null,
  sourceKind = null,
  admittedAt = nowIso()
}) {
  if (!SKILL_ID_PATTERN.test(String(skillId))) {
    throw new Error(`the skill id "${String(skillId)}" is malformed`);
  }
  // The content the evaluation is admitted FOR.
  const skillPath = contentPath
    ? path.resolve(contentPath)
    : path.join(canonicalRoot, 'skills', skillId, 'SKILL.md');
  let skillContent;
  try {
    skillContent = fs.readFileSync(skillPath);
  } catch (error) {
    throw new Error(`the candidate artifact ${skillPath} could not be read: ${error.message}`);
  }
  const contentDigest = sha256Prefixed(skillContent);

  const record = readEvidenceRecord({ root: evidenceRoot, ref: recordRef });
  const baseline = readEvidenceRecord({ root: evidenceRoot, ref: baselineRef });

  const corpusDir = path.join(evidenceRoot, corpusRef);
  let corpus;
  try {
    corpus = loadCorpus(corpusDir);
  } catch (error) {
    throw new Error(`the corpus ${corpusRef} could not be loaded: ${error.message}`);
  }
  const corpusDigest = corpusTreeDigest(corpus);

  const material = {
    record_ref: record.relative,
    record_digest: record.digest,
    baseline_record_ref: baseline.relative,
    baseline_record_digest: baseline.digest,
    corpus_ref: corpusRef,
    corpus_digest: corpusDigest
  };
  material.material_digest = materialDigest(material);

  // The source identity: the committed one where the tree is versioned, the
  // content one where it is not. The kind is recorded, so the weaker
  // guarantee is never mistaken for the stronger one.
  const kind = sourceKind || (gitContext({ root: evidenceRoot }) ? 'git_commit' : 'content');
  let source;
  if (kind === 'git_commit') {
    const commit = materialCommit({ root: evidenceRoot, recordRef: record.relative, baselineRef: baseline.relative, corpusRef });
    source = { kind: 'git_commit', commit, surface: 'evidence' };
  } else {
    source = { kind: 'content', content_digest: material.material_digest, surface: 'evidence' };
  }

  return {
    schema_version: '1.0.0',
    admission_id: `admit_evidence_${material.material_digest.slice(7, 19)}`,
    skill_id: skillId,
    subject_ref: record.record.subject?.ref,
    content_digest: contentDigest,
    material,
    source,
    admitted_at: admittedAt,
    authority_granted: false
  };
}

export function runCli(args) {
  const skillId = readFlag(args, '--skill');
  const recordRef = readFlag(args, '--record');
  const baselineRef = readFlag(args, '--baseline');
  const corpusRef = readFlag(args, '--corpus');
  const evidenceRoot = path.resolve(readFlag(args, '--evidence-root') || REPO_ROOT);
  const canonicalRoot = path.resolve(readFlag(args, '--canonical-root') || REPO_ROOT);
  const contentPath = readFlag(args, '--content');
  const sourceKind = readFlag(args, '--source-kind');
  const write = args.includes('--write');
  if (!skillId || !recordRef || !baselineRef || !corpusRef) {
    return {
      ok: false,
      written: false,
      issues: ['usage: admit-evidence.mjs --skill <id> --record <ref> --baseline <ref> --corpus <ref> [--content <file>] [--source-kind git_commit|content] [--evidence-root <dir>] [--canonical-root <dir>] [--out <ref>] [--write]']
    };
  }
  let admission;
  try {
    admission = computeAdmission({
      skillId,
      recordRef,
      baselineRef,
      corpusRef,
      evidenceRoot,
      canonicalRoot,
      contentPath,
      sourceKind
    });
  } catch (error) {
    return { ok: false, written: false, issues: [error.message] };
  }
  const outRef = readFlag(args, '--out') || `${EVIDENCE_ADMISSION_DIRECTORY}/${admission.admission_id}.json`;
  const outPath = path.join(evidenceRoot, outRef);
  if (!write) {
    return { ok: true, written: false, admission, out_ref: outRef, out_path: outPath };
  }
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(admission, null, 2)}\n`);
  } catch (error) {
    return { ok: false, written: false, issues: [`the admission could not be written: ${error.message}`] };
  }
  // The written artifact is read back: the admission that is on disk is the
  // one that was computed.
  let readBack;
  try {
    readBack = fs.readFileSync(outPath, 'utf8');
  } catch (error) {
    return { ok: false, written: true, issues: [`the admission could not be read back: ${error.message}`] };
  }
  if (readBack !== `${JSON.stringify(admission, null, 2)}\n`) {
    return { ok: false, written: true, issues: ['the admission read back differs from the computed admission'] };
  }
  return { ok: true, written: true, admission, out_ref: outRef, out_path: outPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
