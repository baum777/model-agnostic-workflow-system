// MAWS vNext — Skill Frontdoor contract/runtime tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import {
  assertSkillImplementationFrontdoor,
  deriveSkillFrontdoorDisposition
} from '../../runtime/skills/frontdoor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'skill-frontdoor.contracts.json'),
    'utf8'
  )
);
const BASE = structuredClone(
  FIXTURE.cases.find((entry) => entry.case_id === 'frontdoor-valid-clean').instance
);
const NOW = '2026-09-26T18:00:00.000Z';

test('clean dual-analyzer evidence is eligible without granting authority', () => {
  const issues = validateInstanceAgainstContract(
    BASE,
    'core/contracts/skill-frontdoor-admission.schema.json',
    ROOT
  );
  assert.deepEqual(issues, []);

  const derived = deriveSkillFrontdoorDisposition(BASE, { now: NOW });
  assert.equal(derived.analysis_disposition, 'CLEAN');
  assert.equal(derived.implementation_disposition, 'ELIGIBLE');
  assert.equal(derived.authority_granted, false);

  const result = assertSkillImplementationFrontdoor(BASE, { root: ROOT, now: NOW });
  assert.equal(result.frontdoor_passed, true);
  assert.equal(result.authority_granted, false);
  assert.equal(result.exception_used, false);
});

test('high SkillSpector severity blocks even if a caller claims CLEAN', () => {
  const record = structuredClone(BASE);
  record.evidence.skillspector.severity = 'high';
  record.evidence.skillspector.severity_counts.high = 1;

  const derived = deriveSkillFrontdoorDisposition(record, { now: NOW });
  assert.equal(derived.analysis_disposition, 'BLOCKED');
  assert.equal(derived.implementation_disposition, 'BLOCKED');
  assert.equal(derived.blockers.includes('SKILLSPECTOR_HIGH_FINDINGS'), true);

  assert.throws(
    () => assertSkillImplementationFrontdoor(record, { root: ROOT, now: NOW }),
    (error) =>
      error.code === 'SKILL_FRONTDOOR_CONTRACT_INVALID' ||
      error.code === 'SKILL_FRONTDOOR_DISPOSITION_MISMATCH'
  );
});

test('incomplete analyzer evidence dominates known risk and cannot be owner-exceptioned', () => {
  const record = structuredClone(BASE);
  record.evidence.skillspector.status = 'BLOCKED';
  record.evidence.skillspector.exit_code = 1;
  record.evidence.skillspector.severity = 'high';
  record.evidence.skillspector.severity_counts.high = 1;
  record.evidence.skillevaluator_tier1.status = 'INCOMPLETE';
  record.evidence.skillevaluator_tier1.overall_status = 'incomplete';
  record.evidence.skillevaluator_tier1.overall_passed = false;
  record.owner_exception = {
    decision_id: 'owner_exc_001',
    approved_by: 'owner',
    rationale: 'temporary exception',
    accepted_risks: ['known security finding'],
    scope_limit: 'single candidate only',
    expires_at: '2026-09-27T18:00:00.000Z'
  };

  const derived = deriveSkillFrontdoorDisposition(record, { now: NOW });
  assert.equal(derived.analysis_disposition, 'INCOMPLETE');
  assert.equal(derived.implementation_disposition, 'BLOCKED');
  assert.equal(derived.authority_granted, false);
});

test('known fully-analyzed risk can use a bounded owner exception without becoming clean', () => {
  const record = structuredClone(BASE);
  record.evidence.skillspector.status = 'BLOCKED';
  record.evidence.skillspector.exit_code = 1;
  record.evidence.skillspector.severity = 'high';
  record.evidence.skillspector.severity_counts.high = 1;
  record.analysis_disposition = 'BLOCKED';
  record.implementation_disposition = 'OWNER_EXCEPTION';
  record.blockers = [
    'SKILLSPECTOR_BLOCKED',
    'SKILLSPECTOR_SEVERITY_HIGH',
    'SKILLSPECTOR_HIGH_FINDINGS'
  ];
  record.owner_exception = {
    decision_id: 'owner_exc_002',
    approved_by: 'owner',
    rationale: 'bounded known-risk exception',
    accepted_risks: ['known high-severity scanner finding'],
    scope_limit: 'single local review branch; no activation',
    expires_at: '2026-09-27T18:00:00.000Z'
  };

  const derived = deriveSkillFrontdoorDisposition(record, { now: NOW });
  assert.equal(derived.analysis_disposition, 'BLOCKED');
  assert.equal(derived.implementation_disposition, 'OWNER_EXCEPTION');
  assert.equal(derived.authority_granted, false);

  const result = assertSkillImplementationFrontdoor(record, { root: ROOT, now: NOW });
  assert.equal(result.frontdoor_passed, true);
  assert.equal(result.exception_used, true);
  assert.equal(result.authority_granted, false);
});

test('expired owner exception is fail-closed', () => {
  const record = structuredClone(BASE);
  record.evidence.skillspector.status = 'BLOCKED';
  record.evidence.skillspector.exit_code = 1;
  record.evidence.skillspector.severity = 'high';
  record.evidence.skillspector.severity_counts.high = 1;
  record.owner_exception = {
    decision_id: 'owner_exc_expired',
    approved_by: 'owner',
    rationale: 'expired exception',
    accepted_risks: ['known risk'],
    scope_limit: 'single review',
    expires_at: '2026-09-26T17:00:00.000Z'
  };

  const derived = deriveSkillFrontdoorDisposition(record, { now: NOW });
  assert.equal(derived.analysis_disposition, 'BLOCKED');
  assert.equal(derived.implementation_disposition, 'BLOCKED');
});
