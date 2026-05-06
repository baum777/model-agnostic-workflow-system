import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { runManualTrigger } from '../../runtime/scheduler/manual-trigger.mjs';
import { validateCronConfig, validateSchedulerConfig } from '../../runtime/scheduler/cron-trigger.mjs';
import { replayRuntimeRun } from '../../runtime/observability/runtime-replay.mjs';
import { validateRuntimeRun } from '../../runtime/observability/validation-receipt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('manual trigger writes an explicit local trigger artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-manual-trigger-'));
  const context = createRunContext({ repoRoot: root, mode: 'dry-run', entrypoint: 'test' });
  fs.mkdirSync(context.runDir, { recursive: true });

  const result = runManualTrigger({ context, workflowId: 'runtime-dry-run' });

  assert.equal(result.ok, true);
  assert.equal(result.trigger.trigger_type, 'manual');
  assert.equal(result.trigger.autoStart, false);
  assert.equal(result.trigger.backgroundJobs, false);
  assert.equal(result.trigger.httpMcp, false);
  assert.equal(fs.existsSync(path.join(context.runDir, 'trigger.json')), true);
});

test('cron validation accepts explicit cron config but never starts a daemon', () => {
  const validCron = validateCronConfig({ expression: '0 9 * * 1', timezone: 'UTC' });
  const invalidCron = validateCronConfig({ expression: '* * *', timezone: 'UTC' });
  const scheduler = validateSchedulerConfig({
    tsc_version: '1.0.0',
    workflow_id: 'runtime-dry-run',
    trigger_type: 'cron',
    max_concurrent_runs: 1,
    cron_config: { expression: '0 9 * * 1', timezone: 'UTC' }
  });

  assert.equal(validCron.ok, true);
  assert.equal(invalidCron.ok, false);
  assert.equal(scheduler.ok, true);
  assert.equal(scheduler.daemonStarted, false);
  assert.equal(scheduler.backgroundJobsStarted, false);
});

test('scheduler validation blocks unsupported trigger types and invalid concurrency', () => {
  const webhook = validateSchedulerConfig({
    tsc_version: '1.0.0',
    workflow_id: 'runtime-dry-run',
    trigger_type: 'webhook',
    max_concurrent_runs: 1,
    webhook_config: { method: 'POST', auth_scheme: 'none', payload_schema_ref: 'none' }
  });
  const concurrency = validateSchedulerConfig({
    tsc_version: '1.0.0',
    workflow_id: 'runtime-dry-run',
    trigger_type: 'manual',
    max_concurrent_runs: 0
  });

  assert.equal(webhook.ok, false);
  assert.ok(webhook.issues.some((issue) => issue.includes('HTTP/MCP')));
  assert.equal(concurrency.ok, false);
  assert.ok(concurrency.issues.some((issue) => issue.includes('max_concurrent_runs')));
});

test('runtime dry-run writes trigger artifact that validates and replays', () => {
  const output = execFileSync(process.execPath, ['runtime/cli/runtime-dry-run.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const parsed = JSON.parse(output);

  assert.equal(fs.existsSync(path.join(parsed.runDir, 'trigger.json')), true);

  const validation = validateRuntimeRun({ repoRoot, runId: parsed.runId });
  const replay = replayRuntimeRun({ repoRoot, runId: parsed.runId });

  assert.equal(validation.ok, true);
  assert.equal(validation.trigger.trigger_type, 'manual');
  assert.equal(replay.trigger.trigger_type, 'manual');
  assert.equal(replay.summary.triggerType, 'manual');
});

test('runtime scheduler daemon command fails closed', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-scheduler.mjs', '--daemon'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /No scheduler daemon/);
});
