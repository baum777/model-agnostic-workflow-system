import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runLiveActivation } from '../../runtime/activation/live-activation.mjs';

const ENV = {
  TYPESAFE_API_KEY: 'test-typesafe-key',
  OPENROUTER_API_KEY: 'test-openrouter-key',
  MAWS_OPENROUTER_MODEL: 'test/provider-model',
  MAWS_CODEX_MODEL: 'zai/glm-4.7'
};

const VERSION_PROBE_OK = async () => ({ available: true, version: '0.157.0' });

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

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maws-live-activation-'));
}

function baseOptions(overrides = {}) {
  return {
    env: ENV,
    codexVersionProbe: VERSION_PROBE_OK,
    thresholdPolicy: {},
    writeEvidence: false,
    ...overrides
  };
}

test('live activation passes only when Jev, OpenRouter and Codex all pass', async () => {
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
    jevClient: jevPass(),
    openRouterExecutor: executorPass(),
    codexExecutor: executorPass({ stream_format: 'jsonl', event_count: 2 }),
    now: (() => {
      const values = ['2026-09-25T14:30:00.000Z', '2026-09-25T14:30:01.000Z'];
      return () => values.shift() ?? '2026-09-25T14:30:01.000Z';
    })()
  }));

  assert.equal(result.status, 'LIVE_ACTIVATION_PASS');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.probes.length, 3);
  assert.ok(result.probes.every((probe) => probe.status === 'PASS'));
  assert.equal(result.preflight.typesafe_api_key_present, true);
  assert.equal(result.preflight.openrouter_api_key_present, true);
  assert.equal(result.preflight.codex_binary_available, true);
  assert.equal(result.preflight.codex_version, '0.157.0');
  assert.equal(result.preflight.codex_config_valid, true);
  assert.equal(result.preflight.codex_model_present, true);
  assert.equal(result.preflight.codex_wire_api, 'responses');
  assert.equal(JSON.stringify(result).includes(ENV.TYPESAFE_API_KEY), false);
  assert.equal(JSON.stringify(result).includes(ENV.OPENROUTER_API_KEY), false);
});

test('missing credentials block activation before any live probe runs', async () => {
  let calls = 0;
  const never = {
    async ask() { calls += 1; throw new Error('must not run'); },
    async execute() { calls += 1; throw new Error('must not run'); }
  };
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
    env: {},
    jevClient: never,
    openRouterExecutor: never,
    codexExecutor: never
  }));

  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('TYPESAFE_API_KEY_MISSING'));
  assert.ok(result.blockers.includes('OPENROUTER_API_KEY_MISSING'));
  assert.ok(result.blockers.includes('MAWS_OPENROUTER_MODEL_MISSING'));
  assert.ok(result.blockers.includes('MAWS_CODEX_MODEL_MISSING'));
  assert.equal(calls, 0);
  assert.ok(result.probes.every((probe) => probe.status === 'NOT_RUN'));
});

test('missing MAWS_CODEX_MODEL alone blocks the Codex lane preflight', async () => {
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
    env: { ...ENV, MAWS_CODEX_MODEL: '' }
  }));
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.blockers, ['MAWS_CODEX_MODEL_MISSING']);
  assert.ok(result.probes.every((probe) => probe.status === 'NOT_RUN'));
});

test('missing codex binary blocks activation with CODEX_BINARY_MISSING', async () => {
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
    codexVersionProbe: async () => ({ available: false, version: null })
  }));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('CODEX_BINARY_MISSING'));
});

test('unsupported wire api value blocks activation with CODEX_WIRE_API_INVALID', async () => {
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
    env: { ...ENV, MAWS_CODEX_WIRE_API: 'grpc' }
  }));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('CODEX_WIRE_API_INVALID'));
  assert.equal(result.preflight.codex_config_valid, false);
});

test('default codex home is bootstrapped with the canonical OpenRouter provider config', async () => {
  const root = tmpRoot();
  await runLiveActivation(baseOptions({ root }));
  const configPath = path.join(root, 'artifacts', 'codex-home', 'config.toml');
  const configText = fs.readFileSync(configPath, 'utf8');
  assert.ok(configText.includes('model_provider = "openrouter"'));
  assert.ok(configText.includes('[model_providers.openrouter]'));
  assert.ok(configText.includes('base_url = "https://openrouter.ai/api/v1"'));
  assert.ok(configText.includes('env_key = "OPENROUTER_API_KEY"'));
  assert.ok(configText.includes('wire_api = "responses"'));
  assert.ok(configText.includes('requires_openai_auth = false'));
});

test('an invalid external CODEX_HOME config blocks activation and is never rewritten', async () => {
  const root = tmpRoot();
  const externalHome = path.join(root, 'external-codex-home');
  fs.mkdirSync(externalHome, { recursive: true });
  const configPath = path.join(externalHome, 'config.toml');
  fs.writeFileSync(configPath, 'model_provider = "builtin"\n', 'utf8');

  const result = await runLiveActivation(baseOptions({
    root,
    env: { ...ENV, CODEX_HOME: externalHome }
  }));
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('CODEX_CONFIG_INVALID'));
  assert.equal(result.preflight.codex_home_source, 'env');
  assert.equal(fs.readFileSync(configPath, 'utf8'), 'model_provider = "builtin"\n', 'external home must never be rewritten');
});

test('OpenRouter model substitution blocks activation even when execution succeeds', async () => {
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
    jevClient: jevPass(),
    openRouterExecutor: executorPass({ model_substitution: true, served_model: 'other/model' }),
    codexExecutor: executorPass()
  }));

  assert.equal(result.status, 'BLOCKED');
  const openrouter = result.probes.find((probe) => probe.name === 'openrouter');
  assert.equal(openrouter.status, 'BLOCKED');
  assert.equal(openrouter.reason, 'MODEL_SUBSTITUTION');
});

test('Codex-side model substitution blocks activation even when execution succeeds', async () => {
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
    jevClient: jevPass(),
    openRouterExecutor: executorPass(),
    codexExecutor: executorPass({ stream_format: 'jsonl', event_count: 3, served_model: 'other/model', model_substitution: true })
  }));

  assert.equal(result.status, 'BLOCKED');
  const codex = result.probes.find((probe) => probe.name === 'codex');
  assert.equal(codex.status, 'BLOCKED');
  assert.equal(codex.reason, 'MODEL_SUBSTITUTION');
  assert.equal(codex.requested_model, 'zai/glm-4.7');
  assert.equal(codex.model_provider, 'openrouter');
  assert.equal(codex.codex_version, '0.157.0');
});

test('low-confidence Jev outcome blocks activation instead of widening authority', async () => {
  const result = await runLiveActivation(baseOptions({
    root: tmpRoot(),
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
    codexExecutor: executorPass()
  }));

  assert.equal(result.status, 'BLOCKED');
  const jev = result.probes.find((probe) => probe.name === 'typesafe_jev');
  assert.equal(jev.status, 'BLOCKED');
  assert.equal(jev.threshold_action, 'HUMAN_GATE');
});
