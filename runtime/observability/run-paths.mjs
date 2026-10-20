// Canonical runtime evidence directory boundary shared by run/replay/validation.
import fs from 'node:fs';
import path from 'node:path';

export function assertRunId(runId) {
  if (typeof runId !== 'string' || !/^run_[A-Za-z0-9_-]{1,128}$/.test(runId)) {
    throw new Error('RUN_ID_INVALID: runId must be a single run_-prefixed path segment');
  }
  return runId;
}

function assertNotSymlink(filePath) {
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) {
      throw new Error('RUN_PATH_SYMLINK_FORBIDDEN: ' + filePath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function assertRunRoot(repoRoot) {
  const root = path.resolve(repoRoot);
  const artifacts = path.join(root, 'artifacts');
  const runRoot = path.join(artifacts, 'runtime-runs');
  assertNotSymlink(artifacts);
  assertNotSymlink(runRoot);
  return runRoot;
}

export function resolveRuntimeRunDir(repoRoot, runId) {
  assertRunId(runId);
  const runDir = path.join(assertRunRoot(repoRoot), runId);
  assertNotSymlink(runDir);
  return runDir;
}
