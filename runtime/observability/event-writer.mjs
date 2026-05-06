import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function makeEvent(context, { eventName, eventFamily, status = 'SUCCESS', message, component, blockingReasons = [] }) {
  const ts = new Date().toISOString();
  const event = {
    event_id: `evt_${crypto.randomBytes(4).toString('hex')}`,
    event_name: eventName,
    event_family: eventFamily,
    timestamp: ts,
    workflow: {
      workflow_class: 'runtime.phase1',
      run_id: context.runId
    },
    actor: {
      actor_type: 'system',
      actor_id: 'local-runtime'
    },
    correlation: {
      trace_id: context.runId,
      span_id: `span_${crypto.randomBytes(4).toString('hex')}`
    },
    provenance: {
      claim_state: 'observed',
      source: {
        origin_type: 'command',
        origin_ref: context.entrypoint
      },
      captured_at: ts
    },
    outcome: {
      status,
      message
    },
    attributes: {
      'runtime.component': component
    }
  };

  if (status === 'BLOCKED') {
    event.outcome.blocking_reasons = blockingReasons.length > 0 ? blockingReasons : ['POLICY_BLOCKED'];
  }

  return event;
}

function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function createEventWriter(context, permissionEngine) {
  const eventsPath = path.join(context.runDir, 'events.jsonl');

  function writeEvent(input) {
    const permission = permissionEngine.decide({
      claim: 'filesystem.write',
      target: eventsPath
    });
    if (permission.decision !== 'allow') {
      throw new Error(`Runtime event write denied: ${permission.reason}`);
    }

    const event = makeEvent(context, input);
    appendJsonLine(eventsPath, event);
    return event;
  }

  return {
    eventsPath,
    writeEvent
  };
}

export { appendJsonLine, createEventWriter, makeEvent };
