#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeContracts } from '../contracts/load-contracts.mjs';
import { validateLoadedContracts } from '../contracts/validate-contracts.mjs';
import { createRunContext } from '../kernel/runtime-context.mjs';
import { createPermissionEngine } from '../permissions/permission-engine.mjs';
import { createEventWriter } from '../observability/event-writer.mjs';
import { writePermissionLog, writeRunManifest } from '../observability/run-manifest.mjs';
import { writeValidationReceipt } from '../observability/validation-receipt.mjs';
import { writeRuntimeMemoryEntry } from '../memory/memory-writer.mjs';
import { writeHandoffEnvelope } from '../handoff/handoff-writer.mjs';
import { createResourceGovernor } from '../resources/resource-governor.mjs';
import { runManualTrigger } from '../scheduler/manual-trigger.mjs';
import { resolveAuthContext } from '../auth/auth-context.mjs';
import { writeServiceActionReceipts } from '../service/service-action-receipts.mjs';
import { writeServiceRequestReceipts } from '../service/service-request-receipts.mjs';

function runRuntimeDryRun({ repoRoot = process.cwd() } = {}) {
  const context = createRunContext({
    repoRoot,
    mode: 'dry-run',
    entrypoint: 'npm run runtime:dry-run'
  });
  fs.mkdirSync(context.runDir, { recursive: true });

  const permissionEngine = createPermissionEngine(context);
  const loadedContracts = loadRuntimeContracts(context.repoRoot);
  const contractValidation = validateLoadedContracts(loadedContracts);
  const eventWriter = createEventWriter(context, permissionEngine);
  const checks = [];

  checks.push({
    name: 'contracts_loaded',
    result: contractValidation.ok ? 'pass' : 'blocked',
    details: contractValidation.issues
  });

  if (!contractValidation.ok) {
    eventWriter.writeEvent({
      eventName: 'workflow.blocked',
      eventFamily: 'workflow.lifecycle',
      status: 'BLOCKED',
      component: 'contracts',
      message: 'runtime contract loading blocked',
      blockingReasons: ['VALIDATION_FAILED']
    });
    writePermissionLog(context, permissionEngine.decisions);
    writeRunManifest(context, loadedContracts.requiredSources.map((source) => source.relativePath), 'blocked');
    writeValidationReceipt(context, checks);
    return { ok: false, context, checks };
  }

  const startEvent = eventWriter.writeEvent({
    eventName: 'workflow.started',
    eventFamily: 'workflow.lifecycle',
    component: 'kernel',
    message: 'runtime run started'
  });

  const deniedExternal = permissionEngine.decide({
    claim: 'external.http',
    target: 'https://example.com'
  });

  eventWriter.writeEvent({
    eventName: 'permission.check',
    eventFamily: 'workflow.permission',
    status: 'BLOCKED',
    component: 'permissions',
    message: 'external action denied by default',
    blockingReasons: ['PERMISSION_DENIED']
  });

  checks.push({
    name: 'permission_gate_active',
    result: deniedExternal.decision === 'deny' ? 'pass' : 'blocked'
  });
  checks.push({
    name: 'observability_event_written',
    result: startEvent.event_name === 'workflow.started' ? 'pass' : 'blocked'
  });

  writePermissionLog(context, permissionEngine.decisions);
  writeRunManifest(context, loadedContracts.requiredSources.map((source) => source.relativePath), 'completed');

  checks.push({
    name: 'runtime_artifacts_created',
    result: ['manifest.json', 'events.jsonl', 'permissions.jsonl'].every((fileName) => fs.existsSync(path.join(context.runDir, fileName)))
      ? 'pass'
      : 'blocked'
  });

  const { receipt, receiptPath } = writeValidationReceipt(context, checks);
  const memoryWrite = writeRuntimeMemoryEntry({
    context,
    summary: 'Runtime dry-run completed with permission gate active.',
    details: {
      mode: context.mode,
      permissionGate: 'deny-by-default',
      contractSources: loadedContracts.requiredSources.map((source) => source.relativePath)
    },
    provenancePath: receiptPath
  });

  checks.push({
    name: 'memory_policy_enforced',
    result: memoryWrite.ok ? 'pass' : 'blocked',
    details: memoryWrite.issues
  });
  checks.push({
    name: 'runtime_memory_written',
    result: memoryWrite.ok ? 'pass' : 'blocked'
  });

  const handoffWrite = writeHandoffEnvelope({
    context,
    objective: 'Transfer local runtime run state to the next operator.',
    currentStateSummary: 'Runtime dry-run artifacts were produced and validated locally.'
  });
  checks.push({
    name: 'handoff_envelope_written',
    result: handoffWrite.ok ? 'pass' : 'blocked',
    details: handoffWrite.issues
  });

  const resourceGovernor = createResourceGovernor({ context, timeoutMs: 5000, budgetCap: 10 });
  const resourceReport = resourceGovernor.writeReport({ startedAtMs: Date.parse(context.createdAt), nowMs: Date.now(), plannedActions: 3 });
  checks.push({
    name: 'resource_governor_active',
    result: resourceReport.ok ? 'pass' : 'blocked'
  });

  const triggerWrite = runManualTrigger({ context, workflowId: 'runtime-dry-run' });
  checks.push({
    name: 'manual_trigger_written',
    result: triggerWrite.ok ? 'pass' : 'blocked',
    details: triggerWrite.issues
  });

  const serviceIdentity = resolveAuthContext({ fixtureIdentity: 'local-user' });
  const serviceActionReceipts = serviceIdentity.ok
    ? writeServiceActionReceipts({ context, identity: serviceIdentity.identity })
    : { ok: false, issues: serviceIdentity.issues };
  checks.push({
    name: 'service_action_receipts_written',
    result: serviceActionReceipts.ok ? 'pass' : 'blocked',
    details: serviceActionReceipts.issues
  });

  const serviceRequestReceipts = serviceIdentity.ok
    ? writeServiceRequestReceipts({ context, identity: serviceIdentity.identity })
    : { ok: false, issues: serviceIdentity.issues };
  checks.push({
    name: 'service_request_receipts_written',
    result: serviceRequestReceipts.ok ? 'pass' : 'blocked',
    details: serviceRequestReceipts.issues
  });

  const finalReceipt = writeValidationReceipt(context, checks).receipt;
  return { ok: finalReceipt.result === 'pass', context, checks, receipt: finalReceipt };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = runRuntimeDryRun();
    console.log(JSON.stringify({
      ok: result.ok,
      runId: result.context.runId,
      runDir: result.context.runDir.replace(/\\/g, '/'),
      checks: result.checks
    }, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  }
}

export { runRuntimeDryRun };
