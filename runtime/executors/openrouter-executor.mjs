// MAWS vNext — OpenRouter direct model executor (MAWS-VN-402).
//
// Executor class: llm, transport: openrouter_api. This is the separate
// transport layer; provider adapters under runtime/adapters stay pure
// transformation layers and perform no network I/O.
//
// OD-12-relevant behavior: the requested model id is sent EXPLICITLY in the
// request; when the provider reports serving a different model
// (response.model != modelId) the result carries flags
// { model_substitution: true, served_model } — never a silent substitution.
//
// Secret handling: OPENROUTER_API_KEY is read from the environment, used in
// the Authorization header only, and never appears in ExecutionResults,
// flags, error classes, or metrics.
import { assertOutboundUrlAllowed, FailClosedError } from '../vnext/util.mjs';

import { defineExecutor } from './executor-base.mjs';

const OPENROUTER_HOST_ALLOWLIST = ['openrouter.ai'];
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

function combineSignals(invocation) {
  const signals = [];
  if (invocation.signal instanceof AbortSignal) {
    signals.push(invocation.signal);
  }
  if (typeof invocation.timeout_ms === 'number' && invocation.timeout_ms > 0) {
    signals.push(AbortSignal.timeout(invocation.timeout_ms));
  }
  if (signals.length === 0) {
    return undefined;
  }
  if (signals.length === 1) {
    return signals[0];
  }
  return AbortSignal.any(signals);
}

function toNumberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Create the OpenRouter direct model executor.
 *
 * @param {object} options
 * @param {string} options.modelId         - explicit model id (e.g. 'zai/glm-4.7'); sent verbatim
 * @param {Function} [options.fetchImpl]   - injectable fetch for tests (default global fetch)
 * @param {Object} [options.env]           - environment source (default process.env); must contain OPENROUTER_API_KEY
 * @param {string} [options.baseUrl]       - endpoint URL; host must be in the openrouter.ai allowlist
 * @returns {object} executor (defineExecutor shape)
 */
export function createOpenRouterExecutor({
  modelId,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  env = process.env,
  baseUrl = DEFAULT_BASE_URL
} = {}) {
  if (typeof modelId !== 'string' || modelId.length === 0) {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', 'createOpenRouterExecutor requires an explicit modelId');
  }
  if (typeof fetchImpl !== 'function') {
    throw new FailClosedError('EXECUTOR_DECLARATION_INVALID', 'fetchImpl must be a function');
  }

  return defineExecutor({
    executorId: 'exec_openrouter_glm',
    executorClass: 'llm',
    displayName: 'OpenRouter direct model executor',
    transport: 'openrouter_api',
    declaredCapabilities: ['cap_repository_analysis'],
    execute: async (invocation) => {
      // 1) Credential gate (fail closed before any outbound attempt).
      const apiKey = env ? env.OPENROUTER_API_KEY : undefined;
      if (typeof apiKey !== 'string' || apiKey.length === 0) {
        return { outcome: 'FAILED', error_class: 'CREDENTIAL_MISSING', exit_code: null };
      }

      // 2) Outbound URL guard: only the explicit openrouter.ai allowlist.
      assertOutboundUrlAllowed(baseUrl, OPENROUTER_HOST_ALLOWLIST);

      const startedAtMs = Date.now();
      const requestSignal = combineSignals(invocation);
      const requestBody = {
        model: modelId,
        messages: [
          {
            role: 'system',
            content:
              'You are a MAWS executor. Work strictly inside the provided context package; do not request authority, secrets, or scope beyond it.'
          },
          { role: 'user', content: JSON.stringify(invocation.context_package) }
        ]
      };

      const hasTimeoutSignal = typeof invocation.timeout_ms === 'number' && invocation.timeout_ms > 0;
      let response;
      try {
        response = await fetchImpl(baseUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: requestSignal
        });
      } catch (error) {
        if (invocation.signal instanceof AbortSignal && invocation.signal.aborted === true) {
          return { outcome: 'CANCELLED', error_class: 'CANCELLED', exit_code: null };
        }
        if (error && (error.name === 'TimeoutError' || (error.name === 'AbortError' && hasTimeoutSignal))) {
          return { outcome: 'TIMEOUT', error_class: 'TIMEOUT', exit_code: null };
        }
        return { outcome: 'FAILED', error_class: 'OR_UNAVAILABLE', exit_code: null };
      }

      if (!response || typeof response.status !== 'number') {
        return { outcome: 'FAILED', error_class: 'OR_BAD_RESPONSE', exit_code: null };
      }
      if (response.status === 429) {
        return {
          outcome: 'FAILED',
          error_class: 'OR_RATE_LIMITED',
          exit_code: null,
          flags: { http_status: response.status }
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          outcome: 'FAILED',
          error_class: 'OR_BAD_RESPONSE',
          exit_code: null,
          flags: { http_status: response.status }
        };
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        return { outcome: 'FAILED', error_class: 'OR_BAD_RESPONSE', exit_code: null };
      }
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return { outcome: 'FAILED', error_class: 'OR_BAD_RESPONSE', exit_code: null };
      }

      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        return { outcome: 'FAILED', error_class: 'OR_BAD_RESPONSE', exit_code: null };
      }

      const usage = (payload.usage && typeof payload.usage === 'object' && !Array.isArray(payload.usage)) ? payload.usage : {};
      const metrics = {
        latency_ms: Date.now() - startedAtMs,
        cost_units: toNumberOrZero(usage.cost),
        tokens_in: toNumberOrZero(usage.prompt_tokens),
        tokens_out: toNumberOrZero(usage.completion_tokens)
      };

      const flags = {};
      const servedModel = payload.model;
      if (typeof servedModel === 'string' && servedModel !== modelId) {
        // Provider-side substitution is surfaced, never silently accepted.
        flags.model_substitution = true;
        flags.served_model = servedModel;
      }

      const outputs = [{ inline_payload: content }];
      return {
        outcome: 'SUCCESS',
        outputs,
        metrics,
        exit_code: 0,
        ...(Object.keys(flags).length > 0 ? { flags } : {})
      };
    }
  });
}
