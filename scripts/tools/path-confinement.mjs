// Shared path confinement for repository-local tool surfaces.
//
// A path that LEAVES its base directory defeats the confinement it was
// checked against. A purely lexical check ("does the path start with the
// base?") is defeated by a symlink whose target lies outside the base, and a
// realpath check is defeated by a file that is swapped between the check and
// the read. A tool that reads material through such a path can measure
// something the tool does not own.
//
// The primitive therefore proves containment twice and binds the read to a
// verified file descriptor:
//
//   C1  the declared path is relative and stays lexically inside the base;
//   C2  the REAL path of the target stays inside the REAL path of the base,
//       so a symlink INSIDE the base that points OUTSIDE it is refused, and
//       so is a symlinked parent directory that carries the target out;
//   C3  the content is read through a descriptor opened with O_NOFOLLOW on
//       the verified real path, and the descriptor's identity (device and
//       inode) is compared with the identity observed during the check, so a
//       target replaced in the window is detected instead of being read;
//   C4  the target must be a regular file, so a directory, a FIFO or a
//       device can never be read as material (a FIFO would block the
//       reader forever).
//
// RESIDUAL (documented, not eliminated): C1-C4 do not close a race in which
// a concurrent writer replaces the PARENT DIRECTORY of the target between
// the containment check and the open, and the replacement carries a file
// with the same device and inode identity. Closing that would require
// openat(2) with O_NOFOLLOW relative to a trusted directory descriptor,
// which Node's public API does not expose. The threat requires a concurrent
// writer with write access to the working tree that already holds the
// material. No adversarial parallel symlink swap is claimed as tested.

import fs from 'node:fs';
import path from 'node:path';

export const PATH_CONFINEMENT_CODES = Object.freeze({
  INVALID_PATH: 'PATH_INVALID',
  ABSOLUTE_PATH: 'PATH_ABSOLUTE_NOT_ALLOWED',
  ESCAPES_BASE: 'PATH_ESCAPES_BASE',
  BASE_UNRESOLVABLE: 'PATH_BASE_UNRESOLVABLE',
  ESCAPES_BASE_THROUGH_SYMLINK: 'PATH_ESCAPES_BASE_THROUGH_SYMLINK',
  NOT_FOUND: 'PATH_NOT_FOUND',
  NOT_A_FILE: 'PATH_NOT_A_FILE',
  IS_A_SYMLINK: 'PATH_IS_A_SYMLINK',
  CHANGED_DURING_RESOLUTION: 'PATH_CHANGED_DURING_RESOLUTION',
  NOT_READABLE: 'PATH_NOT_READABLE'
});

export class PathConfinementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PathConfinementError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PathConfinementError(code, message);
}

// O_NOFOLLOW is a POSIX flag; it is absent on platforms that do not define
// it. Where it is missing the identity check (C3) still applies, but the
// final-component refusal does not, so the capability is reported honestly
// instead of being assumed.
export const O_NOFOLLOW_SUPPORTED = Number.isInteger(fs.constants.O_NOFOLLOW);
const NOFOLLOW = O_NOFOLLOW_SUPPORTED ? fs.constants.O_NOFOLLOW : 0;

/**
 * True when `candidate` is `base` itself or lies below it. The comparison is
 * made on resolved absolute paths, never on the strings a caller supplied.
 */
export function isInsideDirectory(base, candidate) {
  return candidate === base || candidate.startsWith(base + path.sep);
}

/**
 * True when `candidate` lies strictly below `base`.
 */
export function isStrictlyInsideDirectory(base, candidate) {
  return candidate !== base && candidate.startsWith(base + path.sep);
}

/**
 * Resolve a declared relative path inside a base directory and prove that the
 * material it names stays inside that base.
 *
 * Returns a confinement record. The record is NOT a permission to read: the
 * read itself must go through `readConfinedFile`, which re-checks the
 * identity of the target against the identity observed here.
 */
export function confineFileToBase(baseDir, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    fail(PATH_CONFINEMENT_CODES.INVALID_PATH, `a non-empty relative path is required, got ${JSON.stringify(relativePath)}`);
  }
  if (path.isAbsolute(relativePath)) {
    fail(PATH_CONFINEMENT_CODES.ABSOLUTE_PATH, `an absolute path is not allowed here: ${relativePath}`);
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relativePath);
  // C1: the declared path must stay lexically inside the base. A path that
  // climbs out with ".." is refused before any filesystem access.
  if (!isStrictlyInsideDirectory(base, resolved)) {
    fail(PATH_CONFINEMENT_CODES.ESCAPES_BASE, `${relativePath} resolves outside ${base}`);
  }
  let realBase;
  try {
    realBase = fs.realpathSync(base);
  } catch (error) {
    fail(PATH_CONFINEMENT_CODES.BASE_UNRESOLVABLE, `the base directory ${base} could not be resolved: ${error.message}`);
  }
  let realPath;
  try {
    realPath = fs.realpathSync(resolved);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `${relativePath} does not exist under ${base}`);
    }
    fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `${relativePath} could not be resolved: ${error.message}`);
  }
  // C2: the real path must stay inside the real base. This is the check a
  // lexical comparison cannot make: the link may point anywhere.
  if (!isInsideDirectory(realBase, realPath)) {
    fail(
      PATH_CONFINEMENT_CODES.ESCAPES_BASE_THROUGH_SYMLINK,
      `${relativePath} resolves outside ${realBase} through a symbolic link (${realPath})`
    );
  }
  // C4: only a regular file may be material.
  let stat;
  try {
    stat = fs.statSync(realPath);
  } catch (error) {
    fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `${relativePath} could not be inspected: ${error.message}`);
  }
  if (!stat.isFile()) {
    fail(PATH_CONFINEMENT_CODES.NOT_A_FILE, `${relativePath} is not a regular file`);
  }
  const parentPath = path.dirname(realPath);
  let parentStat;
  try {
    parentStat = fs.statSync(parentPath);
  } catch (error) {
    fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `the parent directory of ${relativePath} could not be inspected: ${error.message}`);
  }
  return {
    base,
    resolved,
    realBase,
    realPath,
    relativePath,
    dev: stat.dev,
    ino: stat.ino,
    parentPath,
    parentDev: parentStat.dev,
    parentIno: parentStat.ino
  };
}

/**
 * Read a confined file through a verified descriptor.
 *
 * The descriptor is opened on the REAL path with O_NOFOLLOW, so the final
 * component cannot be a link at the moment of the open. The descriptor's
 * identity and the parent directory's identity are compared with the
 * identities observed during the confinement: a target or a parent
 * directory replaced in between is refused instead of being read.
 */
export function readConfinedFile(confined) {
  let fd;
  try {
    fd = fs.openSync(confined.realPath, fs.constants.O_RDONLY | NOFOLLOW);
  } catch (error) {
    if (error && error.code === 'ELOOP') {
      fail(PATH_CONFINEMENT_CODES.IS_A_SYMLINK, `${confined.relativePath} is a symbolic link at the verified path`);
    }
    if (error && error.code === 'ENOENT') {
      fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `${confined.relativePath} disappeared before it could be read`);
    }
    fail(PATH_CONFINEMENT_CODES.NOT_READABLE, `${confined.relativePath} could not be opened: ${error.message}`);
  }
  try {
    // C4 (again, on the opened descriptor itself): the material must be a
    // regular file, whatever the path said a moment ago.
    const fdStat = fs.fstatSync(fd);
    if (!fdStat.isFile()) {
      fail(PATH_CONFINEMENT_CODES.NOT_A_FILE, `${confined.relativePath} is not a regular file`);
    }
    // C3: the descriptor must be the very file that was checked.
    if (fdStat.dev !== confined.dev || fdStat.ino !== confined.ino) {
      fail(
        PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION,
        `${confined.relativePath} was replaced between the containment check and the read`
      );
    }
    let parentStat;
    try {
      parentStat = fs.statSync(confined.parentPath);
    } catch (error) {
      fail(
        PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION,
        `the parent directory of ${confined.relativePath} could not be re-checked: ${error.message}`
      );
    }
    if (parentStat.dev !== confined.parentDev || parentStat.ino !== confined.parentIno) {
      fail(
        PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION,
        `the parent directory of ${confined.relativePath} was replaced between the containment check and the read`
      );
    }
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
