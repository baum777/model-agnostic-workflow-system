#!/usr/bin/env node
// MAWS vNext — lane-bound pull-request merge executor.
//
// The incident of 2026-10-21 (the cross-lane merge incident): an operator
// command that was meant to merge the pull request it had just created
// addressed a DIFFERENT pull request number, and that foreign pull request —
// a mergeable, freshly created pull request of a parallel lane — was merged
// to main under the wrong command. The merge itself succeeded, the content
// was coherent, and the damage was to the PROCESS, not to the tree: the
// merge target was a caller-asserted number and nothing in the path
// compared it with the work lane the command was actually about.
//
// This module makes the merge target DERIVED and CROSS-CHECKED:
//
//   1. The authorized work lane is not a caller argument. It is a lane
//      authorization record committed in the canonical governance surface
//      of the repository (core/authority/merge-authorizations/<lane>.json),
//      and it is read from the TIP of the repository's DEFAULT BRANCH as
//      GitHub reports it — never from the working tree, never from a
//      caller-named ref, and never from the pull request that wants to be
//      merged. A pull request that introduces its own authorization is
//      therefore not authorized by it: the base branch it merges into does
//      not carry it.
//   1a. The lane must demand something. A lane that requires neither a
//      hosted check nor a local gate is refused as a malformed
//      authorization: a merge that needs no green check is exactly the
//      precondition of the incident.
//   1b. A local gate runs against a working tree whose HEAD is the reviewed
//      head, so it verifies the content that is about to be merged. It is a
//      LOCAL result and is never presented as a hosted CI result.
//   2. The merge target is resolved FROM the lane: the pull request whose
//      head branch is the lane's head branch. The operator may name a
//      target, but a named target that is not the lane's pull request is
//      refused — the foreign pull request can never be the target.
//   3. The observation is never caller-authored in the merge path. A merge
//      re-reads the pull request live from GitHub; a supplied observation
//      file is a read-only evaluation input and is refused with --apply.
//   4. Every binding is checked fail-closed and in this order: the pull
//      request identity, the lane membership (the head branch), the
//      declared head sha, the base branch, the authority, the state, the
//      mergeability, the required hosted checks and the required local
//      gates.
//
// Approval != Grant: a lane authorization is a gate of the merge path. It
// grants no capability, no permission and no runtime authority, and it
// publishes no owner key. The repository's canonical owner trust anchor
// (core/contracts/owner-authority.json) is PENDING_PUBLICATION and holds no
// key, so the authority surface of a merge is the base-branch-committed
// lane authorization, and this tool makes no claim of a signature-grade
// authority.
//
// This tool is a merge PATH, not an enforced gate of the repository: the
// repository carries no branch protection, so using it is an operator
// decision. It binds the target when it is used; it does not make the
// repository use it.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const MERGE_EXECUTOR_CODES = Object.freeze({
  LANE_AUTHORIZATION_ABSENT: 'MERGE_LANE_AUTHORIZATION_ABSENT',
  LANE_AUTHORIZATION_INVALID: 'MERGE_LANE_AUTHORIZATION_INVALID',
  LANE_AUTHORITY_MISMATCH: 'MERGE_LANE_AUTHORITY_MISMATCH',
  LANE_PULL_REQUEST_ABSENT: 'MERGE_LANE_PULL_REQUEST_ABSENT',
  LANE_PULL_REQUEST_AMBIGUOUS: 'MERGE_LANE_PULL_REQUEST_AMBIGUOUS',
  PR_IDENTITY_MISMATCH: 'MERGE_PR_IDENTITY_MISMATCH',
  LANE_MISMATCH: 'MERGE_LANE_MISMATCH',
  BASE_REF_MISMATCH: 'MERGE_BASE_REF_MISMATCH',
  HEAD_SHA_MISMATCH: 'MERGE_HEAD_SHA_MISMATCH',
  HEAD_SHA_INVALID: 'MERGE_HEAD_SHA_INVALID',
  HEAD_NOT_AUTHORIZED: 'MERGE_HEAD_NOT_AUTHORIZED',
  PR_NOT_OPEN: 'MERGE_PR_NOT_OPEN',
  PR_NOT_MERGEABLE: 'MERGE_PR_NOT_MERGEABLE',
  CHECK_FAILED: 'MERGE_CHECK_FAILED',
  CHECK_MISSING: 'MERGE_CHECK_MISSING',
  LOCAL_GATE_FAILED: 'MERGE_LOCAL_GATE_FAILED',
  OBSERVATION_INVALID: 'MERGE_OBSERVATION_INVALID',
  GITHUB_ACCESS_FAILED: 'MERGE_GITHUB_ACCESS_FAILED',
  MERGE_REFUSED: 'MERGE_REFUSED',
  MERGE_VERIFICATION_FAILED: 'MERGE_VERIFICATION_FAILED'
});

// The canonical governance surface of the repository: lane authorizations
// live here and are read from the base commit's tree.
export const LANE_AUTHORIZATION_DIRECTORY = 'core/authority/merge-authorizations';
export const LANE_AUTHORIZATION_SCHEMA_VERSION = '1.0.0';
// The canonical merge authority of this repository. It matches the identity
// of the canonical owner trust anchor (core/contracts/owner-authority.json).
export const CANONICAL_MERGE_AUTHORITY = 'canonical_owner';

const LANE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

// The fields a lane authorization may carry. An unknown field is refused:
// the contract (core/contracts/merge-lane-authorization.schema.json) is
// closed, and a silent extra field is how a contract and its implementation
// drift apart unnoticed.
const AUTHORIZATION_FIELDS = Object.freeze([
  'schema_version',
  'lane_id',
  'authority',
  'base_ref',
  'head_ref',
  'head_repository',
  'required_checks',
  'required_local_gates',
  'authorized_commit',
  'authorized_head_sha'
]);

export { AUTHORIZATION_FIELDS };

export class MergeExecutorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MergeExecutorError';
    this.code = code;
  }
}

function executorError(code, message) {
  throw new MergeExecutorError(code, message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function laneAuthorizationPath(laneId) {
  if (!isNonEmptyString(laneId) || !LANE_ID_PATTERN.test(laneId)) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      `the lane id "${String(laneId)}" is malformed`
    );
  }
  return `${LANE_AUTHORIZATION_DIRECTORY}/${laneId}.json`;
}

// parseLaneAuthorization() -> the validated lane authorization, or a refusal.
// The authority is checked apart from the shape: a malformed record is a
// shape failure, a record that names another authority is an authority
// failure, and the two are never merged into one.
export function parseLaneAuthorization(text, { laneId } = {}) {
  let record;
  try {
    record = JSON.parse(text);
  } catch (error) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      `the lane authorization is not valid JSON: ${error.message}`
    );
  }
  if (!isPlainObject(record)) {
    executorError(MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID, 'the lane authorization must be an object');
  }
  const unknown = Object.keys(record).filter((key) => !AUTHORIZATION_FIELDS.includes(key));
  if (unknown.length > 0) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      `the lane authorization carries unknown field(s): ${unknown.join(', ')}`
    );
  }
  if (record.schema_version !== LANE_AUTHORIZATION_SCHEMA_VERSION) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      `unsupported lane authorization schema_version "${String(record.schema_version)}"`
    );
  }
  if (!isNonEmptyString(record.lane_id) || !LANE_ID_PATTERN.test(record.lane_id)) {
    executorError(MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID, 'the lane authorization must carry a well-formed lane_id');
  }
  if (laneId !== undefined && record.lane_id !== laneId) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      `the lane authorization names lane "${record.lane_id}" but "${laneId}" was requested`
    );
  }
  if (!isNonEmptyString(record.head_ref) || !REF_PATTERN.test(record.head_ref)) {
    executorError(MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID, 'the lane authorization must carry a well-formed head_ref');
  }
  if (!isNonEmptyString(record.base_ref) || !REF_PATTERN.test(record.base_ref)) {
    executorError(MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID, 'the lane authorization must carry a well-formed base_ref');
  }
  for (const listField of ['required_checks', 'required_local_gates']) {
    const value = record[listField];
    if (value === undefined) {
      continue;
    }
    if (!Array.isArray(value) || value.some((name) => !isNonEmptyString(name))) {
      executorError(
        MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
        `the lane authorization must carry a ${listField} array of non-empty names`
      );
    }
  }
  const requiredChecks = record.required_checks ?? [];
  const requiredLocalGates = record.required_local_gates ?? [];
  if (requiredChecks.length === 0 && requiredLocalGates.length === 0) {
    // A lane that demands nothing is a lane without a verification. The
    // incident's precondition — a merge that needed no green check — must
    // not be expressible.
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      'the lane authorization must demand at least one required check or one required local gate'
    );
  }
  if (record.authorized_commit !== undefined && !COMMIT_PATTERN.test(String(record.authorized_commit))) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      'the lane authorization carries a malformed authorized_commit'
    );
  }
  if (record.authorized_head_sha !== undefined && !COMMIT_PATTERN.test(String(record.authorized_head_sha))) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      'the lane authorization carries a malformed authorized_head_sha'
    );
  }
  if (record.head_repository !== undefined && !isNonEmptyString(record.head_repository)) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_INVALID,
      'the lane authorization carries a malformed head_repository'
    );
  }
  if (record.authority !== CANONICAL_MERGE_AUTHORITY) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORITY_MISMATCH,
      `the lane authorization names authority "${String(record.authority)}" but the canonical merge authority is "${CANONICAL_MERGE_AUTHORITY}"`
    );
  }
  return {
    schema_version: record.schema_version,
    lane_id: record.lane_id,
    authority: record.authority,
    base_ref: record.base_ref,
    head_ref: record.head_ref,
    head_repository: record.head_repository ?? null,
    required_checks: [...requiredChecks],
    required_local_gates: [...requiredLocalGates],
    authorized_commit: record.authorized_commit ?? null,
    authorized_head_sha: record.authorized_head_sha ?? null
  };
}

// --- git plumbing -----------------------------------------------------------
// The lane authorization is read from the BASE COMMIT of the pull request's
// base. That commit is the one GitHub reports, not one the operator names.

export function resolveCommit({ root, ref }) {
  try {
    return execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT,
      `the base commit "${ref}" does not resolve in ${root}: ${error.message}`
    );
  }
}

export function readFileFromCommit({ root, commit, relativePath }) {
  try {
    return execFileSync('git', ['show', `${commit}:${relativePath}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT,
      `the base commit ${commit} carries no lane authorization at ${relativePath}: ${error.message}`
    );
  }
}

export function isDescendantCommit({ root, ancestor, descendant }) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

export function loadLaneAuthorization({ root, baseCommit, laneId }) {
  if (!COMMIT_PATTERN.test(String(baseCommit))) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT,
      `the base commit "${String(baseCommit)}" is not a commit identity`
    );
  }
  const relativePath = laneAuthorizationPath(laneId);
  const text = readFileFromCommit({ root, commit: baseCommit, relativePath });
  const authorization = parseLaneAuthorization(text, { laneId });
  return { authorization, commit: baseCommit, relativePath };
}

// --- observation ------------------------------------------------------------
// The observation is the observed state of the repository's pull requests.
// It is DATA, never authority: every field it carries is checked against
// the lane authorization, and none of it is trusted on its own. In the merge
// path the observation is read live from GitHub; a supplied file is a
// read-only evaluation input.

export function normalizeObservation(raw) {
  if (!isPlainObject(raw)) {
    executorError(MERGE_EXECUTOR_CODES.OBSERVATION_INVALID, 'the observation must be an object');
  }
  const entries = Array.isArray(raw.pull_requests)
    ? raw.pull_requests
    : (Array.isArray(raw) ? raw : null);
  if (entries === null) {
    executorError(
      MERGE_EXECUTOR_CODES.OBSERVATION_INVALID,
      'the observation must carry a pull_requests array'
    );
  }
  return {
    pull_requests: entries.map((entry) => {
      if (!isPlainObject(entry)) {
        executorError(MERGE_EXECUTOR_CODES.OBSERVATION_INVALID, 'every observed pull request must be an object');
      }
      const number = Number(entry.number);
      if (!Number.isInteger(number) || number <= 0) {
        executorError(MERGE_EXECUTOR_CODES.OBSERVATION_INVALID, 'every observed pull request must carry an integer number');
      }
      const checks = Array.isArray(entry.statusCheckRollup)
        ? entry.statusCheckRollup
        : (Array.isArray(entry.checks) ? entry.checks : []);
      const owner = entry.headRepositoryOwner ?? entry.head_repository_owner ?? null;
      return {
        number,
        state: String(entry.state ?? '').toUpperCase(),
        mergeable: entry.mergeable === true || entry.mergeable === 'MERGEABLE'
          ? true
          : (entry.mergeable === false || entry.mergeable === 'CONFLICTING' ? false : null),
        base_ref: String(entry.baseRefName ?? entry.base_ref ?? ''),
        base_sha: String(entry.baseRefOid ?? entry.base_sha ?? ''),
        head_ref: String(entry.headRefName ?? entry.head_ref ?? ''),
        head_sha: String(entry.headRefOid ?? entry.head_sha ?? ''),
        head_owner: owner && isPlainObject(owner) ? String(owner.login ?? '') : (owner === null ? null : String(owner)),
        title: String(entry.title ?? ''),
        checks: checks
          .filter((check) => isPlainObject(check))
          .map((check) => ({
            name: String(check.name ?? check.context ?? ''),
            conclusion: check.conclusion === null || check.conclusion === undefined
              ? null
              : String(check.conclusion).toUpperCase(),
            status: check.status === null || check.status === undefined ? null : String(check.status).toUpperCase()
          }))
      };
    })
  };
}

// resolveLanePullRequest() -> the pull request of the lane. The lane's head
// branch identifies exactly one pull request, so the merge target is
// DERIVED from the lane. A pull request of another lane is not a candidate,
// no matter how mergeable it is.
export function resolveLanePullRequest({ observation, headRef, headRepository = null }) {
  const candidates = observation.pull_requests.filter((entry) => (
    entry.head_ref === headRef
    && (headRepository === null || entry.head_owner === null || entry.head_owner === headRepository)
  ));
  if (candidates.length === 0) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_PULL_REQUEST_ABSENT,
      `no observed pull request carries the lane head branch "${headRef}"`
    );
  }
  if (candidates.length > 1) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_PULL_REQUEST_AMBIGUOUS,
      `${candidates.length} observed pull requests carry the lane head branch "${headRef}"`
    );
  }
  return candidates[0];
}

// evaluateMergeAuthorization() -> the decision. Pure: it takes the lane
// authorization, the observation and the operator's asserted target, and it
// returns either the mergeable pull request or the refusal. The order of
// the gates is the order of the bindings: identity, lane, head, base,
// authority (already checked in the authorization), state, mergeability and
// the required checks.
export function evaluateMergeAuthorization({
  authorization,
  observation,
  target = {},
  headAuthorized = null
}) {
  const refuse = (code, message, detail = {}) => ({
    ...detail,
    allowed: false,
    code,
    message
  });

  let lanePullRequest;
  try {
    lanePullRequest = resolveLanePullRequest({
      observation,
      headRef: authorization.head_ref,
      headRepository: authorization.head_repository
    });
  } catch (error) {
    if (error instanceof MergeExecutorError) {
      return refuse(error.code, error.message);
    }
    throw error;
  }

  // The operator's asserted target. A named target that is not the lane's
  // pull request is refused: this is the gate the incident of 2026-10-21
  // lacked — the target was asserted and never compared with the lane.
  if (target.number !== undefined && target.number !== null) {
    if (Number(target.number) !== lanePullRequest.number) {
      return refuse(
        MERGE_EXECUTOR_CODES.PR_IDENTITY_MISMATCH,
        `the merge target is pull request ${Number(target.number)} but the lane "${authorization.lane_id}" owns pull request ${lanePullRequest.number}`,
        { lane_pull_request: lanePullRequest.number, asserted_pull_request: Number(target.number) }
      );
    }
  }
  if (isNonEmptyString(target.head_ref) && target.head_ref !== lanePullRequest.head_ref) {
    return refuse(
      MERGE_EXECUTOR_CODES.LANE_MISMATCH,
      `the merge target carries the head branch "${target.head_ref}" but the lane "${authorization.lane_id}" owns "${lanePullRequest.head_ref}"`,
      { lane_head_ref: lanePullRequest.head_ref, asserted_head_ref: target.head_ref }
    );
  }
  if (isNonEmptyString(target.head_sha) && target.head_sha !== lanePullRequest.head_sha) {
    return refuse(
      MERGE_EXECUTOR_CODES.HEAD_SHA_MISMATCH,
      `the merge target names the head sha ${target.head_sha} but the lane pull request ${lanePullRequest.number} carries ${lanePullRequest.head_sha}`,
      { lane_head_sha: lanePullRequest.head_sha, asserted_head_sha: target.head_sha }
    );
  }
  if (lanePullRequest.base_ref !== authorization.base_ref) {
    return refuse(
      MERGE_EXECUTOR_CODES.BASE_REF_MISMATCH,
      `the lane pull request ${lanePullRequest.number} merges into "${lanePullRequest.base_ref}" but the lane authorizes "${authorization.base_ref}"`,
      { lane_base_ref: lanePullRequest.base_ref, authorized_base_ref: authorization.base_ref }
    );
  }
  if (lanePullRequest.state !== 'OPEN') {
    return refuse(
      MERGE_EXECUTOR_CODES.PR_NOT_OPEN,
      `the lane pull request ${lanePullRequest.number} is ${lanePullRequest.state || 'in an unknown state'}, not OPEN`
    );
  }
  if (lanePullRequest.mergeable !== true) {
    return refuse(
      MERGE_EXECUTOR_CODES.PR_NOT_MERGEABLE,
      `the lane pull request ${lanePullRequest.number} is not mergeable (mergeable=${String(lanePullRequest.mergeable)})`
    );
  }
  if (!COMMIT_PATTERN.test(lanePullRequest.head_sha)) {
    return refuse(
      MERGE_EXECUTOR_CODES.HEAD_SHA_INVALID,
      `the lane pull request ${lanePullRequest.number} does not carry a valid head sha (head_sha="${lanePullRequest.head_sha}")`
    );
  }
  if (authorization.authorized_head_sha && lanePullRequest.head_sha !== authorization.authorized_head_sha) {
    return refuse(
      MERGE_EXECUTOR_CODES.HEAD_SHA_MISMATCH,
      `the lane authorizes the head ${authorization.authorized_head_sha} but the lane pull request ${lanePullRequest.number} carries ${lanePullRequest.head_sha}`
    );
  }
  if (authorization.authorized_commit && headAuthorized !== true) {
    return refuse(
      MERGE_EXECUTOR_CODES.HEAD_NOT_AUTHORIZED,
      `the head ${lanePullRequest.head_sha} of the lane pull request ${lanePullRequest.number} does not descend from the authorized commit ${authorization.authorized_commit}`
    );
  }
  for (const name of authorization.required_checks) {
    const matching = lanePullRequest.checks.filter((entry) => entry.name === name);
    if (matching.length === 0) {
      return refuse(
        MERGE_EXECUTOR_CODES.CHECK_MISSING,
        `the required check "${name}" is not observed on the lane pull request ${lanePullRequest.number}`,
        { required_check: name }
      );
    }
    // Every observation of the check must succeed: a duplicate observation
    // of the same check must not be resolvable to the first (passing) one.
    const failed = matching.find((entry) => entry.conclusion !== 'SUCCESS');
    if (failed) {
      return refuse(
        MERGE_EXECUTOR_CODES.CHECK_FAILED,
        `the required check "${name}" did not succeed on the lane pull request ${lanePullRequest.number} (conclusion=${String(failed.conclusion)})`,
        { required_check: name, conclusion: failed.conclusion }
      );
    }
  }
  return {
    allowed: true,
    code: null,
    message: 'the merge target is the authorized lane pull request and every binding holds',
    pull_request: lanePullRequest
  };
}

// The checks the lane does NOT require are still reported. A failing hosted
// check that the lane does not require is visible in the receipt instead of
// being silently dropped.
export function observedCheckReport(pullRequest) {
  return pullRequest.checks.map((check) => ({
    name: check.name,
    status: check.status,
    conclusion: check.conclusion
  }));
}

// --- local gates ------------------------------------------------------------
// A local gate is an npm script of this repository that must exit 0. It is
// run against a working tree whose HEAD is the reviewed head, so the gate
// verifies exactly the content that is about to be merged. The tool does
// NOT claim the result as a hosted CI result: a local PASS is a local PASS.

export function runLocalGates({ root, headSha, gates }) {
  const head = resolveCommit({ root, ref: 'HEAD' });
  if (head !== headSha) {
    executorError(
      MERGE_EXECUTOR_CODES.LOCAL_GATE_FAILED,
      `the working tree is at ${head} but the reviewed head is ${headSha}; the local gates would not verify the merged content`
    );
  }
  const results = [];
  for (const gate of gates) {
    let ok = true;
    let detail = '';
    try {
      execFileSync('npm', ['run', gate], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      ok = false;
      detail = String(error.stdout ?? error.message ?? '').trim().split('\n').slice(-3).join(' | ');
    }
    results.push({ gate, ok, detail });
    if (!ok) {
      executorError(
        MERGE_EXECUTOR_CODES.LOCAL_GATE_FAILED,
        `the local gate "${gate}" did not pass: ${detail}`
      );
    }
  }
  return results;
}

// --- GitHub access ----------------------------------------------------------
// The tool talks to GitHub through the gh CLI with an argument array and no
// shell: the repository's own source security policy bans shell
// interpolation in child_process calls.

// githubRead() -> the raw answer of a gh call. A GitHub read that fails is
// a typed refusal: the merge path must not continue on a partial view of
// the repository.
function githubRead(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    executorError(
      MERGE_EXECUTOR_CODES.GITHUB_ACCESS_FAILED,
      `the GitHub read failed: ${String(error.stderr ?? error.message ?? '').trim().split('\n').slice(-3).join(' | ')}`
    );
  }
}

export function fetchObservation({ repo, headRef = null }) {
  if (!REPO_PATTERN.test(String(repo))) {
    executorError(
      MERGE_EXECUTOR_CODES.OBSERVATION_INVALID,
      `the repository "${String(repo)}" is not an owner/name pair`
    );
  }
  const args = [
    'pr', 'list',
    '--repo', repo,
    '--state', 'all',
    '--limit', '100'
  ];
  if (isNonEmptyString(headRef)) {
    args.push('--head', headRef);
  }
  // `gh pr list` does not expose baseRefOid (it exposes headRefOid only);
  // the merge path does not need it - the base commit comes from the
  // repository's default branch tip, which GitHub reports directly.
  args.push(
    '--json',
    'number,state,mergeable,baseRefName,headRefName,headRefOid,headRepositoryOwner,statusCheckRollup'
  );
  const raw = githubRead(args);
  return normalizeObservation({ pull_requests: JSON.parse(raw) });
}

// The default branch of the target repository, as GitHub reports it. The
// merge path reads the lane authorization from the TIP of that branch, so
// the authority surface is the repository's own base branch and not a ref
// the operator names.
export function fetchRepositoryDefaultBranch({ repo }) {
  const raw = githubRead(['api', `repos/${repo}`]);
  const branch = JSON.parse(raw).default_branch;
  if (!isNonEmptyString(branch)) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT,
      `the repository ${repo} reports no default branch`
    );
  }
  return branch;
}

export function fetchBranchTip({ repo, branch }) {
  const raw = githubRead(['api', `repos/${repo}/git/ref/heads/${branch}`]);
  const sha = JSON.parse(raw).object?.sha;
  if (!COMMIT_PATTERN.test(String(sha))) {
    executorError(
      MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT,
      `the branch ${branch} of ${repo} reports no commit tip`
    );
  }
  return sha;
}

// The identity of the local checkout, so that a lane authorization read
// from a clone of another repository cannot authorize a merge here.
export function localOriginRepository({ root }) {
  let raw = '';
  try {
    raw = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
  const match = /[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/.exec(raw);
  return match ? match[1] : null;
}

export function mergePullRequest({ repo, number, headSha, mergeMethod = 'merge', runner = null }) {
  const run = runner ?? ((args) => execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }));
  const raw = run([
    'api', '-X', 'PUT',
    `repos/${repo}/pulls/${number}/merge`,
    '-f', `sha=${headSha}`,
    '-f', `merge_method=${mergeMethod}`
  ]);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { raw };
  }
  if (parsed.merged !== true) {
    executorError(
      MERGE_EXECUTOR_CODES.MERGE_REFUSED,
      `the server refused the merge of pull request ${number}: ${String(parsed.message ?? raw).trim()}`
    );
  }
  return parsed;
}

// verifyMerge() -> the readback. The merge is not "done" because the call
// returned: the merged commit is read back and its parents must contain the
// reviewed head. A squash or rebase merge does not carry the head as a
// parent and is therefore refused by this check.
export function verifyMerge({ repo, number, headSha, mergeCommit = null, runner = null }) {
  const run = runner ?? ((args) => execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }));
  const view = JSON.parse(run(['pr', 'view', String(number), '--repo', repo, '--json', 'state,mergedAt,mergeCommit']));
  if (view.state !== 'MERGED') {
    executorError(
      MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED,
      `the readback of pull request ${number} reports state "${String(view.state)}", not MERGED`
    );
  }
  const commit = view.mergeCommit?.oid ?? mergeCommit ?? null;
  if (!commit) {
    executorError(
      MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED,
      `the readback of pull request ${number} carries no merge commit`
    );
  }
  const commitDetail = JSON.parse(run(['api', `repos/${repo}/commits/${commit}`]));
  const parents = (commitDetail.parents ?? []).map((parent) => parent.sha);
  if (!parents.includes(headSha)) {
    executorError(
      MERGE_EXECUTOR_CODES.MERGE_VERIFICATION_FAILED,
      `the merge commit ${commit} does not carry the reviewed head ${headSha} among its parents`
    );
  }
  return { merge_commit: commit, merged_at: view.mergedAt ?? null, parents };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    if (name === 'apply') {
      args.apply = true;
      continue;
    }
    args[name] = argv[index + 1];
    index += 1;
  }
  return args;
}

// runMergeExecutor() -> the whole merge path, with every external access
// injectable. The production path uses the real GitHub access; the tests
// replace them, so the decision, the merge and its readback are all
// exercised offline. The function NEVER throws: it returns the receipt and
// the exit status, and a refusal is a receipt, not an exception.
export function runMergeExecutor({ args, root, deps = {} }) {
  const use = {
    fetchRepositoryDefaultBranch: deps.fetchRepositoryDefaultBranch ?? fetchRepositoryDefaultBranch,
    fetchBranchTip: deps.fetchBranchTip ?? fetchBranchTip,
    fetchObservation: deps.fetchObservation ?? fetchObservation,
    observationFromFile: deps.observationFromFile ?? observationFromFile,
    loadLaneAuthorization: deps.loadLaneAuthorization ?? loadLaneAuthorization,
    resolveLanePullRequest: deps.resolveLanePullRequest ?? resolveLanePullRequest,
    evaluateMergeAuthorization: deps.evaluateMergeAuthorization ?? evaluateMergeAuthorization,
    isDescendantCommit: deps.isDescendantCommit ?? isDescendantCommit,
    runLocalGates: deps.runLocalGates ?? runLocalGates,
    mergePullRequest: deps.mergePullRequest ?? mergePullRequest,
    verifyMerge: deps.verifyMerge ?? verifyMerge,
    localOriginRepository: deps.localOriginRepository ?? localOriginRepository
  };
  const receipt = {
    ok: false,
    decision: null,
    code: null,
    message: null,
    lane: args.lane ?? null,
    repository: args.repo ?? null,
    base_ref: null,
    base_commit: null,
    base_commit_source: null,
    pull_request: null,
    head_sha: null,
    merge_commit: null,
    merged: false,
    checks: [],
    local_gates: [],
    warnings: []
  };
  try {
    if (args.apply && args.observation) {
      executorError(
        MERGE_EXECUTOR_CODES.OBSERVATION_INVALID,
        'a merge must not run on a supplied observation file: the pull request is read live from GitHub in the merge path'
      );
    }
    if (args.apply && !args.repo) {
      executorError(MERGE_EXECUTOR_CODES.MERGE_REFUSED, 'a merge needs --repo <owner/name>');
    }
    if (args.apply && !args['expected-head-sha']) {
      executorError(
        MERGE_EXECUTOR_CODES.HEAD_SHA_MISMATCH,
        'a merge needs --expected-head-sha: the reviewed head is declared, not inferred'
      );
    }

    // The authority surface. In the merge path it is the tip of the
    // repository's own default branch, as GitHub reports it — not a ref the
    // operator names. In the evaluation path (a supplied observation, which
    // can never merge anything) it is the base commit the observation
    // carries.
    let observation = null;
    let baseCommit = null;
    let baseSource = null;
    let defaultBranch = null;
    if (args.observation) {
      observation = use.observationFromFile(args.observation);
      if (!isNonEmptyString(args['head-ref'])) {
        executorError(
          MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT,
          'the evaluation path needs --head-ref: the lane branch is resolved from the observation and then cross-checked against the lane authorization'
        );
      }
      const candidate = use.resolveLanePullRequest({ observation, headRef: args['head-ref'] });
      baseCommit = candidate.base_sha;
      baseSource = 'observation';
    } else {
      defaultBranch = use.fetchRepositoryDefaultBranch({ repo: args.repo });
      baseCommit = use.fetchBranchTip({ repo: args.repo, branch: defaultBranch });
      baseSource = 'github';
      const local = use.localOriginRepository({ root });
      if (local && local.toLowerCase() !== String(args.repo).toLowerCase()) {
        executorError(
          MERGE_EXECUTOR_CODES.LANE_AUTHORIZATION_ABSENT,
          `the local checkout is a clone of ${local} but the merge target is ${args.repo}`
        );
      }
    }

    const { authorization } = use.loadLaneAuthorization({ root, baseCommit, laneId: args.lane });
    receipt.base_ref = authorization.base_ref;
    receipt.base_commit = baseCommit;
    receipt.base_commit_source = baseSource;
    receipt.authority = authorization.authority;
    receipt.lane_head_ref = authorization.head_ref;
    receipt.required_checks = authorization.required_checks;
    receipt.required_local_gates = authorization.required_local_gates;

    if (defaultBranch !== null && authorization.base_ref !== defaultBranch) {
      executorError(
        MERGE_EXECUTOR_CODES.BASE_REF_MISMATCH,
        `the lane authorizes the base branch "${authorization.base_ref}" but the repository's default branch is "${defaultBranch}"`
      );
    }
    if (isNonEmptyString(args['head-ref']) && args['head-ref'] !== authorization.head_ref) {
      executorError(
        MERGE_EXECUTOR_CODES.LANE_MISMATCH,
        `the requested head branch "${args['head-ref']}" is not the lane's head branch "${authorization.head_ref}"`
      );
    }

    if (observation === null) {
      observation = use.fetchObservation({ repo: args.repo, headRef: authorization.head_ref });
    }
    const lanePullRequest = use.resolveLanePullRequest({
      observation,
      headRef: authorization.head_ref,
      headRepository: authorization.head_repository
    });

    const target = {};
    if (args.pr !== undefined) target.number = Number(args.pr);
    if (args['expected-head-sha'] !== undefined) target.head_sha = String(args['expected-head-sha']);
    const asserted = args.pr !== undefined
      ? observation.pull_requests.find((entry) => entry.number === Number(args.pr))
      : null;
    if (asserted) target.head_ref = asserted.head_ref;

    const headAuthorized = authorization.authorized_commit
      ? use.isDescendantCommit({
        root,
        ancestor: authorization.authorized_commit,
        descendant: lanePullRequest.head_sha
      })
      : null;

    const decision = use.evaluateMergeAuthorization({ authorization, observation, target, headAuthorized });
    if (!decision.allowed) {
      receipt.code = decision.code;
      receipt.message = decision.message;
      receipt.decision = 'REFUSE';
      return { status: 1, receipt };
    }
    const pullRequest = decision.pull_request;
    receipt.decision = 'ALLOW';
    receipt.pull_request = pullRequest.number;
    receipt.head_sha = pullRequest.head_sha;
    receipt.checks = observedCheckReport(pullRequest);
    for (const check of receipt.checks) {
      if (!authorization.required_checks.includes(check.name) && check.conclusion !== 'SUCCESS') {
        receipt.warnings.push(
          `the check "${check.name}" is not required by this lane and did not succeed (conclusion=${String(check.conclusion)})`
        );
      }
    }
    if (authorization.required_local_gates.length > 0) {
      receipt.local_gates = use.runLocalGates({
        root,
        headSha: pullRequest.head_sha,
        gates: authorization.required_local_gates
      });
    }
    if (args.apply) {
      const merged = use.mergePullRequest({
        repo: args.repo,
        number: pullRequest.number,
        headSha: pullRequest.head_sha
      });
      const verified = use.verifyMerge({
        repo: args.repo,
        number: pullRequest.number,
        headSha: pullRequest.head_sha,
        mergeCommit: merged.sha
      });
      receipt.merge_commit = verified.merge_commit;
      receipt.merged_at = verified.merged_at;
      receipt.parents = verified.parents;
      receipt.merged = true;
    }
    receipt.ok = true;
    return { status: 0, receipt };
  } catch (error) {
    receipt.ok = false;
    receipt.merged = false;
    receipt.code = error instanceof MergeExecutorError ? error.code : 'MERGE_EXECUTOR_ERROR';
    receipt.message = error.message;
    receipt.decision = receipt.decision ?? 'REFUSE';
    return { status: 1, receipt };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.lane) {
    console.error('Usage: node scripts/tools/merge-pr-executor.mjs --lane <lane_id> --repo <owner/name> [--head-ref <branch>] [--pr <number>] [--expected-head-sha <sha>] [--root <path>] [--observation <file>] [--apply]');
    process.exit(2);
  }
  const root = path.resolve(args.root ?? process.cwd());
  const { status, receipt } = runMergeExecutor({ args, root });
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(status);
}

export function observationFromFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  return normalizeObservation(Array.isArray(parsed) ? { pull_requests: parsed } : parsed);
}

const invokedAsCli = process.argv[1]
  && process.argv[1] !== '-'
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedAsCli) {
  main();
}
