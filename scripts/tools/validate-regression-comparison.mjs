#!/usr/bin/env node
// MAWS vNext — S9 validator (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S9
// Regression and Rollback).
//
// Validates the two S9 contracts —
//   core/contracts/regression-comparison.schema.json
//   core/contracts/rollback-record.schema.json
// — against the canonical fixtures (positive + negative cases must match
// their labels) and against the fail-closed semantic invariants that the
// minimal JSON schema engine cannot express.
//
// Usage:
//   node scripts/tools/validate-regression-comparison.mjs
//       validate the canonical fixtures
//   node scripts/tools/validate-regression-comparison.mjs <file.json> ...
//       validate explicit records (all must be valid)
//
// A comparison or a rollback record is analysis output, never authority:
// this validator proves record shape and the fail-closed invariants only. It
// grants no permission, adopts nothing, promotes nothing and changes no
// qualification state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { REGRESSION_CRITERIA, GOVERNANCE_INVARIANTS, criterionVerdictFor } from '../../runtime/regression/regression-gate.mjs';
import { historyInventoryDigest } from '../../runtime/regression/rollback.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMPARISON_SCHEMA = 'core/contracts/regression-comparison.schema.json';
const ROLLBACK_SCHEMA = 'core/contracts/rollback-record.schema.json';
const COMPARISON_FIXTURE = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'regression-comparison.contracts.json');
const ROLLBACK_FIXTURE = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'rollback-record.contracts.json');

const EPSILON = 1e-9;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

/**
 * The fail-closed semantic invariants of a regression comparison, on top of
 * the JSON schema (the minimal engine cannot compare two numbers, cannot
 * require a property to be present in one branch of a conditional, and
 * cannot express the closed criterion set).
 *
 * - C1: NO_REGRESSION requires that no blocking criterion regressed, that
 *       every blocking criterion was measured, and that every admissibility
 *       invariant holds. "Nothing regressed" is only true when the
 *       comparison was actually able to look.
 * - C2: REGRESSION_DETECTED requires at least one blocking regression, and
 *       the candidate is rejected.
 * - C3: BLOCKED requires a reason: a failed invariant or an unmeasured
 *       blocking criterion. There is no unexplained block.
 * - C4: the comparison authorizes nothing (Eval PASS != Authority).
 * - C5: the criteria are the closed set, each exactly once, and the
 *       invariants are the closed set, each exactly once. A record that
 *       drops the criterion that would have caught the regression is not
 *       representable.
 * - C6: the delta is the difference of the two measured values, and a
 *       criterion that was not measured carries no numbers at all.
 * - C7: an advisory criterion never appears as a blocking regression. The
 *       S3 wave 2 candidates are advisory and never gate.
 */
export function semanticComparisonIssues(record) {
  const issues = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return issues;

  const criteria = Array.isArray(record.criteria) ? record.criteria : [];
  const invariants = Array.isArray(record.governance_invariants) ? record.governance_invariants : [];

  // C5 — the closed sets.
  for (const definition of REGRESSION_CRITERIA) {
    const present = criteria.filter((entry) => entry.criterion === definition.criterion);
    if (present.length !== 1) {
      issues.push(`C5: the criterion ${definition.criterion} must appear exactly once, found ${present.length}`);
    }
  }
  for (const entry of criteria) {
    if (!REGRESSION_CRITERIA.some((definition) => definition.criterion === entry.criterion)) {
      issues.push(`C5: ${entry.criterion} is outside the closed criterion set`);
    }
  }
  for (const invariant of GOVERNANCE_INVARIANTS) {
    const present = invariants.filter((entry) => entry.invariant === invariant);
    if (present.length !== 1) {
      issues.push(`C5: the invariant ${invariant} must appear exactly once, found ${present.length}`);
    }
  }
  for (const entry of invariants) {
    if (!GOVERNANCE_INVARIANTS.includes(entry.invariant)) {
      issues.push(`C5: ${entry.invariant} is outside the closed invariant set`);
    }
  }

  // C6 — the arithmetic of the deltas.
  for (const entry of criteria) {
    const measured = entry.verdict !== 'NOT_MEASURED';
    if (!measured) {
      if (entry.baseline_value !== null || entry.candidate_value !== null || entry.delta !== null) {
        issues.push(`C6: ${entry.criterion} was not measured, so it carries no baseline, candidate or delta value`);
      }
      continue;
    }
    if (typeof entry.baseline_value !== 'number' || typeof entry.candidate_value !== 'number' || typeof entry.delta !== 'number') {
      issues.push(`C6: ${entry.criterion} is measured, so it carries numeric baseline, candidate and delta values`);
      continue;
    }
    if (Math.abs(entry.delta - (entry.candidate_value - entry.baseline_value)) > EPSILON) {
      issues.push(`C6: ${entry.criterion} states delta ${entry.delta} but ${entry.candidate_value} - ${entry.baseline_value} is ${entry.candidate_value - entry.baseline_value}`);
    }
  }

  // C8 — the criterion verdicts are DERIVED, not asserted. The verdict of a
  // criterion follows from its two measured values and the closed definition
  // of that criterion. A record that keeps the numbers but states a verdict
  // the numbers contradict would otherwise hide a regression behind a label:
  // the security criterion is absolute, so a candidate that still carries a
  // regression regresses the criterion however it compares.
  for (const entry of criteria) {
    if (entry.verdict === 'NOT_MEASURED') continue;
    const expected = criterionVerdictFor(entry.criterion, entry.baseline_value, entry.candidate_value);
    if (expected !== entry.verdict) {
      issues.push(`C8: ${entry.criterion} states the verdict ${entry.verdict}, but its measured values ${entry.baseline_value} -> ${entry.candidate_value} derive ${expected}`);
    }
  }

  // C7 — the advisory criterion never blocks.
  const blockingNames = new Set(
    REGRESSION_CRITERIA.filter((definition) => definition.blocking).map((definition) => definition.criterion)
  );
  for (const name of record.blocking_regressions ?? []) {
    if (!blockingNames.has(name)) {
      issues.push(`C7: ${name} is not a blocking criterion and may not appear as a blocking regression`);
    }
  }

  const failedInvariants = invariants.filter((entry) => entry.holds === false).map((entry) => entry.invariant);
  const unmeasuredBlocking = criteria
    .filter((entry) => blockingNames.has(entry.criterion) && entry.verdict === 'NOT_MEASURED')
    .map((entry) => entry.criterion);

  if (record.verdict === 'NO_REGRESSION') {
    if ((record.blocking_regressions ?? []).length > 0) {
      issues.push('C1: NO_REGRESSION with a blocking regression listed');
    }
    const regressedBlocking = criteria
      .filter((entry) => blockingNames.has(entry.criterion) && entry.verdict === 'REGRESSED')
      .map((entry) => entry.criterion);
    if (regressedBlocking.length > 0) {
      issues.push(`C1: NO_REGRESSION while a blocking criterion regressed: ${regressedBlocking.join(', ')}`);
    }
    if (unmeasuredBlocking.length > 0) {
      issues.push(`C1: NO_REGRESSION with unmeasured blocking criteria: ${unmeasuredBlocking.join(', ')}`);
    }
    if (failedInvariants.length > 0) {
      issues.push(`C1: NO_REGRESSION with failed invariants: ${failedInvariants.join(', ')}`);
    }
    if (record.candidate_rejected !== false) {
      issues.push('C1: NO_REGRESSION must not reject the candidate');
    }
  }

  if (record.verdict === 'REGRESSION_DETECTED') {
    if ((record.blocking_regressions ?? []).length === 0) {
      issues.push('C2: REGRESSION_DETECTED without a blocking regression');
    }
    const regressedBlocking = criteria
      .filter((entry) => blockingNames.has(entry.criterion) && entry.verdict === 'REGRESSED')
      .map((entry) => entry.criterion)
      .sort();
    const listed = [...(record.blocking_regressions ?? [])].sort();
    if (JSON.stringify(regressedBlocking) !== JSON.stringify(listed)) {
      issues.push(`C2: the listed blocking regressions ${listed.join(', ') || 'none'} do not match the regressed blocking criteria ${regressedBlocking.join(', ') || 'none'}`);
    }
    if (record.candidate_rejected !== true) {
      issues.push('C2: REGRESSION_DETECTED must reject the candidate');
    }
    if (failedInvariants.length > 0) {
      issues.push(`C2: REGRESSION_DETECTED with failed invariants: ${failedInvariants.join(', ')}`);
    }
  }

  if (record.verdict === 'BLOCKED') {
    if (failedInvariants.length === 0 && unmeasuredBlocking.length === 0) {
      issues.push('C3: BLOCKED without a failed invariant or an unmeasured blocking criterion');
    }
    if (record.candidate_rejected !== true) {
      issues.push('C3: BLOCKED must reject the candidate');
    }
  }

  // C4 — the posture.
  if (record.adoption_authorized !== false) {
    issues.push('C4: a comparison never authorizes an adoption');
  }
  if (record.authority_granted !== false) {
    issues.push('C4: a comparison grants no authority');
  }
  if (record.baseline && record.candidate
    && record.baseline.eval_id === record.candidate.eval_id
    && record.baseline.content_digest === record.candidate.content_digest) {
    issues.push('C4: the two sides of a comparison must be two distinct measurements');
  }

  // C9 — the SAME_SUBJECT invariant must agree with the sides it describes.
  // A comparison of two subjects is not a valid COMPARISON, but a record
  // that truthfully reports it (the invariant fails, the verdict is BLOCKED)
  // is a valid record: the rule binds the claim to the facts, it does not
  // forbid the facts. The SAME_CORPUS invariant is bound the same way: the
  // corpus equality follows from the two revision digests, and an invariant
  // that disagrees with them is a claim its own record contradicts.
  if (record.baseline && record.candidate) {
    const sameSubject = record.baseline.subject_ref === record.candidate.subject_ref
      && record.baseline.subject_kind === record.candidate.subject_kind;
    const subjectInvariant = invariants.find((entry) => entry.invariant === 'SAME_SUBJECT');
    if (subjectInvariant && subjectInvariant.holds !== sameSubject) {
      issues.push(`C9: the SAME_SUBJECT invariant states holds=${subjectInvariant.holds} but the two sides ${sameSubject ? 'measure the same subject' : `measure different subjects (baseline ${record.baseline.subject_kind}: ${record.baseline.subject_ref}, candidate ${record.candidate.subject_kind}: ${record.candidate.subject_ref})`}`);
    }
    const sameCorpus = typeof record.baseline.corpus_digest === 'string'
      && typeof record.candidate.corpus_digest === 'string'
      && record.baseline.corpus_digest === record.candidate.corpus_digest;
    const corpusInvariant = invariants.find((entry) => entry.invariant === 'SAME_CORPUS');
    if (corpusInvariant && corpusInvariant.holds !== sameCorpus) {
      issues.push(`C9: the SAME_CORPUS invariant states holds=${corpusInvariant.holds} but the two sides name ${sameCorpus ? 'the same corpus' : `different corpora (baseline ${record.baseline.corpus_digest}, candidate ${record.candidate.corpus_digest})`}`);
    }
  }

  return issues;
}

/**
 * The fail-closed semantic invariants of a rollback PLAN record.
 *
 * - K1: ROLLBACK_PLANNED requires a QUALIFIED restore target, a
 *       NON_MATERIAL materiality for the restored state and an intact
 *       history. A plan that restores an unqualified state, or that does not
 *       restore the qualified state, or that cannot show the history
 *       intact, is not an admissible plan.
 * - K2: BLOCKED requires a typed refusal code and a reason. A refusal
 *       without a reason is not reconstructable.
 * - K3: a blocked plan never claims an intact history.
 * - K4: the record grants nothing.
 * - K5: the history inventory is non-empty and every entry names a
 *       well-formed digest.
 * - K6: the history claim follows from the digests. `unchanged` is true
 *       exactly when the independent pre-rollback digest equals the digest
 *       recomputed from the current inventory, and a plan without a
 *       pre-rollback digest is a refusal, never a plan.
 */
export function semanticRollbackIssues(record) {
  const issues = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return issues;

  const restored = record.restored_to ?? {};
  const materiality = record.materiality_after_rollback ?? {};
  const history = record.history ?? {};

  if (record.verdict === 'ROLLBACK_PLANNED') {
    if (restored.qualification_state !== 'QUALIFIED') {
      issues.push(`K1: a planned rollback restores a QUALIFIED revision, found ${restored.qualification_state}`);
    }
    if (materiality.overall_class !== 'NON_MATERIAL') {
      issues.push(`K1: a planned rollback re-derives NON_MATERIAL, found ${materiality.overall_class}`);
    }
    if (history.unchanged !== true) {
      issues.push('K1: a planned rollback shows the execution history intact');
    }
    if (record.refusal_code !== null || record.refusal_detail !== null) {
      issues.push('K1: a planned rollback carries no refusal code and no refusal detail');
    }
    if (restored.version === 'none') {
      issues.push('K1: a planned rollback names the revision it would restore');
    }
  }

  if (record.verdict === 'BLOCKED') {
    if (typeof record.refusal_code !== 'string' || record.refusal_code.length < 1) {
      issues.push('K2: a blocked plan carries a typed refusal code');
    }
    if (typeof record.refusal_detail !== 'string' || record.refusal_detail.length < 1) {
      issues.push('K2: a blocked plan carries the reason it was refused');
    }
    if (history.unchanged === true) {
      issues.push('K3: a blocked plan does not claim an intact history');
    }
  }

  if (record.adoption_authorized !== false) {
    issues.push('K4: a rollback plan authorizes no adoption');
  }
  if (record.authority_granted !== false) {
    issues.push('K4: a rollback plan grants no authority');
  }

  if (!Array.isArray(history.entries) || history.entries.length === 0) {
    issues.push('K5: the history inventory names at least one evidence artifact');
  } else {
    for (const entry of history.entries) {
      if (typeof entry.ref !== 'string' || entry.ref.length < 1) {
        issues.push('K5: every history entry names its evidence artifact');
      }
      if (typeof entry.digest !== 'string' || !DIGEST_PATTERN.test(entry.digest)) {
        issues.push(`K5: the history entry ${entry.ref} carries a well-formed digest`);
      }
    }
  }
  if (typeof history.inventory_digest !== 'string' || !DIGEST_PATTERN.test(history.inventory_digest)) {
    issues.push('K5: the history inventory carries a well-formed digest');
  }

  // K6 — the history claim follows from the INVENTORY, not from the labels.
  // The digest of the recorded entries is recomputed, the recomputed digest
  // is compared with the digest the record states, and the preservation
  // claim follows from the two digests. A record whose entries were edited
  // while the stated digests stayed is refused: an altered inventory must
  // not pass a preservation check its own content contradicts.
  const before = history.digest_before;
  const after = history.digest_after;
  if (before !== null && before !== undefined && !DIGEST_PATTERN.test(before)) {
    issues.push('K6: the pre-rollback digest is well-formed');
  }
  if (after !== null && after !== undefined && !DIGEST_PATTERN.test(after)) {
    issues.push('K6: the recomputed inventory digest is well-formed');
  }
  if (Array.isArray(history.entries) && history.entries.length > 0 && after !== null && after !== undefined) {
    const recomputed = historyInventoryDigest(history.entries);
    if (recomputed !== after) {
      issues.push(`K6: the recorded inventory hashes to ${recomputed} but the record states digest_after ${after}; the inventory does not match its own digest`);
    }
  }
  if (before !== null && before !== undefined && after !== null && after !== undefined) {
    const derived = before === after;
    if (history.unchanged !== derived) {
      issues.push(`K6: the history claim states unchanged=${history.unchanged} but the digests ${before} and ${after} ${derived ? 'agree' : 'differ'}`);
    }
  } else if (record.verdict === 'ROLLBACK_PLANNED') {
    issues.push('K6: a planned rollback compares the inventory against an independent pre-rollback digest');
  }

  return issues;
}

export function validateRegressionComparison(record, root = ROOT) {
  const issues = validateInstanceAgainstContract(record, COMPARISON_SCHEMA, root);
  if (issues.length === 0 && record && typeof record === 'object') {
    issues.push(...semanticComparisonIssues(record));
  }
  return issues;
}

export function validateRollbackRecord(record, root = ROOT) {
  const issues = validateInstanceAgainstContract(record, ROLLBACK_SCHEMA, root);
  if (issues.length === 0 && record && typeof record === 'object') {
    issues.push(...semanticRollbackIssues(record));
  }
  return issues;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateFixture(fixturePath, validate) {
  const issues = [];
  const fixture = readJson(fixturePath);
  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  if (cases.length === 0) {
    issues.push(`${path.basename(fixturePath)}: the fixture declares no cases`);
  }
  for (const entry of cases) {
    const found = validate(entry.instance, ROOT);
    const failed = found.length > 0;
    if (failed !== !entry.valid) {
      if (entry.valid) {
        issues.push(`${path.basename(fixturePath)}:${entry.case_id}: the case is marked valid but was refused: ${found.join('; ')}`);
      } else {
        issues.push(`${path.basename(fixturePath)}:${entry.case_id}: the case is marked invalid but was accepted`);
      }
    }
  }
  return { cases: cases.length, issues };
}

function runCli(args) {
  const failures = [];
  if (args.length === 0) {
    for (const [fixturePath, validate] of [
      [COMPARISON_FIXTURE, validateRegressionComparison],
      [ROLLBACK_FIXTURE, validateRollbackRecord]
    ]) {
      const result = validateFixture(fixturePath, validate);
      process.stdout.write(`${path.basename(fixturePath)}: ${result.cases} case(s)\n`);
      for (const issue of result.issues) {
        process.stderr.write(`${issue}\n`);
      }
      failures.push(...result.issues);
    }
  } else {
    for (const argument of args) {
      const absolute = path.resolve(argument);
      const record = readJson(absolute);
      const isRollback = typeof record?.restored_to !== 'undefined';
      const issues = isRollback ? validateRollbackRecord(record) : validateRegressionComparison(record);
      if (issues.length > 0) {
        failures.push(...issues.map((issue) => `${argument}: ${issue}`));
      }
    }
  }
  if (failures.length > 0) {
    process.stderr.write(`${failures.length} issue(s)\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('S9 contracts: OK\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli(process.argv.slice(2));
}
