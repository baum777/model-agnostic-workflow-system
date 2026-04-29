#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMemorySkeleton } from '../memory/memory-policy.mjs';
import { validateRuntimeRun } from '../observability/validation-receipt.mjs';

function parseArgs(argv) {
  const args = { latest: false, runId: null, memory: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--latest') {
      args.latest = true;
    } else if (arg === '--memory') {
      args.memory = true;
    } else if (arg === '--runId') {
      args.runId = argv[index + 1] ?? null;
      index += 1;
    }
  }
  return args;
}

function runRuntimeValidate({ repoRoot = process.cwd(), argv = process.argv.slice(2) } = {}) {
  const args = parseArgs(argv);
  if (args.memory) {
    return validateMemorySkeleton({ repoRoot });
  }

  return validateRuntimeRun({
    repoRoot,
    runId: args.runId,
    latest: args.latest
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runRuntimeValidate();
  console.log(JSON.stringify({
    ok: result.ok,
    runDir: result.runDir?.replace(/\\/g, '/'),
    runId: result.manifest?.runId,
    issues: result.issues,
    capabilities: result.capabilities
  }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { parseArgs, runRuntimeValidate };
