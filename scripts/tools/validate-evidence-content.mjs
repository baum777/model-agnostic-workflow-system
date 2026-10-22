#!/usr/bin/env node
// MAWS vNext — content verification of a persisted evidence directory.
//
// WHY THIS EXISTS
// A run record proves BYTES: it names every gate output by digest, so an
// output that was edited after the capture is detected. That is the
// strongest guarantee that a digest can give, and it is still not the
// guarantee a reader means by "the evidence says the tests passed". A
// digest proves that a file has not changed. It does not say what the
// file CONTAINS.
//
// So the content is checked here, separately and explicitly. A manifest
// declares what the evidence must SAY — the verdict line in the gate's own
// output, the numbers in the run record, the claim in the narrative that
// the record has to agree with — and this module checks the declared
// content against the committed files.
//
// Two properties make this worth having:
//
//   1. COMPLETENESS. Every file in the evidence directory must be
//      DECLARED by the manifest. A file that nobody declared is a file
//      nobody looked at, and it fails the check rather than waiting for
//      a reader to notice it.
//   2. THE PROSE IS CHECKED AGAINST THE MACHINE. The narrative run record
//      states numbers; the manifest states the same numbers as field
//      values; the check compares them. A narrative that drifts from the
//      record it describes fails.
//
// The manifest is a claim about the evidence. The check is what makes the
// claim true.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const EVIDENCE_CONTENT_CODES = Object.freeze({
  FILE_MISSING: 'EVIDENCE_CONTENT_FILE_MISSING',
  FILE_UNREADABLE: 'EVIDENCE_CONTENT_FILE_UNREADABLE',
  CHECK_FAILED: 'EVIDENCE_CONTENT_CHECK_FAILED',
  UNDECLARED_FILE: 'EVIDENCE_CONTENT_UNDECLARED_FILE',
  MANIFEST_INVALID: 'EVIDENCE_CONTENT_MANIFEST_INVALID',
  PATTERN_INVALID: 'EVIDENCE_CONTENT_PATTERN_INVALID'
});

function issue(code, message, extra = {}) {
  return { code, message, ...extra };
}

// A field path like "assurance_run_record.totals.gates_passed" -> the
// value at that path, or undefined.
function readField(document, fieldPath) {
  if (fieldPath === '' || fieldPath === undefined || fieldPath === null) return document;
  let current = document;
  for (const segment of String(fieldPath).split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[segment];
  }
  return current;
}

// A pattern with '*' matches any run of characters inside one path
// segment. The manifest states the shape it expects; the check reports
// what it found.
function matchesPattern(pattern, relative) {
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${expression}$`).test(relative);
}

function listFiles(directory, prefix = '') {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(absolute, relative));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found.sort();
}

function runCheck(check, content, relative) {
  const text = content.toString('utf8');
  switch (check.kind) {
    case 'non_empty':
      return text.trim() !== '' ? null : 'the file is empty';
    case 'min_bytes':
      return content.length >= Number(check.bytes)
        ? null
        : `the file has ${content.length} bytes, the manifest requires at least ${check.bytes}`;
    case 'contains':
      return text.includes(check.text) ? null : `the file does not contain ${JSON.stringify(check.text)}`;
    case 'not_contains':
      return text.includes(check.text) ? null : `the file contains ${JSON.stringify(check.text)}, which the manifest forbids`;
    case 'matches': {
      let expression;
      try {
        expression = new RegExp(check.pattern, check.flags ?? '');
      } catch (error) {
        return `the manifest pattern is not a valid expression: ${error.message}`;
      }
      return expression.test(text) ? null : `the file does not match ${JSON.stringify(check.pattern)}`;
    }
    case 'parses_as_json': {
      try {
        JSON.parse(text);
        return null;
      } catch (error) {
        return `the file is not readable JSON: ${error.message}`;
      }
    }
    case 'json_field_present': {
      try {
        const document = JSON.parse(text);
        return readField(document, check.path) !== undefined
          ? null
          : `the field ${check.path} is absent`;
      } catch (error) {
        return `the file is not readable JSON: ${error.message}`;
      }
    }
    case 'json_field_equals': {
      let document;
      try {
        document = JSON.parse(text);
      } catch (error) {
        return `the file is not readable JSON: ${error.message}`;
      }
      const found = readField(document, check.path);
      const expected = check.value;
      const same = Array.isArray(found) || (found && typeof found === 'object')
        ? JSON.stringify(found) === JSON.stringify(expected)
        : found === expected;
      return same
        ? null
        : `the field ${check.path} is ${JSON.stringify(found)}, the manifest requires ${JSON.stringify(expected)}`;
    }
    case 'json_array_items_match': {
      let document;
      try {
        document = JSON.parse(text);
      } catch (error) {
        return `the file is not readable JSON: ${error.message}`;
      }
      const items = readField(document, check.path);
      if (!Array.isArray(items)) {
        return `the field ${check.path} is not an array`;
      }
      if (items.length === 0) {
        return `the array ${check.path} is empty`;
      }
      let expression;
      try {
        expression = new RegExp(check.pattern, check.flags ?? '');
      } catch (error) {
        return `the manifest pattern is not a valid expression: ${error.message}`;
      }
      const offending = items
        .filter((item) => !expression.test(String(readField(item, check.field))))
        .map((item) => JSON.stringify(readField(item, check.field)));
      return offending.length === 0
        ? null
        : `${offending.length} of ${items.length} entr(ies) do not match ${JSON.stringify(check.pattern)}: ${offending.slice(0, 3).join(', ')}`;
    }
    default:
      return `the manifest names a check this module does not implement: ${check.kind}`;
  }
}

export function validateEvidenceContent({ evidenceDir, manifest }) {
  const issues = [];
  const checks = [];
  if (!manifest || !Array.isArray(manifest.files)) {
    return {
      passed: false,
      issues: [issue(EVIDENCE_CONTENT_CODES.MANIFEST_INVALID, 'the manifest does not declare a files list')],
      checks: []
    };
  }
  const absoluteRoot = path.resolve(evidenceDir);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    return {
      passed: false,
      issues: [issue(EVIDENCE_CONTENT_CODES.FILE_MISSING, `the evidence directory ${evidenceDir} does not exist`)],
      checks: []
    };
  }
  const present = listFiles(absoluteRoot);
  const declared = new Set();
  for (const entry of manifest.files) {
    const targets = entry.path
      ? [entry.path]
      : present.filter((relative) => matchesPattern(entry.path_pattern ?? '', relative));
    if (targets.length === 0) {
      issues.push(issue(
        EVIDENCE_CONTENT_CODES.FILE_MISSING,
        `the manifest declares ${entry.path ?? entry.path_pattern} and no file in the evidence directory matches it`,
        { file: entry.path ?? entry.path_pattern }
      ));
      continue;
    }
    for (const relative of targets) {
      declared.add(relative);
      const absolute = path.join(absoluteRoot, relative);
      if (!fs.existsSync(absolute)) {
        issues.push(issue(
          EVIDENCE_CONTENT_CODES.FILE_MISSING,
          `the manifest declares ${relative} and the evidence directory does not carry it`,
          { file: relative }
        ));
        continue;
      }
      let content;
      try {
        content = fs.readFileSync(absolute);
      } catch (error) {
        issues.push(issue(EVIDENCE_CONTENT_CODES.FILE_UNREADABLE, `the file ${relative} could not be read: ${error.message}`, { file: relative }));
        continue;
      }
      const results = [];
      for (const check of entry.checks ?? []) {
        const failure = runCheck(check, content, relative);
        results.push({ kind: check.kind, passed: failure === null, detail: failure });
        if (failure !== null) {
          issues.push(issue(EVIDENCE_CONTENT_CODES.CHECK_FAILED, `${relative}: ${failure}`, { file: relative, check: check.kind }));
        }
      }
      checks.push({ file: relative, checks: results });
    }
  }
  for (const relative of present) {
    if (!declared.has(relative)) {
      issues.push(issue(
        EVIDENCE_CONTENT_CODES.UNDECLARED_FILE,
        `${relative} is in the evidence directory and no manifest entry declares it; a file nobody looked at is not evidence`,
        { file: relative }
      ));
    }
  }
  return {
    passed: issues.length === 0,
    issues,
    checks,
    files_present: present.length,
    files_declared: declared.size
  };
}

function main() {
  const args = process.argv.slice(2);
  // The flags are parsed first and their VALUES are consumed with them, so
  // that the value of --root is never mistaken for the manifest.
  let root = process.cwd();
  let manifestPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root') {
      root = path.resolve(args[index + 1] ?? '.');
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    if (manifestPath === null) manifestPath = arg;
  }
  if (!manifestPath) {
    process.stdout.write(`${JSON.stringify({ passed: false, issues: ['no manifest was named'] }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ passed: false, issues: [`the manifest is not readable JSON: ${error.message}`] }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  const evidenceDir = path.resolve(root, manifest.evidence_dir ?? '.');
  const result = validateEvidenceContent({ evidenceDir, manifest });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.passed ? 0 : 1;
}

const invokedAsCli = process.argv[1]
  && process.argv[1] !== '-'
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedAsCli) {
  main();
}
