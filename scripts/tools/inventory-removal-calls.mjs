#!/usr/bin/env node
// Inventory of direct recursive removal calls (the P1a reconciliation artifact).
//
// The safe-remove guard in tests/tools/safe-remove.test.mjs enforces that the
// HARNESS SURFACE (scripts/tools/ and tests/tools/) contains no direct
// recursive rmSync call. The guard deliberately reports the
// rest of the repository instead of hiding it. This tool makes that report a
// durable, re-derivable artifact: it applies the SAME per-call semantics as
// the guard to every .mjs file of the repository and classifies each direct
// recursive removal by area, so the remaining unconverted call sites are
// inventoried rather than merely counted.
//
// The tool fails (ok: false) only when the harness surface itself grew a
// direct removal — the guard invariant. Calls outside the harness surface are
// findings of the inventory, not failures: they are the documented scope
// boundary of the operational safety closure and are listed here so a later
// run can widen the surface deliberately.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoRoot } from './_shared.mjs';

const CALL_SHAPE = () => new RegExp(('rm' + 'Sync') + '\\s*\\(([^)]*)\\)', 'gs');
const RECURSIVE_FLAG = () => new RegExp('recur' + 'sive\\s*:\\s*true');

// Area classification for a repository-relative path. The harness surface is
// the guarded area; everything else is reported with its area name so the
// inventory states WHERE the unconverted calls live, not only how many.
export function classifyArea(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized === 'scripts/tools/safe-remove.mjs') return 'safe-remove-primitive';
  if (normalized.startsWith('scripts/tools/')) return 'harness-tools';
  if (normalized.startsWith('tests/tools/')) return 'harness-tests';
  if (normalized.startsWith('tests/vnext/')) return 'vnext-tests';
  if (normalized.startsWith('scripts/')) return 'scripts-other';
  if (normalized.startsWith('runtime/')) return 'runtime';
  if (normalized.startsWith('providers/')) return 'providers';
  if (normalized.startsWith('core/')) return 'core';
  return 'other';
}

const HARNESS_AREAS = new Set(['harness-tools', 'harness-tests']);

export function scanFileForRemovalCalls(absolutePath) {
  const source = fs.readFileSync(absolutePath, 'utf8');
  const call = CALL_SHAPE();
  const recursiveFlag = RECURSIVE_FLAG();
  const calls = [];
  let match;
  while ((match = call.exec(source)) !== null) {
    if (!recursiveFlag.test(match[1])) continue;
    const line = source.slice(0, match.index).split('\n').length;
    calls.push({
      line,
      excerpt: match[0].replace(/\s+/g, ' ').slice(0, 120)
    });
  }
  return calls;
}

export function inventoryRemovalCalls({ root }) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'coverage' || entry.name === 'dist') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.name.endsWith('.mjs')) continue;
      files.push(absolute);
    }
  };
  walk(root);
  files.sort();

  const findings = [];
  for (const absolute of files) {
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    if (relative === 'scripts/tools/safe-remove.mjs') continue; // the primitive itself
    const calls = scanFileForRemovalCalls(absolute);
    for (const call of calls) {
      findings.push({ file: relative, area: classifyArea(relative), line: call.line, excerpt: call.excerpt });
    }
  }

  const byArea = {};
  for (const finding of findings) {
    byArea[finding.area] = (byArea[finding.area] || 0) + 1;
  }
  const byFile = {};
  for (const finding of findings) {
    byFile[finding.file] = (byFile[finding.file] || 0) + 1;
  }

  const harnessOffenders = findings.filter((finding) => HARNESS_AREAS.has(finding.area));

  return {
    ok: harnessOffenders.length === 0,
    scanned_files: files.length,
    direct_recursive_removals: findings.length,
    by_area: byArea,
    by_file: byFile,
    calls: findings,
    harness_surface_offenders: harnessOffenders,
    scope_note: [
      'Guarded surface: scripts/tools/ and tests/tools/ (zero direct recursive removals is enforced by tests/tools/safe-remove.test.mjs).',
      'Calls outside that surface are inventory findings, not failures: the closed S5/S8/S9 lane tests and product code keep their own cleanup until a later run widens the surface.'
    ].join(' ')
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
  };
  const root = flag('--root') ? path.resolve(flag('--root')) : repoRoot();
  const jsonOut = flag('--json');
  const result = inventoryRemovalCalls({ root });
  const stdout = [
    `removal call inventory: ${result.ok ? 'HARNESS_SURFACE_CLEAN' : 'HARNESS_SURFACE_OFFENDERS'}`,
    `scanned ${result.scanned_files} .mjs files; ${result.direct_recursive_removals} direct recursive removals`,
    ...Object.entries(result.by_file).map(([file, count]) => `  ${file}: ${count}`)
  ].join('\n');
  console.log(stdout);
  if (jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(result, null, 2) + '\n');
  }
  process.exit(result.ok ? 0 : 1);
}
