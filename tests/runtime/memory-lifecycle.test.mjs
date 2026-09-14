import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createMemoryCandidate,
  freshnessFor,
  promoteToDurable,
  readMemoryRecords,
  retrieveMemory,
  revalidateMemory,
  supersedeMemory,
  verifyMemory
} from '../../runtime/memory/memory-lifecycle.mjs';
import { validateVerificationRecord } from '../../runtime/contracts/clg-contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRootForScan = path.resolve(here, '../..');

function setup() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-p6-'));
  return { repoRoot };
}

function teardown({ repoRoot }) {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

function makeVerification(targetRef, overrides = {}) {
  return {
    vrc_version: '1.0.0',
    verification_id: `vr-${Math.random().toString(16).slice(2, 8)}`,
    target_ref: targetRef,
    method: 'independent-check',
    verifier: { verifier_type: 'deterministic', verifier_ref: 'test-verifier' },
    evidence_refs: ['evidence-1'],
    result: 'PASS',
    verified_at: new Date().toISOString(),
    ...overrides
  };
}

function candidate(env, overrides = {}) {
  return createMemoryCandidate({
    repoRoot: env.repoRoot,
    summary: 'observed run fact',
    taskRef: 'task-1',
    runRef: 'run_a',
    provenancePath: 'artifacts/runtime-runs/run_a/events.jsonl',
    ...overrides
  });
}

// ---------- Candidate (P6-M2) ----------

test('experience becomes a MemoryCandidate with provenance, never a permanent truth', () => {
  const env = setup();
  try {
    const result = candidate(env);
    assert.equal(result.ok, true);
    assert.equal(result.record.entry.confidence, 'candidate');
    assert.equal(result.record.entry.promotion.status, 'none');
    assert.equal(result.record.entry.scope, 'runtime');
    assert.equal(result.record.entry.provenance.runId, 'run_a');
    assert.equal(result.record.revision, 1);
    assert.match(result.record.record_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(freshnessFor(result.record, {}), 'fresh');
  } finally {
    teardown(env);
  }
});

test('secret-bearing content is blocked', () => {
  const env = setup();
  try {
    const result = candidate(env, { summary: 'the api_key is abc123' });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'SECRET_CONTENT_BLOCKED');
  } finally {
    teardown(env);
  }
});

test('missing provenance or task/run binding -> MALFORMED_MEMORY', () => {
  const env = setup();
  try {
    const noPath = candidate(env, { provenancePath: undefined });
    assert.equal(noPath.ok, false);
    assert.equal(noPath.denied, 'MALFORMED_MEMORY');
    const noRun = candidate(env, { runRef: undefined });
    assert.equal(noRun.ok, false);
    assert.equal(noRun.denied, 'MALFORMED_MEMORY');
  } finally {
    teardown(env);
  }
});

// ---------- Verification before promotion (P6-M3 + boundary) ----------

test('unverified candidate cannot be promoted and fails the verified filter', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const promoted = promoteToDurable({ repoRoot: env.repoRoot, memoryId: created.record.memory_id });
    assert.equal(promoted.ok, false);
    assert.equal(promoted.denied, 'NOT_VERIFIED');
    const retrieved = retrieveMemory({
      repoRoot: env.repoRoot,
      requestingRunRef: 'run_a',
      taskRef: 'task-1',
      requireVerified: true
    });
    assert.equal(retrieved.records.length, 0);
    assert.ok(retrieved.issues.some((issue) => issue.includes('not verified')));
  } finally {
    teardown(env);
  }
});

test('verifyMemory without records -> VERIFICATION_INSUFFICIENT', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const result = verifyMemory({ repoRoot: env.repoRoot, memoryId: created.record.memory_id, verificationRecords: [] });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'VERIFICATION_INSUFFICIENT');
  } finally {
    teardown(env);
  }
});

test('independent PASS verification lifts candidate to validated (CLG-006 reused)', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const verification = makeVerification(created.record.memory_id);
    assert.equal(validateVerificationRecord(verification).ok, true);
    const result = verifyMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecords: [verification]
    });
    assert.equal(result.ok, true);
    assert.equal(result.record.entry.confidence, 'validated');
    assert.equal(result.record.entry.promotion.status, 'candidate');
    assert.equal(result.record.verifications.length, 1);
    assert.equal(result.record.revision, 2);
  } finally {
    teardown(env);
  }
});

test('verification bound to a different memory id -> VERIFICATION_INSUFFICIENT', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const result = verifyMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecords: [makeVerification('mem_somebody-else')]
    });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'VERIFICATION_INSUFFICIENT');
  } finally {
    teardown(env);
  }
});

test('self-verification (memory verifies itself) -> denied', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const selfVerifying = makeVerification(created.record.memory_id, {
      verifier: { verifier_type: 'deterministic', verifier_ref: created.record.memory_id }
    });
    const result = verifyMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecords: [selfVerifying]
    });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'VERIFICATION_INSUFFICIENT');
  } finally {
    teardown(env);
  }
});

test('self-reflection PASS alone can never verify memory', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const reflection = makeVerification(created.record.memory_id, {
      verifier: { verifier_type: 'self_reflection', verifier_ref: 'the-agent' }
    });
    const result = verifyMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecords: [reflection]
    });
    assert.equal(result.ok, false);
    assert.equal(result.denied, 'VERIFICATION_INSUFFICIENT');
  } finally {
    teardown(env);
  }
});

test('promoteToDurable after verification -> eligible cross-run memory (still non-canonical)', () => {
  const env = setup();
  try {
    const created = candidate(env);
    verifyMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecords: [makeVerification(created.record.memory_id)]
    });
    const promoted = promoteToDurable({ repoRoot: env.repoRoot, memoryId: created.record.memory_id });
    assert.equal(promoted.ok, true);
    assert.equal(promoted.record.entry.ttl, 'durable-candidate');
    assert.equal(promoted.record.entry.promotion.status, 'candidate');
    // Canonical promotion stays external policy: entry carries no canonical marker.
    assert.equal(promoted.record.entry.promotion.reviewedBy, null);
  } finally {
    teardown(env);
  }
});

// ---------- TTL / freshness / retrieval (P6-M5, P6-M7) ----------

test('expired memory (30d past) is excluded from retrieval and cannot masquerade as fresh', () => {
  const env = setup();
  try {
    const created = candidate(env, { now: '2026-01-01T00:00:00.000Z' });
    const later = new Date(new Date('2026-01-01T00:00:00.000Z').getTime() + 31 * 24 * 60 * 60 * 1000);
    const freshness = freshnessFor(created.record, { now: later });
    assert.equal(freshness, 'expired');
    const retrieved = retrieveMemory({
      repoRoot: env.repoRoot,
      requestingRunRef: 'run_a',
      taskRef: 'task-1',
      now: later
    });
    assert.equal(retrieved.records.length, 0);
    assert.ok(retrieved.issues.some((issue) => issue.includes('expired')));
  } finally {
    teardown(env);
  }
});

test('session memory is run-bound: foreign run sees it expired; non-shareable cross-task is DENIED', () => {
  const env = setup();
  try {
    candidate(env, { ttl: 'session' });
    candidate(env, { ttl: '30d', taskRef: 'task-secret' });
    const sameRun = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_a', taskRef: 'task-1' });
    assert.equal(sameRun.records.length, 1);
    // A session entry from another run is expired from this run's perspective.
    const foreignRun = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_b', taskRef: 'task-1' });
    assert.equal(foreignRun.records.length, 0);
    assert.ok(foreignRun.issues.some((issue) => issue.includes('expired')));
    // A non-session entry of a foreign task is not shareable -> explicit DENY.
    const foreignTask = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_a', taskRef: 'task-2' });
    assert.equal(foreignTask.records.length, 0);
    assert.ok(foreignTask.issues.some((issue) => issue.includes('DENIED')));
  } finally {
    teardown(env);
  }
});

test('cross-task retrieval requires explicit shareability (verified + durable)', () => {
  const env = setup();
  try {
    const created = candidate(env, { taskRef: 'task-1' });
    // Session-bound runtime entry: not shareable across tasks.
    const strict = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_a', taskRef: 'task-2' });
    assert.equal(strict.records.length, 0);
    // Verified + durable-candidate becomes shareable.
    verifyMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecords: [makeVerification(created.record.memory_id)]
    });
    promoteToDurable({ repoRoot: env.repoRoot, memoryId: created.record.memory_id });
    const shared = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_b', taskRef: 'task-2' });
    assert.equal(shared.records.length, 1);
    assert.equal(shared.records[0].task_ref, 'task-1');
  } finally {
    teardown(env);
  }
});

test('stale memory (revalidation UNKNOWN) is downgraded and hidden unless explicitly included', () => {
  const env = setup();
  try {
    const created = candidate(env);
    verifyMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecords: [makeVerification(created.record.memory_id)]
    });
    const revalidated = revalidateMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecord: makeVerification(created.record.memory_id, { result: 'UNKNOWN' })
    });
    assert.equal(revalidated.ok, true);
    assert.equal(revalidated.record.stale, true);
    assert.equal(revalidated.record.entry.confidence, 'inferred');
    const strict = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_a', taskRef: 'task-1' });
    assert.equal(strict.records.length, 0);
    assert.ok(strict.issues.some((issue) => issue.includes('stale')));
    const lenient = retrieveMemory({
      repoRoot: env.repoRoot,
      requestingRunRef: 'run_a',
      taskRef: 'task-1',
      includeStale: true
    });
    assert.equal(lenient.records.length, 1);
    assert.equal(lenient.records[0].freshness, 'stale');
  } finally {
    teardown(env);
  }
});

test('FAIL revalidation expires memory', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const revalidated = revalidateMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      verificationRecord: makeVerification(created.record.memory_id, { result: 'FAIL' })
    });
    assert.equal(revalidated.ok, true);
    assert.equal(revalidated.record.expired, true);
    const retrieved = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_a', taskRef: 'task-1' });
    assert.equal(retrieved.records.length, 0);
  } finally {
    teardown(env);
  }
});

// ---------- Supersession (P6-M9) ----------

test('supersession is explicit and history-preserving', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const result = supersedeMemory({
      repoRoot: env.repoRoot,
      memoryId: created.record.memory_id,
      replacement: {
        summary: 'corrected run fact',
        taskRef: 'task-1',
        runRef: 'run_a',
        provenancePath: 'artifacts/runtime-runs/run_a/events.jsonl'
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.record.supersedes_ref, created.record.memory_id);
    const read = readMemoryRecords({ repoRoot: env.repoRoot });
    const old = read.records.get(created.record.memory_id);
    assert.equal(old.superseded_by, result.record.memory_id);
    // The superseded record is excluded from retrieval, but history remains.
    const retrieved = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_a', taskRef: 'task-1' });
    assert.deepEqual(retrieved.records.map((record) => record.memory_id), [result.record.memory_id]);
    assert.ok(read.history.length >= 3);
  } finally {
    teardown(env);
  }
});

// ---------- Integrity / boundaries ----------

test('memory content mutation on disk -> integrity failure, record dropped', () => {
  const env = setup();
  try {
    const created = candidate(env);
    const storePath = path.join(env.repoRoot, 'memory', 'stores', 'jsonl', 'clg-memory-records.jsonl');
    const raw = JSON.parse(readFileSync(storePath, 'utf8').trim());
    raw.entry.content.summary = 'tampered fact';
    fs.writeFileSync(storePath, `${JSON.stringify(raw)}\n`);
    const read = readMemoryRecords({ repoRoot: env.repoRoot });
    assert.equal(read.ok, false);
    assert.equal(read.records.size, 0);
    assert.ok(read.issues.some((issue) => issue.includes('record_digest mismatch')));
    assert.equal(created.record.memory_id !== null, true);
  } finally {
    teardown(env);
  }
});

test('memory write does not mutate RuntimeState, mark verification PASS, or grant authority', () => {
  const env = setup();
  try {
    const runtimeState = {
      rtc_version: '1.0.0',
      task_ref: 'task-1',
      lifecycle_state: 'running',
      verification_status: 'unverified',
      retry_count: 0,
      replan_count: 0,
      context_generation: 0
    };
    const snapshot = JSON.parse(JSON.stringify(runtimeState));
    candidate(env);
    assert.deepEqual(runtimeState, snapshot);
    assert.equal(runtimeState.verification_status, 'unverified');
    assert.equal(runtimeState.lifecycle_state, 'running');
    // Structural: the module imports no authority/loop/verification-mutation surface.
    const source = readFileSync(path.join(repoRootForScan, 'runtime/memory/memory-lifecycle.mjs'), 'utf8');
    assert.equal(/loop-controller|applyDecision|AuthorityPort|executeActionProposal|evaluationGuard/.test(source), false);
    const domainPattern = /Unitera|tenant|TenantNodeBinding|RuntimeAdmission|CapabilityGrant|CCA-02|sovereignty|PersonalRealm|CommitmentStage|Mews|Companion|RPA/i;
    assert.equal(domainPattern.test(source), false);
  } finally {
    teardown(env);
  }
});

test('retrieval returns memory records, never a ContextManifest', () => {
  const env = setup();
  try {
    candidate(env);
    const retrieved = retrieveMemory({ repoRoot: env.repoRoot, requestingRunRef: 'run_a', taskRef: 'task-1' });
    assert.equal(retrieved.ok, true);
    const record = retrieved.records[0];
    for (const forbidden of ['token_budget', 'sections', 'context_id', 'compression_applied', 'omitted_sources']) {
      assert.equal(Object.keys(record).includes(forbidden), false);
      assert.equal(Object.keys(record.entry).includes(forbidden), false);
    }
  } finally {
    teardown(env);
  }
});

test('retrieval is bounded by limit', () => {
  const env = setup();
  try {
    for (let i = 0; i < 5; i += 1) {
      candidate(env, { summary: `fact ${i}` });
    }
    const retrieved = retrieveMemory({
      repoRoot: env.repoRoot,
      requestingRunRef: 'run_a',
      taskRef: 'task-1',
      limit: 3
    });
    assert.equal(retrieved.records.length, 3);
  } finally {
    teardown(env);
  }
});

// ---------- Restart / DoD-8 exit gate (P6-M10, P6-M15) ----------

test('DoD 8 exit gate: durable memory survives process loss with provenance, verification and TTL intact', () => {
  const env = setup();
  let memoryId;
  let snapshotBeforeLoss;
  try {
    {
      const created = candidate(env, { summary: 'reusable, verified run knowledge' });
      memoryId = created.record.memory_id;
      verifyMemory({
        repoRoot: env.repoRoot,
        memoryId,
        verificationRecords: [makeVerification(memoryId)]
      });
      promoteToDurable({ repoRoot: env.repoRoot, memoryId });
      snapshotBeforeLoss = JSON.parse(JSON.stringify(created.record));
      // In-memory state destroyed (block scope ends, nothing carried over).
    }
    // Fresh runtime context: read from durable store only.
    const read = readMemoryRecords({ repoRoot: env.repoRoot });
    assert.equal(read.ok, true);
    const record = read.records.get(memoryId);
    assert.equal(record.entry.confidence, 'validated');
    assert.equal(record.entry.ttl, 'durable-candidate');
    assert.equal(record.entry.provenance.runId, 'run_a');
    assert.equal(record.verifications.length, 1);
    assert.equal(freshnessFor(record, { activeRunRef: 'run_a' }), 'fresh');
    // Provenance fields intact compared to the pre-loss snapshot.
    assert.deepEqual(record.entry.provenance, snapshotBeforeLoss.entry.provenance);
    // Scoped retrieval from a different run sees exactly this shareable memory.
    const retrieved = retrieveMemory({
      repoRoot: env.repoRoot,
      requestingRunRef: 'run_fresh',
      taskRef: 'task-other'
    });
    assert.equal(retrieved.records.length, 1);
    assert.equal(retrieved.records[0].memory_id, memoryId);
    assert.equal(retrieved.records[0].entry.verification_status, undefined);
  } finally {
    teardown(env);
  }
});
