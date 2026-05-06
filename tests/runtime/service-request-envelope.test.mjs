import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createServiceRequestEnvelope } from '../../runtime/service/service-request-envelope.mjs';
import { validateServiceRequest } from '../../runtime/service/service-request-validation.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('service request envelope maps endpoint to action and identity-bound claim', () => {
  const result = createServiceRequestEnvelope({
    method: 'POST',
    path: '/runtime/service/run',
    cliIdentity: 'local-user'
  });

  assert.equal(result.ok, true);
  assert.match(result.envelope.requestId, /^req_/);
  assert.equal(result.envelope.identity.id, 'local-user');
  assert.equal(result.envelope.endpoint.method, 'POST');
  assert.equal(result.envelope.endpoint.path, '/runtime/service/run');
  assert.equal(result.envelope.action, 'run');
  assert.deepEqual(result.envelope.claim, {
    scope: 'service',
    action: 'run',
    target: 'runtime:service/run'
  });
  assert.equal(result.envelope.transport, 'local-only');
  assert.equal(result.envelope.listenerStarted, false);
  assert.equal(result.envelope.serviceStartAllowed, false);
});

test('service request validation passes with controlled identity and bound endpoint', () => {
  const result = validateServiceRequest({
    method: 'POST',
    path: '/runtime/service/run',
    cliIdentity: 'local-user'
  });

  assert.equal(result.ok, true);
  assert.equal(result.requestValidated, true);
  assert.equal(result.listenerStarted, false);
  assert.equal(result.serviceStartAllowed, false);
  assert.equal(result.transport, 'local-only');
});

test('service request validation blocks missing identity and unknown identity', () => {
  const missing = validateServiceRequest({ method: 'POST', path: '/runtime/service/run' });
  const unknown = validateServiceRequest({ method: 'POST', path: '/runtime/service/run', cliIdentity: 'root' });

  assert.equal(missing.ok, false);
  assert.equal(missing.requestValidated, false);
  assert.ok(missing.issues.some((issue) => issue.includes('identity')));
  assert.equal(unknown.ok, false);
  assert.ok(unknown.issues.some((issue) => issue.includes('unknown identity')));
});

test('service request validation blocks unbound endpoint and claim mismatch', () => {
  const unbound = validateServiceRequest({
    method: 'POST',
    path: '/runtime/service/delete',
    cliIdentity: 'local-user'
  });
  const mismatch = validateServiceRequest({
    method: 'POST',
    path: '/runtime/service/run',
    cliIdentity: 'local-user',
    claimOverride: {
      scope: 'service',
      action: 'status',
      target: 'runtime:service/status'
    }
  });

  assert.equal(unbound.ok, false);
  assert.ok(unbound.issues.some((issue) => issue.includes('unbound endpoint')));
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.issues.some((issue) => issue.includes('claim mismatch')));
});

test('service request validation blocks HTTP MCP remote and daemon flags', () => {
  const result = validateServiceRequest({
    method: 'POST',
    path: '/runtime/service/run',
    cliIdentity: 'local-user',
    requestedTransports: ['http', 'mcp', 'remote'],
    daemonRequested: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.listenerStarted, false);
  assert.equal(result.serviceStartAllowed, false);
  assert.ok(result.issues.some((issue) => issue.includes('HTTP/MCP')));
  assert.ok(result.issues.some((issue) => issue.includes('remote')));
  assert.ok(result.issues.some((issue) => issue.includes('daemon')));
});

test('runtime service CLI validates request envelope without starting listener', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--validate-request', 'POST', '/runtime/service/run', '--identity', 'local-user'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.requestValidated, true);
  assert.equal(parsed.listenerStarted, false);
  assert.equal(parsed.serviceStartAllowed, false);
  assert.equal(parsed.transport, 'local-only');
});

test('runtime service CLI fails closed for unbound request endpoint', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--validate-request', 'POST', '/runtime/service/delete', '--identity', 'local-user'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /unbound endpoint/);
});

test('runtime docs preserve Phase 12 local request envelope boundary', () => {
  const runtimeDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'runtime.md'), 'utf8');

  assert.match(runtimeDoc, /Phase 12 local service request envelope gate/);
  assert.match(runtimeDoc, /local request envelope/);
  assert.match(runtimeDoc, /serviceStartAllowed: false/);
});
