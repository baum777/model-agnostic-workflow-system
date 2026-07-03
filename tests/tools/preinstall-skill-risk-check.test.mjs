import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildSkillSpectorScanCommand,
  runPreinstallSkillRiskCheck
} from '../../scripts/tools/preinstall-skill-risk-check.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('buildSkillSpectorScanCommand uses the static JSON default shape', () => {
  const command = buildSkillSpectorScanCommand({
    target: 'https://example.com/extensions/widget.zip',
    reportPath: '/tmp/skillspector-report.json'
  });

  assert.deepEqual(command, [
    'skillspector',
    'scan',
    'https://example.com/extensions/widget.zip',
    '--no-llm',
    '--format',
    'json',
    '--output',
    '/tmp/skillspector-report.json'
  ]);
});

test('runPreinstallSkillRiskCheck passes a low-severity static report and writes evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillspector-gate-pass-'));
  const target = path.join(root, 'fixtures', 'skill.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '# skill\n', 'utf8');

  const result = runPreinstallSkillRiskCheck({
    repoRoot: root,
    target,
    type: 'skill',
    executor: ({ reportPath }) => {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(
        reportPath,
        `${JSON.stringify({
          status: 'pass',
          findings: [{ severity: 'low', title: 'Informational note' }]
        }, null, 2)}\n`,
        'utf8'
      );
      return { status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(result.runDir, 'skillspector-report.json')), true);
  assert.equal(fs.existsSync(path.join(result.runDir, 'install-risk-decision.md')), true);

  const decision = fs.readFileSync(path.join(result.runDir, 'install-risk-decision.md'), 'utf8');
  assert.match(decision, /Owner decision: install allowed/);
  assert.match(decision, /Block reason: none/);
  assert.match(decision, /Scope limit: exact target only/);
});

test('runPreinstallSkillRiskCheck blocks a critical finding even when the scan exits zero', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillspector-gate-block-'));
  const target = path.join(root, 'fixtures', 'skill.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '# skill\n', 'utf8');

  const result = runPreinstallSkillRiskCheck({
    repoRoot: root,
    target,
    type: 'skill',
    executor: ({ reportPath }) => {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(
        reportPath,
        `${JSON.stringify({
          status: 'pass',
          findings: [
            {
              severity: 'critical',
              title: 'Prompt injection payload',
              detail: 'The target attempts to rewrite the install policy.'
            }
          ]
        }, null, 2)}\n`,
        'utf8'
      );
      return { status: 0, stdout: '', stderr: '' };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(result.runDir, 'skillspector-report.json')), true);
  assert.equal(fs.existsSync(path.join(result.runDir, 'install-risk-decision.md')), true);

  const decision = fs.readFileSync(path.join(result.runDir, 'install-risk-decision.md'), 'utf8');
  assert.match(decision, /Block reason: blocking findings present/);
  assert.match(decision, /Owner decision: blocked/);
  assert.match(decision, /Accepted risk: none/);
});

test('runPreinstallSkillRiskCheck blocks a missing target before invoking the scanner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillspector-gate-missing-target-'));
  let executorCalled = false;

  const result = runPreinstallSkillRiskCheck({
    repoRoot: root,
    type: 'skill',
    executor: () => {
      executorCalled = true;
      throw new Error('scanner should not have run');
    }
  });

  assert.equal(result.ok, false);
  assert.equal(executorCalled, false);
  assert.equal(fs.existsSync(path.join(result.runDir, 'install-risk-decision.md')), true);

  const decision = fs.readFileSync(path.join(result.runDir, 'install-risk-decision.md'), 'utf8');
  assert.match(decision, /Block reason: Target is required/);
  assert.match(decision, /Owner decision: blocked/);
  assert.match(decision, /Scan command: not run/);
});
