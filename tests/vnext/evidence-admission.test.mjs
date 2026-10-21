// S9 — trusted evidence admission tests (extension of slice S8, Governance
// Promotion; spec MAWS-SII-TARGET-SPEC-001 v0.2.0).
//
// S8 proved that a behavioral evaluation REPRODUCES over a corpus. S9 proves
// the two bindings that stand above it: that the evaluation is admitted FOR
// the content that is actually being adopted, and that it comes from a source
// whose identity is established. The negative cases below are the three the
// directive names: PATH SUBSTITUTION, MANIPULATED REFERENCES and
// INADMISSIBLE EVIDENCE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  verifyEvidenceAdmission,
  materialDigest,
  EvidenceAdmissionError
} from '../../scripts/tools/evidence-admission.mjs';
import { computeAdmission, runCli as admitCli } from '../../scripts/tools/admit-evidence.mjs';
import {
  loadCorpus,
  runSkillEffectivenessEval,
  computeContentDigest
} from '../../scripts/tools/run-skill-effectiveness-evals.mjs';
import { validateBehavioralEvalRecord } from '../../scripts/tools/validate-behavioral-eval.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { verifyEvidenceProvenance } from '../../scripts/tools/evidence-provenance.mjs';
import { promoteSkillCandidate, postAdoptionReadback, PromotionError } from '../../scripts/tools/promote-skill-candidate.mjs';
import { canonicalJson } from '../../runtime/vnext/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 's9-admission-'));
}

function sha256Prefixed(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

const SKILL_ID = 'admission-skill';
// The provenance gate binds the record's subject to the promoted skill,
// so the fixture's subject IS the skill it promotes.
const SUBJECT = SKILL_ID;
const CORPUS_NAME = 'admission-corpus';
const CORPUS_REF = `evals/${CORPUS_NAME}`;
const EVIDENCE_RUN = 'evidence/admission-fixture';
const RECORD_REF = `${EVIDENCE_RUN}/eval-record-candidate.json`;
const BASELINE_REF = `${EVIDENCE_RUN}/eval-record-baseline.json`;

const CANDIDATE_CONTENT = `---
name: ${SKILL_ID}
description: S9 admission fixture candidate
version: 1.0.0
---

# Admission Skill

Deterministic fixture body for the trusted evidence admission tests.
`;

// --- git helpers -------------------------------------------------------------

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20000,
    shell: false
  }).trim();
}

function gitInit(dir) {
  execFileSync('git', ['init', '-q', dir], { stdio: 'ignore', shell: false });
  git(dir, ['config', 'user.email', 's9-fixture@example.invalid']);
  git(dir, ['config', 'user.name', 'S9 Fixture']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  // The default branch name depends on the git installation; the fixture
  // reads the one it got instead of assuming one. The repository has no
  // commit yet, so the branch is read symbolically.
  return git(dir, ['symbolic-ref', '--short', 'HEAD']);
}

function gitCommit(dir, message) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

// --- the corpus and the records ----------------------------------------------

function corpusFiles() {
  const positiveCase = (text) => ({
    case_id: 'se_pos_001',
    family: 'positive',
    task: 'Route the admission fixture task.',
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
    corpus_id: 'admission-corpus',
    subject: { kind: 'skill', ref: SUBJECT },
    families: [
      { family: 'positive', file: 'shared', via: 'variant', blocking: true },
      { family: 'negative', file: 'negative-cases/cases.json', blocking: true }
    ],
    variants: {
      BASELINE: { positive_cases_file: 'baseline/cases.json' },
      CANDIDATE: { positive_cases_file: 'candidates/cases.json' }
    }
  };
  return {
    'corpus.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'baseline/cases.json': `${JSON.stringify({ cases: [positiveCase('Reuse decision: extend the existing shared core.')] }, null, 2)}\n`,
    'candidates/cases.json': `${JSON.stringify({ cases: [positiveCase('Reuse decision: extend the existing canonical surface.')] }, null, 2)}\n`,
    'negative-cases/cases.json': `${JSON.stringify({ cases: [negativeCase] }, null, 2)}\n`
  };
}

// buildWorld({ versioned }) -> a complete evidence world: the corpus, the
// records the canonical runner produced from it, the candidate artifact and
// the admission that binds them.
async function buildWorld({ versioned = true, sourceKind = null } = {}) {
  const tree = tempDir();
  let worldBranch = null;
  const corpusDir = path.join(tree, 'evals', CORPUS_NAME);
  for (const [relative, content] of Object.entries(corpusFiles())) {
    const absolute = path.join(corpusDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  const corpus = loadCorpus(corpusDir);
  const { baselineRecord, candidateRecord } = await runSkillEffectivenessEval({
    corpus,
    mode: 'recorded_replay',
    evalIdBase: 'bev_s9_admission'
  });
  const evidenceDir = path.join(tree, EVIDENCE_RUN);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'eval-record-baseline.json'), `${JSON.stringify(baselineRecord, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'eval-record-candidate.json'), `${JSON.stringify(candidateRecord, null, 2)}\n`);

  // The candidate artifact: the content the evidence is admitted FOR.
  const candidateDir = tempDir();
  const candidatePath = path.join(candidateDir, 'SKILL.md');
  fs.writeFileSync(candidatePath, CANDIDATE_CONTENT);

  if (versioned) {
    const branch = gitInit(tree);
    gitCommit(tree, 'evidence: the behavioral eval records and the corpus');
    worldBranch = branch;
  }

  const admission = computeAdmission({
    skillId: SKILL_ID,
    recordRef: RECORD_REF,
    baselineRef: BASELINE_REF,
    corpusRef: CORPUS_REF,
    evidenceRoot: tree,
    contentPath: candidatePath,
    sourceKind: sourceKind ?? (versioned ? 'git_commit' : 'content')
  });
  const admissionRef = `evidence/admissions/${admission.admission_id}.json`;
  const admissionPath = path.join(tree, admissionRef);
  fs.mkdirSync(path.dirname(admissionPath), { recursive: true });
  fs.writeFileSync(admissionPath, `${JSON.stringify(admission, null, 2)}\n`);
  if (versioned) {
    gitCommit(tree, 'evidence: admit the behavioral evaluation for the candidate content');
  }

  return { tree, candidatePath, admission, admissionRef, admissionPath, worldBranch };
}

const validateAdmission = (record) => validateInstanceAgainstContract(record, 'core/contracts/evidence-admission.schema.json', root);
const validateEval = (record) => validateBehavioralEvalRecord(record, root);

async function expectPromotionError(code, fn) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof PromotionError, `expected PromotionError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected PromotionError ${code}`);
}

async function expectAdmissionError(code, fn) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof EvidenceAdmissionError, `expected EvidenceAdmissionError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected EvidenceAdmissionError ${code}`);
}

// The S8 attestation the admission is checked against: the material the
// promotion actually bound.
async function attest(world) {
  return verifyEvidenceProvenance({
    root: world.tree,
    recordRef: RECORD_REF,
    corpusRef: CORPUS_REF,
    baselineRecordRef: BASELINE_REF,
    skillId: SUBJECT,
    validate: validateEval
  });
}

test('S9 a genuine admission is verified: the evidence is admitted for the adopted content from a committed source', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  const result = verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  });
  assert.equal(result.source_kind, 'git_commit');
  assert.equal(result.content_digest, sha256Prefixed(CANDIDATE_CONTENT));
  assert.equal(result.skill_id, SKILL_ID);
  assert.equal(result.subject_ref, SUBJECT);
  assert.equal(result.authority_granted, false);
  assert.match(result.source_commit, /^[0-9a-f]{40}$/);
  assert.match(result.source_admission_commit, /^[0-9a-f]{40}$/);
  assert.equal(result.material_digest, world.admission.material.material_digest);
});

test('S9 an admission for another content is refused: the evidence is not admitted for what is adopted', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  const error = await expectAdmissionError('EVIDENCE_ADMISSION_CONTENT_MISMATCH', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: `sha256:${'0'.repeat(64)}`,
    validate: validateAdmission
  }));
  assert.match(error.message, /the adoption promotes content/);
});

test('S9 an admission for another skill is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  await expectAdmissionError('EVIDENCE_ADMISSION_SKILL_MISMATCH', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: 'another-skill',
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
});

test('S9 a substituted record reference is refused: the admission must name the bound material', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // The admission names a record the promotion did not bind.
  const substituted = structuredClone(world.admission);
  substituted.material.record_ref = `${EVIDENCE_RUN}/eval-record-other.json`;
  substituted.material.material_digest = materialDigest(substituted.material);
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(substituted, null, 2)}\n`);

  const error = await expectAdmissionError('EVIDENCE_ADMISSION_MATERIAL_MISMATCH', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /not the material the promotion bound/);
});

test('S9 a manipulated material digest is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  const manipulated = structuredClone(world.admission);
  manipulated.material.record_digest = `sha256:${'0'.repeat(64)}`;
  manipulated.material.material_digest = materialDigest(manipulated.material);
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(manipulated, null, 2)}\n`);

  await expectAdmissionError('EVIDENCE_ADMISSION_MATERIAL_MISMATCH', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
});

test('S9 an admission reference outside the canonical admission surface is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // The same artifact, placed outside the admission surface.
  const escaped = 'evidence/admission-fixture/eval-record-candidate.json';
  await expectAdmissionError('EVIDENCE_ADMISSION_REF_INVALID', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: escaped,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  await expectAdmissionError('EVIDENCE_ADMISSION_REF_INVALID', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: '../escaped-admission.json',
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
});

test('S9 a tree that is not versioned cannot carry a committed admission', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // The tree loses its version control: the admission still names a commit,
  // but no commit can be established for it any more.
  fs.rmSync(path.join(world.tree, '.git'), { recursive: true, force: true });
  const error = await expectAdmissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /not inside a git checkout/);
});

test('S9 material that was changed after its commit is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // The corpus is edited after the commit that published it.
  const casesPath = path.join(world.tree, 'evals', CORPUS_NAME, 'negative-cases', 'cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  cases.cases[0].recorded_transcript.output_text = 'The request was refused: it is out of scope. Changed after the commit.';
  fs.writeFileSync(casesPath, `${JSON.stringify(cases, null, 2)}\n`);

  const error = await expectAdmissionError('EVIDENCE_ADMISSION_SOURCE_MODIFIED', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /differs from the content commit/);
});

test('S9 an admission that is not committed is refused: an admission is a reviewed change', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // The admission is removed from the index and from the history: the
  // working tree still carries it, but no commit published it.
  git(world.tree, ['rm', '--cached', '-q', world.admissionRef]);
  git(world.tree, ['commit', '-q', '--allow-empty', '-m', 'unpublish the admission']);
  const error = await expectAdmissionError('EVIDENCE_ADMISSION_NOT_COMMITTED', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /not committed/);
});

test('S9 an admission that was changed after it was committed is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  const changed = structuredClone(world.admission);
  changed.admitted_at = '2020-01-01T00:00:00Z';
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(changed, null, 2)}\n`);

  const error = await expectAdmissionError('EVIDENCE_ADMISSION_SOURCE_MODIFIED', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /differs from the content its publishing commit carries/);
});

test('S9 a commit that does not exist is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  const unknown = structuredClone(world.admission);
  unknown.source.commit = '0'.repeat(40);
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(unknown, null, 2)}\n`);

  await expectAdmissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
});

test('S9 a commit outside the published history is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // A commit that exists but is not part of the published history: it is
  // created on a side branch and never merged.
  git(world.tree, ['checkout', '-q', '-b', 'side']);
  git(world.tree, ['commit', '-q', '--allow-empty', '-m', 'a side commit']);
  const side = git(world.tree, ['rev-parse', 'HEAD']);
  git(world.tree, ['checkout', '-q', world.worldBranch]);
  const unknown = structuredClone(world.admission);
  unknown.source.commit = side;
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(unknown, null, 2)}\n`);

  await expectAdmissionError('EVIDENCE_ADMISSION_SOURCE_NOT_PUBLISHED', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
});

test('S9 the content source kind is admitted and recorded as the weaker form', async () => {
  const world = await buildWorld({ versioned: false, sourceKind: 'content' });
  const attestation = await attest(world);
  const result = verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  });
  assert.equal(result.source_kind, 'content');
  assert.equal(result.source_commit, null);
  // The weaker form is named, never silently upgraded.
  assert.equal(result.content_digest, sha256Prefixed(CANDIDATE_CONTENT));
  assert.equal(result.material_digest, world.admission.material.material_digest);
});



test('S9 the material digest is the identity of the admitted set', async () => {
  const world = await buildWorld();
  const other = structuredClone(world.admission.material);
  other.record_ref = `${EVIDENCE_RUN}/eval-record-other.json`;
  assert.notEqual(materialDigest(other), world.admission.material.material_digest);
  assert.equal(materialDigest(world.admission.material), world.admission.material.material_digest);
});

test('S9 the admission names the content it was computed from, and never the subject only', async () => {
  const world = await buildWorld();
  assert.equal(world.admission.authority_granted, false);
  assert.equal(world.admission.source.kind, 'git_commit');
  // The admission names the content it was computed from, and the content
  // digest is the digest of the candidate artifact.
  assert.equal(world.admission.content_digest, sha256Prefixed(CANDIDATE_CONTENT));
  assert.equal(world.admission.subject_ref, SUBJECT);
});

test('S9 the full promotion chain accepts an admitted evaluation and refuses an admission for other content', async () => {
  // The chain end to end: the frontdoor admission, the provenance gate, the
  // admission gate, the owner approval, the versioned adoption and the
  // readback. The promotion SUCCEEDS with a valid admission - and the same
  // chain refuses when the evidence is admitted for other content.
  const world = await buildWorld();
  const canonical = tempDir();
  fs.writeFileSync(path.join(canonical, 'package.json'), `${JSON.stringify({ name: 'canonical-tree', version: '1.0.0' }, null, 2)}\n`);
  fs.mkdirSync(path.join(canonical, 'core/contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(canonical, 'core/contracts/provider-capabilities.json'),
    `${JSON.stringify({ providers: [{ name: 'test-provider', skillPackaging: 'adapter', packaging: 'directory', aliases: [], legacyExportDirectories: [] }] }, null, 2)}\n`
  );

  // The owner trust anchor: published, with a key that signs the approval.
  const keyPair = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const authorityPath = path.join(tempDir(), 'owner-authority.json');
  fs.writeFileSync(authorityPath, `${JSON.stringify({
    schema_version: '1.0.0',
    authority_id: 'canonical_owner',
    authority_status: 'PUBLISHED',
    keys: [{ key_id: 'owner_key_s9_0001', algorithm: 'ed25519', public_key_pem: keyPair.publicKey, role: 'canonical_owner', status: 'active', added_at: '2026-10-21T00:00:00Z' }],
    updated_at: '2026-10-21T00:00:00Z'
  }, null, 2)}\n`);

  // The candidate artifact the admission is computed over. It is NOT the
  // canonical tree: the promotion writes the skill file itself, and a
  // pre-existing file would be read as the superseded version.
  const candidateArtifact = path.join(tempDir(), 'candidate-SKILL.md');
  fs.writeFileSync(candidateArtifact, CANDIDATE_CONTENT);

  // The frontdoor admission for the candidate content.
  const admissionPath = path.join(tempDir(), 'admission.json');
  fs.writeFileSync(admissionPath, `${JSON.stringify({
    schema_version: '1.0.0',
    admission_id: 'sfa_s9_candidate_0001',
    candidate: { skill_id: SKILL_ID, target: 'local-directory', target_kind: 'local-directory', source_revision: sha256Prefixed(CANDIDATE_CONTENT) },
    requested_action: 'implement',
    evidence: {
      skillspector: { analyzer: 'NVIDIA/SkillSpector', version: '0.5.0', scan_mode: 'static-no-llm', exit_code: 0, report_path: 'sandbox/runs/20261021T000000Z/skillspector/skillspector-report.json', status: 'PASS', severity: 'none', severity_counts: { critical: 0, high: 0, medium: 0, low: 0 } },
      skillevaluator_tier1: { analyzer: 'NVIDIA/SkillEvaluator', version: '0.5.0', profile: 'external', tier_scope: '1', exit_code: 0, report_path: 'sandbox/runs/20261021T000000Z/skillevaluator/skillevaluator-output.json', status: 'PASS', overall_status: 'passed', overall_passed: true, severity_counts: { critical: 0, high: 0, medium: 0, low: 0 } }
    },
    analysis_disposition: 'CLEAN',
    implementation_disposition: 'ELIGIBLE',
    authority_granted: false,
    blockers: [],
    decided_at: '2026-10-21T00:00:00.000Z'
  }, null, 2)}\n`);

  // The owner approval for the candidate content.
  const approvalBody = {
    schema_version: '1.0.0',
    approver: 'canonical_owner',
    skill_id: SKILL_ID,
    decision_ref: 'owner_decision_s9_0001',
    approved_at: '2026-10-21T00:00:00Z',
    candidate_digest: sha256Prefixed(CANDIDATE_CONTENT)
  };
  const approvalRef = 'core/authority/approvals/owner_decision_s9_0001.json';
  const approvalPath = path.join(canonical, approvalRef);
  fs.mkdirSync(path.dirname(approvalPath), { recursive: true });
  fs.writeFileSync(approvalPath, `${JSON.stringify({
    ...approvalBody,
    signature: {
      algorithm: 'ed25519',
      key_id: 'owner_key_s9_0001',
      value: crypto.sign(null, Buffer.from(canonicalJson(approvalBody), 'utf8'), keyPair.privateKey).toString('base64')
    }
  }, null, 2)}\n`);

  const { record, issues } = await promoteSkillCandidate({
    adoptionId: 'adopt_s9_chain_0001',
    skillId: SKILL_ID,
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath,
    evalRecords: [{
      record_ref: RECORD_REF,
      corpus_ref: CORPUS_REF,
      baseline_record_ref: BASELINE_REF,
      expected_digest: computeContentDigest(world.admission.material.record_digest ? JSON.parse(fs.readFileSync(path.join(world.tree, RECORD_REF), 'utf8')) : {})
    }],
    evidenceAdmissionRef: world.admissionRef,
    ownerApprovalRef: approvalRef,
    ownerAuthorityPath: authorityPath,
    canonicalRoot: canonical,
    evidenceRoot: world.tree,
    root
  });
  assert.deepEqual(issues, []);
  assert.equal(record.authority_granted, false);
  assert.equal(record.evidence_admission.content_digest, sha256Prefixed(CANDIDATE_CONTENT));
  assert.equal(record.evidence_admission.source_kind, 'git_commit');
  assert.equal(record.eval_evidence.improvement_proven, true);
  // The adopted content is in the canonical tree, and the readback holds.
  assert.equal(fs.readFileSync(path.join(canonical, 'skills', SKILL_ID, 'SKILL.md'), 'utf8'), CANDIDATE_CONTENT);
  assert.deepEqual(await postAdoptionReadback({ record, canonicalRoot: canonical, evidenceRoot: world.tree, root }), []);

  // The same chain refuses when the evidence is admitted for OTHER content.
  const otherWorld = await buildWorld();
  const otherAdmission = structuredClone(otherWorld.admission);
  otherAdmission.content_digest = `sha256:${'0'.repeat(64)}`;
  fs.writeFileSync(otherWorld.admissionPath, `${JSON.stringify(otherAdmission, null, 2)}\n`);
  await expectPromotionError('EVIDENCE_ADMISSION_CONTENT_MISMATCH', () => promoteSkillCandidate({
    adoptionId: 'adopt_s9_chain_0002',
    skillId: SKILL_ID,
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath,
    evalRecords: [{
      record_ref: RECORD_REF,
      corpus_ref: CORPUS_REF,
      baseline_record_ref: BASELINE_REF
    }],
    evidenceAdmissionRef: otherWorld.admissionRef,
    ownerApprovalRef: approvalRef,
    ownerAuthorityPath: authorityPath,
    canonicalRoot: canonical,
    evidenceRoot: otherWorld.tree,
    root
  }));
});

test('S9 a forged content source identity is refused: the weaker kind must name the admitted material', async () => {
  const world = await buildWorld({ versioned: false, sourceKind: 'content' });
  const attestation = await attest(world);
  const forged = structuredClone(world.admission);
  forged.source.content_digest = `sha256:${'0'.repeat(64)}`;
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(forged, null, 2)}\n`);

  const error = await expectAdmissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /not the identity of the admitted material/);
});

test('S9 the weaker content kind is not admitted in a versioned tree: the source trust cannot be downgraded', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // The tree IS versioned, so the committed identity must be used. A caller
  // that may write into the working copy must not be able to downgrade the
  // source trust by declaring the weaker kind.
  const downgraded = structuredClone(world.admission);
  downgraded.source = { kind: 'content', content_digest: downgraded.material.material_digest, surface: 'evidence' };
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(downgraded, null, 2)}\n`);

  const error = await expectAdmissionError('EVIDENCE_ADMISSION_SOURCE_UNVERIFIABLE', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /is versioned/);
});

test('S9 an admission that does not carry the digest of its own material set is refused', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  // The material fields are the bound ones, but the admission does not carry
  // their identity: the set could have been assembled from somewhere else.
  const forged = structuredClone(world.admission);
  forged.material.material_digest = `sha256:${'0'.repeat(64)}`;
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(forged, null, 2)}\n`);

  const error = await expectAdmissionError('EVIDENCE_ADMISSION_MATERIAL_MISMATCH', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: validateAdmission
  }));
  assert.match(error.message, /does not carry the digest of its own admitted material set/);
});

test('S9 an admission that claims authority is refused by the runtime, not only by the contract', async () => {
  const world = await buildWorld();
  const attestation = await attest(world);
  const claiming = structuredClone(world.admission);
  claiming.authority_granted = true;
  fs.writeFileSync(world.admissionPath, `${JSON.stringify(claiming, null, 2)}\n`);

  // The contract refuses it ...
  assert.ok(validateAdmission(claiming).length > 0, 'the contract must refuse an admission that claims authority');
  // ... and so does the runtime, which does not depend on the contract.
  await expectAdmissionError('EVIDENCE_ADMISSION_INVALID', () => verifyEvidenceAdmission({
    root: world.tree,
    admissionRef: world.admissionRef,
    attestations: [attestation],
    skillId: SKILL_ID,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    validate: null
  }));
});

test('S9 the admission identity covers the material, the content and the skill', async () => {
  // The same evidence admitted for another content, or for another skill,
  // is a DIFFERENT admission: it must not overwrite the first one.
  const world = await buildWorld();
  const same = computeAdmission({
    skillId: SKILL_ID,
    recordRef: RECORD_REF,
    baselineRef: BASELINE_REF,
    corpusRef: CORPUS_REF,
    evidenceRoot: world.tree,
    contentPath: world.candidatePath,
    sourceKind: 'git_commit',
    admittedAt: '2026-10-21T00:00:00Z'
  });
  assert.equal(same.admission_id, world.admission.admission_id);

  const otherSkill = computeAdmission({
    skillId: 'another-skill',
    recordRef: RECORD_REF,
    baselineRef: BASELINE_REF,
    corpusRef: CORPUS_REF,
    evidenceRoot: world.tree,
    contentPath: world.candidatePath,
    sourceKind: 'git_commit',
    admittedAt: '2026-10-21T00:00:00Z'
  });
  assert.notEqual(otherSkill.admission_id, world.admission.admission_id);
});

test('S9 the calculator is a dry run by default and writes only on --write', async () => {
  const world = await buildWorld();
  const args = [
    '--skill', SKILL_ID,
    '--record', RECORD_REF,
    '--baseline', BASELINE_REF,
    '--corpus', CORPUS_REF,
    '--evidence-root', world.tree,
    '--content', world.candidatePath,
    '--source-kind', 'content'
  ];
  const outRef = 'evidence/admissions/admit_evidence_dry_run_probe.json';

  // The dry run computes the admission and writes NOTHING.
  const dry = admitCli([...args, '--out', outRef]);
  assert.equal(dry.ok, true);
  assert.equal(dry.written, false);
  assert.ok(dry.admission);
  assert.equal(fs.existsSync(path.join(world.tree, outRef)), false);

  // The write applies it and reads it back.
  const applied = admitCli([...args, '--out', outRef, '--write']);
  assert.equal(applied.ok, true);
  assert.equal(applied.written, true);
  const written = JSON.parse(fs.readFileSync(path.join(world.tree, outRef), 'utf8'));
  assert.deepEqual(written, applied.admission);

  // A write target outside the canonical admission surface is refused, and
  // nothing is written outside the tree. The state before the call is
  // captured, so the assertion does not depend on what else lives there.
  const escapedPath = path.join(world.tree, '..', 'escaped-admission.json');
  const before = fs.existsSync(escapedPath);
  const escaped = admitCli([...args, '--out', '../escaped-admission.json', '--write']);
  assert.equal(escaped.ok, false);
  assert.equal(escaped.written, false);
  assert.match(escaped.issues[0], /canonical admission surface/);
  assert.equal(fs.existsSync(escapedPath), before);
});

test('S9 the S8 gate is unchanged: the provenance attestation still holds for the admitted material', async () => {
  // The admission is built ON the S8 attestation, so the S8 gate must still
  // produce the material the admission names.
  const world = await buildWorld();
  const attestation = await attest(world);
  assert.equal(attestation.execution_rederived, true);
  assert.equal(attestation.comparison_rederived, true);
  assert.equal(attestation.verdict, 'IMPROVEMENT_PROVEN');
  assert.equal(attestation.record_digest, world.admission.material.record_digest);
  assert.equal(attestation.baseline_record_digest, world.admission.material.baseline_record_digest);
  assert.equal(attestation.corpus_digest, world.admission.material.corpus_digest);
  // The attestation's content digest is the record's own seal, recomputed.
  const record = JSON.parse(fs.readFileSync(path.join(world.tree, RECORD_REF), 'utf8'));
  assert.equal(attestation.content_digest, record.reproducibility.content_digest);
  assert.equal(attestation.content_digest, computeContentDigest(record));
});
