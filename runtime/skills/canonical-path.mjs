// MAWS vNext — canonical path containment (slice S8, spec section 13.4).
//
// Every write of the promotion chain happens INSIDE the canonical tree: the
// adopted skill file, the append-only adoption ledger and every regenerated
// export surface. A path that leaves the tree — through a symlinked file or
// through a symlinked parent directory — would mutate a file the promotion
// does not own, and the rollback could not restore it.
//
// Two independent checks, because they fail differently:
//   C1  the final path component must not be a symlink (the write would
//       follow the link);
//   C2  the nearest existing ancestor of the path must resolve INSIDE the
//       canonical root (a symlinked parent directory would carry the write
//       out of the tree even though the final component is a regular file).
import fs from 'node:fs';
import path from 'node:path';

export class CanonicalPathError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CanonicalPathError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CanonicalPathError(code, message);
}

// realpathOfNearestExistingAncestor(path) -> the resolved real path of the
// nearest ancestor that exists, or null when none does.
function realpathOfNearestExistingAncestor(target) {
  let probe = target;
  for (;;) {
    try {
      return fs.realpathSync(probe);
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) {
        return null;
      }
      probe = parent;
    }
  }
}

// assertCanonicalTarget({ root, absolutePath, label }) -> the absolute path.
//
// The path must be lexically inside the root, its final component must not be
// a symlink, and its nearest existing ancestor must resolve inside the root.
export function assertCanonicalTarget({ root, absolutePath, label }) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(absolutePath);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail('CANONICAL_PATH_ESCAPES_ROOT', `the ${label} path leaves the canonical root`);
  }
  let stats = null;
  try {
    stats = fs.lstatSync(resolvedTarget);
  } catch {
    stats = null;
  }
  if (stats !== null && stats.isSymbolicLink()) {
    fail('CANONICAL_PATH_IS_A_SYMLINK', `the ${label} path is a symlink; the promotion never writes through a link`);
  }
  const realRoot = (() => {
    try {
      return fs.realpathSync(resolvedRoot);
    } catch {
      return resolvedRoot;
    }
  })();
  const realAncestor = realpathOfNearestExistingAncestor(path.dirname(resolvedTarget));
  if (realAncestor !== null && realAncestor !== realRoot && !realAncestor.startsWith(`${realRoot}${path.sep}`)) {
    fail('CANONICAL_PATH_ESCAPES_ROOT', `the ${label} path resolves outside the canonical root (${realAncestor})`);
  }
  return resolvedTarget;
}
