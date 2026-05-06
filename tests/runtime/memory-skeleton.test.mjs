import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateMemorySkeleton } from '../../runtime/memory/memory-policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('validateMemorySkeleton blocks when required memory skeleton files are missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-memory-missing-'));

  const result = validateMemorySkeleton({ repoRoot: root });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('memory/README.md')));
  assert.ok(result.issues.some((issue) => issue.includes('memory/MEMORY_CONTRACT.md')));
});

test('validateMemorySkeleton accepts controlled runtime writes without enabling promotion or SQLite', () => {
  const result = validateMemorySkeleton({ repoRoot });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.capabilities.runtimeMemoryWrites, true);
  assert.equal(result.capabilities.canonicalPromotion, false);
  assert.equal(result.capabilities.sqlite, false);
});

test('runtime validation CLI validates the memory skeleton with --memory', () => {
  const output = execFileSync(process.execPath, ['runtime/cli/runtime-validate.mjs', '--memory'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  assert.match(output, /"ok": true/);
});
