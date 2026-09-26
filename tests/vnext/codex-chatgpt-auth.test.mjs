// MAWS vNext — Codex ChatGPT auth controller tests (§36 matrix).
//
// Boundaries: no network, no real codex binary, no auth.json access. All
// codex child processes are injected fakes dispatched by argv. Negative
// fixtures prove: stored status != healthy auth, stale classification,
// healthy sessions are never re-logged-in, login is explicit-only and
// single-attempt, and OPENROUTER/OPENAI/TYPESAFE credentials never reach a
// Codex child even when present in the parent environment.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  classifyLoginStatusText,
  codexAuthExitCode,
  collectAgentMessagesFromCodexPayload,
  createCodexChatGptAuthController,
  isAuthClassFailureDetail
} from '../../runtime/auth/codex-chatgpt-auth.mjs';

const HELP_WITH_DEVICE = [
  'Manage login',
  'Usage: codex login [OPTIONS] [COMMAND]',
  'Options:',
  '      --with-api-key',
  '      --device-auth'
].join('\n');

const HELP_WITHOUT_DEVICE = [
  'Manage login',
  'Usage: codex login [OPTIONS] [COMMAND]',
  'Options:',
  '      --with-api-key'
].join('\n');

function jsonlLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function healthSuccessStream() {
  return jsonlLine({ type: 'item.completed', item: { type: 'agent_message', text: 'MAWS CODEX AUTH HEALTH PASS' } });
}

function turnFailedStream(message) {
  return jsonlLine({ type: 'turn.failed', error: { message } });
}

function createFakeChild({ stdoutText = '', stderrText = '', exitCode = 0, closeOnKillOnly = false } = {}) {
  const child = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), {
    write: () => true,
    end() {
      child.stdin.emit('close');
    }
  });
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    queueMicrotask(() => child.emit('close', null));
    return true;
  };
  if (!closeOnKillOnly) {
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(stdoutText, 'utf8'));
      child.stderr.emit('data', Buffer.from(stderrText, 'utf8'));
      child.emit('close', exitCode);
    });
  }
  return child;
}

/**
 * Dispatching fake codex spawn. Status texts are consumed per
 * `login status` invocation (last entry repeats), so tests can script the
 * pre-login / post-login truth. exec responses are served per `exec`
 * invocation in order (last repeats).
 */
function makeAuthSpawn({
  statusScript = ['Logged in using ChatGPT'],
  helpText = HELP_WITH_DEVICE,
  execResponses = [healthSuccessStream()],
  loginResponse = { exitCode: 0 }
} = {}) {
  const calls = [];
  const statusQueue = [...statusScript];
  const execQueue = [...execResponses];
  const impl = (command, args, options) => {
    const child = (() => {
      if (args[0] === '--version') {
        return createFakeChild({ stdoutText: 'codex-cli 0.157.0\n' });
      }
      if (args[0] === 'login' && args[1] === 'status') {
        const text = statusQueue.length > 1 ? statusQueue.shift() : statusQueue[0];
        return createFakeChild({ stdoutText: `${text}\n` });
      }
      if (args[0] === 'login' && args[1] === '--help') {
        return createFakeChild({ stdoutText: `${helpText}\n` });
      }
      if (args[0] === 'exec') {
        const response = execQueue.length > 1 ? execQueue.shift() : execQueue[0];
        return createFakeChild({ stdoutText: response, exitCode: response.exitCode ?? 0 });
      }
      if (args[0] === 'login') {
        // Interactive login child: stdio inherit — no stdout/stderr capture.
        return createFakeChild({ exitCode: loginResponse.exitCode, closeOnKillOnly: loginResponse.hang === true });
      }
      return createFakeChild({ exitCode: 1, stderrText: 'unexpected argv' });
    })();
    calls.push({ command, args, options, child });
    return child;
  };
  impl.calls = calls;
  impl.loginInvocations = () => calls.filter(({ args }) => args[0] === 'login' && args[1] !== 'status' && args[1] !== '--help');
  return impl;
}

function makeController(spawn, overrides = {}) {
  return createCodexChatGptAuthController({
    env: {
      PATH: '/usr/bin',
      HOME: '/home/tester',
      CODEX_HOME: '/home/tester/.codex',
      OPENROUTER_API_KEY: 'or-secret-material-do-not-leak',
      OPENAI_API_KEY: 'oa-secret-material',
      TYPESAFE_API_KEY: 'ts-secret-material'
    },
    spawnImpl: spawn,
    isInteractive: () => true,
    ...overrides
  });
}

// --- unit classification ----------------------------------------------------

test('classifyLoginStatusText normalizes the supported codex status outputs', () => {
  assert.deepEqual(classifyLoginStatusText('Logged in using ChatGPT'), { login_status: 'chatgpt', auth_mode: 'chatgpt' });
  assert.deepEqual(classifyLoginStatusText('Logged in using an API key'), { login_status: 'api_key', auth_mode: 'api_key' });
  assert.deepEqual(classifyLoginStatusText('Not logged in'), { login_status: 'not_logged_in', auth_mode: null });
  assert.deepEqual(classifyLoginStatusText('Logged in via enterprise SSO'), { login_status: 'other', auth_mode: 'other' });
  assert.deepEqual(classifyLoginStatusText(''), { login_status: 'unknown', auth_mode: null });
});

test('isAuthClassFailureDetail detects auth signatures only', () => {
  assert.equal(isAuthClassFailureDetail('stream error: unexpected status 401 Unauthorized'), true);
  assert.equal(isAuthClassFailureDetail('token expired; reauthentication required'), true);
  assert.equal(isAuthClassFailureDetail('refresh token is no longer valid'), true);
  assert.equal(isAuthClassFailureDetail('authentication required before continuing'), true);
  assert.equal(isAuthClassFailureDetail('sandbox violation while writing file'), false);
  assert.equal(isAuthClassFailureDetail('model quota exceeded'), false);
  assert.equal(isAuthClassFailureDetail(''), false);
});

test('collectAgentMessagesFromCodexPayload extracts agent_message texts', () => {
  const payload = {
    format: 'jsonl',
    events: [
      { type: 'item.completed', item: { type: 'agent_message', text: 'first' } },
      { type: 'item.completed', item: { type: 'reasoning', text: 'ignored' } },
      { type: 'item.completed', item: { type: 'agent_message', text: 'second' } }
    ]
  };
  assert.deepEqual(collectAgentMessagesFromCodexPayload(payload), ['first', 'second']);
  assert.deepEqual(collectAgentMessagesFromCodexPayload(null), []);
});

test('codexAuthExitCode maps states onto the CLI exit contract', () => {
  assert.equal(codexAuthExitCode('AUTH_HEALTHY'), 0);
  assert.equal(codexAuthExitCode('AUTHENTICATED'), 0);
  assert.equal(codexAuthExitCode('NOT_LOGGED_IN'), 2);
  assert.equal(codexAuthExitCode('WRONG_AUTH_MODE'), 2);
  assert.equal(codexAuthExitCode('AUTH_INTERACTION_REQUIRED'), 2);
  assert.equal(codexAuthExitCode('AUTH_STALE'), 3);
  assert.equal(codexAuthExitCode('LOGIN_FAILED'), 3);
  assert.equal(codexAuthExitCode('CODEX_UNAVAILABLE'), 4);
  assert.equal(codexAuthExitCode('UNKNOWN'), 4);
  assert.equal(codexAuthExitCode('CHATGPT_STATUS_PRESENT'), 4);
});

// --- inspection -------------------------------------------------------------

test('missing codex binary yields CODEX_UNAVAILABLE without any status probe', async () => {
  const spawn = { calls: [], impl: null };
  spawn.impl = (command, args, options) => {
    spawn.calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { write: () => true, end: () => {} });
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    queueMicrotask(() => child.emit('error', Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' })));
    return child;
  };
  const controller = makeController(spawn.impl);
  const receipt = await controller.verifyAuthHealth();
  assert.equal(receipt.auth_status, 'CODEX_UNAVAILABLE');
  assert.equal(receipt.health_probe, 'NOT_RUN');
  assert.equal(receipt.error_class, 'CODEX_AUTH_ENVIRONMENT_FAILURE');
  assert.equal(receipt.codex_available, false);
  // Only the --version probe ran before failing closed.
  assert.deepEqual(spawn.calls.map(({ args }) => args[0]), ['--version']);
});

test('not logged in yields NOT_LOGGED_IN with health NOT_RUN and no probe execution', async () => {
  const spawn = makeAuthSpawn({ statusScript: ['Not logged in'] });
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'NOT_LOGGED_IN');
  assert.equal(receipt.error_class, 'CODEX_AUTH_NOT_LOGGED_IN');
  assert.equal(receipt.health_probe, 'NOT_RUN');
  assert.equal(receipt.interaction_required, true);
  assert.equal(spawn.calls.some(({ args }) => args[0] === 'exec'), false);
});

test('wrong auth mode (API key login) is rejected without silent acceptance or conversion', async () => {
  const spawn = makeAuthSpawn({ statusScript: ['Logged in using an API key'] });
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'WRONG_AUTH_MODE');
  assert.equal(receipt.error_class, 'CODEX_AUTH_WRONG_MODE');
  assert.equal(receipt.auth_mode, 'api_key');
  assert.equal(receipt.health_probe, 'NOT_RUN');
  assert.equal(spawn.calls.some(({ args }) => args[0] === 'exec'), false);
  assert.equal(spawn.loginInvocations().length, 0);
});

test('status probe timeout yields UNKNOWN with CODEX_AUTH_TIMEOUT', async () => {
  const spawn = makeAuthSpawn({ statusScript: ['Logged in using ChatGPT'] });
  // Make only the status child hang until killed.
  const originalImpl = spawn;
  const hanging = (command, args, options) => {
    if (args[0] === 'login' && args[1] === 'status') {
      const child = createFakeChild({ closeOnKillOnly: true });
      originalImpl.calls.push({ command, args, options, child });
      return child;
    }
    return originalImpl(command, args, options);
  };
  const controller = createCodexChatGptAuthController({
    env: { PATH: '/usr/bin', HOME: '/home/tester' },
    spawnImpl: hanging,
    statusTimeoutMs: 40
  });
  const receipt = await controller.verifyAuthHealth();
  assert.equal(receipt.auth_status, 'UNKNOWN');
  assert.equal(receipt.error_class, 'CODEX_AUTH_TIMEOUT');
});

// --- health verification ------------------------------------------------------

test('ChatGPT status + live probe PASS upgrades to AUTH_HEALTHY (status alone is not health)', async () => {
  const spawn = makeAuthSpawn();
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'AUTH_HEALTHY');
  assert.equal(receipt.health_probe, 'PASS');
  assert.equal(receipt.error_class, null);
  assert.equal(receipt.phrase_observed, true);
  assert.equal(receipt.auth_class, 'chatgpt_oauth');
  assert.equal(receipt.billing_class, 'chatgpt_plan');
  assert.equal(receipt.login_invoked, false);
  // The live probe ran read-only sandboxed through the executor.
  const execCall = spawn.calls.find(({ args }) => args[0] === 'exec');
  assert.ok(execCall);
  assert.deepEqual(execCall.args, ['exec', '--json', '--sandbox', 'read-only', '-']);
});

test('MANDATORY stale fixture: ChatGPT status present + live 401 => AUTH_STALE, not AUTH_HEALTHY', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Logged in using ChatGPT'],
    execResponses: [turnFailedStream('stream error: unexpected status 401 Unauthorized')]
  });
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'AUTH_STALE');
  assert.equal(receipt.error_class, 'CODEX_AUTH_STALE');
  assert.equal(receipt.health_probe, 'FAIL');
  assert.equal(receipt.interaction_required, true);
});

test('token-expired-class live failure also classifies AUTH_STALE', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Logged in using ChatGPT'],
    execResponses: [turnFailedStream('token expired; the session must reauthenticate')]
  });
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'AUTH_STALE');
  assert.equal(receipt.error_class, 'CODEX_AUTH_STALE');
});

test('non-auth live failure stays CODEX_AUTH_HEALTH_PROBE_FAILED, never AUTH_STALE', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Logged in using ChatGPT'],
    execResponses: [turnFailedStream('workspace routing error: sandbox policy rejected the write')]
  });
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'CHATGPT_STATUS_PRESENT');
  assert.equal(receipt.error_class, 'CODEX_AUTH_HEALTH_PROBE_FAILED');
  assert.equal(receipt.interaction_required, false);
});

test('successful probe without the expected phrase fails the health check', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Logged in using ChatGPT'],
    execResponses: [jsonlLine({ type: 'item.completed', item: { type: 'agent_message', text: 'hello there' } })]
  });
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'CHATGPT_STATUS_PRESENT');
  assert.equal(receipt.health_probe, 'FAIL');
  assert.equal(receipt.reason, 'EXPECTED_AGENT_MESSAGE_MISSING');
});

// --- secret isolation (§26/§27) ----------------------------------------------

test('OPENROUTER/OPENAI/TYPESAFE keys stay in the parent and never reach a Codex child', async () => {
  const spawn = makeAuthSpawn();
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'AUTH_HEALTHY');
  assert.ok(spawn.calls.length > 0);
  for (const { options } of spawn.calls) {
    const env = options?.env ?? {};
    assert.deepEqual(Object.keys(env).sort(), ['CODEX_HOME', 'HOME', 'PATH']);
    assert.equal('OPENROUTER_API_KEY' in env, false);
    assert.equal('OPENAI_API_KEY' in env, false);
    assert.equal('TYPESAFE_API_KEY' in env, false);
  }
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('or-secret-material'), false);
  assert.equal(serialized.includes('oa-secret-material'), false);
  assert.equal(serialized.includes('ts-secret-material'), false);
});

test('auth receipts never carry OAuth-shaped state', async () => {
  const spawn = makeAuthSpawn();
  const receipt = await makeController(spawn).verifyAuthHealth();
  const serialized = JSON.stringify(receipt).toLowerCase();
  assert.equal(serialized.includes('token'), false);
  assert.equal(serialized.includes('auth.json'), false);
  assert.equal(serialized.includes('account'), false);
  assert.equal(serialized.includes('email'), false);
});

// --- healthy session / check never logs in ------------------------------------

test('MANDATORY healthy-session fixture: healthy auth never invokes login', async () => {
  const spawn = makeAuthSpawn();
  const outcome = await makeController(spawn).requestLogin();
  assert.equal(outcome.state, 'AUTH_HEALTHY');
  assert.equal(outcome.login_invoked, false);
  assert.equal(spawn.loginInvocations().length, 0);
});

test('verifyAuthHealth (check path) never invokes login even when login is required', async () => {
  const spawn = makeAuthSpawn({ statusScript: ['Not logged in'] });
  const receipt = await makeController(spawn).verifyAuthHealth();
  assert.equal(receipt.auth_status, 'NOT_LOGGED_IN');
  assert.equal(spawn.loginInvocations().length, 0);
  const staleSpawn = makeAuthSpawn({
    statusScript: ['Logged in using ChatGPT'],
    execResponses: [turnFailedStream('401 Unauthorized')]
  });
  const staleReceipt = await makeController(staleSpawn).verifyAuthHealth();
  assert.equal(staleReceipt.auth_status, 'AUTH_STALE');
  assert.equal(staleSpawn.loginInvocations().length, 0);
});

// --- explicit login -------------------------------------------------------------

test('login command success + stored ChatGPT + health PASS => AUTHENTICATED', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Not logged in', 'Logged in using ChatGPT', 'Logged in using ChatGPT'],
    loginResponse: { exitCode: 0 }
  });
  const outcome = await makeController(spawn).requestLogin();
  assert.equal(outcome.state, 'AUTHENTICATED');
  assert.equal(outcome.login_invoked, true);
  assert.equal(outcome.login_method, 'interactive');
  assert.equal(outcome.post_login_status, 'chatgpt');
  assert.equal(outcome.receipt.auth_status, 'AUTH_HEALTHY');
  assert.equal(spawn.loginInvocations().length, 1);
});

test('login command success + health FAIL => not AUTHENTICATED (stale remains stale)', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Not logged in', 'Logged in using ChatGPT', 'Logged in using ChatGPT'],
    execResponses: [turnFailedStream('unexpected status 401 Unauthorized')],
    loginResponse: { exitCode: 0 }
  });
  const outcome = await makeController(spawn).requestLogin();
  assert.equal(outcome.state, 'AUTH_STALE');
  assert.equal(outcome.login_invoked, true);
  assert.equal(outcome.error_class, 'CODEX_AUTH_STALE');
});

test('login command failure preserves post-login truth (re-observed status, no assumptions)', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Logged in using ChatGPT', 'Not logged in'],
    execResponses: [turnFailedStream('401 Unauthorized')],
    loginResponse: { exitCode: 1 }
  });
  const outcome = await makeController(spawn).requestLogin();
  assert.equal(outcome.state, 'LOGIN_FAILED');
  assert.equal(outcome.error_class, 'CODEX_AUTH_LOGIN_FAILED');
  assert.equal(outcome.login_invoked, true);
  assert.equal(outcome.post_login_status, 'not_logged_in');
  assert.equal(spawn.loginInvocations().length, 1);
});

test('login timeout yields LOGIN_FAILED with CODEX_AUTH_TIMEOUT and no retry', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Not logged in'],
    loginResponse: { exitCode: 0, hang: true }
  });
  const controller = makeController(spawn, { loginTimeoutMs: 60 });
  const outcome = await controller.requestLogin();
  assert.equal(outcome.state, 'LOGIN_FAILED');
  assert.equal(outcome.error_class, 'CODEX_AUTH_TIMEOUT');
  assert.equal(outcome.login_invoked, true);
  // Exactly one attempt — no retry loop.
  assert.equal(spawn.loginInvocations().length, 1);
});

test('device auth supported: --device maps to the official codex login --device-auth', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Not logged in', 'Logged in using ChatGPT', 'Logged in using ChatGPT'],
    helpText: HELP_WITH_DEVICE,
    loginResponse: { exitCode: 0 }
  });
  const outcome = await makeController(spawn).requestLogin({ device: true });
  assert.equal(outcome.state, 'AUTHENTICATED');
  assert.equal(outcome.login_method, 'device');
  const invocations = spawn.loginInvocations();
  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0].args, ['login', '--device-auth']);
});

test('device auth unsupported: request is refused without any login invocation', async () => {
  const spawn = makeAuthSpawn({
    statusScript: ['Not logged in'],
    helpText: HELP_WITHOUT_DEVICE
  });
  const outcome = await makeController(spawn).requestLogin({ device: true });
  assert.equal(outcome.state, 'AUTH_INTERACTION_REQUIRED');
  assert.equal(outcome.error_class, 'CODEX_AUTH_DEVICE_AUTH_UNSUPPORTED');
  assert.equal(outcome.login_invoked, false);
  assert.equal(spawn.loginInvocations().length, 0);
});

test('headless interactive login is refused with AUTH_INTERACTION_REQUIRED', async () => {
  const spawn = makeAuthSpawn({ statusScript: ['Not logged in'] });
  const controller = makeController(spawn, { isInteractive: () => false });
  const outcome = await controller.requestLogin();
  assert.equal(outcome.state, 'AUTH_INTERACTION_REQUIRED');
  assert.equal(outcome.error_class, 'CODEX_AUTH_INTERACTION_REQUIRED');
  assert.equal(outcome.login_invoked, false);
  assert.equal(spawn.loginInvocations().length, 0);
});
