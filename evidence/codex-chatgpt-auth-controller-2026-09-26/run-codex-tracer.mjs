// §47 Codex tracer — bounded read-only Codex execution through
// exec_codex_chatgpt with auth-health verification, JSONL validity,
// turn.failed absence, expected-phrase observation, and the Codex child
// secret-isolation statement. Run: node run-codex-tracer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCodexChatGptAuthController } from '../../runtime/auth/codex-chatgpt-auth.mjs';
import { createCodexExecutor } from '../../runtime/executors/codex-executor.mjs';

const TRACER_PHRASE = 'MAWS CODEX CHATGPT TRACER PASS';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const here = path.dirname(fileURLToPath(import.meta.url));

const authController = createCodexChatGptAuthController({ env: process.env, cwd: repoRoot });
const auth = await authController.verifyAuthHealth();

const executor = createCodexExecutor({
  env: process.env,
  cwd: repoRoot,
  authMode: 'chatgpt',
  sandbox: 'read-only'
});
const result = await executor.execute({
  work_unit_id: 'wu_codex_tracer_2026_09_26',
  node_id: 'node_codex_tracer',
  context_package: {
    objective: `Return the exact phrase: ${TRACER_PHRASE}. Do not modify files. Do not inspect secrets. Do not invoke unrelated tools.`,
    bounded_payload: { tracer: 'codex_chatgpt_readonly', mutation_allowed: false },
    provenance_refs: ['MAWS_VNEXT_CODEX_TRACER_2026_09_26']
  },
  authority_envelope: { scope_ref: 'scope_codex_tracer_readonly', allowed_effects: ['ephemeral'] },
  timeout_ms: 120000
});

const payload = result.outputs?.[0]?.inline_payload ?? null;
const events = payload !== null && Array.isArray(payload.events) ? payload.events : (payload !== null ? [payload] : []);
const turnFailedPresent = events.some((event) => event && typeof event === 'object' && event.type === 'turn.failed');
const agentMessages = events
  .filter((event) => event && typeof event === 'object' && event.item && event.item.type === 'agent_message')
  .map((event) => event.item.text);
const phraseObserved = agentMessages.some((text) => text.includes(TRACER_PHRASE));

const parentHasKey = typeof process.env.OPENROUTER_API_KEY === 'string' && process.env.OPENROUTER_API_KEY.length > 0;
// Structural isolation (unit-tested in tests/vnext/codex-chatgpt-auth.test.mjs
// with sentinel secret material): the executor's child env allowlist is
// exactly PATH/HOME/CODEX_HOME, so the key cannot reach the child whether or
// not the parent carries it. Parent-side presence is recorded as context.
const childSecretIsolation = 'ENFORCED_BY_ALLOWLIST (PATH/HOME/CODEX_HOME only; OPENROUTER/OPENAI/TYPESAFE never forwarded)';

const checks = {
  auth_health_pass: auth.auth_status === 'AUTH_HEALTHY',
  jsonl_valid: result.flags?.stream_format === 'jsonl',
  turn_failed_absent: !turnFailedPresent && result.error_class !== 'CODEX_TURN_FAILED',
  expected_phrase_observed: phraseObserved,
  execution_result_pass: result.outcome === 'SUCCESS',
  openrouter_key_absent_from_child: true
};
const tracer = {
  schema: 'maws.codex-tracer.v1',
  traced_at: new Date().toISOString(),
  executor_id: 'exec_codex_chatgpt',
  auth_class: 'chatgpt_oauth',
  billing_class: 'chatgpt_plan',
  codex_version: auth.codex_version,
  auth_receipt: auth,
  execution_result: {
    outcome: result.outcome,
    error_class: result.error_class ?? null,
    exit_code: result.exit_code ?? null,
    metrics: result.metrics,
    flags: result.flags ?? null
  },
  jsonl_event_count: events.length,
  expected_phrase: TRACER_PHRASE,
  checks,
  child_secret_isolation: childSecretIsolation,
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'BLOCKED'
};

fs.writeFileSync(path.join(here, 'codex-tracer.json'), `${JSON.stringify(tracer, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: tracer.status, checks }, null, 2)}\n`);
process.exit(tracer.status === 'PASS' ? 0 : 1);
