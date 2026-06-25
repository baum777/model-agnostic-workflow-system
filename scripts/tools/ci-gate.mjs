#!/usr/bin/env node
// Baum-OS CI Gate — adapter run + structural + quality gate in one call
// Usage: node scripts/tools/ci-gate.mjs [--repo <path>]

import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { resolve, join } from 'path';

function findCoreRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return process.cwd();
  }
}

function latestRunDir(coreRoot) {
  const base = join(coreRoot, 'evidence', 'loop-runs');
  if (!existsSync(base)) return null;
  const entries = readdirSync(base, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ name: e.name, mtime: statSync(join(base, e.name)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  return entries.length > 0 ? join(base, entries[0].name) : null;
}

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

const args = process.argv.slice(2);
let repoPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--repo' && args[i + 1]) repoPath = resolve(args[++i]);
}

const coreRoot = findCoreRoot();
const targetPath = repoPath || coreRoot;

console.log('=== Baum-OS CI Gate ===');
console.log(`Core root: ${coreRoot}`);
console.log(`Target:    ${targetPath}`);

// Step 1: adapter run
try {
  run(`node scripts/tools/baum-loop-repo.mjs "command/ loop repo ${targetPath}"`, coreRoot);
} catch {
  console.error('\nFAIL CI Gate — adapter run failed');
  process.exit(1);
}

// Step 2: detect latest run
const runDir = latestRunDir(coreRoot);
if (!runDir) {
  console.error('\nFAIL CI Gate — no evidence run found after adapter run');
  process.exit(1);
}
console.log(`\nEvidence run: ${runDir}`);

// Step 3: standard validation
let failed = false;
try {
  run(`node scripts/tools/validate-loop-run.mjs "${runDir}"`, coreRoot);
} catch {
  failed = true;
}

// Step 4: quality gate
try {
  run(`node scripts/tools/validate-loop-run.mjs --quality "${runDir}"`, coreRoot);
} catch {
  failed = true;
}

if (failed) {
  console.error('\nFAIL CI Gate');
  process.exit(1);
}

console.log('\nPASS CI Gate');
process.exit(0);
