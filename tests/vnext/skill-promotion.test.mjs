// S8 — governance promotion tests (spec MAWS-SII-TARGET-SPEC-001 v0.2.0,
// PROPOSED). The promotion chain binds frontdoor admission (bound to the
// exact candidate identity and content) + S5 behavioral evidence (bound by
// content digest, subject, corpus and age) + canonical owner approval (bound
// to the approved candidate digest) + versioned adoption (the superseded
// version READ FROM THE CANONICAL TREE) + an append-only adoption ledger +
// the post-adoption readback. Adoption changes canonical skill content and
// NOTHING else: authority_granted stays false by construction.
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

function candidateContentWithVersion(version) {
  return CANDIDATE_CONTENT.replace('version: 1.0.0', `version: ${version}`);
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
    admission_id: 'sfa_s8_promotion_0001',
    candidate: {
      skill_id: skillId,
      target: 'staging/promoted-skill',
      target_kind: 'local-directory',
      source_revision: sourceRevision
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
    assert.ok(error instanceof PromotionError, `expected PromotionError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected PromotionError ${code}`);
}

function ownerApproval({ candidateDigest = CANDIDATE_DIGEST, decisionRef = 'owner_decision_s8_0001', approvedAt = '2026-10-20T00:00:00Z' } = {}) {
  return { approver: 'canonical_owner', decision_ref: decisionRef, approved_at: approvedAt, candidate_digest: candidateDigest };
}

const OWNER_APPROVAL = ownerApproval();

function promote(overrides = {}) {
  const context = overrides.context ?? setup();
  return {
    context,
    result: promoteSkillCandidate({
      adoptionId: 'adopt_s8_chain_0001',
      skillId: 'promoted-skill',
      adoptedVersion: '1.0.0',
      supersededVersion: '0.9.0',
      candidateContent: CANDIDATE_CONTENT,
      candidateDigest: CANDIDATE_DIGEST,
      admissionPath: context.admissionPath,
      evalRecords: context.evalEntries,
      ownerApproval: OWNER_APPROVAL,
      canonicalRoot: context.canonicalRoot,
      root,
      ...overrides.input
    })
  };
}

test('S8 the full promotion chain produces a valid adoption record with a matching readback', () => {
  const { context, result } = promote();
  const { record, issues } = result;
  assert.deepEqual(issues, []);
  const schemaIssues = validateInstanceAgainstContract(record, 'core/contracts/skill-promotion-adoption.schema.json', root);
  assert.deepEqual(schemaIssues, []);
  assert.equal(record.authority_granted, false);
  assert.equal(record.frontdoor_admission.implementation_disposition, 'ELIGIBLE');
  assert.equal(record.eval_evidence.improvement_proven, true);
  assert.equal(record.candidate.screened_digest, CANDIDATE_DIGEST);
  assert.equal(record.frontdoor_admission.screened_digest, CANDIDATE_DIGEST);
  assert.equal(record.owner_approval.candidate_digest, CANDIDATE_DIGEST);
  assert.deepEqual(postAdoptionReadback({ record, canonicalRoot: context.canonicalRoot }), []);
  // The adopted file really exists in the caller-provided canonical root.
  assert.equal(fs.readFileSync(path.join(context.canonicalRoot, 'skills/promoted-skill/SKILL.md'), 'utf8'), CANDIDATE_CONTENT);
  // The applied change is recorded in the append-only adoption ledger.
  const ledger = readAdoptionLedger({ ledgerPath: path.join(context.canonicalRoot, 'skills/promoted-skill/ADOPTIONS.jsonl') });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].adoption_id, 'adopt_s8_chain_0001');
  assert.equal(ledger[0].adopted_version, '1.0.0');
});

test('S8 the export regeneration is recorded truthfully, never as performed when it was not', () => {
  const { result } = promote();
  assert.equal(result.record.export_regeneration.performed, false);
  assert.equal(result.record.export_regeneration.regenerated_at, null);
  assert.ok(result.record.export_regeneration.not_performed_reason.length > 0);
  assert.ok(result.record.export_regeneration.export_refs.includes('contracts/core-registry.json'));
});

test('S8 no promotion without the skill frontdoor: BLOCKED or non-ELIGIBLE admissions fail closed', () => {
  expectPromotionError('FRONTDOOR_ADMISSION_NOT_ELIGIBLE', () =>
    promote({ context: setup({ admission: admissionRecord({ implementationDisposition: 'BLOCKED' }) }) }).result
  );
});

test('S8 the promotion is bound to the candidate the frontdoor screened', () => {
  // An admission for another skill never authorizes this promotion.
  expectPromotionError('PROMOTION_CANDIDATE_IDENTITY_MISMATCH', () =>
    promote({ context: setup({ admission: admissionRecord({ skillId: 'TOTALLY-DIFFERENT-SKILL' }) }) }).result
  );

  // An admission that screened other content never authorizes this
  // promotion either: an eval PASS for content A cannot adopt content B.
  expectPromotionError('PROMOTION_CANDIDATE_CONTENT_MISMATCH', () =>
    promote({ context: setup({ admission: admissionRecord({ sourceRevision: `sha256:${'d'.repeat(64)}` }) }) }).result
  );
});

test('S8 the eval evidence must measure the promoted skill', () => {
  const context = setup({ evals: [evalRecord({ subjectRef: 'COMPLETELY-UNRELATED-SKILL' })] });
  expectPromotionError('EVAL_EVIDENCE_SUBJECT_MISMATCH', () => promote({ context }).result);
});

test('S8 the eval evidence is bound by content digest; BLOCKED records can never support promotion', () => {
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
  const context = setup({ evals: [blockedRecord] });
  expectPromotionError('EVAL_EVIDENCE_BLOCKED', () => promote({ context }).result);

  const tampered = setup();
  tampered.evalEntries[0].expected_digest = `sha256:${'0'.repeat(64)}`;
  expectPromotionError('EVAL_EVIDENCE_DIGEST_MISMATCH', () => promote({ context: tampered }).result);
});

test('S8 the eval evidence must be fresh and come from one corpus', () => {
  const stale = setup({ evals: [evalRecord({ createdAt: '2020-01-01T00:00:00Z' })] });
  expectPromotionError('EVAL_EVIDENCE_STALE', () => promote({ context: stale }).result);

  const twoCorpora = setup({
    evals: [evalRecord({ evalId: 'bev_a' }), evalRecord({ evalId: 'bev_b', corpusDigest: `sha256:${'e'.repeat(64)}` })]
  });
  expectPromotionError('EVAL_EVIDENCE_CORPUS_MISMATCH', () => promote({ context: twoCorpora }).result);
});

test('S8 improvement must be proven: evidence without IMPROVEMENT_PROVEN fails closed', () => {
  const context = setup({ evals: [evalRecord({ verdict: 'IMPROVEMENT_REJECTED' })] });
  expectPromotionError('IMPROVEMENT_NOT_PROVEN', () => promote({ context }).result);
});

test('S8 owner approval is a required gate; approval is never implied', () => {
  expectPromotionError('OWNER_APPROVAL_MISSING', () =>
    promote({ input: { ownerApproval: null } }).result
  );
  expectPromotionError('OWNER_APPROVAL_MISSING', () =>
    promote({ input: { ownerApproval: { approver: 'runtime_loop', decision_ref: 'self', approved_at: '2026-10-20T00:00:00Z' } } }).result
  );
});

test('S8 the owner approval must bind the candidate it approves', () => {
  expectPromotionError('OWNER_APPROVAL_CANDIDATE_MISMATCH', () =>
    promote({ input: { ownerApproval: ownerApproval({ candidateDigest: `sha256:${'9'.repeat(64)}` }) } }).result
  );
});

test('S8 adoption is versioned: the superseded version is read from the canonical tree', () => {
  // A caller-declared superseded version never overrules the canonical file:
  // the canonical skill declares 9.9.9, so adopting 1.0.0 is a downgrade.
  const context = setup();
  fs.mkdirSync(path.join(context.canonicalRoot, 'skills/promoted-skill'), { recursive: true });
  fs.writeFileSync(
    path.join(context.canonicalRoot, 'skills/promoted-skill/SKILL.md'),
    candidateContentWithVersion('9.9.9')
  );
  expectPromotionError('ADOPTION_VERSION_REGRESSION', () => promote({ context }).result);
});

test('S8 adoption is versioned: downgrades and equal versions fail closed', () => {
  expectPromotionError('ADOPTION_VERSION_REGRESSION', () =>
    promote({ input: { adoptedVersion: '0.9.0' } }).result
  );
  expectPromotionError('ADOPTION_VERSION_REGRESSION', () =>
    promote({ input: { adoptedVersion: '1.0.0', supersededVersion: '1.0.0' } }).result
  );
});

test('S8 the adopted version must be the version the artifact itself declares', () => {
  const content = candidateContentWithVersion('2.0.0');
  const digest = sha256Prefixed(content);
  expectPromotionError('ADOPTION_VERSION_ARTIFACT_MISMATCH', () =>
    promote({
      context: setup({ admission: admissionRecord({ sourceRevision: digest }) }),
      input: { candidateContent: content, candidateDigest: digest, ownerApproval: ownerApproval({ candidateDigest: digest }) }
    }).result
  );
});

test('S8 a replayed adoption is refused: the ledger makes the applied change reconstructable', () => {
  const context = setup();
  promote({ context });
  // The same adoption id again is a replay.
  expectPromotionError('PROMOTION_REPLAYED', () => promote({ context }).result);
  // Another adoption id that does not move the skill past its last adopted
  // version is refused too.
  expectPromotionError('PROMOTION_ALREADY_ADOPTED', () =>
    promote({ context, input: { adoptionId: 'adopt_s8_chain_0002' } }).result
  );
});

test('S8 the readback failure path is bound: a content that does not match the bound digest fails closed', () => {
  // The admission and the approval both bind the declared digest, but the
  // written bytes do not match it: the post-adoption readback must catch it
  // and fail closed.
  const wrongDigest = `sha256:${'7'.repeat(64)}`;
  const context = setup({ admission: admissionRecord({ sourceRevision: wrongDigest }) });
  expectPromotionError('READBACK_DIGEST_MISMATCH', () =>
    promote({ context, input: { candidateDigest: wrongDigest, ownerApproval: ownerApproval({ candidateDigest: wrongDigest }) } }).result
  );
});

test('S8 a skill id may never escape the canonical root', () => {
  expectPromotionError('PROMOTION_SKILL_ID_INVALID', () =>
    promote({ input: { skillId: '../../ESCAPED' } }).result
  );
});

test('S8 a contract-invalid adoption leaves no mutation behind', () => {
  const context = setup();
  const { result } = promote({ context, input: { adoptionId: 'NOT-VALID-ID' } });
  assert.ok(result.issues.length > 0);
  assert.equal(fs.existsSync(path.join(context.canonicalRoot, 'skills/promoted-skill/SKILL.md')), false);
});

test('S8 the CLI reports a gate violation as a structured refusal, not as a crash', () => {
  const context = setup({ admission: admissionRecord({ skillId: 'TOTALLY-DIFFERENT-SKILL' }) });
  const inputPath = path.join(context.dir, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify({
    adoptionId: 'adopt_s8_cli_0001',
    skillId: 'promoted-skill',
    adoptedVersion: '1.0.0',
    supersededVersion: '0.9.0',
    candidateContent: CANDIDATE_CONTENT,
    candidateDigest: CANDIDATE_DIGEST,
    admissionPath: context.admissionPath,
    evalRecords: context.evalEntries,
    ownerApproval: OWNER_APPROVAL,
    canonical_root: context.canonicalRoot
  }));
  const result = runCli(['--input', inputPath]);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('PROMOTION_CANDIDATE_IDENTITY_MISMATCH')), JSON.stringify(result.issues));
});

test('S8 post-adoption readback detects canonical tampering', () => {
  const { context, result } = promote();
  fs.writeFileSync(path.join(context.canonicalRoot, 'skills/promoted-skill/SKILL.md'), `${CANDIDATE_CONTENT}\n<!-- tampered -->`);
  const issues = postAdoptionReadback({ record: result.record, canonicalRoot: context.canonicalRoot });
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
      // A negative case must be rejected BY ITS OWN RULE: a schema loosening
      // that turns the case into a no-op fails here.
      assert.ok(
        issues.some((issue) => issue.includes(caseEntry.expected_error)),
        `${caseEntry.case_id} must be rejected by "${caseEntry.expected_error}", got: ${issues.join('; ')}`
      );
    }
  }
});

test('S8 the semantic rules refuse a record that contradicts its own evidence', () => {
  const { result } = promote();
  const drifted = structuredClone(result.record);
  drifted.eval_evidence.improvement_proven = true;
  drifted.eval_evidence.behavioral_eval_records[0].verdict = 'BASELINE_RECORDED';
  assert.ok(semanticPromotionIssues(drifted).some((issue) => issue.includes('improvement_proven')));

  const unbound = structuredClone(result.record);
  unbound.candidate.screened_digest = `sha256:${'8'.repeat(64)}`;
  assert.ok(semanticPromotionIssues(unbound).some((issue) => issue.includes('screened content digest')));
});

test('S8 frontdoor and eval helpers bind digests canonically', () => {
  const dir = tempDir();
  const admissionPath = path.join(dir, 'admission.json');
  fs.writeFileSync(admissionPath, JSON.stringify(admissionRecord(), null, 2));
  const { digest } = readAndDigestJson(admissionPath);
  assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  const again = readAndDigestJson(admissionPath);
  assert.equal(again.digest, digest);
  const evidence = validateEvalEvidence({ evalRecords: setup().evalEntries, root, skillId: 'promoted-skill' });
  assert.equal(evidence.improvement_proven, true);
  assert.equal(evidence.behavioral_eval_records[0].verdict, 'IMPROVEMENT_PROVEN');
  assert.equal(evidence.corpus_digest, `sha256:${'c'.repeat(64)}`);
  assert.equal(readFrontmatterVersion(CANDIDATE_CONTENT), '1.0.0');
});
