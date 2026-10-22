// MAWS vNext — S10 cross-model comparison (MAWS-SII-TARGET-SPEC-001 v0.2.0,
// section 15 slice S10 — Cross-Model Optimization).
//
// Pure, dependency-free evaluation of qualified executor candidates measured
// against one bound task set and one bound success contract under one
// declared evidence class. The engine derives a comparison RECORD; it grants
// nothing: no adoption, no capability, no routing change, no provider
// activation, no authority (a preference is a measured statement, adoption is
// the owner's separate decision, qualification lives in the qualification
// contract, routing lives in the routing contracts — three separate
// surfaces).
//
// The gate order is fixed and fail-closed:
//   1. ADAPTER_BOUNDARY_GATE     — a model-specific optimization that is not
//                                   adapter-bound blocks the comparison.
//   2. EVIDENCE_COMPLETENESS_GATE— failed execution or missing comparison
//                                   metrics (quality, tokens, latency) block
//                                   the comparison: missing evidence fails
//                                   closed, for one candidate means for the
//                                   record.
//   3. COMPARABILITY_GATE        — a candidate measured against another task
//                                   set, corpus, success contract or evidence
//                                   class makes the record INCOMPARABLE; it
//                                   is never silently normalized.
//   4. CAPABILITY_GATE           — an incompatible capability makes the field
//                                   incomparable (different task class).
//   5. QUALIFICATION_GATE        — only QUALIFIED with carried evidence is
//                                   winner-capable; an unqualified candidate
//                                   never receives winner status.
//   6. REGRESSION_GATE           — the S9 integration: NO_REGRESSION keeps a
//                                   candidate capable; REGRESSION_DETECTED
//                                   excludes it; no record (or a BLOCKED S9
//                                   comparison) is missing evidence and
//                                   excludes it too.
//   7. SECURITY_ABSOLUTE_GATE    — a security regression count > 0 excludes a
//                                   candidate absolutely; no quality, cost or
//                                   latency gain compensates it.
//   8. STABILITY_GATE            — unstable repetitions exclude a candidate;
//                                   present-but-unusable evidence is
//                                   INCOMPARABLE, not BLOCKED.
//   9. PARETO_GATE               — cost and token optimization happens only
//                                   among the survivors: a preference requires
//                                   Pareto dominance over every other
//                                   winner-capable candidate. No implicit
//                                   success threshold exists: equal metrics
//                                   name no winner, and a single survivor of
//                                   the gates is not a comparison result.
import { FailClosedError, canonicalJson, nowIso, sha256Hex } from '../vnext/util.mjs';

export const CROSS_MODEL_COMPARISON_SCHEMA_VERSION = '1.0.0';
export const CROSS_MODEL_COMPARISON_CONTRACT = 'core/contracts/cross-model-comparison.schema.json';

export const OPTIMIZATION_GATES = Object.freeze([
  { gate: 'ADAPTER_BOUNDARY_GATE', order: 1, description: 'a model-specific optimization must live at an adapter boundary' },
  { gate: 'EVIDENCE_COMPLETENESS_GATE', order: 2, description: 'failed execution or missing comparison metrics block the record' },
  { gate: 'COMPARABILITY_GATE', order: 3, description: 'one task set, one corpus, one success contract, one evidence class' },
  { gate: 'CAPABILITY_GATE', order: 4, description: 'candidates of a different capability class are not comparable' },
  { gate: 'QUALIFICATION_GATE', order: 5, description: 'winner status requires an owner-qualified record with carried evidence' },
  { gate: 'REGRESSION_GATE', order: 6, description: 'the S9 regression gate: no regression record means not winner-capable' },
  { gate: 'SECURITY_ABSOLUTE_GATE', order: 7, description: 'a security regression excludes a candidate absolutely' },
  { gate: 'STABILITY_GATE', order: 8, description: 'unstable repetitions exclude a candidate' },
  { gate: 'PARETO_GATE', order: 9, description: 'preference requires Pareto dominance over every other winner-capable candidate' }
]);

export const EXCLUSION_REASONS = Object.freeze([
  'NOT_QUALIFIED',
  'QUALIFICATION_EVIDENCE_MISSING',
  'REGRESSION_DETECTED',
  'REGRESSION_EVIDENCE_MISSING',
  'SECURITY_REGRESSION',
  'UNSTABLE'
]);

const EPSILON = 1e-9;

function gt(a, b) { return a - b > EPSILON; }
function lt(a, b) { return b - a > EPSILON; }
function eq(a, b) { return Math.abs(a - b) <= EPSILON; }

function requireString(container, field, what) {
  const value = container?.[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new FailClosedError('XMC_INPUT_INVALID', `${what} requires a non-empty string field "${field}"`);
  }
  return value;
}

function validateInputs({ basis, candidates, optimizationBoundaries }) {
  if (!basis || typeof basis !== 'object') {
    throw new FailClosedError('XMC_INPUT_INVALID', 'an evaluation basis object is required');
  }
  requireString(basis, 'task_set_id', 'evaluation basis');
  requireString(basis, 'success_contract_id', 'evaluation basis');
  if (typeof basis.corpus_digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(basis.corpus_digest)) {
    throw new FailClosedError('XMC_INPUT_INVALID', 'evaluation basis requires a sha256 corpus_digest');
  }
  if (typeof basis.success_contract_digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(basis.success_contract_digest)) {
    throw new FailClosedError('XMC_INPUT_INVALID', 'evaluation basis requires a sha256 success_contract_digest');
  }
  if (!['offline_replay', 'fixture_replay', 'live_provider'].includes(basis.evidence_class)) {
    throw new FailClosedError('XMC_INPUT_INVALID', `unknown evidence class: ${basis.evidence_class}`);
  }
  if (basis.evidence_class === 'live_provider' && (typeof basis.live_authorization_ref !== 'string' || basis.live_authorization_ref.length === 0)) {
    throw new FailClosedError('XMC_INPUT_INVALID', 'live_provider evidence requires a live_authorization_ref to the owner budget/authorization record');
  }
  if (!Array.isArray(candidates) || candidates.length < 2) {
    throw new FailClosedError('XMC_INPUT_INVALID', 'a cross-model comparison needs at least two candidates');
  }
  const seen = new Set();
  for (const candidate of candidates) {
    requireString(candidate, 'candidate_id', 'candidate');
    requireString(candidate, 'executor_id', `candidate ${candidate.candidate_id}`);
    requireString(candidate, 'provider_id', `candidate ${candidate.candidate_id}`);
    requireString(candidate, 'model_id', `candidate ${candidate.candidate_id}`);
    if (seen.has(candidate.candidate_id)) {
      throw new FailClosedError('XMC_INPUT_INVALID', `duplicate candidate_id: ${candidate.candidate_id}`);
    }
    seen.add(candidate.candidate_id);
    if (!candidate.measured_basis || typeof candidate.measured_basis !== 'object') {
      throw new FailClosedError('XMC_INPUT_INVALID', `candidate ${candidate.candidate_id} requires a measured_basis block`);
    }
    if (!candidate.measurements || typeof candidate.measurements !== 'object') {
      throw new FailClosedError('XMC_INPUT_INVALID', `candidate ${candidate.candidate_id} requires a measurements block`);
    }
  }
  for (const entry of optimizationBoundaries ?? []) {
    if (!entry || typeof entry !== 'object' || typeof entry.model_specific !== 'boolean' || typeof entry.adapter_bound !== 'boolean') {
      throw new FailClosedError('XMC_INPUT_INVALID', 'an optimization boundary entry requires boolean model_specific and adapter_bound');
    }
  }
}

// The four comparison metrics. Instruction overhead and p50 are REPORTED
// (they explain a candidate) but do not decide the preference; the preference
// is decided by quality (higher) and cost, total tokens and tail latency
// (lower) — the Pareto dimensions of the spec's S10 bullet 5.
function comparisonMetrics(measurements) {
  return {
    quality: measurements?.quality?.task_success_rate ?? null,
    costUnits: measurements?.tokens?.cost_units ?? null,
    tokensTotal: measurements?.tokens?.total ?? null,
    latencyP95: measurements?.latency_ms?.p95 ?? null
  };
}

export function paretoDominates(preferred, other) {
  const a = comparisonMetrics(preferred.measurements);
  const b = comparisonMetrics(other.measurements);
  if (a.quality === null || a.costUnits === null || a.tokensTotal === null || a.latencyP95 === null) return false;
  if (b.quality === null || b.costUnits === null || b.tokensTotal === null || b.latencyP95 === null) return false;
  const qualityOk = a.quality > b.quality || eq(a.quality, b.quality);
  const costOk = a.costUnits < b.costUnits || eq(a.costUnits, b.costUnits);
  const tokensOk = a.tokensTotal < b.tokensTotal || eq(a.tokensTotal, b.tokensTotal);
  const latencyOk = a.latencyP95 < b.latencyP95 || eq(a.latencyP95, b.latencyP95);
  const strictlyBetter = gt(a.quality, b.quality) || lt(a.costUnits, b.costUnits) || lt(a.tokensTotal, b.tokensTotal) || lt(a.latencyP95, b.latencyP95);
  return qualityOk && costOk && tokensOk && latencyOk && strictlyBetter;
}

function dominanceReason(preferred, others) {
  const p = comparisonMetrics(preferred.measurements);
  let qualityStrictAll = true;
  let qualityEqualAll = true;
  let costStrictAll = true;
  let costEqualAll = true;
  for (const other of others) {
    const o = comparisonMetrics(other.measurements);
    qualityStrictAll = qualityStrictAll && gt(p.quality, o.quality);
    qualityEqualAll = qualityEqualAll && eq(p.quality, o.quality);
    const costStrict = lt(p.costUnits, o.costUnits) || lt(p.tokensTotal, o.tokensTotal) || lt(p.latencyP95, o.latencyP95);
    const costEqual = eq(p.costUnits, o.costUnits) && eq(p.tokensTotal, o.tokensTotal) && eq(p.latencyP95, o.latencyP95);
    costStrictAll = costStrictAll && costStrict;
    costEqualAll = costEqualAll && costEqual;
  }
  if (qualityStrictAll && costStrictAll) return 'FULL_DOMINANCE';
  if (qualityStrictAll && costEqualAll) return 'QUALITY_DOMINANCE';
  if (qualityEqualAll && costStrictAll) return 'COST_DOMINANCE';
  // Dominance held on a mix of dimensions across the field; the honest label
  // is that dominance was shown, with the dimensions named in the detail.
  return 'FULL_DOMINANCE';
}

function basisMismatch(basis, candidate) {
  const m = candidate.measured_basis;
  const taskSetMismatch = m.task_set_id !== basis.task_set_id || m.corpus_digest !== basis.corpus_digest;
  const contractMismatch = m.success_contract_id !== basis.success_contract_id || m.success_contract_digest !== basis.success_contract_digest;
  const classMismatch = m.evidence_class !== basis.evidence_class;
  return { taskSetMismatch, contractMismatch, classMismatch };
}

function classifyDifferences(candidates) {
  const field = candidates.length > 0 ? candidates : [];
  const entries = [];
  const distinct = (values) => new Set(values).size > 1;
  if (field.length <= 1) {
    return [{ dimension: 'NONE', detail: field.length === 1 ? `single candidate field (${field[0].candidate_id}); no cross-model difference to classify` : 'empty candidate field; no difference to classify' }];
  }
  if (distinct(field.map((c) => c.model_id))) {
    entries.push({ dimension: 'MODEL', detail: `distinct models: ${field.map((c) => `${c.candidate_id}=${c.model_id}`).join(', ')}` });
  }
  if (distinct(field.map((c) => c.provider_id))) {
    entries.push({ dimension: 'PROVIDER', detail: `distinct providers: ${field.map((c) => `${c.candidate_id}=${c.provider_id}`).join(', ')}` });
  }
  if (distinct(field.map((c) => `${c.executor_id}@${c.executor_version}`))) {
    entries.push({ dimension: 'EXECUTOR', detail: `distinct executors: ${field.map((c) => `${c.candidate_id}=${c.executor_id}@${c.executor_version}`).join(', ')}` });
  }
  if (distinct(field.map((c) => c.harness_context_ref))) {
    entries.push({ dimension: 'HARNESS', detail: `distinct harness contexts: ${field.map((c) => `${c.candidate_id}=${c.harness_context_ref}`).join(', ')}` });
  }
  if (entries.length === 0) {
    return [{ dimension: 'NONE', detail: 'the compared field is uniform across model, provider, executor and harness dimensions' }];
  }
  return entries;
}

/**
 * compareExecutors({ basis, candidates, optimizationBoundaries, evidenceRefs, now })
 *   -> a cross-model comparison record valid against
 *      core/contracts/cross-model-comparison.schema.json.
 *
 * Deterministic: the same inputs produce the same comparison_id and the same
 * verdict. Pure: no I/O, no clock (unless injected), no mutation of inputs.
 */
export function compareExecutors({ basis, candidates, optimizationBoundaries = [], evidenceRefs = [], now } = {}) {
  validateInputs({ basis, candidates, optimizationBoundaries });

  const createdAt = nowIso(now);
  const gates = [];
  const exclusions = [];
  const excludedIds = new Set();
  const exclude = (candidate, exclusion_reason, detail) => {
    exclusions.push({ candidate_id: candidate.candidate_id, exclusion_reason, detail });
    excludedIds.add(candidate.candidate_id);
  };
  const remaining = () => candidates.filter((c) => !excludedIds.has(c.candidate_id));

  const block = (outcome_reason, outcome_detail, gateName, gateOutcome = 'BLOCKED') => {
    gates.push({ gate: gateName, outcome: gateOutcome, detail: outcome_detail });
    return finish({ verdict: 'BLOCKED', outcome_reason, outcome_detail, preferred: null });
  };
  const incomparable = (outcome_reason, outcome_detail, gateName) => {
    gates.push({ gate: gateName, outcome: 'INCOMPARABLE', detail: outcome_detail });
    return finish({ verdict: 'INCOMPARABLE', outcome_reason, outcome_detail, preferred: null });
  };
  const pass = (gateName, detail) => {
    gates.push({ gate: gateName, outcome: 'PASS', detail });
  };
  const exclusionsApplied = (gateName, detail) => {
    gates.push({ gate: gateName, outcome: 'EXCLUSIONS_APPLIED', detail });
  };

  const comparisonId = `xmc_${sha256Hex(canonicalJson({
    schema_version: CROSS_MODEL_COMPARISON_SCHEMA_VERSION,
    basis,
    candidates,
    optimization_boundaries: optimizationBoundaries
  })).slice(0, 16)}`;

  function finish({ verdict, outcome_reason, outcome_detail, preferred }) {
    const winnerCapable = candidates.filter((c) => !excludedIds.has(c.candidate_id));
    const comparability = {
      // same_task_set is the IDENTITY of the task set; a differing corpus
      // digest is its own flag (same_corpus_digest), and either mismatch
      // makes the record INCOMPARABLE at the comparability gate.
      same_task_set: candidates.every((c) => c.measured_basis.task_set_id === basis.task_set_id),
      same_corpus_digest: candidates.every((c) => c.measured_basis.corpus_digest === basis.corpus_digest),
      same_success_contract: candidates.every((c) => !basisMismatch(basis, c).contractMismatch),
      same_evidence_class: candidates.every((c) => c.measured_basis.evidence_class === basis.evidence_class),
      capability_compatible: candidates.every((c) => c.capability?.compatible !== false)
    };
    return {
      schema_version: CROSS_MODEL_COMPARISON_SCHEMA_VERSION,
      comparison_id: comparisonId,
      created_at: createdAt,
      evaluation_basis: basis,
      candidates,
      applied_gates: gates,
      comparability,
      difference_classification: classifyDifferences(winnerCapable),
      optimization_boundaries: optimizationBoundaries,
      excluded_candidates: exclusions,
      verdict,
      outcome_reason,
      outcome_detail,
      preferred_candidate_id: preferred,
      adoption_authorized: false,
      authority_granted: false,
      routing_changed: false,
      runtime_activation: 'NONE',
      evidence_refs: evidenceRefs
    };
  }

  // Gate 1 — adapter boundary.
  const unbound = (optimizationBoundaries ?? []).filter((b) => b.model_specific && !b.adapter_bound);
  if (unbound.length > 0) {
    return block(
      'OPTIMIZATION_BOUNDARY_VIOLATION',
      `model-specific optimization entries without an adapter boundary: ${unbound.map((b) => b.detail).join('; ')} — model-specific optimization stays at adapter boundaries (spec S10)`,
      'ADAPTER_BOUNDARY_GATE'
    );
  }
  pass('ADAPTER_BOUNDARY_GATE', optimizationBoundaries.length === 0
    ? 'no declared optimization boundaries'
    : `${optimizationBoundaries.length} boundary entries; every model-specific entry is adapter-bound`);

  // Gate 2 — evidence completeness. A failed execution or a missing
  // comparison metric blocks the record: one candidate without evidence
  // means the comparison cannot look at what it must look at.
  for (const candidate of candidates) {
    if (candidate.execution?.status === 'FAILED') {
      return block(
        'PROVIDER_EXECUTION_FAILURE',
        `candidate ${candidate.candidate_id} did not complete its measured runs (${candidate.execution.failure_class ?? 'unclassified failure'}); a failed execution is missing evidence for the whole comparison`,
        'EVIDENCE_COMPLETENESS_GATE'
      );
    }
  }
  const missing = [];
  for (const candidate of candidates) {
    const m = comparisonMetrics(candidate.measurements);
    if (m.tokensTotal === null || m.costUnits === null) missing.push(`${candidate.candidate_id}:token`);
    if (m.latencyP95 === null) missing.push(`${candidate.candidate_id}:latency`);
    if (m.quality === null) missing.push(`${candidate.candidate_id}:quality`);
  }
  if (missing.length > 0) {
    const first = missing[0].split(':')[1];
    const reason = first === 'token' ? 'TOKEN_EVIDENCE_MISSING' : first === 'latency' ? 'LATENCY_EVIDENCE_MISSING' : 'QUALITY_EVIDENCE_MISSING';
    return block(
      reason,
      `missing comparison metrics (candidate:metric): ${missing.join(', ')} — missing evidence fails closed`,
      'EVIDENCE_COMPLETENESS_GATE'
    );
  }
  pass('EVIDENCE_COMPLETENESS_GATE', 'every candidate completed its runs and carries quality, token and tail-latency measurements');

  // Gate 3 — comparability. Mismatched bases are INCOMPARABLE, never
  // normalized: the check order is task set/corpus, then success contract,
  // then evidence class.
  const corpusMismatches = candidates.filter((c) => basisMismatch(basis, c).taskSetMismatch);
  if (corpusMismatches.length > 0) {
    return incomparable(
      'CORPUS_MISMATCH',
      `candidates measured against a different task set or corpus: ${corpusMismatches.map((c) => c.candidate_id).join(', ')} (declared ${basis.task_set_id}/${basis.corpus_digest.slice(0, 16)}…, measured ${corpusMismatches.map((c) => `${c.measured_basis.task_set_id}/${c.measured_basis.corpus_digest.slice(0, 16)}…`).join(', ')})`,
      'COMPARABILITY_GATE'
    );
  }
  const contractMismatches = candidates.filter((c) => basisMismatch(basis, c).contractMismatch);
  if (contractMismatches.length > 0) {
    return incomparable(
      'SUCCESS_CONTRACT_MISMATCH',
      `candidates measured against a different success contract: ${contractMismatches.map((c) => c.candidate_id).join(', ')}`,
      'COMPARABILITY_GATE'
    );
  }
  const classMismatches = candidates.filter((c) => basisMismatch(basis, c).classMismatch);
  if (classMismatches.length > 0) {
    return incomparable(
      'EVIDENCE_CLASS_MISMATCH',
      `candidates measured under a different evidence class: ${classMismatches.map((c) => `${c.candidate_id}=${c.measured_basis.evidence_class}`).join(', ')} (declared ${basis.evidence_class})`,
      'COMPARABILITY_GATE'
    );
  }
  pass('COMPARABILITY_GATE', `all candidates measured against ${basis.task_set_id} (${basis.corpus_digest.slice(0, 16)}…) under success contract ${basis.success_contract_id}, evidence class ${basis.evidence_class}`);

  // Gate 4 — capability compatibility.
  const incompatible = candidates.filter((c) => c.capability?.compatible === false);
  if (incompatible.length > 0) {
    return incomparable(
      'CAPABILITY_INCOMPATIBLE',
      `candidates missing capabilities the task set requires: ${incompatible.map((c) => `${c.candidate_id} (${(c.capability.missing ?? []).join(', ') || 'unspecified'})`).join(', ')} — a different capability class is a different task class`,
      'CAPABILITY_GATE'
    );
  }
  pass('CAPABILITY_GATE', 'every candidate carries the capabilities the task set requires');

  // Gate 5 — qualification. Winner status requires an owner-qualified record
  // WITH carried evidence; anything else is either excluded as not qualified
  // or excluded as missing evidence. If nobody remains and evidence was
  // missing anywhere, the record is BLOCKED (missing evidence fails closed).
  for (const candidate of candidates) {
    const q = candidate.qualification;
    if (q?.state === 'QUALIFIED' && Array.isArray(q.qualification_evidence_refs) && q.qualification_evidence_refs.length > 0) continue;
    if (q?.state === 'UNKNOWN' || (q?.state === 'QUALIFIED' && (q.qualification_evidence_refs ?? []).length === 0)) {
      exclude(candidate, 'QUALIFICATION_EVIDENCE_MISSING', `qualification state ${q?.state ?? 'ABSENT'} with no carried qualification evidence`);
    } else {
      exclude(candidate, 'NOT_QUALIFIED', `qualification state ${q?.state ?? 'ABSENT'} — an unqualified executor never receives winner status`);
    }
  }
  const afterQualification = remaining();
  if (afterQualification.length === 0 && exclusions.some((e) => e.exclusion_reason === 'QUALIFICATION_EVIDENCE_MISSING')) {
    return block('QUALIFICATION_EVIDENCE_MISSING', 'every candidate lacks qualification evidence (state UNKNOWN or QUALIFIED without carried evidence); cost or quality optimization between unproven executors is out of scope', 'QUALIFICATION_GATE');
  }
  if (afterQualification.length === 0) {
    exclusionsApplied('QUALIFICATION_GATE', `all candidates excluded as not qualified (${exclusions.map((e) => `${e.candidate_id}:${e.exclusion_reason}`).join(', ')})`);
  } else if (excludedIds.size > 0) {
    exclusionsApplied('QUALIFICATION_GATE', `qualified field: ${afterQualification.map((c) => c.candidate_id).join(', ')}; excluded: ${exclusions.map((e) => `${e.candidate_id}:${e.exclusion_reason}`).join(', ')}`);
  } else {
    pass('QUALIFICATION_GATE', `all candidates qualified with carried evidence: ${afterQualification.map((c) => c.candidate_id).join(', ')}`);
  }

  // Gate 6 — the S9 regression gate. Absence of an S9 verdict is NOT
  // cleanliness: no record (or a BLOCKED S9 comparison) excludes the
  // candidate as missing evidence.
  if (afterQualification.length > 0) {
    const before = excludedIds.size;
    for (const candidate of afterQualification) {
      const r = candidate.regression;
      if (r?.verdict === 'NO_REGRESSION' && typeof r.regression_comparison_id === 'string' && r.regression_comparison_id.length > 0) continue;
      if (r?.verdict === 'REGRESSION_DETECTED') {
        exclude(candidate, 'REGRESSION_DETECTED', `the S9 comparison ${r.regression_comparison_id ?? '(unbound)'} detected a regression`);
      } else {
        exclude(candidate, 'REGRESSION_EVIDENCE_MISSING', `no usable S9 regression verdict (verdict: ${r?.verdict ?? 'ABSENT'}); absence of a regression record is not cleanliness`);
      }
    }
    const afterRegression = remaining();
    const newExclusions = exclusions.length > before;
    if (afterRegression.length === 0 && exclusions.slice(before).some((e) => e.exclusion_reason === 'REGRESSION_EVIDENCE_MISSING')) {
      return block('REGRESSION_EVIDENCE_MISSING', 'no candidate carries a usable S9 regression comparison; optimization without regression evidence is out of scope', 'REGRESSION_GATE');
    }
    if (afterRegression.length === 0) {
      exclusionsApplied('REGRESSION_GATE', `all remaining candidates carry a detected regression (${exclusions.slice(before).map((e) => `${e.candidate_id}:${e.exclusion_reason}`).join(', ')})`);
    } else if (newExclusions) {
      exclusionsApplied('REGRESSION_GATE', `regression-free field: ${afterRegression.map((c) => c.candidate_id).join(', ')}; excluded: ${exclusions.slice(before).map((e) => `${e.candidate_id}:${e.exclusion_reason}`).join(', ')}`);
    } else {
      pass('REGRESSION_GATE', `every candidate carries an S9 NO_REGRESSION verdict: ${afterRegression.map((c) => c.regression.regression_comparison_id).join(', ')}`);
    }
  } else {
    gates.push({ gate: 'REGRESSION_GATE', outcome: 'EXCLUSIONS_APPLIED', detail: 'no qualified candidate remains; the regression gate has nothing to gate' });
  }

  // Gate 7 — security is absolute. A security regression excludes a candidate
  // regardless of quality, cost or latency gains; no compensation exists.
  const fieldBeforeSecurity = remaining();
  const securityBefore = exclusions.length;
  for (const candidate of fieldBeforeSecurity) {
    if ((candidate.measurements.security?.regression_count ?? 0) > 0) {
      exclude(candidate, 'SECURITY_REGRESSION', `security regression count ${candidate.measurements.security.regression_count} — absolute; no quality, cost or latency gain compensates it`);
    }
  }
  const afterSecurity = remaining();
  if (exclusions.length > securityBefore) {
    exclusionsApplied('SECURITY_ABSOLUTE_GATE', `security-clean field: ${afterSecurity.map((c) => c.candidate_id).join(', ') || '(none)'}; excluded absolutely: ${exclusions.slice(securityBefore).map((e) => `${e.candidate_id}:${e.exclusion_reason}`).join(', ')}`);
  } else if (fieldBeforeSecurity.length === 0) {
    gates.push({ gate: 'SECURITY_ABSOLUTE_GATE', outcome: 'EXCLUSIONS_APPLIED', detail: 'no candidate remains to gate on security' });
  } else {
    pass('SECURITY_ABSOLUTE_GATE', `no security regression on any measured candidate: ${fieldBeforeSecurity.map((c) => c.candidate_id).join(', ')}`);
  }

  // Gate 8 — stability. Present-but-unusable evidence is INCOMPARABLE, not
  // BLOCKED: the runs exist, they just disagree.
  const fieldBeforeStability = remaining();
  for (const candidate of fieldBeforeStability) {
    if (candidate.stability?.stable === false) {
      exclude(candidate, 'UNSTABLE', `repeated runs disagreed (${candidate.stability.spread ?? 'no spread recorded'} over ${candidate.stability.runs_reported} runs)`);
    }
  }
  const afterStability = remaining();
  if (afterStability.length === 0 && fieldBeforeStability.length > 0) {
    return incomparable('UNSTABLE_RESULTS', 'no candidate produced stable repeated measurements; the evidence exists but cannot support a preference', 'STABILITY_GATE');
  }
  if (exclusions.length > 0 && afterStability.length < fieldBeforeStability.length) {
    exclusionsApplied('STABILITY_GATE', `stable field: ${afterStability.map((c) => c.candidate_id).join(', ')}; excluded as unstable: ${exclusions.filter((e) => e.exclusion_reason === 'UNSTABLE').map((e) => e.candidate_id).join(', ')}`);
  } else if (fieldBeforeStability.length === 0) {
    gates.push({ gate: 'STABILITY_GATE', outcome: 'EXCLUSIONS_APPLIED', detail: 'no candidate remains to gate on stability' });
  } else {
    pass('STABILITY_GATE', `stable repeated measurements across the field: ${afterStability.map((c) => c.candidate_id).join(', ')}`);
  }

  // Gate 9 — Pareto. Cost and token optimization only among the survivors,
  // and a preference requires dominance over EVERY other winner-capable
  // candidate. A single survivor is not a comparison result, and equal
  // metrics name no winner: there is no implicit success threshold.
  const winnerCapable = remaining();
  if (winnerCapable.length < 2) {
    return incomparable('NO_WINNER_CAPABLE_CANDIDATE', `${winnerCapable.length === 1 ? `only ${winnerCapable[0].candidate_id} passed every gate` : 'no candidate passed every gate'}; a single survivor of the gates is not a comparison result and receives no implicit winner status`, 'PARETO_GATE');
  }
  const dominating = winnerCapable.filter((c) => winnerCapable.every((o) => o === c || paretoDominates(c, o)));
  if (dominating.length !== 1) {
    return incomparable('PARETO_NONDOMINANCE', `no winner-capable candidate dominates every other (${winnerCapable.map((c) => c.candidate_id).join(' vs ')}); quality, cost and latency trade off without a declared weighting, and the record does not invent one`, 'PARETO_GATE');
  }
  const preferred = dominating[0];
  const reason = dominanceReason(preferred, winnerCapable.filter((c) => c !== preferred));
  const others = winnerCapable.filter((c) => c !== preferred).map((c) => c.candidate_id).join(', ');
  gates.push({ gate: 'PARETO_GATE', outcome: 'PASS', detail: `${preferred.candidate_id} dominates ${others} on the measured quality/token/latency dimensions (${reason})` });
  return finish({ verdict: 'CANDIDATE_PREFERRED', outcome_reason: reason, outcome_detail: `${preferred.candidate_id} dominates ${others} on the same task set, corpus and success contract (${reason.toLowerCase()}); this preference is a measured statement — it adopts nothing, reroutes nothing and grants no authority`, preferred: preferred.candidate_id });
}
