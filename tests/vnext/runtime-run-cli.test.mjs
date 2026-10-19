// MAWS-VN runtime:run CLI — operational-entry qualification.
// Proves: (1) the committed reference spec completes through the real
// executeWorkRun pipeline with artifacts + spine events; (2) the CLI child
// process is an operational entry point (exit 0); (3) completion is honest —
// a fixture that does not produce a required output cannot reach COMPLETED;
// (4) availability is deny-by-default; (5) live/unknown transports and
// unknown executors fail closed with typed errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { runRuntimeRun } from '../../runtime/cli/runtime-run.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exampleSpecPath = path.join(root, 'runtime/cli/specs/reference-audit-v1.json');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maws-runtime-run-'));
}

function writeSpec(mutator) {
  const spec = JSON.parse(fs.readFileSync(exampleSpecPath, 'utf8'));
  mutator(spec);
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return { specPath, dir };
}

test('committed reference spec completes through runtime:run with full evidence bundle', async () => {
  const outDir = path.join(tmpDir(), 'run');
  const { summary, events, runDir } = await runRuntimeRun({ specPath: exampleSpecPath, outDir });

  assert.equal(summary.status, 'COMPLETED');
  assert.equal(summary.ok, true);
  assert.equal(summary.completion_result, 'COMPLETED');
  assert.equal(summary.blocking_reason, null);

  // Deterministic per-stage binding: analysis -> openrouter fixture,
  // verification -> local tests fixture (never the session model, OD-18).
  const analysis = summary.executor_bindings.find((binding) => binding.stage === 'analysis');
  const verification = summary.executor_bindings.find((binding) => binding.stage === 'verification');
  assert.equal(analysis.executor_id, 'exec_openrouter_glm');
  assert.equal(verification.executor_id, 'exec_local_tests');

  for (const artifact of [
    'interaction-session.json', 'work-unit.json', 'completion-contract.json',
    'eligibility-decisions.json', 'routing-decisions.json', 'graph-v1.json',
    'execution-results.json', 'verification-receipts.json', 'completion-decision.json'
  ]) {
    assert.ok(fs.existsSync(path.join(runDir, artifact)), `missing artifact ${artifact}`);
  }
  assert.ok(fs.existsSync(path.join(runDir, 'run-events.jsonl')), 'spine events must be persisted');
  const eventLines = fs.readFileSync(path.join(runDir, 'run-events.jsonl'), 'utf8').trim().split('\n');
  assert.ok(eventLines.length >= events.length, 'event file must contain every spine event');
  assert.ok(events.some((event) => event.type === 'session_intake'));
  assert.ok(events.some((event) => event.type === 'graph_bound'));
  assert.ok(events.some((event) => event.type === 'decision' && event.family === 'completion'));
});

test('runtime:run is an operational CLI entry point (child process, exit 0)', async () => {
  const outDir = path.join(tmpDir(), 'run-cli');
  const { stdout } = await execFileAsync('node', [
    path.join(root, 'runtime/cli/runtime-run.mjs'),
    '--spec', exampleSpecPath,
    '--out', outDir
  ]);
  const summary = JSON.parse(stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.status, 'COMPLETED');
});

test('completion is honest: missing required output blocks COMPLETED even with SUCCESS executors', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_cli_missing_output_0001';
    spec.executor_bindings.exec_openrouter_glm.result.outputs = [];
  });
  const { summary } = await runRuntimeRun({ specPath, outDir: path.join(dir, 'run') });
  assert.equal(summary.status, 'NOT_COMPLETED');
  assert.equal(summary.ok, false);
  assert.equal(summary.completion_result, 'NOT_COMPLETED');
});

test('availability is deny-by-default: undeclared executors are ineligible and the run BLOCKS', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_cli_deny_default_0001';
    spec.availability = {};
  });
  const { summary } = await runRuntimeRun({ specPath, outDir: path.join(dir, 'run') });
  assert.equal(summary.status, 'BLOCKED');
  assert.equal(summary.blocking_reason, 'NO_ELIGIBLE_EXECUTOR');
});

test('live transport fails closed with a typed error and never falls back', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_cli_live_transport_0001';
    spec.executor_bindings.exec_openrouter_glm.transport = 'openrouter_api';
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'RUN_SPEC_TRANSPORT_UNSUPPORTED' && /openrouter_api/.test(error.message)
  );
});

test('unknown executor in bindings fails closed with SPEC_UNKNOWN_EXECUTOR', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_cli_unknown_executor_0001';
    spec.executor_bindings.exec_does_not_exist = { transport: 'fixture', result: { outcome: 'SUCCESS' } };
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_UNKNOWN_EXECUTOR'
  );
});

test('missing spec file fails closed with SPEC_NOT_FOUND', async () => {
  await assert.rejects(
    () => runRuntimeRun({ specPath: path.join(tmpDir(), 'does-not-exist.json') }),
    (error) => error.code === 'SPEC_NOT_FOUND'
  );
});
