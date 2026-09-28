// OpenCode Zen System-One transport for Jev (JEV-ZEN-TRANSPORT-01, OD-19).
//
// Second Jev transport beside the canonical OpenRouter Decisions lane
// (openrouter-decisions.mjs). Transport is a provider adapter only: question
// registry, closed answer spaces, threshold policy, receipt contract, and
// fail-closed behavior stay transport-neutral. Downstream MAWS cannot
// distinguish the transports except via receipt provenance (mode + resolved
// model snapshot).
//
// Request contract documented by OpenCode Zen (opencode.ai/docs/zen,
// captured 2026-09-28):
//
//   POST https://opencode.ai/zen/v1/systemone
//   Authorization: Bearer $OPENCODE_API_KEY
//   request:  { model, state,
//               questions: { [id]: { type: "choice", instructions,
//                                    criteria: { [option]: meaning } } } }
//
//   response: answers are returned under the matching question id; the exact
//   response field set (resolved model snapshot, confidence, probabilities,
//   usage) is confirmed at first live activation (owner-provided
//   OPENCODE_API_KEY). Until then this transport normalizes the same shape as
//   the verified OpenRouter Decisions response and invents no fallback
//   fields, endpoints, or models.
//
// Fail-closed: no endpoint fallback, no model fallback, no chat/completions
// substitution, secrets never reflected in errors or results.
import { assertOutboundUrlAllowed } from '../../vnext/util.mjs';

export const ZEN_SYSTEMONE_URL = 'https://opencode.ai/zen/v1/systemone';
export const ZEN_SYSTEMONE_HOSTS = ['opencode.ai'];
const DEFAULT_TIMEOUT_MS = 10000;

function failure(disposition, errorClass, message, extras = {}) {
  return { ok: false, disposition, error_class: errorClass, message, ...extras };
}

/**
 * Build the System-One request body for one typed choice question. The Zen
 * request schema is documented identical to the OpenRouter Decisions schema:
 * the criteria map is derived from the closed choice space; the meaning of
 * each option is the option id itself (the typed semantic IS the id space).
 */
export function buildSystemOneRequestBody({ model, questionId, instructions, choices, state }) {
  const criteria = {};
  for (const choice of choices) {
    criteria[choice] = choice;
  }
  return {
    model,
    state: state === undefined ? {} : state,
    questions: {
      [questionId]: {
        type: 'choice',
        instructions: typeof instructions === 'string' && instructions.length > 0
          ? instructions
          : questionId,
        criteria
      }
    }
  };
}

/**
 * Normalize a parsed System-One response body into the Jev candidate shape.
 * Returns { ok: true, candidate } or a typed failure. Mirrors
 * normalizeDecisionsResponse so equivalent payloads yield deep-equal
 * candidates (transport-parity DoD, OD-19).
 */
export function normalizeSystemOneResponse(payload, questionId) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'systemone endpoint returned a non-object body');
  }
  const resolvedModel = payload.model;
  if (typeof resolvedModel !== 'string' || resolvedModel === '' || resolvedModel === '*') {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'systemone response is missing a concrete resolved model');
  }
  const answers = payload.answers;
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'systemone response is missing the answers object');
  }
  const answer = answers[questionId];
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', `systemone response is missing the answer for "${questionId}"`);
  }
  if (answer.type !== 'choice' || typeof answer.choice !== 'string' || answer.choice === '') {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', `answer for "${questionId}" is not a typed choice`);
  }
  const probabilities = (answer.probabilities !== null && typeof answer.probabilities === 'object'
    && !Array.isArray(answer.probabilities))
    ? answer.probabilities
    : null;
  const usage = (payload.usage !== null && typeof payload.usage === 'object' && !Array.isArray(payload.usage))
    ? payload.usage
    : null;
  return {
    ok: true,
    candidate: {
      answer: answer.choice,
      confidence: typeof answer.confidence === 'number' ? answer.confidence : null,
      resolved_model: resolvedModel,
      ...(probabilities !== null ? { probabilities } : {}),
      ...(usage !== null ? { usage } : {})
    }
  };
}

/**
 * Map a System-One HTTP response status/body to a typed outcome.
 * Never includes response bodies in failures (no secret reflection).
 */
export function mapSystemOneStatus(status, parseError) {
  if (parseError) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'systemone endpoint returned a non-JSON body');
  }
  if (status === 401) {
    return failure('BLOCKED', 'JEV_UNAUTHORIZED', 'systemone endpoint rejected the Zen credential');
  }
  if (status === 402) {
    return failure('BLOCKED', 'JEV_PAYMENT_REQUIRED', 'systemone endpoint requires payment');
  }
  if (status === 429) {
    return failure('ESCALATE', 'JEV_RATE_LIMITED', 'systemone endpoint rate limited the request');
  }
  if (status >= 500) {
    return failure('ESCALATE', 'JEV_UNAVAILABLE', `systemone endpoint unavailable (status ${status})`);
  }
  return failure('BLOCKED', 'JEV_BAD_RESPONSE', `systemone endpoint rejected the request (status ${status})`);
}

/**
 * ZenSystemOneClient: submit one typed choice question to the Zen System-One
 * endpoint and return the normalized Jev candidate.
 *
 * @param {object} options
 * @param {Object} options.env              - environment source; must contain OPENCODE_API_KEY
 * @param {Function} options.fetchImpl      - injectable fetch for tests
 * @param {string} options.requestedModel   - Jev model id (e.g. 'jev-1.13' or 'jev-1.13-free')
 * @param {string} [options.baseUrl]        - endpoint URL (default the Zen systemone endpoint)
 * @param {number} [options.timeoutMs]      - request timeout (default 10000)
 * @returns {object} frozen client with async ask({ question, choices, state })
 */
export function createZenSystemOneClient({
  env = process.env,
  fetchImpl,
  requestedModel,
  baseUrl = ZEN_SYSTEMONE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof requestedModel !== 'string' || requestedModel === '') {
    throw new Error('createZenSystemOneClient requires a requestedModel');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('createZenSystemOneClient requires a fetchImpl');
  }

  return Object.freeze({
    mode: 'zen',
    async ask({ question, choices, state } = {}) {
      const apiKey = env ? env.OPENCODE_API_KEY : undefined;
      if (typeof apiKey !== 'string' || apiKey === '') {
        return failure('BLOCKED', 'JEV_API_KEY_MISSING', 'zen systemone requires env.OPENCODE_API_KEY');
      }

      // Outbound guard BEFORE fetch: allowlisted host, https strictly.
      const parsedUrl = assertOutboundUrlAllowed(baseUrl, ZEN_SYSTEMONE_HOSTS);
      if (parsedUrl.protocol !== 'https:') {
        return failure('BLOCKED', 'URL_PROTOCOL_FORBIDDEN', `systemone calls must use https, got ${parsedUrl.protocol}`);
      }

      const body = buildSystemOneRequestBody({
        model: requestedModel,
        questionId: question.question_id,
        instructions: question.description,
        choices,
        state
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(baseUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return failure('ESCALATE', 'JEV_TIMEOUT', `systemone request timed out after ${timeoutMs}ms`);
        }
        return failure('ESCALATE', 'JEV_UNAVAILABLE', 'systemone endpoint is unreachable');
      } finally {
        clearTimeout(timer);
      }

      if (typeof response.status !== 'number') {
        return failure('ESCALATE', 'JEV_UNAVAILABLE', 'systemone endpoint returned no status');
      }
      if (response.status < 200 || response.status >= 300) {
        return mapSystemOneStatus(response.status, false);
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        return mapSystemOneStatus(response.status, true);
      }
      return normalizeSystemOneResponse(payload, question.question_id);
    }
  });
}
