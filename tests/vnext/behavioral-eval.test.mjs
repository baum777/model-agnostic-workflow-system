// MAWS vNext — S5 behavioral eval contract tests (MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S5). node:test + node:assert/strict, no new dependencies.
// Proves: the fixture labels hold, the fail-closed semantic invariants (R1-R5)
// bite on exactly their violation, and record sealing is deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { semanticEvalIssues, validateBehavioralEvalRecord } from '../../scripts/tools/validate-behavioral-eval.mjs';
import { finalizeRecord } from '../../scripts/tools/run-skill-effectiveness-evals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'behavioral-eval.contracts.json');

function fixtureCase(caseId) {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const entry = fixture.cases.find((candidate) => candidate.case_id === caseId);
  assert.ok(entry, `fixture case ${caseId} missing`);
  return entry;
}

test('fixture: every labeled positive case validates clean', () => {
  for (const entry of [fixtureCase('bev_pos_baseline_recorded'), fixtureCase('bev_pos_candidate_proven')]) {
    const issues = validateBehavioralEvalRecord(entry.instance, ROOT);
    assert.deepEqual(issues, [], `positive case ${entry.case_id} raised: ${issues.join('; ')}`);
  }
});

test('fixture: every labeled negative case fails for exactly its invariant', () => {
  const negatives = {
    bev_neg_not_isolated: 'uncontained_process',
    bev_neg_candidate_without_baseline_ref: 'verdict',
    bev_neg_baseline_with_comparison: 'NOT match',
    bev_neg_bad_content_digest: 'pattern',
    bev_neg_uncontained_proven: 'verdict'
  };
  for (const [caseId, expectedSignal] of Object.entries(negatives)) {
    const issues = validateBehavioralEvalRecord(fixtureCase(caseId).instance, ROOT);
    assert.ok(issues.length > 0, `negative case ${caseId} unexpectedly validated`);
    assert.ok(
      issues.some((issue) => issue.includes(expectedSignal)),
      `negative case ${caseId} failed for the wrong reason: ${issues.join('; ')}`
    );
  }
});

function minimalCandidate(overrides = {}) {
  const base = fixtureCase('bev_pos_candidate_proven').instance;
  return structuredCloneWithMerge(base, overrides);
}

function structuredCloneWithMerge(base, overrides) {
  const clone = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete clone[key];
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

test('R1: any security regression forces BLOCKED verdict and gate, regardless of deltas', () => {
  const withRegression = minimalCandidate({
    security_gate: { security_cases_total: 1, security_regressions: 1, gate: 'BLOCK' },
    comparison: { baseline_eval_id: 'bev_fixture_baseline', routing_accuracy_delta: 0.5, output_assertion_pass_delta: 0.5, security_regressions: 1 }
  });
  let issues = semanticEvalIssues(withRegression);
  assert.ok(issues.some((issue) => issue.startsWith('R1')), 'R1 must reject non-BLOCKED verdict with regressions');

  withRegression.verdict = 'BLOCKED';
  issues = semanticEvalIssues(withRegression);
  assert.deepEqual(issues, [], 'BLOCKED verdict with a regression must be clean');
});

test('R3: proven verdict requires every blocking family fully passed', () => {
  const withBlockingFailure = minimalCandidate({
    case_families: [
      { family: 'positive', blocking: true, corpus_digest: 'sha256:' + 'a'.repeat(64), cases_total: 3, cases_passed: 2, cases_failed: 1 }
    ]
  });
  const issues = semanticEvalIssues(withBlockingFailure);
  assert.ok(issues.some((issue) => issue.includes('R3')), 'R3 must reject proven with failed blocking family');
});

test('R4: family passed+failed must equal total', () => {
  const mismatched = minimalCandidate();
  mismatched.case_families[0].cases_passed = 2;
  const issues = semanticEvalIssues(mismatched);
  assert.ok(issues.some((issue) => issue.startsWith('R4')), 'R4 must catch count mismatch');
});

test('R5: BLOCKED without any failure signal is unexplained', () => {
  const unexplained = minimalCandidate({ verdict: 'BLOCKED' });
  const issues = semanticEvalIssues(unexplained);
  assert.ok(issues.some((issue) => issue.startsWith('R5')), 'R5 must reject unexplained BLOCKED');
});

test('finalizeRecord: content digest is deterministic and content-sensitive', () => {
  const first = finalizeRecord(minimalCandidate());
  const second = finalizeRecord(minimalCandidate());
  first.created_at = '2099-01-01T00:00:00Z';
  second.created_at = '2000-01-01T00:00:00Z';
  assert.equal(first.reproducibility.content_digest, second.reproducibility.content_digest, 'digest must ignore creation time');

  const changed = minimalCandidate();
  changed.metrics.routing.decisions_matched = 2;
  finalizeRecord(changed);
  assert.notEqual(changed.reproducibility.content_digest, first.reproducibility.content_digest, 'digest must track content');
});
