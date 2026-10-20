#!/usr/bin/env node
// MAWS vNext — S2 wave 2 CLI: build the instruction reference graph for the
// declared canonical instruction source set. Stdout-only; never writes and
// never spawns. The revision is mandatory: a graph without a revision binding
// cannot be reconstructed later, so the tool refuses to run without one.
import process from 'node:process';
import path from 'node:path';
import { buildInstructionGraph } from '../../runtime/instructions/instruction-resolver.mjs';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (value === undefined) {
    process.stderr.write(`missing value for ${flag}\n`);
    process.exit(2);
  }
  return value;
}

const revision = argValue('--revision');
if (!revision) {
  process.stderr.write('usage: node scripts/tools/build-instruction-graph.mjs --revision <git-sha> [--root <path>] [--dangling]\n');
  process.exit(2);
}
const root = path.resolve(argValue('--root') ?? process.cwd());
const graph = buildInstructionGraph({ root, revision });
if (process.argv.includes('--dangling')) {
  process.stdout.write(`${JSON.stringify({ revision, digest: graph.digest, dangling_count: graph.dangling_count, dangling: graph.edges.filter((edge) => edge.status === 'dangling') }, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
}
