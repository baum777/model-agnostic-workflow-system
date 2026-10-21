#!/usr/bin/env node
// MAWS vNext — source security scan (the .mjs-capable static gate).
//
// The external deep scanner's language packs do not register the .mjs
// extension: measured on 2026-10-21, its analysed set for this repository
// contained no .mjs material at all, so its zero findings carried no
// information about the source this repository actually ships. The
// repository's own secret scanners are scoped to secrets. This module is
// the repository-owned STATIC gate for the source material itself.
//
// What it does, all fail closed:
//
//   1. It enumerates every .mjs and .js file under the governed roots
//      (runtime/, scripts/, providers/, tests/). A file that cannot be
//      read or parsed is a FAILURE, never a skip.
//   2. It applies a bounded set of deterministic rules, each naming one
//      concrete defect class:
//        SOURCE_DYNAMIC_CODE_EXECUTION   eval(...), new Function(...),
//                                        the node:vm module
//        SOURCE_SHELL_INTERPOLATION      exec(...)/execSync(...) — the
//                                        repository's own policy for
//                                        child_process is execFileSync with
//                                        an argument array and no shell
//        SOURCE_UNPINNED_NETWORK_EGRESS  fetch(...), http(s).request(...),
//                                        net/tls connect
//        SOURCE_DYNAMIC_IMPORT_SPECIFIER import(...) with a non-literal
//                                        argument
//   3. It checks COVERAGE as part of the verdict: the report names every
//      analysed file, and a REQUIRED-COVERAGE list names the material whose
//      absence made the external scan vacuous; if any of it falls out of
//      the analysed set, the gate fails.
//   4. A finding is a failure unless the baseline
//      (security/source-security-baseline.json) carries exactly that file,
//      line and rule with a justification. Conversely, a baseline entry
//      that no longer matches a finding is STALE and fails the gate, so
//      the baseline cannot rot into an amnesty list.
//
// Pattern hygiene: every rule regex is built from string fragments, so this
// file never contains a rule's own trigger as code, and the scanner can be
// run over itself. Trigger-shaped text in comments is removed before
// matching (block comments wholesale, whole-line // comments), which keeps
// line numbers stable. A trigger inside a string literal or a trailing
// comment would still be reported — the baseline is the honest place to
// disclose such a case, not silence.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const SOURCE_SECURITY_CODES = Object.freeze({
  DYNAMIC_CODE_EXECUTION: 'SOURCE_DYNAMIC_CODE_EXECUTION',
  SHELL_INTERPOLATION: 'SOURCE_SHELL_INTERPOLATION',
  UNPINNED_NETWORK_EGRESS: 'SOURCE_UNPINNED_NETWORK_EGRESS',
  DYNAMIC_IMPORT_SPECIFIER: 'SOURCE_DYNAMIC_IMPORT_SPECIFIER'
});

export const GOVERNED_ROOTS = Object.freeze(['runtime', 'scripts', 'providers', 'tests']);
export const GOVERNED_EXTENSIONS = Object.freeze(['.mjs', '.js']);
export const BASELINE_PATH = 'security/source-security-baseline.json';

// The material whose absence from an analysed set made the external scan
// vacuous. The gate fails if any of these falls out of the analysed set.
export const REQUIRED_COVERAGE = Object.freeze([
  'scripts/tools/path-confinement.mjs',
  'scripts/tools/run-skill-effectiveness-evals.mjs',
  'scripts/tools/evidence-provenance.mjs',
  'scripts/tools/evidence-admission.mjs'
]);

// Each rule regex is assembled from fragments (see the header: the scanner
// must not carry its own triggers as code).
const RULE_TRIGGER_SET = Object.freeze([
  { code: SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION, parts: ['(?<!\\.)\\be', 'val\\s*\\('] },
  { code: SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION, parts: ['new\\s+Fun', 'ction\\s*\\('] },
  { code: SOURCE_SECURITY_CODES.DYNAMIC_CODE_EXECUTION, parts: ['\\bnode', ':vm\\b'] },
  { code: SOURCE_SECURITY_CODES.SHELL_INTERPOLATION, parts: ['(?<!\\.)\\bexec', '(?:Sync)?\\s*\\('] },
  { code: SOURCE_SECURITY_CODES.UNPINNED_NETWORK_EGRESS, parts: ['(?<!\\.)\\bfe', 'tch\\s*\\('] },
  { code: SOURCE_SECURITY_CODES.UNPINNED_NETWORK_EGRESS, parts: ['\\bhttps?', '\\.request\\s*\\('] },
  { code: SOURCE_SECURITY_CODES.UNPINNED_NETWORK_EGRESS, parts: ['\\b(?:ne', 't|tls)\\.connect\\s*\\('] },
  { code: SOURCE_SECURITY_CODES.DYNAMIC_IMPORT_SPECIFIER, parts: ['\\bimport\\s*\\(\\s*(?!["\'', '`\\)])'] }
]);

const RULES = Object.freeze(
  RULE_TRIGGER_SET.map((rule) => ({ code: rule.code, regex: new RegExp(rule.parts.join(''), 'g') }))
);

function normalizeRelative(value) {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function listGovernedFiles(root, governedRoots) {
  const found = [];
  const walk = (absolute, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(childAbsolute, childRelative);
      } else if (entry.isFile() && GOVERNED_EXTENSIONS.includes(path.extname(entry.name))) {
        found.push(childRelative);
      }
    }
  };
  for (const governed of governedRoots) {
    walk(path.join(root, governed), governed);
  }
  return found.sort();
}

// Block comments are blanked (newlines preserved, so line numbers stay
// stable) and whole-line // comments are dropped; a // that begins a line
// can be dropped safely, while a // inside a line may be a URL inside a
// string and is left alone.
function stripCommentShapes(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

// A file the gate counts must also be a file the runtime can parse: a
// syntactically broken module would silently receive only the regex pass,
// so a failed parse is reported as a coverage failure instead. The parse is
// the engine's own (node --check), not a re-implementation.
function parseFailureReason(absolute) {
  const result = spawnSync(process.execPath, ['--check', absolute], { timeout: 20000 });
  if (result.error) return `spawn failed: ${result.error.message}`;
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim().split('\n').filter(Boolean).pop();
    return `syntax: ${detail ?? `exit ${result.status}`}`;
  }
  return null;
}

export function scanSourceSecurity({
  root,
  governedRoots = GOVERNED_ROOTS,
  requiredCoverage = REQUIRED_COVERAGE,
  baseline = null
}) {
  const files = listGovernedFiles(root, governedRoots);
  const analysed = [];
  const parseFailures = [];
  const findings = [];
  for (const relative of files) {
    const absolute = path.join(root, relative);
    let source;
    try {
      source = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      parseFailures.push({ file: relative, reason: `unreadable: ${error.message}` });
      continue;
    }
    const parseProblem = parseFailureReason(absolute);
    if (parseProblem) {
      parseFailures.push({ file: relative, reason: parseProblem });
      continue;
    }
    const stripped = stripCommentShapes(source);
    const lines = stripped.split('\n');
    analysed.push(relative);
    for (const rule of RULES) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(stripped)) !== null) {
        const upTo = stripped.slice(0, match.index);
        const line = upTo.split('\n').length;
        findings.push({
          file: relative,
          line,
          code: rule.code,
          excerpt: (lines[line - 1] ?? '').trim().slice(0, 160)
        });
      }
    }
  }
  findings.sort((a, b) => (a.file + a.line + a.code).localeCompare(b.file + b.line + b.code));

  const baselineEntries = Array.isArray(baseline?.entries) ? baseline.entries : null;
  // A baseline entry matches a finding on file + rule + EXCERPT (the
  // reported code line): the excerpt pins the content that was reviewed, so
  // the disclosure survives another lane moving the code to a different
  // line, and a changed line can no longer hide behind an old line number.
  // An entry without an excerpt (a legacy shape) matches on file + line +
  // code as before. Matching consumes the entry, so a SECOND occurrence of
  // the same code stays unbaselined and fails.
  const entryMatchesFinding = (entry, finding) => (
    entry.file === finding.file
    && entry.code === finding.code
    && (typeof entry.excerpt === 'string' ? entry.excerpt === finding.excerpt : entry.line === finding.line)
  );
  const findingKeys = new Set(findings.map((finding) => `${finding.file}:${finding.code}:${finding.excerpt}`));
  const baselined = [];
  const unbaselined = [];
  const staleBaselineEntries = [];
  if (baselineEntries === null) {
    unbaselined.push(...findings);
  } else {
    const consumed = new Set();
    for (const finding of findings) {
      const entry = baselineEntries.find((candidate, index) => (
        !consumed.has(index) && entryMatchesFinding(candidate, finding)
      ));
      if (entry) {
        consumed.add(baselineEntries.indexOf(entry));
        baselined.push({ ...finding, justification: entry.justification ?? '' });
      } else {
        unbaselined.push(finding);
      }
    }
    baselineEntries.forEach((entry, index) => {
      if (!consumed.has(index)) {
        staleBaselineEntries.push({ file: entry.file, line: entry.line, code: entry.code });
      }
    });
  }

  // The required-coverage assertion pins THIS repository's material. It is
  // enforced where the governed roots exist at all (the repository, or a
  // copy of it); a foreign tree that never carried those roots is a fixture,
  // not a repository missing its material, and enforcing there would make
  // every fixture run fail for the wrong reason.
  const requiredCoverageEnforced = governedRoots.some((governed) => {
    try {
      return fs.statSync(path.join(root, governed)).isDirectory();
    } catch {
      return false;
    }
  });
  const requiredCoverageMissing = requiredCoverageEnforced
    ? (requiredCoverage ?? []).filter((name) => !analysed.includes(name))
    : [];
  const byExtension = {};
  for (const relative of analysed) {
    const extension = path.extname(relative);
    byExtension[extension] = (byExtension[extension] ?? 0) + 1;
  }

  const ok = unbaselined.length === 0
    && parseFailures.length === 0
    && staleBaselineEntries.length === 0
    && requiredCoverageMissing.length === 0;
  return {
    schema_version: '1.0.0',
    ok,
    governed_roots: [...governedRoots],
    coverage: {
      files_analysed: analysed.length,
      by_extension: byExtension,
      required_coverage_enforced: requiredCoverageEnforced,
      required_coverage: [...(requiredCoverage ?? [])],
      required_coverage_missing: requiredCoverageMissing,
      analysed_files: analysed,
      parse_failures: parseFailures
    },
    rules: RULES.map((rule) => rule.code),
    findings_total: findings.length,
    baselined,
    unbaselined,
    stale_baseline_entries: staleBaselineEntries
  };
}

export function loadBaseline(root) {
  const absolute = path.join(root, BASELINE_PATH);
  if (!fs.existsSync(absolute)) return { entries: [] };
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function main() {
  const args = process.argv.slice(2);
  const rootFlag = args.indexOf('--root');
  const root = rootFlag !== -1 ? path.resolve(args[rootFlag + 1]) : process.cwd();
  const jsonFlag = args.indexOf('--report');
  const report = scanSourceSecurity({ root, baseline: loadBaseline(root) });
  if (jsonFlag !== -1) {
    fs.mkdirSync(path.dirname(path.resolve(args[jsonFlag + 1])), { recursive: true });
    fs.writeFileSync(path.resolve(args[jsonFlag + 1]), `${JSON.stringify(report, null, 2)}\n`);
  }
  const emit = process.stdout;
  emit.write(`source security scan: ${report.ok ? 'PASS' : 'FAIL'}\n`);
  emit.write(`  analysed ${report.coverage.files_analysed} file(s) `
    + `${JSON.stringify(report.coverage.by_extension)} under ${report.governed_roots.join(', ')}\n`);
  emit.write(`  required coverage present: ${report.coverage.required_coverage.length - report.coverage.required_coverage_missing.length}`
    + `/${report.coverage.required_coverage.length}\n`);
  for (const finding of report.unbaselined) {
    emit.write(`  UNBASELINED ${finding.code} ${finding.file}:${finding.line} ${finding.excerpt}\n`);
  }
  for (const entry of report.stale_baseline_entries) {
    emit.write(`  STALE BASELINE ${entry.code} ${entry.file}:${entry.line}\n`);
  }
  for (const failure of report.coverage.parse_failures) {
    emit.write(`  PARSE FAILURE ${failure.file}: ${failure.reason}\n`);
  }
  for (const missing of report.coverage.required_coverage_missing) {
    emit.write(`  MISSING REQUIRED COVERAGE ${missing}\n`);
  }
  process.exitCode = report.ok ? 0 : 1;
}

const invokedAsCli = process.argv[1]
  && process.argv[1] !== '-'
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedAsCli) {
  main();
}
