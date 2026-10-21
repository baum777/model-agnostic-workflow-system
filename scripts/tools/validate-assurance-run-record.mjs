#!/usr/bin/env node
// MAWS vNext — validation of an assurance run record.
//
// The record is only evidence if it cannot silently disagree with the
// material it points at. This validator therefore RE-DERIVES every claim
// the record makes from the committed material:
//
//   - every gate's stdout and stderr digest is recomputed from the
//     committed log file and compared;
//   - every gate's exit code is compared with the committed .exit file;
//   - every test gate's counts are re-parsed from its own log and
//     compared with the counts the record states;
//   - every artifact digest is recomputed from the blob AT THE BOUND
//     COMMIT, so a record stays checkable after the working tree moved on;
//   - the totals are recomputed from the gates;
//   - the environment claim is checked for self-consistency: a record
//     that says it was not a hosted run may not claim hosted parity.
//
// It reads and reports; it never rewrites. A record that fails here is
// not evidence, no matter what it says about itself.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseTapCounts, ASSURANCE_RUN_RECORD_CONTRACT } from './capture-assurance-run.mjs';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readAtCommit(root, commit, relative) {
  const result = spawnSync('git', ['show', `${commit}:${relative}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (result.status === 0) return result.stdout;
  return null;
}

function checkShape(record, issues) {
  const wrapper = record?.assurance_run_record;
  if (!wrapper || typeof wrapper !== 'object') {
    issues.push('the artifact does not carry an assurance_run_record object');
    return null;
  }
  const required = [
    'schema_version', 'run_id', 'created_at', 'repository', 'implementation_commit_sha',
    'environment', 'gates', 'totals', 'artifacts', 'limits', 'validator_command',
    'contract_version'
  ];
  for (const field of required) {
    if (!(field in wrapper)) issues.push(`the record is missing the required field "${field}"`);
  }
  if (wrapper.schema_version !== '1.0.0') issues.push('schema_version must be "1.0.0"');
  if (wrapper.contract_version !== ASSURANCE_RUN_RECORD_CONTRACT) {
    issues.push(`contract_version must be "${ASSURANCE_RUN_RECORD_CONTRACT}"`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(wrapper.implementation_commit_sha ?? ''))) {
    issues.push('implementation_commit_sha must be a 40 character lowercase commit sha');
  }
  if (!Array.isArray(wrapper.gates) || wrapper.gates.length === 0) {
    issues.push('the record must carry at least one gate');
  }
  if (!Array.isArray(wrapper.limits) || wrapper.limits.length === 0) {
    issues.push('the record must state at least one limit it does not claim');
  }
  const environment = wrapper.environment ?? {};
  if (environment.ci_parity === 'HOSTED_CI' && environment.hosted_ci_executed === false) {
    issues.push('the record claims hosted CI parity while stating that no hosted run was executed');
  }
  if (environment.ci_parity !== 'HOSTED_CI' && environment.hosted_ci_executed === true) {
    issues.push('the record states a hosted run was executed but does not claim hosted CI parity');
  }
  return wrapper;
}

export function validateRunRecord({ recordPath, root, checkCurrentTree = false }) {
  const issues = [];
  const recordDirectory = path.dirname(path.resolve(recordPath));
  let record = null;
  try {
    record = JSON.parse(fs.readFileSync(path.resolve(recordPath), 'utf8'));
  } catch (error) {
    return { passed: false, issues: [`the record is not readable JSON: ${error.message}`], checks: [] };
  }
  const wrapper = checkShape(record, issues);
  if (!wrapper) return { passed: false, issues, checks: [] };
  const checks = [];
  const commit = wrapper.implementation_commit_sha;

  for (const gate of wrapper.gates) {
    for (const stream of ['stdout', 'stderr']) {
      const described = gate[stream];
      if (!described || typeof described.file !== 'string') {
        issues.push(`gate ${gate.id} does not describe its ${stream}`);
        continue;
      }
      const absolute = path.resolve(recordDirectory, described.file);
      if (!fs.existsSync(absolute)) {
        issues.push(`gate ${gate.id} names a ${stream} file that does not exist: ${described.file}`);
        continue;
      }
      const content = fs.readFileSync(absolute);
      const digest = sha256(content);
      if (digest !== described.sha256) {
        issues.push(`gate ${gate.id} ${stream} digest changed: the record says ${described.sha256}, the committed file is ${digest}`);
      }
      if (content.length !== described.bytes) {
        issues.push(`gate ${gate.id} ${stream} size changed: the record says ${described.bytes} bytes, the committed file is ${content.length}`);
      }
    }
    // The exit code is stored next to the output, so that the record's
    // claim is checked against a committed file and not only against the
    // record's own copy of the number.
    const exitFile = path.resolve(recordDirectory, path.join('gates', `${gate.id}.exit`));
    if (fs.existsSync(exitFile)) {
      const recorded = fs.readFileSync(exitFile, 'utf8').trim();
      if (Number(recorded) !== gate.exit_code) {
        issues.push(`gate ${gate.id} exit code disagrees with its committed .exit file: record ${gate.exit_code}, file ${recorded}`);
      }
    } else {
      issues.push(`gate ${gate.id} has no committed .exit file`);
    }
    const expectedStatus = gate.exit_code === 0 ? 'PASS' : 'FAIL';
    if (gate.status !== expectedStatus) {
      issues.push(`gate ${gate.id} is marked ${gate.status} but its exit code is ${gate.exit_code}`);
    }
    if (gate.counts) {
      const stdoutPath = path.resolve(recordDirectory, gate.stdout.file);
      if (fs.existsSync(stdoutPath)) {
        const derived = parseTapCounts(fs.readFileSync(stdoutPath, 'utf8'));
        if (!derived) {
          issues.push(`gate ${gate.id} states test counts that cannot be re-derived from its own output`);
        } else {
          for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
            const stated = gate.counts[key];
            if (stated === undefined) continue;
            if (derived[key] !== stated) {
              issues.push(`gate ${gate.id} states ${key}=${stated} but its output says ${derived[key]}`);
            }
          }
        }
      }
    }
    checks.push({ id: gate.id, status: gate.status, exit_code: gate.exit_code });
  }

  for (const artifact of wrapper.artifacts ?? []) {
    const atCommit = readAtCommit(root, commit, artifact.path);
    if (atCommit === null) {
      const absolute = path.join(root, artifact.path);
      if (checkCurrentTree && fs.existsSync(absolute)) {
        const digest = sha256(fs.readFileSync(absolute));
        if (digest !== artifact.sha256) {
          issues.push(`artifact ${artifact.path} differs from the record in the working tree`);
        }
      } else {
        issues.push(`artifact ${artifact.path} is not carried by the bound commit ${commit}`);
      }
      continue;
    }
    const digest = sha256(atCommit);
    if (digest !== artifact.sha256) {
      issues.push(`artifact ${artifact.path} differs from the bound commit ${commit}: record ${artifact.sha256}, commit ${digest}`);
    }
    if (atCommit.length !== artifact.bytes) {
      issues.push(`artifact ${artifact.path} differs in size from the bound commit ${commit}`);
    }
  }

  const totals = wrapper.totals ?? {};
  const gates = wrapper.gates ?? [];
  const derivedTotals = {
    gates: gates.length,
    gates_passed: gates.filter((gate) => gate.exit_code === 0).length,
    gates_failed: gates.filter((gate) => gate.exit_code !== 0).length,
    tests_passed: gates.reduce((sum, gate) => sum + (gate.counts?.pass ?? 0), 0),
    tests_failed: gates.reduce((sum, gate) => sum + (gate.counts?.fail ?? 0), 0)
  };
  for (const key of Object.keys(derivedTotals)) {
    if (totals[key] !== undefined && totals[key] !== derivedTotals[key]) {
      issues.push(`totals.${key} states ${totals[key]} but the gates add up to ${derivedTotals[key]}`);
    }
  }

  return { passed: issues.length === 0, issues, checks, totals: derivedTotals };
}

function listCommittedRecords(root) {
  const evidenceRoot = path.join(root, 'evidence');
  if (!fs.existsSync(evidenceRoot)) return [];
  return fs.readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(evidenceRoot, entry.name, 'run-record.json'))
    .filter((candidate) => fs.existsSync(candidate))
    .sort();
}

function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf('--root');
  const root = rootIndex !== -1 ? path.resolve(args[rootIndex + 1]) : process.cwd();
  if (args.includes('--all')) {
    // Every committed run record is checked. A repository that keeps run
    // records has to keep them honest, and the check is cheap enough to
    // belong to the workflow.
    const records = listCommittedRecords(root);
    const results = records.map((candidate) => ({
      record: path.relative(root, candidate),
      ...validateRunRecord({ recordPath: candidate, root })
    }));
    const passed = results.every((result) => result.passed);
    process.stdout.write(`${JSON.stringify({
      passed,
      records: results.length,
      results: results.map((result) => ({
        record: result.record,
        passed: result.passed,
        issues: result.issues
      }))
    }, null, 2)}\n`);
    process.exitCode = passed ? 0 : 1;
    return;
  }
  const recordPath = args.find((arg) => !arg.startsWith('--'));
  if (!recordPath) {
    process.stdout.write(`${JSON.stringify({ passed: false, issues: ['no run record was named'] }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  const result = validateRunRecord({
    recordPath,
    root,
    checkCurrentTree: args.includes('--current')
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.passed ? 0 : 1;
}

const invokedAsCli = process.argv[1]
  && process.argv[1] !== '-'
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedAsCli) {
  main();
}
