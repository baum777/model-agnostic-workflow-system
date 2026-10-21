// MAWS vNext — S3 wave 2 advisory signal layer tests (MAWS-SII-TARGET-SPEC-001).
// node:test + node:assert/strict, no new dependencies.
//
// The detectors of the eight semantic classes prove nothing on a healthy
// corpus: a repository whose instructions are in order yields no candidate,
// which is exactly what a broken detector would also yield. The cases below
// therefore plant one occurrence of every class and require that the
// corresponding signal fires, that a clean tree yields nothing, that the
// signals are deterministic, that every produced finding is contract-valid
// and advisory, and that the audit leaves the tree byte-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditInstructionSources } from '../../runtime/instructions/instruction-auditor.mjs';
import { collectAdvisorySignals } from '../../runtime/instructions/instruction-semantic-signals.mjs';
import { buildInstructionGraph } from '../../runtime/instructions/instruction-resolver.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVISION = '2eff613f924c7a8e20cdc3a946971bed919d23d6';
const SCHEMA_PATH = 'core/contracts/instruction-audit-finding.schema.json';

const FIXED_SOURCES = [
  'AGENTS.md',
  'WORKFLOW.md',
  'docs/governance/source-hierarchy.md',
  'docs/authority-matrix.md',
  'docs/model-agnostic-core-prompt-system.md',
  'core/contracts/workflow-routing-map.json',
  'core/contracts/permission-boundary.json',
  'core/contracts/workflow-memory-contract.json'
];

function writeTree(root, files) {
  for (const rel of FIXED_SOURCES) {
    if (files[rel] !== undefined) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), `stub ${rel}\n`);
  }
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  // The inventory declares three skill trees and fails closed when one of
  // them is missing, so every fixture declares all three. The placeholder
  // descriptions are deliberately unrelated to each other: descriptions that
  // cover the same ground are themselves a routing ambiguity signal.
  const PLACEHOLDERS = {
    'core/skills': 'Portable reference material for the shared core surface.',
    skills: 'Exported workflow recipes for consumers of this package.',
    '.agents/skills': 'Local orchestration helpers bound to this repository.'
  };
  for (const [tree, description] of Object.entries(PLACEHOLDERS)) {
    const dir = path.join(root, tree);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.readdirSync(dir).length === 0) {
      fs.mkdirSync(path.join(dir, 'placeholder'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'placeholder', 'SKILL.md'),
        `---\nname: placeholder\ndescription: ${description}\n---\n\nNothing to report here.\n`
      );
    }
  }
  if (!files['package.json']) {
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: 'signal-fixture', private: true })}\n`);
  }
}

// One planted occurrence per declared class.
function plantedFiles() {
  return {
    'AGENTS.md': [
      '# Fixture governance',
      '',
      'The `runtime.budget` must be 4096 tokens for every run.',
      '',
      'Every change must be verified against the canonical source.',
      ''
    ].join('\n'),
    'WORKFLOW.md': [
      '# Fixture workflow',
      '',
      'The `runtime.budget` must be 8192 tokens for every run.',
      '',
      'Never modify any shared contract.',
      '',
      'The model will always remember the whole file after reading it.',
      ''
    ].join('\n'),
    'docs/authority-matrix.md': [
      '# Fixture authority matrix',
      '',
      'Never publish `docs/plan.md` without owner review.',
      '',
      'Every change must be verified against the canonical source.',
      ''
    ].join('\n'),
    'skills/shared-demo/SKILL.md': [
      '---',
      'name: shared-demo',
      'description: A fixture skill whose entire instruction is already stated by a higher authority.',
      '---',
      '',
      'Every change must be verified against the canonical source.',
      ''
    ].join('\n'),
    'core/skills/demo-skill/SKILL.md': [
      '---',
      'name: demo-skill',
      'description: A fixture skill that claims a permission and a different rule.',
      '---',
      '',
      'You may bypass the approval for this local helper.',
      '',
      'You must publish `docs/plan.md` after the review.',
      ''
    ].join('\n'),
    'core/skills/alpha/SKILL.md': [
      '---',
      'name: alpha',
      'description: Review a change for architectural boundaries and coupling before promotion.',
      '---',
      '',
      'Nothing to report here.',
      ''
    ].join('\n'),
    'skills/beta/SKILL.md': [
      '---',
      'name: beta',
      'description: Review a change for architectural boundaries and coupling before release.',
      '---',
      '',
      'Nothing to report here.',
      ''
    ].join('\n')
  };
}

function withTree(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s3-signals-'));
  try {
    writeTree(tmp, files);
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function snapshotTree(root) {
  const snapshot = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, entry);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else snapshot.set(abs, fs.readFileSync(abs));
    }
  };
  walk(root);
  return snapshot;
}

test('every declared class has a planted signal and a clean tree has none', () => {
  withTree(plantedFiles(), (tmp) => {
    const graph = buildInstructionGraph({ root: tmp, revision: REVISION });
    const advisory = collectAdvisorySignals({ root: tmp, graph });
    const classes = new Set(advisory.signals.map((entry) => entry.finding_class));
    for (const expected of [
      'RULE_CONFLICT',
      'PRECEDENCE_CONFLICT',
      'OVERCONSTRAINT',
      'REDUNDANT_INSTRUCTION',
      'CONTEXT_OVERLOAD',
      'AUTHORITY_LEAK',
      'MODEL_DRIFT',
      'SKILL_ROUTING_AMBIGUITY'
    ]) {
      assert.ok(classes.has(expected), `planted class must produce a signal: ${expected}`);
    }
  });

  withTree({}, (tmp) => {
    const graph = buildInstructionGraph({ root: tmp, revision: REVISION });
    const advisory = collectAdvisorySignals({ root: tmp, graph });
    assert.equal(advisory.signals.length, 0, 'a clean tree yields no candidate');
  });
});

test('the rule conflict names both bindings and both sources', () => {
  withTree(plantedFiles(), (tmp) => {
    const graph = buildInstructionGraph({ root: tmp, revision: REVISION });
    const advisory = collectAdvisorySignals({ root: tmp, graph });
    const conflict = advisory.signals.find((entry) => entry.finding_class === 'RULE_CONFLICT');
    assert.ok(conflict, 'the planted key conflict must be found');
    assert.ok(conflict.observed_problem.includes('runtime.budget'), 'the conflicting key must be named');
    assert.ok(conflict.evidence_refs.length >= 2, 'both bindings must be evidence');
    assert.ok(
      conflict.evidence_refs.some((ref) => ref.includes('AGENTS.md')) &&
      conflict.evidence_refs.some((ref) => ref.includes('WORKFLOW.md')),
      'both sources must be evidence'
    );
  });
});

test('signals are deterministic for an unchanged tree', () => {
  withTree(plantedFiles(), (tmp) => {
    const graph = buildInstructionGraph({ root: tmp, revision: REVISION });
    const first = collectAdvisorySignals({ root: tmp, graph });
    const second = collectAdvisorySignals({ root: tmp, graph });
    assert.deepEqual(first.signals, second.signals);
  });
});

test('advisory findings are contract-valid, advisory, and never gate', () => {
  withTree(plantedFiles(), (tmp) => {
    const audit = auditInstructionSources({ root: tmp, revision: REVISION });
    const advisory = audit.findings.filter((finding) => finding.determinism === 'semantic_advisory');
    assert.ok(advisory.length >= 8, `every planted class must yield a finding, got ${advisory.length}`);
    for (const finding of audit.findings) {
      const issues = validateInstanceAgainstContract(finding, SCHEMA_PATH, ROOT);
      assert.deepEqual(issues, [], `finding must be contract-valid: ${issues.join('; ')}`);
      if (finding.determinism !== 'semantic_advisory') continue;
      assert.equal(finding.requires_owner_review, true, 'an advisory finding asks for owner review');
      assert.notEqual(finding.risk_level, 'blocker', 'an advisory finding may never carry blocker risk');
      assert.ok(finding.evidence_refs.length >= 1, 'an advisory finding carries its evidence');
    }
  });
});

test('the coverage names the signal per class and keeps the limitation', () => {
  withTree(plantedFiles(), (tmp) => {
    const audit = auditInstructionSources({ root: tmp, revision: REVISION });
    assert.equal(audit.coverage.classes_analyzed.length, 2, 'the two deterministic classes stay analysed');
    assert.equal(audit.coverage.classes_declared_not_analyzable.length, 8, 'the eight semantic classes stay declared');
    for (const declared of audit.coverage.classes_declared_not_analyzable) {
      assert.ok(declared.reason.includes('not statically analyzable'), 'the limitation stays stated');
      assert.ok(declared.advisory_signal.length > 0, 'every declared class names its signal');
      assert.ok(declared.advisory_note.includes('the owner does'), 'the signal must not decide the class');
    }
    const detected = audit.coverage.classes_detected_advisory;
    assert.equal(detected.length, 8, 'every declared class is listed with its signal');
    for (const entry of detected) {
      assert.ok(entry.candidate_count >= 0, 'candidate counts are reported per class');
    }
    assert.ok(
      detected.find((entry) => entry.finding_class === 'RULE_CONFLICT').candidate_count >= 1,
      'the planted conflict is counted'
    );
  });
});

test('the audit is read-only: the tree is byte-identical after two audit runs', () => {
  withTree(plantedFiles(), (tmp) => {
    const before = snapshotTree(tmp);
    auditInstructionSources({ root: tmp, revision: REVISION });
    auditInstructionSources({ root: tmp, revision: REVISION });
    const after = snapshotTree(tmp);
    assert.equal(after.size, before.size, 'file count must not change');
    for (const [abs, content] of before) {
      assert.ok(after.has(abs), `file disappeared: ${abs}`);
      assert.ok(Buffer.compare(after.get(abs), content) === 0, `file changed: ${abs}`);
    }
  });
});
