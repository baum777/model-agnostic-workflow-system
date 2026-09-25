// MAWS vNext — Codex harness executor (MAWS-VN-401).
//
// Executor class: agent_harness (OD-01: the harness is an executor class,
// NOT a model entry and NOT a provider adapter).
//
// Executes `codex exec --json -` as a local child process with a bounded
// ContextPackage JSON on stdin and a minimal environment allowlist. Auth
// material (Codex login/session state) stays inside CODEX_HOME and is never
// copied into ExecutionResults.
//
// NOTE: the exact codex CLI flag set used here ('exec', '--json', '-') is the
// planned invocation shape and must be confirmed at first live activation;
// tests inject a fake spawnImpl, so no live codex binary is required.
//
// OD-04: this executor performs exactly one bounded invocation; it never
// spawns MAWS-governed children and carries no decomposition authority.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineExecutor } from './executor-base.mjs';
import { runLocalProcess } from '../transports/local-process.mjs';

const CODEX_COMMAND = 'codex';
// Confirmed-at-activation flag set: ['exec', '--json', '-']
const CODEX_ARGS = ['exec', '--json', '-'];
// Minimal environment allowlist: binary resolution, home, codex auth home.
// Everything else from the caller environment is dropped.
const CODEX_ENV_ALLOWLIST = ['PATH', 'HOME', 'CODEX_HOME'];

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

/**
 * Create the Codex harness executor.
 *
 * @param {object} [options]
 * @param {Function} [options.spawnImpl] - injectable spawn for tests (default node:child_process.spawn)
 * @param {string} [options.cwd]         - working directory (default: this repository root)
 * @param {Object} [options.env]         - source environment for the allowlist (default: process.env)
 * @returns {object} executor (defineExecutor shape)
 */
export function createCodexExecutor({ spawnImpl, cwd, env = process.env } = {}) {
  return defineExecutor({
    executorId: 'exec_codex_harness',
    executorClass: 'agent_harness',
    displayName: 'Codex Harness (codex exec)',
    transport: 'codex_exec',
    declaredCapabilities: ['cap_code_implementation'],
    execute: async (invocation) => {
      const childEnv = buildAllowlistedEnv(env);
      let proc;
      try {
        proc = await runLocalProcess({
          command: CODEX_COMMAND,
          args: CODEX_ARGS,
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
      if (proc.exit_code !== 0) {
        return { outcome: 'FAILED', error_class: 'NON_ZERO_EXIT', exit_code: proc.exit_code };
      }

      // Exit 0: stdout must be a JSON document (codex --json output shape).
      const stdoutText = typeof proc.stdout === 'string' ? proc.stdout.trim() : '';
      if (stdoutText.length === 0) {
        return { outcome: 'FAILED', error_class: 'OUTPUT_INVALID', exit_code: proc.exit_code };
      }
      let parsed;
      try {
        parsed = JSON.parse(stdoutText);
      } catch {
        return { outcome: 'FAILED', error_class: 'OUTPUT_INVALID', exit_code: proc.exit_code };
      }

      return {
        outcome: 'SUCCESS',
        outputs: [{ inline_payload: parsed }],
        exit_code: proc.exit_code
      };
    }
  });
}
