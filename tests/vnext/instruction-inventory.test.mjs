// MAWS vNext — S2 wave 1 instruction inventory tests (MAWS-SII-TARGET-SPEC-001).
// node:test + node:assert/strict, no new dependencies. Proves: coverage of the
// declared canonical source set, deterministic digest binding to revision +
// content, fail-closed behavior on missing sources, and the read-only
// boundary (inventory runs leave the tree byte-identical).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildInstructionInventory,
  listInstructionSources
} from '../../runtime/instructions/instruction-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVISION = '739b9c80a394c40639cb3d9043db757aca6df5d4';

const HEX64 = /^[a-f0-9]{64}$/;

// Minimal tree satisfying every declared source (fixed sources plus both
// skill trees), used for the temp-tree behavior tests.
function writeMinimalDeclaredTree(tmp) {
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
  fs.writeFileSync(path.join(tmp, 'core/skills/demo-skill/SKILL.md'), '# Demo\n');
  fs.mkdirSync(path.join(tmp, '.agents/skills/local-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.agents/skills/local-demo/SKILL.md'), '# Local demo\n');
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

test('inventory covers the declared canonical source set plus enumerated skills', () => {
  const inventory = buildInstructionInventory({ root: ROOT, revision: REVISION });
  const paths = new Set(inventory.sources.map((source) => source.path));
  for (const required of [
    'AGENTS.md',
    'WORKFLOW.md',
    'docs/governance/source-hierarchy.md',
    'docs/authority-matrix.md',
    'docs/model-agnostic-core-prompt-system.md',
    'core/contracts/workflow-routing-map.json',
    'core/contracts/permission-boundary.json',
    'core/contracts/workflow-memory-contract.json'
  ]) {
    assert.ok(paths.has(required), `declared source missing from inventory: ${required}`);
  }
  const skillSources = inventory.sources.filter((source) => source.role === 'portable_skill_instruction');
  const localSkillSources = inventory.sources.filter((source) => source.role === 'local_skill_instruction');
  assert.ok(skillSources.length >= 18, 'core/skills SKILL.md files must be enumerated');
  assert.equal(localSkillSources.length, 3, '.agents/skills SKILL.md files must be enumerated');
  assert.equal(inventory.source_count, inventory.sources.length);
});

test('every source carries a content digest and a role/authority classification', () => {
  const inventory = buildInstructionInventory({ root: ROOT, revision: REVISION });
  for (const source of inventory.sources) {
    assert.match(source.sha256, HEX64, `sha256 must be 64 hex chars for ${source.path}`);
    assert.ok(source.bytes > 0, `source must be non-empty: ${source.path}`);
    assert.ok(source.role.length > 0 && source.authority_class.length > 0);
  }
  const contractSources = inventory.sources.filter((source) => source.authority_class === 'canonical_contract');
  assert.equal(contractSources.length, 3, 'exactly the three declared contract sources carry canonical_contract');
});

test('digest is deterministic and binds the revision', () => {
  const first = buildInstructionInventory({ root: ROOT, revision: REVISION });
  const second = buildInstructionInventory({ root: ROOT, revision: REVISION });
  assert.equal(first.digest, second.digest);
  assert.equal(first.source_count, second.source_count);
  const otherRevision = buildInstructionInventory({ root: ROOT, revision: 'other-revision' });
  assert.notEqual(otherRevision.digest, first.digest, 'a different revision must produce a different digest');
});

test('digest is sensitive to content changes (temp tree)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-inventory-'));
  try {
    writeMinimalDeclaredTree(tmp);
    const before = buildInstructionInventory({ root: tmp, revision: REVISION });
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), 'stub AGENTS.md — changed\n');
    const after = buildInstructionInventory({ root: tmp, revision: REVISION });
    assert.notEqual(after.digest, before.digest, 'content change must change the inventory digest');
    const agentsEntry = after.sources.find((source) => source.path === 'AGENTS.md');
    const beforeAgents = before.sources.find((source) => source.path === 'AGENTS.md');
    assert.notEqual(agentsEntry.sha256, beforeAgents.sha256);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('missing declared source fails closed; missing revision is rejected', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-missing-'));
  try {
    assert.throws(
      () => listInstructionSources(tmp),
      (error) => error.code === 'INSTRUCTION_SOURCE_MISSING'
    );
    assert.throws(
      () => buildInstructionInventory({ root: ROOT }),
      (error) => error.code === 'INVENTORY_REVISION_REQUIRED'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory is read-only: the tree is byte-identical after two inventory runs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s2-readonly-'));
  try {
    writeMinimalDeclaredTree(tmp);
    const before = snapshotTree(tmp);
    buildInstructionInventory({ root: tmp, revision: REVISION });
    buildInstructionInventory({ root: tmp, revision: REVISION });
    assertTreesIdentical(before, snapshotTree(tmp));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
