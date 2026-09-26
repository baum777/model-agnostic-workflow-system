// MAWS vNext — Codex ChatGPT OAuth auth controller (runtime-only).
//
// Responsibility (nothing more): discover, classify, verify, request-login,
// reverify. Codex owns the OAuth protocol, the credential store
// (~/.codex/auth.json is private Codex implementation state and is NEVER
// read, copied, hashed, or parsed here), and the token lifecycle. MAWS owns
// only auth health classification. Authentication is NOT authority: no state
// produced here creates filesystem, network, shell, deployment, scope,
// capability, or authority grants.
//
// Critical invariant (encoded below): `codex login status` reporting
// "Logged in using ChatGPT" (CHATGPT_STATUS_PRESENT) does NOT imply usable
// authenticated execution. Only the read-only live health probe through the
// real executor upgrades the state to AUTH_HEALTHY; an auth-class live
// failure downgrades it to AUTH_STALE instead of EXECUTOR_FAILURE.
//
// Safety rules:
// - never auto-logout, never delete auth state, never touch a healthy session;
// - login is explicit-only (requestLogin), exactly one attempt per call;
// - activation/check paths never trigger OAuth interaction;
// - the interactive login child runs with stdio 'inherit' so MAWS never
//   captures, echoes, or persists OAuth credentials;
// - child env is allowlisted (PATH/HOME/CODEX_HOME); OPENROUTER_API_KEY,
//   OPENAI_API_KEY, and TYPESAFE_API_KEY never reach a Codex child.
import { spawn as defaultSpawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCodexExecutor } from '../executors/codex-executor.mjs';
import { runLocalProcess } from '../transports/local-process.mjs';
import { FailClosedError, nowIso } from '../vnext/util.mjs';

export const CODEX_AUTH_STATES = Object.freeze([
  'UNKNOWN',
  'CODEX_UNAVAILABLE',
  'NOT_LOGGED_IN',
  'WRONG_AUTH_MODE',
  'CHATGPT_STATUS_PRESENT',
  'AUTH_HEALTHY',
  'AUTH_STALE',
  'AUTH_INTERACTION_REQUIRED',
  'LOGIN_IN_PROGRESS',
  'LOGIN_FAILED',
  'AUTHENTICATED'
]);

export const CODEX_AUTH_HEALTH_PHRASE = 'MAWS CODEX AUTH HEALTH PASS';

const CODEX_ENV_KEYS = ['PATH', 'HOME', 'CODEX_HOME'];
const LOGIN_GRACE_MS = 5000;
const DEFAULT_VERSION_TIMEOUT_MS = 5000;
const DEFAULT_STATUS_TIMEOUT_MS = 15000;
const DEFAULT_LOGIN_HELP_TIMEOUT_MS = 10000;
const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 120000;
const DEFAULT_LOGIN_TIMEOUT_MS = 600000;

// Auth-class failure signatures observed from live Codex turn failures
// (401s, token expiry, revoked refresh). Conservative on purpose: transport
// noise that matches none of these stays a health-probe failure, not AUTH_STALE.
const AUTH_CLASS_FAILURE_PATTERNS = [
  /\b401\b/,
  /\bunauthorized\b/i,
  /token\s+expired/i,
  /expired\s+token/i,
  /refresh\s+token/i,
  /authentication\s+required/i,
  /not\s+authenticated/i,
  /session\s+expired/i
];

function repoRootFromModule() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function allowlistedEnv(sourceEnv) {
  const childEnv = {};
  if (sourceEnv !== null && typeof sourceEnv === 'object') {
    for (const name of CODEX_ENV_KEYS) {
      if (typeof sourceEnv[name] === 'string') {
        childEnv[name] = sourceEnv[name];
      }
    }
  }
  return childEnv;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalize `codex login status` output text into a status token.
 * Text-first classification (the CLI's exit code is not a stable contract);
 * unrecognized output classifies as 'unknown' rather than guessing.
 */
export function classifyLoginStatusText(text) {
  const combined = typeof text === 'string' ? text : '';
  if (/not\s+logged\s+in/i.test(combined)) {
    return { login_status: 'not_logged_in', auth_mode: null };
  }
  if (/logged\s+in\s+using\s+chatgpt/i.test(combined)) {
    return { login_status: 'chatgpt', auth_mode: 'chatgpt' };
  }
  if (/logged\s+in\s+using\s+an\s+api\s+key/i.test(combined)) {
    return { login_status: 'api_key', auth_mode: 'api_key' };
  }
  if (/logged\s+in/i.test(combined)) {
    return { login_status: 'other', auth_mode: 'other' };
  }
  return { login_status: 'unknown', auth_mode: null };
}

/**
 * True when an executor failure detail is authentication-class (stale
 * session evidence) rather than a transport/implementation failure.
 */
export function isAuthClassFailureDetail(detail) {
  if (typeof detail !== 'string' || detail.length === 0) {
    return false;
  }
  return AUTH_CLASS_FAILURE_PATTERNS.some((pattern) => pattern.test(detail));
}

/**
 * Collect agent message texts from a Codex executor payload (single event or
 * { format: 'jsonl', events }) for expected-phrase verification.
 */
export function collectAgentMessagesFromCodexPayload(payload) {
  if (!isPlainObject(payload)) {
    return [];
  }
  const events = Array.isArray(payload.events) ? payload.events : [payload];
  const messages = [];
  for (const event of events) {
    if (isPlainObject(event) && isPlainObject(event.item)
      && event.item.type === 'agent_message' && typeof event.item.text === 'string') {
      messages.push(event.item.text);
    }
  }
  return messages;
}

/**
 * Map a controller state onto the CLI exit contract:
 *   0 = AUTH_HEALTHY | AUTHENTICATED
 *   2 = user authentication required
 *   3 = stale/invalid authentication
 *   4 = environment/executor failure
 */
export function codexAuthExitCode(state) {
  if (state === 'AUTH_HEALTHY' || state === 'AUTHENTICATED') {
    return 0;
  }
  if (state === 'NOT_LOGGED_IN' || state === 'WRONG_AUTH_MODE' || state === 'AUTH_INTERACTION_REQUIRED') {
    return 2;
  }
  if (state === 'AUTH_STALE' || state === 'LOGIN_FAILED') {
    return 3;
  }
  return 4;
}

function stateRequiresLogin(state) {
  return state === 'NOT_LOGGED_IN' || state === 'WRONG_AUTH_MODE'
    || state === 'AUTH_STALE' || state === 'AUTH_INTERACTION_REQUIRED';
}

function healthInvocation(timeoutMs) {
  return {
    work_unit_id: 'wu_codex_auth_health',
    node_id: 'node_codex_auth_health',
    context_package: {
      objective: `Return the exact phrase: ${CODEX_AUTH_HEALTH_PHRASE}. Do not modify files. Do not inspect secrets. Do not invoke unrelated tools.`,
      bounded_payload: { auth_health_probe: true, mutation_allowed: false },
      provenance_refs: ['MAWS_VNEXT_CODEX_AUTH_HEALTH']
    },
    authority_envelope: {
      scope_ref: 'scope_codex_auth_health_readonly',
      allowed_effects: ['ephemeral']
    },
    timeout_ms: timeoutMs
  };
}

/**
 * Spawn the official Codex login with stdio inherited so the OAuth flow
 * talks directly to the owner's terminal. MAWS never captures, echoes,
 * filters, or persists login output. Timeout kills the process (SIGTERM,
 * then SIGKILL after grace) — that state is reported, never retried here.
 */
function runInteractiveLogin({ command, args, env, cwd, timeoutMs, spawnImpl = defaultSpawn }) {
  return new Promise((resolve) => {
    const child = spawnImpl(command, args, {
      cwd,
      env,
      stdio: ['inherit', 'inherit', 'inherit'],
      shell: false
    });
    let timedOut = false;
    let settled = false;
    let killTimer = null;
    const killWithGrace = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // Already gone; 'close' governs.
      }
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already gone.
        }
      }, LOGIN_GRACE_MS);
    };
    const settle = (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      if (killTimer !== null) {
        clearTimeout(killTimer);
      }
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
      }
      resolve({ exit_code: typeof exitCode === 'number' ? exitCode : null, timed_out: timedOut });
    };
    let timeoutTimer = null;
    if (Number.isInteger(timeoutMs) && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        killWithGrace();
      }, timeoutMs);
    }
    child.on('error', () => settle(null));
    child.on('close', (code) => settle(code));
  });
}

/**
 * Create the Codex ChatGPT auth controller.
 *
 * @param {object} options
 * @param {Object} [options.env]                      - environment source (default process.env)
 * @param {string} [options.cwd]                      - working directory (default repo root)
 * @param {Function} [options.spawnImpl]              - injectable spawn for tests
 * @param {Function} [options.now]                    - injectable clock (default nowIso)
 * @param {Function} [options.isInteractive]          - injectable TTY detection (default process.stdout.isTTY)
 * @param {Function} [options.healthExecutorFactory]  - injectable executor factory for the live probe
 * @param {number} [options.versionTimeoutMs]
 * @param {number} [options.statusTimeoutMs]
 * @param {number} [options.loginHelpTimeoutMs]
 * @param {number} [options.healthProbeTimeoutMs]
 * @param {number} [options.loginTimeoutMs]
 * @returns {{ inspectAuth(): Promise<object>, verifyAuthHealth(): Promise<object>, requestLogin(options?: {device?: boolean}): Promise<object> }}
 */
export function createCodexChatGptAuthController({
  env = process.env,
  cwd,
  spawnImpl,
  now = nowIso,
  isInteractive = () => process.stdout.isTTY === true,
  healthExecutorFactory,
  versionTimeoutMs = DEFAULT_VERSION_TIMEOUT_MS,
  statusTimeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
  loginHelpTimeoutMs = DEFAULT_LOGIN_HELP_TIMEOUT_MS,
  healthProbeTimeoutMs = DEFAULT_HEALTH_PROBE_TIMEOUT_MS,
  loginTimeoutMs = DEFAULT_LOGIN_TIMEOUT_MS
} = {}) {
  const workingDir = cwd ?? repoRootFromModule();
  const childEnv = allowlistedEnv(env);

  async function probe(args, timeoutMs) {
    return runLocalProcess({
      command: 'codex',
      args,
      cwd: workingDir,
      env: childEnv,
      timeoutMs,
      spawnImpl
    });
  }

  async function probeVersion() {
    try {
      const proc = await probe(['--version'], versionTimeoutMs);
      if (proc.timed_out || proc.cancelled) {
        return { available: false, version: null, timed_out: proc.timed_out };
      }
      const match = /codex-cli\s+(\S+)/.exec(proc.stdout);
      return { available: true, version: match ? match[1] : proc.stdout.trim() || null };
    } catch {
      return { available: false, version: null, timed_out: false };
    }
  }

  async function probeLoginStatus() {
    try {
      const proc = await probe(['login', 'status'], statusTimeoutMs);
      if (proc.timed_out) {
        return { login_status: 'unknown', auth_mode: null, timed_out: true };
      }
      const classified = classifyLoginStatusText(`${proc.stdout}\n${proc.stderr}`);
      return { ...classified, timed_out: false };
    } catch {
      return { login_status: 'unknown', auth_mode: null, timed_out: false };
    }
  }

  async function probeLoginInterface() {
    try {
      const proc = await probe(['login', '--help'], loginHelpTimeoutMs);
      if (proc.timed_out || proc.cancelled || (proc.exit_code !== 0)) {
        return { interactive: false, device_auth: false };
      }
      const text = `${proc.stdout}\n${proc.stderr}`;
      return { interactive: true, device_auth: /--device-auth/.test(text) };
    } catch {
      return { interactive: false, device_auth: false };
    }
  }

  function classifyInspection(version, status, loginInterface) {
    if (!version.available) {
      return {
        state: 'CODEX_UNAVAILABLE',
        error_class: version.timed_out ? 'CODEX_AUTH_TIMEOUT' : 'CODEX_AUTH_ENVIRONMENT_FAILURE'
      };
    }
    if (status.timed_out) {
      return { state: 'UNKNOWN', error_class: 'CODEX_AUTH_TIMEOUT' };
    }
    switch (status.login_status) {
      case 'chatgpt':
        return { state: 'CHATGPT_STATUS_PRESENT', error_class: null };
      case 'api_key':
        // exec_codex_chatgpt requires ChatGPT OAuth; an API-key login is a
        // wrong auth mode — never silently accepted, never auto-converted.
        return { state: 'WRONG_AUTH_MODE', error_class: 'CODEX_AUTH_WRONG_MODE' };
      case 'not_logged_in':
        return { state: 'NOT_LOGGED_IN', error_class: 'CODEX_AUTH_NOT_LOGGED_IN' };
      case 'other':
        return { state: 'WRONG_AUTH_MODE', error_class: 'CODEX_AUTH_WRONG_MODE' };
      default:
        return { state: 'UNKNOWN', error_class: 'CODEX_AUTH_STATUS_UNKNOWN' };
    }
  }

  /** Discovery + classification only. Never probes live and never logs in. */
  async function inspectAuth() {
    const version = await probeVersion();
    const status = version.available ? await probeLoginStatus() : { login_status: 'unknown', auth_mode: null, timed_out: false };
    const loginInterface = version.available ? await probeLoginInterface() : { interactive: false, device_auth: false };
    const classified = classifyInspection(version, status, loginInterface);
    return Object.freeze({
      state: classified.state,
      error_class: classified.error_class,
      codex_available: version.available,
      codex_version: version.version,
      login_status: status.login_status,
      auth_mode: status.auth_mode,
      login_interface: loginInterface,
      interaction_required: stateRequiresLogin(classified.state),
      inspected_at: now()
    });
  }

  function baseReceipt(inspection, extra = {}) {
    // Runtime-only receipt (no core/contracts schema): auth health facts
    // only — never tokens, account ids, emails, or OAuth URLs/state.
    return Object.freeze({
      schema: 'maws.codex-auth-health.v1',
      auth_status: inspection.state,
      auth_mode: inspection.auth_mode,
      codex_available: inspection.codex_available,
      login_status: inspection.login_status,
      executor_id: 'exec_codex_chatgpt',
      auth_class: 'chatgpt_oauth',
      billing_class: 'chatgpt_plan',
      codex_version: inspection.codex_version,
      health_probe: 'NOT_RUN',
      login_invoked: false,
      verified_at: now(),
      error_class: inspection.error_class,
      ...extra
    });
  }

  /**
   * Authoritative authentication check: stored-status inspection followed by
   * a real read-only Codex execution probe through the ChatGPT executor.
   * CHATGPT_STATUS_PRESENT + probe PASS => AUTH_HEALTHY;
   * CHATGPT_STATUS_PRESENT + auth-class probe failure => AUTH_STALE.
   */
  async function verifyAuthHealth() {
    const inspection = await inspectAuth();
    if (inspection.state !== 'CHATGPT_STATUS_PRESENT') {
      return baseReceipt(inspection, { interaction_required: inspection.interaction_required });
    }

    const executor = typeof healthExecutorFactory === 'function'
      ? healthExecutorFactory()
      : createCodexExecutor({ env, cwd: workingDir, authMode: 'chatgpt', sandbox: 'read-only', ...(spawnImpl ? { spawnImpl } : {}) });
    const result = await executor.execute(healthInvocation(healthProbeTimeoutMs));
    const outcome = result.outcome ?? 'FAILED';
    const flags = isPlainObject(result.flags) ? result.flags : {};
    const failureDetail = typeof flags.turn_failed_message === 'string' ? flags.turn_failed_message : '';
    const phraseObserved = outcome === 'SUCCESS'
      && collectAgentMessagesFromCodexPayload(result.outputs?.[0]?.inline_payload ?? null)
        .some((text) => text.includes(CODEX_AUTH_HEALTH_PHRASE));

    if (outcome === 'SUCCESS' && phraseObserved) {
      return baseReceipt(inspection, {
        auth_status: 'AUTH_HEALTHY',
        health_probe: 'PASS',
        probe_outcome: 'SUCCESS',
        phrase_observed: true,
        error_class: null
      });
    }

    const sanitizedProbe = {
      outcome,
      error_class: result.error_class ?? null,
      exit_code: typeof result.exit_code === 'number' ? result.exit_code : null,
      event_count: typeof flags.event_count === 'number' ? flags.event_count : null,
      turn_failed: typeof flags.turn_failed_message === 'string'
    };

    if (outcome === 'TIMEOUT') {
      return baseReceipt(inspection, {
        health_probe: 'FAIL',
        error_class: 'CODEX_AUTH_TIMEOUT',
        interaction_required: false,
        probe: sanitizedProbe
      });
    }
    if (outcome === 'CANCELLED') {
      return baseReceipt(inspection, {
        health_probe: 'FAIL',
        error_class: 'CODEX_AUTH_HEALTH_PROBE_FAILED',
        interaction_required: false,
        probe: sanitizedProbe
      });
    }
    if (isAuthClassFailureDetail(failureDetail)) {
      // Stored ChatGPT status present, but the live service rejected the
      // session: stale authentication, not an executor implementation bug.
      return baseReceipt(inspection, {
        auth_status: 'AUTH_STALE',
        health_probe: 'FAIL',
        error_class: 'CODEX_AUTH_STALE',
        interaction_required: true,
        probe: sanitizedProbe
      });
    }
    return baseReceipt(inspection, {
      health_probe: 'FAIL',
      error_class: 'CODEX_AUTH_HEALTH_PROBE_FAILED',
      interaction_required: false,
      probe: sanitizedProbe,
      ...(outcome === 'SUCCESS' ? { reason: 'EXPECTED_AGENT_MESSAGE_MISSING' } : {})
    });
  }

  /**
   * Explicit interactive login through the OFFICIAL Codex CLI flow. Never
   * invoked automatically by activation or check paths. A healthy session
   * short-circuits without touching auth state. Exactly one login attempt
   * per call; the outcome is re-observed (status + live probe), never assumed.
   */
  async function requestLogin({ device = false } = {}) {
    const before = await verifyAuthHealth();
    if (before.auth_status === 'AUTH_HEALTHY') {
      // A healthy user session must remain untouched.
      return Object.freeze({ state: 'AUTH_HEALTHY', login_invoked: false, receipt: before });
    }
    if (before.auth_status === 'CODEX_UNAVAILABLE') {
      return Object.freeze({
        state: 'CODEX_UNAVAILABLE',
        login_invoked: false,
        error_class: 'CODEX_AUTH_ENVIRONMENT_FAILURE',
        receipt: before
      });
    }

    const loginInterface = await probeLoginInterface();
    if (device && !loginInterface.device_auth) {
      return Object.freeze({
        state: 'AUTH_INTERACTION_REQUIRED',
        login_invoked: false,
        error_class: 'CODEX_AUTH_DEVICE_AUTH_UNSUPPORTED',
        receipt: before
      });
    }
    if (!device && typeof isInteractive === 'function' && isInteractive() !== true) {
      return Object.freeze({
        state: 'AUTH_INTERACTION_REQUIRED',
        login_invoked: false,
        error_class: 'CODEX_AUTH_INTERACTION_REQUIRED',
        receipt: before
      });
    }

    const loginArgs = ['login', ...(device ? ['--device-auth'] : [])];
    const loginResult = await runInteractiveLogin({
      command: 'codex',
      args: loginArgs,
      env: childEnv,
      cwd: workingDir,
      timeoutMs: loginTimeoutMs,
      spawnImpl
    });

    // Truth after the attempt is re-observed, never assumed (§24): the
    // stored status may have changed in either direction.
    const postStatus = await probeLoginStatus();
    if (loginResult.timed_out || loginResult.exit_code !== 0) {
      return Object.freeze({
        state: 'LOGIN_FAILED',
        login_invoked: true,
        login_method: device ? 'device' : 'interactive',
        error_class: loginResult.timed_out ? 'CODEX_AUTH_TIMEOUT' : 'CODEX_AUTH_LOGIN_FAILED',
        post_login_status: postStatus.login_status,
        receipt: before
      });
    }

    // Login command success is NOT sufficient: require stored ChatGPT
    // status AND a live health probe PASS before AUTHENTICATED.
    if (postStatus.login_status !== 'chatgpt') {
      return Object.freeze({
        state: 'LOGIN_FAILED',
        login_invoked: true,
        login_method: device ? 'device' : 'interactive',
        error_class: 'CODEX_AUTH_LOGIN_FAILED',
        post_login_status: postStatus.login_status,
        receipt: before
      });
    }
    const after = await verifyAuthHealth();
    if (after.auth_status === 'AUTH_HEALTHY') {
      return Object.freeze({
        state: 'AUTHENTICATED',
        login_invoked: true,
        login_method: device ? 'device' : 'interactive',
        post_login_status: postStatus.login_status,
        receipt: after,
        verified_at: after.verified_at
      });
    }
    return Object.freeze({
      state: after.auth_status === 'AUTH_STALE' ? 'AUTH_STALE' : 'LOGIN_FAILED',
      login_invoked: true,
      login_method: device ? 'device' : 'interactive',
      error_class: after.error_class ?? 'CODEX_AUTH_LOGIN_FAILED',
      post_login_status: postStatus.login_status,
      receipt: after
    });
  }

  if (!Number.isInteger(statusTimeoutMs) || statusTimeoutMs <= 0) {
    throw new FailClosedError('AUTH_CONTROLLER_INVALID', 'statusTimeoutMs must be a positive integer');
  }

  return Object.freeze({ inspectAuth, verifyAuthHealth, requestLogin });
}
