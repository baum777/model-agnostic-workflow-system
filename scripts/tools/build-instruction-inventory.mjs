#!/usr/bin/env node
// S2 CLI (MAWS-SII-TARGET-SPEC-001, PROPOSED): print the instruction
// inventory for a repository revision as JSON on stdout. Read-only by
// construction: the CLI never writes files and never spawns a process.
//
// Usage:
//   node scripts/tools/build-instruction-inventory.mjs --revision <sha> [--root <dir>]
//
// The revision binding is mandatory: an inventory without the revision it
// describes cannot be reconstructed later and is therefore rejected.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInstructionInventory } from '../../runtime/instructions/instruction-inventory.mjs';

const args = process.argv.slice(2);

function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const revision = argValue('--revision');
if (!revision) {
  console.error('usage: build-instruction-inventory.mjs --revision <sha> [--root <dir>]');
  console.error('--revision is required: an inventory without a revision binding cannot be reconstructed later.');
  process.exit(2);
}

const root = path.resolve(argValue('--root') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

try {
  const inventory = buildInstructionInventory({ root, revision });
  process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
} catch (error) {
  console.error(`${error.name || 'Error'}: ${error.message}`);
  process.exit(1);
}
