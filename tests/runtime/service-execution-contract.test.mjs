import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveAuthContext } from '../../runtime/auth/auth-context.mjs';
import {
  SERVICE_CAPABLE_ACTIONS,
  simulateServiceAction,
  validateServiceActionPermissionCoverage,
  validateServiceActionRequest
} from '../../runtime/service/service-actions.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function localIdentity() {
  return resolveAuthContext({ cliIdentity: 'local-user' }).identity;
}

test('service execution contract defines run status replay and cancel actions', () => {
  assert.deepEqual(SERVICE_CAPABLE_ACTIONS, ['run', 'status', 'replay', 'cancel']);
});

test('service action request requires explicit claim and identity binding', () => {
  const missingClaim = validateServiceActionRequest({
    identity: localIdentity(),
    action: 'run'
  });
  const valid = validateServiceActionRequest({
    identity: localIdentity(),
    action: 'run',
    claim: { scope: 'service', action: 'run', target: 'runtime:service/run' }
  });

  assert.equal(missingClaim.ok, false);
  assert.ok(missingClaim.issues.some((issue) => issue.includes('explicit claim')));
  assert.equal(valid.ok, true);
  assert.equal(valid.binding.action, 'run');
});

test('service action request blocks unbound action and implicit trust identity', () => {
  const unboundAction = validateServiceActionRequest({
    identity: localIdentity(),
    action: 'delete',
    claim: { scope: 'service', action: 'delete', target: 'runtime:service/delete' }
  });
  const implicitTrust = validateServiceActionRequest({
    identity: { id: 'local-user', source: 'free-input', trust: 'implicit' },
    action: 'status',
    claim: { scope: 'service', action: 'status', target: 'runtime:service/status' }
  });

  assert.equal(unboundAction.ok, false);
  assert.ok(unboundAction.issues.some((issue) => issue.includes('service-capable action')));
  assert.equal(implicitTrust.ok, false);
  assert.ok(implicitTrust.issues.some((issue) => issue.includes('implicit trust source')));
});

test('service action simulation is local-only and starts no listener', () => {
  const result = simulateServiceAction({
    identity: localIdentity(),
    action: 'status',
    claim: { scope: 'service', action: 'status', target: 'runtime:service/status' }
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionSimulated, true);
  assert.equal(result.transport, 'local-only');
  assert.equal(result.listenerStarted, false);
  assert.equal(result.httpMcpStarted, false);
  assert.equal(result.serviceStartAllowed, false);
});

test('service action permission coverage validates every service-capable action', () => {
  const result = validateServiceActionPermissionCoverage({ identity: localIdentity() });

  assert.equal(result.ok, true);
  assert.equal(result.coverageComplete, true);
  assert.deepEqual(result.coveredActions, SERVICE_CAPABLE_ACTIONS);
  assert.equal(result.actionResults.every((entry) => entry.ok), true);
});

test('runtime service CLI simulates local service action with identity-bound claim', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--simulate-action', 'run', '--identity', 'local-user'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.action, 'run');
  assert.equal(parsed.executionSimulated, true);
  assert.equal(parsed.listenerStarted, false);
});

test('runtime service CLI blocks simulated action without identity', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--simulate-action', 'run'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /identity/);
});

test('runtime docs preserve Phase 9 local-only service execution contract', () => {
  const runtimeDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'runtime.md'), 'utf8');

  assert.match(runtimeDoc, /Phase 9 service execution contract/);
  assert.match(runtimeDoc, /run`, `status`, `replay`, and `cancel/);
  assert.match(runtimeDoc, /action-level permission coverage/);
});
