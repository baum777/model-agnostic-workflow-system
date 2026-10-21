#!/usr/bin/env node
// HO-01 — local optimization comparison runner.
//
// Binds the existing MAWS run, eval and governance contracts into one
// evidence chain instead of introducing a new optimization platform:
//
//   experiment definition (exp_)      -> frozen inputs, hypothesis, bounds
//     -> runtime:run (x2, fixture)    -> two referenced runtime runs
//     -> run-skill-effectiveness-evals -> two behavioral-eval records (bev_)
//     -> comparison record (expcmp_)  -> FIXTURE_COMPARISON_ONLY
//
// The record is comparison evidence only. It grants no permission, promotes
// no skill, activates no runtime, replaces no approval decision and never
// selects a configuration for adoption. The comparison between a
// single-executor and a multi-executor orchestration is owned by slice S13;
// this runner does not perform it.
//
// Usage:
//   node scripts/tools/run-local-optimization-comparison.mjs \
//     --experiment evals/experiments/ho01-local-optimization/experiment.json \
//     --out <output-dir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRuntimeRun } from '../../runtime/cli/runtime-run.mjs';
import { loadCorpus, runSkillEffectivenessEval } from './run-skill-effectiveness-evals.mjs';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import {
  analysisOutputDigest,
  analysisOutputFromBundle as analysisOutputFromEvidenceBundle,
  canonicalJson,
  computeDecision,
  deriveComparisonMetrics,
  resolveInside,
  runEvidenceDigest,
  sha256Canonical,
  sha256File
} from './experiment-comparison-evidence.mjs';

// The decision rule lives in the shared module so that the runner which
// PRODUCES a decision and the validator which CHECKS one cannot drift apart.
export { computeDecision };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class ExperimentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExperimentError';
    this.code = code;
  }
}

export { canonicalJson, sha256Canonical, sha256File, runEvidenceDigest, analysisOutputDigest };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// --- experiment definition -------------------------------------------------

export function loadExperimentDefinition(experimentPath, root = REPO_ROOT) {
  const absolute = path.resolve(root, experimentPath);
  if (!fs.existsSync(absolute)) {
    throw new ExperimentError('EXPERIMENT_NOT_FOUND', `experiment definition not found: ${absolute}`);
  }
  const definition = readJson(absolute);
  const issues = validateInstanceAgainstContract(
    definition,
    'core/contracts/experiment-definition.schema.json',
    root
  );
  if (issues.length > 0) {
    throw new ExperimentError('EXPERIMENT_INVALID', `experiment definition fails its contract: ${issues.join('; ')}`);
  }
  return { definition, path: absolute };
}

/**
 * The single-variable invariant. Two configurations may differ in exactly one
 * declared dimension; a comparison that varies two dimensions is not a
 * single-variable experiment and is refused rather than reported as one.
 */
export function assertSingleDeclaredDimension(definition) {
  const [first, second] = definition.configurations;
  const baseline = first.role === 'BASELINE' ? first : second;
  const candidate = first.role === 'CANDIDATE' ? first : second;
  if (!baseline || !candidate) {
    throw new ExperimentError('CONFIGURATION_ROLES_INVALID', 'the experiment needs exactly one BASELINE and one CANDIDATE configuration');
  }
  const baselineKeys = Object.keys(baseline.dimensions).sort();
  const candidateKeys = Object.keys(candidate.dimensions).sort();
  if (canonicalJson(baselineKeys) !== canonicalJson(candidateKeys)) {
    throw new ExperimentError(
      'CONFIGURATION_DIMENSION_SET_MISMATCH',
      `the two configurations must declare the same dimension keys; baseline ${canonicalJson(baselineKeys)} vs candidate ${canonicalJson(candidateKeys)}`
    );
  }
  const changed = baselineKeys.filter((key) => baseline.dimensions[key] !== candidate.dimensions[key]);
  if (changed.length !== 1) {
    throw new ExperimentError(
      'CHANGED_DIMENSION_COUNT_INVALID',
      `exactly one dimension may differ between the compared configurations, found ${changed.length}: ${canonicalJson(changed)}`
    );
  }
  const declared = definition.declared_change;
  if (changed[0] !== declared.dimension_id) {
    throw new ExperimentError(
      'CHANGED_DIMENSION_UNDECLARED',
      `the changed dimension ${changed[0]} is not the declared dimension ${declared.dimension_id}`
    );
  }
  if (baseline.dimensions[declared.dimension_id] !== declared.baseline_value
    || candidate.dimensions[declared.dimension_id] !== declared.candidate_value) {
    throw new ExperimentError(
      'DECLARED_CHANGE_VALUES_MISMATCH',
      `the configuration values do not match the declared change: baseline ${baseline.dimensions[declared.dimension_id]} / candidate ${candidate.dimensions[declared.dimension_id]} vs declared ${declared.baseline_value} / ${declared.candidate_value}`
    );
  }
  if (declared.baseline_value === declared.candidate_value) {
    throw new ExperimentError('DECLARED_CHANGE_VALUES_MISMATCH', 'the declared baseline and candidate values must differ');
  }
  for (const value of [declared.baseline_value, declared.candidate_value]) {
    if (!declared.allowed_values.includes(value)) {
      throw new ExperimentError('DECLARED_CHANGE_VALUE_UNKNOWN', `declared value ${value} is not in allowed_values ${canonicalJson(declared.allowed_values)}`);
    }
  }
  return { baseline, candidate, dimensionId: declared.dimension_id };
}

/**
 * The frozen inputs. The corpus and the run-spec template are bound by byte
 * digest; a comparison against a moved or edited input is refused instead of
 * silently measuring something else.
 *
 * The corpus is bound in three layers, because it is the input the
 * behavioural evaluation actually measures:
 *
 *  1. the corpus directory itself must stay inside the repository — an
 *     absolute path, a ".." climb or a symlink out of the base is refused;
 *  2. every file the corpus manifest references (the family files and each
 *     variant's positive-case file) must itself be one of the digest-bound
 *     frozen inputs, so the measured corpus cannot contain a file the
 *     definition never declared;
 *  3. every one of those files must lie inside the corpus directory, so a
 *     manifest cannot point the evaluation at a case file outside the frozen
 *     corpus.
 */
export function assertFrozenInputsIntact(definition, root = REPO_ROOT) {
  // The corpus is bound first: it is the input the behavioral evaluation
  // actually measures, and its confinement must hold independently of
  // whether the rest of the frozen inputs are themselves intact.
  assertCorpusBound(definition, root);
  for (const file of definition.frozen_inputs.files) {
    // A declared input path must stay inside the repository: an absolute
    // path or a ".." climb is refused rather than followed.
    let absolute;
    try {
      absolute = resolveInside(root, file.path, 'FROZEN_INPUT_PATH_ESCAPES_ROOT');
    } catch (error) {
      throw new ExperimentError('FROZEN_INPUT_PATH_ESCAPES_ROOT', error.message);
    }
    if (!fs.existsSync(absolute)) {
      throw new ExperimentError('FROZEN_INPUT_MISSING', `frozen input missing: ${file.path}`);
    }
    const actual = sha256File(absolute);
    if (actual !== file.digest) {
      throw new ExperimentError(
        'FROZEN_INPUT_DIGEST_MISMATCH',
        `frozen input ${file.path} digest ${actual} does not match the declared ${file.digest}`
      );
    }
  }
  let templatePath;
  try {
    templatePath = resolveInside(root, definition.frozen_inputs.run_spec_template_ref, 'FROZEN_INPUT_PATH_ESCAPES_ROOT');
  } catch (error) {
    throw new ExperimentError('FROZEN_INPUT_PATH_ESCAPES_ROOT', error.message);
  }
  if (!fs.existsSync(templatePath)) {
    throw new ExperimentError('FROZEN_INPUT_MISSING', `run spec template missing: ${definition.frozen_inputs.run_spec_template_ref}`);
  }
}

/**
 * The corpus binding: the corpus directory is confined to the repository, and
 * every file the corpus manifest references is a declared, digest-bound
 * frozen input that lies inside the corpus directory.
 */
function assertCorpusBound(definition, root) {
  const corpusPath = definition.frozen_inputs.corpus_path;
  let corpusDir;
  try {
    corpusDir = resolveInside(root, corpusPath, 'FROZEN_INPUT_PATH_ESCAPES_ROOT');
  } catch (error) {
    throw new ExperimentError('FROZEN_INPUT_PATH_ESCAPES_ROOT', error.message);
  }
  if (!fs.existsSync(corpusDir)) {
    throw new ExperimentError('FROZEN_INPUT_MISSING', `corpus directory missing: ${corpusPath}`);
  }
  const manifestPath = path.join(corpusDir, 'corpus.json');
  if (!fs.existsSync(manifestPath)) {
    throw new ExperimentError('FROZEN_INPUT_MISSING', `corpus manifest missing: ${corpusPath}/corpus.json`);
  }
  const manifest = readJson(manifestPath);
  const declaredByPath = new Map(definition.frozen_inputs.files.map((file) => [file.path, file]));
  const referenced = [];
  for (const family of manifest.families || []) {
    if (family.file && family.file !== 'shared') {
      referenced.push(path.posix.join(corpusPath, family.file));
    }
  }
  for (const variant of Object.values(manifest.variants || {})) {
    if (variant && variant.positive_cases_file) {
      referenced.push(path.posix.join(corpusPath, variant.positive_cases_file));
    }
  }
  for (const relative of referenced) {
    const declared = declaredByPath.get(relative);
    if (!declared) {
      throw new ExperimentError(
        'FROZEN_INPUT_NOT_DECLARED',
        `the corpus manifest references ${relative}, which is not one of the declared, digest-bound frozen inputs`
      );
    }
    let absolute;
    try {
      absolute = resolveInside(root, relative, 'FROZEN_INPUT_PATH_ESCAPES_ROOT');
    } catch (error) {
      throw new ExperimentError('FROZEN_INPUT_PATH_ESCAPES_ROOT', error.message);
    }
    if (absolute !== corpusDir && !absolute.startsWith(corpusDir + path.sep)) {
      throw new ExperimentError(
        'FROZEN_INPUT_PATH_ESCAPES_ROOT',
        `the corpus manifest references ${relative}, which lies outside the corpus directory ${corpusPath}`
      );
    }
  }
}

// --- materialization -------------------------------------------------------

/**
 * Derive the observable output of a configuration from the frozen task and
 * the depth rule of the declared dimension value. The rule lives in the
 * definition, so the derived output is reproducible from the definition alone.
 */
export function materializeReport(task, depthValue) {
  const profile = task.depth_profiles[depthValue];
  if (!profile) {
    throw new ExperimentError('DEPTH_PROFILE_UNKNOWN', `no depth profile for dimension value ${depthValue}`);
  }
  const modules = task.modules.slice(0, profile.modules_analyzed);
  const findings = [];
  for (const module of modules) {
    const selected = profile.findings_per_module === 'all' ? module.findings : module.findings.slice(0, 1);
    findings.push(...selected);
  }
  const summary = profile.summary_scope === 'all_modules'
    ? `Analyzed ${modules.length} modules; ${findings.length} findings; all modules covered.`
    : `Analyzed ${modules.length} modules; ${findings.length} findings; reduced context depth.`;
  return {
    task_id: task.task_id,
    modules_analyzed: modules.map((module) => module.module_id),
    findings,
    summary
  };
}

function deepMerge(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  if (base === null || typeof base !== 'object' || Array.isArray(base)) {
    return patch;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = key in result ? deepMerge(result[key], value) : value;
  }
  return result;
}

/**
 * Derive the run specification of one configuration from the frozen template.
 * The run identity fields are derived from the configuration id, and the
 * analysis output is the materialized report — nothing else differs between
 * the two arms.
 */
export function materializeRunSpec(definition, configuration, template) {
  const dimensionValue = configuration.dimensions[definition.declared_change.dimension_id];
  const report = materializeReport(definition.task, dimensionValue);
  const runId = `run_ho01_${configuration.configuration_id}`;
  const spec = deepMerge(template, {
    run_id: runId,
    context_envelope: {
      envelope_id: `ctx_ho01_${configuration.configuration_id}`
    },
    interaction_session: {
      session_id: `sess_ho01_${configuration.configuration_id}`
    },
    work_request: {
      objective: definition.task.objective,
      bounded_payload: definition.task.bounded_payload,
      requiredOutputs: [
        {
          output_id: 'audit_report',
          artifact_ref: `artifacts/runtime-runs/${runId}/outputs/audit-report.json`
        }
      ]
    },
    harness_context: {
      context_id: `hctx_ho01_${configuration.configuration_id}_dev`,
      run_ref: runId
    },
    intake_bindings: {
      // The template's intake binding names the work unit of the reference
      // run; every derived arm binds its own work unit, otherwise the
      // execution-control path refuses to run.
      exec_unitera_execution_control_fixture: {
        work_unit_id: `wu_${runId}_root`
      }
    },
    executor_bindings: {
      exec_openrouter_glm: {
        result: {
          outputs: [
            {
              output_id: 'audit_report',
              inline_payload: report
            }
          ]
        }
      }
    }
  });
  return { spec, report, runId, dimensionValue };
}

// --- run evidence ----------------------------------------------------------
// The deterministic projection, the run-evidence digest and the
// analysis-output digest live in experiment-comparison-evidence.mjs so that
// the runner and the validator derive identical digests from identical
// artifacts.

/** The analysis output the run actually produced, not the one it declared. */
export function analysisOutputFromBundle(bundleDir) {
  try {
    return analysisOutputFromEvidenceBundle(bundleDir);
  } catch (error) {
    throw new ExperimentError('ANALYSIS_OUTPUT_MISSING', error.message);
  }
}

// --- comparison ------------------------------------------------------------

const UNKNOWN_METRICS = [
  {
    metric_id: 'model_quality',
    reason: 'The analysis executor ran on the fixture transport; no model was invoked, so real model quality is not measured.',
    unknown_reason_code: 'FIXTURE_TRANSPORT_NO_MODEL'
  },
  {
    metric_id: 'provider_cost',
    reason: 'Cost and token figures are declared by the executor binding in the run specification, not measured from a provider.',
    unknown_reason_code: 'DECLARED_NOT_MEASURED'
  },
  {
    metric_id: 'production_latency',
    reason: 'Latency figures are declared by the fixture lane; no live transport was exercised.',
    unknown_reason_code: 'FIXTURE_LANE_NOT_LIVE'
  },
  {
    metric_id: 'cross_model_parity',
    reason: 'Only one executor lane was exercised; the cross-model comparison is out of scope for this experiment.',
    unknown_reason_code: 'SINGLE_LANE_ONLY'
  },
  {
    metric_id: 'real_repository_behavior',
    reason: 'The task input is a frozen synthetic fixture, not a real repository; behaviour on real repositories is not measured.',
    unknown_reason_code: 'SYNTHETIC_FIXTURE_INPUT'
  }
];

function evalRef(record, recordPath) {
  return {
    eval_id: record.eval_id,
    content_digest: record.reproducibility.content_digest,
    verdict: record.verdict,
    corpus_digest: record.reproducibility.corpus_digest,
    record_path: recordPath
  };
}

export async function runLocalOptimizationComparison({
  experimentPath,
  outDir = null,
  repoRoot = REPO_ROOT,
  now = null
} = {}) {
  const root = repoRoot;
  const clock = now || (() => new Date().toISOString());
  if (!experimentPath) {
    throw new ExperimentError('USAGE', 'usage: run-local-optimization-comparison.mjs --experiment <experiment.json> [--out <dir>]');
  }
  // Without an explicit --out the chain writes into a fresh temporary
  // directory and prints its path: the CI gate leaves no artifact behind and
  // never reuses a previous run's evidence.
  const outputRoot = outDir
    ? path.resolve(root, outDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'maws-ho01-comparison-'));

  const { definition } = loadExperimentDefinition(experimentPath, root);
  assertFrozenInputsIntact(definition, root);
  const { baseline: baselineConfig, candidate: candidateConfig, dimensionId } = assertSingleDeclaredDimension(definition);

  // The run-spec template is a DECLARED, digest-bound input: it is read
  // through the same confinement every other declared path uses, so the
  // read can never leave the repository even if it were reached another way.
  let templatePath;
  try {
    templatePath = resolveInside(root, definition.frozen_inputs.run_spec_template_ref, 'FROZEN_INPUT_PATH_ESCAPES_ROOT');
  } catch (error) {
    throw new ExperimentError('FROZEN_INPUT_PATH_ESCAPES_ROOT', error.message);
  }
  const template = readJson(templatePath);
  const specDir = path.join(outputRoot, 'specs');
  const runsDir = path.join(outputRoot, 'runs');
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });

  // --- the two runtime runs, through the admitted local execution path.
  const runRefs = {};
  const bundlePaths = {};
  for (const configuration of [baselineConfig, candidateConfig]) {
    const { spec, report, runId, dimensionValue } = materializeRunSpec(definition, configuration, template);
    const specPath = path.join(specDir, `${runId}.json`);
    fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
    const bundleDir = path.join(runsDir, runId);
    if (fs.existsSync(bundleDir) && fs.readdirSync(bundleDir).length > 0) {
      throw new ExperimentError('RUN_DIR_EXISTS', `run bundle ${bundleDir} already exists and is not empty; move it aside (no silent reuse)`);
    }
    const { summary } = await runRuntimeRun({ specPath, outDir: bundleDir, repoRoot: root, now: clock });
    if (summary.status !== 'COMPLETED') {
      throw new ExperimentError('RUN_NOT_COMPLETED', `run ${runId} did not complete: ${summary.status} (${summary.blocking_reason || 'no blocking reason reported'})`);
    }
    // The run must have produced exactly the output the frozen definition
    // materializes for this configuration. A run whose evidence does not
    // match its declared configuration is not comparable evidence.
    const producedDigest = analysisOutputDigest(bundleDir);
    const expectedDigest = sha256Canonical(report);
    if (producedDigest !== expectedDigest) {
      throw new ExperimentError(
        'RUN_EVIDENCE_MISMATCH',
        `run ${runId} produced analysis output ${producedDigest}, which does not match the materialized expectation ${expectedDigest} for dimension value ${dimensionValue}`
      );
    }
    runRefs[configuration.role] = {
      run_id: runId,
      configuration_id: configuration.configuration_id,
      role: configuration.role,
      status: summary.status,
      spec_digest: sha256Canonical(spec),
      evidence_digest: runEvidenceDigest(bundleDir),
      analysis_output_digest: producedDigest,
      evidence_bundle_path: path.relative(outputRoot, bundleDir).split(path.sep).join('/'),
      transport: 'fixture',
      harness_context: 'development_harness',
      authority_grant: 'none'
    };
    bundlePaths[configuration.role] = bundleDir;
  }

  // --- the two behavioral-evaluation records, over the frozen corpus.
  // The corpus directory is confined to the repository here as well, at the
  // point of use: the frozen-input check above already bound it, and the
  // confinement at the point of use means the evaluation can never measure a
  // corpus outside the repository even if it were reached another way.
  let corpusDir;
  try {
    corpusDir = resolveInside(root, definition.frozen_inputs.corpus_path, 'FROZEN_INPUT_PATH_ESCAPES_ROOT');
  } catch (error) {
    throw new ExperimentError('FROZEN_INPUT_PATH_ESCAPES_ROOT', error.message);
  }
  const corpus = loadCorpus(corpusDir);
  const evalIdBase = `bev_${definition.experiment_id.replace(/^exp_/, '')}`;
  const { baselineRecord, candidateRecord, finalVerdict } = await runSkillEffectivenessEval({
    corpus,
    mode: definition.execution.behavioral_eval_mode,
    evalIdBase
  });
  if (!candidateRecord) {
    throw new ExperimentError('EVAL_BLOCKED', 'the behavioral evaluation produced no candidate record; the comparison cannot be produced');
  }
  const evalDir = path.join(outputRoot, 'evals');
  fs.mkdirSync(evalDir, { recursive: true });
  const baselineRecordPath = path.join(evalDir, `${baselineRecord.eval_id}.json`);
  const candidateRecordPath = path.join(evalDir, `${candidateRecord.eval_id}.json`);
  fs.writeFileSync(baselineRecordPath, `${JSON.stringify(baselineRecord, null, 2)}\n`);
  fs.writeFileSync(candidateRecordPath, `${JSON.stringify(candidateRecord, null, 2)}\n`);

  // The deltas come from the behavioral-evaluation comparison when the
  // candidate was comparable; a blocked candidate carries no comparison
  // object, and the delta is then derived from the two records' own
  // metrics over the identical frozen corpus.
  //
  // The deltas are derived by the SHARED derivation, so the runner that
  // produces them and the validator that re-derives them from the sealed
  // records cannot drift apart.
  const metrics = deriveComparisonMetrics(baselineRecord, candidateRecord);
  const decision = computeDecision(definition, metrics, candidateRecord.verdict);

  const comparison = {
    schema_version: '1.0.0',
    comparison_id: `expcmp_${definition.experiment_id.replace(/^exp_/, '')}_${definition.definition_version.replace(/\./g, '_')}`,
    experiment_id: definition.experiment_id,
    definition_version: definition.definition_version,
    definition_digest: sha256Canonical(definition),
    created_at: clock(),
    declared_change: {
      dimension_id: dimensionId,
      baseline_value: baselineConfig.dimensions[dimensionId],
      candidate_value: candidateConfig.dimensions[dimensionId],
      changed_dimension_count: 1
    },
    runs: {
      baseline: runRefs.BASELINE,
      candidate: runRefs.CANDIDATE
    },
    behavioral_evals: {
      baseline: evalRef(baselineRecord, path.relative(outputRoot, baselineRecordPath).split(path.sep).join('/')),
      candidate: evalRef(candidateRecord, path.relative(outputRoot, candidateRecordPath).split(path.sep).join('/'))
    },
    metrics,
    unknowns: UNKNOWN_METRICS,
    decision,
    status: 'FIXTURE_COMPARISON_ONLY',
    authority_granted: false,
    promotion_effect: 'NONE',
    scope_note: 'This comparison covers one declared dimension on a synthetic repository-analysis task over the fixture transport. It is comparison evidence only: it selects no configuration, promotes nothing and activates nothing. The comparison between a single-executor and a multi-executor orchestration is owned by slice S13 and is not performed here.'
  };

  const comparisonPath = path.join(outputRoot, 'comparison-record.json');
  fs.writeFileSync(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);

  return {
    comparison,
    comparisonPath,
    baselineRecord,
    candidateRecord,
    definition,
    finalVerdict,
    bundlePaths,
    outputRoot
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const readFlag = (name) => {
    const index = args.indexOf(name);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };
  try {
    const result = await runLocalOptimizationComparison({
      experimentPath: readFlag('--experiment'),
      outDir: readFlag('--out')
    });
    // The produced record is validated against its own contract and its
    // semantic invariants before the run is reported as successful: a chain
    // that cannot validate its own output has proven nothing.
    const { validateExperimentComparisonRecord } = await import('./validate-experiment-comparison.mjs');
    const issues = validateExperimentComparisonRecord(result.comparison, {
      artifactsBase: result.outputRoot,
      definition: result.definition,
      root: REPO_ROOT
    });
    if (issues.length > 0) {
      console.error(JSON.stringify({
        ok: false,
        error_code: 'COMPARISON_RECORD_INVALID',
        error: `the produced comparison does not validate: ${issues.join('; ')}`
      }, null, 2));
      process.exit(2);
    }
    console.log(JSON.stringify({
      ok: true,
      comparison_id: result.comparison.comparison_id,
      status: result.comparison.status,
      decision: result.comparison.decision,
      metrics: result.comparison.metrics,
      final_eval_verdict: result.finalVerdict,
      comparison_path: result.comparisonPath
    }, null, 2));
    process.exit(0);
  } catch (error) {
    const code = error.code || 'COMPARISON_FAILED';
    console.error(JSON.stringify({ ok: false, error_code: code, error: error.message }, null, 2));
    process.exit(2);
  }
}
