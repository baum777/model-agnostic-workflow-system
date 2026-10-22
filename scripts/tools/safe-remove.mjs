#!/usr/bin/env node
// MAWS vNext — removal of scratch state inside a declared boundary.
//
// WHY THIS EXISTS
// On 2026-10-21 a run's cleanup removed /tmp. The cleanup was written as
// `fs.rmSync(path.dirname(outDir))` where `outDir` was a temporary
// directory directly under the system temporary directory: the parent of
// the temporary directory IS the temporary directory's parent, and that
// parent held the state of every other run on the machine. The call was
// syntactically ordinary and destroyed unrelated material.
//
// The shape of the mistake is not exotic: it is "compute a path from
// something that was handed to me, then remove it". The defence is a
// boundary, not a career's worth of attention.
//
// THIS MODULE
// `safeRemove({ target, boundary, ... })` removes a path and refuses to do
// so unless every one of these holds:
//
//   1. THE BOUNDARY IS EXPLICIT. There is no default. A caller must name
//      what it owns, and the removal is checked against that name.
//   2. THE TARGET IS INSIDE THE BOUNDARY. A target outside it, or a
//      target that IS the boundary, is refused.
//   3. THE TARGET IS NOT AN ANCESTOR OF THE BOUNDARY. This is the exact
//      /tmp incident: removing a directory that CONTAINS the boundary
//      would remove the boundary and everything above it.
//   4. THE TARGET IS NOT REACHED THROUGH A SYMLINK. The link itself is
//      what would be removed, and a link whose target leaves the boundary
//      is refused rather than followed.
//   5. A NON-EMPTY DIRECTORY IS ONLY REMOVED WHEN THE CALLER SAYS SO.
//      `recursive` is opt-in; without it a directory with content is
//      refused, so "remove this" and "remove this and everything in it"
//      cannot be confused.
//   6. THE TARGET CARRIES ITS OWNERSHIP MARKER, IF ONE IS NAMED. A
//      harness that creates scratch state can mark it, and only marked
//      state is removable. Unmarked state belongs to someone else.
//
// The primitive FAILS CLOSED: when a rule cannot be decided, the removal
// is refused. It never removes anything as a side effect of a decision
// it could not make.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SAFE_REMOVE_CODES = Object.freeze({
  BOUNDARY_MISSING: 'SAFE_REMOVE_BOUNDARY_MISSING',
  BOUNDARY_UNRESOLVABLE: 'SAFE_REMOVE_BOUNDARY_UNRESOLVABLE',
  TARGET_UNRESOLVABLE: 'SAFE_REMOVE_TARGET_UNRESOLVABLE',
  OUTSIDE_BOUNDARY: 'SAFE_REMOVE_OUTSIDE_BOUNDARY',
  IS_BOUNDARY: 'SAFE_REMOVE_IS_BOUNDARY',
  IS_ANCESTOR_OF_BOUNDARY: 'SAFE_REMOVE_IS_ANCESTOR_OF_BOUNDARY',
  SYMLINK_ESCAPE: 'SAFE_REMOVE_SYMLINK_ESCAPE',
  NOT_EMPTY: 'SAFE_REMOVE_NOT_EMPTY',
  MARKER_MISSING: 'SAFE_REMOVE_MARKER_MISSING'
});

export class SafeRemoveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SafeRemoveError';
    this.code = code;
  }
}

function refusal(code, message) {
  return { removed: false, refused: { code, message } };
}

// realpathSync without throwing: the caller decides what a missing path
// means.
function resolveExisting(candidate) {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

// The path a symlink POINTS at, or null when it is not a symlink or the
// link is broken.
function linkTarget(candidate) {
  try {
    if (!fs.lstatSync(candidate).isSymbolicLink()) return null;
    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

function isInside(candidate, boundary) {
  return candidate === boundary || candidate.startsWith(boundary + path.sep);
}

export function safeRemove({
  target,
  boundary,
  recursive = false,
  marker = null,
  dryRun = false
}) {
  if (typeof target !== 'string' || target.trim() === '') {
    throw new SafeRemoveError(SAFE_REMOVE_CODES.TARGET_UNRESOLVABLE, 'a target must be named');
  }
  if (typeof boundary !== 'string' || boundary.trim() === '') {
    // There is no default boundary. A removal without one is a removal
    // without a limit, and that is the shape that removed /tmp.
    throw new SafeRemoveError(SAFE_REMOVE_CODES.BOUNDARY_MISSING, 'a boundary must be named: the removal is checked against what the caller owns');
  }
  const boundaryReal = resolveExisting(boundary);
  if (!boundaryReal || !fs.statSync(boundaryReal).isDirectory()) {
    return refusal(SAFE_REMOVE_CODES.BOUNDARY_UNRESOLVABLE, `the boundary ${boundary} is not a resolvable directory`);
  }
  const targetAbsolute = path.resolve(target);
  // The target is resolved through its PARENT, so that a symlink is
  // identified as a symlink instead of being silently replaced by the
  // path it points at.
  const parentReal = resolveExisting(path.dirname(targetAbsolute));
  const targetReal = parentReal ? path.join(parentReal, path.basename(targetAbsolute)) : targetAbsolute;
  if (!parentReal && !fs.existsSync(targetAbsolute)) {
    return refusal(SAFE_REMOVE_CODES.TARGET_UNRESOLVABLE, `the target ${target} does not exist`);
  }
  if (targetReal === boundaryReal) {
    return refusal(SAFE_REMOVE_CODES.IS_BOUNDARY, `the target IS the boundary ${boundary}; the boundary is what the caller owns and is never removed`);
  }
  if (isInside(boundaryReal, targetReal)) {
    // The /tmp incident: the target CONTAINS the boundary.
    return refusal(SAFE_REMOVE_CODES.IS_ANCESTOR_OF_BOUNDARY, `the target ${target} contains the boundary ${boundary}; removing it would remove the boundary and everything above it`);
  }
  if (!isInside(targetReal, boundaryReal)) {
    return refusal(SAFE_REMOVE_CODES.OUTSIDE_BOUNDARY, `the target ${target} is outside the boundary ${boundary}`);
  }
  const link = linkTarget(targetAbsolute);
  if (link !== null && !isInside(link, boundaryReal)) {
    return refusal(SAFE_REMOVE_CODES.SYMLINK_ESCAPE, `the target ${target} is a symbolic link that points outside the boundary ${boundary}; it is not followed`);
  }
  if (!fs.existsSync(targetAbsolute)) {
    // The target is already gone. Nothing to remove, and nothing to
    // complain about: the desired state holds.
    return { removed: false, refused: null, target: targetAbsolute, boundary: boundaryReal, alreadyAbsent: true };
  }
  const stats = fs.lstatSync(targetAbsolute);
  if (stats.isDirectory()) {
    const entries = fs.readdirSync(targetAbsolute);
    if (entries.length > 0 && !recursive) {
      return refusal(SAFE_REMOVE_CODES.NOT_EMPTY, `the target ${target} is a directory with ${entries.length} entr(ies); removing its content must be asked for explicitly`);
    }
    if (marker !== null) {
      const markerPath = path.join(targetAbsolute, marker);
      if (!fs.existsSync(markerPath)) {
        return refusal(SAFE_REMOVE_CODES.MARKER_MISSING, `the target ${target} does not carry the ownership marker ${marker}; only marked state is removable`);
      }
    }
  }
  if (dryRun) {
    return { removed: false, refused: null, target: targetAbsolute, boundary: boundaryReal, wouldRemove: true };
  }
  fs.rmSync(targetAbsolute, { recursive: true, force: false, maxRetries: 3 });
  return { removed: true, refused: null, target: targetAbsolute, boundary: boundaryReal };
}

// The ownership marker a scratch directory carries. A directory that does
// not carry it is not scratch state and is not removable.
export const SCRATCH_MARKER = '.unitera-scratch';

// createScratchRoot({ prefix }) -> { root, marker }.
//
// Scratch state is created in ONE shape, so that it can be removed in one
// shape: a directory that carries the ownership marker. The marker is what
// makes the removal safe even when the boundary is as broad as the system
// temporary directory, because only marked state is removable.
export function createScratchRoot({ prefix = 'maws-scratch-', parent = os.tmpdir() } = {}) {
  const root = fs.mkdtempSync(path.join(parent, prefix));
  fs.writeFileSync(path.join(root, SCRATCH_MARKER), 'scratch state\n');
  return { root, marker: SCRATCH_MARKER };
}

// removeScratchRoot({ root, marker }) -> the safeRemove result.
//
// The boundary is the PARENT of the scratch root, and the marker decides
// whether the root may go. A directory under the system temporary
// directory without the marker is refused, so a mistyped path cannot
// remove another run's state.
export function removeScratchRoot({ root, marker = SCRATCH_MARKER, parent = os.tmpdir() } = {}) {
  return safeRemove({ target: root, boundary: parent, recursive: true, marker });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.target || !options.boundary) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: 'usage: safe-remove.mjs --boundary <dir> --target <path> [--recursive] [--marker <name>] [--dry-run]'
    }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    result = safeRemove({
      target: String(options.target),
      boundary: String(options.boundary),
      recursive: options.recursive === true || options.recursive === 'true',
      marker: options.marker ? String(options.marker) : null,
      dryRun: options.dryRun === true || options.dryRun === 'true'
    });
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, code: error.code ?? null }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${JSON.stringify({
    ok: result.refused === null,
    removed: result.removed,
    wouldRemove: result.wouldRemove === true,
    alreadyAbsent: result.alreadyAbsent === true,
    target: result.target ?? null,
    refused: result.refused ?? null
  }, null, 2)}\n`);
  process.exitCode = result.refused === null ? 0 : 1;
}

const invokedAsCli = process.argv[1]
  && process.argv[1] !== '-'
  && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (invokedAsCli) {
  main();
}
