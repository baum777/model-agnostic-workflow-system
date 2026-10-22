// MAWS vNext — the content verification of a persisted evidence directory.
// node:test + node:assert/strict, no new dependencies.
//
// A run record proves BYTES. This module proves CONTENT: that the evidence
// says what it is supposed to say, that every file in the evidence
// directory was looked at, and that the narrative agrees with the machine
// it describes.
//
// The negative cases below are the point: a checker that only ever says
// PASS is not a checker. Each one breaks the evidence in a way that could
// plausibly happen, and the check has to notice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { validateEvidenceContent, EVIDENCE_CONTENT_CODES } from '../../scripts/tools/validate-evidence-content.mjs';
import { createScratchRoot, removeScratchRoot } from '../../scripts/tools/safe-remove.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'tools', 'validate-evidence-content.mjs');

function buildEvidence(files) {
  const { root: scratch, marker } = createScratchRoot({ prefix: 'evidence-content-' });
  const dir = path.join(scratch, 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return { dir, scratch, marker };
}

const MANIFEST = {
  schema_version: '1.0.0',
  evidence_dir: 'evidence',
  files: [
    { path: 'run-record.json', checks: [{ kind: 'parses_as_json' }, { kind: 'json_field_equals', path: 'totals.gates', value: 2 }] },
    { path: 'RUN.md', checks: [{ kind: 'contains', text: '2 / 2 passed' }] },
    { path_pattern: 'gates/*.exit', checks: [{ kind: 'matches', pattern: '^0$', flags: 'm' }] }
  ]
};

const EVIDENCE = {
  'run-record.json': JSON.stringify({ totals: { gates: 2 } }),
  'RUN.md': '# run\n\n2 / 2 passed\n',
  'gates/one.exit': '0\n',
  'gates/two.exit': '0\n'
};

test('evidence that says what the manifest requires passes', () => {
  const { dir, scratch, marker } = buildEvidence(EVIDENCE);
  const result = validateEvidenceContent({ evidenceDir: dir, manifest: MANIFEST });
  assert.equal(result.passed, true, JSON.stringify(result.issues));
  assert.equal(result.files_present, 4);
  assert.equal(result.files_declared, 4);
  removeScratchRoot({ root: scratch, marker });
});

test('a file the manifest declares but the evidence does not carry is reported', () => {
  const { dir, scratch, marker } = buildEvidence(EVIDENCE);
  const manifest = { ...MANIFEST, files: [...MANIFEST.files, { path: 'absent.json', checks: [{ kind: 'non_empty' }] }] };
  const result = validateEvidenceContent({ evidenceDir: dir, manifest });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => issue.code === EVIDENCE_CONTENT_CODES.FILE_MISSING));
  removeScratchRoot({ root: scratch, marker });
});

test('a file in the evidence that nobody declared is reported', () => {
  const { dir, scratch, marker } = buildEvidence({ ...EVIDENCE, 'sneaky.txt': 'nobody looked at me\n' });
  const result = validateEvidenceContent({ evidenceDir: dir, manifest: MANIFEST });
  assert.equal(result.passed, false);
  const undeclared = result.issues.find((issue) => issue.code === EVIDENCE_CONTENT_CODES.UNDECLARED_FILE);
  assert.ok(undeclared, JSON.stringify(result.issues));
  assert.match(undeclared.message, /sneaky\.txt/);
  removeScratchRoot({ root: scratch, marker });
});

test('a gate output that lost its verdict line is reported', () => {
  const { dir, scratch, marker } = buildEvidence({
    ...EVIDENCE,
    'gates/one.exit': '1\n'
  });
  const result = validateEvidenceContent({ evidenceDir: dir, manifest: MANIFEST });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => issue.code === EVIDENCE_CONTENT_CODES.CHECK_FAILED && /gates\/one\.exit/.test(issue.message)));
  removeScratchRoot({ root: scratch, marker });
});

test('a narrative that drifted from the machine it describes is reported', () => {
  const { dir, scratch, marker } = buildEvidence({
    ...EVIDENCE,
    'RUN.md': '# run\n\n15 / 15 passed\n'
  });
  const result = validateEvidenceContent({ evidenceDir: dir, manifest: MANIFEST });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /RUN\.md/.test(issue.message) && /does not contain/.test(issue.message)));
  removeScratchRoot({ root: scratch, marker });
});

test('an empty file where the manifest requires content is reported', () => {
  const { dir, scratch, marker } = buildEvidence({ ...EVIDENCE, 'RUN.md': '' });
  const result = validateEvidenceContent({ evidenceDir: dir, manifest: MANIFEST });
  assert.equal(result.passed, false);
  // The file is empty, so the content it was supposed to carry is gone:
  // whatever the check reports, the emptied file is caught.
  assert.ok(
    result.issues.some((issue) => issue.code === EVIDENCE_CONTENT_CODES.CHECK_FAILED && /RUN\.md/.test(issue.message)),
    JSON.stringify(result.issues)
  );
  removeScratchRoot({ root: scratch, marker });
});

test('a file that is not readable JSON is reported', () => {
  const { dir, scratch, marker } = buildEvidence({ ...EVIDENCE, 'run-record.json': '{ not json' });
  const result = validateEvidenceContent({ evidenceDir: dir, manifest: MANIFEST });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /not readable JSON/.test(issue.message)));
  removeScratchRoot({ root: scratch, marker });
});

test('a field that carries a different value than the manifest requires is reported', () => {
  const { dir, scratch, marker } = buildEvidence({
    ...EVIDENCE,
    'run-record.json': JSON.stringify({ totals: { gates: 3 } })
  });
  const result = validateEvidenceContent({ evidenceDir: dir, manifest: MANIFEST });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /totals\.gates is 3/.test(issue.message)));
  removeScratchRoot({ root: scratch, marker });
});

test('an array item that does not match the manifest is reported', () => {
  const { dir, scratch, marker } = buildEvidence({
    ...EVIDENCE,
    'probes.json': JSON.stringify([{ status: 'LOAD_BEARING' }, { status: 'NOT_LOAD_BEARING' }])
  });
  const manifest = {
    ...MANIFEST,
    files: [...MANIFEST.files, { path: 'probes.json', checks: [{ kind: 'json_array_items_match', path: '', field: 'status', pattern: '^LOAD_BEARING' }] }]
  };
  const result = validateEvidenceContent({ evidenceDir: dir, manifest });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /1 of 2/.test(issue.message)));
  removeScratchRoot({ root: scratch, marker });
});

test('a manifest that names a check this module does not implement is reported, not ignored', () => {
  const { dir, scratch, marker } = buildEvidence(EVIDENCE);
  const manifest = { ...MANIFEST, files: [{ path: 'RUN.md', checks: [{ kind: 'assert_vibes' }] }] };
  const result = validateEvidenceContent({ evidenceDir: dir, manifest });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /does not implement/.test(issue.message)));
  removeScratchRoot({ root: scratch, marker });
});

test('the persisted evidence of the assurance closure run passes its own content manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'evidence', 'operational-safety-closure-2026-10-22', 'assurance-evidence-content.json'),
    'utf8'
  ));
  const result = validateEvidenceContent({
    evidenceDir: path.join(ROOT, manifest.evidence_dir),
    manifest
  });
  assert.equal(result.passed, true, JSON.stringify(result.issues));
  assert.ok(result.files_present >= 50, 'the whole evidence directory is covered');
  assert.equal(result.files_present, result.files_declared, 'every file is declared');
});

test('the CLI answers 0 on a passing manifest and 1 on a failing one', () => {
  const { dir, scratch, marker } = buildEvidence(EVIDENCE);
  const manifestPath = path.join(scratch, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ ...MANIFEST, evidence_dir: path.relative(scratch, dir) }));
  const output = execFileSync(
    process.execPath,
    [TOOL, '--root', scratch, manifestPath],
    { encoding: 'utf8' }
  );
  assert.match(output, /"passed": true/);
  fs.writeFileSync(path.join(dir, 'RUN.md'), '# run\n\nsomething else\n');
  let failed = false;
  try {
    execFileSync(process.execPath, [TOOL, '--root', scratch, manifestPath], { encoding: 'utf8' });
  } catch (error) {
    failed = true;
    assert.equal(error.status, 1);
    assert.match(String(error.stdout), /EVIDENCE_CONTENT_CHECK_FAILED/);
  }
  assert.equal(failed, true, 'the CLI fails on a manifest that is not met');
  removeScratchRoot({ root: scratch, marker });
});
