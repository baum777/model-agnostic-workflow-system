#!/usr/bin/env node
import { resolve } from 'node:path';
import { runPreinstallSkillRiskCheck } from './preinstall-skill-risk-check.mjs';

const repoRoot = process.cwd();
const fixturePath = resolve(repoRoot, 'tests/fixtures/risky_skill/SKILL.md');

console.log(`Validating blocked-branch fixture at: ${fixturePath}`);

const result = runPreinstallSkillRiskCheck({
  repoRoot,
  target: fixturePath,
  type: 'skill'
});

if (!result.blocked) {
  console.error('FAIL: Fixture was not blocked.');
  console.error(`Block Reason: ${result.blockReason}`);
  process.exit(1);
}

// Ensure the report exists and is parseable
if (!result.report) {
  console.error('FAIL: Scan did not produce a valid report.');
  console.error(`Block Reason: ${result.blockReason}`);
  process.exit(1);
}

// Count CRITICAL findings
const criticalIssues = (result.report.issues || []).filter(i => i.severity === 'CRITICAL');
const criticalCount = criticalIssues.length;

if (criticalCount < 1) {
  console.error(`FAIL: Expected >= 1 CRITICAL finding, got ${criticalCount}.`);
  console.error(`Severity Summary: ${result.blockReason}`);
  process.exit(1);
}

console.log('PASS: Blocked-branch fixture validated.');
console.log(`- blocked: true`);
console.log(`- CRITICAL findings: ${criticalCount}`);
console.log(`- Block reason: ${result.blockReason}`);