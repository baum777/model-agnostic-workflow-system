import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadRuntimeContracts, REQUIRED_RUNTIME_CONTRACTS } from '../../runtime/contracts/load-contracts.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';
import { validateRuntimeRun } from '../../runtime/observability/validation-receipt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function makeTempRepoRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-runtime-test-'));
  fs.mkdirSync(path.join(root, 'core', 'contracts'), { recursive: true });
  return root;
}

function writeRequiredContracts(root, overrides = {}) {
  for (const contractName of REQUIRED_RUNTIME_CONTRACTS) {
    const content = overrides[contractName] ?? { contractName };
    fs.writeFileSync(
      path.join(root, 'core', 'contracts', contractName),
      `${JSON.stringify(content, null, 2)}\n`,
      'utf8'
    );
  }
}

test('loadRuntimeContracts loads required root contracts and blocks missing contracts', () => {
  const root = makeTempRepoRoot();
  writeRequiredContracts(root);

  const loaded = loadRuntimeContracts(root);

  assert.equal(loaded.ok, true);
  assert.deepEqual(
    loaded.requiredSources.map((source) => source.relativePath).sort(),
    REQUIRED_RUNTIME_CONTRACTS.map((name) => `core/contracts/${name}`).sort()
  );

  fs.rmSync(path.join(root, 'core', 'contracts', 'permission-boundary.json'));
  const blocked = loadRuntimeContracts(root);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.issues.some((issue) => issue.includes('permission-boundary.json')));
});

test('permission engine allows only active run artifact writes and denies external actions', () => {
  const context = createRunContext({ repoRoot, mode: 'dry-run', entrypoint: 'test' });
  const engine = createPermissionEngine(context);

  const allowed = engine.decide({
    claim: 'filesystem.write',
    target: path.join(context.runDir, 'events.jsonl')
  });
  const deniedExternal = engine.decide({
    claim: 'external.http',
    target: 'https://example.com'
  });
  const deniedOutside = engine.decide({
    claim: 'filesystem.write',
    target: path.join(repoRoot, 'README.md')
  });

  assert.equal(allowed.decision, 'allow');
  assert.equal(deniedExternal.decision, 'deny');
  assert.equal(deniedOutside.decision, 'deny');
});

test('runtime dry-run creates Phase 1 artifacts that validate by latest run', () => {
  const before = fs.existsSync(path.join(repoRoot, 'artifacts', 'runtime-runs'))
    ? new Set(fs.readdirSync(path.join(repoRoot, 'artifacts', 'runtime-runs')))
    : new Set();

  execFileSync('node', ['runtime/cli/runtime-dry-run.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  const runRoot = path.join(repoRoot, 'artifacts', 'runtime-runs');
  const created = fs.readdirSync(runRoot).filter((entry) => entry.startsWith('run_') && !before.has(entry));

  assert.equal(created.length, 1);

  const runDir = path.join(runRoot, created[0]);
  for (const artifact of ['manifest.json', 'events.jsonl', 'permissions.jsonl', 'validation-receipt.json']) {
    assert.equal(fs.existsSync(path.join(runDir, artifact)), true, `${artifact} should exist`);
  }

  const validation = validateRuntimeRun({ repoRoot, latest: true });
  assert.equal(validation.ok, true);
  assert.equal(validation.receipt.result, 'pass');
});

test('unimplemented runtime commands fail closed in Phase 1', () => {
  for (const scriptName of ['runtime-run.mjs', 'runtime-status.mjs', 'runtime-replay.mjs']) {
    const result = spawnSync('node', [path.join(repoRoot, 'runtime', 'cli', scriptName)], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /not implemented in Phase 1/);
  }
});
