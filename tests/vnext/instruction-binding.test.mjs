// MAWS vNext — S7 runtime instruction binding (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S7, spec sections 11.2/11.3).
//
// Proves the closure of the S7 OPEN obligation "Runtime bundle->fingerprint
// derivation":
//   - the effective instruction digest is DERIVED at runtime from the
//     effective instruction bundle the run actually gets (the S6 assembler
//     rebuilds it from the live instruction tree);
//   - a caller-asserted digest never legitimizes a qualification: the
//     runtime binds the derived digest and records the declared one for
//     traceability only;
//   - a qualification earned under another instruction state is a material
//     drift and blocks the run;
//   - the committed reference spec's qualification binding is bound to the
//     instruction state currently in effect (a material instruction change
//     without a re-qualification fails this gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveInstructionBinding,
  bindFingerprintToInstructionDigest,
  bindFingerprintsToInstructionDigest,
  verifyBundleSourcesAgainstTree,
  contentRevision
} from '../../runtime/qualification/instruction-binding.mjs';
import { computeEffectiveInstructionDigest } from '../../runtime/context/instruction-bundle-assembler.mjs';
import { classifyMateriality } from '../../runtime/qualification/materiality.mjs';
import { computeEligibility } from '../../runtime/qualification/eligibility.mjs';
import { runRuntimeRun } from '../../runtime/cli/runtime-run.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const referenceSpecPath = path.join(root, 'runtime/cli/specs/reference-audit-v1.json');

const CANONICAL_SOURCES = [
  'AGENTS.md',
  'WORKFLOW.md',
  'docs/governance/source-hierarchy.md',
  'docs/authority-matrix.md',
  'docs/model-agnostic-core-prompt-system.md',
  'core/contracts/workflow-routing-map.json',
  'core/contracts/permission-boundary.json',
  'core/contracts/workflow-memory-contract.json'
];

const ASSEMBLY = {
  bundleId: 'bundle_s7_binding_test',
  taskRef: 'task_s7_binding_test',
  workflowClass: 'implementation',
  executorProfileRef: 'profile_readonly_v1',
  assemblyPolicyRef: 'assembly_policy_default_v1'
};

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maws-s7-binding-'));
}

// A minimal but complete instruction tree: the declared canonical sources
// plus the three declared skill trees. The derivation must work on any tree
// that satisfies the S2 inventory declaration.
function makeInstructionTree(overrides = {}) {
  const dir = tmpDir();
  for (const relative of CANONICAL_SOURCES) {
    const absolute = path.join(dir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const content = overrides[relative] ?? `canonical instruction source: ${relative}\n`;
    fs.writeFileSync(absolute, content);
  }
  for (const tree of ['core/skills', 'skills', '.agents/skills']) {
    fs.mkdirSync(path.join(dir, tree), { recursive: true });
  }
  return dir;
}

// A runtime tree the CLI can run against: the contracts, the policies, the
// JEV fixtures, the executor registry and the declared instruction
// surfaces. The instruction surfaces are the ones the S2 inventory declares.
function makeRuntimeTree() {
  const dir = tmpDir();
  fs.cpSync(path.join(root, 'core/contracts'), path.join(dir, 'core/contracts'), { recursive: true });
  fs.cpSync(path.join(root, 'policies'), path.join(dir, 'policies'), { recursive: true });
  fs.cpSync(path.join(root, 'runtime/decision-engine/jev/fixtures'), path.join(dir, 'runtime/decision-engine/jev/fixtures'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'runtime/executors'), { recursive: true });
  fs.cpSync(path.join(root, 'runtime/executors/registry.default.json'), path.join(dir, 'runtime/executors/registry.default.json'));
  for (const relative of CANONICAL_SOURCES) {
    const absolute = path.join(dir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.copyFileSync(path.join(root, relative), absolute);
  }
  for (const tree of ['core/skills', 'skills', '.agents/skills']) {
    fs.mkdirSync(path.join(dir, tree), { recursive: true });
  }
  return dir;
}

function fingerprintWith(digest) {
  return {
    fingerprint_id: 'fp_s7_binding_0001',
    executor_id: 'exec_openrouter_glm',
    capability_id: 'cap_repository_analysis',
    execution_profile_ref: 'profile_readonly_v1',
    components: {
      model_id: 'zai/glm-4.7',
      provider_id: 'openrouter',
      runtime_harness: 'development_harness/in_process_fixture/1',
      tool_contract_refs: ['tests/vnext/instruction-binding.test.mjs'],
      api_surface_version: '2026-09',
      qualification_profile_ref: 'qualprofile_e2e_v1',
      effective_instruction_digest: digest
    },
    digest: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
  };
}

test('S7 the effective instruction digest is derived from the assembled bundle and is reproducible', () => {
  const tree = makeInstructionTree();
  const first = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const second = deriveInstructionBinding({ root: tree, ...ASSEMBLY });

  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^sha256:[a-f0-9]{64}$/);
  // The derived digest is the digest of the bundle the S6 assembler built
  // from the live tree — not a value the caller supplied.
  assert.equal(first.digest, computeEffectiveInstructionDigest(first.bundle));
  assert.equal(first.bundle.effective_instruction_digest, first.digest);
  assert.equal(first.verified_source_count, CANONICAL_SOURCES.length);
  for (const source of first.bundle.selected_sources) {
    const absolute = path.join(tree, source.ref);
    const digest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(absolute, 'utf8')).digest('hex')}`;
    assert.equal(digest, source.source_digest, `${source.ref} must be bound to its live content`);
  }
});

test('S7 the derivation refuses a bundle whose sources do not match the live tree', () => {
  const tree = makeInstructionTree();
  const real = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const tampered = JSON.parse(JSON.stringify(real.bundle));
  tampered.selected_sources[0].source_digest = `sha256:${'1'.repeat(64)}`;
  // The bundle stays self-consistent: only the SOURCE no longer matches the
  // live tree, so the source re-read is the check that has to fire.
  tampered.effective_instruction_digest = computeEffectiveInstructionDigest(tampered);
  assert.throws(
    () => deriveInstructionBinding({
      root: tree,
      ...ASSEMBLY,
      assemble: () => ({ bundle: tampered, inventory: { digest: 'x' }, selected_source_count: 0, excluded_source_count: 0 })
    }),
    (error) => error?.code === 'INSTRUCTION_SOURCE_DIGEST_MISMATCH'
  );
});

test('S7 a bundle that declares a digest it cannot prove is refused', () => {
  const tree = makeInstructionTree();
  const real = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const tampered = {
    ...real.bundle,
    effective_instruction_digest: `sha256:${'0'.repeat(64)}`
  };
  assert.throws(
    () => deriveInstructionBinding({
      root: tree,
      ...ASSEMBLY,
      assemble: () => ({ bundle: tampered, inventory: real.bundle ? { digest: 'x' } : null, selected_source_count: 0, excluded_source_count: 0 })
    }),
    (error) => error?.code === 'INSTRUCTION_BUNDLE_DIGEST_INCONSISTENT'
  );
});

test('S7 the derivation follows the tree: a changed instruction source changes the derived digest', () => {
  const tree = makeInstructionTree();
  const before = deriveInstructionBinding({ root: tree, ...ASSEMBLY });

  fs.writeFileSync(path.join(tree, 'AGENTS.md'), 'canonical instruction source: AGENTS.md\nchanged\n');

  const after = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  assert.notEqual(before.digest, after.digest);
  // The content-addressed source snapshot moves with the content.
  assert.notEqual(before.revision, after.revision);
  assert.match(after.revision, /^content:[a-f0-9]{64}$/);
  assert.equal(contentRevision(tree), after.revision);
});

test('S7 a caller-asserted digest does not legitimize a qualification: the derived digest is bound', () => {
  const tree = makeInstructionTree();
  const derived = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const asserted = 'sha256:' + 'a'.repeat(64);

  const binding = bindFingerprintToInstructionDigest({
    fingerprint: fingerprintWith(asserted),
    derivedDigest: derived.digest
  });

  // The declared digest is recorded, never used.
  assert.equal(binding.declared_digest, asserted);
  assert.equal(binding.digest_matches, false);
  // The fingerprint the qualification gate consumes carries the DERIVED value.
  assert.equal(binding.fingerprint.components.effective_instruction_digest, derived.digest);
  assert.notEqual(binding.fingerprint.components.effective_instruction_digest, asserted);
  // The fingerprint digest is recomputed from the bound components.
  const expectedDigest = crypto
    .createHash('sha256')
    .update(canonicalComponents(binding.fingerprint.components))
    .digest('hex');
  assert.equal(binding.fingerprint.digest, expectedDigest);
});

// Mirror the runtime's canonical JSON: sorted keys, arrays in order.
function canonicalComponents(components) {
  const encode = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${encode(value[key])}`).join(',')}}`;
  };
  return encode(components);
}

test('S7 a fingerprint without the instruction component is refused (fail closed)', () => {
  const tree = makeInstructionTree();
  const derived = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const fingerprint = fingerprintWith(derived.digest);
  delete fingerprint.components.effective_instruction_digest;

  assert.throws(
    () => bindFingerprintToInstructionDigest({ fingerprint, derivedDigest: derived.digest }),
    (error) => error?.code === 'INSTRUCTION_DIGEST_MISSING'
  );
});

test('S7 a malformed declared digest is refused (fail closed)', () => {
  const tree = makeInstructionTree();
  const derived = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  assert.throws(
    () => bindFingerprintToInstructionDigest({
      fingerprint: fingerprintWith('sha256:not-hex'),
      derivedDigest: derived.digest
    }),
    (error) => error?.code === 'INSTRUCTION_DIGEST_INVALID'
  );
});

test('S7 a bundle that no longer describes the live tree is refused (receipt != verification)', () => {
  const tree = makeInstructionTree();
  const derived = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const tampered = JSON.parse(JSON.stringify(derived.bundle));
  tampered.selected_sources[0].source_digest = `sha256:${'0'.repeat(64)}`;

  assert.throws(
    () => verifyBundleSourcesAgainstTree({ bundle: tampered, root: tree }),
    (error) => error?.code === 'INSTRUCTION_SOURCE_DIGEST_MISMATCH'
  );

  const missing = JSON.parse(JSON.stringify(derived.bundle));
  missing.selected_sources[0].ref = 'AGENTS.md';
  missing.selected_sources[0].source_digest = derived.bundle.selected_sources[0].source_digest;
  fs.rmSync(path.join(tree, 'AGENTS.md'));
  assert.throws(
    () => verifyBundleSourcesAgainstTree({ bundle: missing, root: tree }),
    (error) => error?.code === 'INSTRUCTION_SOURCE_MISSING'
  );

  const escaping = JSON.parse(JSON.stringify(derived.bundle));
  escaping.selected_sources[0].ref = '../outside.md';
  assert.throws(
    () => verifyBundleSourcesAgainstTree({ bundle: escaping, root: tree }),
    (error) => error?.code === 'INSTRUCTION_SOURCE_ESCAPES_ROOT'
  );
});

test('S7 a qualification earned under another instruction state is a material drift and blocks the executor', () => {
  const tree = makeInstructionTree();
  const derived = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const staleDigest = `sha256:${'b'.repeat(64)}`;

  const qualified = fingerprintWith(staleDigest);
  const current = bindFingerprintToInstructionDigest({
    fingerprint: fingerprintWith(derived.digest),
    derivedDigest: derived.digest
  }).fingerprint;

  const decision = classifyMateriality(qualified, current);
  assert.equal(decision.overall_class, 'MATERIAL');
  assert.ok(decision.deltas.some((delta) => delta.component === 'effective_instruction_digest' && delta.classification === 'MATERIAL'));

  const decisions = computeEligibility({
    workUnit: { work_unit_id: 'wu_s7_binding_0001' },
    capabilityRequirement: { capability_id: 'cap_repository_analysis', min_profile_ref: 'profile_readonly_v1' },
    manifests: [{ executor_id: 'exec_openrouter_glm', declared_capabilities: [{ capability_id: 'cap_repository_analysis' }] }],
    qualifications: [{
      qualification_id: 'qual_s7_binding_0001',
      executor_id: 'exec_openrouter_glm',
      capability_id: 'cap_repository_analysis',
      execution_profile_ref: 'profile_readonly_v1',
      state: 'QUALIFIED',
      fingerprint_ref: qualified.fingerprint_id,
      decided_at: '2026-09-25T00:00:00Z'
    }],
    profiles: {},
    subsumptionRecords: [],
    currentFingerprints: { exec_openrouter_glm: current },
    qualifiedFingerprints: { exec_openrouter_glm: qualified },
    availability: { exec_openrouter_glm: true },
    policyCompatible: { exec_openrouter_glm: true },
    budgetCompatible: { exec_openrouter_glm: true }
  });
  assert.equal(decisions[0].eligible, false);
  assert.deepEqual(decisions[0].exclusion_reasons, ['MATERIAL_FINGERPRINT_DRIFT']);
});

test('S7 a run spec without an instruction binding fails closed', async () => {
  const spec = JSON.parse(fs.readFileSync(referenceSpecPath, 'utf8'));
  delete spec.instruction_binding;
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

  await assert.rejects(
    () => runRuntimeRun({ specPath, outDir: path.join(dir, 'run') }),
    (error) => error?.code === 'INSTRUCTION_BINDING_MISSING'
  );
});

test('S7 the runtime blocks a run whose qualification was earned under another instruction state', async () => {
  const spec = JSON.parse(fs.readFileSync(referenceSpecPath, 'utf8'));
  spec.run_id = 'run_s7_stale_qualification_0001';
  spec.harness_context.run_ref = spec.run_id; // S11: the context record is bound to this run
  // The qualification snapshot keeps the digest of the instruction state it
  // was earned under; a state that no longer holds must not be reusable.
  for (const fingerprint of Object.values(spec.qualified_fingerprints)) {
    fingerprint.components.effective_instruction_digest = `sha256:${'c'.repeat(64)}`;
  }
  for (const binding of Object.values(spec.intake_bindings || {})) {
    binding.work_unit_id = `wu_${spec.run_id}_root`;
  }
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

  const { summary } = await runRuntimeRun({ specPath, outDir: path.join(dir, 'run') });
  assert.notEqual(summary.status, 'COMPLETED');
  assert.ok(
    String(summary.blocking_reason || '').includes('NO_ELIGIBLE_EXECUTOR'),
    `expected a no-eligible-executor block, got ${summary.status}/${summary.blocking_reason}`
  );
});

test('S7 the runtime records the derived instruction binding in the run evidence', async () => {
  const spec = JSON.parse(fs.readFileSync(referenceSpecPath, 'utf8'));
  spec.run_id = 'run_s7_binding_evidence_0001';
  spec.harness_context.run_ref = spec.run_id; // S11: the context record is bound to this run
  for (const binding of Object.values(spec.intake_bindings || {})) {
    binding.work_unit_id = `wu_${spec.run_id}_root`;
  }
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

  const { runDir } = await runRuntimeRun({ specPath, outDir: path.join(dir, 'run') });
  const evidence = JSON.parse(fs.readFileSync(path.join(runDir, 'instruction-binding.json'), 'utf8'));

  const derived = deriveInstructionBinding({
    root,
    bundleId: spec.instruction_binding.bundle_id,
    taskRef: spec.instruction_binding.task_ref,
    workflowClass: spec.instruction_binding.workflow_class,
    selection: spec.instruction_binding.selection || {},
    contextBindingRefs: spec.instruction_binding.context_binding_refs || [],
    requiredContextDigests: spec.instruction_binding.required_context_digests || [],
    executorProfileRef: spec.instruction_binding.executor_profile_ref,
    assemblyPolicyRef: spec.instruction_binding.assembly_policy_ref
  });
  assert.equal(evidence.derived_effective_instruction_digest, derived.digest);
  assert.equal(evidence.declared_digests_used_for_decisions, false);
  assert.equal(evidence.verified_source_count, CANONICAL_SOURCES.length);
  for (const binding of Object.values(evidence.fingerprints)) {
    assert.equal(binding.derived_digest, derived.digest);
  }
});

test('S7 the runtime ignores a declared current digest that does not match the derived one', async () => {
  // The declared current digest is caller input: the runtime binds the
  // DERIVED digest. The run therefore still completes (the qualification
  // snapshot matches the derived state), and the evidence records that the
  // declared value was not the one that was used.
  const spec = JSON.parse(fs.readFileSync(referenceSpecPath, 'utf8'));
  spec.run_id = 'run_s7_declared_digest_0001';
  spec.harness_context.run_ref = spec.run_id;
  for (const binding of Object.values(spec.intake_bindings || {})) {
    binding.work_unit_id = `wu_${spec.run_id}_root`;
  }
  const declared = `sha256:${'f'.repeat(64)}`;
  for (const fingerprint of Object.values(spec.fingerprints)) {
    fingerprint.components.effective_instruction_digest = declared;
  }
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

  const { summary, runDir } = await runRuntimeRun({ specPath, outDir: path.join(dir, 'run') });
  assert.equal(summary.status, 'COMPLETED');
  const evidence = JSON.parse(fs.readFileSync(path.join(runDir, 'instruction-binding.json'), 'utf8'));
  assert.notEqual(evidence.derived_effective_instruction_digest, declared);
  for (const binding of Object.values(evidence.fingerprints)) {
    assert.equal(binding.declared_digest, declared);
    assert.equal(binding.derived_digest, evidence.derived_effective_instruction_digest);
    assert.equal(binding.digest_matches, false);
  }
});

test('S7 a material instruction change blocks the run at the CLI level', async () => {
  // The runtime derives the digest from the live tree: a canonical
  // instruction source that changed invalidates the qualification, even
  // though the run spec still declares the old digest.
  const tree = makeRuntimeTree();
  const spec = JSON.parse(fs.readFileSync(referenceSpecPath, 'utf8'));
  spec.run_id = 'run_s7_tree_drift_0001';
  spec.harness_context.run_ref = spec.run_id;
  for (const binding of Object.values(spec.intake_bindings || {})) {
    binding.work_unit_id = `wu_${spec.run_id}_root`;
  }
  const dir = tmpDir();
  const specPath = path.join(dir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

  // Control: the untouched tree still runs the qualification.
  const control = await runRuntimeRun({ specPath, outDir: path.join(dir, 'run-control'), repoRoot: tree });
  assert.equal(control.summary.status, 'COMPLETED');

  // A material instruction change: the canonical governance source moved.
  fs.appendFileSync(path.join(tree, 'AGENTS.md'), '\n<!-- a material instruction change -->\n');
  const drifted = await runRuntimeRun({ specPath, outDir: path.join(dir, 'run-drift'), repoRoot: tree });
  assert.notEqual(drifted.summary.status, 'COMPLETED');
  assert.match(String(drifted.summary.blocking_reason), /NO_ELIGIBLE_EXECUTOR/);
});

test('S7 the committed reference spec qualification is bound to the instruction state in effect', () => {
  const spec = JSON.parse(fs.readFileSync(referenceSpecPath, 'utf8'));
  const derived = deriveInstructionBinding({
    root,
    bundleId: spec.instruction_binding.bundle_id,
    taskRef: spec.instruction_binding.task_ref,
    workflowClass: spec.instruction_binding.workflow_class,
    selection: spec.instruction_binding.selection || {},
    contextBindingRefs: spec.instruction_binding.context_binding_refs || [],
    requiredContextDigests: spec.instruction_binding.required_context_digests || [],
    executorProfileRef: spec.instruction_binding.executor_profile_ref,
    assemblyPolicyRef: spec.instruction_binding.assembly_policy_ref
  });

  for (const [fingerprintRef, fingerprint] of Object.entries(spec.qualified_fingerprints)) {
    assert.equal(
      fingerprint.components.effective_instruction_digest,
      derived.digest,
      `the qualification snapshot ${fingerprintRef} was earned under another instruction state; re-qualify it (node scripts/tools/requalify-run-spec.mjs --spec runtime/cli/specs/reference-audit-v1.json --write)`
    );
  }
});

test('S7 the fingerprint collection binding refuses a partially bindable collection', () => {
  const tree = makeInstructionTree();
  const derived = deriveInstructionBinding({ root: tree, ...ASSEMBLY });
  const broken = fingerprintWith(derived.digest);
  delete broken.components.effective_instruction_digest;

  assert.throws(
    () => bindFingerprintsToInstructionDigest({
      fingerprints: { exec_a: fingerprintWith(derived.digest), exec_b: broken },
      derivedDigest: derived.digest
    }),
    (error) => error?.code === 'INSTRUCTION_DIGEST_MISSING'
  );
});
