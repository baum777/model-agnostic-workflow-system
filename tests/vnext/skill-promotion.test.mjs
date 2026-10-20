// S8 — governance promotion tests (spec MAWS-SII-TARGET-SPEC-001 v0.2.0,
// PROPOSED). The promotion chain binds frontdoor admission + S5 behavioral
// evidence + canonical owner approval + versioned adoption + export
// regeneration + post-adoption readback. Adoption changes canonical skill
// content and NOTHING else: authority_granted stays false by construction.
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
  PromotionError
} from '../../scripts/tools/promote-skill-candidate.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { canonicalJson } from '../../runtime/vnext/util.mjs';
import { computeContentDigest } from '../../scripts/tools/run-skill-effectiveness-evals.mjs';

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
---

# Promoted Skill

Deterministic fixture body for the promotion chain test.
`;

function evalRecord({ verdict = 'IMPROVEMENT_PROVEN', isolated = true, evalId = 'bev_s8_candidate_0001', variant = 'CANDIDATE' } = {}) {
  const record = {
    schema_version: '1.0.0',
    eval_id: evalId,
    created_at: '2026-10-20T00:00:00Z',
    variant,
    subject: { kind: 'skill', ref: 'promoted-skill' },
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
      corpus_digest: `sha256:${'c'.repeat(64)}`,
      runner: 'run-skill-effectiveness-evals.mjs'
    },
    evidence_refs: ['evals/skill-effectiveness/corpus.json']
  };
  return { ...record, reproducibility: { ...record.reproducibility, content_digest: computeContentDigest(record) } };
}

function admissionRecord({ implementationDisposition = 'ELIGIBLE' } = {}) {
  return {
    schema_version: '1.0.0',
    admission_id: 'sfa_s8_promotion_0001',
    candidate: {
      skill_id: 'promoted-skill',
      target: 'staging/promoted-skill',
      target_kind: 'local-directory',
      source_revision: `sha256:${'d'.repeat(64)}`
    },
    requested_action: 'implement',
    evidence: {
      skillspector: {
        analyzer: 'NVIDIA/SkillSpector',
        version: '2.12.0',
        scan_mode: 'static-no-llm',
        exit_code: 0,
        report_path: 'sandbox/runs/20261020T000000Z/skillspector-report.json',
        status: 'PASS',
        severity: 'low',
        risk_score: 10,
        severity_counts: { critical: 0, high: 0, medium: 0, low: 1 }
      },
      skillevaluator_tier1: {
        analyzer: 'NVIDIA/SkillEvaluator',
        version: '0.3.0',
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

function setup({ admission = admissionRecord(), evals } = {}) {
  const dir = tempDir();
  const admissionPath = path.join(dir, 'admission.json');
  fs.writeFileSync(admissionPath, JSON.stringify(admission, null, 2));
  const evalEntries = (evals ?? [evalRecord()]).map((record, index) => ({
    record_ref: `evals/behavioral/${index}.json`,
    record,
    expected_digest: computeContentDigest(record)
  }));

  const canonicalRoot = path.join(dir, 'canonical');
  return { dir, admissionPath, evalEntries, canonicalRoot };
}

function expectPromotionError(code, fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof PromotionError, `expected PromotionError, got ${error?.constructor?.name}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected PromotionError ${code}`);
}

const OWNER_APPROVAL = { approver: 'canonical_owner', decision_ref: 'owner_decision_s8_0001', approved_at: '2026-10-20T00:00:00Z' };

test('S8 the full promotion chain produces a valid adoption record with a matching readback', () => {
  const { admissionPath, evalEntries, canonicalRoot } = setup();
  const candidateDigest = sha256Prefixed(CANDIDATE_CONTENT);
  const { record, issues } = promoteSkillCandidate({
    adoptionId: 'adopt_s8_chain_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest,
    admissionPath,
    evalRecords: evalEntries,
    ownerApproval: OWNER_APPROVAL,
    canonicalRoot,
    root
  });
  assert.deepEqual(issues, []);
  const schemaIssues = validateInstanceAgainstContract(record, 'core/contracts/skill-promotion-adoption.schema.json', root);
  assert.deepEqual(schemaIssues, []);
  assert.equal(record.authority_granted, false);
  assert.equal(record.frontdoor_admission.implementation_disposition, 'ELIGIBLE');
  assert.equal(record.eval_evidence.improvement_proven, true);
  assert.deepEqual(postAdoptionReadback({ record, canonicalRoot }), []);
  // The adopted file really exists in the caller-provided canonical root.
  assert.equal(fs.readFileSync(path.join(canonicalRoot, 'skills/promoted-skill/SKILL.md'), 'utf8'), CANDIDATE_CONTENT);
});

test('S8 no promotion without the skill frontdoor: BLOCKED or non-ELIGIBLE admissions fail closed', () => {
  const { admissionPath, evalEntries, canonicalRoot } = setup({ admission: admissionRecord({ implementationDisposition: 'BLOCKED' }) });
  expectPromotionError('FRONTDOOR_ADMISSION_NOT_ELIGIBLE', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_blocked_0001', skillId: 'promoted-skill',
      adoptedVersion: '1.0.0', supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath, evalRecords: evalEntries, ownerApproval: OWNER_APPROVAL,
      canonicalRoot, root
    })
  );
});

test('S8 eval evidence is bound by content digest; BLOCKED records can never support promotion', () => {
  // A BLOCKED verdict is only schema/semantic-valid when it is explained:
  // force a security regression (R1 forces BLOCKED, R5 requires an
  // explanation) and re-seal.
  const blockedRecord = evalRecord({ verdict: 'BLOCKED' });
  blockedRecord.case_families[1].cases_passed = 0;
  blockedRecord.case_families[1].cases_failed = 1;
  blockedRecord.security_gate.security_regressions = 1;
  blockedRecord.security_gate.gate = 'BLOCK';
  // A BLOCKED record never carries a comparison (schema: comparison is
  // exclusive to IMPROVEMENT_PROVEN / IMPROVEMENT_REJECTED verdicts).
  delete blockedRecord.comparison;
  blockedRecord.reproducibility.content_digest = computeContentDigest(blockedRecord);
  const { admissionPath, evalEntries, canonicalRoot } = setup({
    evals: [blockedRecord]
  });
  expectPromotionError('EVAL_EVIDENCE_BLOCKED', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_evblock_0001', skillId: 'promoted-skill',
      adoptedVersion: '1.0.0', supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath, evalRecords: evalEntries, ownerApproval: OWNER_APPROVAL,
      canonicalRoot, root
    })
  );

  const tampered = setup();
  tampered.evalEntries[0].expected_digest = `sha256:${'0'.repeat(64)}`;
  expectPromotionError('EVAL_EVIDENCE_DIGEST_MISMATCH', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_evtamper_0001', skillId: 'promoted-skill',
      adoptedVersion: '1.0.0', supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath: tampered.admissionPath, evalRecords: tampered.evalEntries, ownerApproval: OWNER_APPROVAL,
      canonicalRoot: tampered.canonicalRoot, root
    })
  );
});

test('S8 improvement must be proven: evidence without IMPROVEMENT_PROVEN fails closed', () => {
  const { admissionPath, evalEntries, canonicalRoot } = setup({
    evals: [evalRecord({ verdict: 'IMPROVEMENT_REJECTED' })]
  });
  expectPromotionError('IMPROVEMENT_NOT_PROVEN', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_noproof_0001', skillId: 'promoted-skill',
      adoptedVersion: '1.0.0', supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath, evalRecords: evalEntries, ownerApproval: OWNER_APPROVAL,
      canonicalRoot, root
    })
  );
});

test('S8 owner approval is a required gate; approval is never implied', () => {
  const { admissionPath, evalEntries, canonicalRoot } = setup();
  expectPromotionError('OWNER_APPROVAL_MISSING', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_noowner_0001', skillId: 'promoted-skill',
      adoptedVersion: '1.0.0', supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath, evalRecords: evalEntries, ownerApproval: null,
      canonicalRoot, root
    })
  );
  expectPromotionError('OWNER_APPROVAL_MISSING', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_badowner_0001', skillId: 'promoted-skill',
      adoptedVersion: '1.0.0', supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath, evalRecords: evalEntries,
      ownerApproval: { approver: 'runtime_loop', decision_ref: 'self', approved_at: '2026-10-20T00:00:00Z' },
      canonicalRoot, root
    })
  );
});

test('S8 adoption is versioned: downgrades and equal versions fail closed', () => {
  const { admissionPath, evalEntries, canonicalRoot } = setup();
  expectPromotionError('ADOPTION_VERSION_REGRESSION', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_downgrade_0001', skillId: 'promoted-skill',
      adoptedVersion: '0.9.0', supersededVersion: '1.0.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath, evalRecords: evalEntries, ownerApproval: OWNER_APPROVAL,
      canonicalRoot, root
    })
  );
  expectPromotionError('ADOPTION_VERSION_REGRESSION', () =>
    promoteSkillCandidate({
      adoptionId: 'adopt_s8_equal_0001', skillId: 'promoted-skill',
      adoptedVersion: '1.0.0', supersededVersion: '1.0.0',
      candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
      admissionPath, evalRecords: evalEntries, ownerApproval: OWNER_APPROVAL,
      canonicalRoot, root
    })
  );
});

test('S8 post-adoption readback detects canonical tampering', () => {
  const { admissionPath, evalEntries, canonicalRoot } = setup();
  const { record } = promoteSkillCandidate({
    adoptionId: 'adopt_s8_tamper_0001', skillId: 'promoted-skill',
    adoptedVersion: '1.0.0', supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT, candidateDigest: sha256Prefixed(CANDIDATE_CONTENT),
    admissionPath, evalRecords: evalEntries, ownerApproval: OWNER_APPROVAL,
    canonicalRoot, root
  });
  fs.writeFileSync(path.join(canonicalRoot, 'skills/promoted-skill/SKILL.md'), `${CANDIDATE_CONTENT}\n<!-- tampered -->`);
  const issues = postAdoptionReadback({ record, canonicalRoot });
  assert.ok(issues.some((issue) => issue.includes('digests to')));
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
