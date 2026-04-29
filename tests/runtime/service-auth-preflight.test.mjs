import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveAuthContext } from '../../runtime/auth/auth-context.mjs';
import { validateClaimBinding } from '../../runtime/auth/claim-binding.mjs';
import { runServicePreflight } from '../../runtime/service/service-preflight.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('auth context blocks missing identity', () => {
  const result = resolveAuthContext({});

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('identity')));
});

test('auth context blocks unknown identity', () => {
  const result = resolveAuthContext({ cliIdentity: 'root' });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('unknown identity')));
});

test('auth context accepts controlled local identity from CLI flag', () => {
  const result = resolveAuthContext({ cliIdentity: 'local-user' });

  assert.equal(result.ok, true);
  assert.equal(result.identity.id, 'local-user');
  assert.equal(result.identity.source, 'cli');
  assert.equal(result.identity.trust, 'controlled-local');
});

test('claim binding blocks unbound action and implicit trust source', () => {
  const unboundAction = validateClaimBinding({
    identity: { id: 'local-user', source: 'cli', trust: 'controlled-local' },
    claim: { scope: 'service', action: 'delete', target: 'runtime:service' }
  });
  const implicitTrust = validateClaimBinding({
    identity: { id: 'local-user', source: 'free-input', trust: 'implicit' },
    claim: { scope: 'service', action: 'preflight', target: 'runtime:service' }
  });

  assert.equal(unboundAction.ok, false);
  assert.ok(unboundAction.issues.some((issue) => issue.includes('unbound action')));
  assert.equal(implicitTrust.ok, false);
  assert.ok(implicitTrust.issues.some((issue) => issue.includes('implicit trust source')));
});

test('service preflight can pass checks while service start remains gated', () => {
  const result = runServicePreflight({ cliIdentity: 'local-user' });

  assert.equal(result.ok, true);
  assert.equal(result.preflightChecksPassed, true);
  assert.equal(result.serviceStartAllowed, false);
  assert.equal(result.reason, 'service mode remains gated');
  assert.equal(result.identity.id, 'local-user');
});

test('service preflight blocks missing identity, HTTP/MCP, daemon, and remote transport', () => {
  const missing = runServicePreflight({});
  const transport = runServicePreflight({ cliIdentity: 'local-user', requestedTransports: ['http', 'mcp'] });
  const daemon = runServicePreflight({ cliIdentity: 'local-user', daemonRequested: true });
  const remote = runServicePreflight({ cliIdentity: 'local-user', requestedTransports: ['remote'] });

  assert.equal(missing.preflightChecksPassed, false);
  assert.equal(transport.preflightChecksPassed, false);
  assert.equal(daemon.preflightChecksPassed, false);
  assert.equal(remote.preflightChecksPassed, false);
  assert.ok(transport.issues.some((issue) => issue.includes('HTTP/MCP')));
  assert.ok(daemon.issues.some((issue) => issue.includes('daemon')));
  assert.ok(remote.issues.some((issue) => issue.includes('remote transport')));
});

test('runtime service preflight CLI succeeds without starting service', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--preflight', '--identity', 'local-user'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(parsed.preflightChecksPassed, true);
  assert.equal(parsed.serviceStartAllowed, false);
  assert.equal(parsed.reason, 'service mode remains gated');
});

test('runtime service preflight CLI blocks HTTP and MCP', () => {
  const result = spawnSync(process.execPath, ['runtime/cli/runtime-service.mjs', '--preflight', '--identity', 'local-user', '--http', '--mcp'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /HTTP\/MCP/);
});

test('runtime docs preserve Phase 8 local auth preflight boundary', () => {
  const runtimeDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'runtime.md'), 'utf8');

  assert.match(runtimeDoc, /Phase 8 local service auth\/permission preflight/);
  assert.match(runtimeDoc, /preflightChecksPassed/);
  assert.match(runtimeDoc, /serviceStartAllowed: false/);
});
