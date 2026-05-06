#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayRuntimeRun } from '../observability/runtime-replay.mjs';
import { parseArgs } from './runtime-validate.mjs';

function runRuntimeReplay({ repoRoot = process.cwd(), argv = process.argv.slice(2) } = {}) {
  const args = parseArgs(argv);
  return replayRuntimeRun({
    repoRoot,
    runId: args.runId,
    latest: args.latest
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runRuntimeReplay();
  console.log(JSON.stringify({
    ok: result.ok,
    runId: result.runId,
    runDir: result.runDir?.replace(/\\/g, '/'),
    summary: result.summary,
    manifest: result.manifest,
    events: result.events,
    permissions: result.permissions,
    memory: result.memory,
    validationReceipt: result.validationReceipt,
    issues: result.issues
  }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { runRuntimeReplay };
