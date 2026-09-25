// MAWS vNext live activation closure (ChatGPT + OpenRouter topology).
//
// Three INDEPENDENT bounded probes, one per transport lane:
//   codex_chatgpt    — Codex CLI on the owner's ChatGPT Codex plan
//                      (chatgpt_oauth / chatgpt_plan; no OpenRouter key).
//   openrouter_jev   — TypeSafe Jev through the OpenRouter Decisions API
//                      (OPENROUTER_API_KEY only; no TYPESAFE_API_KEY).
//   openrouter_model — direct OpenRouter model executor
//                      (OPENROUTER_API_KEY + explicit model id).
//
// Each probe reports PASS / BLOCKED / NOT_RUN against its own preflight, so
// one blocked lane never masks another. Status: LIVE_ACTIVATION_PASS only
// when all three PASS; PARTIAL when at least one PASSes; BLOCKED otherwise.
// Secrets remain env-bound and are never written into activation evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJevClient } from '../decision-engine/jev/client.mjs';
import { buildPreferredExecutorQuestion } from '../decision-engine/jev/questions/registry.mjs';
import { loadThresholdPolicy } from '../decision-engine/jev/threshold-policy.mjs';
import { createOpenRouterExecutor } from '../executors/openrouter-executor.mjs';
import { createCodexExecutor } from '../executors/codex-executor.mjs';
import { runLocalProcess } from '../transports/local-process.mjs';
import { nowIso } from '../vnext/util.mjs';

const CODEX_PROBE_TIMEOUT_MS = 120000;
const CODEX_VERSION_TIMEOUT_MS = 5000;
const CODEX_LOGIN_TIMEOUT_MS = 15000;
const DEFAULT_JEV_MODEL = '~typesafe/jev-latest';
const CODEX_PROBE_PHRASE = 'MAWS CODEX CHATGPT AUTH PASS';

function repoRootFromModule() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function safeTimestamp(value) {
  return value.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '');
}

function defaultEvidenceWriter(root, startedAt, evidence) {
  const runDir = path.join(root, 'artifacts', 'runtime-runs', `live-activation-${safeTimestamp(startedAt)}-${process.pid}`);
  fs.mkdirSync(runDir, { recursive: true });
  const evidencePath = path.join(runDir, 'activation-evidence.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidencePath;
}

async function defaultCodexVersionProbe({ env, spawnImpl }) {
  try {
    const proc = await runLocalProcess({
      command: 'codex',
      args: ['--version'],
      env: { PATH: env.PATH, HOME: env.HOME, ...(typeof env.CODEX_HOME === 'string' ? { CODEX_HOME: env.CODEX_HOME } : {}) },
      timeoutMs: CODEX_VERSION_TIMEOUT_MS,
      spawnImpl
    });
    if (proc.exit_code !== 0 || proc.timed_out || proc.cancelled) {
      return { available: false, version: null };
    }
    const match = /codex-cli\s+(\S+)/.exec(proc.stdout);
    return { available: true, version: match ? match[1] : proc.stdout.trim() };
  } catch {
    return { available: false, version: null };
  }
}

/**
 * ChatGPT auth preflight: `codex login status` must report an active login.
 * Only the boolean and a normalized auth mode string are recorded; token
 * material never leaves CODEX_HOME.
 */
async function defaultCodexAuthProbe({ env, spawnImpl }) {
  try {
    const proc = await runLocalProcess({
      command: 'codex',
      args: ['login', 'status'],
      env: { PATH: env.PATH, HOME: env.HOME, ...(typeof env.CODEX_HOME === 'string' ? { CODEX_HOME: env.CODEX_HOME } : {}) },
      timeoutMs: CODEX_LOGIN_TIMEOUT_MS,
      spawnImpl
    });
    if (proc.exit_code !== 0 || proc.timed_out || proc.cancelled) {
      return { authenticated: false, auth_mode: null };
    }
    const text = `${proc.stdout}\n${proc.stderr}`;
    if (/logged in using chatgpt/i.test(text)) {
      return { authenticated: true, auth_mode: 'chatgpt' };
    }
    if (/logged in/i.test(text)) {
      return { authenticated: true, auth_mode: 'other' };
    }
    return { authenticated: false, auth_mode: null };
  } catch {
    return { authenticated: false, auth_mode: null };
  }
}

function probeSummary(name, status, details = {}) {
  return Object.freeze({ name, status, ...details });
}

function executorInvocation(workUnitId, nodeId, objective, timeoutMs) {
  return {
    work_unit_id: workUnitId,
    node_id: nodeId,
    context_package: {
      objective,
      bounded_payload: { activation_probe: true, mutation_allowed: false },
      provenance_refs: ['MAWS_VNEXT_LIVE_ACTIVATION']
    },
    authority_envelope: {
      scope_ref: 'scope_live_activation_readonly',
      allowed_effects: ['ephemeral']
    },
    timeout_ms: timeoutMs
  };
}

function sanitizedExecutorResult(result) {
  if (!result || typeof result !== 'object') {
    return { outcome: 'FAILED', error_class: 'RESULT_INVALID' };
  }
  return {
    outcome: result.outcome ?? 'FAILED',
    error_class: result.error_class ?? null,
    metrics: result.metrics ?? null,
    flags: result.flags ?? null,
    exit_code: result.exit_code ?? null
  };
}

/**
 * Collect agent message texts from a Codex executor payload (single event
 * or { format: 'jsonl', events }) for the expected-phrase check.
 */
function collectAgentMessages(payload) {
  if (payload === null || typeof payload !== 'object') {
    return [];
  }
  const events = Array.isArray(payload.events) ? payload.events : [payload];
  const messages = [];
  for (const event of events) {
    if (event && typeof event === 'object' && event.item && typeof event.item === 'object'
      && event.item.type === 'agent_message' && typeof event.item.text === 'string') {
      messages.push(event.item.text);
    }
  }
  return messages;
}

export async function runLiveActivation(options = {}) {
  const root = options.root ?? repoRootFromModule();
  const env = options.env ?? process.env;
  const now = options.now ?? nowIso;
  const startedAt = now();
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 30000;
  const codexTimeoutMs = Number.isInteger(options.codexTimeoutMs) && options.codexTimeoutMs > 0
    ? options.codexTimeoutMs
    : CODEX_PROBE_TIMEOUT_MS;
  const openRouterModelId = options.openRouterModelId ?? env.MAWS_OPENROUTER_MODEL ?? null;
  const jevModelId = options.jevModelId ?? env.MAWS_JEV_MODEL ?? DEFAULT_JEV_MODEL;

  const openRouterKeyPresent = typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.length > 0;
  const openRouterModelPresent = typeof openRouterModelId === 'string' && openRouterModelId.length > 0;
  const jevModelPresent = typeof jevModelId === 'string' && jevModelId.length > 0;

  // --- Lane preflights (independent; one blocked lane never masks another) ---
  const codexVersion = await (options.codexVersionProbe ?? defaultCodexVersionProbe)({ env });
  const codexAuth = codexVersion.available
    ? await (options.codexAuthProbe ?? defaultCodexAuthProbe)({ env })
    : { authenticated: false, auth_mode: null };

  const preflight = {
    codex_binary_available: codexVersion.available === true,
    codex_version: codexVersion.version,
    codex_chatgpt_authenticated: codexAuth.authenticated === true,
    codex_auth_mode: codexAuth.auth_mode,
    openrouter_api_key_present: openRouterKeyPresent,
    openrouter_model_present: openRouterModelPresent,
    jev_model: jevModelId,
    jev_model_present: jevModelPresent,
    typesafe_key_present: typeof env.TYPESAFE_API_KEY === 'string' && env.TYPESAFE_API_KEY.length > 0,
    typesafe_key_required: false
  };

  const codexLaneReady = preflight.codex_binary_available && preflight.codex_chatgpt_authenticated;
  const jevLaneReady = openRouterKeyPresent && jevModelPresent;
  const modelLaneReady = openRouterKeyPresent && openRouterModelPresent;

  const blockers = [];
  if (!preflight.codex_binary_available) blockers.push('CODEX_BINARY_MISSING');
  if (!preflight.codex_chatgpt_authenticated) blockers.push('CODEX_CHATGPT_AUTH_MISSING');
  if (!openRouterKeyPresent) blockers.push('OPENROUTER_API_KEY_MISSING');
  if (!jevModelPresent) blockers.push('MAWS_JEV_MODEL_MISSING');
  if (!openRouterModelPresent) blockers.push('MAWS_OPENROUTER_MODEL_MISSING');

  const probes = [];

  // --- Probe 1: Codex on the ChatGPT plan (no OpenRouter dependency) -------
  if (!codexLaneReady) {
    probes.push(probeSummary('codex_chatgpt', 'NOT_RUN', { reason: 'CODEX_LANE_PREFLIGHT_BLOCKED' }));
  } else {
    try {
      const executor = options.codexExecutor ?? createCodexExecutor({
        env,
        cwd: root,
        authMode: 'chatgpt',
        sandbox: 'read-only',
        ...(options.spawnImpl ? { spawnImpl: options.spawnImpl } : {})
      });
      const result = await executor.execute(executorInvocation(
        'wu_live_activation_codex',
        'node_live_codex',
        `Return the exact phrase: ${CODEX_PROBE_PHRASE}. Do not modify files. Do not inspect secrets. Do not perform unrelated actions.`,
        codexTimeoutMs
      ));
      const sanitized = sanitizedExecutorResult(result);
      const agentMessages = sanitized.outcome === 'SUCCESS'
        ? collectAgentMessages(result.outputs?.[0]?.inline_payload ?? null)
        : [];
      const phraseObserved = agentMessages.some((text) => text.includes(CODEX_PROBE_PHRASE));
      if (sanitized.outcome !== 'SUCCESS') {
        probes.push(probeSummary('codex_chatgpt', 'BLOCKED', {
          ...sanitized,
          codex_version: preflight.codex_version,
          auth_class: 'chatgpt_oauth',
          billing_class: 'chatgpt_plan',
          executor_id: 'exec_codex_chatgpt'
        }));
      } else if (!phraseObserved) {
        probes.push(probeSummary('codex_chatgpt', 'BLOCKED', {
          ...sanitized,
          codex_version: preflight.codex_version,
          auth_class: 'chatgpt_oauth',
          billing_class: 'chatgpt_plan',
          executor_id: 'exec_codex_chatgpt',
          reason: 'EXPECTED_AGENT_MESSAGE_MISSING',
          expected_phrase: CODEX_PROBE_PHRASE
        }));
      } else {
        probes.push(probeSummary('codex_chatgpt', 'PASS', {
          ...sanitized,
          codex_version: preflight.codex_version,
          auth_class: 'chatgpt_oauth',
          billing_class: 'chatgpt_plan',
          executor_id: 'exec_codex_chatgpt',
          expected_phrase_observed: true
        }));
      }
    } catch (error) {
      probes.push(probeSummary('codex_chatgpt', 'BLOCKED', {
        error_class: error?.code ?? 'CODEX_ACTIVATION_ERROR',
        message: error?.message ?? 'Codex activation probe failed'
      }));
    }
  }

  // --- Probe 2: Jev through the OpenRouter Decisions API -------------------
  if (!jevLaneReady) {
    probes.push(probeSummary('openrouter_jev', 'NOT_RUN', { reason: 'JEV_LANE_PREFLIGHT_BLOCKED' }));
  } else {
    try {
      const thresholdPolicy = options.thresholdPolicy
        ?? await loadThresholdPolicy(path.join(root, 'policies', 'decision-thresholds.yaml'));
      const jevClient = options.jevClient ?? createJevClient({
        mode: 'openrouter',
        thresholdPolicy,
        requestedModel: jevModelId,
        env,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      });
      // Jev chooses only between the deterministic eligible executor ids.
      const question = buildPreferredExecutorQuestion(['exec_openrouter_glm', 'exec_codex_chatgpt']);
      const result = await jevClient.ask({
        question,
        choices: question.answer_space.values,
        state: {
          activation_probe: true,
          workload_safety_class: 'safe',
          mutation_allowed: false
        }
      });
      if (!result.ok) {
        probes.push(probeSummary('openrouter_jev', 'BLOCKED', {
          error_class: result.error_class,
          disposition: result.disposition,
          decision_transport: 'openrouter_decisions',
          requested_model: jevModelId
        }));
      } else if (result.threshold?.action !== 'PROCEED') {
        probes.push(probeSummary('openrouter_jev', 'BLOCKED', {
          resolved_model: result.resolved_model,
          confidence: result.confidence,
          threshold_action: result.threshold?.action ?? 'UNKNOWN',
          decision_transport: 'openrouter_decisions',
          requested_model: jevModelId
        }));
      } else {
        probes.push(probeSummary('openrouter_jev', 'PASS', {
          decision_transport: 'openrouter_decisions',
          requested_model: jevModelId,
          resolved_model: result.resolved_model,
          confidence: result.confidence,
          answer: result.answer,
          decision_receipt_ref: result.receipt?.receipt_id ?? null,
          threshold_policy_version: thresholdPolicy?.version ?? null
        }));
      }
    } catch (error) {
      probes.push(probeSummary('openrouter_jev', 'BLOCKED', {
        error_class: error?.code ?? 'JEV_ACTIVATION_ERROR',
        message: error?.message ?? 'Jev activation probe failed'
      }));
    }
  }

  // --- Probe 3: direct OpenRouter model executor ---------------------------
  if (!modelLaneReady) {
    probes.push(probeSummary('openrouter_model', 'NOT_RUN', { reason: 'MODEL_LANE_PREFLIGHT_BLOCKED' }));
  } else {
    try {
      const executor = options.openRouterExecutor ?? createOpenRouterExecutor({
        modelId: openRouterModelId,
        env,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      });
      const result = await executor.execute(executorInvocation(
        'wu_live_activation_openrouter',
        'node_live_openrouter',
        'Read-only MAWS activation probe. Return a short acknowledgement. Do not request tools, secrets, writes, or broader scope.',
        timeoutMs
      ));
      const sanitized = sanitizedExecutorResult(result);
      if (sanitized.outcome !== 'SUCCESS') {
        probes.push(probeSummary('openrouter_model', 'BLOCKED', sanitized));
      } else if (sanitized.flags?.model_substitution === true) {
        probes.push(probeSummary('openrouter_model', 'BLOCKED', {
          ...sanitized,
          requested_model: openRouterModelId,
          reason: 'MODEL_SUBSTITUTION'
        }));
      } else {
        probes.push(probeSummary('openrouter_model', 'PASS', {
          requested_model: openRouterModelId,
          ...sanitized
        }));
      }
    } catch (error) {
      probes.push(probeSummary('openrouter_model', 'BLOCKED', {
        error_class: error?.code ?? 'OPENROUTER_ACTIVATION_ERROR',
        message: error?.message ?? 'OpenRouter activation probe failed'
      }));
    }
  }

  const passedCount = probes.filter((probe) => probe.status === 'PASS').length;
  const status = passedCount === 3
    ? 'LIVE_ACTIVATION_PASS'
    : (passedCount > 0 ? 'PARTIAL' : 'BLOCKED');

  const evidence = {
    schema: 'maws.live-activation.v2',
    started_at: startedAt,
    finished_at: now(),
    status,
    scope: 'transport_qualification_probe',
    mutation_allowed: false,
    credential_matrix: {
      codex: 'chatgpt_oauth (ChatGPT Codex plan)',
      jev: 'OPENROUTER_API_KEY (OpenRouter Decisions API)',
      openrouter_models: 'OPENROUTER_API_KEY'
    },
    jev_model: jevModelId,
    openrouter_model: openRouterModelId,
    preflight,
    blockers,
    probes
  };

  const writeEvidence = options.writeEvidence ?? true;
  const evidencePath = writeEvidence
    ? (options.evidenceWriter ?? defaultEvidenceWriter)(root, startedAt, evidence)
    : null;

  return Object.freeze({ ...evidence, evidence_path: evidencePath });
}
