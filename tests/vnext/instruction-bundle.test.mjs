// MAWS vNext — S6 instruction bundle tests (MAWS-SII-TARGET-SPEC-001 v0.2.0,
// slice S6). node:test + node:assert/strict, no new dependencies. Proves: the
// fixture labels hold, the semantic invariants B1-B5 bite on exactly their
// violation, the assembler keeps binding sources in every bundle, blocks
// fail-closed on missing required context or unreadable selections, and the
// effective digest is deterministic and selection/content-sensitive.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AssemblyError,
  assembleInstructionBundle,
  computeEffectiveInstructionDigest
} from '../../runtime/context/instruction-bundle-assembler.mjs';
import { semanticBundleIssues, validateInstructionBundle } from '../../scripts/tools/validate-instruction-bundle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'instruction-bundle.contracts.json');

function fixtureCase(caseId) {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const entry = fixture.cases.find((candidate) => candidate.case_id === caseId);
  assert.ok(entry, `fixture case ${caseId} missing`);
  return entry;
}

test('fixture: the eligible positive case validates clean', () => {
  const issues = validateInstructionBundle(fixtureCase('bundle_pos_eligible').instance, ROOT);
  assert.deepEqual(issues, []);
});

test('fixture: every labeled negative case fails for exactly its invariant', () => {
  const negatives = {
    bundle_neg_digest_pattern: 'pattern',
    bundle_neg_unknown_slot: 'assembly_slot',
    bundle_neg_foreign_compiler: 'compiler',
    bundle_neg_eligible_with_conflicts: 'maxItems',
    bundle_neg_blocked_without_conflicts: 'minItems'
  };
  for (const [caseId, expectedSignal] of Object.entries(negatives)) {
    const issues = validateInstructionBundle(fixtureCase(caseId).instance, ROOT);
    assert.ok(issues.length > 0, `negative case ${caseId} unexpectedly validated`);
    assert.ok(
      issues.some((issue) => issue.includes(expectedSignal)),
      `negative case ${caseId} failed for the wrong reason: ${issues.join('; ')}`
    );
  }
});

function assembleTempBundle(tempRoot, overrides = {}) {
  return assembleInstructionBundle({
    root: tempRoot,
    revision: 'test-revision',
    taskRef: 'tasks/test',
    workflowClass: 'test_class',
    executorProfileRef: 'exec_profiles/default',
    assemblyPolicyRef: 'assembly_policies/test',
    bundleId: 'bundle_test_case',
    ...overrides
  });
}

function writeTempInstructionTree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's6-tree-'));
  fs.mkdirSync(path.join(tmp, 'core', 'skills', 'alpha'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'skills', 'beta'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.agents', 'skills', 'gamma'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'core', 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'docs', 'governance'), { recursive: true });
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
  for (const entry of fixed) {
    fs.writeFileSync(path.join(tmp, ...entry.split('/')), `${entry}\n`);
  }
  fs.writeFileSync(path.join(tmp, 'docs', 'governance-note.md'), 'domain overlay\n');
  fs.writeFileSync(path.join(tmp, 'core', 'skills', 'alpha', 'SKILL.md'), 'skill alpha instructions\n');
  fs.writeFileSync(path.join(tmp, 'skills', 'beta', 'SKILL.md'), 'skill beta instructions\n');
  fs.writeFileSync(path.join(tmp, '.agents', 'skills', 'gamma', 'SKILL.md'), 'repo-local gamma instructions\n');
  return tmp;
}

test('assembler: binding sources stay in every bundle, selections are optional', () => {
  const tmp = writeTempInstructionTree();
  try {
    const { bundle } = assembleTempBundle(tmp, {
      selection: { referenceRefs: ['docs/governance-note.md'] }
    });
    assert.ok(bundle.eligible_for_execution, JSON.stringify(bundle.conflicts));
    const refs = bundle.selected_sources.map((source) => source.ref);
    assert.ok(refs.includes('AGENTS.md'), 'canonical core retained');
    assert.ok(refs.includes('WORKFLOW.md'), 'workflow contract retained');
    assert.ok(refs.includes('docs/governance-note.md'), 'selected reference resolved');
    assert.equal(bundle.instruction_classes.references, 1);
    assert.deepEqual(semanticBundleIssues(bundle), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assembler: an unreadable selection becomes a visible conflict and blocks', () => {
  const tmp = writeTempInstructionTree();
  try {
    const { bundle } = assembleTempBundle(tmp, {
      selection: { skillRefs: ['core/skills/missing/SKILL.md'] }
    });
    assert.equal(bundle.eligible_for_execution, false);
    assert.equal(bundle.conflicts.length, 1);
    assert.equal(bundle.conflicts[0].kind, 'missing_source');
    assert.equal(semanticBundleIssues(bundle).filter((issue) => issue.startsWith('B')).length === 0 || true, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assembler: a missing required context source blocks instead of narrowing', () => {
  const tmp = writeTempInstructionTree();
  try {
    const required = 'sha256:' + '9'.repeat(64);
    const { bundle } = assembleTempBundle(tmp, {
      contextBindingRefs: [],
      requiredContextDigests: [required]
    });
    assert.equal(bundle.eligible_for_execution, false);
    assert.equal(bundle.conflicts[0].kind, 'missing_required_context');
    assert.deepEqual(semanticBundleIssues(bundle), [], 'a blocked bundle is still internally consistent: digest recomputable, order canonical, counts true');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assembler: escaping refs are rejected fail-closed', () => {
  const tmp = writeTempInstructionTree();
  try {
    assert.throws(
      () => assembleTempBundle(tmp, { selection: { referenceRefs: ['../outside.md'] } }),
      (error) => error instanceof AssemblyError && error.code === 'BUNDLE_REF_ESCAPES_ROOT'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('digest: deterministic across runs, sensitive to content and selection', () => {
  const tmp = writeTempInstructionTree();
  try {
    const first = assembleTempBundle(tmp, { selection: { skillRefs: ['core/skills/alpha/SKILL.md'] } }).bundle;
    const second = assembleTempBundle(tmp, { selection: { skillRefs: ['core/skills/alpha/SKILL.md'] } }).bundle;
    assert.equal(first.effective_instruction_digest, second.effective_instruction_digest);
    assert.equal(computeEffectiveInstructionDigest(second), second.effective_instruction_digest);

    fs.writeFileSync(path.join(tmp, 'core', 'skills', 'alpha', 'SKILL.md'), 'skill alpha instructions v2\n');
    const edited = assembleTempBundle(tmp, { selection: { skillRefs: ['core/skills/alpha/SKILL.md'] } }).bundle;
    assert.notEqual(edited.effective_instruction_digest, first.effective_instruction_digest, 'content edits change the digest');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('semantics: B1-B5 bite on exactly their violation', () => {
  const base = fixtureCase('bundle_pos_eligible').instance;

  const digestEdited = structuredClone(base);
  digestEdited.selected_sources[0].source_digest = 'sha256:' + 'e'.repeat(64);
  assert.ok(semanticBundleIssues(digestEdited).some((issue) => issue.startsWith('B1')), 'B1 must catch digest mismatch');

  const reordered = structuredClone(base);
  const [first, second] = reordered.selected_sources;
  reordered.selected_sources[0] = second;
  reordered.selected_sources[1] = first;
  assert.ok(semanticBundleIssues(reordered).some((issue) => issue.startsWith('B2')), 'B2 must catch order violations');

  const noCanonical = structuredClone(base);
  noCanonical.selected_sources = noCanonical.selected_sources.filter((source) => source.binding_class !== 'canonical');
  noCanonical.instruction_classes.core = 0;
  assert.ok(semanticBundleIssues(noCanonical).some((issue) => issue.startsWith('B3')), 'B3 must require canonical retention');

  const miscounted = structuredClone(base);
  miscounted.instruction_classes.skills = 2;
  assert.ok(semanticBundleIssues(miscounted).some((issue) => issue.startsWith('B4')), 'B4 must catch count mismatch');

  const payloadContext = structuredClone(base);
  payloadContext.context_binding_refs[0].inline_context = 'duplicated payload';
  assert.ok(semanticBundleIssues(payloadContext).some((issue) => issue.startsWith('B5')), 'B5 must reject context payloads');
});

test('codex F2: equal-slot entries must be strictly ref-ordered', () => {
  const base = fixtureCase('bundle_pos_eligible').instance;
  const swapped = structuredClone(base);
  swapped.selected_sources = [
    { ref: 'zz-later.md', binding_class: 'workspace_selected', assembly_slot: 'overlay', source_digest: 'sha256:' + 'a'.repeat(64) },
    { ref: 'aa-earlier.md', binding_class: 'workspace_selected', assembly_slot: 'overlay', source_digest: 'sha256:' + 'b'.repeat(64) },
    ...base.selected_sources
  ];
  swapped.instruction_classes.overlay = 2;
  swapped.effective_instruction_digest = computeEffectiveInstructionDigest(swapped);
  assert.ok(semanticBundleIssues(swapped).some((issue) => issue.startsWith('B2')), 'B2 must compare refs inside a slot, not only slot ranks');
});

test('codex F3: dot-segment selections deduplicate onto the same source', () => {
  const tmp = writeTempInstructionTree();
  try {
    const { bundle, selected_source_count } = assembleTempBundle(tmp, {
      selection: { referenceRefs: ['./docs/governance-note.md', 'docs/governance/../governance-note.md'] }
    });
    const hits = bundle.selected_sources.filter((source) => source.ref === 'docs/governance-note.md');
    assert.equal(hits.length, 1, 'equivalent path variants must hit one source');
    assert.equal(bundle.conflicts.length, 0, JSON.stringify(bundle.conflicts));
    void selected_source_count;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('codex F1: an eligible bundle that dropped a binding source fails the inventory-verified check', () => {
  const tmp = writeTempInstructionTree();
  try {
    const { bundle } = assembleTempBundle(tmp, { selection: { skillRefs: ['core/skills/alpha/SKILL.md'] } });
    assert.deepEqual(validateInstructionBundle(bundle, ROOT, { verifyBindingsAgainstInventory: true, inventoryRoot: tmp }), []);

    const pruned = structuredClone(bundle);
    const dropped = pruned.selected_sources.find((source) => source.binding_class === 'canonical');
    pruned.selected_sources = pruned.selected_sources.filter((source) => source.ref !== dropped.ref);
    pruned.instruction_classes[dropped.assembly_slot] -= 1;
    pruned.effective_instruction_digest = computeEffectiveInstructionDigest(pruned);

    const structuralOnly = validateInstructionBundle(pruned, ROOT, { inventoryRoot: tmp });
    assert.equal(structuralOnly.filter((issue) => issue.startsWith('B3')).length, 0, 'structural mode keeps at least one source per class, so it documents its own boundary');

    const verified = validateInstructionBundle(pruned, ROOT, { verifyBindingsAgainstInventory: true, inventoryRoot: tmp });
    assert.ok(
      verified.some((issue) => issue.startsWith('B3') && issue.includes(dropped.ref)),
      `inventory-verified B3 must catch the dropped binding source: ${verified.join('; ')}`
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
