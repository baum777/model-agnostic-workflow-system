import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveAuthContext } from '../../runtime/auth/auth-context.mjs';
import { runRuntimeDryRun } from '../../runtime/cli/runtime-dry-run.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { replayRuntimeRun } from '../../runtime/observability/runtime-replay.mjs';
import { validateRuntimeRun } from '../../runtime/observability/validation-receipt.mjs';
import { SERVICE_API_ENDPOINTS } from '../../runtime/service/service-api-design.mjs';
import { writeServiceRequestReceipts } from '../../runtime/service/service-request-receipts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('service request receipt writer records validated local envelopes for every endpoint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-service-requests-'));
  const context = createRunContext({ repoRoot: root, mode: 'dry-run', entrypoint: 'test' });
  fs.mkdirSync(context.runDir, { recursive: true });
  const identity = resolveAuthContext({ cliIdentity: 'local-user' }).identity;

  const result = writeServiceRequestReceipts({ context, identity });

  assert.equal(result.ok, true);
  assert.equal(result.coverage.coverageComplete, true);
  assert.deepEqual(
    result.coverage.coveredEndpoints,
    SERVICE_API_ENDPOINTS.map((endpoint) => `${endpoint.method} ${endpoint.path}`)
  );
  assert.equal(fs.existsSync(path.join(context.runDir, 'service-requests.json')), true);
  for (const receipt of result.receipts) {
    assert.equal(receipt.request.identity.id, 'local-user');
    assert.equal(receipt.validation.result, 'pass');
    assert.equal(receipt.validation.requestValidated, true);
    assert.equal(receipt.execution.listenerStarted, false);
    assert.equal(receipt.execution.httpMcpStarted, false);
    assert.equal(receipt.execution.remoteTransportStarted, false);
    assert.equal(receipt.execution.daemonStarted, false);
    assert.equal(receipt.execution.serviceStartAllowed, false);
  }
});

test('runtime dry-run writes service request receipts that validate and replay', () => {
  const result = runRuntimeDryRun({ repoRoot });
  const artifactPath = path.join(result.context.runDir, 'service-requests.json');

  assert.equal(fs.existsSync(artifactPath), true);

  const validation = validateRuntimeRun({ repoRoot, runId: result.context.runId });
  const replay = replayRuntimeRun({ repoRoot, runId: result.context.runId });

  assert.equal(validation.ok, true);
  assert.equal(validation.serviceRequests.coverage.coverageComplete, true);
  assert.equal(validation.serviceRequests.receipts.length, SERVICE_API_ENDPOINTS.length);
  assert.equal(replay.serviceRequests.coverage.coverageComplete, true);
  assert.equal(replay.summary.serviceRequestCoverage, true);
});

test('runtime validation blocks incomplete service request coverage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-service-request-validation-'));
  const context = createRunContext({ repoRoot: root, mode: 'dry-run', entrypoint: 'test' });
  fs.mkdirSync(context.runDir, { recursive: true });

  fs.writeFileSync(path.join(context.runDir, 'manifest.json'), `${JSON.stringify({
    runId: context.runId,
    createdAt: context.createdAt,
    mode: context.mode,
    runtimeVersion: context.runtimeVersion,
    contractSources: ['core/contracts/workflow-routing-map.json'],
    status: 'completed',
    entrypoint: context.entrypoint
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(context.runDir, 'events.jsonl'), `${JSON.stringify({
    event_id: 'evt_test',
    event_name: 'workflow.started',
    event_family: 'workflow.lifecycle',
    timestamp: context.createdAt,
    workflow: { run_id: context.runId },
    outcome: { status: 'SUCCESS' }
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(context.runDir, 'permissions.jsonl'), `${JSON.stringify({
    runId: context.runId,
    claim: 'external.http',
    decision: 'deny',
    reason: 'test'
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(context.runDir, 'validation-receipt.json'), `${JSON.stringify({
    receiptVersion: '1.0.0',
    runId: context.runId,
    result: 'pass',
    summary: { runId: context.runId, result: 'pass' },
    checks: []
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(context.runDir, 'service-requests.json'), `${JSON.stringify({
    serviceRequestReceiptVersion: '1.0.0',
    runId: context.runId,
    coverage: {
      coverageComplete: false,
      expectedEndpoints: SERVICE_API_ENDPOINTS.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
      coveredEndpoints: ['POST /runtime/service/run']
    },
    receipts: []
  })}\n`, 'utf8');

  const validation = validateRuntimeRun({ repoRoot: root, runId: context.runId });

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('service request coverage')));
});
