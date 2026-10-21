// MAWS vNext — tests for the repository-owned source security scan.
// node:test + node:assert/strict, no new dependencies.
//
// The scanner is the .mjs-capable static gate: the external deep scanner's
// language packs do not register .mjs, so this gate is what actually
// analyses the source material. These tests prove the gate's own contract:
// every rule fires on its defect class with the exact code and line, a
// baselined finding passes with its justification surfaced, a stale
// baseline entry and an unreadable or unparseable file FAIL the gate, the
// required-coverage assertion bites, the scan is deterministic, the scanner
// scans itself without triggering its own rules, and the CLI answers with
// the right exit codes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  SOURCE_SECURITY_CODES,
  loadBaseline,
  scanSourceSecurity
} from '../../scripts/tools/scan-source-security.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCANNER = path.join(ROOT, 'scripts', 'tools', 'scan-source-security.mjs');

function buildTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-security-'));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

test('a clean tree passes with its files counted', () => {
  const root = buildTree({
    'app/ok.mjs': 'export const answer = 42;\n'
  });
  const report = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  assert.equal(report.ok, true);
  assert.equal(report.coverage.files_analysed, 1);
  assert.equal(report.unbaselined.length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('every rule fires on its defect class with code and line', () => {
  const root = buildTree({
    'app/bad.mjs': [
      'export function run(input) {',
      '  return eval(input);',
      '}'
    ].join('\n')
  });
  const report = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  const codes = new Set(report.unbaselined.map((finding) => finding.code));
  assert.ok(codes.has(SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION), 'dynamic execution is reported');
  const evalFinding = report.unbaselined.find((finding) => finding.excerpt.includes('eval(input)'));
  assert.ok(evalFinding, 'the eval finding is the eval line');
  assert.equal(evalFinding.line, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the other defect classes are each reported', () => {
  const root = buildTree({
    'app/shell.mjs': 'import { execSync } from "node:child_process";\nexport const out = execSync(cmd);\n',
    'app/net.mjs': 'export async function go(url) { return fetch(url); }\n',
    'app/dyn.mjs': 'export async function load(name) { return import(name); }\n'
  });
  const report = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  const byFile = new Map(report.unbaselined.map((finding) => [finding.file, finding.code]));
  assert.equal(byFile.get('app/shell.mjs'), SOURCE_SECURITY_CODES.SHELL_INTERPOLATION);
  assert.equal(byFile.get('app/net.mjs'), SOURCE_SECURITY_CODES.UNPINNED_NETWORK_EGRESS);
  assert.equal(byFile.get('app/dyn.mjs'), SOURCE_SECURITY_CODES.DYNAMIC_IMPORT_SPECIFIER);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a rule does not fire on its own benign shape: a literal import and a method call are not findings', () => {
  const root = buildTree({
    'app/benign.mjs': [
      'const mod = await import("./literal.mjs");',
      'const parts = /a(b)c/.exec("abc");',
      'export { mod, parts };'
    ].join('\n')
  });
  const report = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  assert.equal(report.unbaselined.length, 0, JSON.stringify(report.unbaselined));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a baselined finding passes with its justification surfaced, and a stale entry fails', () => {
  const root = buildTree({
    'app/bad.mjs': 'export function run(input) {\n  return eval(input);\n}\n'
  });
  const first = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  const finding = first.unbaselined[0];
  const baseline = {
    schema_version: '1.0.0',
    entries: [{ file: finding.file, line: finding.line, code: finding.code, excerpt: finding.excerpt, justification: 'fixture' }]
  };
  const withBaseline = scanSourceSecurity({
    root,
    governedRoots: ['app'],
    requiredCoverage: [],
    baseline
  });
  assert.equal(withBaseline.ok, true);
  assert.equal(withBaseline.baselined.length, 1);
  assert.equal(withBaseline.baselined[0].justification, 'fixture');
  const stale = scanSourceSecurity({
    root,
    governedRoots: ['app'],
    requiredCoverage: [],
    baseline: { schema_version: '1.0.0', entries: [{ ...baseline.entries[0], excerpt: 'return eval(other);' }] }
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.stale_baseline_entries.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a disclosure survives another writer moving the code to a different line', () => {
  const root = buildTree({
    'app/bad.mjs': 'export function run(input) {\n  return eval(input);\n}\n'
  });
  const first = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  const finding = first.unbaselined[0];
  const baseline = {
    schema_version: '1.0.0',
    entries: [{ file: finding.file, line: finding.line, code: finding.code, excerpt: finding.excerpt, justification: 'reviewed shape' }]
  };
  // The code moves down by three lines — the interleaved-lane case — with
  // the reviewed shape unchanged: the disclosure holds, no staleness.
  fs.writeFileSync(path.join(root, 'app/bad.mjs'), '// a\n// b\n// c\nexport function run(input) {\n  return eval(input);\n}\n');
  const after = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [], baseline });
  assert.equal(after.ok, true, JSON.stringify({ unbaselined: after.unbaselined, stale: after.stale_baseline_entries }));
  assert.equal(after.baselined.length, 1);
  assert.equal(after.baselined[0].line, finding.line + 3);
  // A CHANGED line content is still stale: the excerpt pins what was reviewed.
  fs.writeFileSync(path.join(root, 'app/bad.mjs'), '// a\n// b\n// c\nexport function run(input) {\n  return eval(input);\n}\n// tail\n');
  const tail = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [], baseline });
  assert.equal(tail.ok, true);
  // And a second, identical occurrence elsewhere in the same file is NOT
  // covered by the one disclosure.
  fs.writeFileSync(path.join(root, 'app/bad.mjs'), 'export function run(input) {\n  return eval(input);\n}\nexport function run2(input) {\n  return eval(input);\n}\n');
  const doubled = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [], baseline });
  assert.equal(doubled.ok, false);
  assert.equal(doubled.baselined.length, 1);
  assert.equal(doubled.unbaselined.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('an unparseable file is a failure, never a skip', () => {
  const root = buildTree({
    'app/broken.mjs': 'function {{{ nope\n'
  });
  const report = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  assert.equal(report.ok, false);
  assert.equal(report.coverage.parse_failures.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('required coverage that falls out of the analysed set fails the gate', () => {
  const root = buildTree({
    'app/ok.mjs': 'export const answer = 42;\n'
  });
  const report = scanSourceSecurity({
    root,
    governedRoots: ['app'],
    requiredCoverage: ['app/ghost.mjs']
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.coverage.required_coverage_missing, ['app/ghost.mjs']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the scan is deterministic', () => {
  const root = buildTree({
    'app/a.mjs': 'export const x = eval(input);\n',
    'app/b.mjs': 'export const y = fetch(url);\n'
  });
  const one = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  const two = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  assert.deepEqual(one, two);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the scanner scans this repository without triggering on itself and covers the required material', () => {
  const report = scanSourceSecurity({ root: ROOT, baseline: loadBaseline(ROOT) });
  assert.equal(report.ok, true, JSON.stringify({ unbaselined: report.unbaselined, stale: report.stale_baseline_entries, missing: report.coverage.required_coverage_missing, failures: report.coverage.parse_failures }));
  assert.ok(report.coverage.files_analysed > 200, 'the governed tree is analysed in full');
  for (const required of report.coverage.required_coverage) {
    assert.ok(report.coverage.analysed_files.includes(required), `${required} is inside the analysed set`);
  }
});

test('the CLI answers 0 on the repository and 1 on an offending tree', () => {
  const pass = execFileSync(process.execPath, [SCANNER, '--root', ROOT], { encoding: 'utf8', cwd: ROOT });
  assert.match(pass, /source security scan: PASS/);
  const root = buildTree({
    // the CLI scans the DEFAULT governed roots, so the offending file sits
    // under scripts/ of the fixture tree
    'scripts/bad.mjs': 'export const x = eval(input);\n'
  });
  let failed = false;
  try {
    execFileSync(process.execPath, [SCANNER, '--root', root], { encoding: 'utf8' });
  } catch (error) {
    failed = true;
    assert.match(String(error.stdout), /UNBASELINED SOURCE_DYNAMIC_CODE_EXECUTION/);
    assert.equal(error.status, 1);
  }
  assert.equal(failed, true, 'the CLI exits nonzero on an unbaselined finding');
  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The repairs an independent qualification of this gate produced on
// 2026-10-21. The qualification found that the first form of every rule
// could only see a BARE call, that the comment stripper was blind to
// string literals, and that a baseline entry without a justification
// silenced a finding on its own. Each case below binds one repair.
// ---------------------------------------------------------------------------

test('a disclosure without a justification does not cover its finding', () => {
  const root = buildTree({
    'app/bad.mjs': 'export function run(input) {\n  return eval(input);\n}\n'
  });
  const first = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  const finding = first.unbaselined[0];
  // The entry MATCHES the finding, and says nothing. It must not cover it:
  // otherwise anyone could silence a new finding with one silent line.
  const silent = {
    schema_version: '1.0.0',
    entries: [{ file: finding.file, line: finding.line, code: finding.code, excerpt: finding.excerpt }]
  };
  const report = scanSourceSecurity({
    root,
    governedRoots: ['app'],
    requiredCoverage: [],
    baseline: silent
  });
  assert.equal(report.ok, false, 'a silent entry does not cover the finding');
  assert.equal(report.unbaselined.length, 1);
  assert.equal(report.baselined.length, 0);
  assert.equal(report.baseline_entries_without_justification.length, 1);
  // A blank justification is no justification either.
  const blank = {
    schema_version: '1.0.0',
    entries: [{ ...silent.entries[0], justification: '   ' }]
  };
  const blankReport = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [], baseline: blank });
  assert.equal(blankReport.ok, false);
  assert.equal(blankReport.baseline_entries_without_justification.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the member form of a call is the defect class its rule names', () => {
  const root = buildTree({
    'app/member.mjs': [
      'export const a = globalThis.eval(input);',
      'export const b = globalThis.fetch(url);',
      'export const c = childProcess.execSync(command);',
      'export const d = https.get(url, handler);',
      'export const e = new (Function)("return 1")();',
      'export const f = new globalThis.Function("return 1")();',
      'export const g = Function("return 1")();',
      'export const h = spawn(command, { shell: true });'
    ].join('\n')
  });
  const report = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  const codes = report.unbaselined.map((finding) => `${finding.line}:${finding.code}`);
  assert.ok(codes.includes(`1:${SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION}`), 'globalThis.eval is dynamic code execution');
  assert.ok(codes.includes(`2:${SOURCE_SECURITY_CODES.UNPINNED_NETWORK_EGRESS}`), 'globalThis.fetch is network egress');
  assert.ok(codes.includes(`3:${SOURCE_SECURITY_CODES.SHELL_INTERPOLATION}`), 'a member execSync is shell interpolation');
  assert.ok(codes.includes(`4:${SOURCE_SECURITY_CODES.UNPINNED_NETWORK_EGRESS}`), 'https.get is network egress');
  assert.ok(codes.includes(`5:${SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION}`), 'new (Function) is dynamic code execution');
  assert.ok(codes.includes(`6:${SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION}`), 'new globalThis.Function is dynamic code execution');
  assert.ok(codes.includes(`7:${SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION}`), 'a bare Function call is dynamic code execution');
  assert.ok(codes.includes(`8:${SOURCE_SECURITY_CODES.SHELL_INTERPOLATION}`), 'spawn with shell:true is shell interpolation');
  fs.rmSync(root, { recursive: true, force: true });
});

test('an unbalanced comment marker inside a string literal cannot hide a trigger', () => {
  // The blind stripper opened a "comment" at the first /* it saw, wherever
  // that was. One unbalanced marker in a string literal therefore swallowed
  // the rest of the file and hid EVERY rule at once.
  const root = buildTree({
    'app/marker.mjs': [
      'const marker = "/*";',
      'export function run(input) {',
      '  return eval(input);',
      '}',
      'const other = "*/";'
    ].join('\n')
  });
  const report = scanSourceSecurity({ root, governedRoots: ['app'], requiredCoverage: [] });
  assert.equal(report.unbaselined.length, 1, JSON.stringify(report.unbaselined));
  assert.equal(report.unbaselined[0].line, 3, 'the trigger is reported on its own line');
  assert.equal(report.unbaselined[0].code, SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the gate sees the network egress of this repository, not only the bare form', () => {
  // Without a baseline the gate must report the repository's own egress
  // call sites. The bare form of the rule could not see them: they bind
  // the platform fetch as a member.
  const report = scanSourceSecurity({ root: ROOT, requiredCoverage: [] });
  const egress = report.unbaselined.filter((finding) => finding.code === SOURCE_SECURITY_CODES.UNPINNED_NETWORK_EGRESS);
  const files = new Set(egress.map((finding) => finding.file));
  assert.ok(
    files.has('runtime/executors/openrouter-executor.mjs'),
    `the OpenRouter transport's fetch binding is visible to the gate: ${JSON.stringify([...files])}`
  );
  assert.ok(
    files.has('runtime/decision-engine/jev/client.mjs'),
    `the JEV client's fetch binding is visible to the gate: ${JSON.stringify([...files])}`
  );
});
