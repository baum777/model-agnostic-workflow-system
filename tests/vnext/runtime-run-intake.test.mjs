// MAWS-VN runtime:run intake binding (S2b wave 1) — WorkUnit -> Unitera
// Systems execution-control chain. Proves: (1) the committed reference spec
// binds the effect stage through the ExecutionIntakeBinding contract and the
// fixture executor, emitting intent-bindings.json with not_asserted business
// outcome; (2) contract-invalid or mis-keyed intake bindings fail closed;
// (3) live transports cannot even validate (fixture-only contract); (4) the
// runtime rights transition and work-unit binding are enforced deny-by-default.
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maws-runtime-intake-'));
}

function writeSpec(mutator) {
  const spec = JSON.parse(fs.readFileSync(exampleSpecPath, 'utf8'));
  mutator(spec);
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return { specPath, dir };
}

test('reference spec binds the effect stage through the execution-control fixture with honest outcome semantics', async () => {
  const outDir = path.join(tmpDir(), 'run');
  const { summary, runDir } = await runRuntimeRun({ specPath: exampleSpecPath, outDir });

  assert.equal(summary.status, 'COMPLETED');
  const effect = summary.executor_bindings.find((binding) => binding.stage === 'effect');
  assert.equal(effect.executor_id, 'exec_unitera_execution_control_fixture');
  assert.equal(summary.intake_bindings.length, 1);
  assert.equal(summary.intake_bindings[0].binding_id, 'eib_reference_email_send_0001');
  assert.equal(summary.intake_bindings[0].status, 'executed');
  assert.equal(summary.intake_bindings[0].business_outcome, 'not_asserted');

  const intentPath = path.join(runDir, 'intent-bindings.json');
  assert.ok(fs.existsSync(intentPath), 'intent-bindings.json must be part of the evidence bundle');
  const records = JSON.parse(fs.readFileSync(intentPath, 'utf8'));
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.work_unit_id, 'wu_run_cli_reference_audit_0001_root');
  assert.equal(record.business_outcome, 'not_asserted');
  assert.equal(record.rights_transition.expected_side_effect_class, 'external_commit');
  assert.equal(record.commitment_context.commitment_run_id, 'cr_fixture_reference_0001');
  assert.deepEqual(record.chain.map((step) => step.step),
    ['prepare', 'evaluate', 'clearances', 'authorize', 'execute', 'reconcile']);
  assert.ok(record.chain.every((step) => step.status === 'OK'));
});

test('a live intake transport cannot even validate (fixture-only contract, fail closed)', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_intake_live_transport_0001';
    spec.intake_bindings.exec_unitera_execution_control_fixture.target.transport = 'live_http';
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_INTAKE_BINDING_INVALID' && /transport/.test(error.message)
  );
});

test('intake bindings may only target the execution-control fixture executor', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_intake_wrong_executor_0001';
    spec.intake_bindings.exec_local_tests = spec.intake_bindings.exec_unitera_execution_control_fixture;
    delete spec.intake_bindings.exec_unitera_execution_control_fixture;
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_INTAKE_BINDING_INVALID' && /exec_unitera_execution_control_fixture/.test(error.message)
  );
});

test('an intake binding without a matching executor binding fails closed', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_intake_no_binding_0001';
    delete spec.executor_bindings.exec_unitera_execution_control_fixture;
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'SPEC_INTAKE_BINDING_INVALID' && /without a matching executor_bindings entry/.test(error.message)
  );
});

test('the runtime rights transition is deny-by-default on scope mismatch', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_intake_scope_mismatch_0001';
    spec.intake_bindings.exec_unitera_execution_control_fixture.work_unit_id = 'wu_run_intake_scope_mismatch_0001_root';
    spec.intake_bindings.exec_unitera_execution_control_fixture.rights_transition.authority_ceiling_ref = 'scope/not_granted';
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'INTAKE_AUTHORITY_ENVELOPE_MISMATCH' && /scope\/not_granted/.test(error.message)
  );
});

test('the runtime rights transition is deny-by-default on missing effects', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_intake_effect_mismatch_0001';
    spec.intake_bindings.exec_unitera_execution_control_fixture.work_unit_id = 'wu_run_intake_effect_mismatch_0001_root';
    spec.intake_bindings.exec_unitera_execution_control_fixture.rights_transition.allowed_effects = ['external'];
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'INTAKE_AUTHORITY_ENVELOPE_MISMATCH' && /does not grant/.test(error.message)
  );
});

test('the binding only attests its own work unit', async () => {
  const { specPath, dir } = writeSpec((spec) => {
    spec.run_id = 'run_intake_wu_mismatch_0001';
    spec.intake_bindings.exec_unitera_execution_control_fixture.work_unit_id = 'wu_some_other_root';
  });
  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error.code === 'INTAKE_WORK_UNIT_MISMATCH' && /wu_some_other_root/.test(error.message)
  );
});
