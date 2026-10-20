#!/usr/bin/env node
// S3 validator (MAWS-SII-TARGET-SPEC-001 section 6): validate instruction
// audit findings against the canonical contract
// core/contracts/instruction-audit-finding.schema.json and run the
// read-only instruction integrity audit.
//
// Usage:
//   node scripts/tools/validate-instruction-integrity.mjs
//     validate the canonical fixture (positive + negative cases must match
//     their labels)
//   node scripts/tools/validate-instruction-integrity.mjs --revision <sha> [--root <path>]
//     [--output <file>] [--fail-on-blocker]
//     run the live audit at the given revision, validate every finding
//     against the contract, print the report to stdout (and optionally
//     persist it). Exit 1 only on contract-invalid findings or, with
//     --fail-on-blocker, on blocker-risk findings. Default is advisory:
//     findings never gate by themselves.
//
// The auditor is analysis output, never authority: this tool grants no
// permission, mutates no instruction source, and replaces no approval
// decision.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { auditInstructionSources } from '../../runtime/instructions/instruction-auditor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/instruction-audit-finding.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'instruction-audit-findings.contracts.json');

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (value === undefined) {
    process.stderr.write(`missing value for ${flag}\n`);
    process.exit(2);
  }
  return value;
}

const args = process.argv.slice(2);
let failures = 0;

if (!args.includes('--revision')) {
  let checked = 0;
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  for (const entry of fixture.cases) {
    checked += 1;
    const issues = validateInstanceAgainstContract(entry.instance, SCHEMA_PATH, ROOT);
    const failed = issues.length > 0;
    if (failed !== !entry.valid) {
      failures += 1;
      console.error(`case ${entry.case_id}: expected ${entry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${issues.join('; ') || '(no issues)'}`);
    }
  }
  console.log(`instruction-audit-finding fixture: ${checked} cases checked, ${failures} unexpected results`);
  process.exit(failures === 0 ? 0 : 1);
}

const revision = argValue('--revision');
const root = path.resolve(argValue('--root') ?? process.cwd());
const audit = auditInstructionSources({ root, revision });

let contractFailures = 0;
for (const finding of audit.findings) {
  const issues = validateInstanceAgainstContract(finding, SCHEMA_PATH, ROOT);
  if (issues.length > 0) {
    contractFailures += 1;
    console.error(`finding ${finding.finding_id} violates the contract: ${issues.join('; ')}`);
  }
}

const blockers = audit.findings.filter((finding) => finding.risk_level === 'blocker').length;
const reportLine = `instruction-integrity audit ${audit.audit_id}: ${audit.findings_count} findings (${blockers} blocker), ${audit.coverage.classes_analyzed.length} classes analyzed, ${audit.coverage.classes_declared_not_analyzable.length} declared not statically analyzable, contract violations ${contractFailures}`;
console.log(reportLine);

const outputPath = argValue('--output');
if (outputPath) {
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`report persisted: ${outputPath}`);
}

if (contractFailures > 0) process.exit(1);
if (args.includes('--fail-on-blocker') && blockers > 0) process.exit(1);
process.exit(0);
