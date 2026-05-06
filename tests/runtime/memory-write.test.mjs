import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { readJsonLines } from '../../runtime/adapters/jsonl/jsonl-adapter.mjs';
import { buildRuntimeMemoryEntry, writeRuntimeMemoryEntry } from '../../runtime/memory/memory-writer.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('writeRuntimeMemoryEntry writes runtime-scoped entries to run and local JSONL stores', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-memory-write-'));
  const context = createRunContext({ repoRoot: root, mode: 'dry-run', entrypoint: 'test' });
  fs.mkdirSync(context.runDir, { recursive: true });
  fs.writeFileSync(path.join(context.runDir, 'validation-receipt.json'), '{"result":"pass"}\n', 'utf8');

  const result = writeRuntimeMemoryEntry({
    context,
    summary: 'Runtime dry-run completed with permission gate active.',
    details: { permissionGate: 'active' },
    provenancePath: path.join(context.runDir, 'validation-receipt.json')
  });

  assert.equal(result.ok, true);
  assert.equal(result.entry.scope, 'runtime');
  assert.equal(result.entry.promotion.status, 'none');
  assert.equal(result.entry.provenance.path, `artifacts/runtime-runs/${context.runId}/validation-receipt.json`);
  assert.equal(result.entry.policy.secretChecked, true);
  assert.equal(result.entry.policy.scopeChecked, true);
  assert.equal(result.entry.policy.promotionRequired, false);

  const runEntries = readJsonLines(path.join(context.runDir, 'memory.jsonl'));
  const storeEntries = readJsonLines(path.join(root, 'memory', 'stores', 'jsonl', 'runtime-memory.jsonl'));

  assert.equal(runEntries.length, 1);
  assert.equal(storeEntries.length, 1);
  assert.deepEqual(runEntries[0], storeEntries[0]);
});

test('memory writer blocks unknown scope and secret-bearing content', () => {
  const context = createRunContext({ repoRoot, mode: 'dry-run', entrypoint: 'test' });
  const provenancePath = path.join(context.runDir, 'validation-receipt.json');

  const unknownScope = buildRuntimeMemoryEntry({
    context,
    scope: 'project',
    summary: 'Attempted non-runtime write.',
    provenancePath
  });
  const secretContent = buildRuntimeMemoryEntry({
    context,
    summary: 'Do not persist api token abc123.',
    provenancePath
  });

  assert.equal(unknownScope.ok, false);
  assert.ok(unknownScope.issues.some((issue) => issue.includes('runtime scope')));
  assert.equal(secretContent.ok, false);
  assert.ok(secretContent.issues.some((issue) => issue.includes('secret')));
});

test('runtime dry-run writes memory artifacts with run provenance and no promotion', () => {
  const output = execFileSync(process.execPath, ['runtime/cli/runtime-dry-run.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const parsed = JSON.parse(output);
  const runDir = parsed.runDir;

  const runMemory = readJsonLines(path.join(runDir, 'memory.jsonl'));
  const storeMemory = readJsonLines(path.join(repoRoot, 'memory', 'stores', 'jsonl', 'runtime-memory.jsonl'));
  const matchingStoreEntry = storeMemory.find((entry) => entry.id === runMemory[0].id);

  assert.equal(runMemory.length, 1);
  assert.equal(runMemory[0].scope, 'runtime');
  assert.equal(runMemory[0].provenance.runId, parsed.runId);
  assert.equal(runMemory[0].provenance.path, `artifacts/runtime-runs/${parsed.runId}/validation-receipt.json`);
  assert.equal(runMemory[0].promotion.status, 'none');
  assert.equal(matchingStoreEntry.id, runMemory[0].id);
});
