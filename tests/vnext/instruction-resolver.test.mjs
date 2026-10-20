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
  fs.mkdirSync(path.join(tmp, 'skills/shared-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'skills/shared-demo/SKILL.md'), '# Shared demo\n');
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
      'Glob span: `core/skills/*/SKILL.md`.',
      'Range span: `origin/main..main`.',
      'Consumer-local span: `.codex/repo-intake-inputs.json`.',
      'Workspace span: `supabase/config.toml`.',
      '`.codex/shared-core-map.json` was not present in the inspected repo.',
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

// A tree that plants the absence-scope cases: an absence phrase about one
// subject next to a referenced path, a genuine documented absence, and an
// absence phrase that governs a different subject than the referenced path.
function writeAbsenceScopeTree(tmp) {
  writeMinimalDeclaredTree(tmp);
  fs.mkdirSync(path.join(tmp, 'core/skills/absence-scope'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'core/skills/absence-scope/SKILL.md'),
    [
      '# Absence scope',
      '',
      'If config is not found, see `docs/missing.md`.',
      'If config is not found, see [the migration guide](docs/missing.md).',
      'A plain prose path docs/plain.md is not a code span and is not extracted.',
      '`docs/legacy.md` was not present in the inspected repo.',
      '`docs/legacy2.md` does not exist.',
      '`docs/legacy3.md` does not exist; see `docs/current.md` for the replacement.',
      'The config file does not exist; see `docs/missing2.md`.',
      ''
    ].join('\n')
  );
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
    assert.ok(['resolved', 'dangling', 'glob_pattern', 'git_range', 'documented_absence', 'external_workspace'].includes(edge.status));
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
    assert.equal(inlinePath.resolved, 'docs/authority-matrix.md', 'a repository-root path resolves from the document directory and stays repository-root relative');

    const knownCommand = skillEdges.find((edge) => edge.kind === 'npm_run_command' && edge.target === 'demo:script');
    assert.ok(knownCommand, 'npm run edge for a declared script must resolve');
    assert.equal(knownCommand.status, 'resolved');
    assert.equal(knownCommand.resolved, 'demo:script');

    const unknownCommand = skillEdges.find((edge) => edge.kind === 'npm_run_command' && edge.target === 'no-such-script');
    assert.ok(unknownCommand, 'npm run edge for an undeclared script must be dangling');
    assert.equal(unknownCommand.status, 'dangling');

    assert.equal(graph.dangling_count, graph.edges.filter((edge) => edge.status === 'dangling').length);
    assert.ok(graph.dangling_count >= 2, 'the planted dangling link and command must be counted');

    // The reference classes that are not defects must be classified, not
    // collapsed into the dangling bucket.
    const glob = skillEdges.find((edge) => edge.target === 'core/skills/*/SKILL.md');
    assert.ok(glob, 'a glob span must produce an edge');
    assert.equal(glob.status, 'glob_pattern');

    const range = skillEdges.find((edge) => edge.target === 'origin/main..main');
    assert.ok(range, 'a revision range must produce an edge');
    assert.equal(range.status, 'git_range');

    const consumerLocal = skillEdges.find((edge) => edge.target === '.codex/repo-intake-inputs.json');
    assert.ok(consumerLocal, 'a consumer-local path must produce an edge');
    assert.equal(consumerLocal.status, 'external_workspace');

    const workspace = skillEdges.find((edge) => edge.target === 'supabase/config.toml');
    assert.ok(workspace, 'a workspace path must produce an edge');
    assert.equal(workspace.status, 'external_workspace');

    const absence = skillEdges.find((edge) => edge.target === '.codex/shared-core-map.json');
    assert.ok(absence, 'a documented absence must produce an edge');
    assert.equal(absence.status, 'documented_absence');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('absence phrases bind to their target, not to the line (target-scoped classification)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-absence-scope-'));
  try {
    writeAbsenceScopeTree(tmp);
    const graph = buildInstructionGraph({ root: tmp, revision: REVISION });
    const edges = graph.edges.filter((edge) => edge.from === 'core/skills/absence-scope/SKILL.md');
    const edge = (kind, target, line) => edges.find((item) => item.kind === kind && item.target === target && item.line === line);

    // (a) The codex counter-example: the absence phrase is about the
    // configuration, not about the referenced path. The missing path must
    // stay a finding instead of being recorded as a documented absence.
    const codeSpan = edge('inline_path', 'docs/missing.md', 3);
    assert.ok(codeSpan, 'the code span must produce an edge');
    assert.equal(codeSpan.status, 'dangling', 'an absence phrase about another subject must not silence the missing target');
    assert.equal(codeSpan.resolved, null);

    // The same counter-example arriving as a markdown link is the same
    // defect: the link target is missing and the phrase does not govern it.
    const link = edge('md_link', 'docs/missing.md', 4);
    assert.ok(link, 'the markdown link must produce an edge');
    assert.equal(link.status, 'dangling', 'an absence phrase about another subject must not silence a missing link target');
    assert.equal(link.resolved, null);

    // A path written as plain prose is outside the closed extraction rules
    // and produces no edge at all — no classification, no finding.
    assert.ok(
      !edges.some((item) => item.target === 'docs/plain.md'),
      'a plain prose path must not become an edge'
    );

    // (b) A genuine documented absence keeps its classification: the phrase
    // is the statement about that very target.
    const accepted = edge('inline_path', 'docs/legacy.md', 6);
    assert.ok(accepted, 'the documented absence must produce an edge');
    assert.equal(accepted.status, 'documented_absence');

    const explicit = edge('inline_path', 'docs/legacy2.md', 7);
    assert.ok(explicit, 'the explicit absence must produce an edge');
    assert.equal(explicit.status, 'documented_absence');

    // (c) The phrase governs a different subject than the referenced target:
    // the target it names is documented, the second path is not, and the
    // second path must stay a finding when it is missing.
    const governed = edge('inline_path', 'docs/legacy3.md', 8);
    assert.ok(governed, 'the governed target must produce an edge');
    assert.equal(governed.status, 'documented_absence');

    const notGoverned = edge('inline_path', 'docs/current.md', 8);
    assert.ok(notGoverned, 'the second path on the line must produce an edge');
    assert.equal(notGoverned.status, 'dangling', 'a phrase about another subject must not silence a missing target');

    const aboutConfig = edge('inline_path', 'docs/missing2.md', 9);
    assert.ok(aboutConfig, 'the referenced path must produce an edge');
    assert.equal(aboutConfig.status, 'dangling', 'an absence phrase about a non-path subject must not silence a missing target');

    // Fail-closed: the scoped classification must not hide the planted
    // missing targets from the dangling count.
    assert.equal(
      graph.edges.filter((item) => item.status === 'dangling' && item.from === 'core/skills/absence-scope/SKILL.md').length,
      4,
      'every missing target whose absence phrase does not govern it must stay a finding'
    );
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
