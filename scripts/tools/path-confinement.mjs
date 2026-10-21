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
//   C3  the content is read through a descriptor opened with O_NOFOLLOW and
//       O_NONBLOCK on the verified real path, and the descriptor's identity
//       (device and inode) is compared with the identity observed during the
//       check, so a file REPLACED in the window is detected instead of being
//       read;
//   C4  the target must be a regular file, so a directory, a FIFO or a
//       device can never be read as material;
//   C5  the target must have exactly ONE link, so a hardlink — which shares
//       its inode with another name and whose real path is its own path, so
//       that C2 cannot see the material also existing outside the base — is
//       refused rather than read. The count is read TWICE: once on the path
//       during the check, and once on the opened descriptor, so that a
//       hardlink that still EXISTS when the descriptor is inspected is caught
//       as well. A hardlink created AND removed inside the window between
//       the two leaves the count unchanged and is NOT caught; it is
//       indistinguishable from R1's in-place rewrite, and R1's reasoning
//       applies to it.
//
// RESIDUAL (documented, not eliminated):
//   R1  C3 detects the REPLACEMENT of a target, not an in-place rewrite of
//       the same inode. A writer that truncates and rewrites the file
//       between the check and the read keeps the device and inode identity,
//       so the mutation is not detected here. Such a writer holds write
//       access to the material and could equally have written the corpus
//       before the run; the mutation is visible in the corpus digest that
//       the record carries. The same holds for a link that is created
//       AFTER the descriptor was opened: the descriptor already refers to
//       the inode, and the writer reaches the content through the new name
//       exactly as R1 describes. C5 detects a second name that still EXISTS
//       at the descriptor check; it does not detect a link that is created
//       and removed again inside the window, and it does not detect a link
//       created after the descriptor was opened. Neither gap is an in-place
//       rewrite that C3 could have caught either: all three are R1.
//   R2  C1-C5 do not close a race in which a concurrent writer replaces the
//       PARENT DIRECTORY of the target between the containment check and
//       the open, and the replacement carries a file with the same device
//       and inode identity. The parent directory's own identity is
//       re-verified, so that case is DETECTED as long as the new parent has
//       a fresh inode; escaping it needs the parent's inode number to be
//       reused as well. WHERE THE PROCFS ROOTED BINDING IS ACTIVE (see
//       descriptor_binding below), the read is in addition CONFINED BY
//       CONSTRUCTION: it is resolved through the pinned base descriptor
//       with O_NOFOLLOW on every component, so no swap anywhere in the
//       traversal can point the read outside the base subtree — a swapped
//       component resolves either to the name's current occupant INSIDE the
//       base (which the identity checks then refuse) or to a symbolic link
//       (which O_NOFOLLOW refuses outright). What remains of R2 there is a
//       same-name race inside ONE component resolution, which nothing this
//       runtime exposes can close; on a platform without the rooted
//       binding, the full R2 race remains as before.
//   R3  A filesystem that has itself stopped responding can still block in
//       the kernel. O_NONBLOCK keeps a FIFO from blocking the OPEN, and the
//       regular-file guard then refuses it, but no user-space flag prevents
//       a hung mount from blocking a read.
//   R4  A bind mount inside the base is not detected: the real path of a
//       bind-mounted file is its own path inside the base. Creating one
//       requires privileges that already exceed the read.
//
// The threat behind R1, R2 and R4 requires a concurrent writer with write
// access to the working tree that already holds the material. No adversarial
// parallel symlink swap is claimed as tested.

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
  MULTIPLE_LINKS: 'PATH_MULTIPLE_LINKS',
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

// O_DIRECTORY makes the kernel refuse a non-directory for an intermediate
// component open outright, instead of letting the later component open fail
// with a confusing error. It is a POSIX flag and is treated like the others:
// absent means 0, and the capability is not assumed.
const O_DIRECTORY = Number.isInteger(fs.constants.O_DIRECTORY) ? fs.constants.O_DIRECTORY : 0;

// The procfs magic-link root. /proc/self/fd/<fd> is a symbolic link the
// kernel maintains to the OPEN FILE the descriptor refers to: resolving a
// name THROUGH it starts at the inode the descriptor holds, not at whatever
// now sits at the path the file was opened from. A directory descriptor
// opened once and verified against the containment check's observed identity
// is therefore a trusted anchor for the whole traversal — the closest thing
// to openat(2) relative to a directory descriptor that this runtime exposes.
const PROCFS_FD_ROOT = '/proc/self/fd';
export const DESCRIPTOR_BINDING_PROC_ROOTED = 'proc_fd_rooted';
export const DESCRIPTOR_BINDING_REAL_PATH = 'real_path_fallback';

// True where the rooted binding can work at all: procfs exists and this is
// the platform whose /proc semantics the traversal relies on. Probed at
// CONFINE time and recorded on the confinement record, so the resolution
// strategy can never silently change between the check and the open.
function procFdBindingAvailable() {
  if (process.platform !== 'linux') return false;
  try {
    return fs.statSync(PROCFS_FD_ROOT).isDirectory();
  } catch {
    return false;
  }
}

// O_NONBLOCK keeps the OPEN from waiting for a writer: a FIFO that was
// swapped in after the containment check would otherwise block the open
// forever, and the regular-file guard that would refuse it would never run.
// With the flag the descriptor is produced immediately, the guard refuses the
// FIFO, and the reader returns. It has no effect on a regular file.
export const O_NONBLOCK_SUPPORTED = Number.isInteger(fs.constants.O_NONBLOCK);
const NONBLOCK = O_NONBLOCK_SUPPORTED ? fs.constants.O_NONBLOCK : 0;

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
  //
  // The identity-bearing stats are read as BigInt. A device or inode
  // identifier above Number.MAX_SAFE_INTEGER (a 64-bit XFS or NFS volume,
  // for instance) would be rounded by the default numeric stat, and two
  // distinct identities could then compare equal — which would defeat the
  // replacement guard that C3 rests on.
  let stat;
  try {
    stat = fs.statSync(realPath, { bigint: true });
  } catch (error) {
    fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `${relativePath} could not be inspected: ${error.message}`);
  }
  if (!stat.isFile()) {
    fail(PATH_CONFINEMENT_CODES.NOT_A_FILE, `${relativePath} is not a regular file`);
  }
  // C5: the target must carry exactly ONE link. A hardlink shares its inode
  // with another name, and the real path of a hardlink IS its own path, so
  // C2 cannot see that the same material also exists under a name outside
  // the base. A target with more than one link is therefore refused rather
  // than read: the corpus is a small set of tracked files, each of which has
  // one link.
  if (typeof stat.nlink === 'bigint' && stat.nlink > 1n) {
    fail(
      PATH_CONFINEMENT_CODES.MULTIPLE_LINKS,
      `${relativePath} has ${stat.nlink} links; a material that shares its inode with another name may carry content from outside the base`
    );
  }
  const parentPath = path.dirname(realPath);
  let parentStat;
  try {
    parentStat = fs.statSync(parentPath, { bigint: true });
  } catch (error) {
    fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `the parent directory of ${relativePath} could not be inspected: ${error.message}`);
  }
  const baseStat = fs.statSync(realBase, { bigint: true });
  return {
    base,
    resolved,
    realBase,
    realPath,
    relativePath,
    dev: stat.dev,
    ino: stat.ino,
    nlink: stat.nlink,
    parentPath,
    parentDev: parentStat.dev,
    parentIno: parentStat.ino,
    baseDev: baseStat.dev,
    baseIno: baseStat.ino,
    descriptor_binding: procFdBindingAvailable()
      ? DESCRIPTOR_BINDING_PROC_ROOTED
      : DESCRIPTOR_BINDING_REAL_PATH
  };
}

/**
 * Open the target through the pinned base descriptor (the procfs rooted
 * binding).
 *
 * The base directory is opened ONCE and verified against the identity the
 * containment check observed; a mismatch means the base itself moved and is
 * refused. Every intermediate component is then opened with
 * O_NOFOLLOW|O_DIRECTORY relative to the previous descriptor's magic link,
 * and the final component with O_NOFOLLOW|O_NONBLOCK, so the traversal is
 * rooted at the verified base inode: no swap anywhere along the way can
 * point the read outside the base subtree. A symbolic link introduced at any
 * component is refused outright, a component replaced by a non-directory is
 * refused, and a directory that vanished is refused — never silently
 * re-resolved from a path string.
 */
function openProcRooted(confined) {
  let baseFd = null;
  try {
    baseFd = fs.openSync(confined.realBase, fs.constants.O_RDONLY | O_DIRECTORY | NOFOLLOW);
    const probed = fs.fstatSync(baseFd, { bigint: true });
    if (!probed.isDirectory() || probed.dev !== confined.baseDev || probed.ino !== confined.baseIno) {
      fail(
        PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION,
        `the verified base directory of ${confined.relativePath} does not hold the identity the containment check observed`
      );
    }
    const parts = path.relative(confined.realBase, confined.realPath).split(path.sep);
    const finalPart = parts.pop();
    let current = baseFd;
    for (const part of parts) {
      let next;
      try {
        next = fs.openSync(`${PROCFS_FD_ROOT}/${current}/${part}`, fs.constants.O_RDONLY | O_DIRECTORY | NOFOLLOW);
      } catch (error) {
        // ELOOP is the textbook O_NOFOLLOW refusal; with O_DIRECTORY set the
        // kernel can also answer a final-component symbolic link with
        // ENOTDIR, so both codes are disambiguated by lstat: a symbolic link
        // at the component is the escape refusal, anything else is a
        // replacement between the check and the open.
        if (error && (error.code === 'ELOOP' || error.code === 'ENOTDIR')) {
          let linkStat = null;
          try {
            linkStat = fs.lstatSync(`${PROCFS_FD_ROOT}/${current}/${part}`);
          } catch {
            // the component vanished entirely; fall through to the
            // replacement refusal below
          }
          if (linkStat && linkStat.isSymbolicLink()) {
            fail(
              PATH_CONFINEMENT_CODES.ESCAPES_BASE_THROUGH_SYMLINK,
              `a component of ${confined.relativePath} is a symbolic link at the moment of the open`
            );
          }
          fail(
            PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION,
            `a directory component of ${confined.relativePath} was replaced between the containment check and the open`
          );
        }
        fail(
          PATH_CONFINEMENT_CODES.CHANGED_DURING_RESOLUTION,
          `${confined.relativePath} could not be resolved through the pinned base descriptor: ${error.message}`
        );
      }
      if (current !== baseFd) fs.closeSync(current);
      current = next;
    }
    try {
      return fs.openSync(`${PROCFS_FD_ROOT}/${current}/${finalPart}`, fs.constants.O_RDONLY | NOFOLLOW | NONBLOCK);
    } catch (error) {
      if (error && error.code === 'ELOOP') {
        fail(PATH_CONFINEMENT_CODES.IS_A_SYMLINK, `${confined.relativePath} is a symbolic link at the verified path`);
      }
      if (error && error.code === 'ENOENT') {
        fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `${confined.relativePath} disappeared before it could be read`);
      }
      fail(
        PATH_CONFINEMENT_CODES.NOT_READABLE,
        `${confined.relativePath} could not be opened through the pinned base descriptor: ${error.message}`
      );
    } finally {
      if (current !== baseFd) fs.closeSync(current);
    }
  } finally {
    if (baseFd !== null) {
      try {
        fs.closeSync(baseFd);
      } catch {
        // the base descriptor is closed best-effort; the caller's fd, if it
        // was produced, is owned by the caller and is not touched here
      }
    }
  }
}

/**
 * Read a confined file through a verified descriptor.
 *
 * Where the confinement recorded the procfs rooted binding, the descriptor
 * is produced by openProcRooted: the traversal is pinned to the verified
 * base descriptor. Otherwise the descriptor is opened on the REAL path with
 * O_NOFOLLOW, so the final component cannot be a link at the moment of the
 * open. In both bindings the descriptor's identity and the parent
 * directory's identity are compared with the identities observed during the
 * confinement: a target or a parent directory replaced in between is
 * refused instead of being read.
 */
export function readConfinedFile(confined) {
  let fd;
  if (confined.descriptor_binding === DESCRIPTOR_BINDING_PROC_ROOTED) {
    fd = openProcRooted(confined);
  } else {
    try {
      // O_NONBLOCK: a FIFO swapped in after the containment check must not
      // block the open. The descriptor is produced at once, and the
      // regular-file guard below refuses it.
      fd = fs.openSync(confined.realPath, fs.constants.O_RDONLY | NOFOLLOW | NONBLOCK);
    } catch (error) {
      if (error && error.code === 'ELOOP') {
        fail(PATH_CONFINEMENT_CODES.IS_A_SYMLINK, `${confined.relativePath} is a symbolic link at the verified path`);
      }
      if (error && error.code === 'ENOENT') {
        fail(PATH_CONFINEMENT_CODES.NOT_FOUND, `${confined.relativePath} disappeared before it could be read`);
      }
      fail(PATH_CONFINEMENT_CODES.NOT_READABLE, `${confined.relativePath} could not be opened: ${error.message}`);
    }
  }
  try {
    // C4 (again, on the opened descriptor itself): the material must be a
    // regular file, whatever the path said a moment ago. The identity is
    // read as BigInt for the same reason as the stat above.
    const fdStat = fs.fstatSync(fd, { bigint: true });
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
      parentStat = fs.statSync(confined.parentPath, { bigint: true });
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
    // C5 (again, on the opened descriptor): the link count is re-read on
    // the descriptor itself, because a hardlink can be created in the
    // window between the containment check and the open. No path-based
    // check can see that link: the real path of a hardlink IS its own
    // path, and the file's identity does not change when a second name
    // for it appears. The count observed during the check is therefore
    // compared with the count observed on the descriptor, and any
    // difference is refused. (A count that cannot be compared at all is
    // refused as well: the check must not depend on a measurement it
    // could not take.)
    //
    // The parent directory is re-checked BEFORE this, because a parent
    // that was replaced is the more fundamental defect, and because a
    // replaced parent that carries the same file over as a hardlink would
    // otherwise be reported here — hiding the parent check behind the link
    // count.
    if (
      typeof fdStat.nlink !== 'bigint'
      || typeof confined.nlink !== 'bigint'
      || fdStat.nlink !== confined.nlink
    ) {
      fail(
        PATH_CONFINEMENT_CODES.MULTIPLE_LINKS,
        `${confined.relativePath} carries ${fdStat.nlink} links on the opened descriptor and ${confined.nlink} during the containment check; a material that shares its inode with another name may carry content from outside the base`
      );
    }
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
