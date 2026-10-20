// MAWS-VN runtime:run context envelope (S3 wave A) — context budgeting in
// the actual execution path. Proves: (1) the reference spec declares its
// envelope and records the budget verdict (event + evidence artifact); (2) a
// context estimate above the declared budget fails closed; (3) declared
// executor tokens that do not fit the envelope fail closed; (4) a missing or
// schema-invalid envelope fails closed. No silent truncation anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runRuntimeRun } from '../../runtime/cli/runtime-run.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exampleSpecPath = path.join(root, 'runtime/cli/specs/reference-audit-v1.json');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maws-runtime-budget-'));
}

function writeSpec(mutator) {
  const spec = JSON.parse(fs.readFileSync(exampleSpecPath, 'utf8'));
  mutator(spec);
  for (const binding of Object.values(spec.intake_bindings || {})) {
    if (binding.work_unit_id === 'wu_run_cli_reference_audit_0001_root') {
      binding.work_unit_id = `wu_${spec.run_id}_root`;
    }
  }
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return { specPath, dir };
}

test('the reference spec declares its envelope and records the budget verdict', async () => {
  const outDir = path.join(tmpDir(), 'run');
  const { summary, runDir, events } = await runRuntimeRun({ specPath: exampleSpecPath, outDir });
  assert.equal(summary.status, 'COMPLETED');

  const budgetEvent = events.find((event) => event.family === 'resource' && event.type === 'budget_check');
  assert.ok(budgetEvent, 'resource.budget_check must be emitted');
  assert.equal(budgetEvent.details.budget_scope, 'run');
  assert.equal(budgetEvent.details.unit, 'tokens');
  assert.equal(budgetEvent.details.budget_limit, 4096);
  assert.equal(budgetEvent.details.verdict, 'WITHIN_BUDGET');
  assert.ok(budgetEvent.details.budget_used <= budgetEvent.details.budget_limit);

  const envelopePath = path.join(runDir, 'context-envelope.json');
  assert.ok(fs.existsSync(envelopePath), 'context-envelope.json must be part of the evidence bundle');
  const record = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
  assert.equal(record.envelope.envelope_id, 'ctx_reference_audit_0001');
  assert.equal(record.verdict, 'WITHIN_BUDGET');
  assert.equal(record.execution_token_usage.exec_openrouter_glm, 10);

  // The work unit's context_envelope_ref is the DECLARED envelope id — the
  // synthetic dead reference is gone.
  const workUnit = JSON.parse(fs.readFileSync(path.join(runDir, 'work-unit.json'), 'utf8'));
  assert.equal(workUnit.context_envelope_ref, 'ctx_reference_audit_0001');
});

test('cumulative per-invocation usage is enforced: a budget-exceeding run never reports COMPLETED', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_budget_multi_stage_0001';
    spec.context_envelope = { envelope_id: 'ctx_budget_multi_stage_0001', token_budget: 32 };
    spec.template.mandatory_stages = ['analysis', 'analysis2', 'effect', 'verification'];
    spec.work_request.stageCapabilities.analysis2 = ['cap_repository_analysis'];
  });
  const outDir = path.join(dir, 'run');
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir }),
    (error) => error.code === 'RUN_CONTEXT_BUDGET_EXCEEDED' && /never reports COMPLETED/.test(error.message)
  );
  // The evidence bundle keeps the honest record: exceeded verdict + declared
  // budget_exceeded event with BUDGET_EXHAUSTED error class.
  const record = JSON.parse(fs.readFileSync(path.join(outDir, 'context-envelope.json'), 'utf8'));
  assert.equal(record.verdict, 'EXCEEDED_AT_RUNTIME');
  assert.equal(record.execution_token_usage.exec_openrouter_glm, 20);
  const eventLines = fs.readFileSync(path.join(outDir, 'run-events.jsonl'), 'utf8').trim().split('\n');
  const exceeded = eventLines.map((line) => JSON.parse(line)).find((event) => event.type === 'budget_exceeded');
  assert.ok(exceeded, 'resource.budget_exceeded must be emitted');
  assert.equal(exceeded.details.error_class, 'BUDGET_EXHAUSTED');
});

test('the estimate measures UTF-8 bytes, not UTF-16 code units', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_budget_utf8_0001';
    spec.context_envelope = { envelope_id: 'ctx_budget_utf8_0001', token_budget: 16 };
    spec.work_request.objective = '€'.repeat(40);
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_CONTEXT_BUDGET_EXCEEDED' && /no silent truncation/.test(error.message)
  );
});

test('a context estimate above the declared budget fails closed (no silent truncation)', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_budget_payload_over_0001';
    spec.context_envelope = { envelope_id: 'ctx_budget_payload_over_0001', token_budget: 4 };
    spec.work_request.boundedPayload = { blob: 'x'.repeat(400) };
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_CONTEXT_BUDGET_EXCEEDED' && /no silent truncation/.test(error.message)
  );
});

test('declared executor tokens that do not fit the envelope fail closed', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_budget_tokens_over_0001';
    spec.context_envelope = { envelope_id: 'ctx_budget_tokens_over_0001', token_budget: 32 };
    spec.executor_bindings.exec_openrouter_glm.result.metrics.tokens_in = 4096;
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_CONTEXT_BUDGET_EXCEEDED' && /under-dimensioned/.test(error.message)
  );
});

test('a missing context envelope fails closed', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_budget_missing_0001';
    delete spec.context_envelope;
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_INVALID' && /context_envelope/.test(error.message)
  );
});

test('a schema-invalid context envelope fails closed (SPEC_CONTEXT_ENVELOPE_INVALID)', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_budget_invalid_0001';
    spec.context_envelope = { envelope_id: 'not-ctx-prefixed', token_budget: 0 };
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_CONTEXT_ENVELOPE_INVALID'
  );
});
