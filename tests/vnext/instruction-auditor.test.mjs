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
import { execFileSync } from 'node:child_process';

import {
  auditInstructionSources,
  semanticFindingIssues,
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
  fs.mkdirSync(path.join(tmp, 'skills/shared-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'skills/shared-demo/SKILL.md'), '# Shared demo\n');
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
    fs.mkdirSync(path.join(tmp, 'skills/shared-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'skills/shared-demo/SKILL.md'), '# Shared demo\n');
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

test('same target on the same line via different edge kinds yields distinct finding ids (codex P2 repair)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s3-idcoll-'));
  try {
    const fixed = ['AGENTS.md', 'WORKFLOW.md', 'docs/governance/source-hierarchy.md', 'docs/authority-matrix.md', 'docs/model-agnostic-core-prompt-system.md', 'core/contracts/workflow-routing-map.json', 'core/contracts/permission-boundary.json', 'core/contracts/workflow-memory-contract.json'];
    for (const rel of fixed) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), `stub ${rel}\n`);
    }
    fs.mkdirSync(path.join(tmp, 'skills/shared-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'skills/shared-demo/SKILL.md'), '# Shared demo\n');
  fs.mkdirSync(path.join(tmp, 'core/skills/demo-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'core/skills/demo-skill/SKILL.md'),
      '# Demo\n\nSame target twice: [as link](./missing.md) and as `./missing.md`.\n'
    );
    fs.mkdirSync(path.join(tmp, '.agents/skills/local-demo'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.agents/skills/local-demo/SKILL.md'), '# Local\n');
    fs.writeFileSync(path.join(tmp, 'package.json'), `${JSON.stringify({ name: 'x', private: true })}\n`);

    const audit = auditInstructionSources({ root: tmp, revision: REVISION });
    const stales = audit.findings.filter((finding) => finding.finding_class === 'STALE_REFERENCE');
    assert.equal(stales.length, 2, 'the link edge and the inline-path edge are two findings');
    assert.notEqual(stales[0].finding_id, stales[1].finding_id, 'edge kind is part of the finding identity');
    for (const finding of stales) {
      assert.equal(finding.line_range[0], 3);
      assert.deepEqual(semanticFindingIssues(finding), []);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('semantic finding checks enforce the line_range ordering invariant (codex P2 repair)', () => {
  const reversed = {
    finding_class: 'STALE_REFERENCE',
    line_range: [10, 2]
  };
  assert.ok(semanticFindingIssues(reversed).length > 0, 'reversed range must be reported');
  assert.deepEqual(semanticFindingIssues({ line_range: [7, 7] }), [], 'single-line range passes');
  assert.deepEqual(semanticFindingIssues({ line_range: [12, 30] }), [], 'ordered multi-line range passes');
  assert.deepEqual(semanticFindingIssues({}), [], 'non-finding input yields no issues (schema handles shape)');
  const emitted = auditInstructionSources({ root: ROOT, revision: REVISION });
  for (const finding of emitted.findings) {
    assert.deepEqual(semanticFindingIssues(finding), [], 'the static emitter must never produce reversed ranges');
  }
});

test('CLI revision gate: unresolvable revision exits 2 without a report (codex P1 repair)', () => {
  const cli = path.join(ROOT, 'scripts', 'tools', 'validate-instruction-integrity.mjs');
  let failed = false;
  try {
    execFileSync('node', [cli, '--revision', 'not-a-real-revision'], { stdio: 'pipe' });
  } catch (error) {
    failed = true;
    assert.equal(error.status, 2, 'unresolvable revision must exit 2');
    assert.ok(error.stderr.toString().includes('AUDIT_REVISION_UNVERIFIED'));
  }
  assert.ok(failed, 'the CLI must refuse an unresolvable revision');
});

test('CLI revision gate: a clean committed tree at HEAD audits, a dirty tree is refused', () => {
  const cli = path.join(ROOT, 'scripts', 'tools', 'validate-instruction-integrity.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s3-cligate-'));
  try {
    const fixed = ['AGENTS.md', 'WORKFLOW.md', 'docs/governance/source-hierarchy.md', 'docs/authority-matrix.md', 'docs/model-agnostic-core-prompt-system.md', 'core/contracts/workflow-routing-map.json', 'core/contracts/permission-boundary.json', 'core/contracts/workflow-memory-contract.json'];
    for (const rel of fixed) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), `stub ${rel}\n`);
    }
    fs.mkdirSync(path.join(tmp, 'skills/shared-demo'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'skills/shared-demo/SKILL.md'), '# Shared demo\n');
  fs.mkdirSync(path.join(tmp, 'core/skills/demo-skill'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'core/skills/demo-skill/SKILL.md'), '# Demo\n\nBroken: [missing](./nope.md)\n');
    fs.mkdirSync(path.join(tmp, '.agents/skills/local-demo'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.agents/skills/local-demo/SKILL.md'), '# Local\n');
    fs.writeFileSync(path.join(tmp, 'package.json'), `${JSON.stringify({ name: 'x', private: true })}\n`);

    const git = (...args) => execFileSync('git', ['-C', tmp, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'MAWS Test');
    git('config', 'commit.gpgsign', 'false');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'fixture');
    const head = git('rev-parse', 'HEAD');

    const clean = execFileSync('node', [cli, '--revision', head, '--root', tmp], { encoding: 'utf8' });
    assert.ok(clean.includes('revision verified'), `verified run must say so: ${clean.split('\n')[0]}`);
    assert.ok(clean.includes('1 findings'), `the planted dangling link must be found: ${clean.split('\n')[0]}`);

    fs.appendFileSync(path.join(tmp, 'AGENTS.md'), 'dirty\n');
    let refused = false;
    try {
      execFileSync('node', [cli, '--revision', head, '--root', tmp], { stdio: 'pipe' });
    } catch (error) {
      refused = true;
      assert.equal(error.status, 2, 'a dirty tree must exit 2');
      assert.ok(error.stderr.toString().includes('dirty'));
    }
    assert.ok(refused, 'the CLI must refuse to stamp a revision onto a dirty tree');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('non-defect reference classes produce no finding and stay visible in the coverage', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s3-classes-'));
  try {
    const fixed = ['AGENTS.md', 'WORKFLOW.md', 'docs/governance/source-hierarchy.md', 'docs/authority-matrix.md', 'docs/model-agnostic-core-prompt-system.md', 'core/contracts/workflow-routing-map.json', 'core/contracts/permission-boundary.json', 'core/contracts/workflow-memory-contract.json'];
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
        'Glob: `core/skills/*/SKILL.md`.',
        'Range: `origin/main..main`.',
        'Consumer-local: `.codex/repo-intake-inputs.json`.',
        'Workspace: `supabase/config.toml`.',
        '`.codex/shared-core-map.json` was not present in the inspected repo.',
        ''
      ].join('\n')
    );
    fs.mkdirSync(path.join(tmp, '.agents/skills/local-demo'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.agents/skills/local-demo/SKILL.md'), '# Local\n');
    fs.writeFileSync(path.join(tmp, 'package.json'), `${JSON.stringify({ name: 'x', private: true })}\n`);

    const audit = auditInstructionSources({ root: tmp, revision: REVISION });
    assert.equal(audit.findings_count, 0, 'no reference class that is not a defect may produce a finding');
    const classes = audit.coverage.reference_classes;
    assert.equal(classes.glob_pattern, 1);
    assert.equal(classes.git_range, 1);
    assert.equal(classes.external_workspace, 2);
    assert.equal(classes.documented_absence, 1);
    assert.equal(classes.dangling, 0);
    for (const note of Object.values(audit.coverage.reference_class_notes)) {
      assert.ok(note.length > 0, 'every non-defect class carries a stated reason');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
