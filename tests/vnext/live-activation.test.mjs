import assert from 'node:assert/strict';
import test from 'node:test';

import { runLiveActivation } from '../../runtime/activation/live-activation.mjs';

const ENV = {
  OPENROUTER_API_KEY: 'test-openrouter-key',
  MAWS_OPENROUTER_MODEL: 'test/provider-model'
};

const PROBES_OK = {
  codexVersionProbe: async () => ({ available: true, version: '0.157.0' }),
  codexAuthProbe: async () => ({ authenticated: true, auth_mode: 'chatgpt' })
};

function jevPass() {
  return {
    async ask() {
      return {
        ok: true,
        answer: 'exec_openrouter_glm',
        confidence: 0.93,
        resolved_model: 'typesafe/jev-1.13-20260917',
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

function codexExecutorPass() {
  return {
    async execute() {
      return {
        outcome: 'SUCCESS',
        error_class: null,
        metrics: { latency_ms: 10, cost_units: 0, tokens_in: 5, tokens_out: 5 },
        flags: { stream_format: 'jsonl', event_count: 4 },
        outputs: [{
          inline_payload: {
            format: 'jsonl',
            events: [
              { type: 'item.completed', item: { type: 'agent_message', text: 'MAWS CODEX CHATGPT AUTH PASS' } }
            ]
          }
        }],
        exit_code: 0
      };
    }
  };
}

function baseOptions(overrides = {}) {
  return {
    env: ENV,
    thresholdPolicy: {},
    writeEvidence: false,
    ...PROBES_OK,
    ...overrides
  };
}

test('live activation passes only when all three independent probes pass', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-pass',
    jevClient: jevPass(),
    openRouterExecutor: executorPass(),
    codexExecutor: codexExecutorPass(),
    now: (() => {
      const values = ['2026-09-25T20:30:00.000Z', '2026-09-25T20:30:01.000Z'];
      return () => values.shift() ?? '2026-09-25T20:30:01.000Z';
    })()
  }));

  assert.equal(result.status, 'LIVE_ACTIVATION_PASS');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.probes.length, 3);
  assert.ok(result.probes.every((probe) => probe.status === 'PASS'));
  assert.equal(result.preflight.codex_chatgpt_authenticated, true);
  assert.equal(result.preflight.codex_version, '0.157.0');
  assert.equal(result.preflight.typesafe_key_required, false);
  assert.equal(result.schema, 'maws.live-activation.v2');
  const codex = result.probes.find((probe) => probe.name === 'codex_chatgpt');
  assert.equal(codex.auth_class, 'chatgpt_oauth');
  assert.equal(codex.billing_class, 'chatgpt_plan');
  assert.equal(codex.executor_id, 'exec_codex_chatgpt');
  assert.equal(codex.expected_phrase_observed, true);
  const jev = result.probes.find((probe) => probe.name === 'openrouter_jev');
  assert.equal(jev.decision_transport, 'openrouter_decisions');
  assert.equal(jev.requested_model, '~typesafe/jev-latest');
  assert.equal(jev.resolved_model, 'typesafe/jev-1.13-20260917');
  assert.equal(JSON.stringify(result).includes(ENV.OPENROUTER_API_KEY), false);
});

test('missing OpenRouter key does not mask the independent Codex lane: PARTIAL', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-partial',
    env: {},
    codexExecutor: codexExecutorPass()
  }));

  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.blockers.includes('OPENROUTER_API_KEY_MISSING'));
  assert.ok(result.blockers.includes('MAWS_OPENROUTER_MODEL_MISSING'));
  const byName = Object.fromEntries(result.probes.map((probe) => [probe.name, probe]));
  assert.equal(byName.codex_chatgpt.status, 'PASS');
  assert.equal(byName.openrouter_jev.status, 'NOT_RUN');
  assert.equal(byName.openrouter_model.status, 'NOT_RUN');
});

test('unauthenticated Codex blocks only the Codex lane (CODEX_CHATGPT_AUTH_MISSING)', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-noauth',
    codexAuthProbe: async () => ({ authenticated: false, auth_mode: null }),
    jevClient: jevPass(),
    openRouterExecutor: executorPass()
  }));

  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.blockers.includes('CODEX_CHATGPT_AUTH_MISSING'));
  const byName = Object.fromEntries(result.probes.map((probe) => [probe.name, probe]));
  assert.equal(byName.codex_chatgpt.status, 'NOT_RUN');
  assert.equal(byName.openrouter_jev.status, 'PASS');
  assert.equal(byName.openrouter_model.status, 'PASS');
});

test('missing codex binary blocks the Codex lane with CODEX_BINARY_MISSING', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-nobin',
    codexVersionProbe: async () => ({ available: false, version: null })
  }));
  assert.ok(result.blockers.includes('CODEX_BINARY_MISSING'));
  assert.equal(result.probes.find((probe) => probe.name === 'codex_chatgpt').status, 'NOT_RUN');
});

test('Codex success without the expected agent phrase is BLOCKED, not PASS', async () => {
  const silentCodex = {
    async execute() {
      return {
        outcome: 'SUCCESS',
        error_class: null,
        metrics: { latency_ms: 5 },
        flags: { stream_format: 'jsonl', event_count: 2 },
        outputs: [{ inline_payload: { format: 'jsonl', events: [
          { type: 'item.completed', item: { type: 'agent_message', text: 'sure, no problem' } }
        ] } }],
        exit_code: 0
      };
    }
  };
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-nophrase',
    codexExecutor: silentCodex
  }));
  const codex = result.probes.find((probe) => probe.name === 'codex_chatgpt');
  assert.equal(codex.status, 'BLOCKED');
  assert.equal(codex.reason, 'EXPECTED_AGENT_MESSAGE_MISSING');
});

test('OpenRouter model substitution blocks the model lane even on execution success', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-subst',
    jevClient: jevPass(),
    openRouterExecutor: executorPass({ model_substitution: true, served_model: 'other/model' }),
    codexExecutor: codexExecutorPass()
  }));
  assert.equal(result.status, 'PARTIAL');
  const openrouter = result.probes.find((probe) => probe.name === 'openrouter_model');
  assert.equal(openrouter.status, 'BLOCKED');
  assert.equal(openrouter.reason, 'MODEL_SUBSTITUTION');
});

test('low-confidence Jev outcome blocks the Jev lane instead of widening authority', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-lowconf',
    jevClient: {
      async ask() {
        return {
          ok: true,
          answer: 'exec_codex_chatgpt',
          confidence: 0.2,
          resolved_model: 'typesafe/jev-1.13-20260917',
          receipt: { receipt_id: 'jevr_low' },
          threshold: { action: 'HUMAN_GATE', applied_threshold: 0.8 }
        };
      }
    },
    openRouterExecutor: executorPass(),
    codexExecutor: codexExecutorPass()
  }));

  assert.equal(result.status, 'PARTIAL');
  const jev = result.probes.find((probe) => probe.name === 'openrouter_jev');
  assert.equal(jev.status, 'BLOCKED');
  assert.equal(jev.threshold_action, 'HUMAN_GATE');
});

test('no lane ready yields BLOCKED with all probes NOT_RUN', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-none',
    env: {},
    codexAuthProbe: async () => ({ authenticated: false, auth_mode: null })
  }));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.probes.every((probe) => probe.status === 'NOT_RUN'));
});
