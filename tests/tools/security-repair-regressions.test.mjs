import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyReport, runPreinstallSkillRiskCheck } from '../../scripts/tools/preinstall-skill-risk-check.mjs';
import { assertRunId, resolveRuntimeRunDir } from '../../runtime/observability/run-paths.mjs';
import { resolveRunDir, replayRuntimeRun } from '../../runtime/observability/runtime-replay.mjs';
import { validateRuntimeRun } from '../../runtime/observability/validation-receipt.mjs';
import { runRuntimeRun } from '../../runtime/cli/runtime-run.mjs';
import { createScratchRoot, removeScratchRoot } from '../../scripts/tools/safe-remove.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The scratch state is a MARKED root with the working directory inside it,
// so that every removal is checked against a boundary. The working
// directory itself stays free of markers: a test that asserts an empty
// directory must see an empty directory.
const temp = (prefix) => {
  const { root: scratch } = createScratchRoot({ prefix });
  const dir = path.join(scratch, 'work');
  fs.mkdirSync(dir);
  return dir;
};
// The scratch root is the PARENT of the working directory, and only a
// marked root is removable.
const dispose = (...dirs) => dirs.forEach((dir) => removeScratchRoot({ root: path.dirname(dir) }));

function nvidiaReport(complete = true) {
  // Schema and exception pattern sourced from the pinned 2.12.0 audit evidence.
  return {
    metadata: { skillspector_version: '2.12.0' },
    execution_successful: true,
    analysis_completeness: {
      execution_successful: true, is_complete: complete,
      status: complete ? 'complete' : 'partial',
      ledger_exceptions: complete ? [] : [{ outcome: 'partial', reason_code: 'reference_missing' }]
    },
    risk_assessment: {
      score: 0, severity: 'LOW', max_issue_severity: 'NONE',
      recommendation: complete ? 'SAFE' : 'CAUTION'
    },
    issues: []
  };
}

test('F01 partial SkillSpector report with zero issues is INCOMPLETE', () => {
  const result = classifyReport(nvidiaReport(false));
  assert.equal(result.ok, false);
  assert.equal(result.incomplete, true);
});

test('F01 complete safe 2.12.0 report can clear only the scanner subgate', () => {
  const result = classifyReport(nvidiaReport(true));
  assert.equal(result.ok, true);
  assert.equal(result.incomplete, false);
});

test('F01 incomplete, unknown schema/version or DO_NOT_INSTALL is never clean', () => {
  const base = nvidiaReport(true);
  for (const override of [
    { metadata: { skillspector_version: '3.0.0' } },
    { metadata: undefined }, { analysis_completeness: undefined },
    { risk_assessment: { ...base.risk_assessment, recommendation: 'DO_NOT_INSTALL' } },
    { risk_assessment: { ...base.risk_assessment, max_issue_severity: 'NEW_UNKNOWN' } },
    { execution_successful: false }
  ]) {
    assert.equal(classifyReport({ ...base, ...override }).ok, false);
  }
});

test('F02 out-of-root runDir and reportPath block with no writes', () => {
  const repo = temp('maws-f02-repo-'), outside = temp('maws-f02-outside-');
  try {
    const target = path.join(repo, 'target.md');
    fs.writeFileSync(target, '# test');
    const forbidden = path.join(outside, 'forbidden');
    let invoked = false;
    const opts = { repoRoot: repo, target, type: 'skill', executor: () => { invoked = true; throw Error('unexpected scanner execution'); } };
    assert.equal(runPreinstallSkillRiskCheck({ ...opts, runDir: forbidden }).blocked, true);
    assert.equal(fs.existsSync(forbidden), false);
    const legal = path.join(repo, 'sandbox', 'runs', 'test-run');
    assert.equal(runPreinstallSkillRiskCheck({ ...opts, runDir: legal, reportPath: path.join(outside, 'escape.json') }).blocked, true);
    assert.equal(fs.existsSync(legal), false);
    assert.equal(invoked, false);
  } finally {
    dispose(repo, outside);
  }
});

test('F02 sandbox symlinks are not safe evidence destinations', () => {
  const repo = temp('maws-f02-repo-'), outside = temp('maws-f02-outside-');
  try {
    fs.mkdirSync(path.join(repo, 'sandbox'));
    fs.symlinkSync(outside, path.join(repo, 'sandbox/runs'));
    assert.equal(runPreinstallSkillRiskCheck({ repoRoot: repo, target: '.', type: 'skill' }).blocked, true);
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    dispose(repo, outside);
  }
});

test('F04 runtime IDs cannot traverse and all readers fail closed', () => {
  const repo = temp('maws-f04-repo-');
  try {
    for (const id of ['../../../other', 'run_../../other', 'run_a/b', '/etc/passwd', 'run_']) {
      assert.throws(() => assertRunId(id), /RUN_ID_INVALID/);
      assert.throws(() => resolveRunDir({ repoRoot: repo, runId: id }), /RUN_ID_INVALID/);
      assert.equal(validateRuntimeRun({ repoRoot: repo, runId: id }).ok, false);
      assert.equal(replayRuntimeRun({ repoRoot: repo, runId: id }).ok, false);
    }
    assert.equal(path.basename(resolveRuntimeRunDir(repo, 'run_valid-123')), 'run_valid-123');
  } finally { dispose(repo); }
});

test('F04 symlinked runtime path blocks reads and writes', () => {
  const repo = temp('maws-f04-repo-'), outside = temp('maws-f04-outside-');
  try {
    fs.mkdirSync(path.join(repo, 'artifacts/runtime-runs'), { recursive: true });
    fs.symlinkSync(outside, path.join(repo, 'artifacts/runtime-runs/run_escape'));
    assert.throws(() => resolveRuntimeRunDir(repo, 'run_escape'), /RUN_PATH_SYMLINK_FORBIDDEN/);
    assert.equal(validateRuntimeRun({ repoRoot: repo, runId: 'run_escape' }).ok, false);
    assert.equal(replayRuntimeRun({ repoRoot: repo, runId: 'run_escape' }).ok, false);
  } finally {
    dispose(repo, outside);
  }
});

test('F04 run CLI rejects malicious spec run_id before writing', async () => {
  const dir = temp('maws-f04-spec-');
  try {
    const spec = JSON.parse(fs.readFileSync(path.join(root, 'runtime/cli/specs/reference-audit-v1.json'), 'utf8'));
    spec.run_id = 'run_../../../forbidden';
    const specPath = path.join(dir, 'spec.json');
    fs.writeFileSync(specPath, JSON.stringify(spec));
    await assert.rejects(runRuntimeRun({ repoRoot: root, specPath }), (e) => e.code === 'RUN_ID_INVALID');
  } finally { dispose(dir); }
});

test('F05 MiniMax adapter works as a pure transformation after import repair', async () => {
  const { minimaxAdapter } = await import('../../providers/minimax/adapter.mjs');
  const result = minimaxAdapter.normalizeSkillCall('skill_test', { messages: [{ role: 'user', content: 'hello' }] }, { runId: 'run_test', providerName: 'minimax' });
  assert.equal(result.provider, 'minimax');
  assert.equal(result.trace.redacted, true);
});

test('F06: CI helper dispatches literal argv without an interpolating shell', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/tools/ci-gate.mjs'), 'utf8');
  assert.match(source, /execFileSync\(process\.execPath, commandArgs, \{ cwd, stdio: 'inherit', shell: false \}\)/);
  assert.doesNotMatch(source, /\bexecSync\s*\(/);
  assert.match(source, /'command\/ loop repo ' \+ targetPath/);
});
