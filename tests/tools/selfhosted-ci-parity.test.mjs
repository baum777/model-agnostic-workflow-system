import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitBlobSha, parseLegacyWorkflow, validateParityInventory } from
  '../../scripts/tools/validate-selfhosted-ci-parity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'drafts/selfhosted-ci-migration-20261030/required-gates.json'), 'utf8'));
const bytes = fs.readFileSync(path.join(root, '.github/workflows/loop-repo-ci.yml'));
const yaml = bytes.toString('utf8');
const clone = (item) => JSON.parse(JSON.stringify(item));
const check = (candidate, source = yaml, data = bytes) => validateParityInventory(candidate, source, data);

test('frozen hosted workflow has 23 mapped steps and exact Git blob identity', () => {
  assert.equal(parseLegacyWorkflow(yaml).length, 23);
  assert.equal(gitBlobSha(bytes), manifest.legacy_workflow_git_blob_sha);
  const report = check(manifest);
  assert.deepEqual(report.problems, []);
  assert.equal(report.ok, true);
  assert.equal(report.legacySteps, 23);
  assert.equal(report.additionalGates, 20);
  assert.equal(report.cutoverAuthorized, false);
  assert.equal(report.qualifiedRunner, false);
});

test('hosted step/script drift blocks rather than silently accepting reduced parity', () => {
  const candidate = clone(manifest);
  candidate.legacy_steps[5].run = 'npm run validate-secrets';
  assert.equal(check(candidate).ok, false);
  assert.match(check(candidate).problems.join(' '), /legacy step drift/);
});

test('missing gate, missing supplemental gate and unrecognized condition all block', () => {
  const noStep = clone(manifest);
  noStep.legacy_steps.pop();
  assert.equal(check(noStep).ok, false);
  const noSupplement = clone(manifest);
  noSupplement.supplemental_policy_gates.pop();
  assert.equal(check(noSupplement).ok, false);
  const unknownCondition = clone(manifest);
  unknownCondition.supplemental_policy_gates[0].condition = 'waived';
  assert.equal(check(unknownCondition).ok, false);
});

test('unqualified preflight cannot self-assert a passing relay or cutover', () => {
  for (const [field, value] of [
    ['cutover_state', 'APPROVED'], ['relay_state', 'FULLY_QUALIFIED']
  ]) {
    const candidate = clone(manifest);
    candidate[field] = value;
    assert.equal(check(candidate).ok, false);
  }
});

test('modified workflow source breaks digest identity', () => {
  const altered = yaml.replace('npm run validate-secrets', 'npm run validate-secrets -- --skip');
  assert.equal(check(manifest, altered, Buffer.from(altered)).ok, false);
});

test('blanket admission removal is detected', () => {
  const candidate = clone(manifest);
  candidate.supplemental_policy_gates = candidate.supplemental_policy_gates.map((gate) =>
    gate.id === 'supp-15' ? { ...gate, command: 'echo fake-pass' } : gate);
  assert.equal(check(candidate).ok, false);
});

test('inline commands and multiline scripts retain exact command bytes', () => {
  const steps = parseLegacyWorkflow(yaml);
  assert.equal(steps[3].run, 'npm ci --ignore-scripts --no-audit --no-fund');
  assert.match(steps[2].run, /node --check scripts\/tools\/baum-loop-repo\.mjs/);
  assert.equal(steps[6].run, 'npm run scan:source-security');
  assert.equal(steps[22].run, 'node scripts/tools/ci-gate.mjs');
});

test('checkout Git history and Node version are explicit source-custody requirements', () => {
  const steps = parseLegacyWorkflow(yaml);
  assert.equal(steps[0].action, 'actions/checkout@v4');
  assert.equal(steps[0].with['fetch-depth'], '0');
  assert.equal(steps[1].action, 'actions/setup-node@v4');
  assert.equal(steps[1].with['node-version'], "'24'");
});
