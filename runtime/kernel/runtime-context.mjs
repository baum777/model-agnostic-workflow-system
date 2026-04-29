import path from 'node:path';
import { createRunId } from './run-id.mjs';

const RUNTIME_VERSION = '0.1.0';

function createRunContext({ repoRoot = process.cwd(), mode = 'dry-run', entrypoint = 'runtime' } = {}) {
  const createdAt = new Date().toISOString();
  const runId = createRunId(new Date(createdAt));
  const root = path.resolve(repoRoot);
  const runDir = path.join(root, 'artifacts', 'runtime-runs', runId);

  return {
    repoRoot: root,
    runId,
    runDir,
    createdAt,
    mode,
    entrypoint,
    runtimeVersion: RUNTIME_VERSION
  };
}

export { RUNTIME_VERSION, createRunContext };
