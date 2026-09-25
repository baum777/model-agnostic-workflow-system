// MAWS vNext Phase 4 tests — executor/transport layer (MAWS-VN-400..403).
//
// Boundaries: no network (fetch/spawn are injected fakes except one real
// child-process kill-path test), no listener/daemon, executors carry zero
// authority/qualification semantics.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { defineExecutor, normalizeProcessFailure } from '../../runtime/executors/executor-base.mjs';
import { createCodexExecutor } from '../../runtime/executors/codex-executor.mjs';
import { createOpenRouterExecutor } from '../../runtime/executors/openrouter-executor.mjs';
import { loadExecutorRegistry } from '../../runtime/executors/manifest-loader.mjs';
import { createExecutorRegistry } from '../../runtime/executors/registry.mjs';
import { runLocalProcess } from '../../runtime/transports/local-process.mjs';
import { createPermissionEngine } from '../../runtime/permissions/permission-engine.mjs';
import { FailClosedError } from '../../runtime/vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const TEST_API_KEY = 'test-openrouter-key-material-0123456789';

function makeInvocation(overrides = {}) {
  return {
    work_unit_id: 'wu_phase4_test',
    node_id: 'node_implement',
    context_package: {
      objective: 'Implement the bounded Phase 4 slice.',
      bounded_payload: { files: ['runtime/executors/executor-base.mjs'] },
      provenance_refs: ['docs/maws-vnext-owner-decisions.md']
    },
    authority_envelope: {
      scope_ref: 'scope_worktree_maws_vnext',
      allowed_effects: ['ephemeral', 'workspace']
    },
    timeout_ms: 5000,
    ...overrides
  };
}

function isFailClosedWithCode(code) {
  return (error) => {
    assert.ok(error instanceof FailClosedError, `expected FailClosedError, got ${error?.constructor?.name}`);
    assert.equal(error.code, code);
    return true;
  };
}

// ---------------------------------------------------------------------------
// Fake spawn infrastructure
// ---------------------------------------------------------------------------

/**
 * Fake child process. Modes:
 * - autoClose (default): emits stdout/stderr and 'close' asynchronously.
 * - closeOnKillOnly: stays alive; emits close only after kill() (used for
 *   timeout/abort paths).
 */
function createFakeChild({ stdoutText = '', stderrText = '', exitCode = 0, closeOnKillOnly = false } = {}) {
  const child = new EventEmitter();
  const stdinChunks = [];
  const kills = [];
  child.stdin = Object.assign(new EventEmitter(), {
    write(chunk) {
      stdinChunks.push(Buffer.from(chunk).toString('utf8'));
      return true;
    },
    end() {
      child.stdin.emit('close');
    }
  });
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = (signalName) => {
    kills.push(signalName);
    queueMicrotask(() => child.emit('close', null));
    return true;
  };
  child.__test = { stdinChunks, kills, stdoutText };
  if (!closeOnKillOnly) {
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(stdoutText, 'utf8'));
      child.stderr.emit('data', Buffer.from(stderrText, 'utf8'));
      child.emit('close', exitCode);
    });
  }
  return child;
}

function trackingSpawn(childFactory) {
  const calls = [];
  const impl = (command, args, options) => {
    const child = childFactory(command, args, options);
    calls.push({ command, args, options, child });
    return child;
  };
  impl.calls = calls;
  return impl;
}

function spawnErrorImpl(error) {
  return trackingSpawn(() => {
    const child = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { write: () => true, end: () => {} });
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    queueMicrotask(() => child.emit('error', error));
    return child;
  });
}

// ---------------------------------------------------------------------------
// Fake fetch infrastructure
// ---------------------------------------------------------------------------

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      if (body instanceof Error) {
        throw body;
      }
      return body;
    }
  };
}

function trackingFetch(handler) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return handler(calls.length - 1, url, init);
  };
  impl.calls = calls;
  return impl;
}

function openRouterSuccessBody({ model, content = 'analysis result', usage = {} } = {}) {
  return {
    model,
    choices: [{ message: { content } }],
    usage: {
      prompt_tokens: usage.prompt_tokens ?? 11,
      completion_tokens: usage.completion_tokens ?? 7,
      cost: usage.cost ?? 0.0012
    }
  };
}

// ---------------------------------------------------------------------------
// normalizeProcessFailure + defineExecutor contract
// ---------------------------------------------------------------------------

test('normalizeProcessFailure maps ENOENT, AbortError, and timeout fail-closed', () => {
  assert.deepEqual(
    normalizeProcessFailure(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' })),
    { outcome: 'FAILED', error_class: 'EXECUTOR_UNAVAILABLE' }
  );
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';
  assert.deepEqual(normalizeProcessFailure(abortError), { outcome: 'CANCELLED', error_class: 'EXECUTION_ABORTED' });
  assert.deepEqual(
    normalizeProcessFailure(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })),
    { outcome: 'TIMEOUT', error_class: 'EXECUTION_TIMEOUT' }
  );
  assert.deepEqual(normalizeProcessFailure(new Error('arbitrary')), { outcome: 'FAILED', error_class: 'EXECUTION_ERROR' });
  assert.deepEqual(normalizeProcessFailure(null), { outcome: 'FAILED', error_class: 'EXECUTION_ERROR' });
});

test('defineExecutor normalizes results, generates attempt ids, and defaults metrics', async () => {
  const executor = defineExecutor({
    executorId: 'exec_test_probe',
    executorClass: 'deterministic_service',
    transport: 'in_process',
    declaredCapabilities: ['cap_deterministic_verification'],
    execute: async () => ({ outcome: 'SUCCESS' })
  });
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.executor_id, 'exec_test_probe');
  assert.equal(result.work_unit_id, 'wu_phase4_test');
  assert.match(result.execution_attempt_id, /^execatt_/);
  assert.deepEqual(result.outputs, []);
  assert.deepEqual(Object.keys(result.metrics).sort(), ['cost_units', 'latency_ms', 'tokens_in', 'tokens_out']);
  assert.equal(result.error_class, null);
  assert.equal(result.exit_code, null);
  assert.ok(typeof result.started_at === 'string');
  assert.ok(typeof result.finished_at === 'string');
});

test('defineExecutor rejects invalid declarations and invocations fail closed', async () => {
  assert.throws(
    () => defineExecutor({ executorId: 'bad-id', executorClass: 'llm', transport: 'in_process', declaredCapabilities: ['cap_x'], execute: async () => ({}) }),
    isFailClosedWithCode('EXECUTOR_DECLARATION_INVALID')
  );
  assert.throws(
    () => defineExecutor({ executorId: 'exec_x', executorClass: 'not_a_class', transport: 'in_process', declaredCapabilities: ['cap_x'], execute: async () => ({}) }),
    isFailClosedWithCode('EXECUTOR_DECLARATION_INVALID')
  );
  const executor = defineExecutor({
    executorId: 'exec_test_probe',
    executorClass: 'deterministic_service',
    transport: 'in_process',
    declaredCapabilities: ['cap_deterministic_verification'],
    execute: async () => ({ outcome: 'SUCCESS' })
  });
  await assert.rejects(executor.execute({ ...makeInvocation(), work_unit_id: 'wrong-shape' }), isFailClosedWithCode('INVOCATION_INVALID'));
  await assert.rejects(
    executor.execute({ ...makeInvocation(), authority_envelope: { scope_ref: '', allowed_effects: [] } }),
    isFailClosedWithCode('INVOCATION_INVALID')
  );
});

test('defineExecutor propagates FailClosedError instead of swallowing it into a result', async () => {
  const executor = defineExecutor({
    executorId: 'exec_test_probe',
    executorClass: 'deterministic_service',
    transport: 'in_process',
    declaredCapabilities: ['cap_deterministic_verification'],
    execute: async () => {
      throw new FailClosedError('URL_HOST_NOT_ALLOWLISTED', 'host not allowlisted');
    }
  });
  await assert.rejects(executor.execute(makeInvocation()), isFailClosedWithCode('URL_HOST_NOT_ALLOWLISTED'));
});

test('defineExecutor toManifest produces a schema-valid manifest declaration', () => {
  const executor = defineExecutor({
    executorId: 'exec_test_probe',
    executorClass: 'deterministic_service',
    transport: 'in_process',
    declaredCapabilities: ['cap_deterministic_verification'],
    execute: async () => ({ outcome: 'SUCCESS' })
  });
  const issues = validateInstanceAgainstContract(executor.toManifest(), 'core/contracts/executor-manifest.schema.json', repoRoot);
  assert.deepEqual(issues, []);
  assert.equal(executor.toManifest().session_model_can_bind, false);
});

// ---------------------------------------------------------------------------
// Registry: loader + in-memory registry
// ---------------------------------------------------------------------------

test('default executor registry loads and is schema-valid against the registry contract', () => {
  const registry = loadExecutorRegistry();
  assert.equal(registry.registry_id, 'execreg_maws_default');
  assert.deepEqual(
    registry.executors.map((entry) => entry.executor_id),
    ['exec_codex_harness', 'exec_openrouter_glm', 'exec_local_tests', 'exec_human_gate']
  );
  const registryIssues = validateInstanceAgainstContract(registry, 'core/contracts/executor-registry.schema.json', repoRoot);
  assert.deepEqual(registryIssues, []);
  for (const manifest of registry.executors) {
    const manifestIssues = validateInstanceAgainstContract(manifest, 'core/contracts/executor-manifest.schema.json', repoRoot);
    assert.deepEqual(manifestIssues, [], `manifest ${manifest.executor_id} must be schema-valid`);
  }
  const glm = registry.executors.find((entry) => entry.executor_id === 'exec_openrouter_glm');
  assert.equal(glm.executor_class, 'llm');
  assert.equal(glm.transport, 'openrouter_api');
  assert.equal(glm.provider.model_id, 'zai/glm-4.7');
});

test('loadExecutorRegistry rejects duplicate executor ids and schema-invalid manifests fail closed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-vnext-registry-'));
  try {
    const validManifest = {
      executor_id: 'exec_dup_probe',
      executor_class: 'llm',
      declared_capabilities: [{ capability_id: 'cap_repository_analysis' }],
      transport: 'openrouter_api',
      session_model_can_bind: false
    };
    const duplicateRegistry = {
      registry_id: 'execreg_test_dup',
      version: '1',
      executors: [validManifest, { ...validManifest }]
    };
    const duplicatePath = path.join(tmpDir, 'duplicate.json');
    fs.writeFileSync(duplicatePath, JSON.stringify(duplicateRegistry));
    assert.throws(() => loadExecutorRegistry(duplicatePath, repoRoot), isFailClosedWithCode('EXECUTOR_DUPLICATE'));

    const invalidRegistry = {
      registry_id: 'execreg_test_invalid',
      executors: [{ ...validManifest, qualified: true }]
    };
    const invalidPath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(invalidPath, JSON.stringify(invalidRegistry));
    assert.throws(() => loadExecutorRegistry(invalidPath, repoRoot), isFailClosedWithCode('EXECUTOR_REGISTRY_SCHEMA_INVALID'));

    const malformedPath = path.join(tmpDir, 'malformed.json');
    fs.writeFileSync(malformedPath, '{not json');
    assert.throws(() => loadExecutorRegistry(malformedPath, repoRoot), isFailClosedWithCode('EXECUTOR_REGISTRY_INVALID'));

    assert.throws(() => loadExecutorRegistry(path.join(tmpDir, 'missing.json'), repoRoot), isFailClosedWithCode('EXECUTOR_REGISTRY_UNREADABLE'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createExecutorRegistry: get/list/findByCapability and fail-closed unknown lookup', () => {
  const registry = createExecutorRegistry(loadExecutorRegistry().executors);
  assert.equal(registry.get('exec_codex_harness').executor_class, 'agent_harness');
  assert.throws(() => registry.get('exec_does_not_exist'), isFailClosedWithCode('EXECUTOR_UNKNOWN'));
  assert.equal(registry.list().length, 4);
  assert.deepEqual(
    registry.findByCapability('cap_code_implementation').map((entry) => entry.executor_id),
    ['exec_codex_harness']
  );
  assert.deepEqual(
    registry.findByCapability('cap_deterministic_verification').map((entry) => entry.executor_id),
    ['exec_local_tests']
  );
  assert.deepEqual(registry.findByCapability('cap_unused_capability'), []);

  assert.throws(
    () => createExecutorRegistry(loadExecutorRegistry().executors.concat(registry.get('exec_codex_harness'))),
    isFailClosedWithCode('EXECUTOR_DUPLICATE')
  );
  assert.throws(() => createExecutorRegistry([]), isFailClosedWithCode('EXECUTOR_REGISTRY_INVALID'));
});

// ---------------------------------------------------------------------------
// Codex executor (fake spawn)
// ---------------------------------------------------------------------------

function makeCodexHarness(childOptions) {
  const spawnImpl = trackingSpawn(() => createFakeChild(childOptions));
  const executor = createCodexExecutor({
    spawnImpl,
    cwd: '/tmp/maws-vnext-test-cwd',
    env: { PATH: '/usr/bin', HOME: '/home/tester', MAWS_CODEX_MODEL: 'zai/glm-4.7' }
  });
  return { executor, spawnImpl };
}

test('codex executor: success path returns SUCCESS with parsed JSON output and bounded stdin', async () => {
  const payload = { status: 'completed', summary: 'slice implemented' };
  const { executor, spawnImpl } = makeCodexHarness({ stdoutText: JSON.stringify(payload), exitCode: 0 });
  const result = await executor.execute(makeInvocation({ timeout_ms: 2000 }));

  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.exit_code, 0);
  assert.equal(result.error_class, null);
  assert.equal(result.outputs.length, 1);
  assert.match(result.outputs[0].output_id, /^out_/);
  assert.deepEqual(result.outputs[0].inline_payload, payload);

  const spawnCall = spawnImpl.calls[0];
  assert.equal(spawnCall.command, 'codex');
  assert.deepEqual(spawnCall.args, [
    'exec', '--json',
    '-c', 'model_provider="openrouter"',
    '-c', 'model="zai/glm-4.7"',
    '-'
  ]);
  assert.equal(spawnCall.options.shell, false);
  assert.deepEqual(
    JSON.parse(spawnCall.child.__test.stdinChunks.join('')),
    makeInvocation({ timeout_ms: 2000 }).context_package
  );
  assert.ok(typeof result.metrics.latency_ms === 'number');
  assert.equal(result.metrics.cost_units, 0);
});

test('codex executor: ENOENT maps to FAILED / EXECUTOR_UNAVAILABLE', async () => {
  const executor = createCodexExecutor({
    spawnImpl: spawnErrorImpl(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' })),
    cwd: '/tmp/maws-vnext-test-cwd',
    model: 'zai/glm-4.7',
    env: {}
  });
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'EXECUTOR_UNAVAILABLE');
  assert.equal(result.exit_code, null);
});

test('codex executor: timeout maps to TIMEOUT and abort maps to CANCELLED', async () => {
  const timeoutHarness = makeCodexHarness({ closeOnKillOnly: true });
  const timeoutResult = await timeoutHarness.executor.execute(makeInvocation({ timeout_ms: 60 }));
  assert.equal(timeoutResult.outcome, 'TIMEOUT');
  assert.equal(timeoutResult.error_class, 'TIMEOUT');
  assert.equal(timeoutResult.exit_code, null);

  const abortController = new AbortController();
  const abortHarness = makeCodexHarness({ closeOnKillOnly: true });
  setTimeout(() => abortController.abort(), 30);
  const cancelledResult = await abortHarness.executor.execute(makeInvocation({ timeout_ms: 5000, signal: abortController.signal }));
  assert.equal(cancelledResult.outcome, 'CANCELLED');
  assert.equal(cancelledResult.error_class, 'CANCELLED');
  assert.equal(cancelledResult.exit_code, null);
});

test('codex executor: non-zero exit and invalid JSON output are typed failures', async () => {
  const nonZero = makeCodexHarness({ stdoutText: 'boom', exitCode: 3 });
  const nonZeroResult = await nonZero.executor.execute(makeInvocation());
  assert.equal(nonZeroResult.outcome, 'FAILED');
  assert.equal(nonZeroResult.error_class, 'NON_ZERO_EXIT');
  assert.equal(nonZeroResult.exit_code, 3);

  const invalidJson = makeCodexHarness({ stdoutText: 'not-json-at-all', exitCode: 0 });
  const invalidResult = await invalidJson.executor.execute(makeInvocation());
  assert.equal(invalidResult.outcome, 'FAILED');
  assert.equal(invalidResult.error_class, 'OUTPUT_INVALID');
  assert.equal(invalidResult.exit_code, 0);

  const emptyStdout = makeCodexHarness({ stdoutText: '', exitCode: 0 });
  const emptyResult = await emptyStdout.executor.execute(makeInvocation());
  assert.equal(emptyResult.outcome, 'FAILED');
  assert.equal(emptyResult.error_class, 'OUTPUT_INVALID');
});

test('codex executor: environment is reduced to the explicit allowlist including OPENROUTER_API_KEY', async () => {
  const SYNTHETIC_OR_KEY = 'synthetic-openrouter-key-material';
  const captured = [];
  const spawnImpl = trackingSpawn((command, args, options) => {
    captured.push(options.env);
    return createFakeChild({ stdoutText: '{}', exitCode: 0 });
  });
  const executor = createCodexExecutor({
    spawnImpl,
    cwd: '/tmp/maws-vnext-test-cwd',
    model: 'zai/glm-4.7',
    env: {
      PATH: '/usr/bin',
      HOME: '/home/tester',
      CODEX_HOME: '/tmp/codex-home',
      OPENROUTER_API_KEY: SYNTHETIC_OR_KEY,
      UNRELATED_SECRET: 'synthetic-forbidden-value',
      HOSTILE_INJECTION: 'rm -rf'
    }
  });
  const result = await executor.execute(makeInvocation());
  assert.deepEqual(captured[0], {
    PATH: '/usr/bin',
    HOME: '/home/tester',
    CODEX_HOME: '/tmp/codex-home',
    OPENROUTER_API_KEY: SYNTHETIC_OR_KEY
  });
  // The synthetic key reaches the child env but must never be serialized
  // into the execution result.
  assert.ok(!JSON.stringify(result).includes(SYNTHETIC_OR_KEY));

  const spawnImplNoCodexHome = trackingSpawn(() => createFakeChild({ stdoutText: '{}', exitCode: 0 }));
  const executorNoCodexHome = createCodexExecutor({
    spawnImpl: spawnImplNoCodexHome,
    cwd: '/tmp',
    env: { PATH: '/usr/bin', HOME: '/home/tester', CODEX_HOME: undefined, MAWS_CODEX_MODEL: 'zai/glm-4.7' }
  });
  await executorNoCodexHome.execute(makeInvocation());
  // MAWS_CODEX_MODEL is transformed into a CLI -c override, not forwarded as env.
  assert.deepEqual(spawnImplNoCodexHome.calls[0].options.env, { PATH: '/usr/bin', HOME: '/home/tester' });
});

test('codex executor: missing model binding fails closed before any spawn', async () => {
  const spawnImpl = trackingSpawn(() => createFakeChild({ stdoutText: '{}', exitCode: 0 }));
  const executor = createCodexExecutor({
    spawnImpl,
    cwd: '/tmp/maws-vnext-test-cwd',
    env: { PATH: '/usr/bin', HOME: '/home/tester' }
  });
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'MODEL_BINDING_MISSING');
  assert.equal(result.exit_code, null);
  assert.equal(spawnImpl.calls.length, 0, 'no codex process may spawn without an explicit model binding');
});

test('codex executor: WorkUnit payloads cannot inject model or provider bindings', async () => {
  const spawnImpl = trackingSpawn(() => createFakeChild({ stdoutText: '{}', exitCode: 0 }));
  const executor = createCodexExecutor({
    spawnImpl,
    cwd: '/tmp/maws-vnext-test-cwd',
    env: { PATH: '/usr/bin', HOME: '/home/tester', MAWS_CODEX_MODEL: 'zai/glm-4.7' }
  });
  await executor.execute(makeInvocation({
    context_package: {
      objective: 'attempt provider injection',
      bounded_payload: { model: 'evil/model', model_provider: 'evil-provider', OPENROUTER_API_KEY: 'injected' },
      provenance_refs: ['injection-probe']
    }
  }));
  const args = spawnImpl.calls[0].args;
  assert.deepEqual(args, [
    'exec', '--json',
    '-c', 'model_provider="openrouter"',
    '-c', 'model="zai/glm-4.7"',
    '-'
  ]);
});

test('codex executor: explicit sandbox mode is forwarded as a flag', async () => {
  const spawnImpl = trackingSpawn(() => createFakeChild({ stdoutText: '{}', exitCode: 0 }));
  const executor = createCodexExecutor({
    spawnImpl,
    cwd: '/tmp/maws-vnext-test-cwd',
    env: { PATH: '/usr/bin', HOME: '/home/tester', MAWS_CODEX_MODEL: 'zai/glm-4.7' },
    sandbox: 'read-only'
  });
  await executor.execute(makeInvocation());
  assert.deepEqual(spawnImpl.calls[0].args, [
    'exec', '--json', '--sandbox', 'read-only',
    '-c', 'model_provider="openrouter"',
    '-c', 'model="zai/glm-4.7"',
    '-'
  ]);
});

test('codex executor: malformed bindings and sandbox values are rejected at construction', () => {
  assert.throws(
    () => createCodexExecutor({ env: {}, model: 'bad model"' }),
    isFailClosedWithCode('EXECUTOR_DECLARATION_INVALID')
  );
  assert.throws(
    () => createCodexExecutor({ env: {}, model: 'zai/glm-4.7', modelProvider: 'evil provider' }),
    isFailClosedWithCode('EXECUTOR_DECLARATION_INVALID')
  );
  assert.throws(
    () => createCodexExecutor({ env: {}, model: 'zai/glm-4.7', sandbox: 'danger-full-access-extra' }),
    isFailClosedWithCode('EXECUTOR_DECLARATION_INVALID')
  );
});

test('codex executor: turn.failed event classifies execution as failed even with exit code 0', async () => {
  // Stream observed live against codex-cli 0.157.0 (missing provider env var).
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Model metadata for `zai/glm-4.7` not found.' } }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'error', message: 'Missing environment variable: `OPENROUTER_API_KEY`.' }),
    JSON.stringify({ type: 'turn.failed', error: { message: 'Missing environment variable: `OPENROUTER_API_KEY`.' } })
  ].join('\n');
  const { executor } = makeCodexHarness({ stdoutText: stdout, exitCode: 0 });
  const result = await executor.execute(makeInvocation());

  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'CODEX_TURN_FAILED');
  assert.equal(result.exit_code, 0);
  assert.equal(result.flags.event_count, 5);
  assert.equal(result.flags.error_event_count, 1);
  assert.equal(result.flags.item_error_count, 1);
  assert.equal(result.flags.turn_failed_message, 'Missing environment variable: `OPENROUTER_API_KEY`.');
});

test('codex executor: nonzero exit with a parseable turn.failed stream keeps the causal detail', async () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'error', message: 'Reconnecting... 1/5 (unexpected status 401 Unauthorized)' }),
    JSON.stringify({ type: 'turn.failed', error: { message: 'exceeded retry limit; last status 401 Unauthorized' } })
  ].join('\n');
  const { executor } = makeCodexHarness({ stdoutText: stdout, exitCode: 1 });
  const result = await executor.execute(makeInvocation());

  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'CODEX_TURN_FAILED');
  assert.equal(result.exit_code, 1);
  assert.equal(result.flags.error_event_count, 1);
  assert.ok(result.flags.turn_failed_message.includes('401'));
});

test('codex executor: nonzero exit with malformed stdout still maps to NON_ZERO_EXIT', async () => {
  const { executor } = makeCodexHarness({ stdoutText: 'boom-not-json', exitCode: 3 });
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'NON_ZERO_EXIT');
  assert.equal(result.exit_code, 3);
  assert.equal(result.flags, undefined);
});

test('codex executor: transient provider errors without turn.failed stay SUCCESS with surfaced counters', async () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'error', message: 'Reconnecting... 1/5 (unexpected status 429)' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'ok' } }),
    JSON.stringify({ type: 'turn.completed' })
  ].join('\n');
  const { executor } = makeCodexHarness({ stdoutText: stdout, exitCode: 0 });
  const result = await executor.execute(makeInvocation());

  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.flags.event_count, 5);
  assert.equal(result.flags.error_event_count, 1);
  assert.equal(result.flags.item_error_count, undefined);
});

test('codex executor: served model mismatch in the event stream is flagged, never silent', async () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'turn.completed', model: 'openrouter/auto' })
  ].join('\n');
  const { executor } = makeCodexHarness({ stdoutText: stdout, exitCode: 0 });
  const result = await executor.execute(makeInvocation());

  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.flags.served_model, 'openrouter/auto');
  assert.equal(result.flags.model_substitution, true);
});

test('codex executor: matching served model is recorded without substitution flag', async () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    JSON.stringify({ type: 'turn.completed', model: 'zai/glm-4.7' })
  ].join('\n');
  const { executor } = makeCodexHarness({ stdoutText: stdout, exitCode: 0 });
  const result = await executor.execute(makeInvocation());

  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.flags.served_model, 'zai/glm-4.7');
  assert.equal(result.flags.model_substitution, undefined);
});

// ---------------------------------------------------------------------------
// OpenRouter executor (fake fetch)
// ---------------------------------------------------------------------------

function makeOpenRouter(handler, options = {}) {
  const fetchImpl = trackingFetch(handler);
  const executor = createOpenRouterExecutor({
    modelId: 'zai/glm-4.7',
    fetchImpl,
    env: { OPENROUTER_API_KEY: TEST_API_KEY, ...(options.env || {}) },
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {})
  });
  return { executor, fetchImpl };
}

test('openrouter executor: success returns metrics from usage and records the requested model explicitly', async () => {
  const { executor, fetchImpl } = makeOpenRouter((_index, _url, init) =>
    jsonResponse(200, openRouterSuccessBody({ model: 'zai/glm-4.7' }))
  );
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.error_class, null);
  assert.deepEqual(result.outputs[0].inline_payload, 'analysis result');
  assert.equal(result.metrics.tokens_in, 11);
  assert.equal(result.metrics.tokens_out, 7);
  assert.equal(result.metrics.cost_units, 0.0012);
  assert.ok(result.metrics.latency_ms >= 0);
  assert.equal(result.flags, undefined);

  const requestBody = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(requestBody.model, 'zai/glm-4.7');
  assert.equal(requestBody.messages.length, 2);
  assert.equal(requestBody.messages[0].role, 'system');
  assert.equal(requestBody.messages[1].role, 'user');
  assert.deepEqual(JSON.parse(requestBody.messages[1].content), makeInvocation().context_package);
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, `Bearer ${TEST_API_KEY}`);
});

test('openrouter executor: served model substitution is flagged, never silent', async () => {
  const { executor } = makeOpenRouter((_index, _url, init) => {
    const requestBody = JSON.parse(init.body);
    assert.equal(requestBody.model, 'zai/glm-4.7', 'requested model must stay explicit in the request');
    return jsonResponse(200, openRouterSuccessBody({ model: 'openrouter/auto' }));
  });
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'SUCCESS');
  assert.deepEqual(result.flags, { model_substitution: true, served_model: 'openrouter/auto' });
});

test('openrouter executor: 429 maps to OR_RATE_LIMITED with status evidence', async () => {
  const { executor } = makeOpenRouter(() => jsonResponse(429, { error: { message: 'rate limited' } }));
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'OR_RATE_LIMITED');
  assert.deepEqual(result.flags, { http_status: 429 });
});

test('openrouter executor: other non-ok and unparseable responses map to OR_BAD_RESPONSE', async () => {
  const badStatus = makeOpenRouter(() => jsonResponse(502, { error: 'bad gateway' }));
  const badStatusResult = await badStatus.executor.execute(makeInvocation());
  assert.equal(badStatusResult.error_class, 'OR_BAD_RESPONSE');

  const badJson = makeOpenRouter(() => ({ status: 200, ok: true, json: async () => { throw new Error('invalid json'); } }));
  const badJsonResult = await badJson.executor.execute(makeInvocation());
  assert.equal(badJsonResult.error_class, 'OR_BAD_RESPONSE');

  const noChoices = makeOpenRouter(() => jsonResponse(200, { model: 'zai/glm-4.7' }));
  const noChoicesResult = await noChoices.executor.execute(makeInvocation());
  assert.equal(noChoicesResult.error_class, 'OR_BAD_RESPONSE');
});

test('openrouter executor: network rejection maps to OR_UNAVAILABLE', async () => {
  const { executor } = makeOpenRouter(async () => {
    throw new TypeError('fetch failed');
  });
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'OR_UNAVAILABLE');
});

test('openrouter executor: non-allowlisted baseUrl fails closed before any fetch', async () => {
  const { executor, fetchImpl } = makeOpenRouter(() => jsonResponse(200, openRouterSuccessBody({ model: 'zai/glm-4.7' })), {
    baseUrl: 'https://evil.example.com/api/v1/chat/completions'
  });
  await assert.rejects(executor.execute(makeInvocation()), isFailClosedWithCode('URL_HOST_NOT_ALLOWLISTED'));
  assert.equal(fetchImpl.calls.length, 0, 'no fetch call may happen for a non-allowlisted baseUrl');
});

test('openrouter executor: missing API key maps to CREDENTIAL_MISSING without any fetch', async () => {
  const fetchImpl = trackingFetch(() => jsonResponse(200, openRouterSuccessBody({ model: 'zai/glm-4.7' })));
  const executor = createOpenRouterExecutor({ modelId: 'zai/glm-4.7', fetchImpl, env: {} });
  const result = await executor.execute(makeInvocation());
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'CREDENTIAL_MISSING');
  assert.equal(fetchImpl.calls.length, 0);
});

test('openrouter executor: API key never appears anywhere in the result', async () => {
  const { executor } = makeOpenRouter(() => jsonResponse(200, openRouterSuccessBody({ model: 'openrouter/auto' })));
  const result = await executor.execute(makeInvocation());
  assert.ok(!JSON.stringify(result).includes(TEST_API_KEY), 'result JSON must not contain the API key');

  const unauthorized = makeOpenRouter(() => jsonResponse(401, { error: { message: 'invalid key' } }));
  const unauthorizedResult = await unauthorized.executor.execute(makeInvocation());
  assert.equal(unauthorizedResult.error_class, 'OR_BAD_RESPONSE');
  assert.ok(!JSON.stringify(unauthorizedResult).includes(TEST_API_KEY));
});

test('openrouter executor: caller abort maps to CANCELLED', async () => {
  const abortController = new AbortController();
  const { executor } = makeOpenRouter(async () => {
    abortController.abort();
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    throw error;
  });
  const result = await executor.execute(makeInvocation({ signal: abortController.signal }));
  assert.equal(result.outcome, 'CANCELLED');
  assert.equal(result.error_class, 'CANCELLED');
});

// ---------------------------------------------------------------------------
// Permission engine (MAWS-VN-403)
// ---------------------------------------------------------------------------

test('permission engine: new outbound categories deny by default and allow only explicit targets', () => {
  const engine = createPermissionEngine({ runId: 'run_vnext_phase4', runDir: '/tmp/maws-vnext-run-dir' });

  // Deny by default: unknown hosts, wrong targets, missing target.
  assert.equal(engine.decide({ claim: 'provider.openrouter.completion', target: 'https://evil.example.com/v1' }).decision, 'deny');
  assert.equal(engine.decide({ claim: 'provider.typesafe.ask', target: 'evil.example' }).decision, 'deny');
  assert.equal(engine.decide({ claim: 'process.codex.exec', target: 'bash' }).decision, 'deny');
  assert.equal(engine.decide({ claim: 'provider.openrouter.completion' }).decision, 'deny');

  // Allow with the explicit allowlisted target (URL and bare-host forms).
  assert.equal(
    engine.decide({ claim: 'provider.openrouter.completion', target: 'https://openrouter.ai/api/v1/chat/completions' }).decision,
    'allow'
  );
  assert.equal(engine.decide({ claim: 'provider.openrouter.completion', target: 'openrouter.ai' }).decision, 'allow');
  assert.equal(engine.decide({ claim: 'provider.typesafe.ask', target: 'api.typesafe.ai' }).decision, 'allow');
  assert.equal(engine.decide({ claim: 'process.codex.exec', target: 'codex' }).decision, 'allow');
});

test('permission engine: denials of new categories produce permission evidence', () => {
  const engine = createPermissionEngine({ runId: 'run_vnext_phase4', runDir: '/tmp/maws-vnext-run-dir' });
  engine.decide({ claim: 'provider.openrouter.completion', target: 'https://evil.example.com/v1' });
  engine.decide({ claim: 'process.codex.exec', target: 'bash' });

  const denial = engine.decisions.find(
    (entry) => entry.claim === 'provider.openrouter.completion' && entry.decision === 'deny'
  );
  assert.ok(denial, 'a denial evidence entry must exist');
  assert.equal(denial.target, 'https://evil.example.com/v1');
  assert.equal(denial.runId, 'run_vnext_phase4');
  assert.ok(typeof denial.reason === 'string' && denial.reason.length > 0);
  assert.ok(typeof denial.ts === 'string');

  const allowEntry = engine.decisions.find((entry) => entry.decision === 'allow' && entry.claim === 'process.codex.exec');
  assert.equal(allowEntry, undefined, 'no allow entry for a denied target');
});

test('permission engine: existing categories keep their Phase 1 behavior', () => {
  const runDir = '/tmp/maws-vnext-run-dir';
  const engine = createPermissionEngine({ runId: 'run_vnext_phase4', runDir });

  assert.equal(engine.decide({ claim: 'filesystem.write', target: path.join(runDir, 'events.jsonl') }).decision, 'allow');
  assert.equal(engine.decide({ claim: 'filesystem.write', target: path.join(repoRoot, 'README.md') }).decision, 'deny');
  assert.equal(engine.decide({ claim: 'external.http', target: 'https://openrouter.ai' }).decision, 'deny');
  assert.equal(engine.decide({ claim: 'made.up.category', target: 'anything' }).decision, 'deny');
});

// ---------------------------------------------------------------------------
// local-process transport
// ---------------------------------------------------------------------------

test('local-process: success shape, pre-abort, and fake timeout semantics', async () => {
  const spawnImpl = trackingSpawn(() => createFakeChild({ stdoutText: 'hello', stderrText: 'warn', exitCode: 0 }));
  const result = await runLocalProcess({ command: 'echo', args: ['hi'], spawnImpl, env: {} });
  assert.deepEqual(Object.keys(result).sort(), [
    'cancelled',
    'duration_ms',
    'exit_code',
    'stderr',
    'stderr_truncated',
    'stdout',
    'stdout_truncated',
    'timed_out'
  ]);
  assert.equal(result.exit_code, 0);
  assert.equal(result.stdout, 'hello');
  assert.equal(result.stderr, 'warn');
  assert.equal(result.timed_out, false);
  assert.equal(result.cancelled, false);

  // Pre-aborted signal: no spawn at all, cancelled result.
  const idleSpawn = trackingSpawn(() => createFakeChild({ exitCode: 0 }));
  const aborted = await runLocalProcess({ command: 'echo', signal: AbortSignal.abort(), spawnImpl: idleSpawn });
  assert.equal(aborted.cancelled, true);
  assert.equal(idleSpawn.calls.length, 0);

  // Timeout with a child that only closes on kill.
  const slowSpawn = trackingSpawn(() => createFakeChild({ closeOnKillOnly: true }));
  const timedOut = await runLocalProcess({ command: 'hang', timeoutMs: 50, spawnImpl: slowSpawn });
  assert.equal(timedOut.timed_out, true);
  assert.equal(timedOut.exit_code, null);
});

test('local-process: timeout kill path escalates SIGTERM -> SIGKILL against a real child', { timeout: 10000 }, async () => {
  // Real child that traps SIGTERM and keeps running: only SIGKILL ends it.
  const script = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write('alive');";
  const result = await runLocalProcess({
    command: process.execPath,
    args: ['-e', script],
    timeoutMs: 150
  });
  assert.equal(result.timed_out, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.exit_code, null);
  // The 2s kill grace must have elapsed before SIGKILL ended the child.
  assert.ok(result.duration_ms >= 2000, `expected duration >= 2000ms after grace, got ${result.duration_ms}`);
});
