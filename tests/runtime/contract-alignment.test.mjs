import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';
import { createLoopController } from '../../runtime/kernel/loop-controller.mjs';
import { createCheckpoint } from '../../runtime/kernel/checkpoint-store.mjs';
import { loadCheckpoint } from '../../runtime/kernel/checkpoint-store.mjs';
import { appendEvent } from '../../runtime/kernel/runtime-event-log.mjs';
import { createResourceLedger } from '../../runtime/resources/resource-ledger.mjs';

// CLG-P8 contract alignment: persisted runtime artifacts must validate against
// the canonical core/contracts schemas (D6), and pre-P8 persisted records must
// remain readable after the alignment (D7). The inline JS validators stay the
// semantic authority; the schemas are their machine-readable projection.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PY_CHECK = `
import json, sys
from jsonschema import Draft202012Validator
schema = json.load(open(sys.argv[1], encoding="utf-8"))
instance = json.load(open(sys.argv[2], encoding="utf-8"))
Draft202012Validator.check_schema(schema)
errors = sorted(Draft202012Validator(schema).iter_errors(instance), key=lambda e: list(e.path))
if errors:
    for err in errors:
        print(".".join(str(p) for p in err.absolute_path) or "(root)", "->", err.message)
    sys.exit(1)
print("VALID")
`;

function schemaPass(contractFile, instance) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p8-'));
  const instancePath = path.join(tmp, 'instance.json');
  fs.writeFileSync(instancePath, JSON.stringify(instance), 'utf8');
  try {
    execFileSync('python3', ['-c', PY_CHECK, path.join(repoRoot, 'core', 'contracts', contractFile), instancePath], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function schemaIssues(contractFile, instance) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p8-'));
  const instancePath = path.join(tmp, 'instance.json');
  fs.writeFileSync(instancePath, JSON.stringify(instance), 'utf8');
  try {
    execFileSync('python3', ['-c', PY_CHECK, path.join(repoRoot, 'core', 'contracts', contractFile), instancePath], { stdio: 'pipe' });
    return [];
  } catch (error) {
    return String(error.stdout ?? error).trim().split('\n').filter((line) => line.length > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p8-run-'));
  const context = createRunContext({ repoRoot: root });
  const permissionEngine = createPermissionEngine(context);
  const controller = createLoopController();
  let state = {
    rtc_version: '1.0.0',
    task_ref: 'task-1',
    lifecycle_state: 'candidate',
    verification_status: 'unverified',
    retry_count: 0,
    replan_count: 0,
    context_generation: 0
  };
  for (const step of ['scoped', 'planned', 'policy_checked', 'ready', 'running']) {
    state = controller.applyTransition({ runtimeState: state, to: step }).runtimeState;
  }
  const ledger = createResourceLedger({
    repoRoot: root,
    runRef: context.runId,
    taskRef: 'task-1',
    budget: { budget_id: 'budget-1', limits: { max_effects: 5 } }
  });
  return { root, context, permissionEngine, runtimeState: state, ledger };
}

function teardown(env) {
  fs.rmSync(env.root, { recursive: true, force: true });
}

// ---------- D6: runtime-produced artifacts -> canonical schema PASS ----------

test('D6: runtime-produced checkpoint envelope validates against clg-checkpoint-envelope.json', () => {
  const env = setup();
  try {
    const created = createCheckpoint({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: env.runtimeState,
      reason: 'manual'
    });
    assert.equal(created.ok, true);
    assert.equal(schemaPass('clg-checkpoint-envelope.json', created.checkpoint), true);
  } finally {
    teardown(env);
  }
});

test('D6: runtime-produced runtime event validates against clg-runtime-event.json', () => {
  const env = setup();
  try {
    const emitted = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      taskRef: 'task-1',
      eventType: 'RUN_CREATED',
      actorRef: 'runtime/cli/runtime-dry-run.mjs',
      subjectRef: 'task-1',
      correlationRef: env.context.runId,
      causationRef: null,
      payloadRef: null,
      payload: { note: 'contract alignment fixture' }
    });
    assert.equal(emitted.ok, true);
    assert.equal(schemaPass('clg-runtime-event.json', emitted.event), true);
  } finally {
    teardown(env);
  }
});

test('D6: runtime-produced resource usage record validates against clg-resource-usage-record.json', () => {
  const env = setup();
  try {
    const appended = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-align-1' });
    assert.equal(appended.ok, true);
    assert.equal(appended.record.record_version, '1.0.0');
    assert.equal(schemaPass('clg-resource-usage-record.json', appended.record), true);
  } finally {
    teardown(env);
  }
});

// ---------- D6: missing required field / unexpected field / unknown version -> DENY ----------

test('D6: missing required field -> schema DENY (all three persisted classes)', () => {
  const env = setup();
  try {
    const created = createCheckpoint({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: env.runtimeState,
      reason: 'manual'
    });
    const withoutReason = { ...created.checkpoint };
    delete withoutReason.reason;
    assert.equal(schemaPass('clg-checkpoint-envelope.json', withoutReason), false);

    const emitted = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      taskRef: 'task-1',
      eventType: 'RUN_CREATED',
      actorRef: 'x',
      subjectRef: 'task-1',
      correlationRef: env.context.runId,
      payload: {}
    });
    const withoutPayloadDigest = { ...emitted.event };
    delete withoutPayloadDigest.payload_digest;
    assert.equal(schemaPass('clg-runtime-event.json', withoutPayloadDigest), false);

    const appended = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x' });
    const withoutSource = { ...appended.record };
    delete withoutSource.source_ref;
    assert.equal(schemaPass('clg-resource-usage-record.json', withoutSource), false);
  } finally {
    teardown(env);
  }
});

test('D6: unexpected field -> schema DENY (strict additionalProperties)', () => {
  const env = setup();
  try {
    const created = createCheckpoint({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: env.runtimeState,
      reason: 'manual'
    });
    const sneaky = { ...created.checkpoint, tenant_authority: 'nope' };
    const issues = schemaIssues('clg-checkpoint-envelope.json', sneaky);
    assert.equal(issues.length > 0, true);

    const appended = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x' });
    assert.equal(schemaPass('clg-resource-usage-record.json', { ...appended.record, fabricated_cost: 42 }), false);
  } finally {
    teardown(env);
  }
});

test('D6: unknown version -> schema DENY (checkpoint contract_version, event runtime_version, usage record_version)', () => {
  const env = setup();
  try {
    const created = createCheckpoint({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: env.runtimeState,
      reason: 'manual'
    });
    assert.equal(schemaPass('clg-checkpoint-envelope.json', { ...created.checkpoint, contract_version: '9.9.9' }), false);

    const emitted = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      taskRef: 'task-1',
      eventType: 'RUN_CREATED',
      actorRef: 'x',
      subjectRef: 'task-1',
      correlationRef: env.context.runId,
      payload: {}
    });
    assert.equal(schemaPass('clg-runtime-event.json', { ...emitted.event, runtime_version: '9.9.9' }), false);

    const appended = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x' });
    assert.equal(schemaPass('clg-resource-usage-record.json', { ...appended.record, record_version: '9.9.9' }), false);
  } finally {
    teardown(env);
  }
});

// ---------- D6: contract-valid but semantic-invalid -> semantic validator DENY ----------

test('D6: schema-valid usage record with tampered amount -> semantic validator denies (ledger tainted)', () => {
  const env = setup();
  try {
    const appended = env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x' });
    assert.equal(schemaPass('clg-resource-usage-record.json', appended.record), true);
    const ledgerPath = env.ledger.ledgerPath;
    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')[0]);
    raw.amount = 999;
    fs.writeFileSync(ledgerPath, `${JSON.stringify(raw)}\n`);
    assert.equal(schemaPass('clg-resource-usage-record.json', raw), true);
    const read = env.ledger.readLedger();
    assert.equal(read.tainted, true);
    assert.equal(env.ledger.admit({ resourceType: 'effects', amount: 1 }).reason, 'LEDGER_TAINTED');
  } finally {
    teardown(env);
  }
});

test('D6: schema-valid checkpoint with tampered runtime_state -> semantic validator denies (digest mismatch)', () => {
  const env = setup();
  try {
    const created = createCheckpoint({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.context.runId,
      runtimeState: env.runtimeState,
      reason: 'manual'
    });
    const raw = JSON.parse(fs.readFileSync(created.checkpointPath, 'utf8'));
    raw.runtime_state.retry_count = 42;
    fs.writeFileSync(created.checkpointPath, JSON.stringify(raw));
    assert.equal(schemaPass('clg-checkpoint-envelope.json', raw), true);
    const loaded = loadCheckpoint({ repoRoot: env.root, checkpointRef: created.checkpointRef });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.denied, 'DIGEST_MISMATCH');
  } finally {
    teardown(env);
  }
});

// ---------- D7: historical compatibility ----------

test('D7: historical pre-P8 usage record (no record_version, valid digest) stays readable and counts', () => {
  const env = setup();
  try {
    const appended = env.ledger.appendUsage({ resourceType: 'effects', amount: 2, sourceRef: 'rcp-hist' });
    const ledgerPath = env.ledger.ledgerPath;
    const historical = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')[0]);
    delete historical.record_version;
    fs.writeFileSync(ledgerPath, `${JSON.stringify(historical)}\n`);

    const fresh = createResourceLedger({
      repoRoot: env.root,
      runRef: env.context.runId,
      taskRef: 'task-1',
      budget: { budget_id: 'budget-1', limits: { max_effects: 5 } }
    });
    const read = fresh.readLedger();
    assert.equal(read.ok, true);
    assert.equal(read.tainted, false);
    assert.equal(read.records.length, 1);
    assert.equal(fresh.currentUsage('effects').consumed, 2);
    assert.equal(schemaPass('clg-resource-usage-record.json', historical), true);
  } finally {
    teardown(env);
  }
});

test('D7: unknown record_version on a present field -> semantic DENY (no silent migration)', () => {
  const env = setup();
  try {
    env.ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp-x' });
    const ledgerPath = env.ledger.ledgerPath;
    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')[0]);
    raw.record_version = '9.9.9';
    fs.writeFileSync(ledgerPath, `${JSON.stringify(raw)}\n`);
    const read = env.ledger.readLedger();
    assert.equal(read.tainted, true);
    assert.ok(read.issues.some((issue) => issue.includes('record_version')));
  } finally {
    teardown(env);
  }
});

// ---------- vocabulary alignment ----------

test('lifecycle_state: kernel SM vocabulary PASS, non-runtime states DENY at contract level', () => {
  const base = {
    rtc_version: '1.0.0',
    task_ref: 'TASK-1',
    verification_status: 'passed',
    latest_verification_ref: 'VR-1'
  };
  assert.equal(schemaPass('clg-runtime-state.json', { ...base, lifecycle_state: 'running' }), true);
  assert.equal(schemaPass('clg-runtime-state.json', { ...base, lifecycle_state: 'contained' }), true);
  const executing = schemaIssues('clg-runtime-state.json', { ...base, lifecycle_state: 'executing' });
  assert.equal(executing.length > 0, true);
  const bogus = schemaIssues('clg-runtime-state.json', { ...base, lifecycle_state: 'bogus-state' });
  assert.equal(bogus.length > 0, true);
});
