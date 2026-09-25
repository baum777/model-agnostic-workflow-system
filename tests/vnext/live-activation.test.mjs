import assert from 'node:assert/strict';
import test from 'node:test';

import { runLiveActivation } from '../../runtime/activation/live-activation.mjs';

const ENV = {
  TYPESAFE_API_KEY: 'test-typesafe-key',
  OPENROUTER_API_KEY: 'test-openrouter-key',
  MAWS_OPENROUTER_MODEL: 'test/provider-model'
};

function jevPass() {
  return {
    async ask() {
      return {
        ok: true,
        answer: 'exec_openrouter_glm',
        confidence: 0.93,
        resolved_model: 'jev-1.13.0',
        receipt: { receipt_id: 'jevr_activation' },
        threshold: { action: 'PROCEED', applied_threshold: 0.8 }
      };
    }
  };
}

function executorPass(flags = null) {
  return {
    async execute() {
      return {
        outcome: 'SUCCESS',
        error_class: null,
        metrics: { latency_ms: 1, cost_units: 0, tokens_in: 1, tokens_out: 1 },
        flags,
        exit_code: 0
      };
    }
  };
}

test('live activation passes only when Jev, OpenRouter and Codex all pass', async () => {
  const result = await runLiveActivation({
    env: ENV,
    jevClient: jevPass(),
    openRouterExecutor: executorPass(),
    codexExecutor: executorPass({ stream_format: 'jsonl', event_count: 2 }),
    writeEvidence: false,
    now: (() => {
      const values = ['2026-09-25T14:30:00.000Z', '2026-09-25T14:30:01.000Z'];
      return () => values.shift() ?? '2026-09-25T14:30:01.000Z';
    })()
  });

  assert.equal(result.status, 'LIVE_ACTIVATION_PASS');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.probes.length, 3);
  assert.ok(result.probes.every((probe) => probe.status === 'PASS'));
  assert.equal(result.preflight.typesafe_api_key_present, true);
  assert.equal(result.preflight.openrouter_api_key_present, true);
  assert.equal(JSON.stringify(result).includes(ENV.TYPESAFE_API_KEY), false);
  assert.equal(JSON.stringify(result).includes(ENV.OPENROUTER_API_KEY), false);
});

test('missing credentials block activation before any live probe runs', async () => {
  let calls = 0;
  const never = {
    async ask() { calls += 1; throw new Error('must not run'); },
    async execute() { calls += 1; throw new Error('must not run'); }
  };
  const result = await runLiveActivation({
    env: {},
    jevClient: never,
    openRouterExecutor: never,
    codexExecutor: never,
    writeEvidence: false
  });

  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('TYPESAFE_API_KEY_MISSING'));
  assert.ok(result.blockers.includes('OPENROUTER_API_KEY_MISSING'));
  assert.ok(result.blockers.includes('MAWS_OPENROUTER_MODEL_MISSING'));
  assert.equal(calls, 0);
  assert.ok(result.probes.every((probe) => probe.status === 'NOT_RUN'));
});

test('OpenRouter model substitution blocks activation even when execution succeeds', async () => {
  const result = await runLiveActivation({
    env: ENV,
    jevClient: jevPass(),
    openRouterExecutor: executorPass({ model_substitution: true, served_model: 'other/model' }),
    codexExecutor: executorPass(),
    writeEvidence: false
  });

  assert.equal(result.status, 'BLOCKED');
  const openrouter = result.probes.find((probe) => probe.name === 'openrouter');
  assert.equal(openrouter.status, 'BLOCKED');
  assert.equal(openrouter.reason, 'MODEL_SUBSTITUTION');
});

test('low-confidence Jev outcome blocks activation instead of widening authority', async () => {
  const result = await runLiveActivation({
    env: ENV,
    jevClient: {
      async ask() {
        return {
          ok: true,
          answer: 'exec_codex_harness',
          confidence: 0.2,
          resolved_model: 'jev-1.13.0',
          receipt: { receipt_id: 'jevr_low' },
          threshold: { action: 'HUMAN_GATE', applied_threshold: 0.8 }
        };
      }
    },
    openRouterExecutor: executorPass(),
    codexExecutor: executorPass(),
    writeEvidence: false
  });

  assert.equal(result.status, 'BLOCKED');
  const jev = result.probes.find((probe) => probe.name === 'typesafe_jev');
  assert.equal(jev.status, 'BLOCKED');
  assert.equal(jev.threshold_action, 'HUMAN_GATE');
});
