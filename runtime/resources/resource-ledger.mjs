import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RuntimeBlockedError } from '../kernel/runtime-errors.mjs';

// CLG P7 resource ledger — durable, append-only consumption accounting with
// fail-closed admission BEFORE consumption.
//
// Boundaries (structurally enforced, not prose):
//   Resource usage   != Authority        (admission is a budget gate, never an approval)
//   Resource usage   != Verification     (usage records carry no result semantics)
//   Resource ledger  != EventLog         (own artifact class; the P5 event log MAY
//                                         reference it via payload_ref — no new event types)
//   Resource ledger  != RuntimeState     (retry_count/replan_count stay the canonical
//                                         execution truth; this ledger does NOT track them)
//   Resource admission != Task completion (exhaustion never produces COMPLETE)
//
// Resource set (only semantics that actually exist in this runtime — no invention):
//   effects       count  — kernel action boundary executes effects  -> enforced admission
//   wall_clock_ms ms     — elapsed runtime is observable            -> enforced admission
//   tokens        tokens — NO runtime metering source exists        -> admission UNAVAILABLE
//   cost          currency — NO provider pricing source exists      -> admission UNAVAILABLE
//                    (EXTERNAL_USAGE_SOURCE — no fake cost model, P7-R5/R10)

const RESOURCE_TYPES = Object.freeze(['effects', 'wall_clock_ms', 'tokens', 'cost']);
const ADMISSION_RESOURCE_TYPES = Object.freeze(['effects', 'wall_clock_ms']);
const RESOURCE_UNITS = Object.freeze({
  effects: 'count',
  wall_clock_ms: 'ms',
  tokens: 'tokens',
  cost: 'currency'
});
const RESOURCE_LIMIT_FIELDS = Object.freeze({
  effects: 'max_effects',
  wall_clock_ms: 'max_wall_clock_ms'
});
const ALLOWED_RECORD_FIELDS = Object.freeze([
  'usage_id', 'run_ref', 'task_ref', 'resource_type', 'amount', 'unit',
  'source_ref', 'correlation_ref', 'timestamp', 'sequence', 'record_digest',
  'record_version'
]);
// P8 contract alignment: envelope metadata written from CLG-P8 onward. It sits
// OUTSIDE record_digest so historical pre-P8 records (no field) stay valid;
// a PRESENT but unknown version is denied (no migration without owner order).
const USAGE_RECORD_VERSION = '1.0.0';
const RUN_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const USAGE_ID_PATTERN = /^usg_[A-Za-z0-9_-]+$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function sha256OfCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

// Digest boundary: semantic record content only — record_digest itself is outside.
function digestTarget(record) {
  return {
    usage_id: record.usage_id,
    run_ref: record.run_ref,
    task_ref: record.task_ref,
    resource_type: record.resource_type,
    amount: record.amount,
    unit: record.unit,
    source_ref: record.source_ref,
    correlation_ref: record.correlation_ref,
    timestamp: record.timestamp,
    sequence: record.sequence
  };
}

export function ledgerFilePath(repoRoot, runRef) {
  return path.join(path.resolve(repoRoot), 'artifacts', 'runtime-runs', runRef, 'resource-usage.jsonl');
}

export function validateResourceBudget(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, issues: ['ResourceBudget must be an object.'] };
  }
  if (!isNonEmptyString(candidate.budget_id)) {
    issues.push('ResourceBudget.budget_id must be a non-empty string.');
  }
  if (!candidate.limits || typeof candidate.limits !== 'object' || Array.isArray(candidate.limits)) {
    issues.push('ResourceBudget.limits must be an object.');
  } else {
    const keys = Object.keys(candidate.limits);
    if (keys.length === 0) {
      issues.push('ResourceBudget.limits must configure at least one limit.');
    }
    for (const key of keys) {
      if (!Object.values(RESOURCE_LIMIT_FIELDS).includes(key)) {
        issues.push(`ResourceBudget.limits.${key} is not a supported limit field.`);
      } else if (!Number.isInteger(candidate.limits[key]) || candidate.limits[key] < 0) {
        issues.push(`ResourceBudget.limits.${key} must be a non-negative integer.`);
      }
    }
  }
  if (candidate.policy_ref !== undefined && !isNonEmptyString(candidate.policy_ref)) {
    issues.push('ResourceBudget.policy_ref must be a non-empty string when present.');
  }
  return { ok: issues.length === 0, issues };
}

function validateUsageRecord(candidate, { runRef, taskRef }) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, issues: ['ResourceUsageRecord must be an object.'] };
  }
  const issues = [];
  for (const key of Object.keys(candidate)) {
    if (!ALLOWED_RECORD_FIELDS.includes(key)) {
      issues.push(`ResourceUsageRecord has unknown field: ${key}.`);
    }
  }
  if (!isNonEmptyString(candidate.usage_id) || !USAGE_ID_PATTERN.test(candidate.usage_id)) {
    issues.push('ResourceUsageRecord.usage_id is malformed.');
  }
  if (candidate.run_ref !== runRef) {
    issues.push('ResourceUsageRecord.run_ref does not match the ledger binding.');
  }
  if (candidate.task_ref !== taskRef) {
    issues.push('ResourceUsageRecord.task_ref does not match the ledger binding.');
  }
  if (!RESOURCE_TYPES.includes(candidate.resource_type)) {
    issues.push('ResourceUsageRecord.resource_type is not a supported resource type.');
  }
  if (typeof candidate.amount !== 'number' || !Number.isFinite(candidate.amount) || candidate.amount <= 0) {
    issues.push('ResourceUsageRecord.amount must be a finite positive number.');
  } else if (candidate.unit !== RESOURCE_UNITS[candidate.resource_type]) {
    issues.push('ResourceUsageRecord.unit does not match the resource type.');
  }
  if (!isNonEmptyString(candidate.source_ref)) {
    issues.push('ResourceUsageRecord.source_ref must be a non-empty string.');
  }
  if (candidate.correlation_ref !== null && candidate.correlation_ref !== undefined && !isNonEmptyString(candidate.correlation_ref)) {
    issues.push('ResourceUsageRecord.correlation_ref must be a non-empty string or null.');
  }
  if (!isNonEmptyString(candidate.timestamp)) {
    issues.push('ResourceUsageRecord.timestamp must be a non-empty string.');
  }
  if (candidate.record_version !== undefined && candidate.record_version !== USAGE_RECORD_VERSION) {
    issues.push(`ResourceUsageRecord.record_version ${String(candidate.record_version)} is unknown (DENY; no migration without explicit owner disposition).`);
  }
  if (!Number.isInteger(candidate.sequence) || candidate.sequence < 1) {
    issues.push('ResourceUsageRecord.sequence must be a positive integer.');
  }
  if (!isNonEmptyString(candidate.record_digest) || !DIGEST_PATTERN.test(candidate.record_digest)) {
    issues.push('ResourceUsageRecord.record_digest is malformed.');
  } else {
    const expected = sha256OfCanonical(digestTarget(candidate));
    if (candidate.record_digest !== expected) {
      issues.push('ResourceUsageRecord.record_digest mismatch (tampered or forged record).');
    }
  }
  return { ok: issues.length === 0, issues };
}

// Admission decisions for resources WITHOUT a runtime metering source are
// UNAVAILABLE, not ALLOWED: a missing source must never be read as budget headroom.
function admissionDecisionForType(resourceType) {
  if (!RESOURCE_TYPES.includes(resourceType)) {
    return { decision: 'DENIED', reason: 'RESOURCE_TYPE_UNSUPPORTED' };
  }
  if (!ADMISSION_RESOURCE_TYPES.includes(resourceType)) {
    return { decision: 'UNAVAILABLE', reason: 'EXTERNAL_USAGE_SOURCE' };
  }
  return null;
}

export function createResourceLedger({ repoRoot, runRef, taskRef, budget, now = null }) {
  if (!isNonEmptyString(runRef) || !RUN_REF_PATTERN.test(runRef)) {
    throw new RuntimeBlockedError('Resource ledger run_ref must be path-safe.', ['MALFORMED_RUN_REF']);
  }
  if (!isNonEmptyString(taskRef) || !RUN_REF_PATTERN.test(taskRef)) {
    throw new RuntimeBlockedError('Resource ledger task_ref must be a path-safe non-empty string.', ['MALFORMED_TASK_REF']);
  }
  const budgetCheck = validateResourceBudget(budget);
  if (!budgetCheck.ok) {
    throw new RuntimeBlockedError('Resource ledger budget rejected (fail-closed).', budgetCheck.issues);
  }
  const filePath = ledgerFilePath(repoRoot, runRef);

  function readLedger() {
    if (!fs.existsSync(filePath)) {
      return { ok: true, tainted: false, records: [], issues: [] };
    }
    const records = [];
    const issues = [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    for (let index = 0; index < lines.length; index += 1) {
      let candidate;
      try {
        candidate = JSON.parse(lines[index]);
      } catch {
        issues.push(`resource-usage.jsonl line ${index + 1} is not valid JSON (ledger tainted).`);
        continue;
      }
      const check = validateUsageRecord(candidate, { runRef, taskRef });
      if (!check.ok) {
        for (const issue of check.issues) {
          issues.push(`resource-usage.jsonl line ${index + 1}: ${issue}`);
        }
        continue;
      }
      records.push(Object.freeze(candidate));
    }
    return { ok: issues.length === 0, tainted: issues.length > 0, records, issues };
  }

  function latestSequence(records) {
    return records.reduce((max, record) => Math.max(max, record.sequence), 0);
  }

  function appendUsage({ resourceType, amount, sourceRef, correlationRef = null, usageId = null, timestamp = null }) {
    if (!RESOURCE_TYPES.includes(resourceType)) {
      return { ok: false, issues: [`Unsupported resource type: ${String(resourceType)}.`] };
    }
    if (!ADMISSION_RESOURCE_TYPES.includes(resourceType)) {
      // tokens/cost have no runtime metering source; recording invented consumption
      // would fake budget truth (P7-R5/R10). External systems own their accounting.
      return { ok: false, issues: [`EXTERNAL_USAGE_SOURCE: no runtime metering source for '${resourceType}' (observation-only resource, not recordable here).`] };
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, issues: ['Usage amount must be a finite positive number.'] };
    }
    if (!isNonEmptyString(sourceRef)) {
      return { ok: false, issues: ['Usage source_ref is required (no unattributed consumption).'] };
    }
    const ledger = readLedger();
    if (ledger.tainted) {
      return { ok: false, issues: ['ResourceUsageLedger tainted: append denied (fail-closed).', ...ledger.issues] };
    }
    const finalUsageId = usageId ?? `usg_${crypto.randomBytes(8).toString('hex')}`;
    if (!USAGE_ID_PATTERN.test(finalUsageId)) {
      return { ok: false, issues: ['usage_id is malformed.'] };
    }
    if (ledger.records.some((record) => record.usage_id === finalUsageId)) {
      return { ok: false, issues: [`DUPLICATE_USAGE_ID: ${finalUsageId} already exists (append-only, no overwrite).`] };
    }
    const record = Object.freeze({
      usage_id: finalUsageId,
      run_ref: runRef,
      task_ref: taskRef,
      resource_type: resourceType,
      amount,
      unit: RESOURCE_UNITS[resourceType],
      source_ref: sourceRef,
      correlation_ref: correlationRef ?? null,
      timestamp: timestamp ?? now ?? new Date().toISOString(),
      sequence: latestSequence(ledger.records) + 1,
      record_version: USAGE_RECORD_VERSION,
      record_digest: null
    });
    const sealed = Object.freeze({ ...record, record_digest: sha256OfCanonical(digestTarget(record)) });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(sealed)}\n`, 'utf8');
    return { ok: true, issues: [], record: sealed, ledgerPath: filePath };
  }

  function currentUsage(resourceType) {
    if (!RESOURCE_TYPES.includes(resourceType)) {
      return { ok: false, tainted: false, consumed: null, issues: [`Unsupported resource type: ${String(resourceType)}.`] };
    }
    const ledger = readLedger();
    if (ledger.tainted) {
      return { ok: false, tainted: true, consumed: null, issues: ledger.issues };
    }
    const relevant = ledger.records.filter((record) => record.resource_type === resourceType);
    return {
      ok: true,
      tainted: false,
      consumed: relevant.reduce((sum, record) => sum + record.amount, 0),
      recordCount: relevant.length,
      issues: []
    };
  }

  function limitFor(resourceType) {
    const limitField = RESOURCE_LIMIT_FIELDS[resourceType];
    return limitField && budget.limits[limitField] !== undefined ? budget.limits[limitField] : null;
  }

  // P7-R4: admission happens BEFORE consumption. Denial is data, not an effect.
  function admit({ resourceType, amount }) {
    const typed = admissionDecisionForType(resourceType);
    if (typed) {
      return { ok: false, ...typed, resourceType, amount: amount ?? null, consumed: null, limit: null, remainingAfter: null };
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, decision: 'DENIED', reason: 'MALFORMED_ADMISSION_REQUEST', resourceType, amount, consumed: null, limit: null, remainingAfter: null };
    }
    const limit = limitFor(resourceType);
    if (limit === null) {
      return { ok: false, decision: 'DENIED', reason: 'RESOURCE_LIMIT_UNCONFIGURED', resourceType, amount, consumed: null, limit: null, remainingAfter: null };
    }
    const usage = currentUsage(resourceType);
    if (!usage.ok) {
      return { ok: false, decision: 'DENIED', reason: usage.tainted ? 'LEDGER_TAINTED' : 'LEDGER_UNREADABLE', resourceType, amount, consumed: null, limit, remainingAfter: null, issues: usage.issues };
    }
    const remaining = limit - usage.consumed;
    if (amount > remaining) {
      return { ok: false, decision: 'DENIED', reason: 'RESOURCE_BUDGET_EXHAUSTED', resourceType, amount, consumed: usage.consumed, limit, remainingAfter: remaining };
    }
    return { ok: true, decision: 'ALLOWED', reason: null, resourceType, amount, consumed: usage.consumed, limit, remainingAfter: remaining - amount };
  }

  function remainingBudget(resourceType) {
    const typed = admissionDecisionForType(resourceType);
    if (typed) {
      return { ok: false, ...typed, resourceType, limit: null, consumed: null, remaining: null };
    }
    const limit = limitFor(resourceType);
    if (limit === null) {
      return { ok: false, decision: 'DENIED', reason: 'RESOURCE_LIMIT_UNCONFIGURED', resourceType, limit: null, consumed: null, remaining: null };
    }
    const usage = currentUsage(resourceType);
    if (!usage.ok) {
      return { ok: false, decision: 'DENIED', reason: usage.tainted ? 'LEDGER_TAINTED' : 'LEDGER_UNREADABLE', resourceType, limit, consumed: null, remaining: null, issues: usage.issues };
    }
    return { ok: true, decision: 'ALLOWED', reason: null, resourceType, limit, consumed: usage.consumed, remaining: limit - usage.consumed };
  }

  return Object.freeze({
    ledger: 'ResourceUsageLedger',
    budget_id: budget.budget_id,
    runRef,
    taskRef,
    ledgerPath: filePath,
    readLedger,
    appendUsage,
    currentUsage,
    admit,
    remainingBudget
  });
}

// Port surface consumed by the kernel action boundary. admit() runs BEFORE the
// effect; recordConsumption() runs AFTER the receipt exists so the ledger only
// ever holds actual consumption bound to a receipt source_ref.
export function createResourceAdmissionPort({ ledger, resourceType = 'effects', amountPerAction = 1 }) {
  if (!ledger || ledger.ledger !== 'ResourceUsageLedger') {
    throw new RuntimeBlockedError('ResourceAdmissionPort requires a ResourceUsageLedger binding (fail-closed).', [
      'RESOURCE_LEDGER_BINDING_REQUIRED'
    ]);
  }
  if (!Number.isInteger(amountPerAction) || amountPerAction <= 0) {
    throw new RuntimeBlockedError('ResourceAdmissionPort.amountPerAction must be a positive integer.', [
      'MALFORMED_ADMISSION_AMOUNT'
    ]);
  }
  return Object.freeze({
    port: 'ResourceAdmissionPort',
    resourceType,
    amountPerAction,
    admit({ actionProposal } = {}) {
      return ledger.admit({ resourceType, amount: amountPerAction });
    },
    recordConsumption({ receipt, correlationRef = null } = {}) {
      if (!receipt || !isNonEmptyString(receipt.receipt_id)) {
        return { ok: false, issues: ['recordConsumption requires a valid effect receipt.'] };
      }
      return ledger.appendUsage({
        resourceType,
        amount: amountPerAction,
        sourceRef: receipt.receipt_id,
        correlationRef: correlationRef ?? null
      });
    }
  });
}
