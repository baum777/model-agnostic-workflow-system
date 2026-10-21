#!/usr/bin/env node
// MAWS vNext — capture of an assurance run's exact test and readback evidence.
//
// WHY THIS EXISTS
// A run record that only says "21/21 steps exit 0" in prose is not
// evidence: it cannot be re-checked, it cannot be compared with a later
// run, and it decays into a claim the next reader has to take on faith.
// The evidence this repository writes under evidence/ was narrative for
// every run except one, and the raw output of the runs that verified the
// path-confinement, evidence-admission and source-security lanes was
// produced in a temporary directory and is gone.
//
// This module makes the raw output DURABLE and VERIFIABLE:
//
//   1. A gate list is declared here, in the repository, so the set of
//      executed gates is reviewable and versioned like any other source.
//   2. Every gate runs as a child process with its stdout and stderr
//      captured verbatim into files, and its exit code captured next to
//      them. Nothing is summarised on the way in.
//   3. The run record names every gate's output by digest. A gate's
//      output that was edited after the capture is detected by the
//      validator, because the digest no longer matches.
//   4. Test gates are COUNTED from their own output, so the record's
//      test counts are derived from the raw log rather than typed in.
//      The validator re-derives them from the same log.
//
// The record states what it is: a LOCAL_REPLICATION of the hosted
// workflow's steps under the workflow's pinned runtime, with
// hosted_ci_executed false unless a hosted run actually happened. A local
// replication is never reported as a hosted run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ASSURANCE_RUN_RECORD_CONTRACT = 'assurance-run-record.v1';

// The gate list of the assurance run. Each entry is a gate the hosted
// workflow also runs, or a readback of an external surface, executed with
// the same command. The workflow's own step list stays the authority for
// what the hosted run does; this list is the local replication of it.
export const ASSURANCE_GATES = Object.freeze([
  {
    id: 'syntax-core',
    description: 'node --check on the five modules the workflow names explicitly',
    command: 'node --check scripts/tools/baum-loop-repo.mjs && node --check scripts/tools/validate-loop-run.mjs && node --check scripts/tools/ci-gate.mjs && node --check scripts/tools/skill-frontdoor-check.mjs && node --check runtime/skills/frontdoor.mjs',
    kind: 'syntax',
    timeoutMs: 120000
  },
  {
    id: 'syntax-sweep',
    description: 'node --check over every .mjs file under runtime, scripts/tools and providers',
    command: "find runtime scripts/tools providers -type f -name '*.mjs' -print0 | xargs -0 -n1 node --check",
    kind: 'syntax',
    timeoutMs: 600000
  },
  {
    id: 'validate-secrets',
    description: 'secret boundary validation',
    command: 'npm run --silent validate-secrets',
    kind: 'tool',
    timeoutMs: 300000
  },
  {
    id: 'scan-secrets',
    description: 'secret scan',
    command: 'npm run --silent scan-secrets',
    kind: 'tool',
    timeoutMs: 300000
  },
  {
    id: 'security-regression-tests',
    description: 'the security boundary regression tests the workflow runs in its security step',
    command: 'node --test tests/tools/preinstall-skill-risk-check.test.mjs tests/tools/security-repair-regressions.test.mjs',
    kind: 'test',
    timeoutMs: 600000
  },
  {
    id: 'source-security-scan',
    description: 'the repository-owned .mjs static security gate',
    command: 'npm run --silent scan:source-security',
    kind: 'tool',
    timeoutMs: 600000
  },
  {
    id: 'vnext-unit-suite',
    description: 'the complete runtime vNext unit suite',
    command: 'npm run --silent test:vnext',
    kind: 'test',
    timeoutMs: 1800000
  },
  {
    id: 'provider-neutral',
    description: 'provider neutral core validation',
    command: 'npm run --silent validate-neutral',
    kind: 'tool',
    timeoutMs: 300000
  },
  {
    id: 'provider-adapter-import',
    description: 'provider adapter import tests',
    command: 'node --test tests/tools/provider-adapter-import.test.mjs',
    kind: 'test',
    timeoutMs: 300000
  },
  {
    id: 'eval-maws-vnext',
    description: 'the maws-vnext certification eval',
    command: 'npm run --silent eval:maws-vnext',
    kind: 'tool',
    timeoutMs: 900000
  },
  {
    id: 'eval-secret-boundary',
    description: 'the secret-boundary certification eval',
    command: 'npm run --silent eval:secret-boundary',
    kind: 'tool',
    timeoutMs: 900000
  },
  {
    id: 'eval-provider-export-alignment',
    description: 'the provider export alignment eval',
    command: 'npm run --silent eval:provider-export-alignment',
    kind: 'tool',
    timeoutMs: 900000
  },
  {
    id: 'validate-maws-vnext',
    description: 'MAWS vNext contract validation',
    command: 'npm run --silent validate-maws-vnext',
    kind: 'tool',
    timeoutMs: 300000
  },
  {
    id: 'skill-frontdoor-regression',
    description: 'the skill frontdoor regression suite',
    command: 'npm run --silent test:skill-frontdoor',
    kind: 'test',
    timeoutMs: 600000
  },
  {
    id: 'ci-gate',
    description: 'the loop repo CI gate',
    command: 'npm run --silent baum:ci-gate',
    kind: 'tool',
    timeoutMs: 900000
  }
]);

// The material the run's claims are about. The record carries the digest
// of each file AS IT IS IN THE BOUND COMMIT, so the claim stays checkable
// when the working tree has moved on. The list binds the tools, the
// contract, the tests and the evidence artifacts: a claim about a gate is
// only checkable if the gate's own bytes are pinned.
export const ASSURANCE_ARTIFACTS = Object.freeze([
  'scripts/tools/path-confinement.mjs',
  'scripts/tools/evidence-admission.mjs',
  'scripts/tools/evidence-provenance.mjs',
  'scripts/tools/scan-source-security.mjs',
  'scripts/tools/capture-assurance-run.mjs',
  'scripts/tools/validate-assurance-run-record.mjs',
  'core/contracts/assurance-run-record.schema.json',
  'security/source-security-baseline.json',
  'tests/vnext/evidence-admission.test.mjs',
  'tests/vnext/evidence-provenance.test.mjs',
  'tests/tools/assurance-run-record.test.mjs',
  'tests/tools/assurance-residual-matrix.test.mjs',
  'evidence/assurance-closure-2026-10-21/residual-matrix.json',
  'evidence/assurance-closure-2026-10-21/mutation-probes.json',
  'evidence/assurance-closure-2026-10-21/baseline-qualification.md'
]);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function parseTapCounts(output) {
  // node --test's summary lines carry an informational marker ("# " on
  // older runtimes, an informational sign on Node 24). Both are accepted;
  // anything else is not a count and is ignored.
  const wanted = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const counts = {};
  for (const line of output.split('\n')) {
    const match = /^[\s#\u2139]*(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    if (!wanted.includes(key)) continue;
    counts[key] = Number(match[2]);
  }
  if (typeof counts.tests !== 'number' || typeof counts.pass !== 'number' || typeof counts.fail !== 'number') {
    return null;
  }
  return {
    tests: counts.tests,
    pass: counts.pass,
    fail: counts.fail,
    cancelled: counts.cancelled ?? 0,
    skipped: counts.skipped ?? 0,
    todo: counts.todo ?? 0
  };
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// The content of a path AT THE BOUND COMMIT. A file that is not tracked
// there is read from the working tree.
export function readAtCommit(root, commit, relative) {
  const result = spawnSync('git', ['show', `${commit}:${relative}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (result.status === 0) return { content: result.stdout, tracked: true };
  const absolute = path.join(root, relative);
  if (fs.existsSync(absolute)) return { content: fs.readFileSync(absolute), tracked: false };
  return null;
}

export function captureRun({
  root,
  outDir,
  runId,
  commit,
  gates = ASSURANCE_GATES,
  artifacts = ASSURANCE_ARTIFACTS,
  createdAt = new Date().toISOString(),
  limits = []
}) {
  const gateDir = path.join(outDir, 'gates');
  fs.mkdirSync(gateDir, { recursive: true });
  const captured = [];
  for (const gate of gates) {
    const started = Date.now();
    const result = spawnSync(gate.command, {
      cwd: path.isAbsolute(gate.cwd ?? '') ? gate.cwd : path.join(root, gate.cwd ?? '.'),
      shell: '/bin/bash',
      encoding: 'utf8',
      timeout: gate.timeoutMs ?? 900000,
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, CI: '1' }
    });
    const duration = Date.now() - started;
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const stdoutFile = path.join(gateDir, `${gate.id}.stdout.log`);
    const stderrFile = path.join(gateDir, `${gate.id}.stderr.log`);
    const exitFile = path.join(gateDir, `${gate.id}.exit`);
    fs.writeFileSync(stdoutFile, stdout);
    fs.writeFileSync(stderrFile, stderr);
    const exitCode = typeof result.status === 'number' ? result.status : (result.error ? 124 : 1);
    fs.writeFileSync(exitFile, `${exitCode}\n`);
    const entry = {
      id: gate.id,
      description: gate.description,
      command: gate.command,
      status: exitCode === 0 ? 'PASS' : 'FAIL',
      exit_code: exitCode,
      duration_ms: duration,
      stdout: {
        file: path.relative(outDir, stdoutFile),
        bytes: Buffer.byteLength(stdout),
        sha256: sha256(stdout)
      },
      stderr: {
        file: path.relative(outDir, stderrFile),
        bytes: Buffer.byteLength(stderr),
        sha256: sha256(stderr)
      }
    };
    if (gate.cwd) entry.cwd = gate.cwd;
    if (gate.kind === 'test') {
      const counts = parseTapCounts(stdout);
      if (counts) entry.counts = counts;
    }
    captured.push(entry);
  }
  const artifactEntries = [];
  for (const relative of artifacts) {
    const read = readAtCommit(root, commit, relative);
    if (!read) continue;
    artifactEntries.push({
      path: relative,
      bytes: read.content.length,
      sha256: sha256(read.content)
    });
  }
  const totals = {
    gates: captured.length,
    gates_passed: captured.filter((gate) => gate.status === 'PASS').length,
    gates_failed: captured.filter((gate) => gate.status === 'FAIL').length,
    tests_passed: captured.reduce((sum, gate) => sum + (gate.counts?.pass ?? 0), 0),
    tests_failed: captured.reduce((sum, gate) => sum + (gate.counts?.fail ?? 0), 0)
  };
  return {
    assurance_run_record: {
      schema_version: '1.0.0',
      run_id: runId,
      created_at: createdAt,
      repository: 'github.com/baum777/model-agnostic-workflow-system',
      implementation_commit_sha: commit,
      environment: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        ci_parity: 'LOCAL_REPLICATION',
        hosted_ci_executed: false
      },
      gates: captured,
      totals,
      artifacts: artifactEntries,
      limits,
      validator_command: `node scripts/tools/validate-assurance-run-record.mjs evidence/${runId}/run-record.json`,
      contract_version: ASSURANCE_RUN_RECORD_CONTRACT
    }
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = path.resolve(options.root ?? process.cwd());
  const runId = options['run-id'] ?? path.basename(path.resolve(options.out ?? 'evidence/run'));
  const outDir = path.resolve(options.out ?? path.join(root, 'evidence', runId));
  const head = git(root, ['rev-parse', 'HEAD']);
  const commit = options.commit ?? head.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    process.stderr.write(`capture: cannot resolve a bound commit (got "${commit}")\n`);
    process.exitCode = 2;
    return;
  }
  const limits = options.limits
    ? String(options.limits).split('|').map((entry) => entry.trim()).filter(Boolean)
    : [];
  const record = captureRun({ root, outDir, runId, commit, limits });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'run-record.json'), `${JSON.stringify(record, null, 2)}\n`);
  const totals = record.assurance_run_record.totals;
  process.stdout.write(`assurance run captured: ${runId}\n`);
  process.stdout.write(`  bound commit: ${commit}\n`);
  process.stdout.write(`  gates: ${totals.gates_passed}/${totals.gates} passed, `
    + `${totals.tests_passed} test(s) passed, ${totals.tests_failed} failed\n`);
  for (const gate of record.assurance_run_record.gates) {
    if (gate.status !== 'PASS') {
      process.stdout.write(`  FAILED GATE ${gate.id} (exit ${gate.exit_code})\n`);
    }
  }
  process.stdout.write(`  record: ${path.relative(root, path.join(outDir, 'run-record.json'))}\n`);
  process.exitCode = totals.gates_failed === 0 ? 0 : 1;
}

const invokedAsCli = process.argv[1]
  && process.argv[1] !== '-'
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedAsCli) {
  main();
}
