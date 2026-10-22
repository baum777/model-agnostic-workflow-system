#!/usr/bin/env node
// MAWS vNext — the merge path attestation audit.
//
// The merge executor (scripts/tools/merge-pr-executor.mjs) is the
// PREVENTIVE control: when it is used, the merge target is derived from an
// authorized work lane and every binding is checked fail-closed. This tool is
// the DETECTIVE control: it reads the default branch's own merge history and
// answers the question the incident of 2026-10-21 left open — did EVERY
// merge that landed on the default branch carry a lane authorization that
// existed on the base branch BEFORE the merge?
//
// The audit is derived from the repository's own history. It has no epoch
// file, no baseline list and no hidden exemption table:
//
//   * A merge is IN SCOPE when the tree of its BASE commit already carries
//     the lifecycle-aware lane authorization contract (schema_version
//     1.1.0). A merge whose base branch did not yet know the contract is a
//     HISTORICAL OBSERVATION — it cannot be judged by a rule that did not
//     exist when it landed. The merge that introduces the contract is
//     therefore always out of scope, and it is exactly the one merge the
//     enforcement cannot cover: the enforcement cannot authorize its own
//     introduction.
//   * A merge whose changed paths are confined to the GOVERNANCE SURFACE
//     (core/authority/) is a GOVERNANCE ACT: it lands a lane authorization
//     and nothing else. It cannot carry content, so it is exempt from the
//     coverage rule — otherwise the lane that authorizes a merge could
//     never be landed by a merge.
//   * Every other merge must be COVERED: the base commit must carry an
//     active, lifecycle-aware lane authorization that binds exactly the
//     merge's second parent as the reviewed head, names the canonical merge
//     authority and the audited base branch, and whose ancestry pin (when
//     it carries one) the merged head descends from.
//
// A merge that no lane covered is a FINDING and the audit fails closed. A
// lane that covers more than one merge is a FINDING too: one lane
// authorizes one merge.
//
// This audit binds nothing and grants nothing. It reads the published
// history and reports what it finds.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  CANONICAL_MERGE_AUTHORITY,
  LANE_AUTHORIZATION_DIRECTORY,
  LANE_AUTHORIZATION_LIFECYCLE_VERSION,
  parseLaneAuthorization
} from './merge-pr-executor.mjs';

export const AUDIT_CODES = Object.freeze({
  MERGE_NOT_COVERED: 'MERGE_NOT_COVERED',
  MERGE_LANE_AMBIGUOUS: 'MERGE_LANE_AMBIGUOUS',
  MERGE_LANE_REUSED: 'MERGE_LANE_REUSED',
  MERGE_LANE_RECORD_MALFORMED: 'MERGE_LANE_RECORD_MALFORMED',
  DIRECT_PUSH_UNCOVERED: 'DIRECT_PUSH_UNCOVERED',
  BASELINE_STALE: 'BASELINE_STALE',
  BASELINE_INVALID: 'BASELINE_INVALID'
});

// The disposition surface of the audit: findings of the published history
// that a governance act has explicitly recorded. A baseline entry that
// matches no current finding is STALE and fails the gate, so the baseline
// can never rot into an amnesty list; a disposed finding stays visible in
// the report and only loses its gate-failing force.
export const MERGE_AUDIT_BASELINE_PATH = 'core/authority/merge-audit-baseline.json';

const LANE_CONTRACT_PATH = 'core/contracts/merge-lane-authorization.schema.json';
const GOVERNANCE_SURFACE = 'core/authority/';

function git(root, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function gitLines(root, args) {
  return git(root, args)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isAncestor(root, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      stdio: ['ignore']
    });
    return true;
  } catch {
    return false;
  }
}

// The published view of the audited branch: the remote-tracking ref when the
// repository has one, otherwise the local branch. A commit that was never
// pushed is not part of the published history and is therefore out of the
// audit's scope.
export function resolveBaseCommit(root, baseRef) {
  for (const candidate of [
    `refs/remotes/origin/${baseRef}`,
    `refs/heads/${baseRef}`,
    baseRef
  ]) {
    const resolved = git(root, ['rev-parse', '--verify', `${candidate}^{commit}`], { allowFailure: true }).trim();
    if (/^[0-9a-f]{40}$/.test(resolved)) {
      return { commit: resolved, source: candidate };
    }
  }
  return null;
}

// Does the tree of this commit already carry the lifecycle-aware lane
// contract? That is what makes a merge auditable.
export function contractCarriesLifecycle(root, commit) {
  const text = git(root, ['show', `${commit}:${LANE_CONTRACT_PATH}`], { allowFailure: true });
  if (!text.trim()) return false;
  let schema;
  try {
    schema = JSON.parse(text);
  } catch {
    return false;
  }
  const version = schema?.properties?.schema_version;
  const versions = Array.isArray(version?.enum) ? version.enum : (version?.const ? [version.const] : []);
  return versions.includes(LANE_AUTHORIZATION_LIFECYCLE_VERSION);
}

// The lane authorizations of a commit's tree.
export function readLanes(root, commit) {
  const listing = gitLines(root, [
    'ls-tree', '-r', '--name-only', commit, '--', LANE_AUTHORIZATION_DIRECTORY
  ]);
  const records = [];
  const malformed = [];
  for (const relativePath of listing) {
    const laneId = path.basename(relativePath, '.json');
    const text = git(root, ['show', `${commit}:${relativePath}`], { allowFailure: true });
    try {
      records.push({ path: relativePath, authorization: parseLaneAuthorization(text, { laneId }) });
    } catch (error) {
      malformed.push({ path: relativePath, reason: error.message });
    }
  }
  return { records, malformed };
}

function parentsOf(root, commit) {
  const line = git(root, ['rev-list', '--parents', '-n', '1', commit]).trim();
  const parts = line.split(/\s+/);
  return parts.slice(1);
}

// The paths a merge changed: the three-dot diff of the base and the head,
// which is the change the pull request carried.
function changedPaths(root, base, head) {
  return gitLines(root, ['diff', '--name-only', `${base}...${head}`]);
}

function coveringLanes({ lanes, head, baseRef, root }) {
  return lanes.filter((entry) => {
    const authorization = entry.authorization;
    // An ACTIVE lane covers a merge. A lane of the first generation cannot
    // be active: the contract forbids a lifecycle field on a 1.0.0 record
    // and the reader refuses one, so the first generation is excluded here
    // exactly as the executor excludes it.
    if (authorization.state !== 'active') return false;
    if (authorization.authority !== CANONICAL_MERGE_AUTHORITY) return false;
    if (authorization.base_ref !== baseRef) return false;
    if (authorization.authorized_head_sha !== head) return false;
    if (authorization.authorized_commit && !isAncestor(root, authorization.authorized_commit, head)) return false;
    return true;
  });
}

function readBaseline(root, commit) {
  const result = { entries: [], present: false, error: null, malformedEntries: [] };
  const text = git(root, ['show', `${commit}:${MERGE_AUDIT_BASELINE_PATH}`], { allowFailure: true });
  if (!text.trim()) return result;
  result.present = true;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    result.error = error.message;
    return result;
  }
  const entries = Array.isArray(parsed?.known_findings) ? parsed.known_findings : [];
  for (const entry of entries) {
    const keys = Object.keys(entry ?? {});
    const valid = keys.every((key) => ['code', 'commit', 'reason', 'disposition', 'recorded_at'].includes(key))
      && typeof entry.code === 'string' && entry.code.length > 0
      && typeof entry.commit === 'string' && /^[0-9a-f]{40}$/.test(entry.commit)
      && typeof entry.reason === 'string' && entry.reason.trim().length > 0
      && typeof entry.disposition === 'string' && entry.disposition.trim().length > 0
      && typeof entry.recorded_at === 'string' && entry.recorded_at.trim().length > 0;
    if (!valid) result.malformedEntries.push(entry);
  }
  result.entries = entries.filter((entry) => !result.malformedEntries.includes(entry));
  return result;
}

function baselineKey(finding) {
  return `${finding.code}:${finding.commit ?? finding.merge_commit ?? ''}`;
}

// auditMergeAttestations() -> the report. It reads the published history
// and never writes, never merges and never grants.
export function auditMergeAttestations({ root, baseRef = 'main' } = {}) {
  const resolved = resolveBaseCommit(root, baseRef);
  if (!resolved) {
    throw new Error(`the audited branch "${baseRef}" does not resolve in ${root}`);
  }
  const findings = [];
  const merges = [];
  const landings = [];
  const laneUsage = new Map();

  // The walk covers EVERY commit on the first-parent line of the audited
  // branch, not only the merge commits. A landing with one parent reached
  // the default branch without a pull request: no merge commit, no second
  // parent, so no lane authorization can ever cover it — that is the
  // direct-push bypass class, and it is judged exactly like an uncovered
  // merge. A landing made by a squash or a rebase merge has one parent too
  // and lands in the same class by design: the audit's model of an
  // attestable landing is a merge commit that carries the reviewed head
  // among its parents.
  const commits = gitLines(root, ['rev-list', '--first-parent', resolved.commit]).reverse();
  for (const commit of commits) {
    const parents = parentsOf(root, commit);
    if (parents.length === 0) {
      landings.push({ commit, classification: 'ROOT' });
      continue;
    }
    if (parents.length === 1) {
      if (!contractCarriesLifecycle(root, parents[0])) {
        landings.push({ commit, classification: 'HISTORICAL_OBSERVATION' });
        continue;
      }
      findings.push({
        code: AUDIT_CODES.DIRECT_PUSH_UNCOVERED,
        commit,
        detail: `the commit ${commit} landed on ${baseRef} without a pull request; no lane authorization can cover a landing that carries no merge`
      });
      landings.push({ commit, classification: 'DIRECT_PUSH_UNCOVERED', parent: parents[0] });
      continue;
    }
    const mergeCommit = commit;
    const base = parents[0];
    const head = parents[1];
    if (!contractCarriesLifecycle(root, base)) {
      merges.push({ merge_commit: mergeCommit, classification: 'HISTORICAL_OBSERVATION' });
      landings.push({ commit: mergeCommit, classification: 'HISTORICAL_OBSERVATION' });
      continue;
    }
    const paths = changedPaths(root, base, head);
    if (paths.length > 0 && paths.every((entry) => entry.startsWith(GOVERNANCE_SURFACE))) {
      merges.push({ merge_commit: mergeCommit, classification: 'GOVERNANCE_ACT', paths });
      landings.push({ commit: mergeCommit, classification: 'GOVERNANCE_ACT' });
      continue;
    }
    const { records, malformed } = readLanes(root, base);
    for (const entry of malformed) {
      findings.push({
        code: AUDIT_CODES.MERGE_LANE_RECORD_MALFORMED,
        merge_commit: mergeCommit,
        detail: `the lane record ${entry.path} in the base tree is malformed: ${entry.reason}`
      });
    }
    const covering = coveringLanes({ lanes: records, head, baseRef, root });
    if (covering.length === 0) {
      findings.push({
        code: AUDIT_CODES.MERGE_NOT_COVERED,
        merge_commit: mergeCommit,
        detail: `the merge ${mergeCommit} landed the head ${head} without a lane authorization that bound it on the base branch ${base}`
      });
      merges.push({ merge_commit: mergeCommit, classification: 'UNCOVERED', head, base, paths });
      landings.push({ commit: mergeCommit, classification: 'UNCOVERED' });
      continue;
    }
    if (covering.length > 1) {
      findings.push({
        code: AUDIT_CODES.MERGE_LANE_AMBIGUOUS,
        merge_commit: mergeCommit,
        detail: `the merge ${mergeCommit} is covered by ${covering.length} lane authorizations: ${covering.map((entry) => entry.authorization.lane_id).join(', ')}`
      });
    }
    for (const entry of covering) {
      const laneId = entry.authorization.lane_id;
      const uses = laneUsage.get(laneId) ?? [];
      uses.push(mergeCommit);
      laneUsage.set(laneId, uses);
    }
    merges.push({
      merge_commit: mergeCommit,
      classification: 'COVERED',
      head,
      base,
      lanes: covering.map((entry) => entry.authorization.lane_id),
      paths
    });
    landings.push({ commit: mergeCommit, classification: 'COVERED' });
  }

  for (const [laneId, uses] of laneUsage.entries()) {
    if (uses.length > 1) {
      findings.push({
        code: AUDIT_CODES.MERGE_LANE_REUSED,
        lane_id: laneId,
        detail: `the lane "${laneId}" covers ${uses.length} merges (${uses.join(', ')}); one lane authorizes one merge`
      });
    }
  }

  // The lifecycle of every lane the published tip carries.
  const tipLanes = readLanes(root, resolved.commit);
  const consumedHeads = new Set(merges.filter((entry) => entry.head).map((entry) => entry.head));
  const lanes = tipLanes.records.map((entry) => {
    const authorization = entry.authorization;
    const supersededBy = tipLanes.records
      .filter((other) => other.authorization.supersedes === authorization.lane_id
        && other.authorization.state !== 'closed')
      .map((other) => other.authorization.lane_id);
    return {
      lane_id: authorization.lane_id,
      schema_version: authorization.schema_version,
      state: authorization.state,
      bound_head: authorization.authorized_head_sha,
      closed_by: authorization.closed_by,
      consumed: authorization.authorized_head_sha ? consumedHeads.has(authorization.authorized_head_sha) : false,
      superseded_by: supersededBy,
      covers: laneUsage.get(authorization.lane_id) ?? []
    };
  });

  // The disposition surface: a governance act may record a finding of the
  // published history explicitly. A recorded finding is REPORTED and does
  // not fail the gate; a record that matches nothing is STALE and does.
  const baseline = readBaseline(root, resolved.commit);
  if (baseline.error) {
    findings.push({
      code: AUDIT_CODES.BASELINE_INVALID,
      detail: `the merge audit baseline is malformed: ${baseline.error}`
    });
  }
  for (const entry of baseline.malformedEntries) {
    findings.push({
      code: AUDIT_CODES.BASELINE_INVALID,
      detail: `the merge audit baseline carries a malformed entry: ${JSON.stringify(entry)}`
    });
  }
  const recordedKeys = new Set(baseline.entries.map((entry) => `${entry.code}:${entry.commit}`));
  const disposed = [];
  const gateFindings = [];
  for (const finding of findings) {
    if (recordedKeys.has(baselineKey(finding))) {
      disposed.push(finding);
    } else {
      gateFindings.push(finding);
    }
  }
  for (const entry of baseline.entries) {
    const live = findings.some((finding) => baselineKey(finding) === `${entry.code}:${entry.commit}`);
    if (!live) {
      gateFindings.push({
        code: AUDIT_CODES.BASELINE_STALE,
        detail: `the baseline entry for ${entry.code} at ${entry.commit} matches no current finding; the disposition surface cannot keep records of history that is no longer observed`
      });
    }
  }

  const counts = landings.reduce((accumulator, entry) => {
    accumulator[entry.classification] = (accumulator[entry.classification] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    status: gateFindings.length === 0 ? 'PASS' : 'FAIL',
    base_ref: baseRef,
    base_commit: resolved.commit,
    base_commit_source: resolved.source,
    baseline_present: baseline.present,
    merges_total: merges.length,
    landings_total: landings.length,
    counts,
    findings: [...gateFindings, ...disposed],
    disposed_findings: disposed,
    lanes,
    merges,
    landings
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    if (name === 'json') {
      args.json = true;
      continue;
    }
    args[name] = argv[index + 1];
    index += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args['repo-root'] ?? process.cwd());
  const baseRef = args['base-ref'] ?? 'main';
  let report;
  try {
    report = auditMergeAttestations({ root, baseRef });
  } catch (error) {
    console.error(`the merge attestation audit could not run: ${error.message}`);
    process.exit(2);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`merge attestation audit — base ${report.base_ref} at ${report.base_commit} (${report.base_commit_source})`);
    console.log(`merges examined: ${report.merges_total}`);
    for (const [classification, count] of Object.entries(report.counts)) {
      console.log(`  ${classification}: ${count}`);
    }
    for (const lane of report.lanes) {
      console.log(`  lane ${lane.lane_id}: state=${lane.state ?? 'none'} bound_head=${lane.bound_head ?? 'none'} consumed=${lane.consumed}`);
    }
    if (report.findings.length > 0) {
      console.log(`findings: ${report.findings.length}`);
      for (const finding of report.findings) {
        console.log(`  ${finding.code}: ${finding.detail}`);
      }
    }
    console.log(`status: ${report.status}`);
  }
  process.exit(report.status === 'PASS' ? 0 : 1);
}

const invokedAsCli = process.argv[1]
  && process.argv[1] !== '-'
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedAsCli) {
  main();
}
