// MAWS vNext — S2 wave 2 instruction reference graph tests
// (MAWS-SII-TARGET-SPEC-001). node:test + node:assert/strict, no new
// dependencies. Proves: edge extraction follows the closed rule set (markdown
// links, path-shaped code spans, `npm run` code spans), dangling references
// are recorded as data with deterministic status, command edges resolve
// against the package.json scripts map, extraction fail-closes when command
// references exist without a readable package.json, the digest is
// deterministic and revision-bound, and the graph runs leave the tree
// byte-identical (read-only boundary).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInstructionGraph, GRAPH_SCHEMA_VERSION } from '../../runtime/instructions/instruction-resolver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVISION = '87a86d54971ee43ff967c2c336a81d2bf1f38812';

const HEX64 = /^[a-f0-9]{64}$/;

// Minimal tree satisfying every declared source (fixed sources plus both
// skill trees) plus a package.json exposing one known script.
function writeMinimalDeclaredTree(tmp, { withPackageJson = true } = {}) {
  const fixed = [
    'AGENTS.md',
    'WORKFLOW.md',
    'docs/governance/source-hierarchy.md',
    'docs/authority-matrix.md',
    'docs/model-agnostic-core-prompt-system.md',
    'core/contracts/workflow-routing-map.json',
    'core/contracts/permission-boundary.json',
    'core/contracts/workflow-memory-contract.json'
  ];
  for (const rel of fixed) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), `stub ${rel}\n`);
  }
  fs.mkdirSync(path.join(tmp, 'core/skills/demo-skill'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'core/skills/demo-skill/SKILL.md'),
    [
      '# Demo',
      '',
      'See [the root governance](../../../AGENTS.md) and [a missing file](./does-not-exist.md).',
      'External: [site](https://example.com) — pure anchor: [jump](#section).',
      'Path span: `docs/authority-matrix.md` and command span: `npm run demo:script`.',
      'Unknown command span: `npm run no-such-script`.',
      ''
    ].join('\n')
  );
  fs.mkdirSync(path.join(tmp, '.agents/skills/local-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.agents/skills/local-demo/SKILL.md'), '# Local demo\n');
  if (withPackageJson) {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      `${JSON.stringify({ name: 'graph-fixture', private: true, scripts: { 'demo:script': 'node --version' } })}\n`
    );
  }
}

function snapshotTree(root) {
  const snapshot = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, entry);
      if (fs.statSync(abs).isDirectory()) {
        walk(abs);
      } else {
        snapshot.set(abs, fs.readFileSync(abs));
      }
    }
  };
  walk(root);
  return snapshot;
}

function assertTreesIdentical(before, after) {
  assert.equal(after.size, before.size, 'file count must not change');
  for (const [abs, content] of before) {
    assert.ok(after.has(abs), `file disappeared: ${abs}`);
    assert.ok(Buffer.compare(after.get(abs), content) === 0, `file changed: ${abs}`);
  }
}

test('graph builds over the real repository with deterministic, revision-bound digest', () => {
  const first = buildInstructionGraph({ root: ROOT, revision: REVISION });
  const second = buildInstructionGraph({ root: ROOT, revision: REVISION });
  assert.equal(first.schema_version, GRAPH_SCHEMA_VERSION);
  assert.equal(first.digest, second.digest);
  assert.equal(first.node_count, first.nodes.length);
  assert.equal(first.edge_count, first.edges.length);
  assert.match(first.digest, HEX64);
  const otherRevision = buildInstructionGraph({ root: ROOT, revision: 'other-revision' });
  assert.notEqual(otherRevision.digest, first.digest, 'a different revision must produce a different digest');
  for (const edge of first.edges) {
    assert.ok(first.nodes.some((node) => node.path === edge.from), `edge origin must be an inventory node: ${edge.from}`);
    assert.ok(Number.isInteger(edge.line) && edge.line >= 1);
    assert.ok(['md_link', 'inline_path', 'npm_run_command'].includes(edge.kind));
    assert.ok(['resolved', 'dangling'].includes(edge.status));
  }
});

test('closed extraction rules: resolved, dangling, external, and command edges (temp tree)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-graph-'));
  try {
    writeMinimalDeclaredTree(tmp);
    const graph = buildInstructionGraph({ root: tmp, revision: REVISION });
    const skillEdges = graph.edges.filter((edge) => edge.from === 'core/skills/demo-skill/SKILL.md');

    const resolvedLink = skillEdges.find((edge) => edge.kind === 'md_link' && edge.target === '../../../AGENTS.md');
    assert.ok(resolvedLink, 'relative link to existing file must produce an edge');
    assert.equal(resolvedLink.status, 'resolved');
    assert.equal(resolvedLink.resolved, 'AGENTS.md');

    const danglingLink = skillEdges.find((edge) => edge.kind === 'md_link' && edge.target === './does-not-exist.md');
    assert.ok(danglingLink, 'link to missing file must produce a dangling edge (recorded as data)');
    assert.equal(danglingLink.status, 'dangling');
    assert.equal(danglingLink.resolved, null);
    assert.equal(danglingLink.line, 3);

    assert.ok(
      !graph.edges.some((edge) => edge.target === 'https://example.com'),
      'external links must not become edges'
    );
    assert.ok(!graph.edges.some((edge) => edge.target === '#section'), 'pure anchors must not become edges');

    const inlinePath = skillEdges.find((edge) => edge.kind === 'inline_path' && edge.target === 'docs/authority-matrix.md');
    assert.ok(inlinePath, 'path-shaped code span must produce an edge');
    assert.equal(inlinePath.status, 'resolved');

    const knownCommand = skillEdges.find((edge) => edge.kind === 'npm_run_command' && edge.target === 'demo:script');
    assert.ok(knownCommand, 'npm run edge for a declared script must resolve');
    assert.equal(knownCommand.status, 'resolved');
    assert.equal(knownCommand.resolved, 'demo:script');

    const unknownCommand = skillEdges.find((edge) => edge.kind === 'npm_run_command' && edge.target === 'no-such-script');
    assert.ok(unknownCommand, 'npm run edge for an undeclared script must be dangling');
    assert.equal(unknownCommand.status, 'dangling');

    assert.equal(graph.dangling_count, graph.edges.filter((edge) => edge.status === 'dangling').length);
    assert.ok(graph.dangling_count >= 2, 'the planted dangling link and command must be counted');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('command references without a readable package.json fail closed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-graph-nopkg-'));
  try {
    writeMinimalDeclaredTree(tmp, { withPackageJson: false });
    assert.throws(
      () => buildInstructionGraph({ root: tmp, revision: REVISION }),
      (error) => error.code === 'INSTRUCTION_PACKAGE_MANIFEST_MISSING'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('missing revision is rejected (inherited fail-closed contract)', () => {
  assert.throws(
    () => buildInstructionGraph({ root: ROOT }),
    (error) => error.code === 'INVENTORY_REVISION_REQUIRED'
  );
});

test('graph build is read-only: the tree is byte-identical after two runs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-graph-readonly-'));
  try {
    writeMinimalDeclaredTree(tmp);
    const before = snapshotTree(tmp);
    buildInstructionGraph({ root: tmp, revision: REVISION });
    buildInstructionGraph({ root: tmp, revision: REVISION });
    assertTreesIdentical(before, snapshotTree(tmp));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('digest is sensitive to edge-relevant content changes (temp tree)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-graph-digest-'));
  try {
    writeMinimalDeclaredTree(tmp);
    const before = buildInstructionGraph({ root: tmp, revision: REVISION });
    fs.writeFileSync(
      path.join(tmp, 'core/skills/demo-skill/SKILL.md'),
      '# Demo\n\nNow [pointing elsewhere](../../../WORKFLOW.md) with no dangling refs.\n'
    );
    const after = buildInstructionGraph({ root: tmp, revision: REVISION });
    assert.notEqual(after.digest, before.digest, 'reference change must change the graph digest');
    assert.ok(after.dangling_count < before.dangling_count, 'repairing dangling refs must reduce the dangling count');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
