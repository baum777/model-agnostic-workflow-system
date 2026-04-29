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

  const { receipt } = writeValidationReceipt(context, checks);
  return { ok: receipt.result === 'pass', context, checks, receipt };
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
