import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { readHandoffEnvelope, writeHandoffEnvelope } from '../../runtime/handoff/handoff-writer.mjs';
import { createResourceGovernor } from '../../runtime/resources/resource-governor.mjs';
import { replayRuntimeRun } from '../../runtime/observability/runtime-replay.mjs';
import { validateRuntimeRun } from '../../runtime/observability/validation-receipt.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('handoff writer creates a local MAHP envelope with run provenance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-handoff-'));
  const context = createRunContext({ repoRoot: root, mode: 'dry-run', entrypoint: 'test' });
  fs.mkdirSync(context.runDir, { recursive: true });
  fs.writeFileSync(path.join(context.runDir, 'validation-receipt.json'), '{"result":"pass"}\n', 'utf8');

  const result = writeHandoffEnvelope({
    context,
    objective: 'Transfer runtime run state to the next local operator.',
    currentStateSummary: 'Runtime dry-run artifacts were produced locally.',
    appliedSteps: [
      {
        step_id: 'runtime-dry-run',
        description: 'Runtime dry-run artifacts created.',
        execution_status: 'verified',
        artifact: { artifact_ref: `artifacts/runtime-runs/${context.runId}/validation-receipt.json`, artifact_type: 'validation-receipt' },
        verification_reference: `artifacts/runtime-runs/${context.runId}/validation-receipt.json`
      }
    ],
    acceptanceCriteria: [
      {
        criterion_id: 'handoff-readable',
        description: 'Envelope can be read from the local run artifact directory.',
        verification_method: 'readHandoffEnvelope'
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.envelope.mahp_version, '1.0.0');
  assert.equal(result.envelope.emitter.run_id, context.runId);
  assert.equal(result.envelope.provenance_chain[0].run_id, context.runId);
  assert.equal(fs.existsSync(path.join(context.runDir, 'handoff-envelope.json')), true);

  const read = readHandoffEnvelope({ runDir: context.runDir });
  assert.equal(read.ok, true);
  assert.equal(read.envelope.envelope_id, result.envelope.envelope_id);
});

test('resource governor blocks timeout, budget, and cancellation marker cases', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-resource-'));
  const context = createRunContext({ repoRoot: root, mode: 'dry-run', entrypoint: 'test' });
  fs.mkdirSync(context.runDir, { recursive: true });
  const governor = createResourceGovernor({
    context,
    timeoutMs: 100,
    budgetCap: 2,
    cancellationMarker: path.join(context.runDir, 'CANCEL')
  });

  assert.equal(governor.checkTimeout({ startedAtMs: 0, nowMs: 101 }).ok, false);
  assert.equal(governor.checkBudget({ plannedActions: 3 }).ok, false);
  fs.writeFileSync(path.join(context.runDir, 'CANCEL'), 'cancel\n', 'utf8');
  assert.equal(governor.checkCancellation().ok, false);
});

test('runtime dry-run writes handoff and resource artifacts that validate and replay', () => {
  const output = execFileSync(process.execPath, ['runtime/cli/runtime-dry-run.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const parsed = JSON.parse(output);

  assert.equal(fs.existsSync(path.join(parsed.runDir, 'handoff-envelope.json')), true);
  assert.equal(fs.existsSync(path.join(parsed.runDir, 'resources.json')), true);

  const validation = validateRuntimeRun({ repoRoot, runId: parsed.runId });
  assert.equal(validation.ok, true);
  assert.equal(validation.handoffEnvelope.emitter.run_id, parsed.runId);
  assert.equal(validation.resources.result, 'pass');

  const replay = replayRuntimeRun({ repoRoot, runId: parsed.runId });
  assert.equal(replay.ok, true);
  assert.equal(replay.handoff.envelope_id, validation.handoffEnvelope.envelope_id);
  assert.equal(replay.resources.result, 'pass');
});
