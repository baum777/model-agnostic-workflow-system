// MAWS vNext — S10 cross-model comparison tests (MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S10 Cross-Model Optimization). The corpus
// (evals/s10-cross-model/corpus.json) fixes the expected behaviour; these
// tests additionally prove the properties the corpus cannot express on its
// own: determinism, input purity, the fail-closed input errors, the
// authority-free posture, tamper detection by the semantic validator, and the
// honest fixture labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compareExecutors,
  OPTIMIZATION_GATES,
  paretoDominates
} from '../../runtime/optimization/cross-model-comparison.mjs';
import {
  semanticComparisonIssues,
  validateCrossModelComparison
} from '../../scripts/tools/validate-cross-model-comparison.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 's10-cross-model', 'corpus.json'), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'cross-model-comparison.contracts.json'), 'utf8'));
const NOW = () => '2026-10-22T10:00:00.000Z';

function engineInput(corpusCase) {
  const { basis, candidates, optimization_boundaries, evidence_refs } = corpusCase.input;
  return {
    basis,
    candidates,
    optimizationBoundaries: optimization_boundaries ?? [],
    evidenceRefs: evidence_refs ?? [],
    now: NOW
  };
}

function runCorpusCase(caseId) {
  const corpusCase = corpus.cases.find((c) => c.case_id === caseId);
  assert.ok(corpusCase, `corpus case ${caseId} exists`);
  return compareExecutors(engineInput(corpusCase));
}

function exclusionSignature(record) {
  return record.excluded_candidates.map((e) => `${e.candidate_id}:${e.exclusion_reason}`).sort().join(',');
}

// Every corpus case produces its expected verdict, reason, preference and
// exclusions, and every produced record satisfies its own contract.
test('corpus: every case meets its expectation and validates against the contract', () => {
  for (const corpusCase of corpus.cases) {
    const record = compareExecutors(engineInput(corpusCase));
    const expected = corpusCase.expectation;
    assert.equal(record.verdict, expected.verdict, `${corpusCase.case_id} verdict`);
    assert.equal(record.outcome_reason, expected.outcome_reason, `${corpusCase.case_id} reason`);
    assert.equal(record.preferred_candidate_id, expected.preferred_candidate_id ?? null, `${corpusCase.case_id} preferred`);
    assert.equal(exclusionSignature(record), [...(expected.excluded ?? [])].map((e) => `${e.candidate_id}:${e.exclusion_reason}`).sort().join(','), `${corpusCase.case_id} exclusions`);
    const { valid, issues } = validateCrossModelComparison(record);
    assert.ok(valid, `${corpusCase.case_id} record validates: ${issues.join('; ')}`);
  }
});

test('the ten owner-ordered case classes are all present in the corpus', () => {
  const ordered = corpus.cases.filter((c) => (c.case_class ?? '').startsWith('ordered-'));
  const classes = new Set(ordered.map((c) => c.case_class));
  assert.equal(classes.size, 10);
  assert.ok(ordered.length >= 10, `each ordered class has at least one case (got ${ordered.length} cases)`);
});

test('security is absolute: a dominating candidate with a security regression is never preferred', () => {
  const record = runCorpusCase('xmc_case03_security_regression_despite_gain');
  assert.equal(record.verdict, 'INCOMPARABLE');
  assert.equal(record.preferred_candidate_id, null);
  assert.ok(record.excluded_candidates.some((e) => e.candidate_id === 'cand_b' && e.exclusion_reason === 'SECURITY_REGRESSION'));
  assert.match(record.excluded_candidates.find((e) => e.candidate_id === 'cand_b').detail, /absolute/i);
});

test('an unqualified executor never receives winner status', () => {
  const record = runCorpusCase('xmc_case12_unqualified_states_only');
  assert.equal(record.verdict, 'INCOMPARABLE');
  assert.ok(record.excluded_candidates.every((e) => e.exclusion_reason === 'NOT_QUALIFIED'));
});

test('missing qualification evidence blocks instead of comparing the unproven', () => {
  const record = runCorpusCase('xmc_case05_qualification_evidence_missing');
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(record.outcome_reason, 'QUALIFICATION_EVIDENCE_MISSING');
});

test('the S9 regression gate: a detected regression excludes, a missing record is not cleanliness', () => {
  const detected = runCorpusCase('xmc_case10_s9_regression_failed');
  assert.equal(detected.verdict, 'CANDIDATE_PREFERRED');
  assert.equal(detected.preferred_candidate_id, 'cand_c');
  assert.ok(detected.excluded_candidates.some((e) => e.candidate_id === 'cand_b' && e.exclusion_reason === 'REGRESSION_DETECTED'));

  const missing = runCorpusCase('xmc_case15_missing_regression_evidence');
  assert.equal(missing.verdict, 'BLOCKED');
  assert.equal(missing.outcome_reason, 'REGRESSION_EVIDENCE_MISSING');
});

test('equal metrics name no winner: no implicit success threshold', () => {
  const corpusCase = JSON.parse(JSON.stringify(corpus.cases.find((c) => c.case_id === 'xmc_case01_same_quality_different_cost')));
  const record = compareExecutors(engineInput(corpusCase));
  assert.equal(record.verdict, 'CANDIDATE_PREFERRED');
  // Make the candidates metrically identical: dominance must vanish without
  // any threshold stepping in.
  const identical = JSON.parse(JSON.stringify(corpusCase));
  identical.input.candidates = identical.input.candidates.map((c) => ({ ...c, measurements: { ...corpusCase.input.candidates[0].measurements } }));
  const twin = compareExecutors(engineInput(identical));
  assert.equal(twin.verdict, 'INCOMPARABLE');
  assert.equal(twin.outcome_reason, 'PARETO_NONDOMINANCE');
  assert.equal(record.verdict !== twin.verdict, true);
});

test('a single survivor of the gates is not a comparison result', () => {
  const record = runCorpusCase('xmc_case03_security_regression_despite_gain');
  assert.equal(record.outcome_reason, 'NO_WINNER_CAPABLE_CANDIDATE');
});

test('deterministic: identical inputs produce identical records and ids; changed inputs change the id', () => {
  const first = runCorpusCase('xmc_case01_same_quality_different_cost');
  const second = runCorpusCase('xmc_case01_same_quality_different_cost');
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const changed = JSON.parse(JSON.stringify(corpus.cases.find((c) => c.case_id === 'xmc_case01_same_quality_different_cost')));
  changed.input.candidates[0].measurements.quality.task_success_rate = 0.91;
  const third = compareExecutors(engineInput(changed));
  assert.notEqual(third.comparison_id, first.comparison_id);
});

test('pure: the engine does not mutate its inputs', () => {
  const corpusCase = JSON.parse(JSON.stringify(corpus.cases.find((c) => c.case_id === 'xmc_case10_s9_regression_failed')));
  const before = JSON.stringify(corpusCase.input);
  compareExecutors(engineInput(corpusCase));
  assert.equal(JSON.stringify(corpusCase.input), before);
});

test('fail-closed inputs: fewer than two candidates, duplicate ids, and unauthorized live evidence throw typed errors', () => {
  const corpusCase = corpus.cases.find((c) => c.case_id === 'xmc_case01_same_quality_different_cost');
  assert.throws(() => compareExecutors({ ...engineInput(corpusCase), candidates: [corpusCase.input.candidates[0]] }), (error) => error.code === 'XMC_INPUT_INVALID');
  const duplicated = JSON.parse(JSON.stringify(corpusCase.input));
  duplicated.candidates[1].candidate_id = duplicated.candidates[0].candidate_id;
  assert.throws(() => compareExecutors({ basis: duplicated.basis, candidates: duplicated.candidates }), (error) => error.code === 'XMC_INPUT_INVALID');
  const live = JSON.parse(JSON.stringify(corpusCase.input));
  live.basis.evidence_class = 'live_provider';
  assert.throws(() => compareExecutors({ basis: live.basis, candidates: live.candidates }), (error) => error.code === 'XMC_INPUT_INVALID');
});

test('authority-free posture: every record adopts, grants, reroutes and activates nothing', () => {
  for (const corpusCase of corpus.cases) {
    const record = compareExecutors(engineInput(corpusCase));
    assert.equal(record.adoption_authorized, false, corpusCase.case_id);
    assert.equal(record.authority_granted, false, corpusCase.case_id);
    assert.equal(record.routing_changed, false, corpusCase.case_id);
    assert.equal(record.runtime_activation, 'NONE', corpusCase.case_id);
  }
});

test('gate log: the closed sequence, in order, without repetition', () => {
  const preferred = runCorpusCase('xmc_case11_full_dominance');
  const gateOrder = OPTIMIZATION_GATES.map((g) => g.gate);
  assert.deepEqual(preferred.applied_gates.map((g) => g.gate), gateOrder);
  const blocked = runCorpusCase('xmc_case05_qualification_evidence_missing');
  assert.ok(blocked.applied_gates.length < gateOrder.length);
  assert.deepEqual(blocked.applied_gates.map((g) => g.gate), gateOrder.slice(0, blocked.applied_gates.length));
});

test('difference classification: model and provider differences are derived, not asserted', () => {
  const record = runCorpusCase('xmc_case01_same_quality_different_cost');
  const dimensions = record.difference_classification.map((d) => d.dimension);
  assert.ok(dimensions.includes('MODEL'));
  assert.ok(dimensions.includes('PROVIDER'));
  assert.ok(dimensions.includes('EXECUTOR'));
  const uniform = JSON.parse(JSON.stringify(corpus.cases.find((c) => c.case_id === 'xmc_case01_same_quality_different_cost')));
  const sameExecutor = uniform.input.candidates[1];
  sameExecutor.executor_id = uniform.input.candidates[0].executor_id;
  sameExecutor.executor_version = uniform.input.candidates[0].executor_version;
  sameExecutor.provider_id = uniform.input.candidates[0].provider_id;
  sameExecutor.model_id = uniform.input.candidates[0].model_id;
  const uniformRecord = compareExecutors(engineInput(uniform));
  assert.deepEqual(uniformRecord.difference_classification.map((d) => d.dimension), ['NONE']);
});

test('instruction overhead: the validator recomputes the ratio from the components', () => {
  const record = runCorpusCase('xmc_case01_same_quality_different_cost');
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.candidates[0].measurements.instruction_overhead.overhead_ratio = 0.75;
  const issues = semanticComparisonIssues(tampered);
  assert.ok(issues.some((i) => i.includes('overhead_ratio')));
});

test('validator tamper detection: winner capability, comparability flags and gate order', () => {
  const unqualified = JSON.parse(JSON.stringify(runCorpusCase('xmc_case01_same_quality_different_cost')));
  unqualified.candidates.find((c) => c.candidate_id === 'cand_b').qualification.state = 'DISQUALIFIED';
  assert.ok(semanticComparisonIssues(unqualified).some((i) => i.includes('winner-capable')));

  const lying = JSON.parse(JSON.stringify(runCorpusCase('xmc_case06_corpus_mismatch')));
  lying.comparability.same_corpus_digest = true;
  assert.ok(semanticComparisonIssues(lying).some((i) => i.includes('same_corpus_digest')));

  const reordered = JSON.parse(JSON.stringify(runCorpusCase('xmc_case01_same_quality_different_cost')));
  reordered.applied_gates.reverse();
  assert.ok(semanticComparisonIssues(reordered).some((i) => i.includes('closed gate order')));

  const fakedDominance = JSON.parse(JSON.stringify(runCorpusCase('xmc_case02_cheaper_but_worse')));
  fakedDominance.verdict = 'CANDIDATE_PREFERRED';
  fakedDominance.outcome_reason = 'COST_DOMINANCE';
  fakedDominance.preferred_candidate_id = 'cand_a';
  assert.ok(semanticComparisonIssues(fakedDominance).some((i) => i.includes('does not dominate')));

  const blockedWithoutGate = JSON.parse(JSON.stringify(runCorpusCase('xmc_case08_provider_failure')));
  blockedWithoutGate.applied_gates[blockedWithoutGate.applied_gates.length - 1].outcome = 'PASS';
  assert.ok(semanticComparisonIssues(blockedWithoutGate).some((i) => i.includes('logged as BLOCKED')));

  const unbound = JSON.parse(JSON.stringify(runCorpusCase('xmc_case11_full_dominance')));
  unbound.optimization_boundaries.push({ scope: 'MODEL', model_specific: true, adapter_bound: false, detail: 'model-specific shortcut baked into the shared core' });
  assert.ok(semanticComparisonIssues(unbound).some((i) => i.includes('adapter-bound')));

  // The refused variant is the honest record: a BLOCKED-on-boundary record
  // carries the violating entry as evidence and stays valid.
  const refused = runCorpusCase('xmc_case13_adapter_boundary_violation');
  assert.ok(validateCrossModelComparison(refused).valid);
});

test('paretoDominates requires strictly better somewhere and worse nowhere', () => {
  const better = { measurements: { quality: { task_success_rate: 0.9 }, tokens: { cost_units: 100, total: 90000 }, latency_ms: { p95: 2000 } } };
  const worse = { measurements: { quality: { task_success_rate: 0.9 }, tokens: { cost_units: 120, total: 98000 }, latency_ms: { p95: 2400 } } };
  const tradeoff = { measurements: { quality: { task_success_rate: 0.95 }, tokens: { cost_units: 140, total: 98000 }, latency_ms: { p95: 2400 } } };
  assert.ok(paretoDominates(better, worse));
  assert.ok(!paretoDominates(worse, better));
  assert.ok(!paretoDominates(better, tradeoff));
  assert.ok(!paretoDominates(better, better));
});

test('fixtures: every case validates exactly as its label says', () => {
  for (const testCase of fixtures.cases) {
    const { valid, issues } = validateCrossModelComparison(testCase.instance);
    if (testCase.valid === true) {
      assert.ok(valid, `${testCase.case_id} should be valid: ${issues.join('; ')}`);
    } else {
      assert.ok(!valid, `${testCase.case_id} should be invalid`);
      assert.ok(issues.length > 0, `${testCase.case_id} should be invalid for a named reason`);
    }
  }
});

test('cost optimization happens only between sufficiently qualified candidates', () => {
  // The cheaper candidate without qualification evidence must not be
  // preferred on cost, and the comparison must not quietly continue with a
  // sole qualified candidate as a winner.
  const corpusCase = JSON.parse(JSON.stringify(corpus.cases.find((c) => c.case_id === 'xmc_case01_same_quality_different_cost')));
  const unqualifiedCheaper = corpusCase.input.candidates.find((c) => c.candidate_id === 'cand_b');
  unqualifiedCheaper.qualification.state = 'UNKNOWN';
  unqualifiedCheaper.qualification.qualification_evidence_refs = [];
  const record = compareExecutors(engineInput(corpusCase));
  assert.equal(record.verdict, 'INCOMPARABLE');
  assert.equal(record.outcome_reason, 'NO_WINNER_CAPABLE_CANDIDATE');
  assert.ok(record.excluded_candidates.some((e) => e.candidate_id === 'cand_b' && e.exclusion_reason === 'QUALIFICATION_EVIDENCE_MISSING'));
});
