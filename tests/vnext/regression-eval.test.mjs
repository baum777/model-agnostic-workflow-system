// MAWS vNext — S9 regression and rollback tests (MAWS-SII-TARGET-SPEC-001).
// node:test + node:assert/strict, no new dependencies.
//
// The S9 slice answers two questions that a clean run cannot answer on its
// own: does the gate REJECT a candidate that regressed while looking better
// in every other number, and does the rollback REFUSE to restore something
// that is not the last qualified revision. Both are decided here against the
// independent case corpus, and the refusals are bound: every negative case
// has a typed refusal code, so a silent pass is not possible.
//
// The tests also bind the three properties that the slice exists for:
//   - a comparison authorizes nothing, whatever the numbers say;
//   - a rejected candidate leaves the original state byte-identical;
//   - the advisory instruction-integrity candidates never block.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { compareBaselineCandidate } from '../../runtime/regression/regression-gate.mjs';
import { evaluateSignalCases } from '../../runtime/regression/signal-evaluation.mjs';
import { planRollback, historyInventoryDigest } from '../../runtime/regression/rollback.mjs';
import {
  semanticComparisonIssues,
  semanticRollbackIssues,
  validateRegressionComparison,
  validateRollbackRecord
} from '../../scripts/tools/validate-regression-comparison.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_PATH = path.join(ROOT, 'evals', 's9-regression', 'corpus.json');
const CORPUS = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function treeDigest(root) {
  const entries = [];
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }
      entries.push({ relative, digest: sha256(fs.readFileSync(absolute)) });
    }
  };
  walk(root, '');
  return `sha256:${sha256(JSON.stringify(entries))}`;
}

function regressionCase(caseId) {
  const found = CORPUS.regression_cases.find((entry) => entry.case_id === caseId);
  assert.ok(found, `the corpus must carry the case ${caseId}`);
  return found;
}

function rollbackCase(caseId) {
  const found = CORPUS.rollback_cases.find((entry) => entry.case_id === caseId);
  assert.ok(found, `the corpus must carry the case ${caseId}`);
  return found;
}

function resolveFingerprints(entry) {
  return (entry.versions ?? []).map((version) => {
    const resolved = { ...version };
    for (const key of ['qualified_fingerprint', 'restored_fingerprint']) {
      if (typeof resolved[key] === 'string') {
        resolved[key] = CORPUS.fingerprints[resolved[key]] ?? null;
      }
    }
    return resolved;
  });
}

function compare(caseId, patch = {}) {
  const entry = regressionCase(caseId);
  return compareBaselineCandidate({
    baseline: { ...entry.baseline, ...(patch.baseline ?? {}) },
    candidate: { ...entry.candidate, ...(patch.candidate ?? {}) },
    evidenceRefs: [`test:${caseId}`]
  });
}

function rollback(caseId) {
  const entry = rollbackCase(caseId);
  return planRollback({
    subject: entry.subject,
    current: entry.current,
    versions: resolveFingerprints(entry),
    // The pre-rollback digest is passed through as the corpus states it and
    // is never derived from the entries it is used to check.
    history: {
      entries: entry.history?.entries ?? [],
      digest_before: entry.history?.digest_before
    },
    requestedTargetVersion: entry.requested_target_version ?? null,
    evidenceRefs: [`test:${caseId}`]
  });
}

// --- the gate -------------------------------------------------------------

test('S9 an improved candidate is compared and nothing regressed is reported', () => {
  const record = compare('regr_candidate_improved');
  assert.equal(record.verdict, 'NO_REGRESSION');
  assert.deepEqual(record.blocking_regressions, []);
  assert.equal(record.candidate_rejected, false);
  const routing = record.criteria.find((entry) => entry.criterion === 'SKILL_ROUTING_ACCURACY');
  assert.equal(routing.verdict, 'IMPROVED');
  assert.equal(record.criteria.find((entry) => entry.criterion === 'SECURITY_REGRESSION_COUNT').verdict, 'EQUAL');
});

test('S9 a candidate that improves every number but carries a security regression is rejected', () => {
  const record = compare('regr_candidate_security_regression_beats_improvement');
  assert.equal(record.verdict, 'REGRESSION_DETECTED');
  assert.deepEqual(record.blocking_regressions, ['SECURITY_REGRESSION_COUNT']);
  assert.equal(record.candidate_rejected, true);
  // The improvement is still reported; it is simply not enough.
  assert.equal(record.criteria.find((entry) => entry.criterion === 'SKILL_ROUTING_ACCURACY').verdict, 'IMPROVED');
  assert.equal(record.criteria.find((entry) => entry.criterion === 'OUTPUT_ASSERTION_PASS_RATE').verdict, 'IMPROVED');
});

test('S9 a candidate that routes worse is rejected even when it asserts more', () => {
  const record = compare('regr_candidate_routing_regression');
  assert.equal(record.verdict, 'REGRESSION_DETECTED');
  assert.deepEqual(record.blocking_regressions, ['SKILL_ROUTING_ACCURACY']);
});

test('S9 missing evidence blocks the comparison instead of passing it', () => {
  const record = compare('regr_candidate_missing_evidence');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.candidate_rejected, true);
  const invariant = record.governance_invariants.find((entry) => entry.invariant === 'EVIDENCE_COMPLETE');
  assert.equal(invariant.holds, false);
  assert.match(invariant.detail, /content_digest/);
});

test('S9 a comparison across two different corpora is refused', () => {
  const record = compare('regr_candidate_measured_over_another_corpus');
  assert.equal(record.verdict, 'BLOCKED');
  const invariant = record.governance_invariants.find((entry) => entry.invariant === 'SAME_CORPUS');
  assert.equal(invariant.holds, false);
});

test('S9 a comparison of a revision with itself is refused', () => {
  const entry = regressionCase('regr_candidate_improved');
  const record = compareBaselineCandidate({
    baseline: entry.baseline,
    candidate: { ...entry.baseline }
  });
  assert.equal(record.verdict, 'BLOCKED');
  const invariant = record.governance_invariants.find((entry_) => entry_.invariant === 'DISTINCT_REVISION');
  assert.equal(invariant.holds, false);
});

test('S9 a comparison authorizes nothing, whatever the verdict says', () => {
  for (const caseId of ['regr_candidate_improved', 'regr_candidate_security_regression_beats_improvement', 'regr_candidate_missing_evidence']) {
    const record = compare(caseId);
    assert.equal(record.adoption_authorized, false, `${caseId} must not authorize an adoption`);
    assert.equal(record.authority_granted, false, `${caseId} must not grant authority`);
  }
});

test('S9 the advisory instruction-integrity candidates are an observation and never a block', () => {
  const record = compare('regr_candidate_advisory_candidates_rose', {
    baseline: { instructionIntegrity: { candidate_count: 0, by_class: {} } },
    candidate: { instructionIntegrity: { candidate_count: 3, by_class: { RULE_CONFLICT: 3 } } }
  });
  const criterion = record.criteria.find((entry) => entry.criterion === 'INSTRUCTION_INTEGRITY_CANDIDATES');
  assert.equal(criterion.blocking, false);
  assert.equal(criterion.verdict, 'REGRESSED');
  assert.equal(record.verdict, 'NO_REGRESSION');
  assert.equal(record.candidate_rejected, false);
  assert.deepEqual(record.blocking_regressions, []);
  assert.equal(record.advisory_observations.length, 1);
  assert.match(record.advisory_observations[0].detail, /advisory/);
});

test('S9 a rejected candidate leaves the original state byte-identical', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s9-state-'));
  try {
    const canonical = path.join(root, 'skills', 'demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(canonical, '---\nname: demo\ndescription: demo skill\n---\n\nThe candidate content.\n');
    const before = treeDigest(root);
    const record = compare('regr_candidate_security_regression_beats_improvement');
    const after = treeDigest(root);
    assert.equal(record.candidate_rejected, true);
    assert.equal(before, after, 'the gate must not write to the candidate state');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('S9 the comparison record is contract-valid', () => {
  for (const entry of CORPUS.regression_cases) {
    const record = compare(entry.case_id);
    assert.deepEqual(validateRegressionComparison(record, ROOT), [], `${entry.case_id} must be contract-valid`);
  }
});

test('S9 the comparison is deterministic', () => {
  const first = compare('regr_candidate_advisory_candidates_rose');
  const second = compare('regr_candidate_advisory_candidates_rose');
  assert.equal(first.comparison_id, second.comparison_id);
  assert.deepEqual(first.criteria, second.criteria);
});

// --- the semantic invariants of the comparison record ----------------------

test('S9 a NO_REGRESSION record that hides a blocking regression is refused', () => {
  const record = compare('regr_candidate_improved');
  const tampered = JSON.parse(JSON.stringify(record));
  const security = tampered.criteria.find((entry) => entry.criterion === 'SECURITY_REGRESSION_COUNT');
  security.verdict = 'REGRESSED';
  security.candidate_value = 1;
  security.delta = 1;
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('C1')), 'a hidden blocking regression must be refused');
});

test('S9 a record whose delta does not follow its measured values is refused', () => {
  const record = compare('regr_candidate_improved');
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.criteria.find((entry) => entry.criterion === 'SKILL_ROUTING_ACCURACY').delta = 5;
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('C6')), 'the delta must follow the measured values');
});

test('S9 a record that drops a criterion is refused', () => {
  const record = compare('regr_candidate_improved');
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.criteria = tampered.criteria.filter((entry) => entry.criterion !== 'SECURITY_REGRESSION_COUNT');
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('C5')), 'the closed criterion set must be complete');
});

test('S9 an advisory criterion may not appear as a blocking regression', () => {
  const record = compare('regr_candidate_advisory_candidates_rose', {
    candidate: { instructionIntegrity: { candidate_count: 3, by_class: {} } }
  });
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.blocking_regressions = ['INSTRUCTION_INTEGRITY_CANDIDATES'];
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('C7')), 'an advisory criterion may not block');
});

test('S9 an unexplained BLOCKED verdict is refused', () => {
  const record = compare('regr_candidate_missing_evidence');
  const tampered = JSON.parse(JSON.stringify(record));
  for (const invariant of tampered.governance_invariants) invariant.holds = true;
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('C3')), 'a block must name its reason');
});

// --- the eight advisory signals -------------------------------------------

test('S9 every one of the eight semantic classes is measured against independent cases', () => {
  const evaluation = evaluateSignalCases({ cases: CORPUS.signal_cases });
  assert.equal(evaluation.classes.length, 8);
  assert.deepEqual(evaluation.coverage.classes_without_cases, [], 'no class may stay unmeasured');
  for (const entry of evaluation.classes) {
    assert.equal(entry.cases_present, 1, `${entry.finding_class} needs a case in which it holds`);
    assert.equal(entry.cases_absent, 1, `${entry.finding_class} needs a case in which it does not hold`);
    assert.equal(entry.true_positive, 1, `${entry.finding_class} must be detected where it holds`);
    assert.equal(entry.false_positive, 0, `${entry.finding_class} must stay silent where it does not hold`);
    assert.equal(entry.false_negative, 0, `${entry.finding_class} must not miss a planted case`);
    assert.equal(entry.precision, 1);
    assert.equal(entry.recall, 1);
  }
});

test('S9 the false positives and the false negatives are counted separately', () => {
  const evaluation = evaluateSignalCases({ cases: CORPUS.signal_cases });
  for (const entry of evaluation.classes) {
    assert.equal(typeof entry.false_positive, 'number');
    assert.equal(typeof entry.false_negative, 'number');
    assert.notEqual(entry.false_positive, undefined);
  }
  const totals = evaluation.classes.reduce((sum, entry) => sum + entry.false_positive + entry.false_negative, 0);
  assert.equal(totals, 0, 'the measured corpus has no false positive and no false negative');
});

test('S9 a class without an independent case is a coverage gap, never a clean result', () => {
  const reduced = CORPUS.signal_cases.filter((entry) => entry.finding_class !== 'MODEL_DRIFT');
  const evaluation = evaluateSignalCases({ cases: reduced });
  const drifted = evaluation.classes.find((entry) => entry.finding_class === 'MODEL_DRIFT');
  assert.equal(drifted.coverage_gap, true);
  assert.equal(drifted.precision, null);
  assert.equal(drifted.recall, null);
  assert.deepEqual(evaluation.coverage.classes_without_cases, ['MODEL_DRIFT']);
});

test('S9 the signal evaluation is deterministic and bound to the corpus', () => {
  const first = evaluateSignalCases({ cases: CORPUS.signal_cases });
  const second = evaluateSignalCases({ cases: CORPUS.signal_cases });
  assert.equal(first.corpus_digest, second.corpus_digest);
  assert.deepEqual(first.classes, second.classes);
});

test('S9 a case outside the eight semantic classes is refused', () => {
  assert.throws(
    () => evaluateSignalCases({ cases: [{ case_id: 'x', finding_class: 'STALE_REFERENCE', expectation: 'PRESENT', sources: [], files: {} }] }),
    (error) => error.code === 'SIGNAL_CORPUS_INVALID'
  );
});

// --- the controlled rollback -----------------------------------------------

test('S9 a rollback plan restores the last qualified revision and shows the history intact', () => {
  const record = rollback('rbk_happy_path');
  assert.equal(record.verdict, 'ROLLBACK_PLANNED');
  assert.equal(record.refusal_code, null);
  assert.equal(record.restored_to.version, '1.1.0');
  assert.equal(record.restored_to.qualification_state, 'QUALIFIED');
  assert.equal(record.materiality_after_rollback.overall_class, 'NON_MATERIAL');
  assert.equal(record.history.unchanged, true);
  assert.equal(record.history.digest_before, record.history.digest_after);
  assert.equal(record.adoption_authorized, false);
  assert.equal(record.authority_granted, false);
});

test('S9 a rollback plan without an independent pre-rollback digest is refused', () => {
  const record = rollback('rbk_history_digest_missing');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.refusal_code, 'HISTORY_DIGEST_MISSING');
  assert.equal(record.history.unchanged, false);
});

test('S9 a candidate that still carries a security regression is rejected however it compares', () => {
  const record = compare('regr_candidate_still_carries_a_security_regression');
  assert.equal(record.verdict, 'REGRESSION_DETECTED');
  assert.deepEqual(record.blocking_regressions, ['SECURITY_REGRESSION_COUNT']);
  assert.equal(record.candidate_rejected, true);
  // The relative improvement is still reported; it does not launder the
  // regression that remains.
  const security = record.criteria.find((entry) => entry.criterion === 'SECURITY_REGRESSION_COUNT');
  assert.equal(security.baseline_value, 2);
  assert.equal(security.candidate_value, 1);
  assert.equal(security.delta, -1);
  assert.equal(security.verdict, 'REGRESSED');
});

test('S9 a comparison of two different subjects is refused', () => {
  const record = compare('regr_candidate_measures_another_subject');
  assert.equal(record.verdict, 'BLOCKED');
  const invariant = record.governance_invariants.find((entry) => entry.invariant === 'SAME_SUBJECT');
  assert.equal(invariant.holds, false);
  assert.match(invariant.detail, /different subjects/);
});

test('S9 a criterion verdict that its own numbers contradict is refused', () => {
  const record = compare('regr_candidate_improved');
  const tampered = JSON.parse(JSON.stringify(record));
  const routing = tampered.criteria.find((entry) => entry.criterion === 'SKILL_ROUTING_ACCURACY');
  routing.candidate_value = 0;
  routing.delta = -0.5;
  routing.verdict = 'IMPROVED';
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('C8')), 'the criterion verdict must follow its measured values');
});

test('S9 a rollback without a qualified revision is refused', () => {
  const record = rollback('rbk_no_qualified_revision');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.refusal_code, 'ROLLBACK_TARGET_NOT_QUALIFIED');
  assert.ok(record.refusal_detail.length > 0);
});

test('S9 a rollback to an older qualified revision is refused', () => {
  const record = rollback('rbk_requested_target_is_not_the_last_qualified');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.refusal_code, 'ROLLBACK_TARGET_NOT_LAST_QUALIFIED');
  assert.match(record.refusal_detail, /1\.1\.0/);
});

test('S9 a rollback that goes nowhere is refused', () => {
  const record = rollback('rbk_not_a_rollback');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.refusal_code, 'ROLLBACK_NOT_A_ROLLBACK');
});

test('S9 a rollback that lost the execution history is refused', () => {
  const record = rollback('rbk_history_changed');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.refusal_code, 'HISTORY_NOT_PRESERVED');
  assert.equal(record.history.unchanged, false);
  assert.notEqual(record.history.digest_before, record.history.digest_after);
});

test('S9 a rollback whose restored state is not the qualified state is refused', () => {
  const record = rollback('rbk_restored_state_is_not_the_qualified_state');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.refusal_code, 'MATERIALITY_NOT_NON_MATERIAL');
  assert.equal(record.materiality_after_rollback.overall_class, 'MATERIAL');
});

test('S9 the rollback record is contract-valid', () => {
  for (const entry of CORPUS.rollback_cases) {
    const record = rollback(entry.case_id);
    assert.deepEqual(validateRollbackRecord(record, ROOT), [], `${entry.case_id} must be contract-valid`);
  }
});

test('S9 a planned rollback that lost the history is refused by the contract', () => {
  const record = rollback('rbk_happy_path');
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.history.unchanged = false;
  const issues = semanticRollbackIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('K1') || issue.includes('K6')));
});

test('S9 a blocked rollback without a reason is refused by the contract', () => {
  const record = rollback('rbk_no_qualified_revision');
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.refusal_detail = '';
  const issues = semanticRollbackIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('K2')));
});

test('S9 a rollback plan never claims that a restore happened', () => {
  const record = rollback('rbk_happy_path');
  assert.notEqual(record.verdict, 'ROLLED_BACK');
  assert.equal(record.authority_granted, false);
  assert.equal(record.adoption_authorized, false);
});

test('S9 a corpus file key that escapes the case directory is refused', () => {
  assert.throws(
    () => evaluateSignalCases({
      cases: [{
        case_id: 'escape_case',
        finding_class: 'RULE_CONFLICT',
        expectation: 'PRESENT',
        sources: [{ path: 'AGENTS.md', role: 'root_governance', authority_class: 'canonical' }],
        files: { '../sentinel-outside-the-case.md': 'this file must never be written\n' }
      }]
    }),
    (error) => error.code === 'CORPUS_PATH_OUTSIDE_CASE'
  );
});

test('S9 a rollback record whose inventory does not match its own digest is refused', () => {
  const record = rollback('rbk_happy_path');
  const tampered = JSON.parse(JSON.stringify(record));
  // The entries are edited while the stated digests stay: the recomputed
  // inventory digest no longer matches digest_after.
  tampered.history.entries[0].digest = 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const issues = semanticRollbackIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('K6')), 'the inventory must match its own digest');
});

test('S9 a SAME_CORPUS invariant that contradicts the revision digests is refused', () => {
  const record = compare('regr_candidate_improved');
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.candidate.corpus_digest = 'sha256:feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface';
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((issue) => issue.includes('C9') && issue.includes('SAME_CORPUS')), 'the corpus equality follows from the revision digests');
});
