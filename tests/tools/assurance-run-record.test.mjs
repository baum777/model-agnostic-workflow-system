// MAWS vNext — tests for the assurance run record and its validation.
// node:test + node:assert/strict, no new dependencies.
//
// The run record is the durable form of a run's evidence. These tests prove
// the property that makes it evidence at all: the record cannot disagree
// with the material it points at without being caught. An edited log, an
// edited exit code, a test count that does not follow from the log, a
// total that does not add up, an artifact that differs from the bound
// commit and a record that overstates where it ran are all detected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { captureRun, parseTapCounts } from '../../scripts/tools/capture-assurance-run.mjs';
import { validateRunRecord } from '../../scripts/tools/validate-assurance-run-record.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function buildRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-repo-'));
  fs.mkdirSync(path.join(root, 'material'), { recursive: true });
  fs.writeFileSync(path.join(root, 'material', 'subject.txt'), 'the subject of the claim\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.email', 'assurance@example.invalid');
  git('config', 'user.name', 'assurance');
  git('add', '.');
  git('commit', '--quiet', '-m', 'subject');
  const commit = git('rev-parse', 'HEAD').trim();
  return { root, commit };
}

const GATES = [
  {
    id: 'demo-test',
    description: 'a gate whose output is a test report',
    command: "printf $'\\u2139 tests 3\\n\\u2139 pass 3\\n\\u2139 fail 0\\n'",
    kind: 'test',
    timeoutMs: 30000
  },
  {
    id: 'demo-tool',
    description: 'a gate that writes to stderr and succeeds',
    command: 'printf "on stdout\\n"; printf "on stderr\\n" >&2',
    kind: 'tool',
    timeoutMs: 30000
  },
  {
    id: 'demo-failure',
    description: 'a gate that fails',
    command: 'printf "boom\\n"; exit 3',
    kind: 'tool',
    timeoutMs: 30000
  }
];

// The fixture owns two temporary directories; both are removed by their
// OWN path. Nothing here may ever name a parent of a temporary directory.
function captureFixture() {
  const { root, commit } = buildRepo();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-out-'));
  const record = captureRun({
    root,
    outDir,
    runId: 'demo-run',
    commit,
    gates: GATES,
    artifacts: ['material/subject.txt'],
    createdAt: '2026-10-21T00:00:00.000Z',
    limits: ['a local replication is not a hosted run']
  });
  const recordPath = path.join(outDir, 'run-record.json');
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return {
    root,
    commit,
    outDir,
    record,
    recordPath,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  };
}

test('the capture stores the raw output verbatim and the record describes it by digest', () => {
  const fixture = captureFixture();
  const wrapper = fixture.record.assurance_run_record;
  const stdoutPath = path.join(fixture.outDir, wrapper.gates[0].stdout.file);
  assert.equal(fs.readFileSync(stdoutPath, 'utf8'), '\u2139 tests 3\n\u2139 pass 3\n\u2139 fail 0\n');
  assert.deepEqual(wrapper.gates[0].counts, {
    tests: 3, pass: 3, fail: 0, cancelled: 0, skipped: 0, todo: 0
  });
  const stderrPath = path.join(fixture.outDir, wrapper.gates[1].stderr.file);
  assert.equal(fs.readFileSync(stderrPath, 'utf8'), 'on stderr\n');
  assert.equal(fs.readFileSync(path.join(fixture.outDir, 'gates', 'demo-failure.exit'), 'utf8').trim(), '3');
  assert.equal(wrapper.gates[2].status, 'FAIL');
  assert.equal(wrapper.gates[2].exit_code, 3);
  assert.equal(wrapper.totals.gates, 3);
  assert.equal(wrapper.totals.gates_failed, 1);
  assert.equal(wrapper.environment.hosted_ci_executed, false);
  assert.equal(wrapper.environment.ci_parity, 'LOCAL_REPLICATION');
  fixture.cleanup();
});

test('the validator accepts the record it just produced', () => {
  const fixture = captureFixture();
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, true, JSON.stringify(result.issues));
  assert.equal(result.totals.gates, 3);
  fixture.cleanup();
});

test('an edited gate log is detected', () => {
  const fixture = captureFixture();
  const logPath = path.join(fixture.outDir, 'gates', 'demo-tool.stdout.log');
  fs.writeFileSync(logPath, 'on stdout, but edited afterwards\n');
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /stdout digest changed/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('an edited exit code is detected', () => {
  const fixture = captureFixture();
  fs.writeFileSync(path.join(fixture.outDir, 'gates', 'demo-failure.exit'), '0\n');
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /exit code disagrees/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('a test count that does not follow from the log is detected', () => {
  const fixture = captureFixture();
  const raw = JSON.parse(fs.readFileSync(fixture.recordPath, 'utf8'));
  raw.assurance_run_record.gates[0].counts.pass = 99;
  fs.writeFileSync(fixture.recordPath, `${JSON.stringify(raw, null, 2)}\n`);
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /states pass=99/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('a total that does not add up is detected', () => {
  const fixture = captureFixture();
  const raw = JSON.parse(fs.readFileSync(fixture.recordPath, 'utf8'));
  raw.assurance_run_record.totals.gates_passed = 3;
  fs.writeFileSync(fixture.recordPath, `${JSON.stringify(raw, null, 2)}\n`);
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /totals\.gates_passed/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('an artifact that differs from the bound commit is detected', () => {
  const fixture = captureFixture();
  // The record claims a digest the bound commit does not carry: the claim
  // about the material is a lie and the validator compares it with the
  // commit's own blob.
  const raw = JSON.parse(fs.readFileSync(fixture.recordPath, 'utf8'));
  raw.assurance_run_record.artifacts[0].sha256 = '0'.repeat(64);
  fs.writeFileSync(fixture.recordPath, `${JSON.stringify(raw, null, 2)}\n`);
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /differs from the bound commit/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('an artifact the bound commit does not carry is detected', () => {
  const fixture = captureFixture();
  const raw = JSON.parse(fs.readFileSync(fixture.recordPath, 'utf8'));
  raw.assurance_run_record.artifacts.push({
    path: 'material/never-committed.txt',
    bytes: 10,
    sha256: '0'.repeat(64)
  });
  fs.writeFileSync(fixture.recordPath, `${JSON.stringify(raw, null, 2)}\n`);
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /is not carried by the bound commit/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('a record that overstates where it ran is rejected', () => {
  const fixture = captureFixture();
  const raw = JSON.parse(fs.readFileSync(fixture.recordPath, 'utf8'));
  raw.assurance_run_record.environment.ci_parity = 'HOSTED_CI';
  fs.writeFileSync(fixture.recordPath, `${JSON.stringify(raw, null, 2)}\n`);
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /hosted CI parity/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('a record without a limits list is rejected: a run that claims everything claims nothing', () => {
  const fixture = captureFixture();
  const raw = JSON.parse(fs.readFileSync(fixture.recordPath, 'utf8'));
  raw.assurance_run_record.limits = [];
  fs.writeFileSync(fixture.recordPath, `${JSON.stringify(raw, null, 2)}\n`);
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /at least one limit/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('a record that marks a failing gate as passing is rejected', () => {
  const fixture = captureFixture();
  const raw = JSON.parse(fs.readFileSync(fixture.recordPath, 'utf8'));
  raw.assurance_run_record.gates[2].status = 'PASS';
  fs.writeFileSync(fixture.recordPath, `${JSON.stringify(raw, null, 2)}\n`);
  const result = validateRunRecord({ recordPath: fixture.recordPath, root: fixture.root });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /marked PASS but its exit code/.test(issue)), JSON.stringify(result.issues));
  fixture.cleanup();
});

test('the test counts are read out of the raw output, and only a real test report yields counts', () => {
  assert.deepEqual(parseTapCounts('# tests 7\n# pass 6\n# fail 1\n'), {
    tests: 7, pass: 6, fail: 1, cancelled: 0, skipped: 0, todo: 0
  });
  // Node 24 marks the summary with an informational sign rather than a hash.
  assert.deepEqual(parseTapCounts('\u2139 tests 2\n\u2139 pass 2\n\u2139 fail 0\n'), {
    tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0
  });
  assert.equal(parseTapCounts('nothing that looks like a test report'), null);
  assert.equal(parseTapCounts('info tests 2\n'), null, 'a report without pass and fail yields no counts');
});

test('every assurance run record committed in this repository validates', () => {
  const evidenceRoot = path.join(ROOT, 'evidence');
  const records = fs.readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(evidenceRoot, entry.name, 'run-record.json'))
    .filter((candidate) => fs.existsSync(candidate));
  for (const candidate of records) {
    const result = validateRunRecord({ recordPath: candidate, root: ROOT });
    assert.equal(result.passed, true, `${path.relative(ROOT, candidate)}: ${JSON.stringify(result.issues)}`);
  }
});
