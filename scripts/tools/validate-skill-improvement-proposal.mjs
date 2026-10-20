#!/usr/bin/env node
// S4 validator (MAWS-SII-TARGET-SPEC-001): validate skill improvement proposals
// against the canonical contract
// core/contracts/skill-improvement-proposal.schema.json.
//
// Usage:
//   node scripts/tools/validate-skill-improvement-proposal.mjs
//                                                                   validate the canonical
//                                                                   fixture (positive + negative
//                                                                   cases must match their labels)
//   node scripts/tools/validate-skill-improvement-proposal.mjs <file.json> ...
//                                                                   validate explicit proposal
//                                                                   records (all must be valid)
//
// A proposal is analysis output, never authority: this validator proves record
// shape only. It grants no permission, promotes no skill, activates no
// runtime path and changes no qualification state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/skill-improvement-proposal.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'skill-improvement-proposal.contracts.json');

let failures = 0;
let checked = 0;

function reportFailure(message) {
  failures += 1;
  console.error(message);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  for (const entry of fixture.cases) {
    checked += 1;
    const issues = validateInstanceAgainstContract(entry.instance, SCHEMA_PATH, ROOT);
    const failed = issues.length > 0;
    if (failed !== !entry.valid) {
      reportFailure(
        `case ${entry.case_id}: expected ${entry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${issues.join('; ') || '(no issues)'}`
      );
    }
  }
  console.log(`skill-improvement-proposal fixture: ${checked} cases checked, ${failures} unexpected results`);
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
    const issues = validateInstanceAgainstContract(record, SCHEMA_PATH, ROOT);
    if (issues.length > 0) {
      reportFailure(`${arg}: ${issues.join('; ')}`);
    } else {
      console.log(`${arg}: valid`);
    }
  }
  console.log(`skill-improvement-proposal records: ${checked} checked, ${failures} invalid`);
}

process.exit(failures === 0 ? 0 : 1);
