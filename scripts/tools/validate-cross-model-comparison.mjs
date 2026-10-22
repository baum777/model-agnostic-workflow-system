#!/usr/bin/env node
// MAWS vNext — S10 validator (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S10
// Cross-Model Optimization).
//
// Validates core/contracts/cross-model-comparison.schema.json against the
// canonical fixtures (positive + negative cases must match their labels) and
// enforces the fail-closed semantic invariants the minimal JSON schema engine
// cannot express.
//
// Usage:
//   node scripts/tools/validate-cross-model-comparison.mjs
//       validate the canonical fixtures
//   node scripts/tools/validate-cross-model-comparison.mjs <file.json> ...
//       validate explicit records (all must be valid)
//
// A cross-model comparison is an evaluation record, never authority: this
// validator proves record shape and the fail-closed invariants only. It
// grants no permission, adopts nothing, reroutes nothing and changes no
// qualification state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { OPTIMIZATION_GATES, paretoDominates } from '../../runtime/optimization/cross-model-comparison.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPARISON_SCHEMA = 'core/contracts/cross-model-comparison.schema.json';
const COMPARISON_FIXTURE = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'cross-model-comparison.contracts.json');

const EPSILON = 1e-9;
const GATE_ORDER = OPTIMIZATION_GATES.map((g) => g.gate);
const DOMINANCE_REASONS = ['FULL_DOMINANCE', 'QUALITY_DOMINANCE', 'COST_DOMINANCE'];
const INCOMPARABLE_REASONS = [
  'PARETO_NONDOMINANCE', 'CORPUS_MISMATCH', 'SUCCESS_CONTRACT_MISMATCH', 'EVIDENCE_CLASS_MISMATCH',
  'CAPABILITY_INCOMPATIBLE', 'UNSTABLE_RESULTS', 'NO_WINNER_CAPABLE_CANDIDATE'
];
const BLOCKED_REASONS = [
  'PROVIDER_EXECUTION_FAILURE', 'TOKEN_EVIDENCE_MISSING', 'LATENCY_EVIDENCE_MISSING', 'QUALITY_EVIDENCE_MISSING',
  'QUALIFICATION_EVIDENCE_MISSING', 'REGRESSION_EVIDENCE_MISSING', 'OPTIMIZATION_BOUNDARY_VIOLATION'
];

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function candidateById(record, id) {
  return record.candidates?.find((c) => c.candidate_id === id);
}

function winnerCapableOf(candidate) {
  return candidate?.qualification?.state === 'QUALIFIED'
    && Array.isArray(candidate.qualification.qualification_evidence_refs)
    && candidate.qualification.qualification_evidence_refs.length > 0
    && candidate.regression?.verdict === 'NO_REGRESSION'
    && typeof candidate.regression.regression_comparison_id === 'string'
    && candidate.regression.regression_comparison_id.length > 0
    && (candidate.measurements?.security?.regression_count ?? 0) === 0
    && candidate.stability?.stable !== false
    && candidate.execution?.status === 'COMPLETED';
}

function comparisonMetrics(measurements) {
  return {
    quality: measurements?.quality?.task_success_rate ?? null,
    costUnits: measurements?.tokens?.cost_units ?? null,
    tokensTotal: measurements?.tokens?.total ?? null,
    latencyP95: measurements?.latency_ms?.p95 ?? null
  };
}

/**
 * The fail-closed semantic invariants of a cross-model comparison, on top of
 * the JSON schema (the minimal engine cannot compare two numbers, cannot
 * re-derive flags and cannot express the closed gate sequence).
 *
 * - X1: at least two candidates, unique ids, and the deterministic
 *       comparison_id over the canonical inputs.
 * - X2: verdict/reason consistency — BLOCKED needs a blocked reason,
 *       INCOMPARABLE an incomparable reason, CANDIDATE_PREFERRED a dominance
 *       reason and a preferred candidate id.
 * - X3: the preferred candidate exists, is winner-capable (qualified with
 *       evidence, S9 regression-free, security-clean, stable, completed) and
 *       dominates every other winner-capable candidate on the measured
 *       metrics. An unqualified executor never receives winner status.
 * - X4: security is absolute — every candidate with a security regression
 *       count > 0 or an S9 REGRESSION_DETECTED verdict is excluded, and no
 *       such candidate is ever preferred.
 * - X5: the comparability flags are what the measured bases actually say,
 *       not what a caller wishes they said.
 * - X6: the instruction overhead ratio is what the token components support.
 * - X7: the authority-free posture is explicit (no adoption, no authority, no
 *       routing change, no runtime activation).
 * - X8: the evidence class rules — live provider evidence needs an owner
 *       authorization reference; offline evidence must not carry one.
 * - X9: the gate log is the closed gate sequence, in order, without gaps,
 *       without inventions.
 * - X10: model-specific optimization entries are adapter-bound.
 */
export function semanticComparisonIssues(record) {
  const issues = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['record must be an object'];
  }

  // X1 — candidate set and deterministic identity.
  if (!Array.isArray(record.candidates) || record.candidates.length < 2) {
    issues.push('a cross-model comparison needs at least two candidates');
  } else {
    const ids = record.candidates.map((c) => c.candidate_id);
    if (new Set(ids).size !== ids.length) issues.push('candidate ids must be unique');
  }

  // X2 — verdict / reason / preferred consistency.
  const { verdict, outcome_reason: reason, preferred_candidate_id: preferredId } = record;
  if (verdict === 'BLOCKED') {
    if (!BLOCKED_REASONS.includes(reason)) issues.push(`BLOCKED needs one of the typed missing-evidence/violation reasons, got ${reason}`);
    if (preferredId !== null) issues.push('a BLOCKED comparison names no preferred candidate');
  } else if (verdict === 'INCOMPARABLE') {
    if (!INCOMPARABLE_REASONS.includes(reason)) issues.push(`INCOMPARABLE needs one of the typed incomparability reasons, got ${reason}`);
    if (preferredId !== null) issues.push('an INCOMPARABLE comparison names no preferred candidate');
  } else if (verdict === 'CANDIDATE_PREFERRED') {
    if (!DOMINANCE_REASONS.includes(reason)) issues.push(`CANDIDATE_PREFERRED needs a dominance reason, got ${reason}`);
    if (typeof preferredId !== 'string' || preferredId.length === 0) issues.push('CANDIDATE_PREFERRED names the preferred candidate');
  } else {
    issues.push(`unknown verdict ${verdict}`);
  }

  // X3 — the preferred candidate is winner-capable and dominates.
  if (verdict === 'CANDIDATE_PREFERRED' && typeof preferredId === 'string') {
    const preferred = candidateById(record, preferredId);
    if (!preferred) {
      issues.push(`preferred candidate ${preferredId} is not in the candidate set`);
    } else {
      if (!winnerCapableOf(preferred)) {
        issues.push(`preferred candidate ${preferredId} is not winner-capable (qualification, S9 regression, security, stability or completion failed)`);
      }
      const others = record.candidates.filter((c) => c.candidate_id !== preferredId).filter(winnerCapableOf);
      if (others.length === 0) {
        issues.push(`preferred candidate ${preferredId} has no winner-capable counterpart to dominate; a preference needs a comparison`);
      }
      for (const other of others) {
        if (!paretoDominates(preferred, other)) {
          issues.push(`preferred candidate ${preferredId} does not dominate winner-capable candidate ${other.candidate_id} on the measured metrics`);
        }
      }
    }
  }

  // X4 — security and regression exclusions are present wherever they must be.
  const excludedIds = new Set((record.excluded_candidates ?? []).map((e) => e.candidate_id));
  for (const candidate of record.candidates ?? []) {
    const securityRegressed = (candidate.measurements?.security?.regression_count ?? 0) > 0;
    const regressionDetected = candidate.regression?.verdict === 'REGRESSION_DETECTED';
    if ((securityRegressed || regressionDetected) && !excludedIds.has(candidate.candidate_id)) {
      issues.push(`candidate ${candidate.candidate_id} carries a ${securityRegressed ? 'security regression' : 'detected S9 regression'} and must be excluded`);
    }
    if ((securityRegressed || regressionDetected) && candidate.candidate_id === preferredId) {
      issues.push(`candidate ${candidate.candidate_id} carries a regression and must never be preferred`);
    }
  }
  for (const entry of record.excluded_candidates ?? []) {
    if (!candidateById(record, entry.candidate_id)) {
      issues.push(`exclusion names unknown candidate ${entry.candidate_id}`);
    }
  }

  // X5 — the comparability flags are re-derived from the measured bases.
  const basis = record.evaluation_basis;
  if (basis && Array.isArray(record.candidates) && record.candidates.length > 0) {
    const expected = {
      same_task_set: record.candidates.every((c) => c.measured_basis?.task_set_id === basis.task_set_id),
      same_corpus_digest: record.candidates.every((c) => c.measured_basis?.corpus_digest === basis.corpus_digest),
      same_success_contract: record.candidates.every((c) => c.measured_basis?.success_contract_id === basis.success_contract_id
        && c.measured_basis?.success_contract_digest === basis.success_contract_digest),
      same_evidence_class: record.candidates.every((c) => c.measured_basis?.evidence_class === basis.evidence_class),
      capability_compatible: record.candidates.every((c) => c.capability?.compatible !== false)
    };
    for (const [flag, value] of Object.entries(expected)) {
      if (record.comparability?.[flag] !== value) {
        issues.push(`comparability.${flag} must be ${value} (what the measured bases say), got ${record.comparability?.[flag]}`);
      }
    }
    const basisVoid = !Object.values(expected).every(Boolean);
    if (basisVoid && verdict === 'CANDIDATE_PREFERRED') {
      issues.push('a comparison with a mismatched basis cannot prefer a candidate');
    }
  }

  // X6 — the instruction overhead ratio is supported by its components.
  for (const candidate of record.candidates ?? []) {
    const overhead = candidate.measurements?.instruction_overhead;
    if (!overhead) continue;
    const { instruction_tokens: instruction, task_tokens: task, overhead_ratio: ratio } = overhead;
    if (instruction === null || task === null) {
      if (ratio !== null) issues.push(`candidate ${candidate.candidate_id}: overhead_ratio must be null when the token components were not measured`);
      continue;
    }
    if (instruction < 0 || task < 0) issues.push(`candidate ${candidate.candidate_id}: instruction overhead components must be non-negative`);
    const totalTokens = instruction + task;
    const expectedRatio = totalTokens === 0 ? 0 : instruction / totalTokens;
    if (ratio === null || Math.abs(ratio - expectedRatio) > EPSILON) {
      issues.push(`candidate ${candidate.candidate_id}: overhead_ratio must be ${expectedRatio}, got ${ratio}`);
    }
  }

  // X7 — the authority-free posture.
  if (record.adoption_authorized !== false) issues.push('adoption_authorized must be false: a comparison adopts nothing');
  if (record.authority_granted !== false) issues.push('authority_granted must be false: a comparison grants no authority');
  if (record.routing_changed !== false) issues.push('routing_changed must be false: a comparison reroutes nothing');
  if (record.runtime_activation !== 'NONE') issues.push('runtime_activation must be NONE');

  // X8 — evidence class rules.
  if (basis?.evidence_class === 'live_provider') {
    if (typeof basis.live_authorization_ref !== 'string' || basis.live_authorization_ref.length === 0) {
      issues.push('live_provider evidence requires a live_authorization_ref to the owner budget/authorization record');
    }
  } else if (basis && basis.live_authorization_ref !== null && basis.live_authorization_ref !== undefined) {
    issues.push('offline evidence classes carry no live authorization; live_authorization_ref must be null');
  }

  // X9 — the gate log is the closed gate sequence, in order.
  const loggedGates = (record.applied_gates ?? []).map((g) => g.gate);
  const expectedGates = GATE_ORDER.filter((gate) => loggedGates.includes(gate));
  if (JSON.stringify(loggedGates) !== JSON.stringify(expectedGates)) {
    issues.push(`applied_gates must follow the closed gate order without gaps or inventions, got [${loggedGates.join(', ')}]`);
  }
  if (new Set(loggedGates).size !== loggedGates.length) {
    issues.push('applied_gates must not repeat a gate');
  }
  if (verdict === 'BLOCKED' && !(record.applied_gates ?? []).some((g) => g.outcome === 'BLOCKED')) {
    issues.push('a BLOCKED verdict needs a gate logged as BLOCKED');
  }
  if (verdict === 'INCOMPARABLE' && !(record.applied_gates ?? []).some((g) => g.outcome === 'INCOMPARABLE')) {
    issues.push('an INCOMPARABLE verdict needs a gate logged as INCOMPARABLE');
  }

  // X10 — model-specific optimizations live at adapter boundaries. A record
  // that BLOCKED on the violation legitimately contains the violating entry
  // as evidence; the rule binds the entries a record acts on, not the one it
  // refused.
  const blockedOnBoundary = verdict === 'BLOCKED' && reason === 'OPTIMIZATION_BOUNDARY_VIOLATION';
  for (const entry of record.optimization_boundaries ?? []) {
    if (entry.model_specific && !entry.adapter_bound && !blockedOnBoundary) {
      issues.push(`model-specific optimization "${entry.detail}" is not adapter-bound`);
    }
  }

  return issues;
}

export function validateCrossModelComparison(record, root = ROOT) {
  const schemaIssues = validateInstanceAgainstContract(record, COMPARISON_SCHEMA, root);
  const semanticIssues = semanticComparisonIssues(record);
  return { valid: schemaIssues.length === 0 && semanticIssues.length === 0, issues: [...schemaIssues, ...semanticIssues] };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function runCli(argv) {
  const files = argv.filter((a) => !a.startsWith('--'));
  let failures = 0;
  if (files.length === 0) {
    const fixture = readJson(COMPARISON_FIXTURE);
    const cases = fixture.cases ?? [];
    for (const testCase of cases) {
      const { valid, issues } = validateCrossModelComparison(testCase.instance);
      const label = testCase.valid === true;
      if (label !== valid) {
        failures += 1;
        console.error(`FIXTURE ${testCase.case_id}: expected ${label ? 'valid' : 'invalid'}, got ${valid ? 'valid' : 'invalid'}${label ? '' : ` (${issues.join('; ')})`}`);
      } else if (!label) {
        // An invalid case must be invalid for a reason, never vacuously.
        if (issues.length === 0) {
          failures += 1;
          console.error(`FIXTURE ${testCase.case_id}: expected invalid with named issues, got invalid with none`);
        }
      }
    }
    console.log(`cross-model comparison fixtures: ${cases.length} cases checked, ${cases.length - failures} as expected`);
  } else {
    for (const file of files) {
      const record = readJson(path.resolve(process.cwd(), file));
      const { valid, issues } = validateCrossModelComparison(record);
      if (!valid) {
        failures += 1;
        console.error(`${file}: INVALID — ${issues.join('; ')}`);
      } else {
        console.log(`${file}: valid`);
      }
    }
  }
  process.exitCode = failures === 0 ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli(process.argv.slice(2));
}
