// TypeSafe Jev typed decision client (MAWS-VN-203, OD-18).
//
// Canonical separation: MAWS deterministic gates define the allowed state
// space, Jev answers a typed question inside that space, MAWS enforces
// policy/authority/qualification/thresholds deterministically afterwards.
//
// Fail-closed posture:
//   - answers outside the allowed space -> BLOCKED / ANSWER_OUTSIDE_ALLOWED_SPACE;
//   - choices that widen a question's declared answer space -> BLOCKED;
//   - missing/invalid resolved_model -> JEV_BAD_RESPONSE;
//   - oversized state (canonical JSON > 32768 chars) -> BLOCKED / STATE_OVERSIZED;
//   - live egress only to explicitly allowlisted hosts over https, guarded
//     BEFORE any fetch via assertOutboundUrlAllowed;
//   - no fallback to another generative model on any failure path, ever;
//   - the API key is kept in a closure and never appears in any returned
//     object, receipt, message, or error.
//
// Modes: 'fixture' loads runtime/decision-engine/jev/fixtures/<caseId>.json;
// 'live' POSTs to `${baseUrl}/v1/decisions`. NOTE: the exact live endpoint
// shape (request/response fields, status semantics) is confirmed at the
// first live activation; until then live mode stays behind fixture-mode
// verification and no fallback endpoint or model is invented.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertOutboundUrlAllowed, canonicalJson, FailClosedError, nowIso } from '../../vnext/util.mjs';
import { assertThresholdPolicyShape, evaluateThreshold } from './threshold-policy.mjs';
import { buildDecisionReceipt } from './decision-receipt.mjs';
import { assertAnswerInSpace } from './questions/registry.mjs';

const DEFAULT_FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_REQUESTED_MODEL = 'jev-latest';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_ALLOWLIST_HOSTS = ['api.typesafe.ai'];
const DEFAULT_DECISION_CONTRACT_VERSION = 'jev.decision.v1';
const STATE_MAX_JSON_CHARS = 32768;
const CASE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function failure(disposition, errorClass, message) {
  return Object.freeze({ ok: false, disposition, error_class: errorClass, message });
}

function validateAskInput(question, choices) {
  const invalid = (detail) => new FailClosedError('ASK_CONFIG_INVALID', `ask() rejected: ${detail}`);
  if (!question || typeof question !== 'object') throw invalid('question must be an object');
  if (typeof question.question_id !== 'string' || question.question_id === '') {
    throw invalid('question.question_id must be a non-empty string');
  }
  if (question.answer_space !== undefined) {
    const space = question.answer_space;
    if (
      !space || typeof space !== 'object' ||
      space.type !== 'enum' ||
      !Array.isArray(space.values) || space.values.length === 0 ||
      space.values.some((value) => typeof value !== 'string' || value === '')
    ) {
      throw invalid('question.answer_space must be an enum space with non-empty string values');
    }
  }
  if (!Array.isArray(choices) || choices.length === 0 || choices.some((choice) => typeof choice !== 'string' || choice === '')) {
    throw invalid('choices must be a non-empty array of non-empty strings');
  }
  if (new Set(choices).size !== choices.length) {
    throw invalid('choices must not contain duplicates');
  }
}

export function createJevClient(options = {}) {
  const invalid = (detail) => new FailClosedError('CLIENT_CONFIG_INVALID', `jev client rejected: ${detail}`);
  if (!options || typeof options !== 'object') throw invalid('options must be an object');

  const mode = options.mode;
  if (mode !== 'fixture' && mode !== 'live') throw invalid('mode must be "fixture" or "live"');

  const requestedModel = options.requestedModel ?? DEFAULT_REQUESTED_MODEL;
  if (typeof requestedModel !== 'string' || requestedModel === '') throw invalid('requestedModel must be a non-empty string');

  const decisionContractVersion = options.decisionContractVersion ?? DEFAULT_DECISION_CONTRACT_VERSION;
  if (typeof decisionContractVersion !== 'string' || decisionContractVersion === '') throw invalid('decisionContractVersion must be a non-empty string');

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw invalid('timeoutMs must be a positive integer');

  const allowlistHosts = options.allowlistHosts ?? DEFAULT_ALLOWLIST_HOSTS;
  if (
    !Array.isArray(allowlistHosts) || allowlistHosts.length === 0 ||
    allowlistHosts.some((host) => typeof host !== 'string' || host === '') ||
    new Set(allowlistHosts).size !== allowlistHosts.length
  ) {
    throw invalid('allowlistHosts must be a non-empty array of unique non-empty host strings');
  }

  const thresholdPolicy = options.thresholdPolicy;
  if (thresholdPolicy === undefined) throw invalid('thresholdPolicy is required (Jev decisions are never actionable without a deterministic threshold)');
  assertThresholdPolicyShape(thresholdPolicy);

  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  if (typeof baseUrl !== 'string' || baseUrl === '') throw invalid('baseUrl must be a non-empty string');

  const fixtureDir = options.fixtureDir ?? DEFAULT_FIXTURE_DIR;
  if (typeof fixtureDir !== 'string' || fixtureDir === '') throw invalid('fixtureDir must be a non-empty string');

  // Secrets and transport stay closure-private: they are never exposed on the
  // returned client object or in any ask() result.
  const env = options.env ?? process.env;
  const effectiveFetch = typeof options.fetchImpl === 'function' ? options.fetchImpl
    : (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);

  async function askFixture(caseId) {
    if (typeof caseId !== 'string' || !CASE_ID_PATTERN.test(caseId)) {
      throw new FailClosedError('FIXTURE_CASE_INVALID', `caseId must match ${CASE_ID_PATTERN}`);
    }
    const fixturePath = path.join(fixtureDir, `${caseId}.json`);
    let text;
    try {
      text = await fs.promises.readFile(fixturePath, 'utf8');
    } catch (error) {
      throw new FailClosedError('FIXTURE_NOT_FOUND', `fixture not found for caseId "${caseId}": ${error.message}`);
    }
    let fixture;
    try {
      fixture = JSON.parse(text);
    } catch (error) {
      throw new FailClosedError('FIXTURE_INVALID', `fixture "${caseId}" is not valid JSON: ${error.message}`);
    }
    if (fixture && typeof fixture === 'object' && !Array.isArray(fixture) && fixture.error !== undefined) {
      const error = fixture.error;
      if (
        !error || typeof error !== 'object' ||
        !['BLOCKED', 'ESCALATE'].includes(error.disposition) ||
        typeof error.error_class !== 'string' || error.error_class === ''
      ) {
        throw new FailClosedError('FIXTURE_INVALID', `fixture "${caseId}" declares a malformed error object`);
      }
      return {
        kind: 'failure',
        result: failure(error.disposition, error.error_class, `fixture "${caseId}" declares an error outcome`)
      };
    }
    return { kind: 'candidate', candidate: fixture };
  }

  async function askLive(question, choices, state) {
    if (effectiveFetch === null) {
      throw new FailClosedError('CLIENT_CONFIG_INVALID', 'live mode requires a fetchImpl or a global fetch implementation');
    }
    const apiKey = env.TYPESAFE_API_KEY;
    if (typeof apiKey !== 'string' || apiKey === '') {
      throw new FailClosedError('JEV_API_KEY_MISSING', 'live mode requires env.TYPESAFE_API_KEY');
    }

    // NOTE: exact live endpoint shape confirmed at first live activation.
    // No fallback endpoint and no fallback model are ever invented here.
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/decisions`;

    // Outbound guard BEFORE fetch: allowlisted host only. The shared guard
    // admits http for generic outbound use; live Jev decisions additionally
    // require https strictly (fail closed).
    const parsedUrl = assertOutboundUrlAllowed(url, allowlistHosts);
    if (parsedUrl.protocol !== 'https:') {
      throw new FailClosedError('URL_PROTOCOL_FORBIDDEN', `live jev calls must use https, got ${parsedUrl.protocol} for ${url}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await effectiveFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: requestedModel,
          question: question.question_id,
          choices,
          state
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return { kind: 'failure', result: failure('ESCALATE', 'JEV_TIMEOUT', `jev decision request timed out after ${timeoutMs}ms`) };
      }
      return { kind: 'failure', result: failure('ESCALATE', 'JEV_UNAVAILABLE', 'jev decision endpoint is unreachable') };
    } finally {
      clearTimeout(timer);
    }

    // Never include response bodies in failures (no secret reflection).
    if (response.status === 429) {
      return { kind: 'failure', result: failure('ESCALATE', 'JEV_RATE_LIMITED', 'jev decision endpoint rate limited the request') };
    }
    if (response.status >= 500) {
      return { kind: 'failure', result: failure('ESCALATE', 'JEV_UNAVAILABLE', `jev decision endpoint unavailable (status ${response.status})`) };
    }
    if (response.status < 200 || response.status >= 300) {
      return { kind: 'failure', result: failure('BLOCKED', 'JEV_BAD_RESPONSE', `jev decision endpoint rejected the request (status ${response.status})`) };
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      return { kind: 'failure', result: failure('BLOCKED', 'JEV_BAD_RESPONSE', 'jev decision endpoint returned a non-JSON body') };
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { kind: 'failure', result: failure('BLOCKED', 'JEV_BAD_RESPONSE', 'jev decision endpoint returned a non-object body') };
    }
    return { kind: 'candidate', candidate: payload };
  }

  async function ask({ question, choices, caseId, state } = {}) {
    validateAskInput(question, choices);

    // Choices may never widen a declared question answer space.
    if (question.answer_space) {
      const declared = question.answer_space.values;
      if (choices.some((choice) => !declared.includes(choice))) {
        return failure('BLOCKED', 'ANSWER_OUTSIDE_ALLOWED_SPACE', 'choices widen the declared answer space of the question');
      }
    }

    const statePayload = state === undefined ? {} : state;
    let stateJson;
    try {
      stateJson = canonicalJson(statePayload);
    } catch {
      throw new FailClosedError('ASK_CONFIG_INVALID', 'state must be canonical-JSON serializable');
    }
    if (stateJson.length > STATE_MAX_JSON_CHARS) {
      return failure('BLOCKED', 'STATE_OVERSIZED', `state canonical JSON exceeds ${STATE_MAX_JSON_CHARS} characters`);
    }

    const outcome = mode === 'fixture'
      ? await askFixture(caseId)
      : await askLive(question, choices, statePayload);
    if (outcome.kind === 'failure') {
      return outcome.result;
    }

    const candidate = outcome.candidate;
    if (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) {
      return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'jev response confidence is missing or outside [0,1]');
    }
    if (typeof candidate.resolved_model !== 'string' || candidate.resolved_model === '' || candidate.resolved_model === '*') {
      return failure('BLOCKED', 'JEV_BAD_RESPONSE', 'jev response is missing a concrete resolved_model');
    }

    // Disallowed candidate answers are blocked, never coerced.
    if (!choices.includes(candidate.answer)) {
      return failure('BLOCKED', 'ANSWER_OUTSIDE_ALLOWED_SPACE', `candidate answer ${JSON.stringify(candidate.answer)} is not within the offered choices`);
    }
    if (question.answer_space) {
      try {
        assertAnswerInSpace(question, candidate.answer);
      } catch (error) {
        if (error instanceof FailClosedError && error.code === 'ANSWER_OUTSIDE_ALLOWED_SPACE') {
          return failure('BLOCKED', 'ANSWER_OUTSIDE_ALLOWED_SPACE', 'candidate answer is outside the question answer space');
        }
        throw error;
      }
    }

    const receipt = buildDecisionReceipt({
      question_id: question.question_id,
      choices,
      answer: candidate.answer,
      confidence: candidate.confidence,
      requested_model: requestedModel,
      resolved_model: candidate.resolved_model,
      decision_contract_version: decisionContractVersion,
      threshold_policy_version: thresholdPolicy.version,
      mode,
      created_at: nowIso()
    });
    const threshold = evaluateThreshold(receipt, thresholdPolicy);
    return Object.freeze({
      ok: true,
      answer: candidate.answer,
      confidence: candidate.confidence,
      resolved_model: candidate.resolved_model,
      receipt,
      threshold
    });
  }

  return Object.freeze({ mode, ask });
}
