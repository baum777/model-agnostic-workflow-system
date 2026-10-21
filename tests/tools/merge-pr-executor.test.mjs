// MAWS vNext — the lane-bound pull-request merge executor.
//
// The test that matters most here is the negative one: a FOREIGN pull
// request that exists, is open, is mergeable and carries a valid head sha
// must NOT be mergeable through this executor, because it does not belong
// to the authorized work lane. That is the exact shape of the cross-lane
// merge incident of 2026-10-21.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  MERGE_EXECUTOR_CODES,
  CANONICAL_MERGE_AUTHORITY,
  AUTHORIZATION_FIELDS,
  evaluateMergeAuthorization,
  isDescendantCommit,
  laneAuthorizationPath,
  loadLaneAuthorization,
  mergePullRequest,
  MergeExecutorError,
  normalizeObservation,
  parseLaneAuthorization,
  resolveLanePullRequest,
  runLocalGates,
  runMergeExecutor,
  verifyMerge
} from '../../scripts/tools/merge-pr-executor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXECUTOR = path.join(ROOT, 'scripts', 'tools', 'merge-pr-executor.mjs');

const LANE_ID = 'merge-incident-closure-20261021';
const LANE_HEAD_REF = 'docs/merge-incident-closure-20261021';
const FOREIGN_HEAD_REF = 'feature/source-security-scan-20261021';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

// A repository whose base commit carries the lane authorization. The
// authorization is committed on the base branch: the surface that
// authorizes a merge must not be the pull request that wants to be merged.
function makeRepo({ authorization = laneAuthorization(), commitAuthorization = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-merge-executor-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'executor-test@unitera.systems']);
  git(dir, ['config', 'user.name', 'merge executor test']);
  const relative = laneAuthorizationPath(LANE_ID);
  const absolute = path.join(dir, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(authorization, null, 2)}\n`);
  if (commitAuthorization) {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'lane authorization']);
  } else {
    git(dir, ['commit', '-q', '--allow-empty', '-m', 'empty base without the authorization']);
  }
  const baseCommit = git(dir, ['rev-parse', 'HEAD']);
  return { dir, relative, baseCommit };
}

// A second commit on the lane branch: the head the lane would merge.
function commitOnBranch(dir, message) {
  fs.writeFileSync(path.join(dir, 'lane-head.txt'), `${message}\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', message]);
  return git(dir, ['rev-parse', 'HEAD']);
}

function laneAuthorization(overrides = {}) {
  return {
    schema_version: '1.0.0',
    lane_id: LANE_ID,
    authority: CANONICAL_MERGE_AUTHORITY,
    base_ref: 'main',
    head_ref: LANE_HEAD_REF,
    required_checks: ['loop-repo-ci'],
    required_local_gates: [],
    ...overrides
  };
}

function lanePullRequest(overrides = {}) {
  return {
    number: 72,
    state: 'OPEN',
    mergeable: 'MERGEABLE',
    baseRefName: 'main',
    baseRefOid: '0'.repeat(40),
    headRefName: LANE_HEAD_REF,
    headRefOid: 'a'.repeat(40),
    headRepositoryOwner: { login: 'baum777' },
    title: 'the lane pull request',
    statusCheckRollup: [{ name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    ...overrides
  };
}

// The foreign pull request: it exists, it is open, it is mergeable and it
// carries a perfectly valid head sha. Only its lane is foreign.
function foreignPullRequest(overrides = {}) {
  return {
    number: 69,
    state: 'OPEN',
    mergeable: 'MERGEABLE',
    baseRefName: 'main',
    baseRefOid: '0'.repeat(40),
    headRefName: FOREIGN_HEAD_REF,
    headRefOid: 'b'.repeat(40),
    headRepositoryOwner: { login: 'baum777' },
    title: 'the foreign lane pull request',
    statusCheckRollup: [{ name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    ...overrides
  };
}

function observation(pullRequests) {
  return normalizeObservation({ pull_requests: pullRequests });
}

function decide({ authorization = laneAuthorization(), pullRequests, target = {}, headAuthorized = null }) {
  return evaluateMergeAuthorization({
    authorization,
    observation: observation(pullRequests),
    target,
    headAuthorized
  });
}

// --- the authorization is the authority surface ------------------------------

test('the lane authorization is read from the base commit, not from the working tree', () => {
  const { dir, relative, baseCommit } = makeRepo();
  // A working tree change that would authorize a foreign head is invisible:
  // the authority surface is the base commit's tree.
  fs.writeFileSync(
    path.join(dir, relative),
    `${JSON.stringify(laneAuthorization({ head_ref: FOREIGN_HEAD_REF }), null, 2)}\n`
  );
  const { authorization, commit } = loadLaneAuthorization({ root: dir, baseCommit, laneId: LANE_ID });
  assert.equal(authorization.head_ref, LANE_HEAD_REF);
  assert.equal(commit, baseCommit);
});

test('a pull request that introduces its own authorization is not authorized by it', () => {
  // The base commit does not carry the authorization; the lane branch
  // introduces it. The base commit the pull request merges into therefore
  // does not authorize it.
  const { dir } = makeRepo({ commitAuthorization: false });
  const baseCommit = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '-b', 'lane-branch']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'lane branch introduces the authorization']);
  const head = git(dir, ['rev-parse', 'HEAD']);
  assert.equal(isDescendantCommit({ root: dir, ancestor: baseCommit, descendant: head }), true);
  assert.throws(
    () => loadLaneAuthorization({ root: dir, baseCommit, laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT
  );
});

test('a lane without an authorization on the base branch is refused', () => {
  const { dir, baseCommit } = makeRepo();
  assert.throws(
    () => loadLaneAuthorization({ root: dir, baseCommit, laneId: 'other-lane-20261021' }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT
  );
});

test('a base commit that is not a commit identity is refused', () => {
  const { dir } = makeRepo();
  assert.throws(
    () => loadLaneAuthorization({ root: dir, baseCommit: 'not-a-sha', laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT
  );
});

test('a lane id that could traverse out of the authorization surface is refused', () => {
  for (const laneId of ['../escape', 'a/../../b', 'UPPER', 'with space', 'with/slash', '']) {
    assert.throws(
      () => laneAuthorizationPath(laneId),
      (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      `the lane id "${laneId}" must be refused`
    );
  }
});

test('a malformed lane authorization is refused as a shape failure', () => {
  assert.throws(
    () => parseLaneAuthorization('{not json', { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ schema_version: '2.0.0' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ lane_id: 'another-lane' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
});

test('a lane authorization with a malformed ref, digest or check list is refused', () => {
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ head_ref: 'bad ref' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ base_ref: '' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ required_checks: 'loop-repo-ci' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ authorized_commit: 'zz' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ authorized_head_sha: 'zz' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
});

test('a lane authorization with an unknown field is refused', () => {
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify({ ...laneAuthorization(), surprise: true }), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
});

test('a lane that demands neither a check nor a local gate is refused', () => {
  // The incident's precondition: a merge that needs no green check.
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ required_checks: [], required_local_gates: [] })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID
  );
});

test('a lane authorization that names another authority is refused as an authority failure', () => {
  assert.throws(
    () => parseLaneAuthorization(JSON.stringify(laneAuthorization({ authority: 'self_declared_owner' })), { laneId: LANE_ID }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LANE_AUTHORITY_MISMATCH
  );
});

// --- the positive path -------------------------------------------------------

test('the merge target of the authorized lane is allowed', () => {
  const decision = decide({ pullRequests: [lanePullRequest()] });
  assert.equal(decision.allowed, true);
  assert.equal(decision.pull_request.number, 72);
  assert.equal(decision.pull_request.head_sha, 'a'.repeat(40));
});

test('the lane pull request is resolved from the lane, not from an asserted number', () => {
  const resolved = resolveLanePullRequest({
    observation: observation([foreignPullRequest(), lanePullRequest()]),
    headRef: LANE_HEAD_REF
  });
  assert.equal(resolved.number, 72);
});

test('a lane without an open pull request is refused', () => {
  const decision = decide({ pullRequests: [lanePullRequest({ state: 'MERGED' })] });
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.PR_NOT_OPEN);
});

test('a lane without any pull request is refused', () => {
  const decision = decide({ pullRequests: [foreignPullRequest()] });
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.LANE_PULL_REQUEST_ABSENT);
});

test('two pull requests on the lane head branch are refused as ambiguous', () => {
  const decision = decide({ pullRequests: [lanePullRequest(), lanePullRequest({ number: 73 })] });
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.LANE_PULL_REQUEST_AMBIGUOUS);
});

test('a pull request of another repository is not the lane pull request', () => {
  const decision = decide({
    authorization: laneAuthorization({ head_repository: 'baum777' }),
    pullRequests: [lanePullRequest({ headRepositoryOwner: { login: 'someone-else' } })]
  });
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.LANE_PULL_REQUEST_ABSENT);
});

// --- THE negative path: the incident of 2026-10-21 ---------------------------

test('a foreign pull request with a valid head is refused: the incident class', () => {
  // The foreign pull request exists, is OPEN, is MERGEABLE and carries a
  // valid head sha. It is refused because it does not belong to the
  // authorized lane — nothing else about it is wrong.
  const decision = decide({
    pullRequests: [foreignPullRequest(), lanePullRequest()],
    target: { number: 69, head_ref: FOREIGN_HEAD_REF, head_sha: 'b'.repeat(40) }
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.PR_IDENTITY_MISMATCH);
});

test('a foreign head branch is refused even when the asserted number is the lane number', () => {
  const decision = decide({
    pullRequests: [foreignPullRequest(), lanePullRequest()],
    target: { number: 72, head_ref: FOREIGN_HEAD_REF, head_sha: 'b'.repeat(40) }
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.LANE_MISMATCH);
});

test('a head sha that moved after the review is refused', () => {
  const decision = decide({
    pullRequests: [lanePullRequest()],
    target: { number: 72, head_sha: 'b'.repeat(40) }
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.HEAD_SHA_MISMATCH);
});

test('a head sha the lane did not authorize is refused', () => {
  const decision = decide({
    authorization: laneAuthorization({ authorized_head_sha: 'c'.repeat(40) }),
    pullRequests: [lanePullRequest()]
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.HEAD_SHA_MISMATCH);
});

test('a head sha that is not a commit identity is refused', () => {
  const decision = decide({ pullRequests: [lanePullRequest({ headRefOid: '' })] });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.HEAD_SHA_INVALID);
});

test('a head that does not descend from the authorized commit is refused', () => {
  const decision = decide({
    authorization: laneAuthorization({ authorized_commit: 'c'.repeat(40) }),
    pullRequests: [lanePullRequest()],
    headAuthorized: false
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.HEAD_NOT_AUTHORIZED);
});

test('the ancestry gate fails closed when the ancestry was not established', () => {
  // The exported API must not answer "allowed" merely because the caller
  // forgot to establish the ancestry.
  const decision = decide({
    authorization: laneAuthorization({ authorized_commit: 'c'.repeat(40) }),
    pullRequests: [lanePullRequest()],
    headAuthorized: null
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.HEAD_NOT_AUTHORIZED);
});

test('the ancestry gate passes for a real descendant', () => {
  const { dir, baseCommit } = makeRepo();
  const head = commitOnBranch(dir, 'lane head');
  const decision = decide({
    authorization: laneAuthorization({ authorized_commit: baseCommit }),
    pullRequests: [lanePullRequest({ headRefOid: head })],
    headAuthorized: isDescendantCommit({ root: dir, ancestor: baseCommit, descendant: head })
  });
  assert.equal(decision.allowed, true);
});

test('a base branch that differs from the authorized one is refused', () => {
  const decision = decide({ pullRequests: [lanePullRequest({ baseRefName: 'release' })] });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.BASE_REF_MISMATCH);
});

test('a base branch that only looks like the authorized one is refused', () => {
  // "origin/main" and "main" are different branches; the comparison is
  // exact, so a normalization cannot make them equal.
  const decision = decide({ pullRequests: [lanePullRequest({ baseRefName: 'origin/main' })] });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.BASE_REF_MISMATCH);
});

test('a pull request that is not mergeable is refused', () => {
  const decision = decide({ pullRequests: [lanePullRequest({ mergeable: 'CONFLICTING' })] });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.PR_NOT_MERGEABLE);
});

test('a pull request whose mergeability is not yet known is refused', () => {
  const decision = decide({ pullRequests: [lanePullRequest({ mergeable: 'UNKNOWN' })] });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.PR_NOT_MERGEABLE);
});

test('a required check that did not succeed is refused', () => {
  // The state of the merged pull request of 2026-10-21: the hosted check
  // was FAILING when the merge went through.
  const decision = decide({
    pullRequests: [lanePullRequest({
      statusCheckRollup: [{ name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'FAILURE' }]
    })]
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.CHECK_FAILED);
});

test('a required check that is not observed at all is refused', () => {
  const decision = decide({ pullRequests: [lanePullRequest({ statusCheckRollup: [] })] });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.CHECK_MISSING);
});

test('a required check that did not run is refused', () => {
  const decision = decide({
    pullRequests: [lanePullRequest({
      statusCheckRollup: [{ name: 'loop-repo-ci', status: 'QUEUED', conclusion: null }]
    })]
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.CHECK_FAILED);
});

test('a duplicate observation of the required check must not resolve to the passing one', () => {
  const decision = decide({
    pullRequests: [lanePullRequest({
      statusCheckRollup: [
        { name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'FAILURE' }
      ]
    })]
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.CHECK_FAILED);
});

test('a check of another name does not satisfy the required check', () => {
  const decision = decide({
    pullRequests: [lanePullRequest({
      statusCheckRollup: [{ name: 'some-other-check', status: 'COMPLETED', conclusion: 'SUCCESS' }]
    })]
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.CHECK_MISSING);
});

test('a lane that requires no hosted check is not blocked by an unrequired failing check', () => {
  // The check stays VISIBLE in the receipt; it is the lane's own policy
  // that decides whether it is required. The lane still demands a local
  // gate, so it is not a lane without a verification.
  const decision = decide({
    authorization: laneAuthorization({ required_checks: [], required_local_gates: ['test:vnext'] }),
    pullRequests: [lanePullRequest({
      statusCheckRollup: [{ name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'FAILURE' }]
    })]
  });
  assert.equal(decision.allowed, true);
});

test('a malformed observation is refused', () => {
  assert.throws(
    () => normalizeObservation({}),
    (error) => error.code === MERGE_EXECUTOR_CODES.OBSERVATION_INVALID
  );
  assert.throws(
    () => normalizeObservation({ pull_requests: [{ number: 'x' }] }),
    (error) => error.code === MERGE_EXECUTOR_CODES.OBSERVATION_INVALID
  );
  assert.throws(
    () => normalizeObservation({ pull_requests: ['not an object'] }),
    (error) => error.code === MERGE_EXECUTOR_CODES.OBSERVATION_INVALID
  );
});

// --- the merge step and its readback ----------------------------------------

function fakeRunner(responses) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    for (const [matcher, response] of responses) {
      if (args.join(' ').includes(matcher)) {
        if (response instanceof Error) throw response;
        return typeof response === 'string' ? response : JSON.stringify(response);
      }
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  runner.calls = calls;
  return runner;
}

test('the merge is issued with the reviewed head sha', () => {
  const runner = fakeRunner([['merge', { merged: true, sha: 'd'.repeat(40) }]]);
  const merged = mergePullRequest({ repo: 'owner/name', number: 72, headSha: 'a'.repeat(40), runner });
  assert.equal(merged.merged, true);
  const call = runner.calls.find((args) => args.join(' ').includes('merge'));
  assert.ok(call.includes(`sha=${'a'.repeat(40)}`));
  assert.ok(call.includes('repos/owner/name/pulls/72/merge'));
});

test('a server that refuses the merge is refused with the server message', () => {
  const runner = fakeRunner([['merge', { merged: false, message: 'Pull Request is not mergeable' }]]);
  assert.throws(
    () => mergePullRequest({ repo: 'owner/name', number: 72, headSha: 'a'.repeat(40), runner }),
    (error) => error.code === MERGE_EXECUTOR_CODES.MERGE_REFUSED
      && error.message.includes('not mergeable')
  );
});

test('the readback requires the merge commit to carry the reviewed head among its parents', () => {
  const runner = fakeRunner([
    ['pr view', { state: 'MERGED', mergedAt: '2026-10-21T12:00:00Z', mergeCommit: { oid: 'd'.repeat(40) } }],
    ['commits/', { parents: [{ sha: 'a'.repeat(40) }, { sha: 'e'.repeat(40) }] }]
  ]);
  const verified = verifyMerge({ repo: 'owner/name', number: 72, headSha: 'a'.repeat(40), runner });
  assert.equal(verified.merge_commit, 'd'.repeat(40));
  assert.deepEqual(verified.parents, ['a'.repeat(40), 'e'.repeat(40)]);
});

test('a merge commit that does not carry the reviewed head is refused', () => {
  const runner = fakeRunner([
    ['pr view', { state: 'MERGED', mergedAt: null, mergeCommit: { oid: 'd'.repeat(40) } }],
    ['commits/', { parents: [{ sha: 'f'.repeat(40) }] }]
  ]);
  assert.throws(
    () => verifyMerge({ repo: 'owner/name', number: 72, headSha: 'a'.repeat(40), runner }),
    (error) => error.code === MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED
  );
});

test('a readback that does not report MERGED is refused', () => {
  // The merge commit and its parents are present and correct: only the
  // state of the pull request can catch this case.
  const runner = fakeRunner([
    ['pr view', { state: 'OPEN', mergedAt: null, mergeCommit: { oid: 'd'.repeat(40) } }],
    ['commits/', { parents: [{ sha: 'a'.repeat(40) }] }]
  ]);
  assert.throws(
    () => verifyMerge({ repo: 'owner/name', number: 72, headSha: 'a'.repeat(40), runner }),
    (error) => error.code === MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED
      && /not MERGED/.test(error.message)
  );
});

test('a readback without a merge commit is refused', () => {
  const runner = fakeRunner([['pr view', { state: 'MERGED', mergedAt: null, mergeCommit: null }]]);
  assert.throws(
    () => verifyMerge({ repo: 'owner/name', number: 72, headSha: 'a'.repeat(40), runner }),
    (error) => error.code === MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED
  );
});

// --- the CLI -----------------------------------------------------------------

function runCli(args, { cwd = ROOT } = {}) {
  const result = spawnSync('node', [EXECUTOR, ...args], { cwd, encoding: 'utf8' });
  let receipt = null;
  try {
    receipt = JSON.parse(result.stdout);
  } catch {
    receipt = null;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, receipt };
}

function writeObservation(dir, pullRequests) {
  const observationPath = path.join(dir, 'observation.json');
  fs.writeFileSync(observationPath, JSON.stringify({ pull_requests: pullRequests }, null, 2));
  return observationPath;
}

test('the CLI refuses a swapped target and names the refusal code', () => {
  const { dir, baseCommit } = makeRepo();
  const observationPath = writeObservation(dir, [
    foreignPullRequest({ baseRefOid: baseCommit }),
    lanePullRequest({ baseRefOid: baseCommit })
  ]);
  const result = runCli([
    '--lane', LANE_ID,
    '--root', dir,
    '--head-ref', LANE_HEAD_REF,
    '--observation', observationPath,
    '--pr', '69'
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.PR_IDENTITY_MISMATCH);
  assert.equal(result.receipt.ok, false);
  assert.equal(result.receipt.decision, 'REFUSE');
});

test('the CLI refuses a head branch that is not the lane branch', () => {
  const { dir, baseCommit } = makeRepo();
  const observationPath = writeObservation(dir, [foreignPullRequest({ baseRefOid: baseCommit })]);
  const result = runCli([
    '--lane', LANE_ID,
    '--root', dir,
    '--head-ref', FOREIGN_HEAD_REF,
    '--observation', observationPath
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.LANE_MISMATCH);
});

test('the CLI refuses a failing required check and names the refusal code', () => {
  const { dir, baseCommit } = makeRepo();
  const observationPath = writeObservation(dir, [lanePullRequest({
    baseRefOid: baseCommit,
    statusCheckRollup: [{ name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'FAILURE' }]
  })]);
  const result = runCli([
    '--lane', LANE_ID,
    '--root', dir,
    '--head-ref', LANE_HEAD_REF,
    '--observation', observationPath
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.CHECK_FAILED);
});

test('the CLI allows the lane pull request and reports the observed checks', () => {
  const { dir, baseCommit } = makeRepo();
  const observationPath = writeObservation(dir, [lanePullRequest({ baseRefOid: baseCommit })]);
  const result = runCli([
    '--lane', LANE_ID,
    '--root', dir,
    '--head-ref', LANE_HEAD_REF,
    '--observation', observationPath
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.receipt.ok, true);
  assert.equal(result.receipt.decision, 'ALLOW');
  assert.equal(result.receipt.merged, false);
  assert.equal(result.receipt.pull_request, 72);
  assert.equal(result.receipt.checks.length, 1);
});

test('the CLI reports an unrequired failing check as a warning, not as a silent pass', () => {
  // The lane requires no hosted check (the hosted CI is billing-blocked on
  // this repository), so the merge path is not blocked — but the failing
  // hosted check stays visible in the receipt.
  const { dir, baseCommit } = makeRepo({
    authorization: laneAuthorization({ required_checks: [], required_local_gates: [] })
  });
  const observationPath = writeObservation(dir, [lanePullRequest({
    baseRefOid: baseCommit,
    statusCheckRollup: [{ name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'FAILURE' }]
  })]);
  const result = runCli([
    '--lane', LANE_ID,
    '--root', dir,
    '--head-ref', LANE_HEAD_REF,
    '--observation', observationPath
  ]);
  // The lane demands nothing at all: that is refused as a malformed
  // authorization, not silently accepted.
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID);
});

test('the CLI reports an unrequired failing check as a warning when the lane demands a local gate', () => {
  const { dir, baseCommit } = makeRepo({
    authorization: laneAuthorization({ required_checks: [], required_local_gates: ['test:merge-executor'] })
  });
  const observationPath = writeObservation(dir, [lanePullRequest({
    baseRefOid: baseCommit,
    statusCheckRollup: [{ name: 'loop-repo-ci', status: 'COMPLETED', conclusion: 'FAILURE' }]
  })]);
  const result = runCli([
    '--lane', LANE_ID,
    '--root', dir,
    '--head-ref', LANE_HEAD_REF,
    '--observation', observationPath
  ]);
  assert.equal(result.status, 1);
  // The local gate cannot pass here: the working tree is not at the
  // reviewed head of the fixture, and the gate refuses before it runs.
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.LOCAL_GATE_FAILED);
});

test('the CLI refuses a lane without an authorization on the base branch', () => {
  const { dir, baseCommit } = makeRepo();
  const observationPath = writeObservation(dir, [lanePullRequest({ baseRefOid: baseCommit })]);
  const result = runCli([
    '--lane', 'other-lane-20261021',
    '--root', dir,
    '--head-ref', LANE_HEAD_REF,
    '--observation', observationPath
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT);
});

test('the CLI refuses a merge that runs on a supplied observation file', () => {
  const { dir, baseCommit } = makeRepo();
  const observationPath = writeObservation(dir, [lanePullRequest({ baseRefOid: baseCommit })]);
  const result = runCli([
    '--lane', LANE_ID,
    '--root', dir,
    '--repo', 'owner/name',
    '--head-ref', LANE_HEAD_REF,
    '--observation', observationPath,
    '--expected-head-sha', 'a'.repeat(40),
    '--apply'
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.OBSERVATION_INVALID);
  assert.equal(result.receipt.merged, false);
});

test('the CLI refuses a merge without a declared reviewed head', () => {
  const result = runCli([
    '--lane', LANE_ID,
    '--repo', 'owner/name',
    '--apply'
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.HEAD_SHA_MISMATCH);
});

test('the CLI refuses a merge without a repository', () => {
  const result = runCli([
    '--lane', LANE_ID,
    '--expected-head-sha', 'a'.repeat(40),
    '--apply'
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.code, MERGE_EXECUTOR_CODES.MERGE_REFUSED);
});

// --- the whole merge path, with every external access injected ---------------

function mergePathDeps({ baseCommit, pullRequests, defaultBranch = 'main', localRepo = 'owner/name' }) {
  const calls = { merged: [], verified: [], observations: [] };
  return {
    calls,
    deps: {
      fetchRepositoryDefaultBranch: () => defaultBranch,
      fetchBranchTip: ({ branch }) => {
        calls.observations.push({ branch });
        return baseCommit;
      },
      fetchObservation: ({ headRef }) => {
        calls.observations.push({ headRef });
        return observation(pullRequests);
      },
      localOriginRepository: () => localRepo,
      mergePullRequest: (input) => {
        calls.merged.push(input);
        return { merged: true, sha: 'd'.repeat(40) };
      },
      verifyMerge: (input) => {
        calls.verified.push(input);
        return { merge_commit: 'd'.repeat(40), merged_at: '2026-10-21T12:00:00Z', parents: [input.headSha] };
      }
    }
  };
}

test('the merge path reads the lane authorization from the repository default branch tip', () => {
  const { dir, baseCommit } = makeRepo();
  const head = commitOnBranch(dir, 'lane head');
  const { deps, calls } = mergePathDeps({
    baseCommit,
    pullRequests: [lanePullRequest({ headRefOid: head, baseRefOid: baseCommit })]
  });
  const { status, receipt } = runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': head },
    root: dir,
    deps
  });
  assert.equal(status, 0);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.merged, true);
  assert.equal(receipt.base_commit, baseCommit);
  assert.equal(receipt.base_commit_source, 'github');
  assert.equal(receipt.merge_commit, 'd'.repeat(40));
  assert.deepEqual(calls.observations, [{ branch: 'main' }, { headRef: LANE_HEAD_REF }]);
});

test('the merge is issued with the reviewed head sha and read back against it', () => {
  const { dir, baseCommit } = makeRepo();
  const head = commitOnBranch(dir, 'lane head');
  const { deps, calls } = mergePathDeps({
    baseCommit,
    pullRequests: [lanePullRequest({ headRefOid: head, baseRefOid: baseCommit })]
  });
  runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': head },
    root: dir,
    deps
  });
  assert.equal(calls.merged.length, 1);
  assert.equal(calls.merged[0].headSha, head);
  assert.equal(calls.merged[0].number, 72);
  assert.equal(calls.verified.length, 1);
  assert.equal(calls.verified[0].headSha, head);
});

test('a lane that authorizes another base branch than the repository default is refused', () => {
  // The pull request merges into the very branch the lane authorizes, so
  // only the repository's own default branch can catch this case.
  const { dir, baseCommit } = makeRepo({
    authorization: laneAuthorization({ base_ref: 'release' })
  });
  const { deps } = mergePathDeps({
    baseCommit,
    pullRequests: [lanePullRequest({ baseRefOid: baseCommit, baseRefName: 'release' })]
  });
  const { status, receipt } = runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': 'a'.repeat(40) },
    root: dir,
    deps
  });
  assert.equal(status, 1);
  assert.equal(receipt.code, MERGE_EXECUTOR_CODES.BASE_REF_MISMATCH);
  assert.match(receipt.message, /default branch/);
  assert.equal(receipt.merged, false);
});

test('a local checkout of another repository cannot authorize a merge here', () => {
  const { dir, baseCommit } = makeRepo();
  const { deps } = mergePathDeps({
    baseCommit,
    pullRequests: [lanePullRequest({ baseRefOid: baseCommit })],
    localRepo: 'someone-else/name'
  });
  const { status, receipt } = runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': 'a'.repeat(40) },
    root: dir,
    deps
  });
  assert.equal(status, 1);
  assert.equal(receipt.code, MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT);
  assert.equal(receipt.merged, false);
});

test('a merge the server refuses is reported as a refusal, not as a success', () => {
  const { dir, baseCommit } = makeRepo();
  const { deps } = mergePathDeps({
    baseCommit,
    pullRequests: [lanePullRequest({ baseRefOid: baseCommit })]
  });
  deps.mergePullRequest = () => {
    throw new MergeExecutorError(MERGE_EXECUTOR_CODES.MERGE_REFUSED, 'the server refused the merge');
  };
  const { status, receipt } = runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': 'a'.repeat(40) },
    root: dir,
    deps
  });
  assert.equal(status, 1);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.merged, false);
  assert.equal(receipt.code, MERGE_EXECUTOR_CODES.MERGE_REFUSED);
});

test('a readback that does not carry the reviewed head refuses the merge', () => {
  const { dir, baseCommit } = makeRepo();
  const { deps } = mergePathDeps({
    baseCommit,
    pullRequests: [lanePullRequest({ baseRefOid: baseCommit })]
  });
  deps.verifyMerge = () => {
    throw new MergeExecutorError(
      MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED,
      'the merge commit does not carry the reviewed head among its parents'
    );
  };
  const { status, receipt } = runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': 'a'.repeat(40) },
    root: dir,
    deps
  });
  assert.equal(status, 1);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.merged, false);
  assert.equal(receipt.code, MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED);
});

test('a foreign pull request is refused in the merge path as well', () => {
  const { dir, baseCommit } = makeRepo();
  const { deps, calls } = mergePathDeps({
    baseCommit,
    pullRequests: [foreignPullRequest({ baseRefOid: baseCommit }), lanePullRequest({ baseRefOid: baseCommit })]
  });
  const { status, receipt } = runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': 'a'.repeat(40), pr: '69' },
    root: dir,
    deps
  });
  assert.equal(status, 1);
  assert.equal(receipt.code, MERGE_EXECUTOR_CODES.PR_IDENTITY_MISMATCH);
  assert.equal(calls.merged.length, 0);
});

// --- the local gates ---------------------------------------------------------

test('a local gate that cannot bind to the reviewed head is refused', () => {
  const { dir } = makeRepo();
  assert.throws(
    () => runLocalGates({ root: dir, headSha: 'a'.repeat(40), gates: ['test:vnext'] }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LOCAL_GATE_FAILED
      && /reviewed head/.test(error.message)
  );
});

test('a local gate that fails refuses the merge', () => {
  const { dir } = makeRepo();
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: 'gate-fixture',
    private: true,
    scripts: { 'failing-gate': 'node -e "process.exit(3)"' }
  }, null, 2)}\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'a failing gate']);
  const head = git(dir, ['rev-parse', 'HEAD']);
  assert.throws(
    () => runLocalGates({ root: dir, headSha: head, gates: ['failing-gate'] }),
    (error) => error.code === MERGE_EXECUTOR_CODES.LOCAL_GATE_FAILED
  );
});

// --- the contract and the implementation must agree ---------------------------

test('the lane authorization contract and the implementation declare the same fields', () => {
  // Two statements of the same thing drift silently unless something binds
  // them. The contract is closed, so the implementation must know exactly
  // the same field set.
  const schema = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'core/contracts/merge-lane-authorization.schema.json'),
    'utf8'
  ));
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    [...AUTHORIZATION_FIELDS].sort()
  );
  assert.equal(schema.additionalProperties, false);
});

test('a GitHub read that fails is a typed refusal, not a partial merge', () => {
  const { dir, baseCommit } = makeRepo();
  const { deps } = mergePathDeps({
    baseCommit,
    pullRequests: [lanePullRequest({ baseRefOid: baseCommit })]
  });
  deps.fetchObservation = () => {
    throw new MergeExecutorError(MERGE_EXECUTOR_CODES.GITHUB_ACCESS_FAILED, 'the GitHub read failed');
  };
  const { status, receipt } = runMergeExecutor({
    args: { lane: LANE_ID, repo: 'owner/name', apply: true, 'expected-head-sha': 'a'.repeat(40) },
    root: dir,
    deps
  });
  assert.equal(status, 1);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.merged, false);
  assert.equal(receipt.code, MERGE_EXECUTOR_CODES.GITHUB_ACCESS_FAILED);
});

test('a continued lane resolves to the open pull request, not to the merged one', () => {
  // A branch that was already merged and is continued by a new pull request
  // must not make the lane ambiguous: the open pull request is the lane's.
  const merged = lanePullRequest({ number: 75, state: 'MERGED' });
  const open = lanePullRequest({ number: 76, state: 'OPEN' });
  const resolved = resolveLanePullRequest({
    observation: observation([merged, open]),
    headRef: LANE_HEAD_REF
  });
  assert.equal(resolved.number, 76);
  assert.equal(resolved.state, 'OPEN');
});

test('two open pull requests on the lane head branch stay ambiguous', () => {
  const decision = decide({
    pullRequests: [lanePullRequest(), lanePullRequest({ number: 73 })]
  });
  assert.equal(decision.code, MERGE_EXECUTOR_CODES.LANE_PULL_REQUEST_AMBIGUOUS);
});
