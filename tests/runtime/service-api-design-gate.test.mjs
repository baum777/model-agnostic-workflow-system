import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SERVICE_API_ENDPOINTS,
  resolveServiceEndpoint,
  validateServiceApiDesign
} from '../../runtime/service/service-api-design.mjs';
import { expectedClaimForAction, SERVICE_CAPABLE_ACTIONS } from '../../runtime/service/service-actions.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('service API design defines spec-only endpoints for every service action', () => {
  const endpointActions = SERVICE_API_ENDPOINTS.map((endpoint) => endpoint.action);

  assert.deepEqual(endpointActions, SERVICE_CAPABLE_ACTIONS);
  for (const endpoint of SERVICE_API_ENDPOINTS) {
    assert.equal(endpoint.specOnly, true);
    assert.equal(endpoint.listenerStarted, false);
    assert.equal(endpoint.transport, 'none');
    assert.deepEqual(endpoint.claim, expectedClaimForAction(endpoint.action));
  }
});

test('service endpoint resolves to service action and explicit claim', () => {
  const result = resolveServiceEndpoint({ method: 'POST', path: '/runtime/service/run' });

  assert.equal(result.ok, true);
  assert.equal(result.endpoint.action, 'run');
  assert.deepEqual(result.claim, expectedClaimForAction('run'));
  assert.equal(result.listenerStarted, false);
});

test('service endpoint fails closed for unbound endpoint', () => {
  const result = resolveServiceEndpoint({ method: 'POST', path: '/runtime/service/delete' });

  assert.equal(result.ok, false);
  assert.equal(result.listenerStarted, false);
  assert.ok(result.issues.some((issue) => issue.includes('unbound endpoint')));
});

test('service API design validation proves endpoint action claim coverage without listener', () => {
  const result = validateServiceApiDesign();

  assert.equal(result.ok, true);
  assert.equal(result.coverageComplete, true);
  assert.equal(result.listenerStarted, false);
  assert.equal(result.httpMcpStarted, false);
  assert.equal(result.remoteTransportStarted, false);
  assert.deepEqual(result.coveredActions, SERVICE_CAPABLE_ACTIONS);
});

test('runtime service CLI validates API design gate without starting listener', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--validate-api-design'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.coverageComplete, true);
  assert.equal(parsed.listenerStarted, false);
});

test('runtime service CLI fails closed for unbound endpoint lookup', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--resolve-endpoint', 'POST', '/runtime/service/delete'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /unbound endpoint/);
});

test('runtime docs preserve Phase 11 service API design gate boundary', () => {
  const runtimeDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'runtime.md'), 'utf8');

  assert.match(runtimeDoc, /Phase 11 local service API design gate/);
  assert.match(runtimeDoc, /spec-only endpoints/);
  assert.match(runtimeDoc, /no listener/);
});
