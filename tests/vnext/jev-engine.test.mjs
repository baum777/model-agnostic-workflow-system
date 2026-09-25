// Jev typed decision engine tests (MAWS-VN-200..203, OD-18).
// node:test + node:assert/strict; node builtins only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { canonicalJson, FailClosedError } from '../../runtime/vnext/util.mjs';
import {
  evaluateThreshold,
  loadThresholdPolicy,
  parseThresholdPolicy,
  selectThreshold
} from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import {
  assertAnswerInSpace,
  buildPreferredExecutorQuestion,
  getQuestion
} from '../../runtime/decision-engine/jev/questions/registry.mjs';
import {
  buildDecisionReceipt,
  validateReceiptShape
} from '../../runtime/decision-engine/jev/decision-receipt.mjs';
import { recordResolution } from '../../runtime/decision-engine/jev/model-resolution.mjs';
import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const POLICY_PATH = path.join(repoRoot, 'policies', 'decision-thresholds.yaml');
const POLICY_SCHEMA = 'core/contracts/decision-threshold-policy.schema.json';
// Synthetic placeholder per policies/secret-classes.yaml (never a real secret).
const SYNTH_KEY = 'SAFE_TEST_SECRET_jev_typesafe_9f1c';

const eligibleIds = ['exec_openrouter_glm', 'exec_local_tests'];
const preferredExecutorQuestion = buildPreferredExecutorQuestion(eligibleIds);

async function loadPolicy() {
  return loadThresholdPolicy(POLICY_PATH);
}

async function makeFixtureClient(options = {}) {
  const clientOptions = { mode: 'fixture', ...options };
  if (clientOptions.thresholdPolicy === undefined) {
    clientOptions.thresholdPolicy = await loadPolicy();
  }
  return createJevClient(clientOptions);
}

function isFailClosed(code) {
  return (error) => error instanceof FailClosedError && error.code === code;
}

// ---------------------------------------------------------------------------
// Threshold policy: parse, contract validation, selection, evaluation
// ---------------------------------------------------------------------------

test('threshold policy file parses, validates against the contract, and selects scoped entries over wildcard', async () => {
  const policy = await loadPolicy();
  assert.equal(policy.policy_id, 'decision-thresholds-default');
  assert.equal(policy.version, '1');
  assert.equal(policy.model_thresholds.length, 2);

  const issues = validateInstanceAgainstContract(policy, POLICY_SCHEMA, repoRoot);
  assert.deepEqual(issues, []);

  const scoped = selectThreshold(policy, 'jev-1.13.0');
  assert.equal(scoped.min_confidence, 0.8);
  assert.equal(scoped.low_confidence_action, 'DETERMINISTIC_FALLBACK');

  const wildcard = selectThreshold(policy, 'jev-9.9.9');
  assert.equal(wildcard.min_confidence, 0.7);
  assert.equal(wildcard.low_confidence_action, 'HUMAN_GATE');
});

test('evaluateThreshold returns PROCEED on/above the threshold and the scoped low_confidence_action below it', async () => {
  const policy = await loadPolicy();

  // 0.75 clears the wildcard threshold (0.7) but not the scoped entry (0.8):
  // the scoped entry must win.
  assert.deepEqual(
    evaluateThreshold({ confidence: 0.75, resolved_model: 'jev-1.13.0' }, policy),
    { action: 'DETERMINISTIC_FALLBACK', applied_threshold: 0.8 }
  );
  assert.deepEqual(
    evaluateThreshold({ confidence: 0.9, resolved_model: 'jev-1.13.0' }, policy),
    { action: 'PROCEED', applied_threshold: 0.8 }
  );
  assert.deepEqual(
    evaluateThreshold({ confidence: 0.8, resolved_model: 'jev-1.13.0' }, policy),
    { action: 'PROCEED', applied_threshold: 0.8 }
  );
  // Unknown concrete model falls back to the wildcard entry.
  assert.deepEqual(
    evaluateThreshold({ confidence: 0.5, resolved_model: 'jev-9.9.9' }, policy),
    { action: 'HUMAN_GATE', applied_threshold: 0.7 }
  );

  // No coverage without a wildcard -> fail closed.
  const noWildcardPolicy = parseThresholdPolicy([
    'policy_id: p',
    'version: "1"',
    'model_thresholds:',
    '  - model: "jev-1.13.0"',
    '    min_confidence: 0.8',
    '    low_confidence_action: HUMAN_GATE'
  ].join('\n'));
  assert.throws(() => selectThreshold(noWildcardPolicy, 'jev-2.0.0'), isFailClosed('POLICY_NO_MATCH'));

  // Ambiguous duplicate entries -> fail closed.
  const ambiguousPolicy = parseThresholdPolicy([
    'policy_id: p',
    'version: "1"',
    'model_thresholds:',
    '  - model: "jev-1.13.0"',
    '    min_confidence: 0.8',
    '    low_confidence_action: HUMAN_GATE',
    '  - model: "jev-1.13.0"',
    '    min_confidence: 0.9',
    '    low_confidence_action: BLOCKED'
  ].join('\n'));
  assert.throws(() => selectThreshold(ambiguousPolicy, 'jev-1.13.0'), isFailClosed('POLICY_AMBIGUOUS'));
});

test('decision threshold contract rejects invalid instances (closed enum, bounded confidence, additionalProperties)', async () => {
  const policy = await loadPolicy();
  assert.notEqual(
    validateInstanceAgainstContract({ ...policy, unexpected: true }, POLICY_SCHEMA, repoRoot).length,
    0
  );
  assert.notEqual(
    validateInstanceAgainstContract({
      ...policy,
      model_thresholds: [{ model: '*', min_confidence: 0.5, low_confidence_action: 'AUTO_WIDEN_AUTHORITY' }]
    }, POLICY_SCHEMA, repoRoot).length,
    0
  );
  assert.notEqual(
    validateInstanceAgainstContract({
      ...policy,
      model_thresholds: [{ model: '*', min_confidence: 1.5, low_confidence_action: 'HUMAN_GATE' }]
    }, POLICY_SCHEMA, repoRoot).length,
    0
  );
  assert.notEqual(
    validateInstanceAgainstContract({ policy_id: 'p', version: '1' }, POLICY_SCHEMA, repoRoot).length,
    0
  );
});

test('malformed threshold policy YAML is rejected with POLICY_PARSE_FAILED', () => {
  const validEntry = [
    '  - model: "*"',
    '    min_confidence: 0.7',
    '    low_confidence_action: HUMAN_GATE'
  ].join('\n');
  const cases = [
    ['', 'empty text'],
    [`policy_id: p\nversion: "1"\nmodel_thresholds:\n  - model: "*"\n    min_confidence: 0.7\n    low_confidence_action: WIDEN_AUTHORITY\n`, 'action outside closed enum'],
    [`policy_id: p\nversion: "1"\nunknown_key: x\nmodel_thresholds:\n${validEntry}`, 'unknown top-level key'],
    [`policy_id: p\nversion: "1"\nmodel_thresholds:\n  - model: "*"\n    min_confidence: 1.7\n    low_confidence_action: HUMAN_GATE\n`, 'min_confidence above 1'],
    [`policy_id: p\nversion: "1"\nmodel_thresholds:\n  - model: "*"\n      min_confidence: 0.7\n`, 'nesting deeper than one list level'],
    [`policy_id: p\nversion: 1\nmodel_thresholds:\n${validEntry}`, 'unquoted numeric version'],
    [`policy_id: p\nversion: "1"\nmodel_thresholds:\n  - model: "*"\n    min_confidence: 0.7\n`, 'entry missing field'],
    [`policy_id: p\nversion: "1"\n`, 'missing model_thresholds'],
    [`policy_id: p\nversion: "1"\nmodel_thresholds: []\n`, 'model_thresholds scalar instead of list'],
    [`policy_id: p\nversion: "1"\nmodel_thresholds:\n${validEntry}\n    rogue_field: 1\n`, 'unknown entry field'],
    [`policy_id: p\npolicy_id: q\nversion: "1"\nmodel_thresholds:\n${validEntry}`, 'duplicate top-level key'],
    [`policy_id: p\nversion: "1"\nmodel_thresholds:\n${validEntry}\n- model: "*"\n`, 'unindented list entry']
  ];
  for (const [text, label] of cases) {
    assert.throws(() => parseThresholdPolicy(text), isFailClosed('POLICY_PARSE_FAILED'), `expected POLICY_PARSE_FAILED for: ${label}`);
  }
});

// ---------------------------------------------------------------------------
// Question registry
// ---------------------------------------------------------------------------

test('question registry serves static typed questions and fails closed on unknown ids', () => {
  const workClass = getQuestion('work_class');
  assert.equal(workClass.question_id, 'work_class');
  assert.deepEqual(workClass.answer_space, { type: 'enum', values: ['analysis', 'implementation', 'verification', 'decision'] });

  assert.deepEqual(getQuestion('risk_class').answer_space.values, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  assert.deepEqual(
    getQuestion('composition_mode').answer_space.values,
    ['independent_parallel', 'producer_verifier', 'specialist_synthesis', 'none']
  );
  assert.deepEqual(
    getQuestion('revision_type').answer_space.values,
    ['add_node', 'remove_node', 'rebind_executor', 'change_dependencies', 'cancel_work_unit', 'update_context', 'update_budget']
  );
  assert.deepEqual(
    getQuestion('disagreement_type').answer_space.values,
    ['factual_conflict', 'implementation_conflict', 'verification_conflict', 'evidence_conflict', 'policy_conflict', 'authority_conflict']
  );
  assert.deepEqual(getQuestion('evidence_sufficiency').answer_space.values, ['sufficient', 'insufficient', 'unknown']);
  assert.deepEqual(getQuestion('decomposition_needed').answer_space.values, ['yes', 'no']);
  assert.deepEqual(getQuestion('independent_verification_required').answer_space.values, ['yes', 'no']);

  assert.throws(() => getQuestion('no_such_question'), isFailClosed('UNKNOWN_QUESTION'));
  // preferred_executor is dynamic on purpose; no static shadow may exist.
  assert.throws(() => getQuestion('preferred_executor'), isFailClosed('UNKNOWN_QUESTION'));
});

test('buildPreferredExecutorQuestion constructs values only from the eligible executor list', () => {
  const question = buildPreferredExecutorQuestion(['exec_a', 'exec_b']);
  assert.equal(question.question_id, 'preferred_executor');
  assert.deepEqual(question.answer_space, { type: 'enum', values: ['exec_a', 'exec_b'] });

  assert.throws(() => buildPreferredExecutorQuestion([]), isFailClosed('INVALID_EXECUTOR_ID'));
  assert.throws(() => buildPreferredExecutorQuestion(['exec_a', 'exec_a']), isFailClosed('INVALID_EXECUTOR_ID'));
  assert.throws(() => buildPreferredExecutorQuestion(['not_an_exec']), isFailClosed('INVALID_EXECUTOR_ID'));
  assert.throws(() => buildPreferredExecutorQuestion('exec_a'), isFailClosed('INVALID_EXECUTOR_ID'));
});

test('assertAnswerInSpace accepts in-space answers and rejects everything else fail-closed', () => {
  assert.equal(assertAnswerInSpace(getQuestion('work_class'), 'analysis'), true);
  assert.throws(() => assertAnswerInSpace(getQuestion('work_class'), 'unbounded_action'), isFailClosed('ANSWER_OUTSIDE_ALLOWED_SPACE'));
  assert.throws(() => assertAnswerInSpace(preferredExecutorQuestion, 'exec_not_in_set'), isFailClosed('ANSWER_OUTSIDE_ALLOWED_SPACE'));
  assert.throws(() => assertAnswerInSpace({ question_id: 'x' }, 'y'), isFailClosed('INVALID_QUESTION'));
});

// ---------------------------------------------------------------------------
// Decision receipts
// ---------------------------------------------------------------------------

test('buildDecisionReceipt produces a valid, secret-free receipt and rejects invalid inputs', () => {
  const receipt = buildDecisionReceipt({
    question_id: 'preferred_executor',
    choices: eligibleIds,
    answer: 'exec_openrouter_glm',
    confidence: 0.9,
    requested_model: 'jev-latest',
    resolved_model: 'jev-1.13.0',
    decision_contract_version: 'jev.decision.v1',
    threshold_policy_version: '1',
    mode: 'fixture'
  });

  assert.match(receipt.receipt_id, /^jevr_[a-z0-9]+$/);
  assert.equal(receipt.mode, 'fixture');
  assert.deepEqual(validateReceiptShape(receipt), []);
  // Receipts carry the closed field set only: no state, no secrets.
  const receiptJson = canonicalJson(receipt);
  assert.equal(Object.keys(receipt).sort().join(','), [
    'answer', 'choices', 'confidence', 'created_at', 'decision_contract_version',
    'mode', 'question_id', 'receipt_id', 'requested_model', 'resolved_model', 'threshold_policy_version'
  ].join(','));
  assert.ok(!receiptJson.includes('state'));

  const invalidReceipts = [
    { ...baseReceiptInput(), answer: 'exec_not_in_set' },
    { ...baseReceiptInput(), confidence: 1.2 },
    { ...baseReceiptInput(), mode: 'dream' },
    { ...baseReceiptInput(), resolved_model: '' },
    { ...baseReceiptInput(), threshold_policy_version: '' }
  ];
  for (const input of invalidReceipts) {
    assert.throws(() => buildDecisionReceipt(input), (error) => error instanceof FailClosedError, `expected rejection for ${input}`);
  }
  // Out-of-space answer keeps its dedicated code.
  assert.throws(
    () => buildDecisionReceipt({ ...baseReceiptInput(), answer: 'exec_not_in_set' }),
    isFailClosed('ANSWER_OUTSIDE_ALLOWED_SPACE')
  );
});

function baseReceiptInput() {
  return {
    question_id: 'preferred_executor',
    choices: eligibleIds,
    answer: 'exec_openrouter_glm',
    confidence: 0.9,
    requested_model: 'jev-latest',
    resolved_model: 'jev-1.13.0',
    decision_contract_version: 'jev.decision.v1',
    threshold_policy_version: '1',
    mode: 'fixture'
  };
}

test('validateReceiptShape reports concrete issues for damaged receipts', () => {
  const receipt = buildDecisionReceipt(baseReceiptInput());
  assert.equal(validateReceiptShape({ ...receipt, receipt_id: 'nope' }).length > 0, true);
  assert.equal(validateReceiptShape({ ...receipt, confidence: 2 }).length > 0, true);
  assert.equal(validateReceiptShape({ ...receipt, answer: 'exec_not_in_set' }).length > 0, true);
  assert.equal(validateReceiptShape({ ...receipt, mode: 'live' }).length, 0);
});

// ---------------------------------------------------------------------------
// Model resolution / alias drift
// ---------------------------------------------------------------------------

test('recordResolution classifies alias drift NON_MATERIAL / MATERIAL / UNKNOWN', () => {
  assert.deepEqual(
    recordResolution('jev-latest', 'jev-1.13.0', null),
    { requested_model: 'jev-latest', resolved_model: 'jev-1.13.0', alias_drift: false, drift_class: 'NON_MATERIAL' }
  );
  const sameAgain = recordResolution('jev-latest', 'jev-1.13.0', 'jev-1.13.0');
  assert.equal(sameAgain.alias_drift, false);
  assert.equal(sameAgain.drift_class, 'NON_MATERIAL');

  const drift = recordResolution('jev-latest', 'jev-1.14.0', 'jev-1.13.0');
  assert.equal(drift.alias_drift, true);
  assert.equal(drift.drift_class, 'MATERIAL');

  const unknownDrift = recordResolution('jev-latest', 'jev-1.14.0', 'jev-latest');
  assert.equal(unknownDrift.alias_drift, true);
  assert.equal(unknownDrift.drift_class, 'UNKNOWN');

  assert.throws(() => recordResolution('', 'jev-1.13.0', null), isFailClosed('MODEL_RESOLUTION_INVALID'));
  assert.throws(() => recordResolution('jev-latest', '', null), isFailClosed('MODEL_RESOLUTION_INVALID'));
  assert.throws(() => recordResolution('jev-latest', '*', null), isFailClosed('MODEL_RESOLUTION_INVALID'));
});

// ---------------------------------------------------------------------------
// Client: fixture mode
// ---------------------------------------------------------------------------

test('fixture mode: valid preference yields ok result, valid receipt, and PROCEED threshold', async () => {
  const client = await makeFixtureClient();
  assert.equal(client.mode, 'fixture');

  const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds, caseId: 'valid-preference' });
  assert.equal(result.ok, true);
  assert.equal(result.answer, 'exec_openrouter_glm');
  assert.equal(result.resolved_model, 'jev-1.13.0');
  assert.deepEqual(result.threshold, { action: 'PROCEED', applied_threshold: 0.8 });
  assert.deepEqual(validateReceiptShape(result.receipt), []);
  assert.equal(result.receipt.mode, 'fixture');
  assert.equal(result.receipt.decision_contract_version, 'jev.decision.v1');
  assert.equal(result.receipt.threshold_policy_version, '1');
  assert.equal(result.receipt.requested_model, 'jev-latest');
  assert.equal(result.receipt.choices.includes('exec_openrouter_glm'), true);
});

test('fixture mode: disallowed candidate answer injection is BLOCKED, never coerced', async () => {
  const client = await makeFixtureClient();
  const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds, caseId: 'disallowed-injection' });
  assert.deepEqual(
    { ok: result.ok, disposition: result.disposition, error_class: result.error_class },
    { ok: false, disposition: 'BLOCKED', error_class: 'ANSWER_OUTSIDE_ALLOWED_SPACE' }
  );
  assert.equal(result.receipt, undefined);
});

test('fixture mode: low confidence applies the scoped threshold action, not the wildcard action', async () => {
  const client = await makeFixtureClient();
  const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds, caseId: 'low-confidence' });
  assert.equal(result.ok, true);
  // 0.3 < scoped 0.8 (DETERMINISTIC_FALLBACK); also < wildcard 0.7 (HUMAN_GATE).
  // The scoped entry for jev-1.13.0 must win over "*".
  assert.deepEqual(result.threshold, { action: 'DETERMINISTIC_FALLBACK', applied_threshold: 0.8 });
});

test('fixture mode: conflicting signals at mid confidence stay below the scoped threshold', async () => {
  const client = await makeFixtureClient();
  const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds, caseId: 'conflicting-signals' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.threshold, { action: 'DETERMINISTIC_FALLBACK', applied_threshold: 0.8 });
});

test('fixture mode: alias drift fixture resolves jev-1.14.0 and records MATERIAL drift', async () => {
  const client = await makeFixtureClient();
  const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds, caseId: 'alias-drift' });
  assert.equal(result.ok, true);
  assert.equal(result.resolved_model, 'jev-1.14.0');
  assert.deepEqual(result.threshold, { action: 'PROCEED', applied_threshold: 0.7 });

  const resolution = recordResolution('jev-latest', result.resolved_model, 'jev-1.13.0');
  assert.equal(resolution.alias_drift, true);
  assert.equal(resolution.drift_class, 'MATERIAL');
});

test('fixture mode: oversized state is blocked before any decision is loaded', async () => {
  const client = await makeFixtureClient();
  const result = await client.ask({
    question: preferredExecutorQuestion,
    choices: eligibleIds,
    caseId: 'valid-preference',
    state: { blob: 'x'.repeat(40000) }
  });
  assert.deepEqual(
    { ok: result.ok, disposition: result.disposition, error_class: result.error_class },
    { ok: false, disposition: 'BLOCKED', error_class: 'STATE_OVERSIZED' }
  );
});

test('fixture mode: error fixture yields a typed unavailable outcome', async () => {
  const client = await makeFixtureClient();
  const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds, caseId: 'api-unavailable' });
  assert.deepEqual(
    { ok: result.ok, disposition: result.disposition, error_class: result.error_class },
    { ok: false, disposition: 'ESCALATE', error_class: 'JEV_UNAVAILABLE' }
  );
});

test('fixture mode: missing resolved_model in the fixture is JEV_BAD_RESPONSE', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-fixtures-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'missing-model.json'),
      JSON.stringify({ answer: 'exec_openrouter_glm', confidence: 0.9 }),
      'utf8'
    );
    const client = await makeFixtureClient({ fixtureDir: tmpDir });
    const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds, caseId: 'missing-model' });
    assert.deepEqual(
      { ok: result.ok, disposition: result.disposition, error_class: result.error_class },
      { ok: false, disposition: 'BLOCKED', error_class: 'JEV_BAD_RESPONSE' }
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('client blocks choices that widen a declared question answer space', async () => {
  const client = await makeFixtureClient();
  const result = await client.ask({
    question: preferredExecutorQuestion,
    choices: [...eligibleIds, 'exec_rogue_extra'],
    caseId: 'valid-preference'
  });
  assert.deepEqual(
    { ok: result.ok, disposition: result.disposition, error_class: result.error_class },
    { ok: false, disposition: 'BLOCKED', error_class: 'ANSWER_OUTSIDE_ALLOWED_SPACE' }
  );
});

test('client configuration fails closed on invalid options', async () => {
  const thresholdPolicy = await loadPolicy();
  assert.throws(() => createJevClient({ mode: 'imaginary', thresholdPolicy }), isFailClosed('CLIENT_CONFIG_INVALID'));
  assert.throws(() => createJevClient({ mode: 'fixture' }), isFailClosed('CLIENT_CONFIG_INVALID'));
  assert.throws(() => createJevClient({ mode: 'fixture', thresholdPolicy: {} }), isFailClosed('POLICY_INVALID'));
  assert.throws(() => createJevClient({ mode: 'fixture', thresholdPolicy, timeoutMs: 0 }), isFailClosed('CLIENT_CONFIG_INVALID'));
  assert.throws(() => createJevClient({ mode: 'fixture', thresholdPolicy, allowlistHosts: [] }), isFailClosed('CLIENT_CONFIG_INVALID'));
});

// ---------------------------------------------------------------------------
// Client: live mode (fetchImpl stubs, no real network)
// ---------------------------------------------------------------------------

test('live mode: URL guard rejects non-allowlisted hosts and plain http before any fetch', async () => {
  const thresholdPolicy = await loadPolicy();
  let fetchCalls = 0;
  const fetchStub = async () => {
    fetchCalls += 1;
    throw new Error('fetch must not be called');
  };
  const baseOptions = {
    mode: 'live',
    thresholdPolicy,
    fetchImpl: fetchStub,
    env: { TYPESAFE_API_KEY: SYNTH_KEY }
  };

  const evilHostClient = createJevClient({ ...baseOptions, baseUrl: 'https://evil.example.com' });
  await assert.rejects(
    evilHostClient.ask({ question: preferredExecutorQuestion, choices: eligibleIds }),
    isFailClosed('URL_HOST_NOT_ALLOWLISTED')
  );
  assert.equal(fetchCalls, 0);

  const httpClient = createJevClient({ ...baseOptions, baseUrl: 'http://api.typesafe.ai' });
  await assert.rejects(
    httpClient.ask({ question: preferredExecutorQuestion, choices: eligibleIds }),
    isFailClosed('URL_PROTOCOL_FORBIDDEN')
  );
  assert.equal(fetchCalls, 0);
});

test('live mode: missing API key fails closed before any fetch', async () => {
  const thresholdPolicy = await loadPolicy();
  let fetchCalls = 0;
  const client = createJevClient({
    mode: 'live',
    thresholdPolicy,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('fetch must not be called');
    },
    env: {}
  });
  await assert.rejects(
    client.ask({ question: preferredExecutorQuestion, choices: eligibleIds }),
    isFailClosed('JEV_API_KEY_MISSING')
  );
  assert.equal(fetchCalls, 0);
});

test('live mode: typed outcomes for rate limit, unavailability, timeout, and bad responses', async () => {
  const thresholdPolicy = await loadPolicy();
  const cases = [
    [{ status: 429, json: async () => ({}) }, 'JEV_RATE_LIMITED', 'ESCALATE'],
    [{ status: 503, json: async () => ({}) }, 'JEV_UNAVAILABLE', 'ESCALATE'],
    [{ status: 400, json: async () => ({}) }, 'JEV_BAD_RESPONSE', 'BLOCKED']
  ];
  for (const [responseStub, expectedClass, expectedDisposition] of cases) {
    const client = createJevClient({
      mode: 'live',
      thresholdPolicy,
      fetchImpl: async () => responseStub,
      env: { TYPESAFE_API_KEY: SYNTH_KEY }
    });
    const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds });
    assert.equal(result.ok, false, `${expectedClass} must be a failure`);
    assert.equal(result.error_class, expectedClass);
    assert.equal(result.disposition, expectedDisposition);
    assert.equal(canonicalJson(result).includes(SYNTH_KEY), false);
  }

  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';
  const timeoutClient = createJevClient({
    mode: 'live',
    thresholdPolicy,
    fetchImpl: async () => {
      throw abortError;
    },
    env: { TYPESAFE_API_KEY: SYNTH_KEY }
  });
  const timeoutResult = await timeoutClient.ask({ question: preferredExecutorQuestion, choices: eligibleIds });
  assert.deepEqual(
    { ok: timeoutResult.ok, error_class: timeoutResult.error_class, disposition: timeoutResult.disposition },
    { ok: false, error_class: 'JEV_TIMEOUT', disposition: 'ESCALATE' }
  );

  const badJsonClient = createJevClient({
    mode: 'live',
    thresholdPolicy,
    fetchImpl: async () => ({
      status: 200,
      json: async () => {
        throw new Error('not json');
      }
    }),
    env: { TYPESAFE_API_KEY: SYNTH_KEY }
  });
  const badJsonResult = await badJsonClient.ask({ question: preferredExecutorQuestion, choices: eligibleIds });
  assert.equal(badJsonResult.error_class, 'JEV_BAD_RESPONSE');
});

test('live mode: successful typed response produces receipt + threshold and never leaks the API key', async () => {
  const thresholdPolicy = await loadPolicy();
  let observed = null;
  const client = createJevClient({
    mode: 'live',
    thresholdPolicy,
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return {
        status: 200,
        json: async () => ({ answer: 'exec_openrouter_glm', confidence: 0.9, resolved_model: 'jev-1.13.0' })
      };
    },
    env: { TYPESAFE_API_KEY: SYNTH_KEY }
  });

  const result = await client.ask({
    question: preferredExecutorQuestion,
    choices: eligibleIds,
    state: { work_unit_id: 'wu_probe_001' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.answer, 'exec_openrouter_glm');
  assert.deepEqual(result.threshold, { action: 'PROCEED', applied_threshold: 0.8 });
  assert.deepEqual(validateReceiptShape(result.receipt), []);
  assert.equal(result.receipt.mode, 'live');

  // Outbound request shape: allowlisted https endpoint, POST, bearer header,
  // typed question payload with capped state.
  assert.equal(observed.url, 'https://api.typesafe.ai/v1/decisions');
  assert.equal(observed.init.method, 'POST');
  assert.equal(observed.init.headers.authorization, `Bearer ${SYNTH_KEY}`);
  assert.deepEqual(JSON.parse(observed.init.body), {
    model: 'jev-latest',
    question: 'preferred_executor',
    choices: eligibleIds,
    state: { work_unit_id: 'wu_probe_001' }
  });

  // Secret containment: key must never appear in any returned object.
  assert.equal(canonicalJson(result).includes(SYNTH_KEY), false);
  assert.equal(canonicalJson(client).includes(SYNTH_KEY), false);
});

test('live mode: injection through a live response is BLOCKED, not adopted', async () => {
  const thresholdPolicy = await loadPolicy();
  const client = createJevClient({
    mode: 'live',
    thresholdPolicy,
    fetchImpl: async () => ({
      status: 200,
      json: async () => ({ answer: 'exec_not_in_set', confidence: 0.99, resolved_model: 'jev-1.13.0' })
    }),
    env: { TYPESAFE_API_KEY: SYNTH_KEY }
  });
  const result = await client.ask({ question: preferredExecutorQuestion, choices: eligibleIds });
  assert.deepEqual(
    { ok: result.ok, disposition: result.disposition, error_class: result.error_class },
    { ok: false, disposition: 'BLOCKED', error_class: 'ANSWER_OUTSIDE_ALLOWED_SPACE' }
  );
});

test('recordResolution classifies OpenRouter dated snapshots as concrete and drift MATERIAL', () => {
  // First resolution of the alias: no drift.
  assert.deepEqual(
    recordResolution('~typesafe/jev-latest', 'typesafe/jev-1.13-20260917', null),
    { requested_model: '~typesafe/jev-latest', resolved_model: 'typesafe/jev-1.13-20260917', alias_drift: false, drift_class: 'NON_MATERIAL' }
  );
  // Snapshot change under the same alias: both concrete -> MATERIAL.
  assert.equal(
    recordResolution('~typesafe/jev-latest', 'typesafe/jev-1.13-20260924', 'typesafe/jev-1.13-20260917').drift_class,
    'MATERIAL'
  );
  // Pinned release ids remain concrete; aliases never do.
  assert.equal(recordResolution('jev-latest', 'jev-1.13.0', null).drift_class, 'NON_MATERIAL');
  assert.equal(
    recordResolution('~typesafe/jev-latest', 'typesafe/jev-1.13-20260924', 'jev-latest-ish').drift_class,
    'UNKNOWN'
  );
});
