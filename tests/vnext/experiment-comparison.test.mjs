// MAWS — HO-01 local optimization comparison tests.
// node:test + node:assert/strict, no new dependencies.
//
// Proves: the versioned experiment definition validates and freezes its
// inputs, exactly one declared dimension may differ between the compared
// configurations, the comparison is reproducible from the frozen inputs,
// an artificially worse candidate is detected as a regression, and manipulated
// or mismatched run evidence is refused instead of reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ExperimentError,
  assertFrozenInputsIntact,
  assertSingleDeclaredDimension,
  canonicalJson,
  computeDecision,
  loadExperimentDefinition,
  materializeReport,
  materializeRunSpec,
  runEvidenceDigest,
  analysisOutputDigest,
  runLocalOptimizationComparison
} from '../../scripts/tools/run-local-optimization-comparison.mjs';
import {
  semanticComparisonIssues,
  validateExperimentComparisonRecord
} from '../../scripts/tools/validate-experiment-comparison.mjs';
import { computeContentDigest } from '../../scripts/tools/run-skill-effectiveness-evals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPERIMENT_REL = 'evals/experiments/ho01-local-optimization/experiment.json';
const EXPERIMENT_PATH = path.join(ROOT, EXPERIMENT_REL);

function loadDefinition() {
  return loadExperimentDefinition(EXPERIMENT_REL, ROOT).definition;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// The full comparison is executed once and shared by the assertions below:
// two runtime runs plus two behavioral-eval records is the whole chain, and
// every check below reads the artifacts it actually produced.
const RUN_ROOT = tempDir('maws-ho01-run-');
const RESULT = await runLocalOptimizationComparison({
  experimentPath: EXPERIMENT_REL,
  outDir: path.relative(ROOT, RUN_ROOT),
  repoRoot: ROOT
});

test('experiment definition: validates against its contract and freezes its inputs', () => {
  const definition = loadDefinition();
  assert.equal(definition.schema_version, '1.0.0');
  assert.equal(definition.status, 'FIXTURE_COMPARISON_ONLY');
  assert.equal(definition.authority_granted, false);
  assert.equal(definition.promotion_effect, 'NONE');
  assert.ok(definition.frozen_inputs.files.length > 0);
  // The frozen digests must match the files on disk right now.
  assert.doesNotThrow(() => assertFrozenInputsIntact(definition, ROOT));
});

test('experiment definition: a moved or edited frozen input is refused', () => {
  const definition = loadDefinition();
  const tampered = clone(definition);
  tampered.frozen_inputs.files[0].digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => assertFrozenInputsIntact(tampered, ROOT),
    (error) => error instanceof ExperimentError && error.code === 'FROZEN_INPUT_DIGEST_MISMATCH'
  );
});

test('frozen inputs: a path that leaves the repository is refused, not followed', () => {
  const definition = loadDefinition();
  const escaping = clone(definition);
  escaping.frozen_inputs.files[0].path = '../../../etc/passwd';
  assert.throws(
    () => assertFrozenInputsIntact(escaping, ROOT),
    (error) => error instanceof ExperimentError && error.code === 'FROZEN_INPUT_PATH_ESCAPES_ROOT'
  );
  const absolute = clone(definition);
  absolute.frozen_inputs.files[0].path = '/etc/passwd';
  assert.throws(
    () => assertFrozenInputsIntact(absolute, ROOT),
    (error) => error instanceof ExperimentError && error.code === 'FROZEN_INPUT_PATH_ESCAPES_ROOT'
  );
});

test('frozen inputs: a run-spec template path that leaves the repository is refused', () => {
  const definition = loadDefinition();
  const escaping = clone(definition);
  escaping.frozen_inputs.run_spec_template_ref = '../../../../etc/passwd';
  assert.throws(
    () => assertFrozenInputsIntact(escaping, ROOT),
    (error) => error instanceof ExperimentError && error.code === 'FROZEN_INPUT_PATH_ESCAPES_ROOT'
  );
});

test('frozen inputs: a corpus path that leaves the repository is refused', () => {
  // The corpus is the input the behavioral evaluation actually measures, so
  // its path must be confined exactly like every other declared input.
  const definition = loadDefinition();
  for (const corpusPath of ['/tmp/ho01-evil-corpus', '../../../../tmp/ho01-evil-corpus']) {
    const escaping = clone(definition);
    escaping.frozen_inputs.corpus_path = corpusPath;
    assert.throws(
      () => assertFrozenInputsIntact(escaping, ROOT),
      (error) => error instanceof ExperimentError && error.code === 'FROZEN_INPUT_PATH_ESCAPES_ROOT',
      `the escaping corpus path ${corpusPath} was accepted`
    );
  }
});

test('frozen inputs: a corpus manifest that references an undeclared file is refused', () => {
  // A manifest that points the evaluation at a case file the definition
  // never declared would measure an unbound corpus while the record claims
  // frozen inputs.
  const definition = loadDefinition();
  const unbound = clone(definition);
  unbound.frozen_inputs.files = unbound.frozen_inputs.files.filter(
    (file) => file.path !== 'evals/experiments/ho01-local-optimization/security-cases.json'
  );
  assert.throws(
    () => assertFrozenInputsIntact(unbound, ROOT),
    (error) => error instanceof ExperimentError && error.code === 'FROZEN_INPUT_NOT_DECLARED'
  );
});

test('frozen inputs: a symlink that points out of the repository is refused, not followed', () => {
  // The confinement must hold for a link INSIDE the base that points outside
  // it: following it would read exactly the material the confinement exists
  // to keep out.
  const base = tempDir('maws-ho01-symlink-');
  const outside = tempDir('maws-ho01-outside-');
  fs.writeFileSync(path.join(outside, 'target.json'), '{"secret":"outside-material"}');
  fs.symlinkSync(path.join(outside, 'target.json'), path.join(base, 'link.json'));

  const definition = loadDefinition();
  const escaping = clone(definition);
  escaping.frozen_inputs.corpus_path = 'link.json';
  assert.throws(
    () => assertFrozenInputsIntact(escaping, base),
    (error) => error instanceof ExperimentError && error.code === 'FROZEN_INPUT_PATH_ESCAPES_ROOT'
  );
});

test('negative: a comparison whose referenced artifact path escapes the artifacts base is refused', () => {
  const escaping = clone(RESULT.comparison);
  escaping.runs.candidate.evidence_bundle_path = '../../../../etc';
  const issues = semanticComparisonIssues(escaping, { artifactsBase: RUN_ROOT, root: ROOT });
  assert.ok(issues.length > 0, 'the escaping artifact path was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E23:')), `the escape was not caught: ${issues.join('; ')}`);
});

test('single-dimension invariant: the shipped definition changes exactly one declared dimension', () => {
  const definition = loadDefinition();
  const { baseline, candidate, dimensionId } = assertSingleDeclaredDimension(definition);
  assert.equal(dimensionId, 'analysis_context_depth');
  assert.equal(baseline.dimensions[dimensionId], 'full');
  assert.equal(candidate.dimensions[dimensionId], 'reduced');
});

test('single-dimension invariant: two changed dimensions are refused', () => {
  const definition = loadDefinition();
  const twoDimensions = clone(definition);
  // The same dimension set, but two values moved: not a single-variable
  // experiment, so it must not be reported as one.
  twoDimensions.configurations[0].dimensions.answer_precision = 'high';
  twoDimensions.configurations[1].dimensions.answer_precision = 'low';
  assert.throws(
    () => assertSingleDeclaredDimension(twoDimensions),
    (error) => error instanceof ExperimentError && error.code === 'CHANGED_DIMENSION_COUNT_INVALID'
  );
});

test('single-dimension invariant: a dimension set that differs between the arms is refused', () => {
  const definition = loadDefinition();
  const asymmetric = clone(definition);
  asymmetric.configurations[1].dimensions = { some_other_dimension: 'reduced' };
  assert.throws(
    () => assertSingleDeclaredDimension(asymmetric),
    (error) => error instanceof ExperimentError && error.code === 'CONFIGURATION_DIMENSION_SET_MISMATCH'
  );
});

test('single-dimension invariant: an undeclared changed dimension is refused', () => {
  const definition = loadDefinition();
  const undeclared = clone(definition);
  // The moved dimension is not the declared one.
  undeclared.configurations[0].dimensions = { analysis_context_depth: 'full', answer_precision: 'high' };
  undeclared.configurations[1].dimensions = { analysis_context_depth: 'full', answer_precision: 'low' };
  assert.throws(
    () => assertSingleDeclaredDimension(undeclared),
    (error) => error instanceof ExperimentError && error.code === 'CHANGED_DIMENSION_UNDECLARED'
  );
});

test('single-dimension invariant: a value outside the declared set is refused', () => {
  const definition = loadDefinition();
  const outside = clone(definition);
  outside.declared_change.candidate_value = 'partial';
  outside.configurations[1].dimensions.analysis_context_depth = 'partial';
  assert.throws(
    () => assertSingleDeclaredDimension(outside),
    (error) => error instanceof ExperimentError && error.code === 'DECLARED_CHANGE_VALUE_UNKNOWN'
  );
});

test('single-dimension invariant: a configuration value that contradicts the declared change is refused', () => {
  const definition = loadDefinition();
  const contradictory = clone(definition);
  contradictory.configurations[1].dimensions.analysis_context_depth = 'partial';
  assert.throws(
    () => assertSingleDeclaredDimension(contradictory),
    (error) => error instanceof ExperimentError && error.code === 'DECLARED_CHANGE_VALUES_MISMATCH'
  );
});

test('materialization: the derived analysis output is deterministic and dimension-bound', () => {
  const definition = loadDefinition();
  const full = materializeReport(definition.task, 'full');
  const reduced = materializeReport(definition.task, 'reduced');
  assert.deepEqual(full.modules_analyzed, ['module_alpha', 'module_beta', 'module_gamma']);
  assert.deepEqual(reduced.modules_analyzed, ['module_alpha']);
  assert.equal(full.findings.length, 5);
  assert.equal(reduced.findings.length, 1);
  // The same input always derives the same output.
  assert.equal(canonicalJson(full), canonicalJson(materializeReport(definition.task, 'full')));
});

test('run specs: the two arms differ only in the run identity and the declared dimension', () => {
  const definition = loadDefinition();
  const template = JSON.parse(fs.readFileSync(path.join(ROOT, definition.frozen_inputs.run_spec_template_ref), 'utf8'));
  const { baseline, candidate } = assertSingleDeclaredDimension(definition);
  const baselineSpec = materializeRunSpec(definition, baseline, template).spec;
  const candidateSpec = materializeRunSpec(definition, candidate, template).spec;
  // The two specs are not identical, and the analysis output is the carrier.
  assert.notEqual(canonicalJson(baselineSpec), canonicalJson(candidateSpec));
  assert.notEqual(
    canonicalJson(baselineSpec.executor_bindings.exec_openrouter_glm.result),
    canonicalJson(candidateSpec.executor_bindings.exec_openrouter_glm.result)
  );
  // The authority ceiling, the context envelope budget and the executor set
  // are identical: only the dimension moved.
  assert.equal(canonicalJson(baselineSpec.template.authority_ceiling_default), canonicalJson(candidateSpec.template.authority_ceiling_default));
  assert.equal(baselineSpec.context_envelope.token_budget, candidateSpec.context_envelope.token_budget);
  assert.deepEqual(
    Object.keys(baselineSpec.executor_bindings).sort(),
    Object.keys(candidateSpec.executor_bindings).sort()
  );
  // The harness context stays a development context with no authority grant.
  for (const spec of [baselineSpec, candidateSpec]) {
    assert.equal(spec.harness_context.context, 'development_harness');
    assert.equal(spec.harness_context.authority_grant, 'none');
  }
});

test('comparison: the chain produces two referenced runtime runs and two behavioral-eval records', () => {
  const comparison = RESULT.comparison;
  assert.equal(comparison.runs.baseline.run_id, 'run_ho01_cfg_baseline');
  assert.equal(comparison.runs.candidate.run_id, 'run_ho01_cfg_candidate');
  assert.notEqual(comparison.runs.baseline.run_id, comparison.runs.candidate.run_id);
  for (const role of ['baseline', 'candidate']) {
    assert.equal(comparison.runs[role].status, 'COMPLETED');
    assert.equal(comparison.runs[role].transport, 'fixture');
    assert.equal(comparison.runs[role].harness_context, 'development_harness');
    assert.equal(comparison.runs[role].authority_grant, 'none');
    assert.ok(comparison.runs[role].evidence_bundle_path);
    assert.ok(comparison.behavioral_evals[role].eval_id.startsWith('bev_'));
  }
  assert.equal(comparison.behavioral_evals.baseline.verdict, 'BASELINE_RECORDED');
  assert.equal(comparison.behavioral_evals.candidate.verdict, 'IMPROVEMENT_REJECTED');
});

test('comparison: the artificially worse candidate is detected as a regression', () => {
  const comparison = RESULT.comparison;
  assert.equal(comparison.metrics.output_assertion_pass_delta, -0.1875);
  assert.equal(comparison.metrics.routing_accuracy_delta, 0);
  assert.equal(comparison.metrics.security_regressions, 0);
  assert.equal(comparison.decision.outcome, 'REGRESSION');
  assert.equal(comparison.decision.meets_success_bounds, false);
  assert.equal(comparison.decision.hypothesis_outcome, 'CONFIRMED');
});

test('comparison: the record states its own unknowns and never claims authority', () => {
  const comparison = RESULT.comparison;
  assert.ok(comparison.unknowns.length > 0);
  const unknownIds = comparison.unknowns.map((unknown) => unknown.metric_id);
  for (const expected of ['model_quality', 'provider_cost', 'production_latency']) {
    assert.ok(unknownIds.includes(expected), `unknown ${expected} is not declared`);
  }
  for (const unknown of comparison.unknowns) {
    assert.ok(unknown.reason.length > 0);
    assert.ok(unknown.unknown_reason_code.length > 0);
  }
  assert.equal(comparison.status, 'FIXTURE_COMPARISON_ONLY');
  assert.equal(comparison.authority_granted, false);
  assert.equal(comparison.promotion_effect, 'NONE');
});

test('comparison: the record validates against its contract and its semantics', () => {
  const issues = validateExperimentComparisonRecord(RESULT.comparison, {
    artifactsBase: RUN_ROOT,
    definition: loadDefinition(),
    root: ROOT
  });
  assert.deepEqual(issues, [], `the produced comparison raised: ${issues.join('; ')}`);
});

test('comparison: the record carries no promotion input', () => {
  const serialized = canonicalJson(RESULT.comparison);
  for (const token of ['adopt_', 'skill-frontdoor-admission', 'canonical_owner', 'owner_approval']) {
    assert.ok(!serialized.includes(token), `the comparison carries the promotion token ${token}`);
  }
});

test('reproducibility: a second execution from the same frozen inputs yields the same digests', async () => {
  const secondRoot = tempDir('maws-ho01-rerun-');
  const second = await runLocalOptimizationComparison({
    experimentPath: EXPERIMENT_REL,
    outDir: path.relative(ROOT, secondRoot),
    repoRoot: ROOT
  });
  const first = RESULT.comparison;
  assert.equal(second.comparison.definition_digest, first.definition_digest);
  for (const role of ['baseline', 'candidate']) {
    assert.equal(second.comparison.runs[role].spec_digest, first.runs[role].spec_digest);
    assert.equal(second.comparison.runs[role].evidence_digest, first.runs[role].evidence_digest);
    assert.equal(second.comparison.runs[role].analysis_output_digest, first.runs[role].analysis_output_digest);
    assert.equal(second.comparison.behavioral_evals[role].content_digest, first.behavioral_evals[role].content_digest);
    assert.equal(second.comparison.behavioral_evals[role].verdict, first.behavioral_evals[role].verdict);
  }
  assert.equal(canonicalJson(second.comparison.metrics), canonicalJson(first.metrics));
  assert.equal(second.comparison.decision.outcome, first.decision.outcome);
});

test('negative: a manipulated run bundle is refused, not reported', () => {
  const tamperedRoot = tempDir('maws-ho01-tamper-run-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const bundleFile = path.join(tamperedRoot, RESULT.comparison.runs.candidate.evidence_bundle_path, 'execution-results.json');
  const executionResults = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
  for (const result of executionResults) {
    for (const output of result.outputs || []) {
      if (output.output_id === 'audit_report') {
        output.inline_payload.findings.push('finding_injected_after_the_fact');
      }
    }
  }
  fs.writeFileSync(bundleFile, `${JSON.stringify(executionResults, null, 2)}\n`);

  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the manipulated run bundle was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the manipulation was not caught as an evidence-digest mismatch: ${issues.join('; ')}`);
  assert.ok(issues.some((issue) => issue.startsWith('E19:')), `the manipulation was not caught as an analysis-output mismatch: ${issues.join('; ')}`);
});

test('negative: a behavioral-eval record edited after sealing is refused', () => {
  const tamperedRoot = tempDir('maws-ho01-tamper-eval-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const evalFile = path.join(tamperedRoot, RESULT.comparison.behavioral_evals.candidate.record_path);
  const record = JSON.parse(fs.readFileSync(evalFile, 'utf8'));
  record.metrics.output.assertions_passed = record.metrics.output.assertions_total;
  fs.writeFileSync(evalFile, `${JSON.stringify(record, null, 2)}\n`);

  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the edited behavioral-eval record was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E16:')), `the edit was not caught as a broken content seal: ${issues.join('; ')}`);
});

test('negative: a candidate redirected to the baseline run is refused', () => {
  const mismatched = clone(RESULT.comparison);
  mismatched.runs.candidate.run_id = mismatched.runs.baseline.run_id;
  mismatched.runs.candidate.evidence_bundle_path = mismatched.runs.baseline.evidence_bundle_path;
  const issues = semanticComparisonIssues(mismatched, { artifactsBase: RUN_ROOT, root: ROOT });
  assert.ok(issues.length > 0, 'the mismatched run reference was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E4:')), `the mismatch was not caught as a non-distinct run reference: ${issues.join('; ')}`);
});

test('negative: a comparison that claims authority or a promotion effect is refused', () => {
  const promoted = clone(RESULT.comparison);
  promoted.status = 'ACTIVE';
  promoted.authority_granted = true;
  promoted.promotion_effect = 'ADOPTED';
  const issues = semanticComparisonIssues(promoted, { artifactsBase: RUN_ROOT, root: ROOT });
  assert.ok(issues.some((issue) => issue.startsWith('E1:')));
  assert.ok(issues.some((issue) => issue.startsWith('E2:')));
  assert.ok(issues.some((issue) => issue.startsWith('E3:')));
});

test('negative: a comparison that claims an improvement the evaluation rejected is refused', () => {
  const overclaimed = clone(RESULT.comparison);
  overclaimed.decision.outcome = 'IMPROVEMENT';
  overclaimed.decision.meets_success_bounds = true;
  const issues = semanticComparisonIssues(overclaimed, { artifactsBase: RUN_ROOT, root: ROOT });
  assert.ok(issues.some((issue) => issue.startsWith('E11:')), `the overclaim was not caught: ${issues.join('; ')}`);
  assert.ok(issues.some((issue) => issue.startsWith('E21:')), `the overclaim was not caught against the evaluation verdict: ${issues.join('; ')}`);
});

test('negative: a comparison without declared unknowns is refused', () => {
  const silent = clone(RESULT.comparison);
  silent.unknowns = [];
  const issues = semanticComparisonIssues(silent, { artifactsBase: RUN_ROOT, root: ROOT });
  assert.ok(issues.some((issue) => issue.startsWith('E9:')), `the silent comparison was accepted: ${issues.join('; ')}`);
});

test('negative: a comparison that cannot be re-derived against its artifacts is refused', () => {
  // Without an artifacts base no digest can be re-derived, so the record is
  // NOT verified. A validator that reported "valid" here would make the same
  // record look verified and unverified at once.
  const issues = semanticComparisonIssues(RESULT.comparison, { root: ROOT });
  assert.ok(issues.length > 0, 'an unverifiable comparison was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E24:')), `the missing re-derivation was not caught: ${issues.join('; ')}`);
});

test('negative: a comparison that carries a promotion token is refused, for every token', () => {
  const tokens = ['adopt_', 'skill-frontdoor-admission', 'canonical_owner', 'owner_approval', 'adoption_digest'];
  for (const token of tokens) {
    const promoted = clone(RESULT.comparison);
    promoted.scope_note = `${promoted.scope_note} ${token}`;
    const issues = semanticComparisonIssues(promoted, { artifactsBase: RUN_ROOT, root: ROOT });
    assert.ok(
      issues.some((issue) => issue.startsWith('E22:') && issue.includes(token)),
      `the promotion token ${token} was accepted: ${issues.join('; ')}`
    );
  }
});

test('negative: a run bundle whose analysis output does not match its configuration is refused', () => {
  const mismatchedRoot = tempDir('maws-ho01-mismatch-');
  fs.cpSync(RUN_ROOT, mismatchedRoot, { recursive: true });
  const bundleFile = path.join(mismatchedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path, 'execution-results.json');
  const executionResults = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
  for (const result of executionResults) {
    for (const output of result.outputs || []) {
      if (output.output_id === 'audit_report') {
        output.inline_payload.summary = 'a summary that the frozen definition never materializes';
      }
    }
  }
  fs.writeFileSync(bundleFile, `${JSON.stringify(executionResults, null, 2)}\n`);

  // The run evidence digest moves away from the recorded one, and the
  // analysis output digest no longer matches the materialized expectation.
  const movedDigest = runEvidenceDigest(path.join(mismatchedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path));
  assert.notEqual(movedDigest, RESULT.comparison.runs.baseline.evidence_digest);
  const movedOutputDigest = analysisOutputDigest(path.join(mismatchedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path));
  assert.notEqual(movedOutputDigest, RESULT.comparison.runs.baseline.analysis_output_digest);

  // And the validator refuses the record that cites the moved bundle.
  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: mismatchedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the mismatched run bundle was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the mismatch was not caught as an evidence-digest mismatch: ${issues.join('; ')}`);
  assert.ok(issues.some((issue) => issue.startsWith('E19:')), `the mismatch was not caught as an analysis-output mismatch: ${issues.join('; ')}`);
});

test('negative: a completion contract weakened after the fact is refused', () => {
  // The completion contract is part of the bundle and is covered by the
  // run-evidence digest: weakening a clause must move the digest.
  const tamperedRoot = tempDir('maws-ho01-tamper-contract-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const contractFile = path.join(tamperedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path, 'completion-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractFile, 'utf8'));
  contract.clauses.verification.required = false;
  contract.clauses.required_outputs = [];
  fs.writeFileSync(contractFile, `${JSON.stringify(contract, null, 2)}\n`);

  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the weakened completion contract was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the weakened contract was not caught: ${issues.join('; ')}`);
});

test('negative: an event appended to the run events after the fact is refused', () => {
  const tamperedRoot = tempDir('maws-ho01-tamper-events-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const eventsFile = path.join(tamperedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path, 'run-events.jsonl');
  fs.appendFileSync(eventsFile, `${JSON.stringify({ family: 'adversarial', type: 'FAKE_EVENT' })}\n`);

  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the appended run event was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the appended event was not caught: ${issues.join('; ')}`);
});

test('negative: an interaction session replaced after the fact is refused', () => {
  const tamperedRoot = tempDir('maws-ho01-tamper-session-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const sessionFile = path.join(tamperedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path, 'interaction-session.json');
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  session.transport = 'remote_api';
  session.identity = 'root';
  fs.writeFileSync(sessionFile, `${JSON.stringify(session, null, 2)}\n`);

  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the replaced interaction session was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the replaced session was not caught: ${issues.join('; ')}`);
});

test('negative: a run specification changed after the fact is refused', () => {
  const tamperedRoot = tempDir('maws-ho01-tamper-spec-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const specFile = path.join(tamperedRoot, 'specs', `${RESULT.comparison.runs.baseline.run_id}.json`);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  spec.work_request.context_depth = 'full_forged';
  fs.writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);

  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the changed run specification was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E25:')), `the changed specification was not caught: ${issues.join('; ')}`);
});

test('negative: a behavioral-eval record resealed with the correct algorithm is still refused', () => {
  // A record that is edited AND resealed with the correct algorithm carries
  // a self-consistent seal, so only the comparison record's own reference
  // digest can expose it. This is the forgery the seal alone cannot catch.
  const tamperedRoot = tempDir('maws-ho01-reseal-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const evalFile = path.join(tamperedRoot, RESULT.comparison.behavioral_evals.candidate.record_path);
  const record = JSON.parse(fs.readFileSync(evalFile, 'utf8'));
  record.verdict = 'IMPROVEMENT_PROVEN';
  const resealed = computeContentDigest(record);
  record.reproducibility.content_digest = resealed;
  fs.writeFileSync(evalFile, `${JSON.stringify(record, null, 2)}\n`);

  // The record's own seal is self-consistent again — only the comparison
  // record's reference still holds the original digest.
  assert.equal(computeContentDigest(record), resealed);
  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the resealed behavioral-eval record was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E16:')), `the reseal was not caught: ${issues.join('; ')}`);
});

test('negative: a forged improvement claim over a sealed rejection is refused', () => {
  // The comparison's SELF-DECLARED verdict, deltas and decision are flipped
  // to claim an improvement, while the SEALED behavioral-eval records still
  // carry the rejection. The digests of the cited artifacts are untouched by
  // such an edit, so only a binding to their CONTENT can catch it.
  const tamperedRoot = tempDir('maws-ho01-forgery-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const forged = clone(RESULT.comparison);
  forged.behavioral_evals.candidate.verdict = 'IMPROVEMENT_PROVEN';
  forged.metrics.output_assertion_pass_delta = 0.1875;
  forged.decision.outcome = 'IMPROVEMENT';
  forged.decision.meets_success_bounds = true;
  forged.decision.hypothesis_outcome = 'REFUTED';
  const issues = semanticComparisonIssues(forged, {
    artifactsBase: tamperedRoot,
    definition: loadDefinition(),
    root: ROOT
  });
  assert.ok(issues.length > 0, 'the forged improvement claim was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E26:')), `the forged verdict was not caught: ${issues.join('; ')}`);
  assert.ok(issues.some((issue) => issue.startsWith('E27:')), `the forged deltas were not caught: ${issues.join('; ')}`);
  assert.ok(issues.some((issue) => issue.startsWith('E11:')), `the forged decision was not caught: ${issues.join('; ')}`);
});

test('negative: a comparison whose decision was downgraded is refused', () => {
  // A measured regression re-labelled as "no improvement" decides nothing
  // the measurement supports, so the decision must be re-derivable.
  const tamperedRoot = tempDir('maws-ho01-downgrade-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const downgraded = clone(RESULT.comparison);
  downgraded.decision.outcome = 'NO_IMPROVEMENT';
  downgraded.decision.hypothesis_outcome = 'REFUTED';
  const issues = semanticComparisonIssues(downgraded, {
    artifactsBase: tamperedRoot,
    definition: loadDefinition(),
    root: ROOT
  });
  assert.ok(issues.length > 0, 'the downgraded decision was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E11:')), `the downgrade was not caught: ${issues.join('; ')}`);
});

test('negative: an unexpected file in the run bundle is refused, not ignored', () => {
  // A bundle file the projection does not cover would sit outside the
  // run-evidence digest; it must be refused rather than silently skipped.
  const tamperedRoot = tempDir('maws-ho01-extra-file-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const extra = path.join(tamperedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path, 'future-14th-file.json');
  fs.writeFileSync(extra, '{"field":"value"}');
  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the unexpected bundle file was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the unexpected file was not caught: ${issues.join('; ')}`);
});

test('negative: a semantic field named at is not dropped from the digest', () => {
  // The volatile key set must not contain a generic name: a semantic field
  // that happens to be called `at` stays bound to the digest.
  const tamperedRoot = tempDir('maws-ho01-at-field-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const harnessFile = path.join(tamperedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path, 'harness-context.json');
  const harness = JSON.parse(fs.readFileSync(harnessFile, 'utf8'));
  harness.at = 'semantic-anchor-v1';
  fs.writeFileSync(harnessFile, `${JSON.stringify(harness, null, 2)}\n`);
  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the semantic field named at was dropped from the digest');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the semantic field was not caught: ${issues.join('; ')}`);
});

test('negative: the instruction binding is inside the run-evidence digest', () => {
  // The instruction binding is part of the run bundle, so it must be part of
  // the digest: a run that was executed under another instruction state must
  // not compare equal to this one.
  const tamperedRoot = tempDir('maws-ho01-instruction-binding-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const bindingFile = path.join(tamperedRoot, RESULT.comparison.runs.baseline.evidence_bundle_path, 'instruction-binding.json');
  const binding = JSON.parse(fs.readFileSync(bindingFile, 'utf8'));
  binding.derived_effective_instruction_digest = `sha256:${'0'.repeat(64)}`;
  fs.writeFileSync(bindingFile, `${JSON.stringify(binding, null, 2)}\n`);
  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the instruction binding was dropped from the run-evidence digest');
  assert.ok(issues.some((issue) => issue.startsWith('E18:')), `the changed instruction binding was not caught: ${issues.join('; ')}`);
});

test('negative: a referenced behavioral-eval record that is not one is refused with a structured issue', () => {
  // A referenced record that is well-formed JSON but not a behavioral-eval
  // record must produce an issue, not crash the validator.
  const tamperedRoot = tempDir('maws-ho01-not-eval-');
  fs.cpSync(RUN_ROOT, tamperedRoot, { recursive: true });
  const evalFile = path.join(tamperedRoot, RESULT.comparison.behavioral_evals.candidate.record_path);
  fs.writeFileSync(evalFile, '{"hello":"world"}');
  const issues = semanticComparisonIssues(RESULT.comparison, { artifactsBase: tamperedRoot, root: ROOT });
  assert.ok(issues.length > 0, 'the malformed referenced record was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E16:')), `the malformed record was not refused with a structured issue: ${issues.join('; ')}`);
});

test('negative: a blocked candidate evaluation is never reported as a decided outcome', () => {
  const definition = loadDefinition();
  const metrics = { output_assertion_pass_delta: -0.1875, routing_accuracy_delta: 0, security_regressions: 0 };
  // The evaluation refused the comparison: it decided nothing.
  const decision = computeDecision(definition, metrics, 'BLOCKED');
  assert.equal(decision.outcome, 'BLOCKED');
  assert.equal(decision.meets_success_bounds, false);
  assert.equal(decision.hypothesis_outcome, 'INDETERMINATE');

  // And a record that reports a decided outcome for a blocked evaluation is
  // refused by the validator.
  const blocked = clone(RESULT.comparison);
  blocked.behavioral_evals.candidate.verdict = 'BLOCKED';
  blocked.decision.outcome = 'REGRESSION';
  blocked.decision.hypothesis_outcome = 'CONFIRMED';
  const issues = semanticComparisonIssues(blocked, { artifactsBase: RUN_ROOT, root: ROOT });
  assert.ok(issues.length > 0, 'the decided outcome on a blocked evaluation was accepted');
  assert.ok(issues.some((issue) => issue.startsWith('E21:')), `the blocked pairing was not caught: ${issues.join('; ')}`);
});
