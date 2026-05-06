import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { replayRuntimeRun } from '../../runtime/observability/runtime-replay.mjs';
import { findLatestRunDir, validateRuntimeRun } from '../../runtime/observability/validation-receipt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function runDryRun() {
  const output = execFileSync(process.execPath, ['runtime/cli/runtime-dry-run.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  return JSON.parse(output);
}

function makeRunDir(root, runId, manifestOverrides = {}) {
  const runDir = path.join(root, 'artifacts', 'runtime-runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  const manifest = {
    runId,
    createdAt: manifestOverrides.createdAt ?? '2026-04-29T00:00:00.000Z',
    mode: 'dry-run',
    runtimeVersion: '0.1.0',
    contractSources: ['core/contracts/workflow-routing-map.json'],
    status: 'completed',
    entrypoint: 'test',
    ...manifestOverrides
  };
  fs.writeFileSync(path.join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return runDir;
}

test('runtime replay returns manifest, events, permissions, memory, and receipt summary', () => {
  const dryRun = runDryRun();

  const replay = replayRuntimeRun({ repoRoot, runId: dryRun.runId });

  assert.equal(replay.ok, true);
  assert.equal(replay.runId, dryRun.runId);
  assert.equal(replay.manifest.runId, dryRun.runId);
  assert.ok(replay.events.length >= 1);
  assert.ok(replay.permissions.some((permission) => permission.claim === 'external.http'));
  assert.equal(replay.memory.length, 1);
  assert.equal(replay.validationReceipt.runId, dryRun.runId);
  assert.equal(replay.summary.memoryEntries, 1);
});

test('runtime:replay CLI supports --runId and emits replay JSON', () => {
  const dryRun = runDryRun();
  const output = execFileSync(process.execPath, ['runtime/cli/runtime-replay.mjs', '--runId', dryRun.runId], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.runId, dryRun.runId);
  assert.equal(parsed.summary.memoryEntries, 1);
});

test('latest-run resolution ignores malformed run directories and uses manifest createdAt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-latest-run-'));
  const validOlder = 'run_2026-04-29T00-00-00-000Z_validold';
  const validNewer = 'run_2026-04-30T00-00-00-000Z_validnew';
  makeRunDir(root, validOlder, { createdAt: '2026-04-29T00:00:00.000Z' });
  makeRunDir(root, validNewer, { createdAt: '2026-04-30T00:00:00.000Z' });
  fs.mkdirSync(path.join(root, 'artifacts', 'runtime-runs', 'run_9999-invalid'), { recursive: true });

  const latest = findLatestRunDir(root);

  assert.equal(path.basename(latest), validNewer);
});

test('validateRuntimeRun blocks schema-level artifact inconsistencies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-invalid-run-'));
  const runId = 'run_2026-04-29T00-00-00-000Z_invalid';
  const runDir = makeRunDir(root, runId);
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), '{"event_name":"workflow.started"}\n', 'utf8');
  fs.writeFileSync(path.join(runDir, 'permissions.jsonl'), '{"claim":"external.http","decision":"allow"}\n', 'utf8');
  fs.writeFileSync(path.join(runDir, 'memory.jsonl'), '{"scope":"project","promotion":{"status":"candidate"}}\n', 'utf8');
  fs.writeFileSync(path.join(runDir, 'validation-receipt.json'), '{"runId":"different","result":"pass","checks":[]}\n', 'utf8');

  const result = validateRuntimeRun({ repoRoot: root, runId });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('validation receipt runId')));
  assert.ok(result.issues.some((issue) => issue.includes('permission decision')));
  assert.ok(result.issues.some((issue) => issue.includes('runtime scope')));
  assert.ok(result.issues.some((issue) => issue.includes('promote canonically')));
});

test('validation receipt includes versioned summary metadata', () => {
  const dryRun = runDryRun();
  const receipt = JSON.parse(fs.readFileSync(path.join(dryRun.runDir, 'validation-receipt.json'), 'utf8'));

  assert.equal(receipt.receiptVersion, '1.0.0');
  assert.equal(receipt.summary.runId, dryRun.runId);
  assert.equal(receipt.summary.result, 'pass');
  assert.equal(typeof receipt.generatedAt, 'string');
});
