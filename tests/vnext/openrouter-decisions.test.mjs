// OpenRouter Decisions API transport tests (Jev live lane).
//
// The contract fixtures mirror the live-documented OpenRouter Decisions
// response (docs/guides/community/jev-tutorial.md, captured 2026-09-25).
// No network: fetch is always injected.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDecisionsRequestBody,
  createOpenRouterDecisionClient,
  mapDecisionsStatus,
  normalizeDecisionsResponse,
  OPENROUTER_DECISIONS_URL
} from '../../runtime/decision-engine/jev/openrouter-decisions.mjs';
import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';
import { loadThresholdPolicy } from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import { buildPreferredExecutorQuestion } from '../../runtime/decision-engine/jev/questions/registry.mjs';
import { FailClosedError } from '../../runtime/vnext/util.mjs';

const SYNTHETIC_OR_KEY = 'synthetic-openrouter-key-material';
const PATH_ROOT = new URL('../../', import.meta.url).pathname;

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    }
  };
}

function liveTutorialResponse() {
  // Live-captured shape from the OpenRouter Jev tutorial.
  return {
    id: 'gen-dec-1790015143-AIaTutprXsJ5EwohRSjb',
    model: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    answers: {
      preferred_executor: {
        type: 'choice',
        choice: 'exec_openrouter_glm',
        confidence: 0.93,
        probabilities: { exec_openrouter_glm: 0.94, exec_codex_chatgpt: 0.06 }
      }
    },
    usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 }
  };
}

function question() {
  return buildPreferredExecutorQuestion(['exec_openrouter_glm', 'exec_codex_chatgpt']);
}

test('buildDecisionsRequestBody maps the typed question onto the verified API shape', () => {
  const body = buildDecisionsRequestBody({
    model: '~typesafe/jev-latest',
    questionId: 'preferred_executor',
    instructions: 'Class of work a WorkUnit represents for planning and routing.',
    choices: ['exec_openrouter_glm', 'exec_codex_chatgpt'],
    state: { activation_probe: true }
  });
  assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
  assert.equal(body.model, '~typesafe/jev-latest');
  const q = body.questions.preferred_executor;
  assert.equal(q.type, 'choice');
  assert.equal(typeof q.instructions, 'string');
  assert.deepEqual(q.criteria, {
    exec_openrouter_glm: 'exec_openrouter_glm',
    exec_codex_chatgpt: 'exec_codex_chatgpt'
  });
});

test('normalizeDecisionsResponse accepts the live-captured response and rejects damaged shapes', () => {
  const ok = normalizeDecisionsResponse(liveTutorialResponse(), 'preferred_executor');
  assert.equal(ok.ok, true);
  assert.equal(ok.candidate.answer, 'exec_openrouter_glm');
  assert.equal(ok.candidate.confidence, 0.93);
  assert.equal(ok.candidate.resolved_model, 'typesafe/jev-1.13-20260917');
  assert.deepEqual(ok.candidate.probabilities, { exec_openrouter_glm: 0.94, exec_codex_chatgpt: 0.06 });
  assert.equal(ok.candidate.usage.cost, 0.000019992);

  assert.equal(normalizeDecisionsResponse({}, 'preferred_executor').error_class, 'JEV_BAD_RESPONSE');
  assert.equal(normalizeDecisionsResponse({ model: 'x' }, 'preferred_executor').error_class, 'JEV_BAD_RESPONSE');
  const wrongType = { model: 'x', answers: { preferred_executor: { type: 'noul', noul: 0.9 } } };
  assert.equal(normalizeDecisionsResponse(wrongType, 'preferred_executor').error_class, 'JEV_BAD_RESPONSE');
});

test('mapDecisionsStatus covers 401/402/429/5xx/other with typed dispositions', () => {
  assert.deepEqual(mapDecisionsStatus(401, false), { ok: false, disposition: 'BLOCKED', error_class: 'JEV_UNAUTHORIZED', message: mapDecisionsStatus(401, false).message });
  assert.equal(mapDecisionsStatus(402, false).error_class, 'JEV_PAYMENT_REQUIRED');
  assert.equal(mapDecisionsStatus(429, false).disposition, 'ESCALATE');
  assert.equal(mapDecisionsStatus(429, false).error_class, 'JEV_RATE_LIMITED');
  assert.equal(mapDecisionsStatus(503, false).error_class, 'JEV_UNAVAILABLE');
  assert.equal(mapDecisionsStatus(400, false).error_class, 'JEV_BAD_RESPONSE');
  assert.equal(mapDecisionsStatus(200, true).error_class, 'JEV_BAD_RESPONSE');
});

test('decision client: missing key fails closed before any fetch', async () => {
  let calls = 0;
  const client = createOpenRouterDecisionClient({
    env: {},
    fetchImpl: async () => { calls += 1; return jsonResponse(200, liveTutorialResponse()); },
    requestedModel: '~typesafe/jev-latest'
  });
  const result = await client.ask({ question: question(), choices: ['exec_openrouter_glm', 'exec_codex_chatgpt'], state: {} });
  assert.equal(result.ok, false);
  assert.equal(result.error_class, 'JEV_API_KEY_MISSING');
  assert.equal(calls, 0);
});

test('decision client: success path sends the verified request and never reflects the key', async () => {
  let capturedUrl = null;
  let capturedInit = null;
  const client = createOpenRouterDecisionClient({
    env: { OPENROUTER_API_KEY: SYNTHETIC_OR_KEY },
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(200, liveTutorialResponse());
    },
    requestedModel: '~typesafe/jev-latest'
  });
  const result = await client.ask({ question: question(), choices: question().answer_space.values, state: { probe: true } });
  assert.equal(result.ok, true);
  assert.equal(capturedUrl, OPENROUTER_DECISIONS_URL);
  assert.equal(capturedInit.headers.authorization, `Bearer ${SYNTHETIC_OR_KEY}`);
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.model, '~typesafe/jev-latest');
  assert.equal(body.questions.preferred_executor.type, 'choice');
  assert.ok(!JSON.stringify(result).includes(SYNTHETIC_OR_KEY));
});

test('decision client: non-allowlisted endpoint fails closed before fetch', async () => {
  let calls = 0;
  const client = createOpenRouterDecisionClient({
    env: { OPENROUTER_API_KEY: SYNTHETIC_OR_KEY },
    fetchImpl: async () => { calls += 1; return jsonResponse(200, {}); },
    requestedModel: '~typesafe/jev-latest',
    baseUrl: 'https://evil.example.com/api/alpha/decisions'
  });
  await assert.rejects(
    client.ask({ question: question(), choices: ['a'], state: {} }),
    (error) => error instanceof FailClosedError && error.code === 'URL_HOST_NOT_ALLOWLISTED'
  );
  assert.equal(calls, 0);
});

test('jev client openrouter mode: full ask() returns receipt + threshold and enforces the answer space', async () => {
  const thresholdPolicy = await loadThresholdPolicy(`${PATH_ROOT}policies/decision-thresholds.yaml`);
  const jev = createJevClient({
    mode: 'openrouter',
    thresholdPolicy,
    requestedModel: '~typesafe/jev-latest',
    env: { OPENROUTER_API_KEY: SYNTHETIC_OR_KEY },
    fetchImpl: async () => jsonResponse(200, liveTutorialResponse())
  });
  const q = question();
  const result = await jev.ask({ question: q, choices: q.answer_space.values, state: { activation_probe: true } });

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'exec_openrouter_glm');
  assert.equal(result.resolved_model, 'typesafe/jev-1.13-20260917');
  assert.equal(result.receipt.requested_model, '~typesafe/jev-latest');
  assert.equal(result.receipt.resolved_model, 'typesafe/jev-1.13-20260917');
  assert.equal(typeof result.receipt.receipt_id, 'string');
  assert.equal(result.threshold.action, 'PROCEED');
  assert.ok(!JSON.stringify(result).includes(SYNTHETIC_OR_KEY));
});

test('jev client openrouter mode: answer outside the offered choices is blocked, never coerced', async () => {
  const thresholdPolicy = await loadThresholdPolicy(`${PATH_ROOT}policies/decision-thresholds.yaml`);
  const hostile = liveTutorialResponse();
  hostile.answers.preferred_executor.choice = 'exec_invented_by_jev';
  const jev = createJevClient({
    mode: 'openrouter',
    thresholdPolicy,
    requestedModel: '~typesafe/jev-latest',
    env: { OPENROUTER_API_KEY: SYNTHETIC_OR_KEY },
    fetchImpl: async () => jsonResponse(200, hostile)
  });
  const q = question();
  const result = await jev.ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'BLOCKED');
  assert.equal(result.error_class, 'ANSWER_OUTSIDE_ALLOWED_SPACE');
});

test('jev client openrouter mode: 401/429/shape failures map to typed error classes', async () => {
  const thresholdPolicy = await loadThresholdPolicy(`${PATH_ROOT}policies/decision-thresholds.yaml`);
  const mk = (handler) => createJevClient({
    mode: 'openrouter',
    thresholdPolicy,
    requestedModel: '~typesafe/jev-latest',
    env: { OPENROUTER_API_KEY: SYNTHETIC_OR_KEY },
    fetchImpl: handler
  });
  const q = question();
  const unauthorized = await mk(async () => jsonResponse(401, {})).ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(unauthorized.error_class, 'JEV_UNAUTHORIZED');

  const rateLimited = await mk(async () => jsonResponse(429, {})).ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(rateLimited.error_class, 'JEV_RATE_LIMITED');
  assert.equal(rateLimited.disposition, 'ESCALATE');

  const badShape = await mk(async () => jsonResponse(200, { model: 'x' })).ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(badShape.error_class, 'JEV_BAD_RESPONSE');

  const missingKey = await createJevClient({
    mode: 'openrouter',
    thresholdPolicy,
    requestedModel: '~typesafe/jev-latest',
    env: {},
    fetchImpl: async () => jsonResponse(200, liveTutorialResponse())
  }).ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(missingKey.error_class, 'JEV_API_KEY_MISSING');
});
