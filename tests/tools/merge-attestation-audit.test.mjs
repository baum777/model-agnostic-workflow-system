// MAWS vNext — the merge path attestation audit.
//
// The audit is the DETECTIVE counterpart of the merge executor: it reads the
// default branch's own merge history and asks whether EVERY merge that
// landed was covered by a lane authorization that existed on the base branch
// before the merge. The test that matters most is the negative one: a merge
// that no lane covered must be a FINDING, not a quiet pass — that is exactly
// the shape of the cross-lane merge incident of 2026-10-21.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  AUDIT_CODES,
  auditMergeAttestations,
  contractCarriesLifecycle,
  resolveBaseCommit
} from '../../scripts/tools/verify-merge-attestations.mjs';

const LANE_DIRECTORY = 'core/authority/merge-authorizations';
const CONTRACT_PATH = 'core/contracts/merge-lane-authorization.schema.json';

function git(dir, args, input = undefined) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}

function write(dir, relative, content) {
  const absolute = path.join(dir, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

// The lane contract in the tree. The audit's scope rule reads it: a merge
// whose base tree already carries the lifecycle-aware contract is in scope.
function contract(lifecycleAware) {
  return `${JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'fixture',
    properties: {
      schema_version: lifecycleAware
        ? { enum: ['1.0.0', '1.1.0'] }
        : { const: '1.0.0' }
    }
  }, null, 2)}\n`;
}

function lane({ laneId, head, baseRef = 'main', state = 'active', extra = {} } = {}) {
  return `${JSON.stringify({
    schema_version: '1.1.0',
    lane_id: laneId,
    authority: 'canonical_owner',
    base_ref: baseRef,
    head_ref: `branch/${laneId}`,
    required_checks: ['loop-repo-ci'],
    state,
    authorized_head_sha: head,
    ...extra
  }, null, 2)}\n`;
}

function makeRepo({ lifecycleAware = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-merge-audit-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'audit-test@unitera.systems']);
  git(dir, ['config', 'user.name', 'merge audit test']);
  write(dir, CONTRACT_PATH, contract(lifecycleAware));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'the lane contract']);
  return dir;
}

// A commit on a branch: the head a merge would carry.
function commitOnBranch(dir, branch, message) {
  git(dir, ['checkout', '-q', '-b', branch]);
  write(dir, `${branch}.txt`, `${message}\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  const head = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', 'main']);
  return head;
}

let governanceActCounter = 0;

// A governance act: the change lands on the default branch through a MERGE
// whose diff is confined to the governance surface, exactly as a lane
// binding or a baseline lands in the real repository. Landing it as a plain
// commit would itself be a direct-push finding under the audit.
function commitOnMain(dir, relative, content, message) {
  governanceActCounter += 1;
  const branch = `gov/act-${governanceActCounter}`;
  git(dir, ['checkout', '-q', '-b', branch]);
  write(dir, relative, content);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  git(dir, ['checkout', '-q', 'main']);
  git(dir, ['merge', '--no-ff', '-q', '-m', `merge: ${message}`, branch]);
  return git(dir, ['rev-parse', 'HEAD']);
}

function mergeBranch(dir, branch, message) {
  git(dir, ['merge', '--no-ff', '-q', '-m', message, branch]);
  return git(dir, ['rev-parse', 'HEAD']);
}

function audit(dir, baseRef = 'main') {
  return auditMergeAttestations({ root: dir, baseRef });
}

// --- the audit finds what the incident left behind ---------------------------

test('a merge that no lane covered is a finding', () => {
  const dir = makeRepo();
  const branch = 'feature/uncovered';
  commitOnBranch(dir, branch, 'content nobody authorized');
  mergeBranch(dir, branch, 'merge the uncovered branch');
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  const findings = report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_NOT_COVERED);
  assert.equal(findings.length, 1);
  assert.equal(report.counts.UNCOVERED, 1);
});

test('a merge that a lane covered is passed', () => {
  const dir = makeRepo();
  const branch = 'feature/covered';
  const head = commitOnBranch(dir, branch, 'content a lane authorized');
  // The lane authorization is committed on the BASE branch before the merge.
  commitOnMain(dir, `${LANE_DIRECTORY}/lane-covered-20261021.json`, lane({ laneId: 'lane-covered-20261021', head }), 'authorize the lane');
  mergeBranch(dir, branch, 'merge the covered branch');
  const report = audit(dir);
  assert.equal(report.status, 'PASS');
  assert.equal(report.findings.length, 0);
  assert.equal(report.counts.COVERED, 1);
  const covered = report.lanes.find((entry) => entry.lane_id === 'lane-covered-20261021');
  assert.equal(covered.consumed, true);
  assert.equal(covered.covers.length, 1);
});

test('a lane that was committed AFTER the merge does not cover it', () => {
  const dir = makeRepo();
  const branch = 'feature/late-authorization';
  const head = commitOnBranch(dir, branch, 'content');
  mergeBranch(dir, branch, 'merge before the authorization');
  commitOnMain(dir, `${LANE_DIRECTORY}/lane-late-20261021.json`, lane({ laneId: 'lane-late-20261021', head }), 'authorize the lane after the fact');
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_NOT_COVERED).length, 1);
});

test('a merge before the lifecycle contract is a historical observation', () => {
  const dir = makeRepo({ lifecycleAware: false });
  const branch = 'feature/legacy';
  commitOnBranch(dir, branch, 'content');
  mergeBranch(dir, branch, 'merge before the enforcement');
  const report = audit(dir);
  assert.equal(report.status, 'PASS');
  assert.equal(report.counts.HISTORICAL_OBSERVATION, 1);
  assert.equal(report.findings.length, 0);
});

test('a governance act is exempt: it lands the lane and nothing else', () => {
  const dir = makeRepo();
  const branch = 'chore/lane-binding';
  // The lane binding lands as its own merge. It changes only the governance
  // surface, so it cannot carry content and it is exempt.
  git(dir, ['checkout', '-q', '-b', branch]);
  write(dir, `${LANE_DIRECTORY}/lane-binding-20261021.json`, lane({ laneId: 'lane-binding-20261021', head: 'a'.repeat(40) }));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'the lane binding']);
  git(dir, ['checkout', '-q', 'main']);
  mergeBranch(dir, branch, 'merge the lane binding');
  const report = audit(dir);
  assert.equal(report.status, 'PASS');
  assert.equal(report.counts.GOVERNANCE_ACT, 1);
});

test('a merge that carries content AND touches the governance surface is not exempt', () => {
  const dir = makeRepo();
  const branch = 'feature/smuggled';
  const head = commitOnBranch(dir, branch, 'content');
  git(dir, ['checkout', '-q', branch]);
  write(dir, `${LANE_DIRECTORY}/lane-smuggled-20261021.json`, lane({ laneId: 'lane-smuggled-20261021', head }));
  write(dir, 'smuggled.txt', 'content\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a lane and content in one change']);
  git(dir, ['checkout', '-q', 'main']);
  mergeBranch(dir, branch, 'merge the smuggled branch');
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_NOT_COVERED).length, 1);
});

test('a lane that covers two merges is a finding', () => {
  // Two merge commits that carry the same head are constructed with the git
  // plumbing: they cannot arise from an ordinary history, and the audit
  // still refuses them.
  const dir = makeRepo();
  const branch = 'feature/reused';
  const head = commitOnBranch(dir, branch, 'content');
  const base = git(dir, ['rev-parse', 'main']);
  commitOnMain(dir, `${LANE_DIRECTORY}/lane-reused-20261021.json`, lane({ laneId: 'lane-reused-20261021', head }), 'authorize the lane');
  const boundBase = git(dir, ['rev-parse', 'main']);
  const tree = git(dir, ['rev-parse', `${boundBase}^{tree}`]);
  const first = git(dir, ['commit-tree', tree, '-p', boundBase, '-p', head, '-m', 'the first merge of the same head']);
  git(dir, ['update-ref', 'refs/heads/main', first]);
  const second = git(dir, ['commit-tree', tree, '-p', first, '-p', head, '-m', 'the second merge of the same head']);
  git(dir, ['update-ref', 'refs/heads/main', second]);
  assert.notEqual(base, boundBase);
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  const reuse = report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_LANE_REUSED);
  assert.equal(reuse.length, 1);
});

test('a malformed lane record in the base tree is a finding', () => {
  const dir = makeRepo();
  const branch = 'feature/malformed-lane';
  commitOnBranch(dir, branch, 'content');
  commitOnMain(dir, `${LANE_DIRECTORY}/lane-broken-20261021.json`, '{not json\n', 'a malformed lane record');
  mergeBranch(dir, branch, 'merge with a malformed lane in the base tree');
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(
    report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_LANE_RECORD_MALFORMED).length >= 1,
    true
  );
});

test('a lane that binds another head does not cover the merge', () => {
  const dir = makeRepo();
  const branch = 'feature/wrong-binding';
  const head = commitOnBranch(dir, branch, 'content');
  commitOnMain(
    dir,
    `${LANE_DIRECTORY}/lane-wrong-20261021.json`,
    lane({ laneId: 'lane-wrong-20261021', head: 'a'.repeat(40) }),
    'authorize another head'
  );
  mergeBranch(dir, branch, 'merge the branch');
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_NOT_COVERED).length, 1);
});

test('a lane of the first generation does not cover a merge', () => {
  const dir = makeRepo();
  const branch = 'feature/legacy-lane';
  const head = commitOnBranch(dir, branch, 'content');
  // The lane of the first generation carries a binding as well: the
  // generation of the record decides, not the fields it happens to carry.
  commitOnMain(dir, `${LANE_DIRECTORY}/lane-legacy-20261021.json`, `${JSON.stringify({
    schema_version: '1.0.0',
    lane_id: 'lane-legacy-20261021',
    authority: 'canonical_owner',
    base_ref: 'main',
    head_ref: `branch/${branch}`,
    required_checks: ['loop-repo-ci'],
    authorized_head_sha: head
  }, null, 2)}\n`, 'a lane of the first generation');
  mergeBranch(dir, branch, 'merge the branch');
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_NOT_COVERED).length, 1);
});

test('a closed lane does not cover a merge', () => {
  const dir = makeRepo();
  const branch = 'feature/closed-lane';
  const head = commitOnBranch(dir, branch, 'content');
  commitOnMain(dir, `${LANE_DIRECTORY}/lane-closed-20261021.json`, lane({
    laneId: 'lane-closed-20261021',
    head,
    state: 'closed',
    extra: {
      closed_by: {
        pull_request: 1,
        merge_commit: 'b'.repeat(40),
        head_sha: head,
        closed_at: '2026-10-21T12:00:00Z'
      }
    }
  }), 'a closed lane');
  mergeBranch(dir, branch, 'merge the branch');
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.findings.filter((finding) => finding.code === AUDIT_CODES.MERGE_NOT_COVERED).length, 1);
});

// --- the audit fails closed --------------------------------------------------

test('the audit fails closed when the audited branch does not resolve', () => {
  const dir = makeRepo();
  assert.throws(() => audit(dir, 'no-such-branch'));
});

test('the audit resolves the published view of the branch', () => {
  const dir = makeRepo();
  const resolved = resolveBaseCommit(dir, 'main');
  assert.ok(resolved);
  assert.equal(resolved.commit, git(dir, ['rev-parse', 'HEAD']));
});

test('the scope rule reads the lifecycle contract of the base tree', () => {
  const dir = makeRepo();
  const head = git(dir, ['rev-parse', 'HEAD']);
  assert.equal(contractCarriesLifecycle(dir, head), true);
  const dir2 = makeRepo({ lifecycleAware: false });
  assert.equal(contractCarriesLifecycle(dir2, git(dir2, ['rev-parse', 'HEAD'])), false);
});

test('a clean repository without merges passes', () => {
  const dir = makeRepo();
  const report = audit(dir);
  assert.equal(report.status, 'PASS');
  assert.equal(report.merges_total, 0);
  assert.equal(report.findings.length, 0);
});

// --- the direct-push bypass class ---------------------------------------------

test('a direct push after the enforcement is a finding', () => {
  // The commit landed on the default branch with one parent: no pull
  // request, no merge commit, no second parent — no lane can ever cover it.
  const dir = makeRepo();
  write(dir, 'direct.txt', 'landed without a pull request\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a direct push']);
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  const findings = report.findings.filter((finding) => finding.code === AUDIT_CODES.DIRECT_PUSH_UNCOVERED);
  assert.equal(findings.length, 1);
  assert.equal(report.counts.DIRECT_PUSH_UNCOVERED, 1);
  assert.equal(report.merges_total, 0);
  assert.equal(report.landings_total, 2);
});

test('a direct push before the enforcement is a historical observation', () => {
  const dir = makeRepo({ lifecycleAware: false });
  write(dir, 'direct.txt', 'landed before the enforcement\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a direct push']);
  const report = audit(dir);
  assert.equal(report.status, 'PASS');
  assert.equal(report.findings.length, 0);
  assert.equal(report.counts.HISTORICAL_OBSERVATION, 1);
  assert.equal(report.counts.ROOT, 1);
});

test('a governance act cannot be landed by a direct push', () => {
  // The governance-act exemption exists for MERGES confined to the
  // governance surface; a direct push has no pull request at all and is a
  // finding even when it changes nothing but the lane surface.
  const dir = makeRepo();
  write(dir, `${LANE_DIRECTORY}/lane-direct-20261022.json`, lane({ laneId: 'lane-direct-20261022', head: 'a'.repeat(40) }));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a lane record pushed directly']);
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(
    report.findings.filter((finding) => finding.code === AUDIT_CODES.DIRECT_PUSH_UNCOVERED).length,
    1
  );
});

// --- the disposition baseline --------------------------------------------------

function commitBaseline(dir, entries) {
  return commitOnMain(dir, 'core/authority/merge-audit-baseline.json', `${JSON.stringify({
    schema_version: '1.0.0',
    known_findings: entries
  }, null, 2)}\n`, 'the merge audit baseline');
}

test('a recorded finding is reported and does not fail the gate', () => {
  const dir = makeRepo();
  write(dir, 'direct.txt', 'landed without a pull request\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a direct push']);
  const commit = git(dir, ['rev-parse', 'HEAD']);
  commitBaseline(dir, [{
    code: 'DIRECT_PUSH_UNCOVERED',
    commit,
    reason: 'the landing is recorded: it predates the activation of the platform protection and is disposed here as a governance act',
    disposition: 'RECORDED_AS_REAL_FINDING',
    recorded_at: '2026-10-22T16:30:00Z'
  }]);
  const report = audit(dir);
  assert.equal(report.status, 'PASS');
  assert.equal(report.baseline_present, true);
  assert.equal(report.disposed_findings.length, 1);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].code, AUDIT_CODES.DIRECT_PUSH_UNCOVERED);
});

test('a baseline entry that matches no finding is stale and fails the gate', () => {
  const dir = makeRepo();
  commitBaseline(dir, [{
    code: 'DIRECT_PUSH_UNCOVERED',
    commit: 'a'.repeat(40),
    reason: 'a disposition of history that is no longer observed',
    disposition: 'RECORDED_AS_REAL_FINDING',
    recorded_at: '2026-10-22T16:30:00Z'
  }]);
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(
    report.findings.filter((finding) => finding.code === AUDIT_CODES.BASELINE_STALE).length,
    1
  );
});

test('a malformed baseline fails the gate', () => {
  const dir = makeRepo();
  write(dir, 'direct.txt', 'x\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a landing']);
  write(dir, 'core/authority/merge-audit-baseline.json', '{not json\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a malformed baseline']);
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(
    report.findings.filter((finding) => finding.code === AUDIT_CODES.BASELINE_INVALID).length,
    1
  );
});

test('a baseline entry with a malformed shape fails the gate', () => {
  const dir = makeRepo();
  commitBaseline(dir, [{ code: 'DIRECT_PUSH_UNCOVERED', commit: 'nope', reason: '', disposition: '', recorded_at: '' }]);
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(
    report.findings.filter((finding) => finding.code === AUDIT_CODES.BASELINE_INVALID).length,
    1
  );
});

test('a baseline entry does not dispose a finding it does not name exactly', () => {
  const dir = makeRepo();
  write(dir, 'direct.txt', 'landed without a pull request\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a direct push']);
  const commit = git(dir, ['rev-parse', 'HEAD']);
  // A different code on the same commit does not match.
  commitBaseline(dir, [{
    code: 'MERGE_NOT_COVERED',
    commit,
    reason: 'a disposition of a different finding class',
    disposition: 'RECORDED_AS_REAL_FINDING',
    recorded_at: '2026-10-22T16:30:00Z'
  }]);
  const report = audit(dir);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.findings.filter((finding) => finding.code === AUDIT_CODES.DIRECT_PUSH_UNCOVERED).length, 1);
  assert.equal(report.findings.filter((finding) => finding.code === AUDIT_CODES.BASELINE_STALE).length, 1);
});
