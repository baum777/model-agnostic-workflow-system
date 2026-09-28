// OpenCode Zen System-One transport tests (second Jev live lane, OD-19).
//
// Contract parity with the OpenRouter Decisions lane is the DoD: the same
// canonical question must produce indistinguishable DecisionReceipts through
// either transport, except for provenance. No network: fetch is always
// injected. The Zen response shape mirrors the verified OpenRouter Decisions
// shape until the exact Zen response fields are confirmed at first live
// activation (opencode.ai/docs/zen captured 2026-09-28 documents the request
// schema, not the response fields).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSystemOneRequestBody,
  createZenSystemOneClient,
  mapSystemOneStatus,
  normalizeSystemOneResponse,
  ZEN_SYSTEMONE_HOSTS,
  ZEN_SYSTEMONE_URL
} from '../../runtime/decision-engine/jev/zen-systemone.mjs';
import { buildDecisionsRequestBody, normalizeDecisionsResponse } from '../../runtime/decision-engine/jev/openrouter-decisions.mjs';
import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';
import { loadThresholdPolicy } from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import { validateReceiptShape } from '../../runtime/decision-engine/jev/decision-receipt.mjs';
import { getQuestion } from '../../runtime/decision-engine/jev/questions/registry.mjs';
import { FailClosedError } from '../../runtime/vnext/util.mjs';

const SYNTHETIC_ZEN_KEY = 'synthetic-zen-key-material';
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

function workClassQuestion() {
  return getQuestion('work_class');
}

function zenResponse() {
  // Synthetic response in the verified System-One answer shape.
  return {
    id: 'zen-sysone-20260928-synthetic',
    model: 'jev-1.13-20260917',
    provider: 'TypeSafe',
    answers: {
      work_class: {
        type: 'choice',
        choice: 'verification',
        confidence: 0.81,
        probabilities: { analysis: 0.05, implementation: 0.06, verification: 0.81, decision: 0.08 }
      }
    },
    usage: { input_tokens: 312, output_tokens: 41 }
  };
}

test('buildSystemOneRequestBody produces the documented Zen request shape, identical to the OpenRouter builder', () => {
  const input = {
    model: 'jev-1.13',
    questionId: 'work_class',
    instructions: 'Class of work a WorkUnit represents for planning and routing.',
    choices: ['analysis', 'implementation', 'verification', 'decision'],
    state: { activation_probe: true }
  };
  const zenBody = buildSystemOneRequestBody(input);
  assert.deepEqual(Object.keys(zenBody).sort(), ['model', 'questions', 'state']);
  assert.equal(zenBody.model, 'jev-1.13');
  const q = zenBody.questions.work_class;
  assert.equal(q.type, 'choice');
  assert.equal(typeof q.instructions, 'string');
  assert.deepEqual(q.criteria, {
    analysis: 'analysis',
    implementation: 'implementation',
    verification: 'verification',
    decision: 'decision'
  });
  // Transport-parity: the two provider adapters serialize the same canonical
  // question onto the same wire shape.
  assert.deepEqual(zenBody, buildDecisionsRequestBody(input));
});

test('normalizeSystemOneResponse accepts the System-One shape and rejects damaged shapes', () => {
  const ok = normalizeSystemOneResponse(zenResponse(), 'work_class');
  assert.equal(ok.ok, true);
  assert.equal(ok.candidate.answer, 'verification');
  assert.equal(ok.candidate.confidence, 0.81);
  assert.equal(ok.candidate.resolved_model, 'jev-1.13-20260917');
  assert.deepEqual(ok.candidate.probabilities, { analysis: 0.05, implementation: 0.06, verification: 0.81, decision: 0.08 });
  assert.equal(ok.candidate.usage.input_tokens, 312);

  assert.equal(normalizeSystemOneResponse({}, 'work_class').error_class, 'JEV_BAD_RESPONSE');
  assert.equal(normalizeSystemOneResponse({ model: 'x' }, 'work_class').error_class, 'JEV_BAD_RESPONSE');
  assert.equal(normalizeSystemOneResponse({ model: '*' }, 'work_class').error_class, 'JEV_BAD_RESPONSE');
  const wrongType = { model: 'jev-1.13-20260917', answers: { work_class: { type: 'noul', noul: 0.9 } } };
  assert.equal(normalizeSystemOneResponse(wrongType, 'work_class').error_class, 'JEV_BAD_RESPONSE');
});

test('transport parity: equivalent payloads normalize to deep-equal candidates on both transports', () => {
  const zen = normalizeSystemOneResponse(zenResponse(), 'work_class');
  const openRouterPayload = zenResponse();
  openRouterPayload.model = 'typesafe/jev-1.13-20260917';
  const or = normalizeDecisionsResponse(openRouterPayload, 'work_class');
  // Same decision content; only the resolved snapshot string differs because
  // the two providers name their snapshots differently.
  delete zen.candidate.resolved_model;
  delete or.candidate.resolved_model;
  assert.deepEqual(zen.candidate, or.candidate);
});

test('mapSystemOneStatus covers 401/402/429/5xx/other with typed dispositions', () => {
  assert.equal(mapSystemOneStatus(401, false).error_class, 'JEV_UNAUTHORIZED');
  assert.equal(mapSystemOneStatus(401, false).disposition, 'BLOCKED');
  assert.equal(mapSystemOneStatus(402, false).error_class, 'JEV_PAYMENT_REQUIRED');
  assert.equal(mapSystemOneStatus(429, false).disposition, 'ESCALATE');
  assert.equal(mapSystemOneStatus(429, false).error_class, 'JEV_RATE_LIMITED');
  assert.equal(mapSystemOneStatus(503, false).error_class, 'JEV_UNAVAILABLE');
  assert.equal(mapSystemOneStatus(400, false).error_class, 'JEV_BAD_RESPONSE');
  assert.equal(mapSystemOneStatus(200, true).error_class, 'JEV_BAD_RESPONSE');
});

test('zen transport: missing key fails closed before any fetch', async () => {
  let calls = 0;
  const client = createZenSystemOneClient({
    env: {},
    fetchImpl: async () => { calls += 1; return jsonResponse(200, zenResponse()); },
    requestedModel: 'jev-1.13'
  });
  const result = await client.ask({ question: workClassQuestion(), choices: workClassQuestion().answer_space.values, state: {} });
  assert.equal(result.ok, false);
  assert.equal(result.error_class, 'JEV_API_KEY_MISSING');
  assert.equal(calls, 0);
});

test('zen transport: success path sends the documented request to the allowlisted endpoint and never reflects the key', async () => {
  let capturedUrl = null;
  let capturedInit = null;
  const client = createZenSystemOneClient({
    env: { OPENCODE_API_KEY: SYNTHETIC_ZEN_KEY },
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(200, zenResponse());
    },
    requestedModel: 'jev-1.13'
  });
  const q = workClassQuestion();
  const result = await client.ask({ question: q, choices: q.answer_space.values, state: { probe: true } });
  assert.equal(result.ok, true);
  assert.equal(capturedUrl, ZEN_SYSTEMONE_URL);
  assert.equal(capturedInit.headers.authorization, `Bearer ${SYNTHETIC_ZEN_KEY}`);
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.model, 'jev-1.13');
  assert.equal(body.questions.work_class.type, 'choice');
  assert.ok(!JSON.stringify(result).includes(SYNTHETIC_ZEN_KEY));
});

test('zen transport: non-allowlisted endpoint fails closed before fetch', async () => {
  let calls = 0;
  const client = createZenSystemOneClient({
    env: { OPENCODE_API_KEY: SYNTHETIC_ZEN_KEY },
    fetchImpl: async () => { calls += 1; return jsonResponse(200, {}); },
    requestedModel: 'jev-1.13',
    baseUrl: 'https://evil.example.com/zen/v1/systemone'
  });
  await assert.rejects(
    client.ask({ question: workClassQuestion(), choices: ['analysis'], state: {} }),
    (error) => error instanceof FailClosedError && error.code === 'URL_HOST_NOT_ALLOWLISTED'
  );
  assert.equal(calls, 0);
});

test('jev client zen mode: full ask() returns receipt + threshold and enforces the answer space', async () => {
  const thresholdPolicy = await loadThresholdPolicy(`${PATH_ROOT}policies/decision-thresholds.yaml`);
  const jev = createJevClient({
    mode: 'zen',
    thresholdPolicy,
    requestedModel: 'jev-1.13',
    env: { OPENCODE_API_KEY: SYNTHETIC_ZEN_KEY },
    fetchImpl: async () => jsonResponse(200, zenResponse())
  });
  const q = workClassQuestion();
  const result = await jev.ask({ question: q, choices: q.answer_space.values, state: { activation_probe: true } });

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'verification');
  assert.equal(result.resolved_model, 'jev-1.13-20260917');
  assert.equal(result.receipt.mode, 'zen');
  assert.equal(result.receipt.requested_model, 'jev-1.13');
  assert.equal(typeof result.receipt.receipt_id, 'string');
  assert.deepEqual(validateReceiptShape(result.receipt), []);
  assert.equal(result.threshold.action, 'PROCEED');
  assert.ok(!JSON.stringify(result).includes(SYNTHETIC_ZEN_KEY));
});

test('transport parity (DoD): receipts from either transport are indistinguishable except provenance', async () => {
  const thresholdPolicy = await loadThresholdPolicy(`${PATH_ROOT}policies/decision-thresholds.yaml`);
  const q = workClassQuestion();

  const orResult = await createJevClient({
    mode: 'openrouter',
    thresholdPolicy,
    requestedModel: 'jev-1.13-20260917',
    env: { OPENROUTER_API_KEY: 'synthetic-openrouter-key-material' },
    fetchImpl: async () => jsonResponse(200, zenResponse())
  }).ask({ question: q, choices: q.answer_space.values, state: { activation_probe: true } });

  const zenResult = await createJevClient({
    mode: 'zen',
    thresholdPolicy,
    requestedModel: 'jev-1.13-20260917',
    env: { OPENCODE_API_KEY: SYNTHETIC_ZEN_KEY },
    fetchImpl: async () => jsonResponse(200, zenResponse())
  }).ask({ question: q, choices: q.answer_space.values, state: { activation_probe: true } });

  assert.equal(orResult.ok, true);
  assert.equal(zenResult.ok, true);

  const provenance = new Set(['receipt_id', 'created_at', 'mode']);
  const strip = (receipt) => Object.fromEntries(
    Object.entries(receipt).filter(([key]) => !provenance.has(key))
  );
  assert.deepEqual(strip(zenResult.receipt), strip(orResult.receipt));
  assert.equal(orResult.receipt.mode, 'openrouter');
  assert.equal(zenResult.receipt.mode, 'zen');
  assert.deepEqual(zenResult.threshold, orResult.threshold);
});

test('jev client zen mode: answer outside the offered choices is blocked, never coerced', async () => {
  const thresholdPolicy = await loadThresholdPolicy(`${PATH_ROOT}policies/decision-thresholds.yaml`);
  const hostile = zenResponse();
  hostile.answers.work_class.choice = 'invented_by_jev';
  const jev = createJevClient({
    mode: 'zen',
    thresholdPolicy,
    requestedModel: 'jev-1.13',
    env: { OPENCODE_API_KEY: SYNTHETIC_ZEN_KEY },
    fetchImpl: async () => jsonResponse(200, hostile)
  });
  const q = workClassQuestion();
  const result = await jev.ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'BLOCKED');
  assert.equal(result.error_class, 'ANSWER_OUTSIDE_ALLOWED_SPACE');
});

test('jev client zen mode: 401/429/shape failures map to typed error classes; choices cannot widen the space', async () => {
  const thresholdPolicy = await loadThresholdPolicy(`${PATH_ROOT}policies/decision-thresholds.yaml`);
  const mk = (handler) => createJevClient({
    mode: 'zen',
    thresholdPolicy,
    requestedModel: 'jev-1.13',
    env: { OPENCODE_API_KEY: SYNTHETIC_ZEN_KEY },
    fetchImpl: handler
  });
  const q = workClassQuestion();
  const unauthorized = await mk(async () => jsonResponse(401, {})).ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(unauthorized.error_class, 'JEV_UNAUTHORIZED');

  const rateLimited = await mk(async () => jsonResponse(429, {})).ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(rateLimited.error_class, 'JEV_RATE_LIMITED');
  assert.equal(rateLimited.disposition, 'ESCALATE');

  const badShape = await mk(async () => jsonResponse(200, { model: 'x' })).ask({ question: q, choices: q.answer_space.values, state: {} });
  assert.equal(badShape.error_class, 'JEV_BAD_RESPONSE');

  const widened = await createJevClient({
    mode: 'zen',
    thresholdPolicy,
    requestedModel: 'jev-1.13',
    env: { OPENCODE_API_KEY: SYNTHETIC_ZEN_KEY },
    fetchImpl: async () => jsonResponse(200, zenResponse())
  }).ask({ question: q, choices: ['analysis', 'invented_choice'], state: {} });
  assert.equal(widened.ok, false);
  assert.equal(widened.error_class, 'ANSWER_OUTSIDE_ALLOWED_SPACE');

  assert.deepEqual(ZEN_SYSTEMONE_HOSTS, ['opencode.ai']);
});
