import fs from 'node:fs';
import path from 'node:path';
import { findLatestRunDir, readJson, readJsonLines } from './validation-receipt.mjs';

function resolveRunDir({ repoRoot = process.cwd(), runId, latest = false } = {}) {
  const root = path.resolve(repoRoot);
  if (latest) {
    return findLatestRunDir(root);
  }
  if (runId) {
    return path.join(root, 'artifacts', 'runtime-runs', runId);
  }
  return null;
}

function replayRuntimeRun({ repoRoot = process.cwd(), runId, latest = false } = {}) {
  const runDir = resolveRunDir({ repoRoot, runId, latest });
  if (!runDir || !fs.existsSync(runDir)) {
    return {
      ok: false,
      issues: ['Runtime run directory not found.'],
      runDir
    };
  }

  try {
    const manifest = readJson(path.join(runDir, 'manifest.json'));
    const events = readJsonLines(path.join(runDir, 'events.jsonl'));
    const permissions = readJsonLines(path.join(runDir, 'permissions.jsonl'));
    const memory = readJsonLines(path.join(runDir, 'memory.jsonl'));
    const handoff = fs.existsSync(path.join(runDir, 'handoff-envelope.json'))
      ? readJson(path.join(runDir, 'handoff-envelope.json'))
      : null;
    const resources = fs.existsSync(path.join(runDir, 'resources.json'))
      ? readJson(path.join(runDir, 'resources.json'))
      : null;
    const trigger = fs.existsSync(path.join(runDir, 'trigger.json'))
      ? readJson(path.join(runDir, 'trigger.json'))
      : null;
    const serviceActions = fs.existsSync(path.join(runDir, 'service-actions.json'))
      ? readJson(path.join(runDir, 'service-actions.json'))
      : null;
    const validationReceipt = readJson(path.join(runDir, 'validation-receipt.json'));
    const resolvedRunId = manifest.runId ?? path.basename(runDir);

    return {
      ok: true,
      issues: [],
      runId: resolvedRunId,
      runDir,
      manifest,
      events,
      permissions,
      memory,
      validationReceipt,
      summary: {
        runId: resolvedRunId,
        status: manifest.status,
        eventCount: events.length,
        permissionDecisions: permissions.length,
        memoryEntries: memory.length,
        hasHandoff: Boolean(handoff),
        resourceResult: resources?.result ?? null,
        triggerType: trigger?.trigger_type ?? null,
        serviceActionCoverage: serviceActions?.coverage?.coverageComplete ?? null,
        validationResult: validationReceipt.result
      },
      handoff,
      resources,
      trigger,
      serviceActions
    };
  } catch (error) {
    return {
      ok: false,
      issues: [`Runtime replay failed: ${error.message}`],
      runDir
    };
  }
}

export { replayRuntimeRun, resolveRunDir };
