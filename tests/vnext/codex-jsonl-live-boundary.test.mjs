import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createCodexExecutor } from '../../runtime/executors/codex-executor.mjs';

const CODEX_TEST_ENV = { PATH: '/bin', HOME: '/tmp' };

function fakeSpawn(stdoutText, exitCode = 0) {
  return () => {
    const child = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), {
      write() { return true; },
      end() {}
    });
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;

    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(stdoutText, 'utf8'));
      child.emit('close', exitCode);
    });
    return child;
  };
}

function invocation() {
  return {
    work_unit_id: 'wu_codex_jsonl_probe',
    node_id: 'node_codex_jsonl_probe',
    context_package: {
      objective: 'Read-only JSONL parser probe',
      bounded_payload: {},
      provenance_refs: ['test']
    },
    authority_envelope: {
      scope_ref: 'scope_test_readonly',
      allowed_effects: ['ephemeral']
    },
    timeout_ms: 1000
  };
}

test('Codex executor accepts documented JSONL event stream', async () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } })
  ].join('\n');

  const executor = createCodexExecutor({ spawnImpl: fakeSpawn(stdout), env: CODEX_TEST_ENV });
  const result = await executor.execute(invocation());

  assert.equal(result.outcome, 'SUCCESS');
  assert.equal(result.flags.stream_format, 'jsonl');
  assert.equal(result.flags.event_count, 2);
  assert.equal(result.outputs[0].inline_payload.format, 'jsonl');
  assert.equal(result.outputs[0].inline_payload.events.length, 2);
});

test('Codex executor preserves the historical single-line JSON payload shape', async () => {
  const payload = { type: 'item.completed', item: { type: 'agent_message', text: 'ok' } };
  const executor = createCodexExecutor({ spawnImpl: fakeSpawn(JSON.stringify(payload)), env: CODEX_TEST_ENV });
  const result = await executor.execute(invocation());

  assert.equal(result.outcome, 'SUCCESS');
  assert.deepEqual(result.outputs[0].inline_payload, payload);
  assert.equal(result.flags.event_count, 1);
});

test('Codex executor fails closed if any JSONL event is malformed', async () => {
  const executor = createCodexExecutor({
    spawnImpl: fakeSpawn('{"type":"thread.started"}\nnot-json'),
    env: CODEX_TEST_ENV
  });
  const result = await executor.execute(invocation());

  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'OUTPUT_INVALID');
});

// ---------------------------------------------------------------------------
// Live-observed codex-cli 0.157.0 event streams (captured against the
// OpenRouter provider binding; secret-free excerpts).
// ---------------------------------------------------------------------------

test('live boundary: missing provider env var fails closed through turn.failed classification', async () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: '01a0d9bb' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Model metadata for `zai/glm-4.7` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.' } }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'error', message: 'Missing environment variable: `OPENROUTER_API_KEY`.' }),
    JSON.stringify({ type: 'turn.failed', error: { message: 'Missing environment variable: `OPENROUTER_API_KEY`.' } })
  ].join('\n');
  const executor = createCodexExecutor({ spawnImpl: fakeSpawn(stdout), env: CODEX_TEST_ENV });
  const result = await executor.execute(invocation());

  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'CODEX_TURN_FAILED');
  assert.equal(result.flags.event_count, 5);
  assert.equal(result.flags.error_event_count, 1);
  assert.equal(result.flags.item_error_count, 1);
  assert.equal(result.flags.turn_failed_message, 'Missing environment variable: `OPENROUTER_API_KEY`.');
});

test('live boundary: provider 401 reconnect cascade ends in CODEX_TURN_FAILED, not SUCCESS', async () => {
  const events = [
    { type: 'thread.started', thread_id: '01a0d9bb' },
    { type: 'item.completed', item: { id: 'item_0', type: 'error', message: 'Model metadata for `zai/glm-4.7` not found. Defaulting to fallback metadata.' } },
    { type: 'turn.started' }
  ];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    events.push({ type: 'error', message: `Reconnecting... ${attempt}/5 (unexpected status 401 Unauthorized: User not found., url: https://openrouter.ai/api/v1/responses)` });
  }
  events.push({ type: 'turn.failed', error: { message: 'exceeded retry limit; last status 401 Unauthorized: User not found.' } });

  const executor = createCodexExecutor({ spawnImpl: fakeSpawn(events.map((e) => JSON.stringify(e)).join('\n')), env: CODEX_TEST_ENV });
  const result = await executor.execute(invocation());

  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'CODEX_TURN_FAILED');
  assert.equal(result.flags.error_event_count, 5);
  assert.ok(result.flags.turn_failed_message.includes('401'));
});
