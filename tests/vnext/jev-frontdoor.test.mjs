// Governed Jev decision frontdoor tests (JEV-RUNTIME-FRONTDOOR-01, OD-19).
//
// DoD coverage:
//   1. CLI/API parity — the CLI payload equals the canonical client.ask()
//      result for identical inputs (plus the `verdict` projection).
//   2. Transport neutrality — openrouter/zen runs differ only in provenance.
//   3. Fail closed — invalid invocation, unknown question, bad state,
//      missing credential, and answer-space violations never imply continue.
//   4. No semantic duplication — choices come exclusively from the registry;
//      thresholds come exclusively from the canonical policy file.
//   5. Machine composability — stable JSON on stdout, distinct exit codes;
//      HUMAN_GATE is a verdict (exit 0), not a process failure.
//
// No network: fetch is always injected; the end-to-end child-process run
// uses fixture mode and a stripped environment (no provider keys).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { runJevDecide } from '../../runtime/cli/runtime-jev-decide.mjs';
import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';
import { loadThresholdPolicy } from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import { getQuestion } from '../../runtime/decision-engine/jev/questions/registry.mjs';

const PATH_ROOT = new URL('../../', import.meta.url).pathname;
const ZEN_KEY = 'synthetic-zen-key-material';
const OR_KEY = 'synthetic-openrouter-key-material';

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    }
  };
}

function zenResponse() {
  return {
    id: 'zen-sysone-frontdoor-test',
    model: 'jev-1.13-20260917',
    provider: 'TypeSafe',
    answers: {
      work_class: {
        type: 'choice',
        choice: 'verification',
        confidence: 0.81,
        probabilities: { analysis: 0.05, implementation: 0.06, verification: 0.81, decision: 0.08 }
      }
    },
    usage: { input_tokens: 312, output_tokens: 41 }
  };
}

function tmpStateFile(content) {
  const dir = fs.mkdtempSync(path.join(PATH_ROOT, 'artifacts', 'runtime-runs', 'jev-frontdoor-'));
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
  return file;
}

const CLI_ARGS = ['--question', 'work_class', '--mode', 'zen', '--model', 'jev-1.13', '--state', tmpStateFile({ phase: 'implementation-finished' }), '--json'];
const CLI_OPTIONS = {
  env: { OPENCODE_API_KEY: ZEN_KEY },
  fetchImpl: async () => jsonResponse(200, zenResponse()),
  policyPath: `${PATH_ROOT}policies/decision-thresholds.yaml`
};

test('DoD 1 CLI/API parity: payload equals the canonical client.ask() result plus verdict', async () => {
  const thresholdPolicy = await loadThresholdPolicy(CLI_OPTIONS.policyPath);
  const q = getQuestion('work_class');
  const stateFile = CLI_ARGS[CLI_ARGS.indexOf('--state') + 1];
  const direct = await createJevClient({
    mode: 'zen',
    thresholdPolicy,
    requestedModel: 'jev-1.13',
    env: { OPENCODE_API_KEY: ZEN_KEY },
    fetchImpl: CLI_OPTIONS.fetchImpl
  }).ask({
    question: q,
    choices: q.answer_space.values,
    state: JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  });

  const cli = await runJevDecide(CLI_ARGS, CLI_OPTIONS);
  assert.equal(cli.exitCode, 0);
  assert.equal(cli.payload.verdict, 'PROCEED');
  const { verdict, ...canonical } = cli.payload;
  assert.equal(verdict, direct.threshold.action);
  // Two ask() invocations mint distinct receipts by design (a receipt proves
  // one decision); parity therefore compares decision content, with receipt
  // identity (id/timestamp) stripped on both sides.
  const stripIdentity = (result) => {
    const { receipt_id, created_at, ...receiptContent } = result.receipt;
    return { ...result, receipt: receiptContent };
  };
  assert.deepEqual(stripIdentity(canonical), stripIdentity(direct));
});

test('DoD 2 transport neutrality: openrouter vs zen differ only via provenance', async () => {
  const stateFile = CLI_ARGS[CLI_ARGS.indexOf('--state') + 1];
  const common = { policyPath: CLI_OPTIONS.policyPath };
  const zen = await runJevDecide(
    ['--question', 'work_class', '--mode', 'zen', '--model', 'jev-1.13-20260917', '--state', stateFile, '--json'],
    { ...common, env: { OPENCODE_API_KEY: ZEN_KEY }, fetchImpl: CLI_OPTIONS.fetchImpl }
  );
  const openRouter = await runJevDecide(
    ['--question', 'work_class', '--mode', 'openrouter', '--model', 'jev-1.13-20260917', '--state', stateFile, '--json'],
    { ...common, env: { OPENROUTER_API_KEY: OR_KEY }, fetchImpl: CLI_OPTIONS.fetchImpl }
  );
  assert.equal(zen.exitCode, 0);
  assert.equal(openRouter.exitCode, 0);
  assert.equal(zen.payload.receipt.mode, 'zen');
  assert.equal(openRouter.payload.receipt.mode, 'openrouter');
  const provenance = new Set(['receipt_id', 'created_at', 'mode']);
  const stripReceipt = (receipt) => Object.fromEntries(Object.entries(receipt).filter(([key]) => !provenance.has(key)));
  assert.deepEqual(stripReceipt(zen.payload.receipt), stripReceipt(openRouter.payload.receipt));
  assert.equal(zen.payload.verdict, openRouter.payload.verdict);
});

test('DoD 3 fail closed: invalid invocation, unknown question, bad state never imply continue', async () => {
  const opts = { policyPath: CLI_OPTIONS.policyPath };
  const unknownQuestion = await runJevDecide(['--question', 'not_in_registry', '--mode', 'fixture', '--case', 'frontdoor-work-class-valid'], opts);
  assert.equal(unknownQuestion.exitCode, 2);
  assert.equal(unknownQuestion.payload.error_class, 'UNKNOWN_QUESTION');

  // The dynamic eligibility question is unreachable: this CLI never mints
  // eligibility, so constructing preferred_executor here must be rejected.
  const dynamic = await runJevDecide(['--question', 'preferred_executor', '--mode', 'fixture', '--case', 'valid-preference'], opts);
  assert.equal(dynamic.exitCode, 2);
  assert.equal(dynamic.payload.error_class, 'UNKNOWN_QUESTION');

  const unknownMode = await runJevDecide(['--question', 'work_class', '--mode', 'magic'], opts);
  assert.equal(unknownMode.exitCode, 2);

  const unknownFlag = await runJevDecide(['--route', 'somewhere'], opts);
  assert.equal(unknownFlag.exitCode, 2);
  assert.equal(unknownFlag.usage, true);

  const missingState = await runJevDecide(['--question', 'work_class', '--mode', 'fixture', '--case', 'frontdoor-work-class-valid', '--state', `${PATH_ROOT}artifacts/runtime-runs/does-not-exist.json`], opts);
  assert.equal(missingState.exitCode, 2);
  assert.equal(missingState.payload.error_class, 'STATE_FILE_UNREADABLE');

  const badJson = await runJevDecide(['--question', 'work_class', '--mode', 'fixture', '--case', 'frontdoor-work-class-valid', '--state', tmpStateFile('{not json')], opts);
  assert.equal(badJson.exitCode, 2);
  assert.equal(badJson.payload.error_class, 'STATE_FILE_INVALID_JSON');

  const oversized = await runJevDecide(['--question', 'work_class', '--mode', 'zen', '--model', 'jev-1.13', '--state', tmpStateFile({ blob: 'x'.repeat(33000) }), '--json'], { ...CLI_OPTIONS });
  assert.equal(oversized.exitCode, 2);
  assert.equal(oversized.payload.error_class, 'STATE_OVERSIZED');
});

test('DoD 3+5 exit-code matrix: runtime failures are 3, contract violations are 4', async () => {
  const missingKey = await runJevDecide(
    ['--question', 'work_class', '--mode', 'zen', '--model', 'jev-1.13', '--json'],
    { env: {}, fetchImpl: CLI_OPTIONS.fetchImpl, policyPath: CLI_OPTIONS.policyPath }
  );
  assert.equal(missingKey.exitCode, 3);
  assert.equal(missingKey.payload.error_class, 'JEV_API_KEY_MISSING');

  const rateLimited = await runJevDecide(CLI_ARGS, { ...CLI_OPTIONS, fetchImpl: async () => jsonResponse(429, {}) });
  assert.equal(rateLimited.exitCode, 3);
  assert.equal(rateLimited.payload.error_class, 'JEV_RATE_LIMITED');

  const malformed = await runJevDecide(CLI_ARGS, { ...CLI_OPTIONS, fetchImpl: async () => jsonResponse(200, { model: 'x' }) });
  assert.equal(malformed.exitCode, 4);
  assert.equal(malformed.payload.error_class, 'JEV_BAD_RESPONSE');

  const hostile = zenResponse();
  hostile.answers.work_class.choice = 'invented_by_jev';
  const outsideSpace = await runJevDecide(CLI_ARGS, { ...CLI_OPTIONS, fetchImpl: async () => jsonResponse(200, hostile) });
  assert.equal(outsideSpace.exitCode, 4);
  assert.equal(outsideSpace.payload.error_class, 'ANSWER_OUTSIDE_ALLOWED_SPACE');

  const brokenPolicy = await runJevDecide(['--question', 'work_class', '--mode', 'fixture', '--case', 'frontdoor-work-class-valid'], { policyPath: `${PATH_ROOT}policies/does-not-exist.yaml` });
  assert.equal(brokenPolicy.exitCode, 4);
  assert.equal(brokenPolicy.payload.error_class, 'POLICY_LOAD_FAILED');
});

test('DoD 4 no semantic duplication: choices are the registry space, thresholds the canonical policy', async () => {
  const cli = await runJevDecide(['--question', 'work_class', '--mode', 'fixture', '--case', 'frontdoor-work-class-valid'], { policyPath: CLI_OPTIONS.policyPath });
  assert.equal(cli.exitCode, 0);
  assert.deepEqual(cli.payload.receipt.choices, getQuestion('work_class').answer_space.values);
  const policy = await loadThresholdPolicy(CLI_OPTIONS.policyPath);
  assert.equal(cli.payload.receipt.threshold_policy_version, policy.version);
  assert.equal(cli.payload.verdict, 'PROCEED');
});

test('DoD 5 machine composability: HUMAN_GATE is a verdict, not a process failure', async () => {
  const humanGate = await runJevDecide(['--question', 'work_class', '--mode', 'fixture', '--case', 'frontdoor-human-gate'], { policyPath: CLI_OPTIONS.policyPath });
  assert.equal(humanGate.exitCode, 0);
  assert.equal(humanGate.payload.verdict, 'HUMAN_GATE');
  assert.equal(humanGate.payload.answer, 'analysis');
});

test('DoD 5 end-to-end child process: npm script wiring, stable JSON, exit codes', async () => {
  const pkg = JSON.parse(fs.readFileSync(`${PATH_ROOT}package.json`, 'utf8'));
  assert.equal(pkg.scripts['runtime:jev-decide'], 'node runtime/cli/runtime-jev-decide.mjs');

  const cliPath = `${PATH_ROOT}runtime/cli/runtime-jev-decide.mjs`;
  const ok = spawnSync(process.execPath, [cliPath, '--question', 'work_class', '--mode', 'fixture', '--case', 'frontdoor-work-class-valid', '--json'], {
    cwd: PATH_ROOT,
    env: { PATH: process.env.PATH },
    encoding: 'utf8'
  });
  assert.equal(ok.status, 0, ok.stderr);
  const parsed = JSON.parse(ok.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.receipt.mode, 'fixture');
  assert.equal(parsed.verdict, 'PROCEED');

  const rejected = spawnSync(process.execPath, [cliPath, '--question', 'nope', '--mode', 'fixture', '--case', 'frontdoor-work-class-valid', '--json'], {
    cwd: PATH_ROOT,
    env: { PATH: process.env.PATH },
    encoding: 'utf8'
  });
  assert.equal(rejected.status, 2);
  assert.equal(JSON.parse(rejected.stdout).error_class, 'UNKNOWN_QUESTION');

  const help = spawnSync(process.execPath, [cliPath, '--help'], { cwd: PATH_ROOT, env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage:/);
});
