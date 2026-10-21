// MAWS vNext — the residual matrix is machine-checked.
// node:test + node:assert/strict, no new dependencies.
//
// The residual matrix is the inventory of the boundaries the evidence gates
// draw and of the PROOF each one carries. Prose would let it rot: a test
// that was deleted would leave the claim standing, a renamed refusal would
// leave the matrix naming a branch that no longer exists. These checks make
// the matrix fail instead:
//
//   - a claimed proof must name a test that EXISTS in the named file;
//   - a boundary without a proof must name NO test;
//   - a named refusal code must occur in the surface it is attributed to;
//   - every residual class a surface DECLARES must be in the matrix;
//   - the proof status vocabulary is closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MATRIX_PATH = path.join(ROOT, 'evidence', 'assurance-closure-2026-10-21', 'residual-matrix.json');

const PROVING_STATUSES = new Set([
  'PROVEN_NEGATIVE',
  'PROVEN_LIMIT',
  'PARTIALLY_NARROWED',
  'PROVEN_BY_LOADER'
]);

function readMatrix() {
  return JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
}

// The test titles a file declares, exactly as the runner sees them.
function declaredTestTitles(relative) {
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const titles = new Set();
  const pattern = /test\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    titles.add(match[2]);
  }
  return titles;
}

// The residual classes a surface declares in its own header, e.g.
// "//   R1  C3 detects the REPLACEMENT of a target ...".
function declaredResidualClasses(relative) {
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const classes = new Set();
  const pattern = /^\/\/\s+(R\d)\s/gm;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    classes.add(match[1]);
  }
  return classes;
}

test('the residual matrix is well formed and its vocabulary is closed', () => {
  const matrix = readMatrix();
  assert.equal(matrix.schema_version, '1.0.0');
  assert.ok(Array.isArray(matrix.entries) && matrix.entries.length > 0, 'the matrix has entries');
  const vocabulary = new Set(Object.keys(matrix.proof_status_vocabulary ?? {}));
  assert.ok(vocabulary.size > 0, 'the vocabulary is declared');
  for (const entry of matrix.entries) {
    assert.ok(vocabulary.has(entry.proof_status), `${entry.id} uses a declared proof status: ${entry.proof_status}`);
    assert.ok(typeof entry.boundary === 'string' && entry.boundary.length > 0, `${entry.id} states its boundary`);
    assert.ok(typeof entry.surface === 'string' && entry.surface.length > 0, `${entry.id} names its surface`);
  }
});

test('every claimed proof names a test that exists in the named file', () => {
  const matrix = readMatrix();
  let claimed = 0;
  for (const entry of matrix.entries) {
    const proved = entry.proved_by ?? [];
    if (PROVING_STATUSES.has(entry.proof_status)) {
      assert.ok(proved.length > 0, `${entry.id} claims proof and must name the test that proves it`);
      for (const proof of proved) {
        assert.ok(fs.existsSync(path.join(ROOT, proof.file)), `${entry.id} names an existing test file: ${proof.file}`);
        const titles = declaredTestTitles(proof.file);
        assert.ok(titles.has(proof.test), `${entry.id} names a test that exists in ${proof.file}: ${proof.test}`);
        claimed += 1;
      }
    } else {
      assert.equal(proved.length, 0, `${entry.id} claims no proof and must name no test`);
    }
  }
  assert.ok(claimed > 0, 'the matrix claims at least one proof');
});

test('a boundary without a proof names no test', () => {
  const matrix = readMatrix();
  const unproven = matrix.entries.filter((entry) => !PROVING_STATUSES.has(entry.proof_status));
  assert.ok(unproven.length > 0, 'the matrix names the boundaries it does NOT prove');
  for (const entry of unproven) {
    assert.ok(
      ['UNPROVEN_BY_RUNTIME', 'UNREACHABLE_IN_CHAIN', 'DEAD_BRANCH'].includes(entry.proof_status),
      `${entry.id} uses an honest status for an unproven boundary: ${entry.proof_status}`
    );
    assert.ok(typeof entry.note === 'string' && entry.note.length > 0, `${entry.id} says why it is unproven`);
  }
});

test('every named refusal code occurs in the surface it is attributed to', () => {
  const matrix = readMatrix();
  for (const entry of matrix.entries) {
    if (!entry.refusal_code) continue;
    const surface = fs.readFileSync(path.join(ROOT, entry.surface), 'utf8');
    assert.ok(
      surface.includes(entry.refusal_code),
      `${entry.id} names the refusal ${entry.refusal_code}, which occurs in ${entry.surface}`
    );
  }
});

test('every residual class a surface declares is in the matrix', () => {
  const matrix = readMatrix();
  const matrixIds = new Set(matrix.entries.map((entry) => entry.id));
  for (const surface of matrix.surfaces) {
    for (const declared of declaredResidualClasses(surface)) {
      assert.ok(matrixIds.has(declared), `${surface} declares residual ${declared} and the matrix must account for it`);
    }
  }
});

test('the matrix covers both evidence surfaces and the confinement primitive', () => {
  const matrix = readMatrix();
  const surfaces = new Set(matrix.entries.map((entry) => entry.surface));
  for (const expected of [
    'scripts/tools/path-confinement.mjs',
    'scripts/tools/evidence-admission.mjs',
    'scripts/tools/evidence-provenance.mjs'
  ]) {
    assert.ok(surfaces.has(expected), `the matrix accounts for ${expected}`);
  }
});
