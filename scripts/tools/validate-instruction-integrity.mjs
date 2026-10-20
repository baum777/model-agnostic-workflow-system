#!/usr/bin/env node
// S3 validator (MAWS-SII-TARGET-SPEC-001 section 6): validate instruction
// audit findings against the canonical contract
// core/contracts/instruction-audit-finding.schema.json and run the
// read-only instruction integrity audit.
//
// Usage:
//   node scripts/tools/validate-instruction-integrity.mjs
//     validate the canonical fixtures: schema cases (positive + negative must
//     match their labels) plus the semantic cases (schema-passing instances
//     with cross-field invariants that must match their labels)
//   node scripts/tools/validate-instruction-integrity.mjs --revision <sha> [--root <path>]
//     [--output <file>] [--fail-on-blocker]
//     run the live audit at the given revision, validate every finding
//     against the contract (schema + semantic), print the report to stdout
//     (and optionally persist it). Exit 1 only on invalid findings or, with
//     --fail-on-blocker, on blocker-risk findings. Default is advisory:
//     findings never gate by themselves.
//
// Provenance rule (fail-closed): --revision must resolve to a real commit,
// must be the current HEAD of the audited tree, and the tracked tree must be
// clean — otherwise the tool exits 2 without emitting a report. A report that
// stamps a revision it did not verify would be unreconstructable.
//
// The auditor is analysis output, never authority: this tool grants no
// permission, mutates no instruction source, and replaces no approval
// decision.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { auditInstructionSources, semanticFindingIssues } from '../../runtime/instructions/instruction-auditor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/instruction-audit-finding.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'instruction-audit-findings.contracts.json');
const SEMANTIC_FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext-semantic', 'instruction-audit-findings.semantic.json');

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

function failRevision(message) {
  process.stderr.write(`AUDIT_REVISION_UNVERIFIED: ${message}\n`);
  process.exit(2);
}

// Fail-closed provenance gate: the requested revision must be a real commit,
// must be exactly HEAD of the audited tree, and the tracked tree must be
// clean, so the emitted report is reconstructable from that revision alone.
function verifyRevision(root, revision) {
  let head;
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${revision}^{commit}`], { stdio: 'pipe' });
    head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    failRevision(`revision ${revision} does not resolve to a commit in ${root}`);
  }
  if (head !== revision) {
    failRevision(`revision ${revision} is not HEAD (${head}); audit the checked-out revision or check it out first`);
  }
  let status;
  try {
    status = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  } catch {
    failRevision(`${root} is not a readable git worktree`);
  }
  if (status.length > 0) {
    failRevision(`tracked working tree is dirty; a report stamped ${revision} would not be reconstructable`);
  }
}

function findingIssues(instance) {
  return [...validateInstanceAgainstContract(instance, SCHEMA_PATH, ROOT), ...semanticFindingIssues(instance)];
}

const args = process.argv.slice(2);
let failures = 0;

if (!args.includes('--revision')) {
  let checked = 0;
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  for (const entry of fixture.cases) {
    checked += 1;
    const issues = findingIssues(entry.instance);
    const failed = issues.length > 0;
    if (failed !== !entry.valid) {
      failures += 1;
      console.error(`case ${entry.case_id}: expected ${entry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${issues.join('; ') || '(no issues)'}`);
    }
  }
  const semanticFixture = JSON.parse(fs.readFileSync(SEMANTIC_FIXTURE_PATH, 'utf8'));
  for (const entry of semanticFixture.cases) {
    checked += 1;
    const schemaIssues = validateInstanceAgainstContract(entry.instance, SCHEMA_PATH, ROOT);
    if (schemaIssues.length > 0) {
      failures += 1;
      console.error(`semantic case ${entry.case_id}: must be schema-valid first: ${schemaIssues.join('; ')}`);
      continue;
    }
    const semanticIssues = semanticFindingIssues(entry.instance);
    const failed = semanticIssues.length > 0;
    if (failed !== !entry.valid) {
      failures += 1;
      console.error(`semantic case ${entry.case_id}: expected ${entry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${semanticIssues.join('; ') || '(no issues)'}`);
    }
  }
  console.log(`instruction-audit-finding fixtures: ${checked} cases checked, ${failures} unexpected results`);
  process.exit(failures === 0 ? 0 : 1);
}

const revision = argValue('--revision');
const root = path.resolve(argValue('--root') ?? process.cwd());
verifyRevision(root, revision);
const audit = auditInstructionSources({ root, revision });

let contractFailures = 0;
for (const finding of audit.findings) {
  const issues = findingIssues(finding);
  if (issues.length > 0) {
    contractFailures += 1;
    console.error(`finding ${finding.finding_id} violates the contract: ${issues.join('; ')}`);
  }
}

const blockers = audit.findings.filter((finding) => finding.risk_level === 'blocker').length;
const reportLine = `instruction-integrity audit ${audit.audit_id} (revision verified: ${revision}): ${audit.findings_count} findings (${blockers} blocker), ${audit.coverage.classes_analyzed.length} classes analyzed, ${audit.coverage.classes_declared_not_analyzable.length} declared not statically analyzable, contract violations ${contractFailures}`;
console.log(reportLine);

const outputPath = argValue('--output');
if (outputPath) {
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(audit, null, 2)}\n`);
  console.log(`report persisted: ${outputPath}`);
}

if (contractFailures > 0) process.exit(1);
if (args.includes('--fail-on-blocker') && blockers > 0) process.exit(1);
process.exit(0);
