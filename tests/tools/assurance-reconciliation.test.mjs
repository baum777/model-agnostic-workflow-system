// MAWS vNext — anti-rot tests for the assurance reconciliation artifacts.
// node:test + node:assert/strict, no new dependencies.
//
// The reconciliation run of 2026-10-22 answers four residual findings with
// committed artifacts. An artifact nothing checks is a claim that rots, so
// this file re-derives each artifact's load-bearing content live:
//
// 1. the removal-call inventory matches the live tree (the scope boundary
//    of the deletion protection can only change deliberately);
// 2. the test-count decomposition is arithmetically exact and bound to the
//    committed operational safety run record — and the ungated files it
//    names are now wired into the CI security step (the forward fix);
// 3. the sensitive content scan over the persisted 2026-10-21 evidence
//    still passes, still matches the scanned digests, and still DETECTS
//    planted material (a scanner that cannot fail proves nothing);
// 4. the consequence record keeps the two incident results separated.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inventoryRemovalCalls } from '../../scripts/tools/inventory-removal-calls.mjs';
import { scanSensitiveContent } from '../../scripts/tools/scan-sensitive-content.mjs';
import { createScratchRoot, removeScratchRoot } from '../../scripts/tools/safe-remove.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE = path.join(ROOT, 'evidence', 'assurance-reconciliation-2026-10-22');
const SCANNED_EVIDENCE = path.join(ROOT, 'evidence', 'assurance-closure-2026-10-21');

test('the removal-call inventory artifact matches the live tree', () => {
  const committed = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'removal-call-inventory.json'), 'utf8'));
  const live = inventoryRemovalCalls({ root: ROOT });
  assert.equal(live.ok, true, 'the harness surface itself stays clean');
  assert.equal(live.direct_recursive_removals, committed.direct_recursive_removals);
  assert.deepEqual(live.by_file, committed.by_file);
  assert.deepEqual(
    live.calls.map((call) => `${call.file}:${call.line}`),
    committed.calls.map((call) => `${call.file}:${call.line}`)
  );
  assert.ok(committed.calls.length > 0, 'the inventory documents a non-empty out-of-scope remainder');
});

test('the test-count decomposition is exact and bound to the run record', () => {
  const committed = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'test-count-reconciliation.json'), 'utf8'));
  const record = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'evidence', 'operational-safety-closure-2026-10-22', 'run-record.json'), 'utf8')
  ).assurance_run_record;

  assert.equal(committed.ok, true, 'the committed reconciliation holds');
  assert.equal(committed.run_id, record.run_id);
  assert.equal(committed.bound_commit, record.implementation_commit_sha);

  const d = committed.decomposition;
  assert.equal(d.record_total_tests, record.totals.tests_passed + record.totals.tests_failed);
  assert.equal(d.naive_sum, d.record_total_tests + d.ungated_tools_tests - d.intra_record_overlap_tests);
  assert.equal(d.naive_sum - d.record_total_tests, d.difference);
  const ungatedSum = d.ungated_tools_files.reduce((sum, entry) => sum + entry.tests, 0);
  assert.equal(ungatedSum, d.ungated_tools_tests);
  const overlapSum = d.intra_record_overlap_files.reduce((sum, entry) => sum + entry.tests, 0);
  assert.equal(overlapSum, d.intra_record_overlap_tests);
  // The overlap must be real in the committed log evidence, not asserted.
  for (const evidence of committed.committed_log_evidence) {
    assert.equal(evidence.test_names_in_log, evidence.test_names_measured,
      `${evidence.file} test names appear in the suite gate log`);
  }
});

test('the ungated tools files the decomposition names run in the CI security step', () => {
  // The decomposition explains a HISTORICAL state at the bound commit: five
  // tools test files no record gate executed. The forward fix wires them
  // (and this file) into the workflow's security step. This test fails if
  // any of them falls out of the step again.
  const committed = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'test-count-reconciliation.json'), 'utf8'));
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'loop-repo-ci.yml'), 'utf8');
  const securityStep = workflow.split('\n').find((line) => line.includes('node --test') && line.includes('preinstall-skill-risk-check'));
  assert.ok(securityStep, 'the security step with its test file list exists');
  for (const entry of committed.decomposition.ungated_tools_files) {
    assert.ok(securityStep.includes(entry.file), `${entry.file} runs in the CI security step`);
  }
  assert.ok(securityStep.includes('tests/tools/assurance-reconciliation.test.mjs'),
    'the reconciliation anti-rot tests run in the CI security step');
});

test('the sensitive content scan over the persisted evidence passes and still detects', () => {
  const committed = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'sensitive-content-scan.json'), 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'security', 'evidence-sensitive-content-baseline.json'), 'utf8'));
  const live = scanSensitiveContent({ root: ROOT, target: 'evidence/assurance-closure-2026-10-21', baseline });
  assert.equal(live.ok, true);
  assert.equal(live.finding_count, committed.finding_count);
  // The scanned material is committed: the digests must still match, or the
  // artifact describes evidence that no longer exists.
  const committedDigests = new Map(committed.scanned.map((entry) => [entry.file, entry.sha256]));
  assert.equal(live.scanned.length, committedDigests.size);
  for (const entry of live.scanned) {
    assert.equal(entry.sha256, committedDigests.get(entry.file), `${entry.file} is unchanged since the scan`);
  }
  // Negative control: a scanner that cannot fail is not evidence.
  const { root: scratch } = createScratchRoot({ prefix: 'sensitive-negative-' });
  fs.writeFileSync(path.join(scratch, 'planted.txt'), 'token: sk_ABCDEFGHIJKLMNOPQRSTUVWXYZ12\nmail: someone@example-corp.dev\n');
  const planted = scanSensitiveContent({ root: path.dirname(scratch), target: path.basename(scratch), baseline: { entries: [] } });
  assert.equal(planted.ok, false);
  const classes = new Set(planted.unbaselined.map((finding) => finding.class));
  assert.ok(classes.has('secret') && classes.has('pii-heuristic'), 'both pattern classes fire on planted material');
  removeScratchRoot({ root: scratch });
});

test('the consequence record keeps the two incident results separated', () => {
  const record = fs.readFileSync(path.join(EVIDENCE, 'incident-consequence-record.md'), 'utf8');
  assert.match(record, /Technical fix: CLOSED/);
  assert.match(record, /Consequence accounting: INCOMPLETE/);
  assert.match(record, /NOT COMPLETABLE/);
  assert.match(record, /no boundary primitive restores deleted foreign state/);
});

test('the RUN.md prose states the numbers the artifacts derive', () => {
  // Prose is checked against the machine: the run description may not drift
  // from the artifacts it describes.
  const run = fs.readFileSync(path.join(EVIDENCE, 'RUN.md'), 'utf8');
  const counts = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'test-count-reconciliation.json'), 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'removal-call-inventory.json'), 'utf8'));
  const sensitive = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'sensitive-content-scan.json'), 'utf8'));
  const d = counts.decomposition;
  for (const value of [
    d.record_total_tests, d.naive_sum, d.difference, d.ungated_tools_tests, d.intra_record_overlap_tests,
    counts.tools_full_suite.total, inventory.direct_recursive_removals, Object.keys(inventory.by_file).length,
    sensitive.files_scanned
  ]) {
    assert.ok(run.includes(String(value)), `RUN.md states ${value}`);
  }
  assert.match(run, /Atlas validation PASS with 0 errors/);
  assert.match(run, /foreign Personal-Pilot path drift/);
});
