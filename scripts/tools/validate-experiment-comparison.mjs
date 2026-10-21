#!/usr/bin/env node
// HO-01 — experiment comparison record validator.
//
// Shape validation against core/contracts/experiment-comparison.schema.json
// plus the fail-closed semantic invariants. The semantic layer re-derives
// every digest from the referenced artifacts, so a comparison whose run
// evidence or behavioral-evaluation record was manipulated after the fact is
// rejected instead of reported.
//
// The re-derivation is MANDATORY, not optional: a comparison that cannot be
// re-derived against its artifacts is not verified, and a validator that
// reports "valid" for a record it did not re-derive would make the same
// record look verified and unverified at once. The artifacts base is
// therefore a required input, and a missing one is an issue, not a silent
// skip.
//
// Usage:
//   node scripts/tools/validate-experiment-comparison.mjs <record.json> [...]
//     --artifacts-base <dir> [--definition <experiment.json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { computeContentDigest } from './run-skill-effectiveness-evals.mjs';
import {
  runEvidenceDigest,
  analysisOutputDigest,
  runSpecDigest,
  canonicalJson,
  computeDecision,
  deriveComparisonMetrics,
  resolveInside,
  sha256Canonical
} from './experiment-comparison-evidence.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/experiment-comparison.schema.json';

// A comparison record must never carry a promotion input. The contract
// forbids additional properties, so these tokens can only appear inside a
// string value; the check is the explicit guard that a FIXTURE_COMPARISON_ONLY
// record cannot be mistaken for a promotion-adoption input.
const PROMOTION_TOKENS = [
  'adopt_',
  'skill-frontdoor-admission',
  'canonical_owner',
  'owner_approval',
  'adoption_digest'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveArtifact(base, relativePath) {
  // A referenced artifact must stay inside the artifacts base: an absolute
  // path or a ".." climb is refused rather than followed.
  return resolveInside(base, relativePath, 'E23: referenced artifact path escapes the artifacts base');
}

/**
 * Semantic invariants of the comparison record. Returns a list of issue
 * strings; an empty list means the record is valid.
 */
export function semanticComparisonIssues(record, options = {}) {
  const issues = [];
  const { artifactsBase = null, root = REPO_ROOT, definition = null } = options;

  if (record.status !== 'FIXTURE_COMPARISON_ONLY') {
    issues.push(`E1: status must be FIXTURE_COMPARISON_ONLY, found ${record.status}`);
  }
  if (record.authority_granted !== false) {
    issues.push(`E2: authority_granted must be false, found ${JSON.stringify(record.authority_granted)}`);
  }
  if (record.promotion_effect !== 'NONE') {
    issues.push(`E3: promotion_effect must be NONE, found ${record.promotion_effect}`);
  }
  if (record.declared_change.changed_dimension_count !== 1) {
    issues.push(`E8: changed_dimension_count must be 1, found ${record.declared_change.changed_dimension_count}`);
  }
  if (record.declared_change.baseline_value === record.declared_change.candidate_value) {
    issues.push('E8: the declared baseline and candidate values must differ');
  }

  const baselineRun = record.runs.baseline;
  const candidateRun = record.runs.candidate;
  if (baselineRun.run_id === candidateRun.run_id) {
    issues.push(`E4: the comparison must reference two distinct runs, both are ${baselineRun.run_id}`);
  }
  if (baselineRun.role !== 'BASELINE' || candidateRun.role !== 'CANDIDATE') {
    issues.push(`E5: run roles must be BASELINE and CANDIDATE, found ${baselineRun.role} and ${candidateRun.role}`);
  }
  for (const [label, run] of [['baseline', baselineRun], ['candidate', candidateRun]]) {
    if (run.transport !== 'fixture') {
      issues.push(`E7: the ${label} run must use the fixture transport, found ${run.transport}`);
    }
    if (run.harness_context !== 'development_harness') {
      issues.push(`E6: the ${label} run must carry the development_harness context, found ${run.harness_context}`);
    }
    if (run.authority_grant !== 'none') {
      issues.push(`E6: the ${label} run must carry authority_grant none, found ${run.authority_grant}`);
    }
  }

  if (!Array.isArray(record.unknowns) || record.unknowns.length === 0) {
    issues.push('E9: a comparison must name what it did not measure; unknowns must not be empty');
  } else {
    for (const unknown of record.unknowns) {
      if (!unknown.metric_id || !unknown.reason || !unknown.unknown_reason_code) {
        issues.push(`E9: every unknown needs metric_id, reason and unknown_reason_code; found ${canonicalJson(unknown)}`);
      }
    }
  }

  const metrics = record.metrics;
  const decision = record.decision;
  if (metrics.security_regressions > 0 && decision.outcome !== 'BLOCKED') {
    issues.push(`E10: ${metrics.security_regressions} security regressions force the outcome BLOCKED, found ${decision.outcome}`);
  }
  if (decision.outcome === 'IMPROVEMENT') {
    if (metrics.output_assertion_pass_delta < 0 || metrics.routing_accuracy_delta < 0) {
      issues.push(`E11: an IMPROVEMENT outcome requires non-negative deltas, found output ${metrics.output_assertion_pass_delta} and routing ${metrics.routing_accuracy_delta}`);
    }
  }
  if (decision.outcome === 'REGRESSION') {
    if (metrics.output_assertion_pass_delta >= 0 && metrics.routing_accuracy_delta >= 0) {
      issues.push('E11: a REGRESSION outcome requires a negative measured delta');
    }
  }
  if (decision.outcome === 'NO_IMPROVEMENT') {
    if (metrics.output_assertion_pass_delta < 0 || metrics.routing_accuracy_delta < 0) {
      issues.push(`E11: a NO_IMPROVEMENT outcome requires non-negative measured deltas, found output ${metrics.output_assertion_pass_delta} and routing ${metrics.routing_accuracy_delta}`);
    }
  }
  const baselineEval = record.behavioral_evals.baseline;
  const candidateEval = record.behavioral_evals.candidate;
  // A BLOCKED outcome is reached for two reasons: a security regression, or a
  // candidate evaluation that refused the comparison. A blocked evaluation
  // decides nothing, so it can never be reported as a decided outcome.
  const blockedEvaluation = candidateEval.verdict === 'BLOCKED';
  if (decision.outcome === 'BLOCKED' && metrics.security_regressions === 0 && !blockedEvaluation) {
    issues.push('E11: a BLOCKED outcome requires a security regression or a blocked candidate evaluation');
  }
  if (decision.outcome !== 'BLOCKED' && (metrics.security_regressions > 0 || blockedEvaluation)) {
    issues.push(`E11: ${metrics.security_regressions} security regressions${blockedEvaluation ? ' and a blocked candidate evaluation' : ''} force the outcome BLOCKED, found ${decision.outcome}`);
  }
  if (decision.meets_success_bounds !== (decision.outcome === 'IMPROVEMENT')) {
    issues.push(`E12: meets_success_bounds must be true only for an IMPROVEMENT outcome, found ${decision.meets_success_bounds} for ${decision.outcome}`);
  }

  if (baselineEval.verdict !== 'BASELINE_RECORDED') {
    issues.push(`E14: the baseline behavioral-eval record must carry BASELINE_RECORDED, found ${baselineEval.verdict}`);
  }
  if (candidateEval.verdict === 'BASELINE_RECORDED') {
    issues.push(`E15: the candidate behavioral-eval record must not carry BASELINE_RECORDED, found ${candidateEval.verdict}`);
  }
  if (candidateEval.verdict === 'IMPROVEMENT_REJECTED' && decision.outcome === 'IMPROVEMENT') {
    issues.push('E21: the comparison reports an IMPROVEMENT the behavioral evaluation rejected');
  }
  if (candidateEval.verdict === 'IMPROVEMENT_PROVEN' && decision.outcome === 'REGRESSION') {
    issues.push('E21: the comparison reports a REGRESSION the behavioral evaluation disproved');
  }
  if (blockedEvaluation && decision.outcome !== 'BLOCKED') {
    issues.push(`E21: the candidate behavioral evaluation is BLOCKED and decided no comparison, but the comparison reports ${decision.outcome}`);
  }
  if (blockedEvaluation && decision.hypothesis_outcome !== 'INDETERMINATE') {
    issues.push(`E21: a blocked candidate evaluation leaves the hypothesis INDETERMINATE, found ${decision.hypothesis_outcome}`);
  }

  if (!artifactsBase) {
    issues.push('E24: no artifacts base was supplied, so no digest could be re-derived from the referenced artifacts; a comparison that cannot be re-derived is not verified');
  } else {
    const referencedEvals = {};
    for (const [label, evalRef] of [['baseline', baselineEval], ['candidate', candidateEval]]) {
      let recordPath;
      try {
        recordPath = resolveArtifact(artifactsBase, evalRef.record_path);
      } catch (error) {
        issues.push(`E23: the ${label} behavioral-eval record path ${evalRef.record_path} escapes the artifacts base: ${error.message}`);
        continue;
      }
      if (!fs.existsSync(recordPath)) {
        issues.push(`E16: the ${label} behavioral-eval record referenced at ${evalRef.record_path} does not exist`);
        continue;
      }
      let referenced;
      try {
        referenced = readJson(recordPath);
      } catch (error) {
        issues.push(`E16: the ${label} behavioral-eval record at ${evalRef.record_path} cannot be read: ${error.message}`);
        continue;
      }
      referencedEvals[label] = referenced;
      if (referenced.eval_id !== evalRef.eval_id) {
        issues.push(`E17: the ${label} behavioral-eval record carries eval_id ${referenced.eval_id}, the comparison references ${evalRef.eval_id}`);
      }
      // The declared verdict is bound to the SEALED artifact. A comparison
      // that claims a verdict its own behavioral-eval record does not carry
      // is refused, so the verdict cannot be edited to manufacture an
      // improvement the evaluation rejected.
      if (referenced.verdict !== evalRef.verdict) {
        issues.push(`E26: the ${label} behavioral-eval record carries verdict ${referenced.verdict}, the comparison references ${evalRef.verdict}`);
      }
      let actualDigest;
      try {
        actualDigest = computeContentDigest(referenced);
      } catch (error) {
        // A referenced record that is well-formed JSON but not a behavioral
        // evaluation record must be refused with a structured issue, not
        // crash the validator.
        issues.push(`E16: the ${label} behavioral-eval record at ${evalRef.record_path} cannot be sealed: ${error.message}`);
        continue;
      }
      if (actualDigest !== evalRef.content_digest) {
        issues.push(`E16: the ${label} behavioral-eval record fails its own content seal; declared ${evalRef.content_digest}, recomputed ${actualDigest} (the record was edited after sealing)`);
      }
      if (!referenced.reproducibility || referenced.reproducibility.content_digest !== evalRef.content_digest) {
        issues.push(`E16: the ${label} behavioral-eval record's own content_digest ${referenced.reproducibility && referenced.reproducibility.content_digest} does not match the referenced ${evalRef.content_digest}`);
      }
      if (!referenced.reproducibility || referenced.reproducibility.corpus_digest !== evalRef.corpus_digest) {
        issues.push(`E16: the ${label} behavioral-eval record's corpus digest does not match the referenced corpus digest`);
      }
    }
    // The measured deltas are bound to the SEALED behavioral-eval records,
    // and the decision is re-derived from them together with the definition's
    // success bounds. A comparison whose self-declared verdict, deltas or
    // decision disagree with the artifacts it cites is refused — the digests
    // alone would not notice, because the digests of the cited artifacts are
    // untouched by such an edit.
    if (referencedEvals.baseline && referencedEvals.candidate) {
      let derived;
      try {
        derived = deriveComparisonMetrics(referencedEvals.baseline, referencedEvals.candidate);
      } catch (error) {
        issues.push(`E27: the measured deltas cannot be derived from the sealed behavioral-eval records: ${error.message}`);
      }
      if (derived) {
        for (const key of ['routing_accuracy_delta', 'output_assertion_pass_delta', 'security_regressions']) {
          if (record.metrics[key] !== derived[key]) {
            issues.push(`E27: the comparison declares ${key} ${record.metrics[key]}, the sealed behavioral-eval records measure ${derived[key]}`);
          }
        }
        if (definition) {
          const expected = computeDecision(definition, derived, referencedEvals.candidate.verdict);
          if (expected.outcome !== decision.outcome) {
            issues.push(`E11: the comparison reports ${decision.outcome}, the sealed metrics and the definition's success bounds derive ${expected.outcome}`);
          }
        } else {
          issues.push('E28: no experiment definition was supplied, so the decision could not be re-derived from the sealed metrics and the success bounds');
        }
      }
    }
    for (const [label, run] of [['baseline', baselineRun], ['candidate', candidateRun]]) {
      // The materialized run specification is committed next to the bundle at
      // specs/<run_id>.json. Its digest is re-derived here, so a
      // specification that was changed after the comparison was produced is
      // refused instead of trusted.
      let specPath;
      try {
        specPath = resolveArtifact(artifactsBase, path.posix.join('specs', `${run.run_id}.json`));
      } catch (error) {
        issues.push(`E25: the ${label} run specification path escapes the artifacts base: ${error.message}`);
        continue;
      }
      if (!fs.existsSync(specPath)) {
        issues.push(`E25: the ${label} run specification referenced at specs/${run.run_id}.json does not exist`);
        continue;
      }
      let actualSpecDigest;
      try {
        actualSpecDigest = runSpecDigest(specPath);
      } catch (error) {
        issues.push(`E25: the ${label} run specification cannot be read: ${error.message}`);
        continue;
      }
      if (actualSpecDigest !== run.spec_digest) {
        issues.push(`E25: the ${label} run specification digest ${run.spec_digest} does not match the recomputed ${actualSpecDigest}; the specification was changed after the comparison was produced`);
      }
      let bundleDir;
      try {
        bundleDir = resolveArtifact(artifactsBase, run.evidence_bundle_path);
      } catch (error) {
        issues.push(`E23: the ${label} run evidence bundle path ${run.evidence_bundle_path} escapes the artifacts base: ${error.message}`);
        continue;
      }
      if (!fs.existsSync(bundleDir)) {
        issues.push(`E18: the ${label} run evidence bundle referenced at ${run.evidence_bundle_path} does not exist`);
        continue;
      }
      let actualEvidenceDigest;
      try {
        actualEvidenceDigest = runEvidenceDigest(bundleDir);
      } catch (error) {
        issues.push(`E18: the ${label} run evidence bundle cannot be projected: ${error.message}`);
        continue;
      }
      if (actualEvidenceDigest !== run.evidence_digest) {
        issues.push(`E18: the ${label} run evidence digest ${run.evidence_digest} does not match the recomputed ${actualEvidenceDigest}; the bundle was changed after the comparison was produced`);
      }
      let actualOutputDigest;
      try {
        actualOutputDigest = analysisOutputDigest(bundleDir);
      } catch (error) {
        issues.push(`E19: the ${label} run analysis output cannot be read: ${error.message}`);
        continue;
      }
      if (actualOutputDigest !== run.analysis_output_digest) {
        issues.push(`E19: the ${label} run analysis output digest ${run.analysis_output_digest} does not match the recomputed ${actualOutputDigest}`);
      }
    }
  }

  if (definition) {
    if (definition.experiment_id !== record.experiment_id) {
      issues.push(`E13: the comparison references experiment ${record.experiment_id}, the definition carries ${definition.experiment_id}`);
    }
    if (definition.definition_version !== record.definition_version) {
      issues.push(`E13: the comparison references definition version ${record.definition_version}, the definition carries ${definition.definition_version}`);
    }
    const actualDefinitionDigest = sha256Canonical(definition);
    if (actualDefinitionDigest !== record.definition_digest) {
      issues.push(`E13: the comparison references definition digest ${record.definition_digest}, the recomputed digest is ${actualDefinitionDigest}`);
    }
    const predicted = definition.hypothesis.predicted_outcome;
    const expectedHypothesisOutcome = decision.outcome === 'BLOCKED'
      ? 'INDETERMINATE'
      : (predicted === 'IMPROVEMENT_DETECTED' && decision.outcome === 'IMPROVEMENT')
        || (predicted === 'NO_CHANGE_DETECTED' && decision.outcome === 'NO_IMPROVEMENT')
        || (predicted === 'REGRESSION_DETECTED' && decision.outcome === 'REGRESSION')
        ? 'CONFIRMED'
        : 'REFUTED';
    if (decision.hypothesis_outcome !== expectedHypothesisOutcome) {
      issues.push(`E13: the hypothesis outcome must be ${expectedHypothesisOutcome} for the observed outcome ${decision.outcome} and the predicted ${predicted}, found ${decision.hypothesis_outcome}`);
    }
  }

  const serialized = canonicalJson(record);
  for (const token of PROMOTION_TOKENS) {
    if (serialized.includes(token)) {
      issues.push(`E22: the comparison record carries the promotion token ${token}; a FIXTURE_COMPARISON_ONLY record must not carry a promotion input`);
    }
  }

  return issues;
}

export function validateExperimentComparisonRecord(record, options = {}) {
  const root = options.root || REPO_ROOT;
  const issues = validateInstanceAgainstContract(record, SCHEMA_PATH, root);
  if (issues.length === 0 && record && typeof record === 'object') {
    issues.push(...semanticComparisonIssues(record, { ...options, root }));
  }
  return issues;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  // A relative path on the command line is relative to the CALLER's working
  // directory, as every command-line tool behaves. Anchoring it at the
  // repository root instead would validate the repository's copy while the
  // caller believes their own copy was checked.
  const resolveOperatorPath = (value) => (
    path.isAbsolute(value) ? value : path.resolve(process.cwd(), value)
  );
  const readFlag = (name) => {
    const index = args.indexOf(name);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };
  const artifactsBase = readFlag('--artifacts-base');
  const definitionPath = readFlag('--definition');
  const files = args.filter((arg, index) => (
    !arg.startsWith('--')
    && !(index > 0 && (args[index - 1] === '--artifacts-base' || args[index - 1] === '--definition'))
  ));
  // A validator that checks nothing must not report success. The artifacts
  // base is required (the digests are re-derived from it) and at least one
  // record must be named.
  if (!artifactsBase) {
    console.error('usage: validate-experiment-comparison.mjs <record.json> [...] --artifacts-base <dir> [--definition <experiment.json>]');
    console.error('the artifacts base is required: without it no digest can be re-derived from the referenced artifacts');
    process.exit(2);
  }
  if (files.length === 0) {
    console.error('usage: validate-experiment-comparison.mjs <record.json> [...] --artifacts-base <dir> [--definition <experiment.json>]');
    console.error('no comparison record was named; nothing would be checked');
    process.exit(2);
  }
  let definition = null;
  if (definitionPath) {
    definition = readJson(resolveOperatorPath(definitionPath));
  }
  const resolvedBase = resolveOperatorPath(artifactsBase);
  let checked = 0;
  let failures = 0;
  for (const arg of files) {
    const filePath = resolveOperatorPath(arg);
    let record;
    try {
      record = readJson(filePath);
    } catch (error) {
      console.error(`${filePath}: cannot read or parse (${error.message})`);
      failures += 1;
      continue;
    }
    checked += 1;
    const issues = validateExperimentComparisonRecord(record, { artifactsBase: resolvedBase, definition });
    if (issues.length > 0) {
      failures += 1;
      console.error(`${filePath}: ${issues.join('; ')}`);
    } else {
      // The RESOLVED path is reported, so a reader can see exactly which
      // object was checked and never has to infer it.
      console.log(`${filePath}: valid`);
    }
  }
  console.log(`experiment-comparison records: ${checked} checked, ${failures} invalid`);
  process.exit(failures === 0 ? 0 : 1);
}
