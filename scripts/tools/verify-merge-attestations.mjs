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
  MERGE_LANE_RECORD_MALFORMED: 'MERGE_LANE_RECORD_MALFORMED'
});

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

function mergeParents(root, mergeCommit) {
  const line = git(root, ['rev-list', '--parents', '-n', '1', mergeCommit]).trim();
  const parts = line.split(/\s+/);
  return { base: parts[1] ?? null, head: parts[2] ?? null };
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

// auditMergeAttestations() -> the report. It reads the published history
// and never writes, never merges and never grants.
export function auditMergeAttestations({ root, baseRef = 'main' } = {}) {
  const resolved = resolveBaseCommit(root, baseRef);
  if (!resolved) {
    throw new Error(`the audited branch "${baseRef}" does not resolve in ${root}`);
  }
  const findings = [];
  const merges = [];
  const laneUsage = new Map();

  const mergeCommits = gitLines(root, ['rev-list', '--first-parent', '--merges', resolved.commit]).reverse();
  for (const mergeCommit of mergeCommits) {
    const { base, head } = mergeParents(root, mergeCommit);
    if (!base || !head) {
      merges.push({ merge_commit: mergeCommit, classification: 'NOT_A_MERGE' });
      continue;
    }
    if (!contractCarriesLifecycle(root, base)) {
      merges.push({ merge_commit: mergeCommit, classification: 'HISTORICAL_OBSERVATION' });
      continue;
    }
    const paths = changedPaths(root, base, head);
    if (paths.length > 0 && paths.every((entry) => entry.startsWith(GOVERNANCE_SURFACE))) {
      merges.push({ merge_commit: mergeCommit, classification: 'GOVERNANCE_ACT', paths });
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

  const counts = merges.reduce((accumulator, entry) => {
    accumulator[entry.classification] = (accumulator[entry.classification] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    base_ref: baseRef,
    base_commit: resolved.commit,
    base_commit_source: resolved.source,
    merges_total: merges.length,
    counts,
    findings,
    lanes,
    merges
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
