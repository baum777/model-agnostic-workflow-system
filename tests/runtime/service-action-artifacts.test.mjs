import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveAuthContext } from '../../runtime/auth/auth-context.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { replayRuntimeRun } from '../../runtime/observability/runtime-replay.mjs';
import { validateRuntimeRun } from '../../runtime/observability/validation-receipt.mjs';
import { SERVICE_CAPABLE_ACTIONS } from '../../runtime/service/service-actions.mjs';
import { writeServiceActionReceipts } from '../../runtime/service/service-action-receipts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('service action receipt writer records identity and claim binding for every action', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-service-actions-'));
  const context = createRunContext({ repoRoot: root, mode: 'dry-run', entrypoint: 'test' });
  fs.mkdirSync(context.runDir, { recursive: true });
  const identity = resolveAuthContext({ cliIdentity: 'local-user' }).identity;

  const result = writeServiceActionReceipts({ context, identity });

  assert.equal(result.ok, true);
  assert.equal(result.coverage.coverageComplete, true);
  assert.deepEqual(result.coverage.coveredActions, SERVICE_CAPABLE_ACTIONS);
  assert.equal(fs.existsSync(path.join(context.runDir, 'service-actions.json')), true);
  for (const receipt of result.receipts) {
    assert.equal(receipt.identity.id, 'local-user');
    assert.equal(receipt.claimBinding.result, 'pass');
    assert.equal(receipt.execution.listenerStarted, false);
    assert.equal(receipt.execution.httpMcpStarted, false);
    assert.equal(receipt.execution.remoteTransportStarted, false);
    assert.equal(receipt.execution.daemonStarted, false);
  }
});

test('runtime dry-run writes service action receipts that validate and replay', () => {
  const output = execFileSync(process.execPath, ['runtime/cli/runtime-dry-run.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const parsed = JSON.parse(output);
  const artifactPath = path.join(parsed.runDir, 'service-actions.json');

  assert.equal(fs.existsSync(artifactPath), true);

  const validation = validateRuntimeRun({ repoRoot, runId: parsed.runId });
  const replay = replayRuntimeRun({ repoRoot, runId: parsed.runId });

  assert.equal(validation.ok, true);
  assert.equal(validation.serviceActions.coverage.coverageComplete, true);
  assert.deepEqual(validation.serviceActions.coverage.coveredActions, SERVICE_CAPABLE_ACTIONS);
  assert.equal(replay.serviceActions.coverage.coverageComplete, true);
  assert.equal(replay.summary.serviceActionCoverage, true);
});

test('runtime validation blocks incomplete service action permission coverage', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-service-action-validation-'));
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
  fs.writeFileSync(path.join(context.runDir, 'service-actions.json'), `${JSON.stringify({
    serviceActionReceiptVersion: '1.0.0',
    runId: context.runId,
    coverage: {
      coverageComplete: false,
      expectedActions: SERVICE_CAPABLE_ACTIONS,
      coveredActions: ['run']
    },
    receipts: []
  })}\n`, 'utf8');

  const validation = validateRuntimeRun({ repoRoot: root, runId: context.runId });

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('service action coverage')));
});
