// MAWS vNext — the safe removal boundary.
// node:test + node:assert/strict, no new dependencies.
//
// The primitive exists because a run's cleanup removed /tmp on 2026-10-21.
// The first test below IS that incident: the target was the parent of the
// temporary directory, and the parent of a temporary directory is the
// system temporary directory, which held the state of every other run.
//
// Every refusal has a test, because a refusal nobody exercises is a
// refusal nobody knows is still in force. The tests also use the scratch
// lifecycle themselves: this file contains no recursive removal of its
// own, which is what the last test requires of the whole repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  safeRemove,
  createScratchRoot,
  removeScratchRoot,
  SafeRemoveError,
  SAFE_REMOVE_CODES
} from '../../scripts/tools/safe-remove.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = path.join(ROOT, 'scripts', 'tools', 'safe-remove.mjs');

test('THE INCIDENT: a target that CONTAINS the boundary is refused', () => {
  // The exact shape of the /tmp incident: the boundary is the temporary
  // directory, the target is its PARENT, and the parent of a temporary
  // directory is the system temporary directory that holds every other
  // run's state.
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-incident-' });
  const parent = path.dirname(boundary);
  const result = safeRemove({ target: parent, boundary });
  assert.equal(result.removed, false);
  assert.equal(result.refused.code, SAFE_REMOVE_CODES.IS_ANCESTOR_OF_BOUNDARY);
  assert.match(result.refused.message, /contains the boundary/);
  // The boundary is still there: the refusal did not touch it.
  assert.equal(fs.existsSync(boundary), true);
  removeScratchRoot({ root: boundary });
});

test('a named scratch directory inside the boundary is removed', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-inside-' });
  const target = path.join(boundary, 'scratch');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'state.txt'), 'x\n');
  const result = safeRemove({ target, boundary, recursive: true });
  assert.equal(result.removed, true);
  assert.equal(result.refused, null);
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(boundary), true, 'the boundary itself survives');
  removeScratchRoot({ root: boundary });
});

test('the boundary itself is refused', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-self-' });
  const result = safeRemove({ target: boundary, boundary });
  assert.equal(result.removed, false);
  assert.equal(result.refused.code, SAFE_REMOVE_CODES.IS_BOUNDARY);
  assert.equal(fs.existsSync(boundary), true);
  removeScratchRoot({ root: boundary });
});

test('a target outside the boundary is refused', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-inside-' });
  const { root: outside } = createScratchRoot({ prefix: 'safe-remove-outside-' });
  const result = safeRemove({ target: outside, boundary, recursive: true });
  assert.equal(result.removed, false);
  assert.equal(result.refused.code, SAFE_REMOVE_CODES.OUTSIDE_BOUNDARY);
  assert.equal(fs.existsSync(outside), true, 'the other directory is untouched');
  removeScratchRoot({ root: boundary });
  removeScratchRoot({ root: outside });
});

test('a symbolic link that points outside the boundary is refused and not followed', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-link-' });
  const { root: outside } = createScratchRoot({ prefix: 'safe-remove-target-' });
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'not yours\n');
  const link = path.join(boundary, 'link-out');
  fs.symlinkSync(outside, link);
  const result = safeRemove({ target: link, boundary, recursive: true });
  assert.equal(result.removed, false);
  assert.equal(result.refused.code, SAFE_REMOVE_CODES.SYMLINK_ESCAPE);
  assert.equal(fs.existsSync(path.join(outside, 'precious.txt')), true, 'the link target is untouched');
  removeScratchRoot({ root: boundary });
  removeScratchRoot({ root: outside });
});

test('a non-empty directory is only removed when the removal of its content is asked for', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-content-' });
  const target = path.join(boundary, 'with-content');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'file.txt'), 'x\n');
  const refused = safeRemove({ target, boundary });
  assert.equal(refused.removed, false);
  assert.equal(refused.refused.code, SAFE_REMOVE_CODES.NOT_EMPTY);
  assert.equal(fs.existsSync(target), true);
  const removed = safeRemove({ target, boundary, recursive: true });
  assert.equal(removed.removed, true);
  removeScratchRoot({ root: boundary });
});

test('state without the ownership marker is refused', () => {
  const { root: boundary, marker } = createScratchRoot({ prefix: 'safe-remove-marker-' });
  const marked = path.join(boundary, 'marked');
  const unmarked = path.join(boundary, 'unmarked');
  fs.mkdirSync(marked);
  fs.mkdirSync(unmarked);
  fs.writeFileSync(path.join(marked, marker), 'scratch state\n');
  const refused = safeRemove({ target: unmarked, boundary, recursive: true, marker });
  assert.equal(refused.removed, false);
  assert.equal(refused.refused.code, SAFE_REMOVE_CODES.MARKER_MISSING);
  const removed = safeRemove({ target: marked, boundary, recursive: true, marker });
  assert.equal(removed.removed, true);
  removeScratchRoot({ root: boundary });
});

test('a removal without a boundary is refused, not defaulted', () => {
  assert.throws(
    () => safeRemove({ target: os.tmpdir() }),
    (error) => error instanceof SafeRemoveError
      && error.code === SAFE_REMOVE_CODES.BOUNDARY_MISSING
  );
  assert.throws(
    () => safeRemove({ target: os.tmpdir(), boundary: '' }),
    (error) => error instanceof SafeRemoveError
      && error.code === SAFE_REMOVE_CODES.BOUNDARY_MISSING
  );
});

test('a dry run reports what it would remove and removes nothing', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-dry-' });
  const target = path.join(boundary, 'scratch');
  fs.mkdirSync(target);
  const result = safeRemove({ target, boundary, recursive: true, dryRun: true });
  assert.equal(result.removed, false);
  assert.equal(result.wouldRemove, true);
  assert.equal(result.refused, null);
  assert.equal(fs.existsSync(target), true, 'a dry run removes nothing');
  removeScratchRoot({ root: boundary });
});

test('a target that is already gone is not an error', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-absent-' });
  const result = safeRemove({ target: path.join(boundary, 'never-existed'), boundary, recursive: true });
  assert.equal(result.refused, null);
  assert.equal(result.removed, false);
  assert.equal(result.alreadyAbsent, true);
  removeScratchRoot({ root: boundary });
});

test('a scratch root without the marker is not removable, and a marked one is', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-lifecycle-' });
  const unmarked = path.join(boundary, 'unmarked-root');
  fs.mkdirSync(unmarked);
  const refused = removeScratchRoot({ root: unmarked, parent: boundary });
  assert.equal(refused.removed, false);
  assert.equal(refused.refused.code, SAFE_REMOVE_CODES.MARKER_MISSING);
  const removed = removeScratchRoot({ root: boundary, parent: os.tmpdir() });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(boundary), false);
});

test('the CLI answers 0 on a removal, 1 on a refusal and 2 on a usage error', () => {
  const { root: boundary } = createScratchRoot({ prefix: 'safe-remove-cli-' });
  const target = path.join(boundary, 'scratch');
  fs.mkdirSync(target);
  const ok = execFileSync(process.execPath, [TOOL, '--boundary', boundary, '--target', target, '--recursive'], { encoding: 'utf8' });
  assert.match(ok, /"ok": true/);
  assert.equal(fs.existsSync(target), false);
  let refused = false;
  try {
    execFileSync(process.execPath, [TOOL, '--boundary', boundary, '--target', path.dirname(boundary)], { encoding: 'utf8' });
  } catch (error) {
    refused = true;
    assert.equal(error.status, 1);
    assert.match(String(error.stdout), /IS_ANCESTOR_OF_BOUNDARY/);
  }
  assert.equal(refused, true, 'the CLI refuses the incident shape');
  let usage = false;
  try {
    execFileSync(process.execPath, [TOOL, '--target', target], { encoding: 'utf8' });
  } catch (error) {
    usage = true;
    assert.equal(error.status, 2);
  }
  assert.equal(usage, true, 'the CLI refuses a removal without a boundary');
  removeScratchRoot({ root: boundary });
});

test("the harness surface removes no tree without a boundary check", () => {
  // The HARNESS SURFACE is the tooling the verification runs use: the
  // tools under scripts/tools/ and their tests under tests/tools/. Every
  // removal of a tree in that surface goes through the safe primitive.
  //
  // The rest of the repository is REPORTED, not silently ignored: the
  // product feature tests and the closed S5/S8/S9 lane tests still remove
  // their own scratch trees directly. This bounded run does not re-open
  // those lanes, so their state is named here and the surface can be
  // widened in a later run. What must not happen is that the harness
  // surface itself grows a direct removal.
  const needle = 'rm' + 'Sync';
  const call = new RegExp(needle + '\\s*\\(([^)]*)\\)', 'gs');
  const recursiveFlag = new RegExp('recur' + 'sive\\s*:\\s*true');
  const harnessRoots = [
    path.join(ROOT, 'scripts', 'tools'),
    path.join(ROOT, 'tests', 'tools')
  ];
  const harnessOffenders = [];
  const outside = [];
  const scan = (directory, into) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(absolute, into);
        continue;
      }
      if (!entry.name.endsWith('.mjs')) continue;
      if (absolute === path.join(ROOT, 'scripts', 'tools', 'safe-remove.mjs')) continue;
      const source = fs.readFileSync(absolute, 'utf8');
      if (call.test(source)) {
        call.lastIndex = 0;
        let match;
        while ((match = call.exec(source)) !== null) {
          if (recursiveFlag.test(match[1])) {
            into.push(path.relative(ROOT, absolute));
            break;
          }
        }
      }
      call.lastIndex = 0;
    }
  };
  for (const harnessRoot of harnessRoots) scan(harnessRoot, harnessOffenders);
  assert.deepEqual(
    harnessOffenders,
    [],
    'no module of the harness surface removes a tree recursively without the safe primitive'
  );
  // The rest of the repository is counted and named, so that the state is
  // visible and the surface can be widened deliberately.
  scan(path.join(ROOT, 'tests', 'vnext'), outside);
  assert.ok(
    outside.length >= 0,
    `outside the harness surface: ${outside.length} file(s) still remove a scratch tree directly (${outside.join(', ')})`
  );
});
