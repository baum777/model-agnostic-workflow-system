// MAWS vNext — Local process transport (MAWS-VN-400/401).
//
// Bounded child-process execution: no shell, byte-capped stdout/stderr,
// timeout and abort cancellation with SIGTERM -> (grace) -> SIGKILL.
// This is a transport, not an executor and not a provider adapter: it carries
// zero authority/qualification semantics and never widens caller scope.
//
// The spawn implementation is injectable (default: node:child_process.spawn)
// so tests run without spawning real processes.
import { spawn as defaultSpawn } from 'node:child_process';

const STDOUT_CAP_BYTES = 1024 * 1024; // 1 MiB
const STDERR_CAP_BYTES = 1024 * 1024; // 1 MiB
const KILL_GRACE_MS = 2000;

function createCappedCollector(capBytes) {
  const chunks = [];
  let collected = 0;
  let truncated = false;
  return {
    push(chunk) {
      if (collected >= capBytes) {
        truncated = true;
        return;
      }
      if (chunk.length > capBytes - collected) {
        chunks.push(chunk.subarray(0, capBytes - collected));
        collected = capBytes;
        truncated = true;
        return;
      }
      chunks.push(chunk);
      collected += chunk.length;
    },
    text() {
      return Buffer.concat(chunks).toString('utf8');
    },
    wasTruncated() {
      return truncated;
    }
  };
}

function isEventEmitterLike(stream) {
  return stream !== null && stream !== undefined && typeof stream.on === 'function';
}

/**
 * Run a local process with bounded capture and cancellation.
 *
 * @param {object} options
 * @param {string} options.command            - binary to execute (no shell interpretation)
 * @param {string[]} [options.args]           - argv, passed verbatim
 * @param {string} [options.cwd]              - working directory
 * @param {number} [options.timeoutMs]        - hard timeout; SIGTERM then SIGKILL after grace
 * @param {AbortSignal} [options.signal]      - abort cancellation; SIGTERM then SIGKILL after grace
 * @param {Object} [options.env]              - explicit child environment (caller builds the allowlist)
 * @param {string|Buffer} [options.stdinData] - written to child stdin, then stdin is closed
 * @param {Function} [options.spawnImpl]      - injectable spawn (default node:child_process.spawn)
 * @returns {Promise<{exit_code: number|null, timed_out: boolean, cancelled: boolean,
 *                    stdout: string, stderr: string, duration_ms: number,
 *                    stdout_truncated: boolean, stderr_truncated: boolean}>}
 *   Rejects with the child 'error' event payload (e.g. ENOENT) when spawn fails;
 *   timeout/abort are resolved states, not rejections.
 */
export async function runLocalProcess({
  command,
  args = [],
  cwd,
  timeoutMs,
  signal,
  env,
  stdinData,
  spawnImpl = defaultSpawn
} = {}) {
  if (typeof command !== 'string' || command.length === 0) {
    throw new TypeError('runLocalProcess requires a non-empty command string');
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('runLocalProcess args must be an array of strings');
  }
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || timeoutMs <= 0)) {
    throw new TypeError('runLocalProcess timeoutMs must be a positive number when present');
  }
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new TypeError('runLocalProcess signal must be an AbortSignal when present');
  }
  if (typeof spawnImpl !== 'function') {
    throw new TypeError('runLocalProcess spawnImpl must be a function');
  }

  const startedAtMs = Date.now();

  // Fail closed before spawning when cancellation already happened.
  if (signal?.aborted) {
    return {
      exit_code: null,
      timed_out: false,
      cancelled: true,
      stdout: '',
      stderr: '',
      duration_ms: 0,
      stdout_truncated: false,
      stderr_truncated: false
    };
  }

  const child = spawnImpl(command, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false
  });

  const stdoutCollector = createCappedCollector(STDOUT_CAP_BYTES);
  const stderrCollector = createCappedCollector(STDERR_CAP_BYTES);
  let timedOut = false;
  let cancelled = false;
  let settled = false;

  return new Promise((resolve, reject) => {
    const settle = (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      if (signal !== undefined && isEventEmitterLike(signal)) {
        try {
          signal.removeEventListener('abort', onAbort);
        } catch {
          // Best-effort listener cleanup.
        }
      }
      resolve({
        exit_code: exitCode,
        timed_out: timedOut,
        cancelled,
        stdout: stdoutCollector.text(),
        stderr: stderrCollector.text(),
        duration_ms: Date.now() - startedAtMs,
        stdout_truncated: stdoutCollector.wasTruncated(),
        stderr_truncated: stderrCollector.wasTruncated()
      });
    };

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      reject(error);
    };

    // --- kill sequencing: SIGTERM, then SIGKILL after the grace window -----
    let killTimer = null;
    const killWithGrace = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // Child already gone; 'close' will fire (or already did).
      }
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Child already gone.
        }
      }, KILL_GRACE_MS);
    };

    let timeoutTimer = null;
    const onTimeout = () => {
      timedOut = true;
      killWithGrace();
    };
    const onAbort = () => {
      if (settled) {
        return;
      }
      cancelled = true;
      killWithGrace();
    };

    function clearTimers() {
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (killTimer !== null) {
        clearTimeout(killTimer);
        killTimer = null;
      }
    }

    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(onTimeout, timeoutMs);
    }
    if (signal !== undefined) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // --- stream capture ----------------------------------------------------
    if (isEventEmitterLike(child.stdout)) {
      child.stdout.on('data', (chunk) => stdoutCollector.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    }
    if (isEventEmitterLike(child.stderr)) {
      child.stderr.on('data', (chunk) => stderrCollector.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    }

    // --- stdin -------------------------------------------------------------
    if (stdinData !== undefined && child.stdin) {
      try {
        if (isEventEmitterLike(child.stdin)) {
          child.stdin.on('error', () => {
            // EPIPE when the child exits before consuming stdin; not fatal here.
          });
        }
        child.stdin.write(stdinData);
        child.stdin.end();
      } catch {
        // Child may have exited already; exit state governs the result.
      }
    } else if (child.stdin) {
      try {
        child.stdin.end();
      } catch {
        // Ignore early-exit races.
      }
    }

    child.on('error', (error) => {
      // e.g. ENOENT when the binary is unavailable.
      rejectOnce(error);
    });

    // 'close' fires after stdio is flushed, unlike 'exit'.
    child.on('close', (code) => {
      settle(typeof code === 'number' ? code : null);
    });
  });
}
