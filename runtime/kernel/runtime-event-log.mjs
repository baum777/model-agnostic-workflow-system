import crypto from 'node:crypto';
import path from 'node:path';
import { appendJsonLine, readJsonLines } from '../adapters/jsonl/jsonl-adapter.mjs';
import { RUNTIME_VERSION } from './runtime-context.mjs';
import { sha256OfCanonical } from './checkpoint-integrity.mjs';

// CLG P5 runtime event log — the canonical, correlated, append-only event
// stream for the generic runtime loop.
//
// Ownership: runtime/kernel (same loop-artifact surface as loop-artifacts.mjs).
// Persistence extends the existing runDir artifact convention via the shared
// jsonl adapter — deliberately NOT a new storage stack. The phase-1 CLI
// telemetry stream (observability/event-writer.mjs, events.jsonl) remains
// untouched: it documents check outcomes; this stream documents the runtime
// lifecycle.
//
// Event Log != RuntimeState != Checkpoint != Memory != Verification.
// The log carries no authority: emitting an event grants nothing, verifies
// nothing, and completes nothing.
//
// DIGEST BOUNDARY (explicit):
//   payload_digest = sha256(canonical({event_type, task_ref, run_ref,
//     sequence, actor_ref, subject_ref, correlation_ref, causation_ref,
//     payload_ref, payload, runtime_version}))
// OUTSIDE the digest: event_id (random identity) and timestamp (clock).
// Semantic content — including the runtime version — is digest-bound, so
// content tampering is detectable while clock/identity metadata stays free.

const EVENT_LOG_VERSION = '1.0.0';
const MAX_EVENT_BYTES = 1024 * 1024;

const EVENT_TYPES = Object.freeze([
  'RUN_CREATED',
  'DECISION_RECORDED',
  'TRANSITION_APPLIED',
  'AUTHORITY_EVALUATED',
  'EFFECT_ATTEMPTED',
  'EFFECT_RECEIPT_RECORDED',
  'OBSERVATION_RECORDED',
  'VERIFICATION_RECORDED',
  'CHECKPOINT_CREATED',
  'RESUME_PERFORMED',
  'RUN_CONTAINED',
  'RUN_TERMINATED'
]);

const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]+$/;
const RUN_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ALLOWED_FIELDS = Object.freeze([
  'event_id', 'run_ref', 'task_ref', 'sequence', 'event_type', 'timestamp',
  'actor_ref', 'subject_ref', 'correlation_ref', 'causation_ref',
  'payload_ref', 'payload_digest', 'payload', 'runtime_version'
]);

function eventsFilePath(repoRoot, runRef) {
  return path.join(path.resolve(repoRoot), 'artifacts', 'runtime-runs', runRef, 'loop-events.jsonl');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function nullableRef(value) {
  return value === null || value === undefined || isNonEmptyString(value);
}

function digestTarget(event) {
  return {
    event_type: event.event_type,
    task_ref: event.task_ref,
    run_ref: event.run_ref,
    sequence: event.sequence,
    actor_ref: event.actor_ref,
    subject_ref: event.subject_ref,
    correlation_ref: event.correlation_ref,
    causation_ref: event.causation_ref,
    payload_ref: event.payload_ref,
    payload: event.payload,
    runtime_version: event.runtime_version
  };
}

function validateEventEnvelope(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, issues: ['RuntimeEvent must be an object.'] };
  }
  const issues = [];
  const requiredStrings = ['event_id', 'run_ref', 'task_ref', 'event_type', 'timestamp', 'actor_ref', 'subject_ref', 'correlation_ref', 'runtime_version', 'payload_digest'];
  for (const field of requiredStrings) {
    if (!isNonEmptyString(candidate[field])) {
      issues.push(`RuntimeEvent.${field} must be a non-empty string.`);
    }
  }
  if (isNonEmptyString(candidate.event_id) && !EVENT_ID_PATTERN.test(candidate.event_id)) {
    issues.push('RuntimeEvent.event_id must match evt_[A-Za-z0-9_-]+.');
  }
  if (isNonEmptyString(candidate.run_ref) && !RUN_REF_PATTERN.test(candidate.run_ref)) {
    issues.push('RuntimeEvent.run_ref must be path-safe.');
  }
  if (isNonEmptyString(candidate.event_type) && !EVENT_TYPES.includes(candidate.event_type)) {
    issues.push(`RuntimeEvent.event_type must be one of: ${EVENT_TYPES.join(', ')}.`);
  }
  if (!Number.isInteger(candidate.sequence) || candidate.sequence < 1) {
    issues.push('RuntimeEvent.sequence must be an integer >= 1.');
  }
  if (isNonEmptyString(candidate.payload_digest) && !DIGEST_PATTERN.test(candidate.payload_digest)) {
    issues.push('RuntimeEvent.payload_digest must be a sha256:<hex> digest.');
  }
  if (!nullableRef(candidate.causation_ref)) {
    issues.push('RuntimeEvent.causation_ref must be null or a non-empty string.');
  }
  if (!nullableRef(candidate.payload_ref)) {
    issues.push('RuntimeEvent.payload_ref must be null or a non-empty string.');
  }
  if (!candidate.payload || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload)) {
    issues.push('RuntimeEvent.payload must be an object.');
  }
  for (const key of Object.keys(candidate)) {
    if (!ALLOWED_FIELDS.includes(key)) {
      issues.push(`RuntimeEvent carries unexpected field: ${key}.`);
    }
  }
  return { ok: issues.length === 0, issues };
}

function verifyEventIntegrity(candidate) {
  const envelopeCheck = validateEventEnvelope(candidate);
  if (!envelopeCheck.ok) {
    return { ok: false, issues: envelopeCheck.issues };
  }
  const expected = sha256OfCanonical(digestTarget(candidate));
  if (expected !== candidate.payload_digest) {
    return { ok: false, issues: ['payload_digest mismatch: event content mutated.'] };
  }
  return { ok: true, issues: [] };
}

// Fail-closed stream read: every line must parse and validate; digest
// verification happens here so tampered lines are reported (never hidden),
// while readEvent additionally DENIES a requested sequence on any issue.
function readEvents({ repoRoot, runRef }) {
  if (!isNonEmptyString(runRef) || !RUN_REF_PATTERN.test(runRef)) {
    return { ok: false, events: [], issues: ['run_ref must be path-safe.'] };
  }
  let rawLines;
  try {
    rawLines = readJsonLines(eventsFilePath(repoRoot, runRef));
  } catch (error) {
    return { ok: false, events: [], issues: [`event stream unreadable: ${error.message}`] };
  }
  const events = [];
  const issues = [];
  rawLines.forEach((candidate, index) => {
    const integrity = verifyEventIntegrity(candidate);
    if (!integrity.ok) {
      issues.push(`line ${index + 1}: ${integrity.issues.join(' ')}`);
      return;
    }
    events.push(candidate);
  });
  events.sort((a, b) => a.sequence - b.sequence);
  return { ok: issues.length === 0, events, issues };
}

function listEvents({ repoRoot, runRef }) {
  return readEvents({ repoRoot, runRef });
}

function readEvent({ repoRoot, runRef, sequence }) {
  const read = readEvents({ repoRoot, runRef });
  if (!Number.isInteger(sequence) || sequence < 1) {
    return { ok: false, denied: 'MALFORMED_SEQUENCE', event: null, issues: ['sequence must be an integer >= 1.'] };
  }
  if (!read.ok) {
    return { ok: false, denied: 'EVENT_STREAM_TAINTED', event: null, issues: read.issues };
  }
  const event = read.events.find((entry) => entry.sequence === sequence);
  if (!event) {
    return { ok: false, denied: 'EVENT_MISSING', event: null, issues: [`no event with sequence ${sequence}.`] };
  }
  return { ok: true, denied: null, event, issues: [] };
}

function getLatestSequence({ repoRoot, runRef }) {
  const read = readEvents({ repoRoot, runRef });
  const sequence = read.events.length > 0 ? read.events[read.events.length - 1].sequence : 0;
  return { ok: read.ok, sequence, issues: read.issues };
}

// Correlation query: all events sharing a correlation_ref, chronological.
function getEventChain({ repoRoot, runRef, correlationRef }) {
  if (!isNonEmptyString(correlationRef)) {
    return { ok: false, events: [], issues: ['correlation_ref must be a non-empty string.'] };
  }
  const read = readEvents({ repoRoot, runRef });
  return {
    ok: read.ok,
    events: read.events.filter((event) => event.correlation_ref === correlationRef),
    issues: read.issues
  };
}

// Deterministic why-state query (P5-E5): the latest event of a task plus its
// causation chain resolved by event_id — structured evidence, no prose.
function explainState({ repoRoot, runRef, taskRef }) {
  const read = readEvents({ repoRoot, runRef });
  const taskEvents = read.events.filter((event) => event.task_ref === taskRef);
  if (taskEvents.length === 0) {
    return { ok: false, chain: [], current_state: null, issues: read.issues.length > 0 ? read.issues : [`no events for task ${taskRef}.`] };
  }
  const latest = taskEvents[taskEvents.length - 1];
  const byEventId = new Map(taskEvents.map((event) => [event.event_id, event]));
  const chain = [latest];
  const seen = new Set([latest.event_id]);
  let cursor = latest;
  while (cursor.causation_ref && byEventId.has(cursor.causation_ref) && !seen.has(cursor.causation_ref)) {
    seen.add(cursor.causation_ref);
    cursor = byEventId.get(cursor.causation_ref);
    chain.unshift(cursor);
  }
  return {
    ok: true,
    chain,
    current_state: {
      event_type: latest.event_type,
      event_id: latest.event_id,
      sequence: latest.sequence,
      subject_ref: latest.subject_ref,
      payload: latest.payload
    },
    issues: read.issues
  };
}

// Append-only. The sequence is derived from the stream (latest + 1); the file
// is never rewritten. Event write failures are classified, never silent.
function appendEvent({
  repoRoot,
  permissionEngine,
  runRef,
  taskRef,
  eventType,
  actorRef,
  subjectRef,
  correlationRef,
  causationRef = null,
  payloadRef = null,
  payload = {}
}) {
  if (!isNonEmptyString(runRef) || !RUN_REF_PATTERN.test(runRef)) {
    return { ok: false, denied: 'MALFORMED_RUN_REF', event: null, issues: ['run_ref must be path-safe.'] };
  }
  const base = {
    event_id: `evt_${crypto.randomBytes(8).toString('hex')}`,
    run_ref: runRef,
    task_ref: taskRef,
    sequence: 1,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    actor_ref: actorRef,
    subject_ref: subjectRef,
    correlation_ref: correlationRef,
    causation_ref: causationRef,
    payload_ref: payloadRef,
    payload_digest: 'sha256:probe',
    payload,
    runtime_version: RUNTIME_VERSION
  };
  const probe = validateEventEnvelope({ ...base, payload_digest: `sha256:${'0'.repeat(64)}` });
  if (!probe.ok) {
    return { ok: false, denied: 'MALFORMED_EVENT', event: null, issues: probe.issues };
  }
  const latest = getLatestSequence({ repoRoot, runRef });
  if (!latest.ok) {
    return { ok: false, denied: 'EVENT_STREAM_UNREADABLE', event: null, issues: latest.issues };
  }
  let payloadDigest;
  try {
    payloadDigest = sha256OfCanonical(digestTarget({ ...base, sequence: latest.sequence + 1 }));
  } catch (error) {
    return { ok: false, denied: 'MALFORMED_EVENT', event: null, issues: [`payload not canonically serializable: ${error.message}`] };
  }
  const event = {
    ...base,
    sequence: latest.sequence + 1,
    payload_digest: payloadDigest
  };
  const serialized = `${JSON.stringify(event)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EVENT_BYTES) {
    return { ok: false, denied: 'EVENT_OVERSIZED', event: null, issues: ['event exceeds the practical size cap.'] };
  }
  const filePath = eventsFilePath(repoRoot, runRef);
  const permission = permissionEngine.decide({ claim: 'filesystem.write', target: filePath });
  if (permission.decision !== 'allow') {
    return { ok: false, denied: 'EVENT_WRITE_DENIED', event: null, issues: [`event write denied: ${permission.reason}`] };
  }
  try {
    appendJsonLine(filePath, event);
  } catch (error) {
    return { ok: false, denied: 'EVENT_WRITE_FAILED', event: null, issues: [`event write failed: ${error.message}`] };
  }
  return { ok: true, denied: null, event, issues: [] };
}

export {
  EVENT_LOG_VERSION,
  EVENT_TYPES,
  MAX_EVENT_BYTES,
  appendEvent,
  eventsFilePath,
  explainState,
  getEventChain,
  getLatestSequence,
  listEvents,
  readEvent,
  readEvents,
  validateEventEnvelope,
  verifyEventIntegrity
};
