import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appendJsonLine, readJsonLines } from '../adapters/jsonl/jsonl-adapter.mjs';
import { validateVerificationRecord } from '../contracts/clg-contracts.mjs';
import { sha256OfCanonical } from '../kernel/checkpoint-integrity.mjs';
import { hasSecretLikeContent } from './memory-writer.mjs';

// CLG P6 memory lifecycle — durable, reusable, NON-canonical memory.
//
// Ownership: runtime/memory/ (extends the existing memory surface: writer,
// policy, schemas). House vocabulary is reused, not reinvented: scopes
// (runtime/project/operator/decision-candidate), confidence
// (observed/validated/inferred/candidate), ttl (session/30d/durable-candidate),
// promotion status (none/candidate/accepted/rejected) all come from
// memory/schemas/*.json + policies/*.md. Verification reuses CLG-006
// VerificationRecord — no parallel verification contract.
//
// ARTIFACT CLASS BOUNDARIES (never merged):
//   RuntimeState = current execution truth        (not touched by this module)
//   Checkpoint   = durable snapshot of RuntimeState (not readable here)
//   EventLog     = what happened                  (not written here)
//   Context      = assembled for current step     (ContextEnginePort decides)
//   Memory       = what information may be useful again (this module)
//
// INVARIANTS (structurally enforced):
//   Memory != Authority            — writes grant nothing
//   Memory != RuntimeState         — writes never touch lifecycle/verification state
//   Memory != Checkpoint           — records cannot rehydrate a run
//   Memory != Verification         — binding a record is bookkeeping, not stamping
//   Memory != Canonical by default — canonical promotion is EXTERNAL_POLICY:
//     only a human-reviewed promotion (memory-promotion.schema.json, named
//     reviewer + canonical target) can make memory canonical. This module has
//     no command for it ("No promotion command exists in Phase 2").
//   Agent-generated memory + agent says it is correct != verified: only
//     independent CLG-006 PASS records (subject != verifier, no
//     self_reflection PASS) lift a candidate to validated.

const MEMORY_RECORD_VERSION = '1.0.0';
const MEMORY_TTLS = Object.freeze(['session', '30d', 'durable-candidate']);
const MEMORY_SCOPES = Object.freeze(['runtime', 'project', 'operator', 'decision-candidate']);
const MEMORY_SOURCES = Object.freeze(['runtime-run', 'handoff', 'manual-note', 'validation', 'commit']);
const MEMORY_CONFIDENCE = Object.freeze(['observed', 'validated', 'inferred', 'candidate']);
const MAX_RETRIEVAL_LIMIT = 100;
const TTL_30D_MS = 30 * 24 * 60 * 60 * 1000;

const MEMORY_ID_PATTERN = /^mem_[a-zA-Z0-9_.:-]+$/;

function memoryStorePath(repoRoot) {
  return path.join(path.resolve(repoRoot), 'memory', 'stores', 'jsonl', 'clg-memory-records.jsonl');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function newMemoryId() {
  return `mem_${crypto.randomBytes(8).toString('hex')}`;
}

function digestTarget(record) {
  return {
    memory_id: record.memory_id,
    revision: record.revision,
    task_ref: record.task_ref,
    run_ref: record.run_ref,
    entry: record.entry,
    verifications: record.verifications,
    stale: record.stale,
    expired: record.expired,
    superseded_by: record.superseded_by,
    supersedes_ref: record.supersedes_ref
  };
}

function computeDigest(record) {
  return sha256OfCanonical(digestTarget(record));
}

// Structural mirror of memory/schemas/memory-entry.schema.json (the fields the
// lifecycle relies on); the JSON Schema file remains the normative shape.
function validateMemoryEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, issues: ['Memory entry must be an object.'] };
  }
  const issues = [];
  const requiredStrings = ['id', 'createdAt', 'updatedAt', 'scope', 'source', 'confidence', 'ttl'];
  for (const field of requiredStrings) {
    if (!isNonEmptyString(entry[field])) {
      issues.push(`Memory entry.${field} must be a non-empty string.`);
    }
  }
  if (isNonEmptyString(entry.id) && !MEMORY_ID_PATTERN.test(entry.id)) {
    issues.push('Memory entry.id must match mem_[a-zA-Z0-9_.:-]+.');
  }
  if (isNonEmptyString(entry.scope) && !MEMORY_SCOPES.includes(entry.scope)) {
    issues.push('Memory entry.scope is not a known scope (BLOCKED).');
  }
  if (isNonEmptyString(entry.source) && !MEMORY_SOURCES.includes(entry.source)) {
    issues.push('Memory entry.source is not a known source.');
  }
  if (isNonEmptyString(entry.confidence) && !MEMORY_CONFIDENCE.includes(entry.confidence)) {
    issues.push('Memory entry.confidence is not a known confidence.');
  }
  if (isNonEmptyString(entry.ttl) && !MEMORY_TTLS.includes(entry.ttl)) {
    issues.push('Memory entry.ttl is not a known retention label.');
  }
  if (!entry.writer || !isNonEmptyString(entry.writer.type) || !isNonEmptyString(entry.writer.id)) {
    issues.push('Memory entry.writer requires type and id.');
  }
  if (!entry.provenance || !isNonEmptyString(entry.provenance.path)) {
    issues.push('Memory entry.provenance requires a path.');
  }
  if (!entry.content || !isNonEmptyString(entry.content.summary)) {
    issues.push('Memory entry.content requires a summary.');
  }
  if (!entry.policy || entry.policy.secretChecked !== true || entry.policy.scopeChecked !== true) {
    issues.push('Memory entry.policy must record secretChecked and scopeChecked.');
  }
  if (!entry.promotion || !MEMORY_PROMOTION_STATUSES.includes(entry.promotion.status)) {
    issues.push('Memory entry.promotion.status is not a known status.');
  }
  const allowed = new Set(['id', 'createdAt', 'updatedAt', 'scope', 'source', 'writer', 'confidence', 'ttl', 'provenance', 'content', 'policy', 'promotion']);
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) {
      issues.push(`Memory entry carries unexpected field: ${key}.`);
    }
  }
  return { ok: issues.length === 0, issues };
}

const MEMORY_PROMOTION_STATUSES = Object.freeze(['none', 'candidate', 'accepted', 'rejected']);

function buildRecord({ memoryId, revision, taskRef, runRef, entry, verifications, stale, expired, supersededBy, supersedesRef }) {
  return {
    memory_record_version: MEMORY_RECORD_VERSION,
    memory_id: memoryId,
    revision,
    task_ref: taskRef,
    run_ref: runRef,
    entry,
    verifications,
    stale,
    expired,
    superseded_by: supersededBy,
    supersedes_ref: supersedesRef,
    record_digest: null
  };
}

function sealRecord(record) {
  return { ...record, record_digest: computeDigest(record) };
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, issues: ['Memory record must be an object.'] };
  }
  const issues = [];
  if (record.memory_record_version !== MEMORY_RECORD_VERSION) {
    issues.push(`Memory record version must be ${MEMORY_RECORD_VERSION}.`);
  }
  if (!MEMORY_ID_PATTERN.test(record.memory_id ?? '')) {
    issues.push('Memory record.memory_id must match mem_[a-zA-Z0-9_.:-]+.');
  }
  if (!Number.isInteger(record.revision) || record.revision < 1) {
    issues.push('Memory record.revision must be an integer >= 1.');
  }
  if (!isNonEmptyString(record.task_ref) || !isNonEmptyString(record.run_ref)) {
    issues.push('Memory record requires task_ref and run_ref.');
  }
  const entryCheck = validateMemoryEntry(record.entry);
  if (!entryCheck.ok) {
    issues.push('Memory record entry invalid.', ...entryCheck.issues);
  }
  if (!Array.isArray(record.verifications)) {
    issues.push('Memory record.verifications must be an array.');
  } else {
    for (const verification of record.verifications) {
      const check = validateVerificationRecord(verification);
      if (!check.ok) {
        issues.push('Bound verification record invalid.', ...check.issues);
      }
    }
  }
  for (const field of ['stale', 'expired']) {
    if (typeof record[field] !== 'boolean') {
      issues.push(`Memory record.${field} must be a boolean.`);
    }
  }
  for (const field of ['superseded_by', 'supersedes_ref']) {
    if (record[field] !== null && !isNonEmptyString(record[field])) {
      issues.push(`Memory record.${field} must be null or a memory id.`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!['memory_record_version', 'memory_id', 'revision', 'task_ref', 'run_ref', 'entry', 'verifications', 'stale', 'expired', 'superseded_by', 'supersedes_ref', 'record_digest'].includes(key)) {
      issues.push(`Memory record carries unexpected field: ${key}.`);
    }
  }
  if (isNonEmptyString(record.record_digest)) {
    const expected = computeDigest(record);
    if (expected !== record.record_digest) {
      issues.push('record_digest mismatch: memory content mutated.');
    }
  }
  return { ok: issues.length === 0, issues };
}

function readMemoryRecords({ repoRoot }) {
  let rawLines;
  try {
    rawLines = readJsonLines(memoryStorePath(repoRoot));
  } catch (error) {
    return { ok: false, records: new Map(), history: [], issues: [`memory store unreadable: ${error.message}`] };
  }
  const issues = [];
  const history = [];
  const latest = new Map();
  rawLines.forEach((candidate, index) => {
    const check = validateRecord(candidate);
    if (!check.ok) {
      issues.push(`line ${index + 1}: ${check.issues.join(' ')}`);
      return;
    }
    history.push(candidate);
    const current = latest.get(candidate.memory_id);
    if (!current || candidate.revision > current.revision) {
      latest.set(candidate.memory_id, candidate);
    }
  });
  return { ok: issues.length === 0, records: latest, history, issues };
}

function appendRecord(repoRoot, record) {
  appendJsonLine(memoryStorePath(repoRoot), record);
  return record;
}

function toIso(now) {
  if (now === null || now === undefined) {
    return new Date().toISOString();
  }
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

// P6-M2: experience/observation may only ever create a MemoryCandidate.
// Provenance (source, subject, content, timestamp, scope) is mandatory.
function createMemoryCandidate({
  repoRoot,
  summary,
  details = {},
  taskRef,
  runRef,
  provenancePath,
  ttl = '30d',
  actorRef = 'local-runtime',
  now = null
}) {
  const issues = [];
  if (!isNonEmptyString(summary)) {
    issues.push('Memory candidate requires a summary.');
  }
  if (!isNonEmptyString(taskRef) || !isNonEmptyString(runRef)) {
    issues.push('Memory candidate requires task_ref and run_ref.');
  }
  if (!isNonEmptyString(provenancePath)) {
    issues.push('Memory candidate requires a provenance path.');
  }
  if (!MEMORY_TTLS.includes(ttl)) {
    issues.push('Memory candidate ttl is not a known retention label.');
  }
  if (issues.length > 0) {
    return { ok: false, denied: 'MALFORMED_MEMORY', record: null, issues };
  }
  // scope-policy: runtime writes are allowed only for runtime scope.
  const scope = 'runtime';
  if (hasSecretLikeContent({ summary, details })) {
    return { ok: false, denied: 'SECRET_CONTENT_BLOCKED', record: null, issues: ['Memory candidate blocked by secret exclusion policy.'] };
  }
  const createdAt = toIso(now);
  const entry = {
    id: newMemoryId(),
    createdAt,
    updatedAt: createdAt,
    scope,
    source: 'runtime-run',
    writer: { type: 'runtime', id: actorRef },
    confidence: 'candidate',
    ttl,
    provenance: { runId: runRef, path: provenancePath, commit: null },
    content: { summary, details },
    policy: { secretChecked: true, scopeChecked: true, promotionRequired: false },
    promotion: { status: 'none', target: null, reviewedBy: null, reviewedAt: null }
  };
  const record = buildRecord({
    memoryId: entry.id,
    revision: 1,
    taskRef,
    runRef,
    entry,
    verifications: [],
    stale: false,
    expired: false,
    supersededBy: null,
    supersedesRef: null
  });
  const sealed = sealRecord(record);
  const check = validateRecord(sealed);
  if (!check.ok) {
    return { ok: false, denied: 'MALFORMED_MEMORY', record: null, issues: check.issues };
  }
  appendRecord(repoRoot, sealed);
  return { ok: true, denied: null, record: sealed, issues: [] };
}

// P6-M3: promotion to trusted/reusable memory requires independent CLG-006
// PASS records bound to the memory id. Self-reflection PASS and
// verifier == target are already denied at record level.
function verifyMemory({ repoRoot, memoryId, verificationRecords, now = null }) {
  const read = readMemoryRecords({ repoRoot });
  const record = read.records.get(memoryId);
  if (!record) {
    return { ok: false, denied: 'MEMORY_MISSING', record: null, issues: read.issues.length > 0 ? read.issues : [`no memory ${memoryId}.`] };
  }
  if (!Array.isArray(verificationRecords) || verificationRecords.length === 0) {
    return { ok: false, denied: 'VERIFICATION_INSUFFICIENT', record: null, issues: ['Trusted promotion requires at least one VerificationRecord.'] };
  }
  const issues = [];
  for (const verification of verificationRecords) {
    const check = validateVerificationRecord(verification);
    if (!check.ok) {
      issues.push(...check.issues);
    }
    if (verification.target_ref !== memoryId) {
      issues.push(`Verification ${verification.verification_id ?? '?'} does not target memory ${memoryId}.`);
    }
  }
  const hasPass = verificationRecords.some((verification) => verification.result === 'PASS');
  if (issues.length > 0 || !hasPass) {
    return { ok: false, denied: 'VERIFICATION_INSUFFICIENT', record: null, issues: issues.length > 0 ? issues : ['No PASS verification bound to this memory.'] };
  }
  const updated = buildRecord({
    memoryId: record.memory_id,
    revision: record.revision + 1,
    taskRef: record.task_ref,
    runRef: record.run_ref,
    entry: {
      ...record.entry,
      confidence: 'validated',
      updatedAt: toIso(now),
      promotion: { ...record.entry.promotion, status: 'candidate' }
    },
    verifications: [...record.verifications, ...verificationRecords],
    stale: record.stale,
    expired: record.expired,
    supersededBy: record.superseded_by,
    supersedesRef: record.supersedes_ref
  });
  const sealed = sealRecord(updated);
  appendRecord(repoRoot, sealed);
  return { ok: true, denied: null, record: sealed, issues: [] };
}

// P6-M6: explicit promotion to eligible cross-run memory (durable-candidate).
// This is NOT canonical promotion: canonical targets stay under the
// human-review promotion policy (EXTERNAL_POLICY).
function promoteToDurable({ repoRoot, memoryId, now = null }) {
  const read = readMemoryRecords({ repoRoot });
  const record = read.records.get(memoryId);
  if (!record) {
    return { ok: false, denied: 'MEMORY_MISSING', record: null, issues: [`no memory ${memoryId}.`] };
  }
  if (record.entry.confidence !== 'validated') {
    return { ok: false, denied: 'NOT_VERIFIED', record: null, issues: ['Only verified memory can become durable-candidate (eligible cross-run).'] };
  }
  const updated = buildRecord({
    memoryId: record.memory_id,
    revision: record.revision + 1,
    taskRef: record.task_ref,
    runRef: record.run_ref,
    entry: {
      ...record.entry,
      ttl: 'durable-candidate',
      updatedAt: toIso(now)
    },
    verifications: record.verifications,
    stale: record.stale,
    expired: record.expired,
    supersededBy: record.superseded_by,
    supersedesRef: record.supersedes_ref
  });
  const sealed = sealRecord(updated);
  appendRecord(repoRoot, sealed);
  return { ok: true, denied: null, record: sealed, issues: [] };
}

// P6-M5: fresh | stale | expired — derived deterministically. No TTL is ever
// extended by retrieval.
function freshnessFor(record, { now = null, activeRunRef = null } = {}) {
  if (record.expired) return 'expired';
  const currentTime = (now instanceof Date ? now : now ? new Date(now) : new Date()).getTime();
  if (record.entry.ttl === '30d') {
    if (currentTime - new Date(record.entry.createdAt).getTime() > TTL_30D_MS) return 'expired';
  }
  if (record.entry.ttl === 'session' && activeRunRef !== null && record.run_ref !== activeRunRef) {
    return 'expired';
  }
  if (record.stale) return 'stale';
  return 'fresh';
}

// P6-M7: deterministic filter port — scope compatibility, freshness,
// verification, bounded result. No semantic ranking, no fake search.
// Retrieval returns memory records; it never assembles a ContextManifest.
function retrieveMemory({
  repoRoot,
  requestingRunRef,
  taskRef,
  requireVerified = false,
  includeStale = false,
  limit = 20,
  now = null
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RETRIEVAL_LIMIT) {
    return { ok: false, records: [], issues: [`limit must be an integer in [1, ${MAX_RETRIEVAL_LIMIT}].`] };
  }
  const read = readMemoryRecords({ repoRoot });
  const records = [];
  const issues = [...read.issues];
  for (const record of read.records.values()) {
    if (record.superseded_by !== null) continue;
    const freshness = freshnessFor(record, { now, activeRunRef: requestingRunRef });
    if (freshness === 'expired') {
      issues.push(`${record.memory_id}: expired — excluded from retrieval.`);
      continue;
    }
    if (freshness === 'stale' && !includeStale) {
      issues.push(`${record.memory_id}: stale — excluded (revalidation required).`);
      continue;
    }
    if (requireVerified && record.entry.confidence !== 'validated') {
      issues.push(`${record.memory_id}: not verified — excluded by verification filter.`);
      continue;
    }
    const sessionBound = record.entry.ttl === 'session';
    const runCompatible = !sessionBound || record.run_ref === requestingRunRef;
    const shareable = record.entry.ttl === 'durable-candidate' && record.entry.confidence === 'validated';
    const taskCompatible = record.task_ref === taskRef || shareable;
    if (!runCompatible || !taskCompatible) {
      issues.push(`${record.memory_id}: foreign task/run scope — retrieval DENIED without explicit shareability.`);
      continue;
    }
    records.push({ ...record, freshness });
    if (records.length >= limit) break;
  }
  return { ok: true, records, issues };
}

// P6-M8: revalidation of stale memory. PASS retains, PARTIAL/UNKNOWN
// downgrades to stale+inferred, FAIL expires. Never a silent mutation: each
// outcome is a new revision.
function revalidateMemory({ repoRoot, memoryId, verificationRecord, now = null }) {
  const read = readMemoryRecords({ repoRoot });
  const record = read.records.get(memoryId);
  if (!record) {
    return { ok: false, denied: 'MEMORY_MISSING', record: null, issues: [`no memory ${memoryId}.`] };
  }
  const check = validateVerificationRecord(verificationRecord ?? null);
  if (!check.ok || verificationRecord.target_ref !== memoryId) {
    return { ok: false, denied: 'VERIFICATION_INSUFFICIENT', record: null, issues: [...check.issues, 'Revalidation requires a VerificationRecord bound to this memory.'] };
  }
  const result = verificationRecord.result;
  if (!['PASS', 'PARTIAL', 'UNKNOWN', 'FAIL'].includes(result)) {
    return { ok: false, denied: 'VERIFICATION_INSUFFICIENT', record: null, issues: ['Unknown verification result.'] };
  }
  let entry = { ...record.entry, updatedAt: toIso(now) };
  let stale = record.stale;
  let expired = record.expired;
  if (result === 'PASS') {
    stale = false;
  } else if (result === 'PARTIAL' || result === 'UNKNOWN') {
    stale = true;
    entry = { ...entry, confidence: 'inferred' };
  } else {
    expired = true;
  }
  const updated = buildRecord({
    memoryId: record.memory_id,
    revision: record.revision + 1,
    taskRef: record.task_ref,
    runRef: record.run_ref,
    entry,
    verifications: [...record.verifications, verificationRecord],
    stale,
    expired,
    supersededBy: record.superseded_by,
    supersedesRef: record.supersedes_ref
  });
  const sealed = sealRecord(updated);
  appendRecord(repoRoot, sealed);
  return { ok: true, denied: null, record: sealed, issues: [] };
}

// P6-M9: supersession is explicit and history-preserving — the new record
// points back (supersedes_ref), the old record is marked (superseded_by) and
// both stay in the store.
function supersedeMemory({ repoRoot, memoryId, replacement, now = null }) {
  const read = readMemoryRecords({ repoRoot });
  const record = read.records.get(memoryId);
  if (!record) {
    return { ok: false, denied: 'MEMORY_MISSING', record: null, issues: [`no memory ${memoryId}.`] };
  }
  const created = createMemoryCandidate({ repoRoot, ...replacement, now });
  if (!created.ok) {
    return { ok: false, denied: 'SUPERSESSION_FAILED', record: null, issues: created.issues };
  }
  const linked = buildRecord({
    memoryId: created.record.memory_id,
    revision: 1,
    taskRef: created.record.task_ref,
    runRef: created.record.run_ref,
    entry: created.record.entry,
    verifications: [],
    stale: false,
    expired: false,
    supersededBy: null,
    supersedesRef: memoryId
  });
  const sealedNew = sealRecord(linked);
  appendRecord(repoRoot, sealedNew);
  const retired = buildRecord({
    memoryId: record.memory_id,
    revision: record.revision + 1,
    taskRef: record.task_ref,
    runRef: record.run_ref,
    entry: record.entry,
    verifications: record.verifications,
    stale: record.stale,
    expired: record.expired,
    supersededBy: sealedNew.memory_id,
    supersedesRef: record.supersedes_ref
  });
  appendRecord(repoRoot, sealRecord(retired));
  return { ok: true, denied: null, record: sealedNew, superseded: sealedNew.supersedes_ref, issues: [] };
}

export {
  MEMORY_RECORD_VERSION,
  MEMORY_TTLS,
  createMemoryCandidate,
  freshnessFor,
  promoteToDurable,
  readMemoryRecords,
  retrieveMemory,
  revalidateMemory,
  supersedeMemory,
  validateMemoryEntry,
  verifyMemory
};
