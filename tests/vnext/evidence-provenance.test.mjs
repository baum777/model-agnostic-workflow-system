// S8 — evidence provenance tests (spec MAWS-SII-TARGET-SPEC-001 v0.2.0,
// PROPOSED). A behavioral eval record is a RECEIPT; a receipt is not
// verification. These tests prove that the promotion chain traces the
// evidence back to the immutable execution results it claims to come from:
//
//   - the record is READ FROM DISK, never supplied by the caller;
//   - the record must satisfy its own content seal;
//   - the corpus is RE-HASHED from disk;
//   - the evaluation is RE-EXECUTED over the corpus and must reproduce the
//     record field for field;
//   - the comparison AND the verdict are RE-DERIVED from the baseline on
//     disk.
//
// Every negative case below is a FORGERY that a self-declared record could
// not have been caught by: the forgeries carry a perfect seal and a perfect
// contract shape, and they are still refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../runtime/vnext/util.mjs';

import {
  verifyEvidenceProvenance,
  readEvidenceRecord,
  corpusTreeDigest,
  EvidenceProvenanceError
} from '../../scripts/tools/evidence-provenance.mjs';
import {
  loadCorpus,
  runSkillEffectivenessEval,
  computeContentDigest
} from '../../scripts/tools/run-skill-effectiveness-evals.mjs';
import { validateBehavioralEvalRecord } from '../../scripts/tools/validate-behavioral-eval.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 's8-provenance-'));
}

const SUBJECT = 'provenance-subject';
// The subject content the corpus carries: the loader verifies the bytes
// against this digest before any case runs, so every record binds the
// measured content.
const SUBJECT_CONTENT = `---
name: ${SUBJECT}
version: 1.0.0
---

# Provenance Subject

The measured content of the provenance fixture corpus.
`;
const SUBJECT_DIGEST = `sha256:${crypto.createHash('sha256').update(SUBJECT_CONTENT).digest('hex')}`;
const CORPUS_NAME = 'provenance-corpus';
const CORPUS_REF = `evals/${CORPUS_NAME}`;
const EVIDENCE_DIR = 'evidence/provenance-fixture';
const RECORD_REF = `${EVIDENCE_DIR}/eval-record-candidate.json`;
const BASELINE_REF = `${EVIDENCE_DIR}/eval-record-baseline.json`;

// A minimal but REAL corpus: the runner executes it, the verifier executes
// it again, and the two must agree.
function corpusFiles({ positiveBlocking = true, candidatePositiveText = 'Reuse decision: extend the existing canonical surface.' } = {}) {
  const positiveCase = (text) => ({
    case_id: 'se_pos_001',
    family: 'positive',
    task: 'Route the provenance fixture task.',
    expected: {
      routing: { skill_id: SUBJECT },
      outcome: 'COMPLETED',
      assertions: [
        { assert_id: 'a1', type: 'contains', value: 'Reuse decision' },
        { assert_id: 'a2', type: 'contains', value: 'canonical surface' }
      ]
    },
    security_class: 'none',
    recorded_transcript: {
      routing: { skill_id: SUBJECT },
      outcome: 'COMPLETED',
      output_text: text,
      signals: { tokens_in: 100, tokens_out: 30, cost_units: 0.001, latency_ms: 90 }
    }
  });
  const negativeCase = {
    case_id: 'se_neg_001',
    family: 'negative',
    task: 'Refuse the out-of-scope request.',
    expected: {
      routing: { skill_id: SUBJECT },
      outcome: 'COMPLETED',
      assertions: [{ assert_id: 'a1', type: 'contains', value: 'refused' }]
    },
    security_class: 'none',
    recorded_transcript: {
      routing: { skill_id: SUBJECT },
      outcome: 'COMPLETED',
      output_text: 'The request was refused: it is out of scope.',
      signals: { tokens_in: 80, tokens_out: 20, cost_units: 0.0007, latency_ms: 70 }
    }
  };
  const manifest = {
    schema_version: '1.0.0',
    corpus_id: 'provenance-corpus',
    subject: {
      kind: 'skill',
      ref: SUBJECT,
      content_path: 'subject/SKILL.md',
      content_digest: SUBJECT_DIGEST
    },
    families: [
      { family: 'positive', file: 'shared', via: 'variant', blocking: positiveBlocking },
      { family: 'negative', file: 'negative-cases/cases.json', blocking: true }
    ],
    variants: {
      BASELINE: { positive_cases_file: 'baseline/cases.json' },
      CANDIDATE: { positive_cases_file: 'candidates/cases.json' }
    }
  };
  return {
    'corpus.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'subject/SKILL.md': SUBJECT_CONTENT,
    'baseline/cases.json': `${JSON.stringify({ cases: [positiveCase('Reuse decision: extend the existing shared core.')] }, null, 2)}\n`,
    'candidates/cases.json': `${JSON.stringify({ cases: [positiveCase(candidatePositiveText)] }, null, 2)}\n`,
    'negative-cases/cases.json': `${JSON.stringify({ cases: [negativeCase] }, null, 2)}\n`
  };
}

// buildTree() -> an evidence tree that holds the corpus and the records the
// canonical runner produced from it.
async function buildTree(options = {}) {
  const tree = tempDir();
  const corpusDir = path.join(tree, 'evals', CORPUS_NAME);
  for (const [relative, content] of Object.entries(corpusFiles(options))) {
    const absolute = path.join(corpusDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  const corpus = loadCorpus(corpusDir);
  const { baselineRecord, candidateRecord } = await runSkillEffectivenessEval({
    corpus,
    mode: 'recorded_replay',
    evalIdBase: 'bev_s8_provenance'
  });
  const evidenceDir = path.join(tree, EVIDENCE_DIR);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'eval-record-baseline.json'), `${JSON.stringify(baselineRecord, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'eval-record-candidate.json'), `${JSON.stringify(candidateRecord, null, 2)}\n`);
  return { tree, candidateRecord, baselineRecord };
}

const validate = (record) => validateBehavioralEvalRecord(record, root);

async function expectProvenanceError(code, fn) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof EvidenceProvenanceError, `expected EvidenceProvenanceError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected EvidenceProvenanceError ${code}`);
}

function readRecordFile(tree, ref) {
  return JSON.parse(fs.readFileSync(path.join(tree, ref), 'utf8'));
}

function writeRecordFile(tree, ref, record) {
  fs.writeFileSync(path.join(tree, ref), `${JSON.stringify(record, null, 2)}\n`);
}

// Reseal a forged record so that it satisfies its own content seal: the
// forgery must be caught by the RE-EXECUTION, not by the seal.
function reseal(record) {
  const clone = structuredClone(record);
  delete clone.reproducibility.content_digest;
  clone.reproducibility.content_digest = computeContentDigest(clone);
  return clone;
}

test('S8 a genuine evaluation reproduces from the corpus and its verdict follows from the baseline', async () => {
  const world = await buildTree();
  const attestation = await verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  });
  assert.equal(attestation.execution_rederived, true);
  assert.equal(attestation.comparison_rederived, true);
  assert.equal(attestation.verdict, 'IMPROVEMENT_PROVEN');
  assert.equal(attestation.subject_ref, SUBJECT);
  assert.equal(attestation.execution_mode, 'recorded_replay');
  assert.equal(attestation.record_ref, RECORD_REF);
  assert.equal(attestation.baseline_record_ref, BASELINE_REF);
  assert.equal(attestation.corpus_ref, CORPUS_REF);
  assert.match(attestation.record_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(attestation.content_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(attestation.corpus_digest, /^sha256:[a-f0-9]{64}$/);
  // The corpus digest is the digest of the corpus ON DISK, not a claim.
  const corpus = loadCorpus(path.join(world.tree, 'evals', CORPUS_NAME));
  assert.equal(attestation.corpus_digest, corpusTreeDigest(corpus));
});

test('S8 a forged record with a perfect seal is refused: the measurements do not follow from the corpus', async () => {
  const world = await buildTree();
  // The forgery: the record claims measurements the corpus does not
  // support, and it carries a CORRECT content seal. The forged fields are
  // contract-valid on their own: the contract cannot tell that they were
  // never measured, only the RE-EXECUTION can.
  const forged = structuredClone(world.candidateRecord);
  forged.metrics.cost.tokens_in = 999999;
  forged.metrics.latency.latency_ms_max = 999999;
  const sealed = reseal(forged);
  assert.equal(sealed.reproducibility.content_digest, computeContentDigest(sealed));
  assert.deepEqual(validate(sealed), []);
  writeRecordFile(world.tree, RECORD_REF, sealed);

  const error = await expectProvenanceError('EVIDENCE_EXECUTION_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /does not reproduce from the corpus/);
});

test('S8 a forged verdict is refused: the verdict must follow from the baseline on disk', async () => {
  const world = await buildTree();
  // The forgery: the comparison and the verdict claim more than the
  // baseline supports, with a correct seal.
  const forged = structuredClone(world.candidateRecord);
  forged.comparison.output_assertion_pass_delta = 0.9;
  forged.comparison.routing_accuracy_delta = 0.9;
  writeRecordFile(world.tree, RECORD_REF, reseal(forged));

  const error = await expectProvenanceError('EVIDENCE_COMPARISON_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /does not reproduce/);
});

test('S8 a record whose own seal was broken is refused', async () => {
  const world = await buildTree();
  const tampered = structuredClone(world.candidateRecord);
  tampered.metrics.cost.tokens_in = 424242;
  // The seal is NOT recomputed: the record was edited after it was sealed.
  writeRecordFile(world.tree, RECORD_REF, tampered);

  await expectProvenanceError('EVIDENCE_RECORD_SEAL_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a corpus that moved under the record is refused', async () => {
  const world = await buildTree();
  // The corpus case is edited: the record no longer reproduces, and the
  // corpus digest of the tree changes with it.
  const casesPath = path.join(world.tree, 'evals', CORPUS_NAME, 'candidates/cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  cases.cases[0].recorded_transcript.output_text = 'Reuse decision: extend the existing canonical surface. Fabricated.';
  fs.writeFileSync(casesPath, `${JSON.stringify(cases, null, 2)}\n`);

  const error = await expectProvenanceError('EVIDENCE_EXECUTION_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /does not reproduce from the corpus/);
});

test('S8 the corpus digest follows the corpus on disk', async () => {
  const world = await buildTree();
  const before = await verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  });
  const casesPath = path.join(world.tree, 'evals', CORPUS_NAME, 'negative-cases/cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  cases.cases[0].expected.assertions[0].value = 'refused differently';
  fs.writeFileSync(casesPath, `${JSON.stringify(cases, null, 2)}\n`);
  const corpus = loadCorpus(path.join(world.tree, 'evals', CORPUS_NAME));
  assert.notEqual(corpusTreeDigest(corpus), before.corpus_digest);
});

test('S8 a flipped verdict is refused: the verdict is derived, never declared', async () => {
  const world = await buildTree();
  // The forgery: the verdict alone is flipped to a rejection while the
  // comparison still shows the improvement, with a correct seal.
  const forged = structuredClone(world.candidateRecord);
  forged.verdict = 'IMPROVEMENT_REJECTED';
  writeRecordFile(world.tree, RECORD_REF, reseal(forged));

  const error = await expectProvenanceError('EVIDENCE_COMPARISON_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /does not follow from its baseline/);
});

test('S8 a record dated in the future is refused', async () => {
  const world = await buildTree();
  // A measurement cannot have been taken before it claims to have been
  // taken. The declaration is re-dated into the future and re-sealed, so
  // only the future check can catch it.
  const future = structuredClone(world.candidateRecord);
  future.created_at = '2099-01-01T00:00:00Z';
  writeRecordFile(world.tree, RECORD_REF, reseal(future));

  const error = await expectProvenanceError('EVIDENCE_STALE', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /future/);
});

test('S8 a forged evidence reference is refused: the references follow from the corpus', async () => {
  const world = await buildTree();
  // The evidence references are the record's own pointers to execution
  // results. The re-execution derives them from the corpus, so a forged
  // reference does not reproduce.
  const forged = structuredClone(world.candidateRecord);
  forged.evidence_refs = ['forged:evidence/that/does/not/exist'];
  writeRecordFile(world.tree, RECORD_REF, reseal(forged));

  await expectProvenanceError('EVIDENCE_EXECUTION_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a forged instruction revision is refused: the revision follows from the corpus', async () => {
  const world = await buildTree();
  // The instruction revision names the instruction state the evaluation ran
  // under. It is the CORPUS' declaration, so a record that names another one
  // does not reproduce.
  const forged = structuredClone(world.candidateRecord);
  forged.subject.instruction_revision = 'revision-of-a-skill-that-was-never-evaluated';
  writeRecordFile(world.tree, RECORD_REF, reseal(forged));

  await expectProvenanceError('EVIDENCE_EXECUTION_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a forged baseline reference is refused: it follows from the baseline on disk', async () => {
  // A REJECTED candidate is the case where the behavioral-eval contract does
  // NOT bind baseline_ref to the comparison (the R3 rule covers
  // IMPROVEMENT_PROVEN only), so the provenance layer must bind it.
  const world = await buildTree({ positiveBlocking: false, candidatePositiveText: 'Routing complete.' });
  assert.equal(world.candidateRecord.verdict, 'IMPROVEMENT_REJECTED');
  const forged = structuredClone(world.candidateRecord);
  forged.baseline_ref = 'bev_some_other_baseline_0001';
  writeRecordFile(world.tree, RECORD_REF, reseal(forged));

  const error = await expectProvenanceError('EVIDENCE_COMPARISON_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /baseline reference/);
});

test('S8 corpus content that leaves the tree is refused', async () => {
  const world = await buildTree();
  // The corpus DIRECTORY is inside the tree, but a family FILE that is a
  // symbolic link to a file outside it would make the measured material live
  // outside the governed tree. The linked file is a VALID case file, but the
  // S5 loader confines every declared family file in real terms and refuses
  // it FIRST (CORPUS_PATH_SYMLINK_ESCAPE), one layer before this module's
  // own containment proof could report it; the module's corpusLoadError
  // keeps the specific EVIDENCE_CORPUS_CONTENT_ESCAPES for the same defect
  // instead of its generic corpus-invalid code.
  const outside = path.join(world.tree, 'outside-cases.json');
  fs.writeFileSync(outside, fs.readFileSync(path.join(world.tree, 'evals', CORPUS_NAME, 'negative-cases', 'cases.json'), 'utf8'));
  fs.rmSync(path.join(world.tree, 'evals', CORPUS_NAME, 'negative-cases', 'cases.json'));
  fs.symlinkSync(outside, path.join(world.tree, 'evals', CORPUS_NAME, 'negative-cases', 'cases.json'));

  await expectProvenanceError('EVIDENCE_CORPUS_CONTENT_ESCAPES', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a record that is not on disk is refused', async () => {
  const world = await buildTree();
  fs.rmSync(path.join(world.tree, RECORD_REF));
  await expectProvenanceError('EVIDENCE_RECORD_MISSING', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a reference outside the canonical evidence surface is refused', async () => {
  const world = await buildTree();
  // A record that lives outside the evidence surface cannot be bound.
  fs.writeFileSync(path.join(world.tree, 'somewhere-else.json'), `${JSON.stringify(world.candidateRecord, null, 2)}\n`);
  await expectProvenanceError('EVIDENCE_REF_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: 'somewhere-else.json',
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a reference that does not have the shape of an evidence record is refused', async () => {
  const world = await buildTree();
  // The reference stays INSIDE the evidence surface, but it does not name a
  // record: only a JSON artifact of that surface can be bound.
  fs.writeFileSync(path.join(world.tree, 'evidence', 'not-a-record.txt'), 'not a record\n');
  await expectProvenanceError('EVIDENCE_REF_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: 'evidence/not-a-record.txt',
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a reference that escapes the tree is refused', async () => {
  const world = await buildTree();
  await expectProvenanceError('EVIDENCE_REF_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: '../escaped-record.json',
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  await expectProvenanceError('EVIDENCE_REF_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: '../escaped-corpus',
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a corpus outside the canonical corpus surface is refused', async () => {
  const world = await buildTree();
  await expectProvenanceError('EVIDENCE_REF_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: 'somewhere-else',
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a baseline that is not a baseline is refused', async () => {
  const world = await buildTree();
  // The baseline reference points at the candidate record itself.
  await expectProvenanceError('EVIDENCE_BASELINE_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: RECORD_REF,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a candidate without a baseline is refused', async () => {
  const world = await buildTree();
  await expectProvenanceError('EVIDENCE_BASELINE_MISSING', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: null,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 a record of another subject is refused', async () => {
  const world = await buildTree();
  const error = await expectProvenanceError('EVIDENCE_SUBJECT_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: 'another-skill',
    validate
  }));
  assert.match(error.message, /not the promoted skill/);
});

test('S8 a record that was not produced by a replayable evaluation is refused', async () => {
  const world = await buildTree();
  // A live evaluation is contract-valid but NOT re-executable: only a
  // recorded_replay evaluation can be traced back to immutable execution
  // results, so it is refused with a named reason instead of being accepted
  // unverified.
  const live = structuredClone(world.candidateRecord);
  live.model_run.mode = 'live_model';
  live.model_run.isolated = false;
  live.model_run.executor_ref = 'some-live-executor';
  live.model_run.isolation_envelope.workspace_write = 'uncontained_process';
  live.model_run.isolation_envelope.network = 'allowlisted';
  live.verdict = 'IMPROVEMENT_REJECTED';
  writeRecordFile(world.tree, RECORD_REF, reseal(live));

  const error = await expectProvenanceError('EVIDENCE_MODE_UNVERIFIABLE', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /recorded_replay/);
});

test('S8 the caller digest is checked against the record on disk, never the other way round', async () => {
  const world = await buildTree();
  const record = readRecordFile(world.tree, RECORD_REF);
  // A CORRECT expectation passes.
  const attestation = await verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    expectedDigest: computeContentDigest(record),
    skillId: SUBJECT,
    validate
  });
  assert.equal(attestation.content_digest, computeContentDigest(record));
  // A WRONG expectation narrows the gate: the record on disk wins.
  await expectProvenanceError('EVIDENCE_DIGEST_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    expectedDigest: `sha256:${'0'.repeat(64)}`,
    skillId: SUBJECT,
    validate
  }));
});

test('S8 the readback re-reads the record from the evidence surface and binds its digest', async () => {
  const world = await buildTree();
  const read = readEvidenceRecord({ root: world.tree, ref: RECORD_REF });
  assert.equal(read.relative, RECORD_REF);
  assert.match(read.digest, /^sha256:[a-f0-9]{64}$/);
  // The digest is the digest of the record ON DISK, recomputed here and not
  // taken from the record's own claim.
  const onDisk = readRecordFile(world.tree, RECORD_REF);
  const expected = `sha256:${crypto.createHash('sha256').update(canonicalJson(onDisk)).digest('hex')}`;
  assert.equal(read.digest, expected);
  assert.equal(onDisk.eval_id, read.record.eval_id);
});

test('S8 the SHIPPED evidence reproduces against the shipped corpus', async () => {
  // The evidence that is committed in this repository must be traceable to
  // the corpus that is committed with it. This is the shipped counterpart of
  // the fixture tests above. The subject-bound tree is the record set the
  // current runner produces; the 2026-10-21 tree stays as the historical
  // 1.0.0 record set it is.
  const attestation = await verifyEvidenceProvenance({
    root,
    recordRef: 'evidence/skill-effectiveness-evals-subject-bound-2026-10-21/eval-record-bev-skill-effectiveness-candidate.json',
    corpusRef: 'evals/skill-effectiveness',
    baselineRecordRef: 'evidence/skill-effectiveness-evals-subject-bound-2026-10-21/eval-record-bev-skill-effectiveness-baseline.json',
    skillId: 'maws-workflow-core-router-profile',
    validate
  });
  assert.equal(attestation.execution_rederived, true);
  assert.equal(attestation.comparison_rederived, true);
  assert.equal(attestation.verdict, 'IMPROVEMENT_PROVEN');
  assert.equal(attestation.subject_ref, 'maws-workflow-core-router-profile');
  // A routing_profile subject carries no content binding: the attestation
  // names that honestly, and such an evaluation can never be ADMITTED for
  // a skill content.
  assert.equal(attestation.subject_content_digest, null);
});

test('S8 the SUPERSEDED shipped evidence no longer reproduces and is refused', async () => {
  // The evidence of 2026-10-20 was produced by an earlier record contract.
  // It is a stale receipt twice over: it no longer satisfies the current
  // contract, and the current runner would not reproduce it. The promotion
  // chain must refuse it instead of trusting the verdict it carries.
  const error = await expectProvenanceError('EVIDENCE_RECORD_INVALID', () => verifyEvidenceProvenance({
    root,
    recordRef: 'evidence/skill-effectiveness-evals-2026-10-20/eval-record-bev-skill-effectiveness-candidate.json',
    corpusRef: 'evals/skill-effectiveness',
    baselineRecordRef: 'evidence/skill-effectiveness-evals-2026-10-20/eval-record-bev-skill-effectiveness-baseline.json',
    skillId: 'maws-workflow-core-router-profile',
    validate
  }));
  assert.match(error.message, /violates its contract/);
});

test('S5 a skill subject without the measured content is refused at the corpus', async () => {
  // The subject content binding is the property that makes a skill
  // evaluation a measurement of CONTENT: a corpus that names a skill
  // without carrying the content it measures produces records that cannot
  // prove what they measured.
  const tree = tempDir();
  const corpusDir = path.join(tree, 'evals', CORPUS_NAME);
  for (const [relative, content] of Object.entries(corpusFiles())) {
    if (relative === 'subject/SKILL.md') continue;
    const absolute = path.join(corpusDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    let text = content;
    if (relative === 'corpus.json') {
      const manifest = JSON.parse(text);
      delete manifest.subject.content_path;
      delete manifest.subject.content_digest;
      text = `${JSON.stringify(manifest, null, 2)}\n`;
    }
    fs.writeFileSync(absolute, text);
  }
  expectCorpusError('CORPUS_SUBJECT_CONTENT_UNBOUND', () => loadCorpus(corpusDir));
});

test('S5 a corpus whose subject content does not digest to its declaration is refused', async () => {
  const tree = tempDir();
  const corpusDir = path.join(tree, 'evals', CORPUS_NAME);
  for (const [relative, content] of Object.entries(corpusFiles())) {
    const absolute = path.join(corpusDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    let text = content;
    if (relative === 'subject/SKILL.md') {
      text = `${content}\n<!-- tampered -->\n`;
    }
    fs.writeFileSync(absolute, text);
  }
  expectCorpusError('CORPUS_SUBJECT_DIGEST_MISMATCH', () => loadCorpus(corpusDir));
});

test('S5 the measured subject content is re-derived: content that changed after the record is refused', async () => {
  // The record binds the subject content by digest. Replacing the content
  // AND its declared digest makes the corpus self-consistent again — but
  // the re-execution then measures the NEW content, and the record no
  // longer reproduces. A substituted measurement is refused, not accepted.
  const world = await buildTree();
  const tree = world.tree;
  const contentPath = path.join(tree, 'evals', CORPUS_NAME, 'subject/SKILL.md');
  const manifestPath = path.join(tree, 'evals', CORPUS_NAME, 'corpus.json');
  const newContent = `${fs.readFileSync(contentPath, 'utf8')}\n<!-- replaced after the record was produced -->\n`;
  fs.writeFileSync(contentPath, newContent);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.subject.content_digest = `sha256:${crypto.createHash('sha256').update(newContent).digest('hex')}`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const error = await expectProvenanceError('EVIDENCE_EXECUTION_MISMATCH', () => verifyEvidenceProvenance({
    root: tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /subject/);
});

async function expectCorpusError(code, fn) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
    return error;
  }
  assert.fail(`expected EvalConfigError ${code}`);
}

test('S5 a supplied baseline that measured OTHER subject content is refused', async () => {
  // The baseline is the comparison reference. A baseline record whose
  // subject content digest names different content than the corpus carries
  // is a substituted measurement and must never produce IMPROVEMENT_PROVEN.
  // The mutated record is RE-SEALED, so the refusal is the subject binding,
  // not the broken seal.
  const world = await buildTree();
  const tree = world.tree;
  const baselinePath = path.join(tree, 'stale-baseline.json');
  const baseline = JSON.parse(fs.readFileSync(path.join(tree, BASELINE_REF), 'utf8'));
  baseline.subject.content_digest = `sha256:${'4'.repeat(64)}`;
  baseline.reproducibility.content_digest = computeContentDigest(baseline);
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  await expectRunnerError('BASELINE_RECORD_MISMATCH', async () => await runSkillEffectivenessEval({
    corpus: loadCorpus(path.join(tree, 'evals', CORPUS_NAME)),
    mode: 'recorded_replay',
    evalIdBase: 'bev_s8_provenance',
    baselineRecordPath: baselinePath
  }));
});

async function expectRunnerError(code, fn) {
  try {
    await fn();
  } catch (error) {
    assert.equal(error.code, code, `expected ${code}, got ${error?.code}: ${error?.message}`);
    return error;
  }
  assert.fail(`expected EvalConfigError ${code}`);
}

// ---------------------------------------------------------------------------
// The REMAINING provenance boundaries.
//
// The cases above forge the CANDIDATE record. The cases below cover the
// branches that were still UNPROVEN: the baseline half of E2 and E6 (the
// baseline was only ever verified in its passing form), the corpus identity
// gate, the variant gate, the clock gate and the shape of the caller's
// digest. Each case names the branch it reaches, and a mutation probe proved
// that the branch is load-bearing.
// ---------------------------------------------------------------------------

test('S8 the baseline record must satisfy its own content seal', async () => {
  const world = await buildTree();
  // The baseline is edited after it was sealed. The candidate is untouched,
  // so this is the BASELINE's seal and not the candidate's.
  const baseline = readRecordFile(world.tree, BASELINE_REF);
  baseline.metrics.routing.decisions_matched = 1;
  writeRecordFile(world.tree, BASELINE_REF, baseline);
  const error = await expectProvenanceError('EVIDENCE_RECORD_SEAL_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /does not satisfy its own content seal/);
});

test('S8 the baseline is re-executed too: a baseline whose measurements do not follow from the corpus is refused', async () => {
  const world = await buildTree();
  // The forgery is RESEALED: the baseline carries a correct content seal and
  // a correct contract shape, and its measurements still do not follow from
  // the corpus.
  const forged = reseal({
    ...structuredClone(world.baselineRecord),
    metrics: {
      ...structuredClone(world.baselineRecord.metrics),
      routing: {
        ...structuredClone(world.baselineRecord.metrics.routing),
        decisions_matched: 1
      }
    }
  });
  writeRecordFile(world.tree, BASELINE_REF, forged);
  const error = await expectProvenanceError('EVIDENCE_EXECUTION_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /the baseline record .* does not reproduce from the corpus/);
});

test('S8 a baseline that measured another subject is refused', async () => {
  const world = await buildTree();
  const forged = reseal({
    ...structuredClone(world.baselineRecord),
    subject: { ...structuredClone(world.baselineRecord.subject), ref: 'another-subject' }
  });
  writeRecordFile(world.tree, BASELINE_REF, forged);
  const error = await expectProvenanceError('EVIDENCE_SUBJECT_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /the baseline .* measured subject "another-subject"/);
});

test('S8 a record that names another corpus is refused', async () => {
  const world = await buildTree();
  const forged = reseal({
    ...structuredClone(world.candidateRecord),
    reproducibility: {
      ...structuredClone(world.candidateRecord.reproducibility),
      corpus_ref: 'another-corpus'
    }
  });
  writeRecordFile(world.tree, RECORD_REF, forged);
  const error = await expectProvenanceError('EVIDENCE_CORPUS_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /names corpus "another-corpus"/);
});

test('S8 the promotion binds candidate evaluations: a baseline record in the candidate slot is refused', async () => {
  const world = await buildTree();
  const error = await expectProvenanceError('EVIDENCE_VARIANT_UNSUPPORTED', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: BASELINE_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /the promotion binds candidate evaluations/);
});

test("S8 a caller's digest must be a canonical digest", async () => {
  const world = await buildTree();
  const error = await expectProvenanceError('EVIDENCE_DIGEST_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    expectedDigest: 'not-a-canonical-digest',
    validate
  }));
  assert.match(error.message, /is not a canonical digest/);
});

test('S8 an unusable clock is refused', async () => {
  const world = await buildTree();
  const error = await expectProvenanceError('EVIDENCE_STALE', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    now: 'not-a-clock',
    validate
  }));
  assert.match(error.message, /could not be compared against a valid clock/);
});

test('S8 a record reference must be given: the record is never supplied by the caller', async () => {
  const world = await buildTree();
  const error = await expectProvenanceError('EVIDENCE_REF_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: null,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /reference is missing/);
});

test('S8 a record that is a symbolic link out of the tree is refused', async () => {
  const world = await buildTree();
  const recordPath = path.join(world.tree, RECORD_REF);
  const outside = path.join(tempDir(), 'record.json');
  fs.copyFileSync(recordPath, outside);
  fs.rmSync(recordPath);
  fs.symlinkSync(outside, recordPath);
  const error = await expectProvenanceError('EVIDENCE_REF_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /record/);
});

test('S8 a record that is not readable JSON is refused', async () => {
  const world = await buildTree();
  writeRecordFile(world.tree, RECORD_REF, { not: 'a record' });
  fs.writeFileSync(path.join(world.tree, RECORD_REF), '{ this is not json\n');
  const error = await expectProvenanceError('EVIDENCE_RECORD_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /not readable JSON/);
});

test('S8 a corpus that is not a directory is refused', async () => {
  const world = await buildTree();
  const fileCorpus = 'evals/not-a-directory';
  fs.writeFileSync(path.join(world.tree, fileCorpus), 'a file, not a corpus\n');
  const error = await expectProvenanceError('EVIDENCE_CORPUS_INVALID', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: fileCorpus,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate
  }));
  assert.match(error.message, /corpus/);
});

test('S8 a record whose subject is not the subject the corpus measures is refused', async () => {
  const world = await buildTree();
  const forged = reseal({
    ...structuredClone(world.candidateRecord),
    subject: { ...structuredClone(world.candidateRecord.subject), ref: 'another-subject' }
  });
  writeRecordFile(world.tree, RECORD_REF, forged);
  // No skill is named here, so the CORPUS is the reference the record must
  // agree with.
  const error = await expectProvenanceError('EVIDENCE_SUBJECT_MISMATCH', () => verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: null,
    validate
  }));
  assert.match(error.message, /the corpus .* measures subject "provenance-subject"/);
});
