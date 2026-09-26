// MAWS vNext — Codex harness executor, ChatGPT plan path (MAWS-VN-401).
//
// Executor class: agent_harness (OD-01: the harness is an executor class,
// NOT a model entry and NOT a provider adapter). Inference runs on the
// owner's ChatGPT Codex plan through the locally authenticated Codex CLI
// (auth_mode "chatgpt", billing "chatgpt_plan"). This executor path has NO
// dependency on OPENROUTER_API_KEY, OPENAI_API_KEY, or any OpenRouter
// provider configuration — OpenRouter is a separate executor surface.
//
// Authentication boundary: auth is executor configuration (authMode), never
// WorkUnit-selectable. A WorkUnit can never inject model, provider,
// credential, or authentication configuration. When no explicit model is
// configured, the Codex CLI resolves its plan default model; the observed
// served model is recorded from the event stream where exposed.
//
// Live boundary (verified against codex-cli 0.157.0): `codex exec --json`
// emits pure JSONL on stdout (diagnostics go to stderr). Every non-empty
// line is parsed independently; malformed JSON fails closed. Terminal
// failure is classified from the event stream, not from the exit code:
// a top-level `turn.failed` event is fatal even when the process exits 0,
// while transient top-level `error` events (e.g. provider reconnects) and
// nested item errors (e.g. model-metadata warnings) are surfaced as flags.
//
// OD-04: this executor performs exactly one bounded invocation; it never
// spawns MAWS-governed children and carries no decomposition authority.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineExecutor } from './executor-base.mjs';
import { runLocalProcess } from '../transports/local-process.mjs';
import { FailClosedError } from '../vnext/util.mjs';

const CODEX_COMMAND = 'codex';
// Confirmed-at-activation flag set: ['exec', '--json', '-', plus optional
// '--sandbox' and '-m' executor configuration]
const CODEX_BASE_ARGS = ['exec', '--json'];
// Minimal environment allowlist: binary resolution, home, codex auth home.
// The ChatGPT OAuth session lives inside CODEX_HOME (default ~/.codex) and
// is never copied into ExecutionResults. Everything else is dropped.
const CODEX_ENV_ALLOWLIST = ['PATH', 'HOME', 'CODEX_HOME'];
const CODEX_AUTH_MODES = new Set(['chatgpt']);
// An explicitly configured model travels as one argv value after -m; keep the
// accepted charset closed.
const CODEX_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/:+-]*$/;
const SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const EVENT_DETAIL_MAX_CHARS = 300;
const MODEL_SCAN_DEPTH_LIMIT = 6;
// Event keys whose string values identify the served model (exact match, so
// prose like "Model metadata for `slug` not found" never false-positives).
const SERVED_MODEL_KEYS = new Set(['model', 'model_id']);

function repoRootFromModule() {
  // <root>/runtime/executors/codex-executor.mjs -> <root>
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function buildAllowlistedEnv(sourceEnv) {
  const childEnv = {};
  for (const name of CODEX_ENV_ALLOWLIST) {
    if (sourceEnv !== null && typeof sourceEnv === 'object' && typeof sourceEnv[name] === 'string') {
      childEnv[name] = sourceEnv[name];
    }
  }
  return childEnv;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function truncateDetail(value) {
  return value.length <= EVENT_DETAIL_MAX_CHARS ? value : `${value.slice(0, EVENT_DETAIL_MAX_CHARS)}...`;
}

/**
 * Bounded scan for served-model identity strings in parsed JSONL events.
 * Only exact keys `model` / `model_id` count; the first string value found
 * wins. Returns null when the stream exposes no model identity.
 */
function findServedModelValue(value, depth = 0) {
  if (depth > MODEL_SCAN_DEPTH_LIMIT) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findServedModelValue(item, depth + 1);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (!isPlainObject(value)) {
    return null;
  }
  for (const [key, inner] of Object.entries(value)) {
    if (SERVED_MODEL_KEYS.has(key) && typeof inner === 'string' && inner.length > 0) {
      return inner;
    }
    const found = findServedModelValue(inner, depth + 1);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * Classify a parsed JSONL event stream against the live codex-cli 0.157.0
 * event vocabulary. Fatal: top-level `turn.failed`. Non-fatal but surfaced:
 * top-level `error` events (transient reconnects) and nested item errors.
 * `boundModel` may be null (plan-default model): the served model is then
 * recorded without a substitution comparison.
 */
function classifyCodexEvents(events, boundModel) {
  let turnFailedMessage = null;
  let errorEventCount = 0;
  let itemErrorCount = 0;
  for (const event of events) {
    if (!isPlainObject(event)) {
      continue;
    }
    if (event.type === 'turn.failed') {
      const message = isPlainObject(event.error) && typeof event.error.message === 'string'
        ? event.error.message
        : (typeof event.message === 'string' && event.message.length > 0 ? event.message : 'codex turn failed');
      if (turnFailedMessage === null) {
        turnFailedMessage = truncateDetail(message);
      }
    } else if (event.type === 'error') {
      errorEventCount += 1;
    }
    if (isPlainObject(event.item) && event.item.type === 'error') {
      itemErrorCount += 1;
    }
  }

  const flags = { stream_format: 'jsonl', event_count: events.length };
  if (errorEventCount > 0) {
    flags.error_event_count = errorEventCount;
  }
  if (itemErrorCount > 0) {
    flags.item_error_count = itemErrorCount;
  }
  const servedModel = findServedModelValue(events);
  if (servedModel !== null) {
    flags.served_model = servedModel;
    if (boundModel !== null && servedModel !== boundModel) {
      // Provider-side substitution is surfaced, never silently accepted.
      flags.model_substitution = true;
    }
  }
  return { flags, turnFailedMessage };
}

/**
 * Create the Codex harness executor (ChatGPT plan path).
 *
 * @param {object} [options]
 * @param {Function} [options.spawnImpl] - injectable spawn for tests (default node:child_process.spawn)
 * @param {string} [options.cwd]         - working directory (default: this repository root)
 * @param {Object} [options.env]         - source environment for the allowlist (default: process.env)
 * @param {string} [options.authMode]    - authentication class; executor configuration, never
 *                                         WorkUnit-selectable (default: 'chatgpt')
 * @param {string} [options.model]       - optional explicit model slug passed via -m; when absent the
 *                                         Codex CLI resolves the plan default model
 * @param {string} [options.sandbox]     - optional codex sandbox mode (read-only | workspace-write | danger-full-access)
 * @returns {object} executor (defineExecutor shape)
 */
export function createCodexExecutor({
  spawnImpl,
  cwd,
  env = process.env,
  authMode = 'chatgpt',
  model,
  sandbox
} = {}) {
  if (!CODEX_AUTH_MODES.has(authMode)) {
    throw new FailClosedError(
      'EXECUTOR_DECLARATION_INVALID',
      `authMode must be one of ${[...CODEX_AUTH_MODES].join(', ')}`
    );
  }
  if (model !== undefined && model !== null) {
    if (typeof model !== 'string' || model.length === 0 || !CODEX_MODEL_PATTERN.test(model)) {
      throw new FailClosedError(
        'EXECUTOR_DECLARATION_INVALID',
        `model must match ${CODEX_MODEL_PATTERN} when provided`
      );
    }
  }
  if (sandbox !== undefined && !SANDBOX_MODES.has(sandbox)) {
    throw new FailClosedError(
      'EXECUTOR_DECLARATION_INVALID',
      `sandbox must be one of ${[...SANDBOX_MODES].join(', ')}`
    );
  }

  const boundModel = typeof model === 'string' && model.length > 0 ? model : null;

  return defineExecutor({
    executorId: 'exec_codex_chatgpt',
    executorClass: 'agent_harness',
    displayName: 'Codex Harness (ChatGPT plan)',
    transport: 'codex_exec',
    declaredCapabilities: ['cap_code_implementation'],
    execute: async (invocation) => {
      const args = [...CODEX_BASE_ARGS];
      if (sandbox !== undefined) {
        args.push('--sandbox', sandbox);
      }
      if (boundModel !== null) {
        args.push('-m', boundModel);
      }
      args.push('-');

      const childEnv = buildAllowlistedEnv(env);
      let proc;
      try {
        proc = await runLocalProcess({
          command: CODEX_COMMAND,
          args,
          cwd: cwd ?? repoRootFromModule(),
          timeoutMs: invocation.timeout_ms,
          signal: invocation.signal,
          env: childEnv,
          stdinData: JSON.stringify(invocation.context_package),
          spawnImpl
        });
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          return { outcome: 'FAILED', error_class: 'EXECUTOR_UNAVAILABLE', exit_code: null };
        }
        throw error;
      }

      if (proc.timed_out) {
        return { outcome: 'TIMEOUT', error_class: 'TIMEOUT', exit_code: null };
      }
      if (proc.cancelled) {
        return { outcome: 'CANCELLED', error_class: 'CANCELLED', exit_code: null };
      }

      // Both nonzero exits and terminal failure events classify as FAILED;
      // event classification is attempted first because the stream carries
      // the causal detail (turn.failed) that the bare exit code loses.
      const stdoutText = typeof proc.stdout === 'string' ? proc.stdout.trim() : '';
      let events = null;
      if (stdoutText.length > 0) {
        const lines = stdoutText.split(/\r?\n/).filter((line) => line.trim().length > 0);
        const parsed = [];
        try {
          for (const line of lines) {
            parsed.push(JSON.parse(line));
          }
          if (parsed.length > 0) {
            events = parsed;
          }
        } catch {
          events = null;
        }
      }

      if (events !== null) {
        const { flags, turnFailedMessage } = classifyCodexEvents(events, boundModel);
        if (turnFailedMessage !== null) {
          return {
            outcome: 'FAILED',
            error_class: 'CODEX_TURN_FAILED',
            flags: { ...flags, turn_failed_message: turnFailedMessage },
            exit_code: proc.exit_code
          };
        }
      }

      if (proc.exit_code !== 0) {
        const flags = events !== null
          ? classifyCodexEvents(events, boundModel).flags
          : undefined;
        return {
          outcome: 'FAILED',
          error_class: 'NON_ZERO_EXIT',
          ...(flags !== undefined ? { flags } : {}),
          exit_code: proc.exit_code
        };
      }

      // Exit 0 without a terminal failure event: `codex exec --json` emits
      // JSONL; a missing/empty stream invalidates the execution.
      if (events === null || events.length === 0) {
        return { outcome: 'FAILED', error_class: 'OUTPUT_INVALID', exit_code: proc.exit_code };
      }

      const { flags } = classifyCodexEvents(events, boundModel);
      const payload = events.length === 1
        ? events[0]
        : { format: 'jsonl', events };

      return {
        outcome: 'SUCCESS',
        outputs: [{ inline_payload: payload }],
        flags,
        exit_code: proc.exit_code
      };
    }
  });
}
