// MAWS vNext — S1 Skill Feedback contract tests (MAWS-SII-TARGET-SPEC-001).
// node:test + node:assert/strict, no new dependencies. Fixture truth:
// evals/fixtures/maws-vnext/skill-feedback.contracts.json, validated with the
// same draft-2020-12-subset engine that backs the vNext contract spine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/skill-feedback.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'skill-feedback.contracts.json');

const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMA_PATH), 'utf8'));

function caseById(caseId) {
  const entry = FIXTURE.cases.find((caseEntry) => caseEntry.case_id === caseId);
  assert.ok(entry, `fixture case ${caseId} must exist`);
  return entry;
}

test('fixture covers both directions with unique case ids', () => {
  assert.ok(FIXTURE.cases.length >= 10, 'fixture must carry a meaningful case matrix');
  const ids = FIXTURE.cases.map((caseEntry) => caseEntry.case_id);
  assert.equal(new Set(ids).size, ids.length, 'case ids must be unique');
  assert.ok(FIXTURE.cases.some((caseEntry) => caseEntry.valid), 'fixture must contain positive cases');
  assert.ok(FIXTURE.cases.some((caseEntry) => !caseEntry.valid), 'fixture must contain negative cases');
  for (const caseEntry of FIXTURE.cases) {
    assert.equal(caseEntry.schema, SCHEMA_PATH);
  }
});

test('every fixture case validates exactly as declared', () => {
  for (const caseEntry of FIXTURE.cases) {
    const issues = validateInstanceAgainstContract(caseEntry.instance, SCHEMA_PATH, ROOT);
    if (caseEntry.valid) {
      assert.deepEqual(issues, [], `${caseEntry.case_id} must pass but failed: ${issues.join('; ')}`);
    } else {
      assert.ok(issues.length > 0, `${caseEntry.case_id} must fail but passed`);
    }
  }
});

test('valid records carry unique feedback ids', () => {
  const feedbackIds = FIXTURE.cases
    .filter((caseEntry) => caseEntry.valid)
    .map((caseEntry) => caseEntry.instance.feedback_id);
  assert.equal(new Set(feedbackIds).size, feedbackIds.length);
});

test('model self-report is deterministically excluded as a source category', () => {
  const categories = SCHEMA.properties.source.properties.category.enum;
  assert.ok(!categories.includes('model_self_report'), 'spec 8.2: model self-report is not independent evidence');
  assert.ok(!categories.includes('model_self_attestation'));
  for (const category of [
    'operator_correction',
    'failed_eval',
    'regression',
    'run_evidence',
    'verification_failure',
    'routing_error',
    'recurring_manual_rework',
    'positive_reference_example'
  ]) {
    assert.ok(categories.includes(category), `spec 8.2 category missing: ${category}`);
  }
  assert.ok(
    validateInstanceAgainstContract(caseById('skill-feedback-invalid-model-self-report-source').instance, SCHEMA_PATH, ROOT).length > 0
  );
});

test('unattributed records always force owner review (fail-closed if/then)', () => {
  const rejected = caseById('skill-feedback-invalid-unknown-root-cause-without-owner-review');
  assert.ok(validateInstanceAgainstContract(rejected.instance, SCHEMA_PATH, ROOT).length > 0);
  const accepted = caseById('skill-feedback-valid-positive-reference-forced-owner-review');
  assert.equal(accepted.instance.error_class, 'UNKNOWN_ROOT_CAUSE');
  assert.equal(accepted.instance.requires_owner_review, true);
  assert.deepEqual(validateInstanceAgainstContract(accepted.instance, SCHEMA_PATH, ROOT), []);
});

test('CREATE_SKILL proposals always force owner review (spec 8.4 gate)', () => {
  const rejected = caseById('skill-feedback-invalid-create-skill-without-owner-review');
  assert.equal(rejected.instance.proposed_disposition, 'CREATE_SKILL');
  assert.equal(rejected.instance.requires_owner_review, false);
  assert.ok(validateInstanceAgainstContract(rejected.instance, SCHEMA_PATH, ROOT).length > 0);
});

test('promotion is never a feedback decision (closed disposition vocabulary)', () => {
  const rejected = caseById('skill-feedback-invalid-unknown-disposition-value');
  assert.equal(rejected.instance.proposed_disposition, 'PROMOTE');
  assert.ok(validateInstanceAgainstContract(rejected.instance, SCHEMA_PATH, ROOT).length > 0);
  const dispositions = SCHEMA.properties.proposed_disposition.enum;
  assert.ok(!dispositions.includes('PROMOTE'));
  assert.ok(!dispositions.includes('APPLY'));
});

test('schema keeps the closed-record posture (no open properties)', () => {
  assert.equal(SCHEMA.additionalProperties, false);
  assert.equal(SCHEMA.properties.source.additionalProperties, false);
  assert.equal(SCHEMA.properties.subject.additionalProperties, false);
  assert.equal(SCHEMA.properties.provenance.additionalProperties, false);
  assert.deepEqual(SCHEMA.properties.evidence_refs.minItems, 1);
});
