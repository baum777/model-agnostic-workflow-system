import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  auditMemoryVerifications,
  resolveResourceUsageSource,
  validateEvidenceChain,
  validateResourceUsageBindings
} from '../../runtime/kernel/evidence-chain.mjs';
import { appendEvent } from '../../runtime/kernel/runtime-event-log.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';
import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createResourceLedger } from '../../runtime/resources/resource-ledger.mjs';
import { createMemoryCandidate, verifyMemory } from '../../runtime/memory/memory-lifecycle.mjs';
import { sha256OfCanonical } from '../../runtime/kernel/checkpoint-integrity.mjs';

// CLG P9 evidence-chain integrity: a well-formed artifact with an unresolvable
// or wrongly-bound reference must be reported as an integrity failure, not
// silently accepted (P9-I9 substitution/tamper matrix).

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p9-'));
  const context = createRunContext({ repoRoot: root });
  const permissionEngine = createPermissionEngine(context);
  return { root, context, permissionEngine, runRef: context.runId };
}

function teardown(env) {
  fs.rmSync(env.root, { recursive: true, force: true });
}

let eventCounter = 0;

function emit(env, { eventType, subjectRef = 'task-1', correlationRef, causationRef = null, payloadRef = null, payload = {} }) {
  eventCounter += 1;
  const result = appendEvent({
    repoRoot: env.root,
    permissionEngine: env.permissionEngine,
    runRef: env.runRef,
    taskRef: 'task-1',
    eventType,
    actorRef: `actor-${eventCounter}`,
    subjectRef,
    correlationRef,
    causationRef,
    payloadRef,
    payload
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.event;
}

// Builds the canonical authorized-effect chain for one proposal correlation.
function emitAuthorizedEffectChain(env, correlationRef, receiptId) {
  const authority = emit(env, { eventType: 'AUTHORITY_EVALUATED', correlationRef, payload: { decision: 'ALLOW' } });
  const attempted = emit(env, { eventType: 'EFFECT_ATTEMPTED', correlationRef, causationRef: authority.event_id, payload: {} });
  const receipt = emit(env, {
    eventType: 'EFFECT_RECEIPT_RECORDED',
    correlationRef,
    causationRef: attempted.event_id,
    payloadRef: `receipt:${receiptId}`,
    payload: { receipt_id: receiptId }
  });
  const observation = emit(env, { eventType: 'OBSERVATION_RECORDED', correlationRef, causationRef: receipt.event_id, payload: { observation_id: `obs_${receiptId}` } });
  const verification = emit(env, { eventType: 'VERIFICATION_RECORDED', correlationRef, causationRef: observation.event_id, payload: { verification_id: 'vr-1', result: 'PASS' } });
  return { authority, attempted, receipt, observation, verification };
}

// ---------- P9-I6: chain validation ----------

test('valid authorized-effect chain -> PASS with resolved refs', () => {
  const env = setup();
  try {
    const chain = emitAuthorizedEffectChain(env, 'prp-1', 'rcp_1');
    const result = validateEvidenceChain({ repoRoot: env.root, runRef: env.runRef, correlationRef: 'prp-1', taskRef: 'task-1' });
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.resolved_refs, [
      chain.authority.event_id,
      chain.attempted.event_id,
      chain.receipt.event_id,
      chain.observation.event_id,
      chain.verification.event_id
    ]);
    assert.equal(result.failures.length, 0);
  } finally {
    teardown(env);
  }
});

test('denied-action prefix chain (authority only) -> PASS (prefixes are legal)', () => {
  const env = setup();
  try {
    emit(env, { eventType: 'AUTHORITY_EVALUATED', correlationRef: 'prp-deny', payload: { decision: 'DENY' } });
    const result = validateEvidenceChain({ repoRoot: env.root, runRef: env.runRef, correlationRef: 'prp-deny', taskRef: 'task-1' });
    assert.equal(result.status, 'PASS');
  } finally {
    teardown(env);
  }
});

test('causation_ref pointing to a nonexistent event -> FAIL (unresolvable link)', () => {
  const env = setup();
  try {
    emit(env, { eventType: 'AUTHORITY_EVALUATED', correlationRef: 'prp-2', payload: {} });
    emit(env, { eventType: 'EFFECT_ATTEMPTED', correlationRef: 'prp-2', causationRef: 'evt_nonexistent', payload: {} });
    const result = validateEvidenceChain({ repoRoot: env.root, runRef: env.runRef, correlationRef: 'prp-2', taskRef: 'task-1' });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.some((failure) => failure.includes('does not resolve')));
  } finally {
    teardown(env);
  }
});

test('stage order inversion (verification before receipt) -> FAIL', () => {
  const env = setup();
  try {
    const authority = emit(env, { eventType: 'AUTHORITY_EVALUATED', correlationRef: 'prp-3', payload: {} });
    const attempted = emit(env, { eventType: 'EFFECT_ATTEMPTED', correlationRef: 'prp-3', causationRef: authority.event_id, payload: {} });
    const verification = emit(env, { eventType: 'VERIFICATION_RECORDED', correlationRef: 'prp-3', causationRef: attempted.event_id, payload: {} });
    emit(env, { eventType: 'EFFECT_RECEIPT_RECORDED', correlationRef: 'prp-3', causationRef: verification.event_id, payload: { receipt_id: 'rcp_x' } });
    const result = validateEvidenceChain({ repoRoot: env.root, runRef: env.runRef, correlationRef: 'prp-3', taskRef: 'task-1' });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.some((failure) => failure.includes('order inversion')));
  } finally {
    teardown(env);
  }
});

test('cross-task event inside the chain -> FAIL (task binding)', () => {
  const env = setup();
  try {
    const authority = emit(env, { eventType: 'AUTHORITY_EVALUATED', correlationRef: 'prp-4', payload: {} });
    eventCounter += 1;
    const foreign = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.runRef,
      taskRef: 'task-other',
      eventType: 'EFFECT_ATTEMPTED',
      actorRef: 'actor-x',
      subjectRef: 'task-other',
      correlationRef: 'prp-4',
      causationRef: authority.event_id,
      payload: {}
    });
    assert.equal(foreign.ok, true);
    const result = validateEvidenceChain({ repoRoot: env.root, runRef: env.runRef, correlationRef: 'prp-4', taskRef: 'task-1' });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.some((failure) => failure.includes('cross-task')));
  } finally {
    teardown(env);
  }
});

// ---------- P9-I3/I4/I7: typed usage -> receipt binding ----------

test('usage with a real task-bound receipt -> binding PASS and resolved', () => {
  const env = setup();
  try {
    emitAuthorizedEffectChain(env, 'prp-5', 'rcp_real-1');
    const ledger = createResourceLedger({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp_real-1', correlationRef: 'prp-5' });
    const audit = validateResourceUsageBindings({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    assert.equal(audit.status, 'PASS');
    assert.equal(audit.resolved.length, 1);
    assert.equal(audit.resolved[0].receipt_event_id, audit.resolved[0].receipt_event_id);
    assert.equal(audit.unresolved.length, 0);
  } finally {
    teardown(env);
  }
});

test('usage with nonexistent receipt source_ref -> SOURCE_REF_UNRESOLVED, binding FAIL (B3 gap closed)', () => {
  const env = setup();
  try {
    const ledger = createResourceLedger({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    const appended = ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp_fabricated' });
    assert.equal(appended.ok, true); // write path unchanged (P9-I10) — the resolver exposes it
    const audit = validateResourceUsageBindings({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    assert.equal(audit.status, 'FAIL');
    assert.equal(audit.unresolved[0].reason, 'SOURCE_REF_UNRESOLVED');
  } finally {
    teardown(env);
  }
});

test('schema-valid fabricated usage record stays P8-schema-clean but is chain-FAIL', () => {
  const env = setup();
  try {
    const ledger = createResourceLedger({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    ledger.appendUsage({ resourceType: 'effects', amount: 3, sourceRef: 'rcp_ghost' });
    const read = ledger.readLedger();
    assert.equal(read.ok, true); // individually well-formed (digest-valid)
    const audit = validateResourceUsageBindings({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    assert.equal(audit.status, 'FAIL'); // but chain-invalid: no such receipt exists
  } finally {
    teardown(env);
  }
});

test('ref pointing at a wrong artifact type -> WRONG_ARTIFACT_TYPE deny', () => {
  const env = setup();
  try {
    const resolution = resolveResourceUsageSource({ repoRoot: env.root, runRef: env.runRef, taskRef: 'task-1', sourceRef: 'chk_abc123' });
    assert.equal(resolution.ok, false);
    assert.equal(resolution.denied, 'WRONG_ARTIFACT_TYPE');
  } finally {
    teardown(env);
  }
});

test('receipt event from another task -> TASK_BINDING_MISMATCH deny', () => {
  const env = setup();
  try {
    eventCounter += 1;
    const foreign = appendEvent({
      repoRoot: env.root,
      permissionEngine: env.permissionEngine,
      runRef: env.runRef,
      taskRef: 'task-other',
      eventType: 'EFFECT_RECEIPT_RECORDED',
      actorRef: 'actor-x',
      subjectRef: 'task-other',
      correlationRef: 'prp-foreign',
      payloadRef: 'receipt:rcp_foreign-1',
      payload: { receipt_id: 'rcp_foreign-1' }
    });
    assert.equal(foreign.ok, true);
    const resolution = resolveResourceUsageSource({ repoRoot: env.root, runRef: env.runRef, taskRef: 'task-1', sourceRef: 'rcp_foreign-1' });
    assert.equal(resolution.ok, false);
    assert.equal(resolution.denied, 'TASK_BINDING_MISMATCH');
  } finally {
    teardown(env);
  }
});

// ---------- P9-I8: memory verification binding at rest ----------

test('verified memory with genuine verification -> audit PASS', () => {
  const env = setup();
  try {
    const created = createMemoryCandidate({
      repoRoot: env.root,
      summary: 'observed fact',
      taskRef: 'task-1',
      runRef: env.runRef,
      provenancePath: 'artifacts/runtime-runs/x/events.jsonl'
    });
    assert.equal(created.ok, true);
    const verified = verifyMemory({
      repoRoot: env.root,
      memoryId: created.record.memory_id,
      verificationRecords: [{
        verification_id: 'vr-m1',
        target_ref: created.record.memory_id,
        method: 'method-1',
        verified_at: '2026-09-14T00:00:00.000Z',
        evidence_refs: ['evidence-1'],
        result: 'PASS',
        verifier: { verifier_type: 'external', verifier_ref: 'verifier-1' }
      }]
    });
    assert.equal(verified.ok, true);
    const audit = auditMemoryVerifications({ repoRoot: env.root });
    assert.equal(audit.status, 'PASS');
    assert.equal(audit.audited_records, 1);
  } finally {
    teardown(env);
  }
});

test('digest-tampered memory verification -> reader fail-closed, audit FAIL', () => {
  const env = setup();
  try {
    const created = createMemoryCandidate({
      repoRoot: env.root,
      summary: 'observed fact',
      taskRef: 'task-1',
      runRef: env.runRef,
      provenancePath: 'artifacts/runtime-runs/x/events.jsonl'
    });
    const verified = verifyMemory({
      repoRoot: env.root,
      memoryId: created.record.memory_id,
      verificationRecords: [{
        verification_id: 'vr-m2',
        target_ref: created.record.memory_id,
        method: 'method-1',
        verified_at: '2026-09-14T00:00:00.000Z',
        evidence_refs: ['evidence-1'],
        result: 'PASS',
        verifier: { verifier_type: 'external', verifier_ref: 'verifier-1' }
      }]
    });
    assert.equal(verified.ok, true);
    // Tamper the verifications array in place (digest now mismatched).
    const storePath = path.join(env.root, 'memory', 'stores', 'jsonl', 'clg-memory-records.jsonl');
    const lines = fs.readFileSync(storePath, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[lines.length - 1]);
    tampered.verifications[0].result = 'FAIL';
    lines[lines.length - 1] = JSON.stringify(tampered);
    fs.writeFileSync(storePath, `${lines.join('\n')}\n`);
    const audit = auditMemoryVerifications({ repoRoot: env.root });
    assert.equal(audit.status, 'FAIL'); // reader reports digest failure; audit surfaces it
  } finally {
    teardown(env);
  }
});

test('wrong-subject verification with recomputed valid digest -> reader accepts, audit FAILs the binding', () => {
  const env = setup();
  try {
    const created = createMemoryCandidate({
      repoRoot: env.root,
      summary: 'observed fact',
      taskRef: 'task-1',
      runRef: env.runRef,
      provenancePath: 'artifacts/runtime-runs/x/events.jsonl'
    });
    const verified = verifyMemory({
      repoRoot: env.root,
      memoryId: created.record.memory_id,
      verificationRecords: [{
        verification_id: 'vr-m3',
        target_ref: created.record.memory_id,
        method: 'method-1',
        verified_at: '2026-09-14T00:00:00.000Z',
        evidence_refs: ['evidence-1'],
        result: 'PASS',
        verifier: { verifier_type: 'external', verifier_ref: 'verifier-1' }
      }]
    });
    assert.equal(verified.ok, true);
    // Forge a record that is individually digest-valid but carries a
    // verification targeting a DIFFERENT memory (cross-subject binding).
    const storePath = path.join(env.root, 'memory', 'stores', 'jsonl', 'clg-memory-records.jsonl');
    const lines = fs.readFileSync(storePath, 'utf8').trim().split('\n');
    const forged = JSON.parse(lines[lines.length - 1]);
    forged.verifications[0].target_ref = 'mem_other';
    const digestTarget = {
      memory_id: forged.memory_id,
      revision: forged.revision,
      task_ref: forged.task_ref,
      run_ref: forged.run_ref,
      entry: forged.entry,
      verifications: forged.verifications,
      stale: forged.stale,
      expired: forged.expired,
      superseded_by: forged.superseded_by,
      supersedes_ref: forged.supersedes_ref
    };
    forged.record_digest = sha256OfCanonical(digestTarget);
    lines[lines.length - 1] = JSON.stringify(forged);
    fs.writeFileSync(storePath, `${lines.join('\n')}\n`);
    const audit = auditMemoryVerifications({ repoRoot: env.root });
    assert.equal(audit.status, 'FAIL');
    assert.ok(audit.failures.some((failure) => failure.includes('cross-subject binding')));
  } finally {
    teardown(env);
  }
});

// ---------- tainted stream handling ----------

test('tainted event stream -> chain validation and usage binding FAIL closed', () => {
  const env = setup();
  try {
    emitAuthorizedEffectChain(env, 'prp-6', 'rcp_tainted-1');
    const ledger = createResourceLedger({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp_tainted-1', correlationRef: 'prp-6' });
    const eventsPath = path.join(env.root, 'artifacts', 'runtime-runs', env.runRef, 'loop-events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
    const tampered = JSON.parse(lines[0]);
    tampered.payload = { decision: 'DENY' }; // digest now mismatched
    lines[0] = JSON.stringify(tampered);
    fs.writeFileSync(eventsPath, `${lines.join('\n')}\n`);

    const chain = validateEvidenceChain({ repoRoot: env.root, runRef: env.runRef, correlationRef: 'prp-6', taskRef: 'task-1' });
    assert.equal(chain.status, 'FAIL');
    const audit = validateResourceUsageBindings({
      repoRoot: env.root,
      runRef: env.runRef,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    assert.equal(audit.status, 'FAIL');
    assert.equal(audit.unresolved[0].reason, 'EVENT_STREAM_TAINTED');
  } finally {
    teardown(env);
  }
});
