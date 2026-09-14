import { listEvents } from './runtime-event-log.mjs';
import { createResourceLedger } from '../resources/resource-ledger.mjs';
import { readMemoryRecords } from '../memory/memory-lifecycle.mjs';
import { validateVerificationRecord } from '../contracts/clg-contracts.mjs';

// CLG P9 evidence-chain integrity — read-only cross-artifact resolver.
//
// ArtifactResolver per P9-I2: locate, load, validate, bind identity.
// Structural boundaries (all enforced by construction):
//   Evidence chain validation != Authority      (resolving a ref grants nothing)
//   Evidence chain validation != State mutation (no store is written)
//   Evidence chain validation != Verification   (it validates evidence BINDINGS,
//                                                not business outcomes)
//   Evidence chain validation != Completion policy (completion keeps deciding
//                                                on its own inputs; a chain FAIL
//                                                is an integrity signal only)
//
// Stores consumed (existing persistence, no new stack): loop-events.jsonl,
// resource-usage.jsonl, memory records store.

const EFFECT_RECEIPT_ID_PATTERN = /^rcp_[A-Za-z0-9_-]+$/;
const RECEIPT_EVENT_TYPE = 'EFFECT_RECEIPT_RECORDED';
// Canonical lifecycle stage order for an authorized-effect correlation chain.
// Chains may be prefixes/subsequences of this (a denied action has only
// AUTHORITY_EVALUATED); order inversions are integrity failures.
const CHAIN_STAGE_ORDER = Object.freeze([
  'AUTHORITY_EVALUATED',
  'EFFECT_ATTEMPTED',
  'EFFECT_RECEIPT_RECORDED',
  'OBSERVATION_RECORDED',
  'VERIFICATION_RECORDED'
]);

function stageIndex(eventType) {
  return CHAIN_STAGE_ORDER.indexOf(eventType);
}

// P9-I6: deterministic chain check for one correlation. Every chain event's
// task binding must match, every causation_ref must RESOLVE (to the previous
// chain event once inside the chain, otherwise to any existing stream event),
// and stage order must be canonical. Status is PASS or FAIL only — PARTIAL is
// deliberately never produced (no policy basis, P9-I6).
function validateEvidenceChain({ repoRoot, runRef, correlationRef, taskRef = null }) {
  const read = listEvents({ repoRoot, runRef });
  const failures = [];
  if (!read.ok) {
    return { ok: false, status: 'FAIL', failures: [...read.issues], resolved_refs: [], chain: [] };
  }
  const chain = read.events
    .filter((event) => event.correlation_ref === correlationRef)
    .sort((a, b) => a.sequence - b.sequence);
  if (chain.length === 0) {
    return { ok: false, status: 'FAIL', failures: [`no events for correlation ${correlationRef}`], resolved_refs: [], chain: [] };
  }
  const eventIds = new Set(read.events.map((event) => event.event_id));

  for (let index = 0; index < chain.length; index += 1) {
    const event = chain[index];
    if (taskRef !== null && event.task_ref !== taskRef) {
      failures.push(`chain event ${event.event_id} (${event.event_type}) has task_ref ${event.task_ref}, expected ${taskRef} (cross-task binding).`);
    }
    if (index > 0) {
      if (event.causation_ref !== chain[index - 1].event_id) {
        failures.push(`chain event ${event.event_id} (${event.event_type}) causation_ref does not resolve to the previous chain event ${chain[index - 1].event_id}.`);
      }
    } else if (event.causation_ref !== null && !eventIds.has(event.causation_ref)) {
      failures.push(`chain entry event ${event.event_id} causation_ref ${event.causation_ref} does not resolve to any event in the stream.`);
    }
    const currentStage = stageIndex(event.event_type);
    if (currentStage === -1) {
      failures.push(`chain event ${event.event_id} has non-lifecycle type ${event.event_type}.`);
      continue;
    }
    if (index > 0) {
      const previousStage = stageIndex(chain[index - 1].event_type);
      if (previousStage !== -1 && currentStage < previousStage) {
        failures.push(`chain stage order inversion: ${chain[index - 1].event_type} -> ${event.event_type}.`);
      }
    }
    if (event.event_type === RECEIPT_EVENT_TYPE) {
      const payloadReceiptId = event.payload ? event.payload.receipt_id : undefined;
      if (payloadReceiptId !== undefined && payloadReceiptId !== null && event.payload_ref !== null && event.payload_ref !== `receipt:${payloadReceiptId}`) {
        failures.push(`receipt event ${event.event_id} payload_ref does not match its payload receipt_id.`);
      }
    }
  }

  const resolvedRefs = chain.map((event) => event.event_id);
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return { ok: status === 'PASS', status, failures, resolved_refs: resolvedRefs, chain };
}

// P9-I3/P9-I7: ResourceUsage.source_ref must resolve to an actual
// EFFECT_RECEIPT_RECORDED event (typed reference: EffectReceipt identity),
// bound to the same task. Wrong artifact type, unresolvable refs, and
// cross-task receipts are DENIED.
function resolveResourceUsageSource({ repoRoot, runRef, taskRef, sourceRef }) {
  if (typeof sourceRef !== 'string' || !EFFECT_RECEIPT_ID_PATTERN.test(sourceRef)) {
    return { ok: false, denied: 'WRONG_ARTIFACT_TYPE', receipt_event: null, issues: [`source_ref ${String(sourceRef)} is not an EffectReceipt identity (rcp_*).`] };
  }
  const read = listEvents({ repoRoot, runRef });
  if (!read.ok) {
    return { ok: false, denied: 'EVENT_STREAM_TAINTED', receipt_event: null, issues: [...read.issues] };
  }
  const matches = read.events.filter((event) => event.event_type === RECEIPT_EVENT_TYPE && event.payload && event.payload.receipt_id === sourceRef);
  if (matches.length === 0) {
    return { ok: false, denied: 'SOURCE_REF_UNRESOLVED', receipt_event: null, issues: [`source_ref ${sourceRef} does not resolve to any ${RECEIPT_EVENT_TYPE} event in run ${runRef}.`] };
  }
  if (matches.length > 1) {
    return { ok: false, denied: 'DUPLICATE_RECEIPT_IDENTITY', receipt_event: null, issues: [`source_ref ${sourceRef} resolves to ${matches.length} receipt events (identity anomaly).`] };
  }
  const receiptEvent = matches[0];
  if (taskRef !== null && receiptEvent.task_ref !== taskRef) {
    return { ok: false, denied: 'TASK_BINDING_MISMATCH', receipt_event: receiptEvent, issues: [`receipt ${sourceRef} belongs to task ${receiptEvent.task_ref}, not ${taskRef}.`] };
  }
  return { ok: true, denied: null, receipt_event: receiptEvent, issues: [] };
}

// Whole-ledger binding audit: every usage record's source_ref must resolve to
// a real, task-bound receipt event. A ledger is PASS only when ALL records
// resolve. This closes the B3 gap where individually schema-valid consumption
// records with fabricated receipts corrupted budget truth unnoticed.
function validateResourceUsageBindings({ repoRoot, runRef, taskRef, budget }) {
  let ledger;
  try {
    ledger = createResourceLedger({ repoRoot, runRef, taskRef, budget });
  } catch (error) {
    return { ok: false, status: 'FAIL', resolved: [], unresolved: [], failures: [error.issues ? error.issues.join(' ') : String(error)] };
  }
  const read = ledger.readLedger();
  if (read.tainted) {
    return { ok: false, status: 'FAIL', resolved: [], unresolved: [], failures: ['ledger tainted', ...read.issues] };
  }
  const resolved = [];
  const unresolved = [];
  const failures = [];
  for (const record of read.records) {
    if (record.task_ref !== taskRef) {
      unresolved.push({ usage_id: record.usage_id, source_ref: record.source_ref, reason: 'USAGE_TASK_BINDING_MISMATCH' });
      failures.push(`usage ${record.usage_id} has task_ref ${record.task_ref}, expected ${taskRef}.`);
      continue;
    }
    const resolution = resolveResourceUsageSource({ repoRoot, runRef, taskRef, sourceRef: record.source_ref });
    if (resolution.ok) {
      resolved.push({ usage_id: record.usage_id, source_ref: record.source_ref, receipt_event_id: resolution.receipt_event.event_id });
    } else {
      unresolved.push({ usage_id: record.usage_id, source_ref: record.source_ref, reason: resolution.denied });
      failures.push(`usage ${record.usage_id}: ${resolution.issues.join(' ')}`);
    }
  }
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return { ok: status === 'PASS', status, resolved, unresolved, failures };
}

// P9-I8: at-rest audit of memory verification bindings. The store reader
// already fails closed on digest tampering; this audit additionally re-checks
// CLG-006 shape and target binding for every stored verification. A record can
// be individually digest-valid while carrying a verification that targets a
// different memory — that is an evidence-chain failure, not a digest one.
function auditMemoryVerifications({ repoRoot }) {
  const read = readMemoryRecords({ repoRoot });
  if (!read.ok) {
    return { ok: false, status: 'FAIL', audited_records: 0, failures: [...read.issues] };
  }
  const failures = [];
  let audited = 0;
  for (const record of read.records.values()) {
    audited += 1;
    if (!Array.isArray(record.verifications) || record.verifications.length === 0) {
      continue;
    }
    for (const verification of record.verifications) {
      const shape = validateVerificationRecord(verification);
      if (!shape.ok) {
        failures.push(`memory ${record.memory_id} verification ${verification.verification_id ?? '?'}: ${shape.issues.join(' ')}`);
        continue;
      }
      if (verification.target_ref !== record.memory_id) {
        failures.push(`memory ${record.memory_id} carries verification ${verification.verification_id} targeting ${verification.target_ref} (cross-subject binding).`);
      }
    }
  }
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return { ok: status === 'PASS', status, audited_records: audited, failures };
}

export {
  CHAIN_STAGE_ORDER,
  auditMemoryVerifications,
  resolveResourceUsageSource,
  validateEvidenceChain,
  validateResourceUsageBindings
};
