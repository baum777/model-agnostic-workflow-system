// MAWS vNext observability extension (MAWS-VN-700).
// Additive vNext event families over the existing observability spine
// conventions (core/contracts/observability-spine.json).
//
// Posture:
// - Pure builders. Callers persist events; this module performs no I/O.
// - Every built event carries the spine envelope's required fields
//   (event_id, event_name, event_family, timestamp, workflow, actor,
//   correlation, provenance, outcome). vNext event families are an
//   additive extension: the frozen spine enum for event_family is not
//   modified here; vNext families reuse the envelope shape and carry
//   vNext correlation ids through the spine `attributes` extension
//   point (dotted keys, primitive values).
// - provenance ('observed' | 'inferred') is mandatory: a caller must
//   classify each event rather than let inference default to observed.
// - details must be JSON-serializable and secret-free; a lightweight
//   heuristic guard rejects obvious secret-shaped keys/values. This is
//   minimization, not a security boundary.
// - Secrets never enter events. No authority is created or granted by
//   building an event.
import { canonicalJson, FailClosedError, newId, nowIso } from '../vnext/util.mjs';

// vNext event families (additive over the frozen spine families).
const VNEXT_EVENT_FAMILIES = [
  'work_unit.lifecycle',
  'planner.decision',
  'qualification',
  'eligibility',
  'routing',
  'executor.binding',
  'execution',
  'graph.revision',
  'arbitration',
  'disagreement',
  'verification',
  'completion'
];

// Spine envelope conventions reused from core/contracts/observability-spine.json.
const SPINE_OUTCOME_STATUSES = ['SUCCESS', 'BLOCKED', 'FAILED'];
const SPINE_BLOCKING_REASONS = [
  'MISSING_REQUIRED_FIELDS',
  'BUDGET_EXHAUSTED',
  'PERMISSION_DENIED',
  'MISSING_PROVENANCE',
  'POLICY_BLOCKED',
  'VALIDATION_FAILED'
];
const SPINE_ORIGIN_TYPES = ['command', 'file', 'validator', 'eval-fixture', 'human-input', 'external-system'];

// Correlation ids carried by vNext events (MAWS-VN-700 DoD).
const VNEXT_CORRELATION_FIELDS = [
  'run_id',
  'work_unit_id',
  'graph_version',
  'executor_id',
  'qualification_ref',
  'routing_decision_ref',
  'execution_attempt_id'
];

// Spine `attributes` keys for the correlation ids (values stay primitive).
const CORRELATION_ATTRIBUTE_KEYS = {
  work_unit_id: 'work_unit.id',
  graph_version: 'graph.version',
  executor_id: 'executor.id',
  qualification_ref: 'qualification.ref',
  routing_decision_ref: 'routing.decision_ref',
  execution_attempt_id: 'execution.attempt_id'
};

// Heuristic secret guard (fail-closed minimization, not a security boundary).
const SECRET_KEY_MARKERS = ['secret', 'password', 'api_key', 'apikey', 'token', 'authorization', 'credential'];
const SECRET_VALUE_PREFIXES = ['sk-', 'Bearer ', '-----BEGIN'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function assertSecretFree(value, path) {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (SECRET_KEY_MARKERS.some((marker) => lowerKey.includes(marker))) {
        throw new FailClosedError(
          'VNEXT_EVENT_SECRET_SUSPECTED',
          `event details key "${key}" at ${path} looks secret-bearing; secrets must never enter events`
        );
      }
      assertSecretFree(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && SECRET_VALUE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    throw new FailClosedError(
      'VNEXT_EVENT_SECRET_SUSPECTED',
      `event details value at ${path} starts with a credential-shaped prefix; secrets must never enter events`
    );
  }
}

function assertJsonSerializable(value) {
  try {
    JSON.stringify(value);
  } catch (error) {
    throw new FailClosedError(
      'VNEXT_EVENT_DETAILS_NOT_SERIALIZABLE',
      `event details must be JSON-serializable: ${error.message}`
    );
  }
}

function normalizeOutcome(outcome) {
  if (outcome === undefined || outcome === null) {
    return { status: 'SUCCESS' };
  }
  if (typeof outcome === 'string') {
    return { status: outcome };
  }
  if (typeof outcome === 'object' && !Array.isArray(outcome)) {
    return outcome;
  }
  throw new FailClosedError(
    'VNEXT_EVENT_OUTCOME_INVALID',
    'outcome must be a spine status string or an outcome object'
  );
}

// Build an additive vNext event over the spine envelope conventions.
// Pure: returns the event; callers persist it.
function buildVnextEvent(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new FailClosedError('VNEXT_EVENT_INVALID', 'buildVnextEvent requires an event input object');
  }

  const {
    family,
    type,
    run_id: runId,
    work_unit_id: workUnitId,
    graph_version: graphVersion,
    executor_id: executorId,
    qualification_ref: qualificationRef,
    routing_decision_ref: routingDecisionRef,
    execution_attempt_id: executionAttemptId,
    outcome,
    details,
    provenance,
    occurred_at: occurredAt,
    source
  } = input;

  if (!VNEXT_EVENT_FAMILIES.includes(family)) {
    throw new FailClosedError(
      'VNEXT_EVENT_FAMILY_UNKNOWN',
      `event family ${JSON.stringify(family)} is not a vNext event family`
    );
  }
  if (!isNonEmptyString(type)) {
    throw new FailClosedError('VNEXT_EVENT_INVALID', 'event type must be a non-empty string');
  }
  if (!isNonEmptyString(runId)) {
    throw new FailClosedError('VNEXT_EVENT_INVALID', 'run_id must be a non-empty string (spine workflow.run_id)');
  }
  if (provenance !== 'observed' && provenance !== 'inferred') {
    throw new FailClosedError(
      'VNEXT_EVENT_PROVENANCE_INVALID',
      "provenance must be explicitly 'observed' or 'inferred'; unclassified events fail closed"
    );
  }

  for (const [field, value] of [
    ['work_unit_id', workUnitId],
    ['executor_id', executorId],
    ['qualification_ref', qualificationRef],
    ['routing_decision_ref', routingDecisionRef],
    ['execution_attempt_id', executionAttemptId]
  ]) {
    if (value !== undefined && !isNonEmptyString(value)) {
      throw new FailClosedError('VNEXT_EVENT_INVALID', `correlation id ${field} must be a non-empty string when present`);
    }
  }
  if (graphVersion !== undefined && (typeof graphVersion !== 'number' || !Number.isInteger(graphVersion) || graphVersion < 1)) {
    throw new FailClosedError('VNEXT_EVENT_INVALID', 'graph_version must be a positive integer when present');
  }

  const normalizedOutcome = normalizeOutcome(outcome);
  if (!SPINE_OUTCOME_STATUSES.includes(normalizedOutcome.status)) {
    throw new FailClosedError(
      'VNEXT_EVENT_OUTCOME_INVALID',
      `outcome.status must be one of ${SPINE_OUTCOME_STATUSES.join(', ')}`
    );
  }
  if (normalizedOutcome.message !== undefined && typeof normalizedOutcome.message !== 'string') {
    throw new FailClosedError('VNEXT_EVENT_OUTCOME_INVALID', 'outcome.message must be a string when present');
  }
  let blockingReasons = normalizedOutcome.blocking_reasons;
  if (normalizedOutcome.status === 'BLOCKED' && blockingReasons === undefined) {
    blockingReasons = ['POLICY_BLOCKED'];
  }
  if (blockingReasons !== undefined) {
    if (!Array.isArray(blockingReasons) || blockingReasons.length === 0) {
      throw new FailClosedError('VNEXT_EVENT_OUTCOME_INVALID', 'BLOCKED events require at least one blocking_reason');
    }
    for (const reason of blockingReasons) {
      if (!SPINE_BLOCKING_REASONS.includes(reason)) {
        throw new FailClosedError(
          'VNEXT_EVENT_OUTCOME_INVALID',
          `blocking_reason ${JSON.stringify(reason)} is not in the spine outcome enum; use outcome.message for free-form reasons`
        );
      }
    }
  }

  let originType = 'command';
  let originRef = 'maws-vnext';
  if (source !== undefined) {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) {
      throw new FailClosedError('VNEXT_EVENT_INVALID', 'source must be { origin_type, origin_ref } when present');
    }
    if (source.origin_type !== undefined) {
      if (!SPINE_ORIGIN_TYPES.includes(source.origin_type)) {
        throw new FailClosedError(
          'VNEXT_EVENT_INVALID',
          `source.origin_type must be one of ${SPINE_ORIGIN_TYPES.join(', ')}`
        );
      }
      originType = source.origin_type;
    }
    if (source.origin_ref !== undefined) {
      if (!isNonEmptyString(source.origin_ref)) {
        throw new FailClosedError('VNEXT_EVENT_INVALID', 'source.origin_ref must be a non-empty string when present');
      }
      originRef = source.origin_ref;
    }
  }

  if (details !== undefined) {
    assertJsonSerializable(details);
    assertSecretFree(details, '$.details');
  }

  const timestamp = occurredAt !== undefined ? occurredAt : nowIso();
  if (!isNonEmptyString(timestamp)) {
    throw new FailClosedError('VNEXT_EVENT_INVALID', 'occurred_at must be a non-empty timestamp string when present');
  }

  const eventName = type.startsWith(`${family}.`) ? type : `${family}.${type}`;

  const attributes = {};
  if (workUnitId !== undefined) {
    attributes[CORRELATION_ATTRIBUTE_KEYS.work_unit_id] = workUnitId;
  }
  if (graphVersion !== undefined) {
    attributes[CORRELATION_ATTRIBUTE_KEYS.graph_version] = graphVersion;
  }
  if (executorId !== undefined) {
    attributes[CORRELATION_ATTRIBUTE_KEYS.executor_id] = executorId;
  }
  if (qualificationRef !== undefined) {
    attributes[CORRELATION_ATTRIBUTE_KEYS.qualification_ref] = qualificationRef;
  }
  if (routingDecisionRef !== undefined) {
    attributes[CORRELATION_ATTRIBUTE_KEYS.routing_decision_ref] = routingDecisionRef;
  }
  if (executionAttemptId !== undefined) {
    attributes[CORRELATION_ATTRIBUTE_KEYS.execution_attempt_id] = executionAttemptId;
  }
  if (details !== undefined) {
    attributes['details.json'] = canonicalJson(details);
  }

  const spineOutcome = { status: normalizedOutcome.status };
  if (normalizedOutcome.message !== undefined) {
    spineOutcome.message = normalizedOutcome.message;
  }
  if (blockingReasons !== undefined) {
    spineOutcome.blocking_reasons = [...blockingReasons];
  }

  return {
    event_id: newId('evt'),
    event_name: eventName,
    event_family: family,
    timestamp,
    workflow: {
      workflow_class: 'maws.vnext',
      run_id: runId
    },
    actor: {
      actor_type: 'system',
      actor_id: 'maws-vnext-runtime'
    },
    correlation: {
      trace_id: runId,
      span_id: newId('span')
    },
    provenance: {
      claim_state: provenance,
      source: {
        origin_type: originType,
        origin_ref: originRef
      },
      captured_at: timestamp
    },
    outcome: spineOutcome,
    attributes
  };
}

// Stable correlation key over the present correlation ids.
// Deterministic field order; absent ids are omitted; built events and
// raw input objects with snake_case ids yield the same key.
function correlationKey(event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    throw new FailClosedError('VNEXT_EVENT_INVALID', 'correlationKey requires an event object');
  }
  const parts = [];
  for (const field of VNEXT_CORRELATION_FIELDS) {
    let value;
    if (field === 'run_id') {
      value = event.workflow?.run_id ?? event.correlation?.trace_id ?? event.run_id;
    } else {
      const attributeKey = CORRELATION_ATTRIBUTE_KEYS[field];
      value = event.attributes?.[attributeKey] ?? event[field];
    }
    if (value !== undefined && value !== null) {
      parts.push(`${field}=${typeof value === 'string' ? value : canonicalJson(value)}`);
    }
  }
  return parts.join('|');
}

export {
  VNEXT_EVENT_FAMILIES,
  VNEXT_CORRELATION_FIELDS,
  buildVnextEvent,
  correlationKey
};
