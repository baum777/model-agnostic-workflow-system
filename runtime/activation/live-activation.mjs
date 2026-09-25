// MAWS vNext live activation closure.
// This module proves transport availability without widening MAWS authority.
// It performs three bounded probes: TypeSafe Jev, OpenRouter, and Codex.
// Secrets remain env-bound and are never written into activation evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJevClient } from '../decision-engine/jev/client.mjs';
import { buildPreferredExecutorQuestion } from '../decision-engine/jev/questions/registry.mjs';
import { loadThresholdPolicy } from '../decision-engine/jev/threshold-policy.mjs';
import { createOpenRouterExecutor } from '../executors/openrouter-executor.mjs';
import { createCodexExecutor } from '../executors/codex-executor.mjs';
import { nowIso } from '../vnext/util.mjs';

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

export async function runLiveActivation(options = {}) {
  const root = options.root ?? repoRootFromModule();
  const env = options.env ?? process.env;
  const now = options.now ?? nowIso;
  const startedAt = now();
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 30000;
  const requestedJevModel = options.requestedJevModel ?? 'jev-latest';
  const openRouterModelId = options.openRouterModelId ?? env.MAWS_OPENROUTER_MODEL ?? null;

  const preflight = {
    typesafe_api_key_present: typeof env.TYPESAFE_API_KEY === 'string' && env.TYPESAFE_API_KEY.length > 0,
    openrouter_api_key_present: typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.length > 0,
    openrouter_model_present: typeof openRouterModelId === 'string' && openRouterModelId.length > 0,
    codex_auth_source: typeof env.CODEX_HOME === 'string' && env.CODEX_HOME.length > 0 ? 'CODEX_HOME' : 'default_codex_home'
  };

  const blockers = [];
  if (!preflight.typesafe_api_key_present) blockers.push('TYPESAFE_API_KEY_MISSING');
  if (!preflight.openrouter_api_key_present) blockers.push('OPENROUTER_API_KEY_MISSING');
  if (!preflight.openrouter_model_present) blockers.push('MAWS_OPENROUTER_MODEL_MISSING');

  const probes = [];

  if (blockers.length === 0) {
    // Jev live decision probe: Jev is allowed to choose only between these
    // two deterministic executor IDs. The result is not an executor binding.
    try {
      const thresholdPolicy = options.thresholdPolicy ??
        await loadThresholdPolicy(path.join(root, 'policies', 'decision-thresholds.yaml'));
      const jevClient = options.jevClient ?? createJevClient({
        mode: 'live',
        thresholdPolicy,
        requestedModel: requestedJevModel,
        env,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      });
      const question = buildPreferredExecutorQuestion(['exec_openrouter_glm', 'exec_codex_harness']);
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
        probes.push(probeSummary('typesafe_jev', 'BLOCKED', {
          error_class: result.error_class,
          disposition: result.disposition
        }));
      } else if (result.threshold?.action !== 'PROCEED') {
        probes.push(probeSummary('typesafe_jev', 'BLOCKED', {
          resolved_model: result.resolved_model,
          confidence: result.confidence,
          threshold_action: result.threshold?.action ?? 'UNKNOWN'
        }));
      } else {
        probes.push(probeSummary('typesafe_jev', 'PASS', {
          requested_model: requestedJevModel,
          resolved_model: result.resolved_model,
          confidence: result.confidence,
          decision_receipt_ref: result.receipt?.receipt_id ?? null
        }));
      }
    } catch (error) {
      probes.push(probeSummary('typesafe_jev', 'BLOCKED', {
        error_class: error?.code ?? 'JEV_ACTIVATION_ERROR',
        message: error?.message ?? 'Jev activation probe failed'
      }));
    }

    // OpenRouter is a direct LLM executor. Provider-side model substitution
    // is surfaced and blocks activation; it is never treated as equivalent.
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
        probes.push(probeSummary('openrouter', 'BLOCKED', sanitized));
      } else if (sanitized.flags?.model_substitution === true) {
        probes.push(probeSummary('openrouter', 'BLOCKED', {
          ...sanitized,
          requested_model: openRouterModelId,
          reason: 'MODEL_SUBSTITUTION'
        }));
      } else {
        probes.push(probeSummary('openrouter', 'PASS', {
          requested_model: openRouterModelId,
          ...sanitized
        }));
      }
    } catch (error) {
      probes.push(probeSummary('openrouter', 'BLOCKED', {
        error_class: error?.code ?? 'OPENROUTER_ACTIVATION_ERROR',
        message: error?.message ?? 'OpenRouter activation probe failed'
      }));
    }

    // Codex uses the user's local authenticated Codex CLI surface. The
    // default Codex exec sandbox is kept; this probe requests no write effect.
    try {
      const executor = options.codexExecutor ?? createCodexExecutor({
        env,
        cwd: root,
        ...(options.spawnImpl ? { spawnImpl: options.spawnImpl } : {})
      });
      const result = await executor.execute(executorInvocation(
        'wu_live_activation_codex',
        'node_live_codex',
        'Read-only MAWS activation probe. Inspect no secrets and make no file changes. Return a concise acknowledgement.',
        timeoutMs
      ));
      const sanitized = sanitizedExecutorResult(result);
      if (sanitized.outcome !== 'SUCCESS') {
        probes.push(probeSummary('codex', 'BLOCKED', sanitized));
      } else {
        probes.push(probeSummary('codex', 'PASS', sanitized));
      }
    } catch (error) {
      probes.push(probeSummary('codex', 'BLOCKED', {
        error_class: error?.code ?? 'CODEX_ACTIVATION_ERROR',
        message: error?.message ?? 'Codex activation probe failed'
      }));
    }
  } else {
    for (const name of ['typesafe_jev', 'openrouter', 'codex']) {
      probes.push(probeSummary(name, 'NOT_RUN', { reason: 'PREFLIGHT_BLOCKED' }));
    }
  }

  const allPassed = blockers.length === 0 && probes.length === 3 && probes.every((probe) => probe.status === 'PASS');
  const evidence = {
    schema: 'maws.live-activation.v1',
    started_at: startedAt,
    finished_at: now(),
    status: allPassed ? 'LIVE_ACTIVATION_PASS' : 'BLOCKED',
    scope: 'transport_qualification_probe',
    mutation_allowed: false,
    requested_jev_model: requestedJevModel,
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
