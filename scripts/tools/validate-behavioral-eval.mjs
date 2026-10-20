#!/usr/bin/env node
// S5 validator (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S5 Behavioral Evaluation):
// validate behavioral eval records against the canonical contract
// core/contracts/behavioral-eval.schema.json plus the fail-closed semantic
// invariants that the minimal JSON schema engine cannot express.
//
// Usage:
//   node scripts/tools/validate-behavioral-eval.mjs                   validate the canonical
//                                                                     fixture (positive + negative
//                                                                     cases must match their labels)
//   node scripts/tools/validate-behavioral-eval.mjs <file.json> ...   validate explicit eval records
//                                                                     (all must be valid)
//
// An eval record is analysis output, never authority: this validator proves
// record shape and the security gate invariants only. It grants no permission,
// promotes no skill, and changes no qualification state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/behavioral-eval.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'behavioral-eval.contracts.json');

const IMPROVEMENT_VERDICTS = new Set(['IMPROVEMENT_PROVEN', 'IMPROVEMENT_REJECTED']);

/**
 * Fail-closed semantic invariants on top of the JSON schema (the minimal
 * engine cannot express them). Mirrors the S3 precedent of enforcing the
 * cross-field rule set in the owner-side semantic check:
 * - R1: any security regression forces verdict BLOCKED and gate BLOCK.
 * - R2: no security regression means gate PASS.
 * - R3: IMPROVEMENT_PROVEN requires every blocking family fully passed and a
 *       non-negative routing/output delta with zero carried security regressions.
 * - R4: per-family case counts must add up.
 * - R5: a BLOCKED verdict must always carry at least one failed blocking
 *       family or one security regression (no unexplained blocks).
 */
export function semanticEvalIssues(record) {
  const issues = [];
  const securityRegressions = record.security_gate.security_regressions;

  if (securityRegressions > 0) {
    if (record.verdict !== 'BLOCKED') {
      issues.push(`R1: security_regressions=${securityRegressions} forces verdict BLOCKED, found ${record.verdict}`);
    }
    if (record.security_gate.gate !== 'BLOCK') {
      issues.push(`R1: security_regressions=${securityRegressions} forces security gate BLOCK, found ${record.security_gate.gate}`);
    }
  } else if (record.security_gate.gate !== 'PASS') {
    issues.push(`R2: security_regressions=0 requires security gate PASS, found ${record.security_gate.gate}`);
  }

  if (record.verdict === 'IMPROVEMENT_PROVEN') {
    const failedBlocking = record.case_families.filter((family) => family.blocking && family.cases_failed > 0);
    if (failedBlocking.length > 0) {
      issues.push(`R3: IMPROVEMENT_PROVEN with failed blocking families: ${failedBlocking.map((family) => family.family).join(', ')}`);
    }
    if (record.comparison.routing_accuracy_delta < 0 || record.comparison.output_assertion_pass_delta < 0) {
      issues.push('R3: IMPROVEMENT_PROVEN requires non-negative routing and output deltas');
    }
    if (record.comparison.security_regressions !== 0) {
      issues.push('R3: IMPROVEMENT_PROVEN requires zero security regressions in the comparison');
    }
    if (record.baseline_ref !== record.comparison.baseline_eval_id) {
      issues.push('R3: baseline_ref must equal comparison.baseline_eval_id');
    }
  }

  for (const family of record.case_families) {
    if (family.cases_passed + family.cases_failed !== family.cases_total) {
      issues.push(`R4: family ${family.family}: cases_passed + cases_failed must equal cases_total`);
    }
  }

  if (record.verdict === 'BLOCKED') {
    const failedBlocking = record.case_families.filter((family) => family.blocking && family.cases_failed > 0);
    if (failedBlocking.length === 0 && securityRegressions === 0) {
      issues.push('R5: BLOCKED verdict without any failed blocking family or security regression is unexplained');
    }
  }

  return issues;
}

export function validateBehavioralEvalRecord(record, root = ROOT) {
  const issues = validateInstanceAgainstContract(record, SCHEMA_PATH, root);
  if (issues.length === 0 && record && typeof record === 'object') {
    issues.push(...semanticEvalIssues(record));
  }
  return issues;
}

let failures = 0;
let checked = 0;

function reportFailure(message) {
  failures += 1;
  console.error(message);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runCli(process.argv.slice(2));
}

function runCli(args) {
  if (args.length === 0) {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    for (const entry of fixture.cases) {
      checked += 1;
      const issues = validateBehavioralEvalRecord(entry.instance, ROOT);
      const failed = issues.length > 0;
      if (failed !== !entry.valid) {
        reportFailure(
          `case ${entry.case_id}: expected ${entry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${issues.join('; ') || '(no issues)'}`
        );
      }
    }
    console.log(`behavioral-eval fixture: ${checked} cases checked, ${failures} unexpected results`);
  } else {
    for (const arg of args) {
      const filePath = path.resolve(arg);
      let record;
      try {
        record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (error) {
        reportFailure(`${arg}: cannot read or parse (${error.message})`);
        continue;
      }
      checked += 1;
      const issues = validateBehavioralEvalRecord(record, ROOT);
      if (issues.length > 0) {
        reportFailure(`${arg}: ${issues.join('; ')}`);
      } else {
        console.log(`${arg}: valid`);
      }
    }
    console.log(`behavioral-eval records: ${checked} checked, ${failures} invalid`);
  }
  process.exit(failures === 0 ? 0 : 1);
}
