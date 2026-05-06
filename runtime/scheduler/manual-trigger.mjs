import fs from 'node:fs';
import path from 'node:path';

const TSC_VERSION = '1.0.0';

function createManualTrigger({ context, workflowId = 'runtime-dry-run' }) {
  if (!context?.runId || !context?.runDir) {
    return {
      ok: false,
      issues: ['Manual trigger requires an active runtime context.']
    };
  }

  return {
    ok: true,
    issues: [],
    trigger: {
      tsc_version: TSC_VERSION,
      workflow_id: workflowId,
      trigger_type: 'manual',
      max_concurrent_runs: 1,
      runId: context.runId,
      createdAt: new Date().toISOString(),
      explicitCommand: context.entrypoint,
      autoStart: false,
      backgroundJobs: false,
      httpMcp: false
    }
  };
}

function runManualTrigger({ context, workflowId = 'runtime-dry-run' }) {
  const created = createManualTrigger({ context, workflowId });
  if (!created.ok) {
    return created;
  }

  const triggerPath = path.join(context.runDir, 'trigger.json');
  fs.mkdirSync(path.dirname(triggerPath), { recursive: true });
  fs.writeFileSync(triggerPath, `${JSON.stringify(created.trigger, null, 2)}\n`, 'utf8');

  return {
    ...created,
    triggerPath
  };
}

export { TSC_VERSION, createManualTrigger, runManualTrigger };
