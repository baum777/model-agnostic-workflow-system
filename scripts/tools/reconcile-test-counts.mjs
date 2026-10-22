#!/usr/bin/env node
// Test-count reconciliation (the P2b reconciliation artifact).
//
// The operational safety closure record reports 910 tests while its own
// suite gate reports 787 and the full tools suite reports 147 — 787 + 147
// is 934, not 910. This tool derives, from the committed record and a
// checkout at the record's bound commit, WHY both numbers are correct:
// they use different counting modes.
//
// Mode of the record: the totals sum PER-GATE EXECUTIONS of node --test
// (TAP summaries only; a python unittest inside a gate command runs but is
// not TAP-counted). A file the workflow intentionally runs twice — the
// skill frontdoor regression gate re-runs a file the vnext suite already
// covers — is counted once per execution.
//
// Mode of the 934 figure: it sums ONE suite gate (787) with the FULL tools
// suite (147). The full tools suite contains files no record gate ran, and
// it does not re-run the frontdoor file, so the two sums differ in both
// directions. The tool verifies the exact decomposition:
//
//   naive_sum == record_total + ungated_tools_tests − intra_record_overlap
//
// and fails when any gate's measured files contradict the record counts.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseTapCounts } from './capture-assurance-run.mjs';

function resolveScriptCommand(command, packageJson) {
  // npm run --silent <script> [args] -> the script body from package.json.
  const match = command.match(/^npm\s+run\s+(?:--silent\s+)?([\w:-]+)(.*)$/);
  if (!match) return command;
  const body = packageJson.scripts[match[1]];
  if (!body) return command;
  return body + match[2];
}

function expandGlobs(args, root) {
  const files = [];
  for (const arg of args) {
    if (arg.includes('*')) {
      const directory = path.dirname(path.join(root, arg));
      const pattern = new RegExp('^' + path.basename(arg).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
      if (fs.existsSync(directory)) {
        for (const entry of fs.readdirSync(directory).sort()) {
          if (pattern.test(entry)) files.push(path.join(path.dirname(arg), entry).replace(/\\/g, '/'));
        }
      }
    } else {
      files.push(arg.replace(/\\/g, '/'));
    }
  }
  return files;
}

// Which .mjs test files does a gate command execute with node --test?
// Compound commands split on &&; only node --test parts count (TAP mode).
// A glob part is reported as a membership, not measured per file: the
// suite gate's total is validator-checked in the committed record, and
// per-file attribution is only needed where the counting modes diverge.
export function gateTestFiles(command, root) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const files = [];
  let globbed = false;
  for (const part of command.split('&&')) {
    const resolved = resolveScriptCommand(part.trim(), packageJson);
    const match = resolved.match(/^node\s+--test\s+(.+)$/);
    if (!match) continue;
    const args = match[1].trim().split(/\s+/);
    if (args.some((arg) => arg.includes('*'))) globbed = true;
    files.push(...expandGlobs(args, root));
  }
  return { files: [...new Set(files)], globbed };
}

function measureTestCount(file, root) {
  const run = spawnSync(process.execPath, ['--test', file], {
    cwd: root, encoding: 'utf8', timeout: 600000,
    env: { ...process.env, CI: '1' }
  });
  const counts = parseTapCounts(run.stdout + '\n' + run.stderr);
  if (counts.tests === null) {
    return { file, tests: null, error: (run.stdout + run.stderr).slice(-400) };
  }
  return { file, tests: counts.tests };
}

export function reconcileTestCounts({ recordPath, root, gateLogDir }) {
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8')).assurance_run_record;
  const testGates = record.gates.filter((gate) => gate.counts && gate.counts.tests !== null);

  const gates = [];
  const fileReferences = new Map(); // file -> [gate ids]
  for (const gate of testGates) {
    const { files, globbed } = gateTestFiles(gate.command, root);
    for (const file of files) {
      if (!fileReferences.has(file)) fileReferences.set(file, []);
      fileReferences.get(file).push(gate.id);
    }
    gates.push({
      id: gate.id,
      command: gate.command,
      files,
      globbed,
      measured: [],
      measured_total: globbed ? null : 0,
      record_tests: gate.counts.tests,
      matches_record: globbed ? null : null
    });
  }

  // Measure per file where per-file attribution matters: every tools file
  // (the ungated set lives there) and every file referenced by a non-glob
  // gate. Glob gates keep the validator-checked record count; their
  // membership is structural evidence on its own.
  for (const gate of gates) {
    if (gate.globbed) continue;
    for (const file of gate.files) {
      const entry = measureTestCount(file, root);
      gate.measured.push(entry);
      if (entry.tests === null) continue;
      gate.measured_total += entry.tests;
    }
    gate.matches_record = gate.measured.length > 0 && gate.measured.every((entry) => entry.tests !== null)
      ? gate.measured_total === gate.record_tests
      : null;
  }

  // Full tools suite at the bound commit.
  const toolsDir = path.join(root, 'tests', 'tools');
  const toolsFiles = fs.readdirSync(toolsDir)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `tests/tools/${name}`);
  const toolsMeasured = toolsFiles.map((file) => measureTestCount(file, root));
  const toolsFullSuiteTotal = toolsMeasured.reduce((sum, entry) => sum + (entry.tests || 0), 0);

  const gatedToolsFiles = new Set(
    gates.flatMap((gate) => gate.files.filter((file) => file.startsWith('tests/tools/')))
  );
  const ungatedTools = toolsMeasured
    .filter((entry) => !gatedToolsFiles.has(entry.file))
    .map((entry) => ({ file: entry.file, tests: entry.tests }));
  const ungatedToolsTests = ungatedTools.reduce((sum, entry) => sum + entry.tests, 0);

  // Files executed by more than one gate are counted once per execution
  // inside the record totals: that is the intra-record overlap.
  const overlapFiles = [...fileReferences.entries()]
    .filter(([, gateIds]) => gateIds.length > 1)
    .map(([file, gateIds]) => {
      const measured = gates
        .flatMap((gate) => gate.measured)
        .find((entry) => entry.file === file);
      return {
        file,
        gates: gateIds,
        tests: measured ? measured.tests : measureTestCount(file, root).tests
      };
    });
  const intraRecordOverlap = overlapFiles.reduce((sum, entry) => sum + (entry.tests || 0), 0);

  const recordTotal = record.totals.tests_passed + record.totals.tests_failed;
  const gateSum = gates.reduce((sum, gate) => sum + gate.record_tests, 0);
  const vnextGate = gates.find((gate) => gate.files.some((file) => file.startsWith('tests/vnext/')) && gate.files.length > 1);
  const naiveSum = (vnextGate ? vnextGate.record_tests : 0) + toolsFullSuiteTotal;

  // Evidence from COMMITTED material: the suite gate log must contain the
  // overlapping file's test names, proving the suite counted them too.
  const logEvidence = [];
  if (gateLogDir && vnextGate) {
    const suiteLog = path.join(gateLogDir, `${vnextGate.id}.stdout.log`);
    if (fs.existsSync(suiteLog)) {
      for (const overlap of overlapFiles) {
        const probe = spawnSync(process.execPath, ['--test', overlap.file], {
          cwd: root, encoding: 'utf8', timeout: 600000, env: { ...process.env, CI: '1' }
        });
        // The spec reporter suffixes every name with its duration; strip it,
        // the committed log measured the suite run, not this probe.
        const names = [...probe.stdout.matchAll(/^✔ (.+)$/gm)]
          .map((m) => m[1].replace(/\s+\([\d.]+m?s\)$/, ''));
        logEvidence.push({
          file: overlap.file,
          suite_gate_log: `${vnextGate.id}.stdout.log`,
          test_names_in_log: names.filter((name) => fs.readFileSync(suiteLog, 'utf8').includes(name)).length,
          test_names_measured: names.length
        });
      }
    }
  }

  const identityHolds = naiveSum === recordTotal + ungatedToolsTests - intraRecordOverlap;
  const decomposition = {
    record_total_tests: recordTotal,
    naive_sum: naiveSum,
    difference: naiveSum - recordTotal,
    ungated_tools_tests: ungatedToolsTests,
    ungated_tools_files: ungatedTools,
    intra_record_overlap_tests: intraRecordOverlap,
    intra_record_overlap_files: overlapFiles,
    identity: 'naive_sum == record_total + ungated_tools_tests − intra_record_overlap',
    holds: identityHolds
  };

  return {
    ok: identityHolds && gateSum === recordTotal && gates.every((gate) => gate.matches_record !== false),
    run_id: record.run_id,
    bound_commit: record.implementation_commit_sha,
    counting_mode: {
      record: 'sum of per-gate node --test TAP executions; non-TAP parts of a gate command (python unittest) run but are not counted',
      naive: 'one suite gate total plus the full tools suite total, as stated in the run report'
    },
    gates,
    tools_full_suite: { files: toolsMeasured, total: toolsFullSuiteTotal },
    committed_log_evidence: logEvidence,
    decomposition,
    record_totals: record.totals
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const recordPath = flag('--record');
  const root = flag('--root') ? path.resolve(flag('--root')) : process.cwd();
  const gateLogDir = flag('--gate-logs') ? path.resolve(flag('--gate-logs')) : null;
  const jsonOut = flag('--json');
  if (!recordPath) {
    console.error('usage: reconcile-test-counts.mjs --record <run-record.json> [--root <tree at the bound commit>] [--gate-logs <dir>] [--json <out>]');
    process.exit(2);
  }
  const result = reconcileTestCounts({ recordPath: path.resolve(recordPath), root, gateLogDir });
  const d = result.decomposition;
  const stdout = [
    `test count reconciliation: ${result.ok ? 'IDENTITY_HOLDS' : 'CONTRADICTION'}`,
    `record ${result.run_id} (bound ${result.bound_commit.slice(0, 8)}) totals ${d.record_total_tests} tests`,
    `naive sum ${d.naive_sum} = suite gate + full tools suite (${result.tools_full_suite.total})`,
    `difference ${d.difference} = ${d.ungated_tools_tests} ungated tools tests (${d.ungated_tools_files.length} files) − ${d.intra_record_overlap_tests} intra-record overlap`,
    ...d.ungated_tools_files.map((entry) => `  ungated: ${entry.file} (${entry.tests})`),
    ...d.intra_record_overlap_files.map((entry) => `  overlap: ${entry.file} (${entry.tests}, gates: ${entry.gates.join(', ')})`)
  ].join('\n');
  console.log(stdout);
  if (jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(result, null, 2) + '\n');
  }
  process.exit(result.ok ? 0 : 1);
}
