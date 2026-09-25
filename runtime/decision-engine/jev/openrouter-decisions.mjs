// OpenRouter Decisions transport for Jev (MAWS-VN-203 activation lane).
//
// Canonical Jev live path: MAWS -> OpenRouter -> Decisions API -> TypeSafe Jev.
// The OpenRouter Decisions API is a separate decision-model surface; Jev is
// NOT called through chat/completions and never silently substituted.
//
// Contract verified 2026-09-25 against the live-documented OpenRouter
// tutorial and SDK references (docs/guides/community/jev-tutorial.md):
//
//   POST https://openrouter.ai/api/alpha/decisions
//   Authorization: Bearer $OPENROUTER_API_KEY
//   request:  { model, state,
//               questions: { [id]: { type: "choice", instructions,
//                                     criteria: { [option]: meaning } } } }
//   response: { id, model: "<dated snapshot>", provider, answers: {
//               [id]: { type: "choice", choice, confidence, probabilities } },
//               usage: { input_tokens, output_tokens, cost } }
//
// The response `model` field names the dated snapshot that served the
// request (e.g. "typesafe/jev-1.13-20260917"), so requested alias vs
// resolved snapshot is recorded and drift-classified upstream
// (model-resolution.mjs; a changed snapshot is MATERIAL until requalified).
//
// Fail-closed: no endpoint fallback, no model fallback, no chat/completions
// substitution, secrets never reflected in errors or results. Decision
// models are not listed in the public /api/v1/models catalogue (verified
// 2026-09-25); availability is surfaced by this API's own error mapping.
import { assertOutboundUrlAllowed } from '../../vnext/util.mjs';

export const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
export const OPENROUTER_DECISIONS_HOSTS = ['openrouter.ai'];
const DEFAULT_TIMEOUT_MS = 10000;

function failure(disposition, errorClass, message, extras = {}) {
  return { ok: false, disposition, error_class: errorClass, message, ...extras };
}

/**
 * Build the Decisions API request body for one typed choice question.
 * The criteria map is derived from the closed choice space; the meaning of
 * each option is the option id itself (the typed semantic IS the id space).
 */
export function buildDecisionsRequestBody({ model, questionId, instructions, choices, state }) {
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
 * Normalize a parsed Decisions API response body into the Jev candidate
 * shape. Returns { ok: true, candidate } or a typed failure.
 */
export function normalizeDecisionsResponse(payload, questionId) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'decisions endpoint returned a non-object body');
  }
  const resolvedModel = payload.model;
  if (typeof resolvedModel !== 'string' || resolvedModel === '' || resolvedModel === '*') {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'decisions response is missing a concrete resolved model');
  }
  const answers = payload.answers;
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'decisions response is missing the answers object');
  }
  const answer = answers[questionId];
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', `decisions response is missing the answer for "${questionId}"`);
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
 * Map a Decisions API HTTP response status/body to a typed outcome.
 * Never includes response bodies in failures (no secret reflection).
 */
export function mapDecisionsStatus(status, parseError) {
  if (parseError) {
    return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'decisions endpoint returned a non-JSON body');
  }
  if (status === 401) {
    return failure('BLOCKED', 'JEV_UNAUTHORIZED', 'decisions endpoint rejected the OpenRouter credential');
  }
  if (status === 402) {
    return failure('BLOCKED', 'JEV_PAYMENT_REQUIRED', 'decisions endpoint requires payment (OpenRouter credit)');
  }
  if (status === 429) {
    return failure('ESCALATE', 'JEV_RATE_LIMITED', 'decisions endpoint rate limited the request');
  }
  if (status >= 500) {
    return failure('ESCALATE', 'JEV_UNAVAILABLE', `decisions endpoint unavailable (status ${status})`);
  }
  return failure('BLOCKED', 'JEV_BAD_RESPONSE', `decisions endpoint rejected the request (status ${status})`);
}

/**
 * OpenRouterDecisionClient: submit one typed choice question to the
 * Decisions API and return the normalized Jev candidate.
 *
 * @param {object} options
 * @param {Object} options.env              - environment source; must contain OPENROUTER_API_KEY
 * @param {Function} options.fetchImpl      - injectable fetch for tests
 * @param {string} options.requestedModel   - Jev model id or alias (e.g. '~typesafe/jev-latest')
 * @param {string} [options.baseUrl]        - endpoint URL (default the alpha decisions endpoint)
 * @param {number} [options.timeoutMs]      - request timeout (default 10000)
 * @returns {Function} async ask({ question, choices, state }) -> { ok, candidate|failure fields }
 */
export function createOpenRouterDecisionClient({
  env = process.env,
  fetchImpl,
  requestedModel,
  baseUrl = OPENROUTER_DECISIONS_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof requestedModel !== 'string' || requestedModel === '') {
    throw new Error('createOpenRouterDecisionClient requires a requestedModel');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('createOpenRouterDecisionClient requires a fetchImpl');
  }

  return Object.freeze({
    mode: 'openrouter',
    async ask({ question, choices, state } = {}) {
      const apiKey = env ? env.OPENROUTER_API_KEY : undefined;
      if (typeof apiKey !== 'string' || apiKey === '') {
        return failure('BLOCKED', 'JEV_API_KEY_MISSING', 'openrouter decisions require env.OPENROUTER_API_KEY');
      }

      // Outbound guard BEFORE fetch: allowlisted host, https strictly.
      const parsedUrl = assertOutboundUrlAllowed(baseUrl, OPENROUTER_DECISIONS_HOSTS);
      if (parsedUrl.protocol !== 'https:') {
        return failure('BLOCKED', 'URL_PROTOCOL_FORBIDDEN', `decisions calls must use https, got ${parsedUrl.protocol}`);
      }

      const body = buildDecisionsRequestBody({
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
          return failure('ESCALATE', 'JEV_TIMEOUT', `decisions request timed out after ${timeoutMs}ms`);
        }
        return failure('ESCALATE', 'JEV_UNAVAILABLE', 'decisions endpoint is unreachable');
      } finally {
        clearTimeout(timer);
      }

      if (typeof response.status !== 'number') {
        return failure('ESCALATE', 'JEV_UNAVAILABLE', 'decisions endpoint returned no status');
      }
      if (response.status < 200 || response.status >= 300) {
        return mapDecisionsStatus(response.status, false);
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        return mapDecisionsStatus(response.status, true);
      }
      return normalizeDecisionsResponse(payload, question.question_id);
    }
  });
}
