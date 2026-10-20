// MAWS vNext — S3 instruction auditor tests (MAWS-SII-TARGET-SPEC-001).
// node:test + node:assert/strict, no new dependencies. Proves: findings
// emitted for planted dangling references carry the closed taxonomy class,
// deterministic provenance and contract-valid shape; clean trees emit zero
// findings with the honest coverage declaration; audit ids and finding ids
// are deterministic and revision-bound; the emitted findings validate against
// the canonical contract; and the audit runs leave the tree byte-identical
// (read-only boundary).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditInstructionSources,
  AUDIT_SCHEMA_VERSION,
  AUDIT_TAXONOMY
} from '../../runtime/instructions/instruction-auditor.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVISION = '2eff613f924c7a8e20cdc3a946971bed919d23d6';
const SCHEMA_PATH = 'core/contracts/instruction-audit-finding.schema.json';

// Minimal tree satisfying every declared source plus a package.json, with a
// planted dangling link and a planted unknown npm run command.
function writeAuditableTree(tmp) {
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
      'Dangling: [missing](./does-not-exist.md).',
      'Fine: [root](../../../AGENTS.md).',
      'Unknown command: `npm run no-such-script`.',
      ''
    ].join('\n')
  );
  fs.mkdirSync(path.join(tmp, '.agents/skills/local-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.agents/skills/local-demo/SKILL.md'), '# Local demo\n');
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    `${JSON.stringify({ name: 'audit-fixture', private: true, scripts: { demo: 'node --version' } })}\n`
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

test('taxonomy is the closed section 6.2 set with honest static decidability', () => {
  assert.equal(AUDIT_TAXONOMY.length, 10);
  const analyzed = AUDIT_TAXONOMY.filter((entry) => entry.analyzable_static).map((entry) => entry.finding_class);
  assert.deepEqual(analyzed, ['STALE_REFERENCE', 'INVALID_COMMAND']);
  for (const entry of AUDIT_TAXONOMY.filter((candidate) => !candidate.analyzable_static)) {
    assert.ok(entry.definition.length > 0, `declared class needs a definition: ${entry.finding_class}`);
  }
});

test('planted dangling references produce contract-valid findings with deterministic ids', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s3-audit-'));
  try {
    writeAuditableTree(tmp);
    const audit = auditInstructionSources({ root: tmp, revision: REVISION });
    assert.equal(audit.schema_version, AUDIT_SCHEMA_VERSION);
    assert.equal(audit.findings_count, audit.findings.length);
    assert.equal(audit.findings_count, 2, 'exactly the planted dangling link and command become findings');

    const stale = audit.findings.find((finding) => finding.finding_class === 'STALE_REFERENCE');
    const invalidCommand = audit.findings.find((finding) => finding.finding_class === 'INVALID_COMMAND');
    assert.ok(stale && invalidCommand, 'both planted classes must be present');
    assert.equal(stale.source_path, 'core/skills/demo-skill/SKILL.md');
    assert.deepEqual(stale.line_range, [3, 3]);
    assert.equal(stale.risk_level, 'high');
    assert.equal(stale.requires_owner_review, false);
    assert.equal(invalidCommand.risk_level, 'medium');
    for (const finding of [stale, invalidCommand]) {
      assert.equal(finding.determinism, 'deterministic');
      assert.equal(finding.source_revision, REVISION);
      assert.match(finding.audit_id, /^ia_[a-f0-9]{16}$/);
      assert.match(finding.finding_id, /^iaf_[a-f0-9]{16}$/);
      assert.equal(finding.inferred_cause, null);
      assert.ok(finding.evidence_refs.length >= 1);
      assert.ok(finding.line_range[0] <= finding.line_range[1], 'line range ordering convention');
      const issues = validateInstanceAgainstContract(finding, SCHEMA_PATH, ROOT);
      assert.deepEqual(issues, [], `finding must validate against the canonical contract: ${issues.join('; ')}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('clean tree yields zero findings but still declares the advisory coverage limits', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s3-clean-'));
  try {
    const fixed = ['AGENTS.md', 'WORKFLOW.md', 'docs/governance/source-hierarchy.md', 'docs/authority-matrix.md', 'docs/model-agnostic-core-prompt-system.md', 'core/contracts/workflow-routing-map.json', 'core/contracts/permission-boundary.json', 'core/contracts/workflow-memory-contract.json'];
    for (const rel of fixed) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), `stub ${rel}\n`);
    }
    fs.mkdirSync(path.join(tmp, 'core/skills/demo-skill'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'core/skills/demo-skill/SKILL.md'), '# Demo\n');
    fs.mkdirSync(path.join(tmp, '.agents/skills/local-demo'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.agents/skills/local-demo/SKILL.md'), '# Local\n');
    fs.writeFileSync(path.join(tmp, 'package.json'), `${JSON.stringify({ name: 'x', private: true })}\n`);

    const audit = auditInstructionSources({ root: tmp, revision: REVISION });
    assert.equal(audit.findings_count, 0);
    assert.deepEqual(audit.coverage.classes_analyzed, ['STALE_REFERENCE', 'INVALID_COMMAND']);
    assert.equal(audit.coverage.classes_declared_not_analyzable.length, 8, 'unaudited classes must be declared, never silent');
    for (const declared of audit.coverage.classes_declared_not_analyzable) {
      assert.ok(declared.reason.includes('not statically analyzable'), 'declaration must state the limitation');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('audit identity is deterministic and revision-bound; real-repo findings validate', () => {
  const first = auditInstructionSources({ root: ROOT, revision: REVISION });
  const second = auditInstructionSources({ root: ROOT, revision: REVISION });
  assert.equal(first.audit_id, second.audit_id);
  assert.equal(first.digest, second.digest);
  const other = auditInstructionSources({ root: ROOT, revision: 'other-revision' });
  assert.notEqual(other.audit_id, first.audit_id);
  for (const finding of first.findings) {
    const issues = validateInstanceAgainstContract(finding, SCHEMA_PATH, ROOT);
    assert.deepEqual(issues, [], `real-repo finding must be contract-valid: ${issues.join('; ')}`);
  }
  assert.ok(first.coverage.classes_declared_not_analyzable.length === 8);
});

test('audit is read-only: the tree is byte-identical after two audit runs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s3-readonly-'));
  try {
    writeAuditableTree(tmp);
    const before = snapshotTree(tmp);
    auditInstructionSources({ root: tmp, revision: REVISION });
    auditInstructionSources({ root: tmp, revision: REVISION });
    assertTreesIdentical(before, snapshotTree(tmp));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
