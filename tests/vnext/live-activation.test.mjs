import assert from 'node:assert/strict';
import test from 'node:test';

import { runLiveActivation } from '../../runtime/activation/live-activation.mjs';

const ENV = {
  OPENROUTER_API_KEY: 'test-openrouter-key',
  MAWS_OPENROUTER_MODEL: 'test/provider-model'
};

function authControllerOk() {
  return {
    async verifyAuthHealth() {
      return {
        auth_status: 'AUTH_HEALTHY',
        auth_mode: 'chatgpt',
        codex_available: true,
        codex_version: '0.157.0',
        login_status: 'chatgpt',
        health_probe: 'PASS',
        interaction_required: false,
        error_class: null
      };
    },
    async requestLogin() {
      throw new Error('requestLogin must never be invoked by activation');
    }
  };
}

function authControllerWith(receipt) {
  return {
    async verifyAuthHealth() {
      return receipt;
    },
    async requestLogin() {
      throw new Error('requestLogin must never be invoked by activation');
    }
  };
}

function jevPass() {
  return {
    async ask() {
      return {
        ok: true,
        answer: 'analysis',
        confidence: 0.93,
        resolved_model: 'typesafe/jev-1.13-20260917',
        receipt: { receipt_id: 'jevr_activation' },
        threshold: { action: 'PROCEED', applied_threshold: 0.7 }
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
    codexAuthController: authControllerOk(),
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
  assert.equal(result.preflight.codex_auth_health, 'PASS');
  assert.equal(result.preflight.codex_login_status, 'chatgpt');
  assert.equal(result.preflight.codex_auth_mode, 'chatgpt');
  assert.equal(result.preflight.codex_interaction_required, false);
  assert.equal(result.preflight.codex_version, '0.157.0');
  assert.equal(result.preflight.typesafe_key_required, false);
  assert.equal(result.schema, 'maws.live-activation.v2');
  const codex = result.probes.find((probe) => probe.name === 'codex_chatgpt');
  assert.equal(codex.auth_class, 'chatgpt_oauth');
  assert.equal(codex.billing_class, 'chatgpt_plan');
  assert.equal(codex.executor_id, 'exec_codex_chatgpt');
  assert.equal(codex.auth_health, 'PASS');
  assert.equal(codex.expected_phrase_observed, true);
  const jev = result.probes.find((probe) => probe.name === 'openrouter_jev');
  assert.equal(jev.decision_transport, 'openrouter_decisions');
  assert.equal(jev.requested_model, '~typesafe/jev-latest');
  assert.equal(jev.resolved_model, 'typesafe/jev-1.13-20260917');
  assert.equal(jev.answer, 'analysis');
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

test('not-logged-in Codex blocks only the Codex lane (CODEX_AUTH_NOT_LOGGED_IN) without masking OpenRouter', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-nologin',
    codexAuthController: authControllerWith({
      auth_status: 'NOT_LOGGED_IN',
      auth_mode: null,
      codex_available: true,
      codex_version: '0.157.0',
      login_status: 'not_logged_in',
      health_probe: 'NOT_RUN',
      interaction_required: true,
      error_class: 'CODEX_AUTH_NOT_LOGGED_IN'
    }),
    jevClient: jevPass(),
    openRouterExecutor: executorPass()
  }));

  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.blockers.includes('CODEX_AUTH_NOT_LOGGED_IN'));
  const byName = Object.fromEntries(result.probes.map((probe) => [probe.name, probe]));
  assert.equal(byName.codex_chatgpt.status, 'NOT_RUN');
  assert.equal(byName.openrouter_jev.status, 'PASS');
  assert.equal(byName.openrouter_model.status, 'PASS');
  assert.equal(byName.codex_chatgpt.codex_auth_state, 'NOT_LOGGED_IN');
});

test('stored ChatGPT status with a stale live session blocks the Codex lane (CODEX_AUTH_STALE)', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-stale',
    codexAuthController: authControllerWith({
      auth_status: 'AUTH_STALE',
      auth_mode: 'chatgpt',
      codex_available: true,
      codex_version: '0.157.0',
      login_status: 'chatgpt',
      health_probe: 'FAIL',
      interaction_required: true,
      error_class: 'CODEX_AUTH_STALE'
    }),
    jevClient: jevPass(),
    openRouterExecutor: executorPass()
  }));

  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.blockers.includes('CODEX_AUTH_STALE'));
  assert.equal(result.preflight.codex_login_status, 'chatgpt');
  assert.equal(result.preflight.codex_auth_health, 'FAIL');
  assert.equal(result.preflight.codex_interaction_required, true);
  assert.equal(result.probes.find((probe) => probe.name === 'codex_chatgpt').status, 'NOT_RUN');
});

test('wrong auth mode (API key) blocks the Codex lane with CODEX_AUTH_WRONG_MODE', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-wrongmode',
    codexAuthController: authControllerWith({
      auth_status: 'WRONG_AUTH_MODE',
      auth_mode: 'api_key',
      codex_available: true,
      codex_version: '0.157.0',
      login_status: 'api_key',
      health_probe: 'NOT_RUN',
      interaction_required: true,
      error_class: 'CODEX_AUTH_WRONG_MODE'
    }),
    jevClient: jevPass(),
    openRouterExecutor: executorPass()
  }));
  assert.ok(result.blockers.includes('CODEX_AUTH_WRONG_MODE'));
  assert.equal(result.probes.find((probe) => probe.name === 'codex_chatgpt').status, 'NOT_RUN');
});

test('missing codex binary blocks the Codex lane with CODEX_BINARY_MISSING', async () => {
  const result = await runLiveActivation(baseOptions({
    root: '/tmp/maws-live-activation-nobin',
    codexAuthController: authControllerWith({
      auth_status: 'CODEX_UNAVAILABLE',
      auth_mode: null,
      codex_available: false,
      codex_version: null,
      login_status: 'unknown',
      health_probe: 'NOT_RUN',
      interaction_required: false,
      error_class: 'CODEX_AUTH_ENVIRONMENT_FAILURE'
    })
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
          answer: 'analysis',
          confidence: 0.2,
          resolved_model: 'typesafe/jev-1.13-20260917',
          receipt: { receipt_id: 'jevr_low' },
          threshold: { action: 'HUMAN_GATE', applied_threshold: 0.7 }
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
    codexAuthController: authControllerWith({
      auth_status: 'NOT_LOGGED_IN',
      auth_mode: null,
      codex_available: true,
      codex_version: '0.157.0',
      login_status: 'not_logged_in',
      health_probe: 'NOT_RUN',
      interaction_required: true,
      error_class: 'CODEX_AUTH_NOT_LOGGED_IN'
    })
  }));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.probes.every((probe) => probe.status === 'NOT_RUN'));
});
