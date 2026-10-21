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
    entries: [{ file: finding.file, line: finding.line, code: finding.code, justification: 'fixture' }]
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
    baseline: { schema_version: '1.0.0', entries: [{ ...baseline.entries[0], line: 99 }] }
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.stale_baseline_entries.length, 1);
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
