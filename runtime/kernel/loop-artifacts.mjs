import fs from 'node:fs';
import path from 'node:path';

// CLG P2 loop artifact writers. Runtime state and transition records are
// persisted into the active run directory; every write is gated through the
// deny-by-default permission engine like every other runtime artifact.

const RUNTIME_STATE_ARTIFACT_VERSION = '1.0.0';

function writeRuntimeState({ context, permissionEngine, runtimeState }) {
  const issues = [];
  const statePath = path.join(context.runDir, 'runtime-state.json');
  const permission = permissionEngine.decide({ claim: 'filesystem.write', target: statePath });
  if (permission.decision !== 'allow') {
    return { ok: false, issues: [`runtime-state.json write denied: ${permission.reason}`], statePath: null };
  }
  const payload = {
    artifact: 'clg-runtime-state',
    version: RUNTIME_STATE_ARTIFACT_VERSION,
    runId: context.runId,
    writtenAt: new Date().toISOString(),
    runtimeState
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { ok: true, issues, statePath };
}

function writeTransitionRecords({ context, permissionEngine, transitionRecords }) {
  const issues = [];
  const recordsPath = path.join(context.runDir, 'transitions.jsonl');
  const permission = permissionEngine.decide({ claim: 'filesystem.write', target: recordsPath });
  if (permission.decision !== 'allow') {
    return { ok: false, issues: [`transitions.jsonl write denied: ${permission.reason}`], recordsPath: null };
  }
  fs.mkdirSync(path.dirname(recordsPath), { recursive: true });
  fs.appendFileSync(recordsPath, transitionRecords.map((record) => JSON.stringify(record)).join('\n') + (transitionRecords.length > 0 ? '\n' : ''), 'utf8');
  return { ok: true, issues, recordsPath };
}

function writeLoopArtifacts({ context, permissionEngine, runtimeState, transitionRecords = [] }) {
  const issues = [];
  const stateWrite = writeRuntimeState({ context, permissionEngine, runtimeState });
  issues.push(...stateWrite.issues);
  const recordsWrite = writeTransitionRecords({ context, permissionEngine, transitionRecords });
  issues.push(...recordsWrite.issues);
  return {
    ok: stateWrite.ok && recordsWrite.ok,
    issues,
    statePath: stateWrite.statePath,
    recordsPath: recordsWrite.recordsPath
  };
}

export { RUNTIME_STATE_ARTIFACT_VERSION, writeLoopArtifacts, writeRuntimeState, writeTransitionRecords };
