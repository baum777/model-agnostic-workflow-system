// S8 — governance promotion tests (spec MAWS-SII-TARGET-SPEC-001 v0.2.0,
// PROPOSED). The promotion chain binds frontdoor admission (bound to the
// exact candidate identity and content) + S5 behavioral evidence (bound by
// content digest, subject, corpus and age) + canonical owner approval
// VERIFIED against the canonical owner authority anchor (a self-declared
// approver and decision reference authorize nothing) + versioned adoption
// (the superseded version READ FROM THE CANONICAL TREE) + the canonical
// registry and provider export regeneration with readback + an append-only
// adoption ledger + the post-adoption readback. Adoption changes canonical
// skill content and NOTHING else: authority_granted stays false by
// construction.
import crypto from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  promoteSkillCandidate,
  postAdoptionReadback,
  validateFrontdoorAdmission,
  validateEvalEvidence,
  readAndDigestJson,
  semanticPromotionIssues,
  readFrontmatterVersion,
  readAdoptionLedger,
  runCli,
  PromotionError
} from '../../scripts/tools/promote-skill-candidate.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { canonicalJson } from '../../runtime/vnext/util.mjs';
import { computeContentDigest } from '../../scripts/tools/run-skill-effectiveness-evals.mjs';
import { approvalPayload } from '../../runtime/skills/owner-authority.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 's8-promotion-'));
}

function sha256Prefixed(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

const CANDIDATE_CONTENT = `---
name: promoted-skill
description: S8 promotion chain fixture candidate
version: 1.0.0
---

# Promoted Skill

Deterministic fixture body for the promotion chain test.
`;

const CANDIDATE_DIGEST = sha256Prefixed(CANDIDATE_CONTENT);
const APPROVAL_REF = 'core/authority/approvals/owner_decision_test_0001.json';

function candidateContentWithVersion(version) {
  return CANDIDATE_CONTENT.replace('version: 1.0.0', `version: ${version}`);
}

// --- owner authority helpers -------------------------------------------------

function makeKeyPair() {
  return crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

function approvalBody({
  skillId = 'promoted-skill',
  candidateDigest = CANDIDATE_DIGEST,
  decisionRef = 'owner_decision_test_0001',
  approvedAt = '2026-10-20T00:00:00Z'
} = {}) {
  return {
    schema_version: '1.0.0',
    approver: 'canonical_owner',
    skill_id: skillId,
    decision_ref: decisionRef,
    approved_at: approvedAt,
    candidate_digest: candidateDigest
  };
}

function signApproval(body, privateKey, keyId = 'owner_key_test_0001') {
  const value = crypto.sign(null, Buffer.from(approvalPayload(body), 'utf8'), privateKey).toString('base64');
  return { ...body, signature: { algorithm: 'ed25519', key_id: keyId, value } };
}

// The trust anchor lives OUTSIDE the canonical tree: the promotion target
// must never be able to carry its own authority.
function writeAuthority(dir, {
  publicKeyPem = null,
  keyId = 'owner_key_test_0001',
  keyStatus = 'active',
  authorityStatus = 'PUBLISHED'
} = {}) {
  const anchor = {
    schema_version: '1.0.0',
    authority_id: 'canonical_owner',
    authority_status: authorityStatus,
    keys: publicKeyPem
      ? [{ key_id: keyId, algorithm: 'ed25519', public_key_pem: publicKeyPem, role: 'canonical_owner', status: keyStatus, added_at: '2026-10-20T00:00:00Z' }]
      : [],
    updated_at: '2026-10-20T00:00:00Z'
  };
  const anchorPath = path.join(dir, 'owner-authority.json');
  fs.writeFileSync(anchorPath, `${JSON.stringify(anchor, null, 2)}\n`);
  return anchorPath;
}

function writeApproval(canonicalRoot, approval, ref = APPROVAL_REF) {
  const absolute = path.join(canonicalRoot, ref);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(approval, null, 2)}\n`);
  return ref;
}

// A minimal canonical tree the export generators can work on.
function makeCanonicalTree() {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'canonical-tree', version: '1.0.0' }, null, 2)}\n`);
  fs.mkdirSync(path.join(dir, 'core/contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'core/contracts/provider-capabilities.json'),
    `${JSON.stringify({
      providers: [{
        name: 'test-provider',
        skillPackaging: 'adapter',
        packaging: 'directory',
        aliases: [],
        legacyExportDirectories: []
      }]
    }, null, 2)}\n`
  );
  return dir;
}

function evalRecord({
  verdict = 'IMPROVEMENT_PROVEN',
  isolated = true,
  evalId = 'bev_s8_candidate_0001',
  variant = 'CANDIDATE',
  subjectRef = 'promoted-skill',
  corpusDigest = `sha256:${'c'.repeat(64)}`,
  createdAt = '2026-10-20T00:00:00Z'
} = {}) {
  const record = {
    schema_version: '1.0.0',
    eval_id: evalId,
    created_at: createdAt,
    variant,
    subject: { kind: 'skill', ref: subjectRef },
    model_run: {
      mode: 'recorded_replay',
      isolated,
      executor_ref: 'recorded_corpus_transcripts',
      isolation_envelope: {
        workspace_write: 'none',
        network: 'deny',
        inherited_qualification: 'none',
        allowed_effects: []
      }
    },
    case_families: [
      { family: 'positive', blocking: true, corpus_digest: `sha256:${'a'.repeat(64)}`, cases_total: 3, cases_passed: 3, cases_failed: 0 },
      { family: 'security_regression', blocking: true, corpus_digest: `sha256:${'b'.repeat(64)}`, cases_total: 1, cases_passed: 1, cases_failed: 0 }
    ],
    metrics: {
      routing: { decisions_expected: 4, decisions_matched: 4 },
      output: { assertions_total: 8, assertions_passed: 8 },
      cost: { tokens_in: 100, tokens_out: 40, cost_units: 0.002 },
      latency: { latency_ms_max: 900 }
    },
    security_gate: { security_cases_total: 1, security_regressions: 0, gate: 'PASS' },
    verdict,
    baseline_ref: 'bev_s8_baseline_0001',
    comparison: {
      baseline_eval_id: 'bev_s8_baseline_0001',
      routing_accuracy_delta: 0.25,
      output_assertion_pass_delta: 0.125,
      security_regressions: 0
    },
    reproducibility: {
      corpus_ref: 'skill-effectiveness',
      corpus_digest: corpusDigest,
      runner: 'run-skill-effectiveness-evals.mjs'
    },
    evidence_refs: ['evals/skill-effectiveness/corpus.json']
  };
  return { ...record, reproducibility: { ...record.reproducibility, content_digest: computeContentDigest(record) } };
}

function admissionRecord({
  implementationDisposition = 'ELIGIBLE',
  skillId = 'promoted-skill',
  sourceRevision = CANDIDATE_DIGEST
} = {}) {
  return {
    schema_version: '1.0.0',
    admission_id: 'sfa_s8_candidate_0001',
    candidate: {
      skill_id: skillId,
      target: 'local-directory',
      target_kind: 'local-directory',
      source_revision: sourceRevision
    },
    requested_action: 'implement',
    evidence: {
      skillspector: {
        analyzer: 'NVIDIA/SkillSpector',
        version: '0.5.0',
        scan_mode: 'static-no-llm',
        exit_code: 0,
        report_path: 'sandbox/runs/20261020T000000Z/skillspector/skillspector-report.json',
        status: 'PASS',
        severity: 'none',
        severity_counts: { critical: 0, high: 0, medium: 0, low: 0 }
      },
      skillevaluator_tier1: {
        analyzer: 'NVIDIA/SkillEvaluator',
        version: '0.5.0',
        profile: 'external',
        tier_scope: '1',
        exit_code: 0,
        report_path: 'sandbox/runs/20261020T000000Z/skillevaluator/skillevaluator-output.json',
        status: 'PASS',
        overall_status: 'passed',
        overall_passed: true,
        severity_counts: { critical: 0, high: 0, medium: 0, low: 0 }
      }
    },
    analysis_disposition: 'CLEAN',
    implementation_disposition: implementationDisposition,
    authority_granted: false,
    blockers: [],
    decided_at: '2026-10-20T00:00:00.000Z'
  };
}

// setup() builds a complete, isolated promotion world: a canonical tree, a
// trust anchor with a freshly generated key, a signed owner approval in the
// canonical decision surface, the frontdoor admission and the eval evidence.
function setup({
  admission = admissionRecord(),
  evals,
  approval = null,
  approvalRef = APPROVAL_REF,
  keyId = 'owner_key_test_0001',
  keyStatus = 'active',
  authorityStatus = 'PUBLISHED',
  publishKey = true,
  canonicalRoot = null,
  approve = true
} = {}) {
  const dir = tempDir();
  const tree = canonicalRoot ?? makeCanonicalTree();
  const keyPair = makeKeyPair();
  const anchorPath = writeAuthority(dir, {
    publicKeyPem: publishKey ? keyPair.publicKey : null,
    keyId,
    keyStatus,
    authorityStatus
  });
  const admissionPath = path.join(dir, 'admission.json');
  fs.writeFileSync(admissionPath, JSON.stringify(admission, null, 2));
  const evalEntries = (evals ?? [evalRecord()]).map((record, index) => ({
    record_ref: `evals/behavioral/${index}.json`,
    record,
    expected_digest: computeContentDigest(record)
  }));
  const body = approval ?? approvalBody();
  const signed = approve ? signApproval(body, keyPair.privateKey, keyId) : body;
  const ref = writeApproval(tree, signed, approvalRef);
  return { dir, tree, admissionPath, evalEntries, ownerAuthorityPath: anchorPath, ownerApprovalRef: ref, keyPair };
}

function expectPromotionError(code, fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof PromotionError, `expected PromotionError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected PromotionError ${code}`);
}

const OWNER_APPROVAL = { approver: 'canonical_owner', decision_ref: 'owner_decision_s8_0001', approved_at: '2026-10-20T00:00:00Z' };

test('S8 the full promotion chain produces a valid adoption record with a matching readback', () => {
  const world = setup();
  const candidateDigest = sha256Prefixed(CANDIDATE_CONTENT);
  const { record, issues } = promoteSkillCandidate({
    adoptionId: 'adopt_s8_chain_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest,
    admissionPath: world.admissionPath,
    evalRecords: world.evalEntries,
    ownerApprovalRef: world.ownerApprovalRef,
    ownerAuthorityPath: world.ownerAuthorityPath,
    canonicalRoot: world.tree,
    root
  });
  assert.deepEqual(issues, []);
  const schemaIssues = validateInstanceAgainstContract(record, 'core/contracts/skill-promotion-adoption.schema.json', root);
  assert.deepEqual(schemaIssues, []);
  assert.equal(record.authority_granted, false);
  assert.equal(record.frontdoor_admission.implementation_disposition, 'ELIGIBLE');
  assert.equal(record.eval_evidence.improvement_proven, true);
  assert.deepEqual(postAdoptionReadback({ record, canonicalRoot: world.tree }), []);
  // The adopted file really exists in the caller-provided canonical root.
  assert.equal(fs.readFileSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md'), 'utf8'), CANDIDATE_CONTENT);
});

test('S8 the canonical exports are regenerated, bound to the adoption and read back', () => {
  const world = setup();
  const { record, issues } = promoteSkillCandidate({
    adoptionId: 'adopt_s8_exports_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath: world.admissionPath,
    evalRecords: world.evalEntries,
    ownerApprovalRef: world.ownerApprovalRef,
    ownerAuthorityPath: world.ownerAuthorityPath,
    canonicalRoot: world.tree,
    root
  });
  assert.deepEqual(issues, []);

  const regeneration = record.export_regeneration;
  assert.equal(regeneration.performed, true);
  assert.equal(regeneration.readback_verified, true);
  assert.equal(regeneration.adoption_digest, record.canonical_adoption.adoption_digest);
  assert.ok(regeneration.export_digests.length >= 3);

  // The registry export exists on disk and carries the adopted skill.
  const registryPath = path.join(world.tree, 'core/contracts/core-registry.json');
  assert.ok(fs.existsSync(registryPath));
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.ok(registry.skills.some((skill) => skill.sourcePath === 'skills/promoted-skill/SKILL.md'));

  // The provider export exists and carries the adopted skill too.
  const providerPath = path.join(world.tree, 'providers/test-provider/export.json');
  assert.ok(fs.existsSync(providerPath));
  const providerExport = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
  assert.ok(providerExport.skills.some((skill) => skill.sourcePath === 'skills/promoted-skill/SKILL.md'));

  // Every recorded export digest is the digest of the file on disk.
  for (const entry of regeneration.export_digests) {
    const content = fs.readFileSync(path.join(world.tree, entry.ref), 'utf8');
    assert.equal(sha256Prefixed(content), entry.digest, `${entry.ref} must match the recorded digest`);
  }
});

test('S8 an incomplete export regeneration fails closed and leaves no mutation behind', () => {
  const world = setup();
  const skillPath = path.join(world.tree, 'skills/promoted-skill/SKILL.md');
  const registryPath = path.join(world.tree, 'core/contracts/core-registry.json');
  const providerPath = path.join(world.tree, 'providers/test-provider/export.json');
  // The provider export surface cannot be built: the canonical tree carries
  // a provider capability file that is not readable JSON.
  fs.mkdirSync(path.join(world.tree, 'core/contracts'), { recursive: true });
  fs.writeFileSync(path.join(world.tree, 'core/contracts/provider-capabilities.json'), '{ this is not json');

  expectPromotionError('EXPORT_REGENERATION_FAILED', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_export_fail_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );

  // No mutation is left behind: the canonical skill file is gone again and
  // no export surface was written.
  assert.equal(fs.existsSync(skillPath), false);
  assert.equal(fs.existsSync(registryPath), false);
  assert.equal(fs.existsSync(providerPath), false);
});

test('S8 the export readback detects a surface that changed after the write', () => {
  const world = setup();
  const error = expectPromotionError('EXPORT_REGENERATION_INCOMPLETE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_readback_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root,
      // The surface changes between the write and the readback.
      onExportsWritten: ({ written }) => {
        const target = written.find((entry) => entry.ref.endsWith('core-registry.json'));
        fs.appendFileSync(path.join(world.tree, target.ref), '<!-- changed after the write -->');
      }
    })
  );
  assert.match(error.message, /core-registry\.json/);
  // The failed promotion leaves no mutation behind.
  assert.equal(fs.existsSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md')), false);
});

test('S8 an export that does not reflect the adopted skill is an incomplete regeneration', () => {
  const world = setup();
  // The canonical tree carries a skill with the same identity in
  // core/skills: the registry keeps the first one it finds, so the adopted
  // skill is absent from the regenerated registry.
  fs.mkdirSync(path.join(world.tree, 'core/skills/promoted-skill'), { recursive: true });
  fs.writeFileSync(path.join(world.tree, 'core/skills/promoted-skill/SKILL.md'), CANDIDATE_CONTENT);

  const error = expectPromotionError('EXPORT_REGENERATION_INCOMPLETE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_not_reflected_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  assert.match(error.message, /does not contain the adopted skill/);
  assert.equal(fs.existsSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md')), false);
});

test('S8 a failing export write rolls every export surface and the skill file back', () => {
  const world = setup();
  const registryPath = path.join(world.tree, 'core/contracts/core-registry.json');
  const legacyRegistryPath = path.join(world.tree, 'contracts/core-registry.json');
  const providerExportPath = path.join(world.tree, 'providers/test-provider/export.json');
  // The provider export surface cannot be written (it is a directory), but
  // the registry surfaces are written before it: the failure happens AFTER
  // the tree was partly changed.
  fs.mkdirSync(providerExportPath, { recursive: true });

  const error = expectPromotionError('EXPORT_REGENERATION_FAILED', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_partial_write_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  assert.match(error.message, /export surface/);

  // The failed promotion leaves no mutation behind: the canonical skill file
  // is gone and every export surface is back at its pre-promotion state.
  assert.equal(fs.existsSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md')), false);
  assert.equal(fs.existsSync(registryPath), false);
  assert.equal(fs.existsSync(legacyRegistryPath), false);
  assert.equal(fs.lstatSync(providerExportPath).isDirectory(), true);
});

test('S8 a self-declared approval without a verified signature authorizes nothing', () => {
  const world = setup({ approve: false });
  const error = expectPromotionError('OWNER_APPROVAL_INVALID', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_unsigned_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  assert.match(error.message, /signature|contract/i);
  assert.equal(fs.existsSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md')), false);
});

test('S8 an approval signed by an unpublished key authorizes nothing', () => {
  const world = setup();
  // A second key pair signs the approval, but the anchor does not publish it.
  const foreign = makeKeyPair();
  const body = approvalBody();
  const foreignApproval = signApproval(body, foreign.privateKey, 'owner_key_foreign_0001');
  const ref = writeApproval(world.tree, foreignApproval, 'core/authority/approvals/foreign_decision_0001.json');

  expectPromotionError('OWNER_AUTHORITY_KEY_UNKNOWN', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_foreign_key_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: ref,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 a revoked key authorizes nothing', () => {
  const world = setup({ keyStatus: 'revoked' });
  expectPromotionError('OWNER_AUTHORITY_KEY_REVOKED', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_revoked_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 an authority without a published key refuses every approval', () => {
  const world = setup({ publishKey: false });
  const error = expectPromotionError('OWNER_AUTHORITY_NOT_PUBLISHED', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_no_key_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  assert.match(error.message, /publishes no owner key/);
});

test('S8 the committed canonical owner authority publishes no key and refuses every approval', () => {
  const anchor = JSON.parse(fs.readFileSync(path.join(root, 'core/contracts/owner-authority.json'), 'utf8'));
  assert.equal(anchor.authority_status, 'PENDING_PUBLICATION');
  assert.deepEqual(anchor.keys, []);
});

test('S8 an expired approval authorizes nothing', () => {
  const world = setup({ approval: approvalBody({ approvedAt: '2020-01-01T00:00:00Z' }) });
  expectPromotionError('OWNER_APPROVAL_STALE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_stale_approval_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 an approval for another candidate content authorizes nothing', () => {
  const world = setup({ approval: approvalBody({ candidateDigest: `sha256:${'9'.repeat(64)}` }) });
  expectPromotionError('OWNER_APPROVAL_CANDIDATE_MISMATCH', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_wrong_content_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 an approval for another skill authorizes nothing', () => {
  const world = setup({ approval: approvalBody({ skillId: 'other-skill' }) });
  expectPromotionError('OWNER_APPROVAL_SKILL_MISMATCH', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_wrong_skill_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 an approval outside the canonical decision surface is refused', () => {
  const world = setup();
  // The same (validly signed) approval, but placed outside the decision
  // surface of the canonical tree.
  const escaped = writeApproval(world.tree, signApproval(approvalBody(), world.keyPair.privateKey), '../escaped-approval.json');
  expectPromotionError('OWNER_APPROVAL_PATH_ESCAPE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_escaped_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: escaped,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 a tampered approval body does not verify', () => {
  const world = setup();
  const approval = JSON.parse(fs.readFileSync(path.join(world.tree, world.ownerApprovalRef), 'utf8'));
  approval.decision_ref = 'owner_decision_tampered_0001';
  const ref = writeApproval(world.tree, approval, 'core/authority/approvals/tampered_0001.json');
  expectPromotionError('OWNER_APPROVAL_SIGNATURE_INVALID', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_tampered_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: ref,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 no promotion without the skill frontdoor: BLOCKED or non-ELIGIBLE admissions fail closed', () => {
  const world = setup({ admission: admissionRecord({ implementationDisposition: 'BLOCKED' }) });
  expectPromotionError('FRONTDOOR_ADMISSION_NOT_ELIGIBLE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_blocked_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 eval evidence is bound by content digest; BLOCKED records can never support promotion', () => {
  const blockedRecord = evalRecord({ verdict: 'BLOCKED' });
  blockedRecord.case_families[1].cases_passed = 0;
  blockedRecord.case_families[1].cases_failed = 1;
  blockedRecord.security_gate.security_regressions = 1;
  blockedRecord.security_gate.gate = 'BLOCK';
  delete blockedRecord.comparison;
  blockedRecord.reproducibility.content_digest = computeContentDigest(blockedRecord);
  const world = setup({ evals: [blockedRecord] });
  expectPromotionError('EVAL_EVIDENCE_BLOCKED', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_evblock_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );

  const tampered = setup();
  tampered.evalEntries[0].expected_digest = `sha256:${'0'.repeat(64)}`;
  expectPromotionError('EVAL_EVIDENCE_DIGEST_MISMATCH', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_evtamper_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: tampered.admissionPath,
      evalRecords: tampered.evalEntries,
      ownerApprovalRef: tampered.ownerApprovalRef,
      ownerAuthorityPath: tampered.ownerAuthorityPath,
      canonicalRoot: tampered.tree,
      root
    })
  );
});

test('S8 improvement must be proven: evidence without IMPROVEMENT_PROVEN fails closed', () => {
  const world = setup({ evals: [evalRecord({ verdict: 'IMPROVEMENT_REJECTED' })] });
  expectPromotionError('IMPROVEMENT_NOT_PROVEN', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_noproof_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 adoption is versioned: downgrades and equal versions fail closed', () => {
  const world = setup();
  expectPromotionError('ADOPTION_VERSION_REGRESSION', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_downgrade_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '0.9.0',
      supersededVersion: '1.0.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  expectPromotionError('ADOPTION_VERSION_REGRESSION', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_equal_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '1.0.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 post-adoption readback detects canonical tampering', () => {
  const world = setup();
  const { record } = promoteSkillCandidate({
    adoptionId: 'adopt_s8_tamper_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath: world.admissionPath,
    evalRecords: world.evalEntries,
    ownerApprovalRef: world.ownerApprovalRef,
    ownerAuthorityPath: world.ownerAuthorityPath,
    canonicalRoot: world.tree,
    root
  });
  fs.writeFileSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md'), `${CANDIDATE_CONTENT}\n<!-- tampered -->`);
  const issues = postAdoptionReadback({ record, canonicalRoot: world.tree });
  assert.ok(issues.some((issue) => issue.includes('digests to')));
});

test('S8 a replayed adoption id is refused', () => {
  const world = setup();
  const first = promoteSkillCandidate({
    adoptionId: 'adopt_s8_replay_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath: world.admissionPath,
    evalRecords: world.evalEntries,
    ownerApprovalRef: world.ownerApprovalRef,
    ownerAuthorityPath: world.ownerAuthorityPath,
    canonicalRoot: world.tree,
    root
  });
  assert.deepEqual(first.issues, []);

  // The replayed adoption carries the same adoption id and the same
  // screened content: the ledger refuses it before anything is written.
  expectPromotionError('PROMOTION_REPLAYED', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_replay_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
});

test('S8 the post-adoption readback detects a tampered regenerated export', () => {
  const world = setup();
  const { record } = promoteSkillCandidate({
    adoptionId: 'adopt_s8_export_tamper_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath: world.admissionPath,
    evalRecords: world.evalEntries,
    ownerApprovalRef: world.ownerApprovalRef,
    ownerAuthorityPath: world.ownerAuthorityPath,
    canonicalRoot: world.tree,
    root
  });
  assert.deepEqual(postAdoptionReadback({ record, canonicalRoot: world.tree }), []);

  const exportRef = record.export_regeneration.export_digests[0].ref;
  fs.appendFileSync(path.join(world.tree, exportRef), '<!-- tampered -->');
  const issues = postAdoptionReadback({ record, canonicalRoot: world.tree });
  assert.ok(issues.some((issue) => issue.includes(exportRef)));
});

test('S8 a symlinked export surface is refused and nothing outside the tree is written', () => {
  const world = setup();
  const outside = path.join(world.dir, 'outside-registry.json');
  fs.writeFileSync(outside, 'ORIGINAL\n');
  // The canonical export surface is a symlink to a file OUTSIDE the
  // canonical tree: writing through it would mutate a file the promotion
  // does not own.
  fs.mkdirSync(path.join(world.tree, 'core/contracts'), { recursive: true });
  fs.symlinkSync(outside, path.join(world.tree, 'core/contracts/core-registry.json'));

  expectPromotionError('EXPORT_SURFACE_NOT_A_FILE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_symlink_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  assert.equal(fs.readFileSync(outside, 'utf8'), 'ORIGINAL\n');
  assert.equal(fs.existsSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md')), false);
});

test('S8 a symlinked canonical skill path is refused', () => {
  const world = setup();
  const outside = path.join(world.dir, 'outside-skill.md');
  fs.writeFileSync(outside, 'ORIGINAL\n');
  fs.mkdirSync(path.join(world.tree, 'skills/promoted-skill'), { recursive: true });
  fs.symlinkSync(outside, path.join(world.tree, 'skills/promoted-skill/SKILL.md'));

  expectPromotionError('PROMOTION_CANONICAL_PATH_NOT_A_FILE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_symlink_skill_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  assert.equal(fs.readFileSync(outside, 'utf8'), 'ORIGINAL\n');
});

test('S8 an unwritable adoption ledger rolls the whole promotion back', () => {
  const world = setup();
  // The ledger cannot be written (it points into a directory that does not
  // exist): the applied change cannot be recorded, so the promotion must
  // roll back instead of applying an unrecorded change.
  fs.mkdirSync(path.join(world.tree, 'skills/promoted-skill'), { recursive: true });
  fs.symlinkSync('/nonexistent-maws-ledger-target/ADOPTIONS.jsonl', path.join(world.tree, 'skills/promoted-skill/ADOPTIONS.jsonl'));

  expectPromotionError('PROMOTION_LEDGER_UNWRITABLE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_ledger_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: world.admissionPath,
      evalRecords: world.evalEntries,
      ownerApprovalRef: world.ownerApprovalRef,
      ownerAuthorityPath: world.ownerAuthorityPath,
      canonicalRoot: world.tree,
      root
    })
  );
  assert.equal(fs.existsSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md')), false);
  assert.equal(fs.existsSync(path.join(world.tree, 'core/contracts/core-registry.json')), false);
});

test('S8 the post-adoption readback re-verifies the owner approval artifact', () => {
  const world = setup();
  const { record } = promoteSkillCandidate({
    adoptionId: 'adopt_s8_approval_readback_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath: world.admissionPath,
    evalRecords: world.evalEntries,
    ownerApprovalRef: world.ownerApprovalRef,
    ownerAuthorityPath: world.ownerAuthorityPath,
    canonicalRoot: world.tree,
    root
  });
  assert.deepEqual(postAdoptionReadback({ record, canonicalRoot: world.tree }), []);

  const approvalPath = path.join(world.tree, record.owner_approval.approval_record_ref);
  const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
  approval.decision_ref = 'owner_decision_swapped_0001';
  fs.writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);

  const issues = postAdoptionReadback({ record, canonicalRoot: world.tree });
  assert.ok(issues.some((issue) => issue.includes('owner approval')), issues.join(' | '));
});

test('S8 the CLI refuses a broken canonical target with a structured refusal, never a stack trace', () => {
  const world = setup();
  const notADirectory = path.join(world.dir, 'canonical-root-file');
  fs.writeFileSync(notADirectory, 'not a directory\n');
  const input = {
    adoption_id: 'adopt_s8_cli_broken_0001',
    skill_id: 'promoted-skill',
    adopted_version: '1.0.0',
    superseded_version: '0.9.0',
    candidate_content: CANDIDATE_CONTENT,
    candidate_digest: sha256Prefixed(CANDIDATE_CONTENT),
    admission_path: world.admissionPath,
    eval_records: world.evalEntries,
    owner_approval_ref: world.ownerApprovalRef,
    canonical_root: notADirectory
  };
  const inputPath = path.join(world.dir, 'input-broken.json');
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));

  const result = runCli(['--input', inputPath]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.length > 0);
  // A structured refusal, never an unhandled stack trace.
  assert.match(result.issues[0], /^[A-Z_]+: /);
});

test('S8 the CLI turns an unexpected failure into a structured refusal, never a stack trace', () => {
  const world = setup();
  const input = {
    adoption_id: 'adopt_s8_cli_unexpected_0001',
    skill_id: 'promoted-skill',
    adopted_version: '1.0.0',
    superseded_version: '0.9.0',
    candidate_content: CANDIDATE_CONTENT,
    candidate_digest: sha256Prefixed(CANDIDATE_CONTENT),
    admission_path: world.admissionPath,
    eval_records: world.evalEntries,
    owner_approval_ref: world.ownerApprovalRef,
    // A malformed canonical target: the promotion fails with an unexpected
    // error, and the CLI must still answer with a structured refusal.
    canonical_root: 12345
  };
  const inputPath = path.join(world.dir, 'input-unexpected.json');
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));

  const result = runCli(['--input', inputPath]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.length > 0);
  assert.match(result.issues[0], /^PROMOTION_FAILED: /);
});

test('S8 the CLI pins the evidence age bound: a widened bound in the input is ignored', () => {
  const world = setup({ evals: [evalRecord({ createdAt: '2020-01-01T00:00:00Z' })] });
  const input = {
    adoption_id: 'adopt_s8_cli_age_0001',
    skill_id: 'promoted-skill',
    adopted_version: '1.0.0',
    superseded_version: '0.9.0',
    candidate_content: CANDIDATE_CONTENT,
    candidate_digest: sha256Prefixed(CANDIDATE_CONTENT),
    admission_path: world.admissionPath,
    eval_records: world.evalEntries,
    owner_approval_ref: world.ownerApprovalRef,
    canonical_root: world.tree,
    // The input tries to widen the freshness bound of the behavioral
    // evidence: the CLI pins the bound from the contract.
    max_evidence_age_days: 36500
  };
  const inputPath = path.join(world.dir, 'input-age.json');
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));

  const result = runCli(['--input', inputPath]);
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /EVAL_EVIDENCE_STALE/);
});

test('S8 adoption never grants authority (const false at the schema level)', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'evals/fixtures/maws-vnext/skill-promotion-adoption.contracts.json'), 'utf8'));
  for (const caseEntry of fixture.cases) {
    const issues = validateInstanceAgainstContract(caseEntry.instance, caseEntry.schema, root);
    if (caseEntry.valid) {
      assert.deepEqual(issues, [], caseEntry.case_id);
    } else {
      assert.ok(issues.length > 0, `${caseEntry.case_id} must be schema-invalid`);
    }
  }
});

test('S8 frontdoor and eval helpers bind digests canonically', () => {
  const dir = tempDir();
  const admissionPath = path.join(dir, 'admission.json');
  fs.writeFileSync(admissionPath, JSON.stringify(admissionRecord(), null, 2));
  const { digest } = readAndDigestJson(admissionPath);
  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  const again = readAndDigestJson(admissionPath);
  assert.equal(again.digest, digest);
  const evidence = validateEvalEvidence({ evalRecords: setup().evalEntries, root });
  assert.equal(evidence.improvement_proven, true);
  assert.equal(evidence.behavioral_eval_records[0].verdict, 'IMPROVEMENT_PROVEN');
});

test('S8 the CLI refuses a promotion whose approval is not authorized and returns a structured refusal', () => {
  const world = setup();
  const input = {
    adoption_id: 'adopt_s8_cli_0001',
    skill_id: 'promoted-skill',
    adopted_version: '1.0.0',
    superseded_version: '0.9.0',
    candidate_content: CANDIDATE_CONTENT,
    candidate_digest: sha256Prefixed(CANDIDATE_CONTENT),
    admission_path: world.admissionPath,
    eval_records: world.evalEntries,
    owner_approval_ref: world.ownerApprovalRef,
    canonical_root: world.tree,
    // The input tries to redirect the trust anchor (and to widen the
    // evidence age bound). The CLI must ignore both: the anchor is read
    // from the pinned canonical location of the installation and the age
    // bound is fixed by the contract.
    owner_authority_path: world.ownerAuthorityPath,
    max_evidence_age_days: 36500
  };
  const inputPath = path.join(world.dir, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));

  // The CLI always reads the canonical owner authority of its own
  // installation: the input file cannot point it at another anchor, and
  // the anchor it does read publishes no key, so the approval is refused.
  const result = runCli(['--input', inputPath]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.length > 0);
  assert.match(result.issues[0], /OWNER_AUTHORITY_NOT_PUBLISHED/);
  assert.equal(fs.existsSync(path.join(world.tree, 'skills/promoted-skill/SKILL.md')), false);
});
