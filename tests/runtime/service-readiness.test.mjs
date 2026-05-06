import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateServiceModeRequest } from '../../runtime/service/service-readiness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('service readiness blocks service start without explicit flag', () => {
  const result = validateServiceModeRequest({
    explicitServiceFlag: false,
    requestedTransports: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.serviceStartAllowed, false);
  assert.ok(result.issues.some((issue) => issue.includes('explicit --enable-service-mode flag')));
});

test('service readiness gates HTTP and MCP behind local auth and permission evidence', () => {
  const result = validateServiceModeRequest({
    explicitServiceFlag: true,
    requestedTransports: ['http', 'mcp'],
    localAuthModelReady: false,
    permissionModelReady: false
  });

  assert.equal(result.ok, false);
  assert.equal(result.serviceStartAllowed, false);
  assert.deepEqual(result.deferredTransports, ['http', 'mcp']);
  assert.ok(result.issues.some((issue) => issue.includes('local auth/permission model')));
});

test('service readiness blocks remote transport before local auth and permission model', () => {
  const result = validateServiceModeRequest({
    explicitServiceFlag: true,
    requestedTransports: ['remote'],
    localAuthModelReady: true,
    permissionModelReady: false
  });

  assert.equal(result.ok, false);
  assert.equal(result.serviceStartAllowed, false);
  assert.deepEqual(result.deferredTransports, ['remote']);
  assert.ok(result.issues.some((issue) => issue.includes('remote transport')));
});

test('runtime service CLI fails closed without explicit service flag', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /explicit --enable-service-mode flag/);
});

test('runtime service CLI refuses HTTP and MCP transport even with explicit flag', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--enable-service-mode', '--http', '--mcp'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /local auth\/permission model/);
});

test('runtime docs preserve Phase 7 service-mode deferred boundary', () => {
  const runtimeDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'runtime.md'), 'utf8');

  assert.match(runtimeDoc, /Phase 7 service-mode readiness/);
  assert.match(runtimeDoc, /HTTP and MCP service transports remain deferred/);
  assert.match(runtimeDoc, /remote transport remains blocked/);
});
