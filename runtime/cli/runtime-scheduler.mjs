#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCronConfig } from '../scheduler/cron-trigger.mjs';

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function runSchedulerCli() {
  if (process.argv.includes('--daemon') || process.argv.includes('--background')) {
    console.error('No scheduler daemon exists in Phase 6. Scheduler actions require an explicit local command.');
    return 2;
  }

  if (process.argv.includes('--validate-cron')) {
    const result = validateCronConfig({
      expression: readArg('--expression'),
      timezone: readArg('--timezone') ?? 'UTC'
    });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  console.error('Runtime scheduler Phase 6 supports only explicit cron config validation. No auto-start daemon, HTTP/MCP, or background jobs are available.');
  return 2;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const exitCode = runSchedulerCli();
  process.exit(exitCode);
}

export { runSchedulerCli };
