// MAWS vNext — Executor base (MAWS-VN-400).
//
// OD-01: the canonical execution abstraction is Executor, not Model.
// OD-09: an executor declaration carries zero qualification, authority, or
//        routing semantics. Registration is never qualification.
//
// This module defines the generic executor interface and the normalized
// ExecutionResult contract. Transports (process/HTTP) live in separate
// modules; executors are transport *callers*, providers adapters stay pure.
//
// Invariants enforced here:
// - ExecutionResult is normalized and bounded; auth material never appears
//   in results (recursive redaction of credential-shaped keys).
// - Process failures classify fail-closed: ENOENT -> EXECUTOR_UNAVAILABLE,
//   AbortError -> CANCELLED, timeout -> TIMEOUT.
// - FailClosedError from transports/executors is never swallowed into a
//   result: contract violations propagate.
import { FailClosedError, newId, nowIso } from '../vnext/util.mjs';

const EXECUTOR_ID_PATTERN = /^exec_[a-z0-9_]+$/;
const CAPABILITY_ID_PATTERN = /^cap_[a-z0-9_]+$/;
const WORK_UNIT_ID_PATTERN = /^wu_[a-z0-9_]+$/;
const EXECUTOR_CLASSES = new Set(['llm', 'agent_harness', 'deterministic_service', 'human']);
const TRANSPORTS = new Set(['codex_exec', 'openrouter_api', 'local_process', 'in_process', 'human_gate']);
export const EXECUTION_OUTCOMES = new Set(['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED']);

// Keys whose values are treated as auth material wherever they appear in
// executor-produced payloads. Values are redacted, never carried into results.
const AUTH_KEY_PATTERN = /authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|credential|bearer/i;
const REDACTED = '[REDACTED:auth]';
const SCRUB_DEPTH_LIMIT = 8;

/**
 * Classify a raw process/transport failure into the normalized outcome space.
 *
 * ENOENT      -> { outcome: FAILED,   error_class: EXECUTOR_UNAVAILABLE }
 * AbortError  -> { outcome: CANCELLED, error_class: EXECUTION_ABORTED }
 * timeout     -> { outcome: TIMEOUT,  error_class: EXECUTION_TIMEOUT }
 * anything else -> { outcome: FAILED, error_class: EXECUTION_ERROR }
 *
 * @param {unknown} error
 * @returns {{ outcome: string, error_class: string }}
 */
export function normalizeProcessFailure(error) {
  if (!error || typeof error !== 'object') {
    return { outcome: 'FAILED', error_class: 'EXECUTION_ERROR' };
  }
  if (error.code === 'ENOENT') {
    return { outcome: 'FAILED', error_class: 'EXECUTOR_UNAVAILABLE' };
  }
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.signal?.aborted === true) {
    return { outcome: 'CANCELLED', error_class: 'EXECUTION_ABORTED' };
  }
  if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT' || error.isTimeout === true) {
    return { outcome: 'TIMEOUT', error_class: 'EXECUTION_TIMEOUT' };
  }
  return { outcome: 'FAILED', error_class: 'EXECUTION_ERROR' };
}

function scrubAuthMaterial(value, depth = 0) {
  if (depth > SCRUB_DEPTH_LIMIT) {
    return '[REDACTED:depth-limit]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubAuthMaterial(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const scrubbed = {};
    for (const [key, inner] of Object.entries(value)) {
      scrubbed[key] = AUTH_KEY_PATTERN.test(key) ? REDACTED : scrubAuthMaterial(inner, depth + 1);
    }
    return scrubbed;
  }
  if (typeof value === 'string' && /^Bearer\s+\S+/i.test(value)) {
    return REDACTED;
  }
  return value;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function assertInvocationShape(invocation) {
  if (!invocation || typeof invocation !== 'object') {
    throw new FailClosedError('INVOCATION_INVALID', 'execution invocation must be an object');
  }
  if (!isNonEmptyString(invocation.work_unit_id) || !WORK_UNIT_ID_PATTERN.test(invocation.work_unit_id)) {
    throw new FailClosedError('INVOCATION_INVALID', `work_unit_id must match ${WORK_UNIT_ID_PATTERN}`);
  }
  if (invocation.node_id !== undefined && !isNonEmptyString(invocation.node_id)) {
    throw new FailClosedError('INVOCATION_INVALID', 'node_id must be a non-empty string when present');
  }
  const contextPackage = invocation.context_package;
  if (!contextPackage || typeof contextPackage !== 'object' || Array.isArray(contextPackage)) {
    throw new FailClosedError('INVOCATION_INVALID', 'context_package must be an object');
  }
  if (!isNonEmptyString(contextPackage.objective)) {
    throw new FailClosedError('INVOCATION_INVALID', 'context_package.objective must be a non-empty string');
  }
  const authorityEnvelope = invocation.authority_envelope;
  if (!authorityEnvelope || typeof authorityEnvelope !== 'object' || Array.isArray(authorityEnvelope)) {
    throw new FailClosedError('INVOCATION_INVALID', 'authority_envelope must be an object');
  }
  if (!isNonEmptyString(authorityEnvelope.scope_ref)) {
    throw new FailClosedError('INVOCATION_INVALID', 'authority_envelope.scope_ref must be a non-empty string');
  }
  if (!Array.isArray(authorityEnvelope.allowed_effects)) {
    throw new FailClosedError('INVOCATION_INVALID', 'authority_envelope.allowed_effects must be an array');
  }
  if (invocation.timeout_ms !== undefined && (typeof invocation.timeout_ms !== 'number' || invocation.timeout_ms <= 0)) {
    throw new FailClosedError('INVOCATION_INVALID', 'timeout_ms must be a positive number when present');
  }
  if (invocation.signal !== undefined && !(invocation.signal instanceof AbortSignal)) {
    throw new FailClosedError('INVOCATION_INVALID', 'signal must be an AbortSignal when present');
  }
  if (invocation.execution_attempt_id !== undefined && !isNonEmptyString(invocation.execution_attempt_id)) {
    throw new FailClosedError('INVOCATION_INVALID', 'execution_attempt_id must be a non-empty string when present');
  }
}

function normalizeOutputs(outputs) {
  if (outputs === undefined || outputs === null) {
    return [];
  }
  if (!Array.isArray(outputs)) {
    throw new FailClosedError('EXECUTION_RESULT_INVALID', 'executor outputs must be an array');
  }
  return outputs.map((output, index) => {
    if (!output || typeof output !== 'object') {
      throw new FailClosedError('EXECUTION_RESULT_INVALID', `outputs[${index}] must be an object`);
    }
    const hasArtifactRef = 'artifact_ref' in output;
    const hasInlinePayload = 'inline_payload' in output;
    if (hasArtifactRef === hasInlinePayload) {
      throw new FailClosedError(
        'EXECUTION_RESULT_INVALID',
        `outputs[${index}] must carry exactly one of artifact_ref or inline_payload`
      );
    }
    return {
      output_id: isNonEmptyString(output.output_id) ? output.output_id : newId('out'),
      ...(hasArtifactRef ? { artifact_ref: output.artifact_ref } : { inline_payload: scrubAuthMaterial(output.inline_payload) })
    };
  });
}

function buildExecutionResult(fields) {
  const metrics = fields.metrics && typeof fields.metrics === 'object' ? fields.metrics : {};
  const result = {
    execution_attempt_id: fields.execution_attempt_id,
    executor_id: fields.executor_id,
    work_unit_id: fields.work_unit_id,
    started_at: fields.started_at,
    finished_at: fields.finished_at,
    outcome: fields.outcome,
    outputs: normalizeOutputs(fields.outputs),
    metrics: {
      latency_ms: typeof metrics.latency_ms === 'number' && Number.isFinite(metrics.latency_ms) ? metrics.latency_ms : 0,
      cost_units: typeof metrics.cost_units === 'number' && Number.isFinite(metrics.cost_units) ? metrics.cost_units : 0,
      tokens_in: typeof metrics.tokens_in === 'number' && Number.isFinite(metrics.tokens_in) ? metrics.tokens_in : 0,
      tokens_out: typeof metrics.tokens_out === 'number' && Number.isFinite(metrics.tokens_out) ? metrics.tokens_out : 0
    },
    error_class: isNonEmptyString(fields.error_class) ? fields.error_class : null,
    exit_code: typeof fields.exit_code === 'number' ? fields.exit_code : null
  };
  if (fields.flags && typeof fields.flags === 'object' && Object.keys(fields.flags).length > 0) {
    result.flags = scrubAuthMaterial(fields.flags);
  }
  return result;
}

/**
 * Define a MAWS vNext executor from a declaration.
 *
 * @param {object} declaration
 * @param {string} declaration.executorId            - canonical id (exec_*)
 * @param {string} declaration.executorClass         - llm | agent_harness | deterministic_service | human
 * @param {string} declaration.transport             - codex_exec | openrouter_api | local_process | in_process | human_gate
 * @param {string[]} declaration.declaredCapabilities - capability ids (cap_*); declarations only, never qualification
 * @param {Function} declaration.execute             - async (invocation) => partial result | throws
 * @returns {object} executor with normalized execute() and toManifest()
 */
export function defineExecutor(declaration) {
  if (!declaration || typeof declaration !== 'object') {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', 'executor declaration must be an object');
  }
  const { executorId, executorClass, transport, declaredCapabilities, execute } = declaration;
  if (!isNonEmptyString(executorId) || !EXECUTOR_ID_PATTERN.test(executorId)) {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', `executorId must match ${EXECUTOR_ID_PATTERN}`);
  }
  if (!EXECUTOR_CLASSES.has(executorClass)) {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', `executorClass must be one of ${[...EXECUTOR_CLASSES].join(', ')}`);
  }
  if (!TRANSPORTS.has(transport)) {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', `transport must be one of ${[...TRANSPORTS].join(', ')}`);
  }
  if (
    !Array.isArray(declaredCapabilities) ||
    declaredCapabilities.length === 0 ||
    declaredCapabilities.some((capabilityId) => !isNonEmptyString(capabilityId) || !CAPABILITY_ID_PATTERN.test(capabilityId))
  ) {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', `declaredCapabilities must be a non-empty array of ${CAPABILITY_ID_PATTERN} ids`);
  }
  if (typeof execute !== 'function') {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', 'execute must be a function');
  }

  const displayName = isNonEmptyString(declaration.displayName) ? declaration.displayName : executorId;

  async function executeNormalized(invocation) {
    assertInvocationShape(invocation);
    const startedAtMs = Date.now();
    const startedAt = nowIso();
    const executionAttemptId = isNonEmptyString(invocation.execution_attempt_id)
      ? invocation.execution_attempt_id
      : newId('execatt');
    const enrichedInvocation = { ...invocation, execution_attempt_id: executionAttemptId };

    let partial;
    try {
      partial = await execute(enrichedInvocation);
    } catch (error) {
      if (error instanceof FailClosedError) {
        // Contract violations are not execution outcomes; they propagate.
        throw error;
      }
      const { outcome, error_class: errorClass } = normalizeProcessFailure(error);
      return buildExecutionResult({
        execution_attempt_id: executionAttemptId,
        executor_id: executorId,
        work_unit_id: invocation.work_unit_id,
        started_at: startedAt,
        finished_at: nowIso(),
        outcome,
        metrics: { latency_ms: Date.now() - startedAtMs },
        error_class: errorClass,
        exit_code: null
      });
    }

    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      throw new FailClosedError('EXECUTION_RESULT_INVALID', 'executor execute() must return an object');
    }
    if (!EXECUTION_OUTCOMES.has(partial.outcome)) {
      throw new FailClosedError(
        'EXECUTION_RESULT_INVALID',
        `executor outcome must be one of ${[...EXECUTION_OUTCOMES].join('|')}, got ${String(partial.outcome)}`
      );
    }
    return buildExecutionResult({
      execution_attempt_id: executionAttemptId,
      executor_id: executorId,
      work_unit_id: invocation.work_unit_id,
      started_at: startedAt,
      finished_at: nowIso(),
      outcome: partial.outcome,
      outputs: partial.outputs,
      metrics: { latency_ms: Date.now() - startedAtMs, ...partial.metrics },
      error_class: partial.error_class,
      exit_code: partial.exit_code,
      flags: partial.flags
    });
  }

  return {
    executor_id: executorId,
    executor_class: executorClass,
    transport,
    declared_capabilities: declaredCapabilities.map((capabilityId) => ({ capability_id: capabilityId })),
    execute: executeNormalized,
    /** Manifest-shaped declaration (schema-valid against executor-manifest.schema.json). */
    toManifest() {
      return {
        executor_id: executorId,
        executor_class: executorClass,
        display_name: displayName,
        declared_capabilities: declaredCapabilities.map((capabilityId) => ({ capability_id: capabilityId })),
        transport,
        session_model_can_bind: false
      };
    }
  };
}
