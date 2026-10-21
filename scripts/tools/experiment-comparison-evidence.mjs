// HO-01 — shared evidence primitives for the local optimization comparison.
//
// The canonicalization, the deterministic run-evidence projection and the
// analysis-output digest live here so that the runner and the validator
// derive exactly the same digests from the same artifacts. Pure functions
// over the filesystem; no authority semantics.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Same canonicalization as runtime/vnext/util.mjs (sorted keys, code-unit
// order, no whitespace) so digests are comparable across the runtime, the
// eval runner and the comparison chain.
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function sha256Canonical(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Resolve a declared relative path inside a base directory and refuse to
 * leave it. A path that is absolute, or that climbs out of the base with
 * "..", is rejected rather than followed — the same confinement the
 * skill-effectiveness corpus loader applies to its case files.
 *
 * The confinement is symlink-aware: a link INSIDE the base that points
 * outside it is refused as well, because following it would read exactly the
 * material the confinement exists to keep out. A path that does not exist
 * yet is judged lexically only (it cannot be a link to anything).
 */
export function resolveInside(baseDir, relativePath, code = 'PATH_ESCAPES_ROOT') {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error(`${code}: a non-empty relative path is required, got ${JSON.stringify(relativePath)}`);
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${code}: an absolute path is not allowed here: ${relativePath}`);
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`${code}: ${relativePath} resolves outside ${base}`);
  }
  // A symlink inside the base that points outside it would defeat the
  // confinement above, so the real path of the target is checked too.
  let realBase;
  let realResolved;
  try {
    realBase = fs.realpathSync(base);
    realResolved = fs.realpathSync(resolved);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      // The target does not exist: there is no link to follow, and the
      // lexical check above already confined the path.
      return resolved;
    }
    throw new Error(`${code}: ${relativePath} could not be resolved: ${error.message}`);
  }
  if (realResolved !== realBase && !realResolved.startsWith(realBase + path.sep)) {
    throw new Error(`${code}: ${relativePath} resolves outside ${base} through a symbolic link (${realResolved})`);
  }
  return resolved;
}

/**
 * The volatile fields of a run bundle, determined empirically: two independent
 * executions of the same frozen inputs differ in exactly these keys and
 * nowhere else. Everything else the bundle carries is semantic and is kept,
 * so a change to any of it changes the run-evidence digest.
 *
 * Every key here is unambiguously a wall-clock stamp. A bare `at` is NOT in
 * this set: it is only the timestamp of an intent-binding chain step, and a
 * semantic field that happens to be named `at` must not be dropped — that
 * exclusion is scoped to the chain context instead (see `CHAIN_CONTEXT`).
 */
export const VOLATILE_BUNDLE_KEYS = new Set([
  'occurred_at',
  'decided_at',
  'created_at',
  'started_at',
  'finished_at',
  'bound_at'
]);

/** The key under which an intent binding carries its execution chain. */
export const CHAIN_CONTEXT = 'chain';

/**
 * The files a run evidence bundle consists of. The nine mandatory files must
 * be present; the optional ones may be absent. A file outside this
 * inventory is REFUSED rather than ignored: a bundle file the projection does
 * not cover would sit outside the run-evidence digest, and a material change
 * to it would then be invisible to the validator.
 */
export const MANDATORY_BUNDLE_FILES = Object.freeze([
  'completion-decision.json',
  'context-envelope.json',
  'eligibility-decisions.json',
  'execution-results.json',
  'graph-v1.json',
  'harness-context.json',
  'routing-decisions.json',
  'verification-receipts.json',
  'work-unit.json'
]);

export const OPTIONAL_BUNDLE_FILES = Object.freeze([
  'completion-contract.json',
  'intent-bindings.json',
  'interaction-session.json',
  'instruction-binding.json',
  'run-events.jsonl'
]);

const KNOWN_BUNDLE_FILES = new Set([...MANDATORY_BUNDLE_FILES, ...OPTIONAL_BUNDLE_FILES]);

/**
 * A run-local identifier: a generated id of the shape <prefix>_<12 hex
 * digits>. The ids the runtime mints on every execution (att_, vr_, rd_,
 * cdec_, elig_, cand_, jevr_, route_) change between two runs of the same
 * frozen inputs; the ids the frozen template carries (wu_run_..., node_01_...,
 * exec_..., ctx_ho01_..., eib_reference_...) do not match this shape and are
 * therefore kept.
 */
export const VOLATILE_ID_PATTERN = /^[a-z]+_[0-9a-f]{12}$/;

/**
 * Strip the volatile fields from a bundle fragment, recursively.
 *
 * A field whose name is declared volatile is dropped, and a field whose value
 * is a run-local identifier is dropped with it. Everything else survives, so
 * the projection covers the semantic content of the whole bundle — including
 * the completion contract, the interaction session, the intent bindings'
 * rights transition and the run events — instead of a hand-picked subset.
 *
 * The `context` is the key the current value hangs under, so that a
 * context-specific exclusion (the `at` timestamp of an intent-binding chain
 * step) applies exactly there and nowhere else.
 */
export function projectVolatile(value, context = '') {
  if (Array.isArray(value)) {
    // A ref list mixes stable references with run-local ones; the run-local
    // ones are dropped so that the list stays comparable between two
    // executions, while a change to a stable reference still moves the
    // digest.
    return value
      .filter((item) => !(typeof item === 'string' && VOLATILE_ID_PATTERN.test(item)))
      .map((item) => projectVolatile(item, context));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const projected = {};
  for (const [key, entry] of Object.entries(value)) {
    if (VOLATILE_BUNDLE_KEYS.has(key)) continue;
    // The `at` key is volatile only as the timestamp of an intent-binding
    // chain step. Anywhere else it is a semantic field and is kept, so a
    // future field that happens to be named `at` cannot slip out of the
    // digest unnoticed.
    if (key === 'at' && context !== CHAIN_CONTEXT) {
      projected[key] = projectVolatile(entry, key);
      continue;
    }
    if (key === 'at') continue;
    if (typeof entry === 'string' && VOLATILE_ID_PATTERN.test(entry)) continue;
    projected[key] = projectVolatile(entry, key);
  }
  return projected;
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * Deterministic projection of a runtime run's evidence bundle.
 *
 * The raw bundle carries volatile identifiers (attempt ids, decision ids,
 * receipt ids) and wall-clock timestamps, so it cannot be digested directly:
 * a re-execution of identical frozen inputs would produce a different digest
 * and the comparison would not be reproducible. The projection therefore
 * removes exactly the volatile fields — the ones two executions of the same
 * frozen inputs demonstrably differ in — and keeps every other field of every
 * file in the bundle. The result is that the run-evidence digest binds the
 * whole bundle: a change to the completion contract, to the interaction
 * session, to an intent binding's rights transition, to the run events or to
 * any execution output changes the digest and is refused.
 */
export function projectRunEvidence(bundleDir) {
  // The bundle inventory is checked before anything is read: a file the
  // projection does not cover would sit outside the run-evidence digest, and
  // a material change to it would then be invisible to the validator. An
  // unexpected file is refused, not ignored.
  const present = fs.readdirSync(bundleDir).sort();
  const unexpected = present.filter((name) => !KNOWN_BUNDLE_FILES.has(name));
  if (unexpected.length > 0) {
    throw new Error(
      `the run evidence bundle carries ${unexpected.length} file(s) the projection does not cover: ${unexpected.join(', ')}`
    );
  }
  const missing = MANDATORY_BUNDLE_FILES.filter((name) => !present.includes(name));
  if (missing.length > 0) {
    throw new Error(`the run evidence bundle is missing ${missing.length} required file(s): ${missing.join(', ')}`);
  }
  const read = (name) => readJson(path.join(bundleDir, name));
  const optional = (name, fallback) => (
    fs.existsSync(path.join(bundleDir, name)) ? readJson(path.join(bundleDir, name)) : fallback
  );
  const executionResults = read('execution-results.json');
  const graph = read('graph-v1.json');
  const routingDecisions = read('routing-decisions.json');
  const eligibilityDecisions = read('eligibility-decisions.json');
  const verificationReceipts = read('verification-receipts.json');
  const completionDecision = read('completion-decision.json');
  const workUnit = read('work-unit.json');
  const harnessContext = read('harness-context.json');
  const intentBindings = optional('intent-bindings.json', []);
  const contextEnvelope = read('context-envelope.json');
  const completionContract = optional('completion-contract.json', null);
  const interactionSession = optional('interaction-session.json', null);
  const runEvents = fs.existsSync(path.join(bundleDir, 'run-events.jsonl'))
    ? readJsonl(path.join(bundleDir, 'run-events.jsonl'))
    : [];

  return {
    run_id: workUnit.run_ref,
    objective: workUnit.objective,
    harness_context: projectVolatile(harnessContext),
    work_unit: projectVolatile(workUnit),
    graph: projectVolatile(graph),
    routing: projectVolatile(routingDecisions),
    eligibility: projectVolatile(eligibilityDecisions),
    executions: projectVolatile(executionResults),
    verification: projectVolatile(verificationReceipts),
    completion: projectVolatile(completionDecision),
    intake: projectVolatile(intentBindings),
    context_envelope: projectVolatile(contextEnvelope),
    completion_contract: projectVolatile(completionContract),
    interaction_session: projectVolatile(interactionSession),
    run_events: projectVolatile(runEvents)
  };
}

export function runEvidenceDigest(bundleDir) {
  return sha256Canonical(projectRunEvidence(bundleDir));
}

/** The analysis output the run actually produced, not the one it declared. */
export function analysisOutputFromBundle(bundleDir) {
  const executionResults = readJson(path.join(bundleDir, 'execution-results.json'));
  const analysis = executionResults.find((result) => (
    (result.outputs || []).some((output) => output.output_id === 'audit_report')
  ));
  if (!analysis) {
    throw new Error(`no analysis output (audit_report) in the run bundle ${bundleDir}`);
  }
  const output = analysis.outputs.find((entry) => entry.output_id === 'audit_report');
  return output.inline_payload;
}

export function analysisOutputDigest(bundleDir) {
  return sha256Canonical(analysisOutputFromBundle(bundleDir));
}

/**
 * The canonical digest of a materialized run specification. The validator
 * re-derives it from the committed specification file, so a specification
 * that was changed after the comparison was produced is refused instead of
 * trusted.
 */
export function runSpecDigest(specPath) {
  return sha256Canonical(readJson(specPath));
}

// --- shared metrics and decision rule ---------------------------------------

export function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

export function accuracyRatio(matched, expected) {
  return expected === 0 ? 0 : round6(matched / expected);
}

/**
 * The measured deltas of a comparison, derived from two behavioral-evaluation
 * records. The runner derives them when it produces the comparison; the
 * validator derives them from the SEALED records, so a comparison that
 * declares a delta its own artifacts do not measure is refused.
 */
export function deriveComparisonMetrics(baselineRecord, candidateRecord) {
  const baselineRouting = accuracyRatio(
    baselineRecord.metrics.routing.decisions_matched,
    baselineRecord.metrics.routing.decisions_expected
  );
  const candidateRouting = accuracyRatio(
    candidateRecord.metrics.routing.decisions_matched,
    candidateRecord.metrics.routing.decisions_expected
  );
  const baselineOutput = accuracyRatio(
    baselineRecord.metrics.output.assertions_passed,
    baselineRecord.metrics.output.assertions_total
  );
  const candidateOutput = accuracyRatio(
    candidateRecord.metrics.output.assertions_passed,
    candidateRecord.metrics.output.assertions_total
  );
  return {
    routing_accuracy_delta: round6(candidateRouting - baselineRouting),
    output_assertion_pass_delta: round6(candidateOutput - baselineOutput),
    security_regressions: candidateRecord.security_gate.security_regressions
  };
}

/**
 * The decision rule of a comparison, in ONE place.
 *
 * The runner uses it to produce the decision; the validator uses it to
 * re-derive the decision from the sealed records and the definition's success
 * bounds, so a hand-edited decision cannot pass. One rule, two uses — a
 * producer and a checker that disagree would let the chain emit a decision
 * its own validator refuses.
 *
 * The rule: a security regression or a candidate evaluation that refused the
 * comparison blocks the comparison and decides nothing; a measured regression
 * in the primary metric OR in the routing accuracy is a regression (a quality
 * regression is never masked by a gain elsewhere); only a candidate that
 * meets the required improvement with no routing regression is an improvement;
 * everything else is no improvement.
 */
export function computeDecision(definition, metrics, candidateVerdict) {
  const bounds = definition.success_bounds;
  const primary = metrics[bounds.primary_metric];
  const routing = metrics.routing_accuracy_delta;
  if (metrics.security_regressions > bounds.security_regressions_allowed) {
    return {
      outcome: 'BLOCKED',
      meets_success_bounds: false,
      hypothesis_outcome: 'INDETERMINATE',
      reason: `The candidate recorded ${metrics.security_regressions} security regressions, above the allowed ${bounds.security_regressions_allowed}; the comparison is blocked and no outcome is decided.`
    };
  }
  // A candidate evaluation that refused the comparison decided nothing. Its
  // verdict is BLOCKED, so the comparison is blocked too: reporting a decided
  // regression on a comparison the evaluation never made would turn an
  // undecided measurement into a result.
  if (candidateVerdict === 'BLOCKED') {
    return {
      outcome: 'BLOCKED',
      meets_success_bounds: false,
      hypothesis_outcome: 'INDETERMINATE',
      reason: 'The candidate behavioral evaluation is BLOCKED and decided no comparison; the comparison is blocked and no outcome is decided.'
    };
  }
  const regressionFloor = -Math.abs(bounds.maximum_regression);
  if (primary < regressionFloor || routing < 0) {
    return {
      outcome: 'REGRESSION',
      meets_success_bounds: false,
      hypothesis_outcome: definition.hypothesis.predicted_outcome === 'REGRESSION_DETECTED' ? 'CONFIRMED' : 'REFUTED',
      reason: routing < 0
        ? `The candidate's routing accuracy delta is ${routing}, below zero; a quality regression is never masked by a gain in the primary metric ${bounds.primary_metric} (${primary}), so the candidate does not meet the success bounds.`
        : `The candidate's ${bounds.primary_metric} is ${primary}, below the allowed regression floor ${regressionFloor}; the candidate does not meet the success bounds.`
    };
  }
  if (primary >= bounds.minimum_improvement) {
    return {
      outcome: 'IMPROVEMENT',
      meets_success_bounds: true,
      hypothesis_outcome: definition.hypothesis.predicted_outcome === 'IMPROVEMENT_DETECTED' ? 'CONFIRMED' : 'REFUTED',
      reason: `The candidate's ${bounds.primary_metric} is ${primary}, at or above the required improvement ${bounds.minimum_improvement}, with a routing accuracy delta of ${routing}.`
    };
  }
  return {
    outcome: 'NO_IMPROVEMENT',
    meets_success_bounds: false,
    hypothesis_outcome: definition.hypothesis.predicted_outcome === 'NO_CHANGE_DETECTED' ? 'CONFIRMED' : 'REFUTED',
    reason: `The candidate's ${bounds.primary_metric} is ${primary}, below the required improvement ${bounds.minimum_improvement} and above the regression floor ${regressionFloor}, with a routing accuracy delta of ${routing}.`
  };
}
