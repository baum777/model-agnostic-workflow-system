// S12 — model-adaptive executor profiles (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, section 11.5 + slice S12).
//
// The headline is the DoD equivalence invariant: two profiles of the SAME
// model must produce IDENTICAL authority and completion semantics even when
// their presentation differs, and a profile switch must never widen rights.
// The second headline is the fail-closed executor-profile resolution: the
// four S12 denial paths are typed, machine-readable and covered by the
// committed fixture. Every negative case ends in a typed FailClosedError or
// an explicit non-equivalence finding; there is no fallback anywhere in this
// suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProfileStore } from '../../runtime/harness-context/profiles/model-adaptive/profile-store.mjs';
import {
  MODEL_ADAPTIVE_PROFILE_CONTRACT,
  MATERIALITY_DECISION_CONTRACT,
  INVARIANT_SEMANTICS_DIMENSIONS,
  PINNED_SEMANTICS_DIMENSIONS,
  INSTRUCTION_DIGEST_DIMENSION,
  RUNTIME_CAPABILITY_VOCABULARY,
  AUTHORITY_EXECUTION_DIMENSIONS,
  COMPLETION_EXECUTION_DIMENSIONS,
  loadProviderCapabilityContract,
  loadProviderExports,
  resolveProviderCapability,
  semanticsDeviations,
  assertSemanticsPreserved,
  missingPinnedDimensions,
  assertPinnedDimensionsDeclared,
  pinnedDimensionMismatches,
  executionProfileMismatches,
  requiredRuntimeCapabilities,
  assertRuntimeRequirementsDeclared,
  harnessCapabilityIssues,
  assertHarnessCapabilities,
  instructionDigestDecision,
  assertInstructionDigestCurrent,
  assertQualificationCoverage,
  presentationCapabilityIssues,
  resolveModelAdaptiveProfile,
  compareProfileEquivalence,
  assertProfileEquivalence,
  assertNoAuthorityWidening,
  assertProfileRequalification,
  assertProfileQualified
} from '../../runtime/harness-context/profiles/model-adaptive/profile-resolver.mjs';
import {
  EXECUTOR_PROFILE_DENIAL_CODES,
  EXECUTOR_PROFILE_CODES,
  resolveExecutorProfile,
  explainExecutorProfileDenial,
  executorProfileDiagnostics,
  profileFingerprint
} from '../../runtime/harness-context/profiles/model-adaptive/executor-profile.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { validateExecutorModelProfiles } from '../../scripts/tools/validate-executor-model-profile.mjs';
import { assembleInstructionBundle } from '../../runtime/context/instruction-bundle-assembler.mjs';
import { FailClosedError, canonicalJson, sha256Hex } from '../../runtime/vnext/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const store = loadProfileStore({ root });

const FIXTURE_PATH = 'evals/fixtures/maws-vnext/executor-model-profile.contracts.json';
const QUALIFICATION_FINGERPRINT_CONTRACT = 'core/contracts/qualification-fingerprint.schema.json';
const PINNED_DIGEST = 'sha256:2d68db2a6cf7dff3670bf68eb1ff7b36f9be71df0c984f74a8fde41fca941675';
const HARNESS = 'development_harness/in_process_fixture/1';

function expectFailClosed(code, fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof FailClosedError, `expected FailClosedError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected FailClosedError ${code}, but nothing was thrown`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function profileById(profileId, version) {
  const found = store.profiles.find((profile) => profile.profile_id === profileId
    && (version === undefined || profile.profile_version === version));
  assert.ok(found, `committed profile ${profileId}${version ? `@${version}` : ''} must exist`);
  return found;
}

// A qualified clone of a committed profile: the committed records stay
// PROPOSED (no representative eval is recorded yet), so the binding path is
// exercised with an explicitly qualified profile.
function qualifiedProfile(profileId, version) {
  const profile = clone(profileById(profileId, version));
  profile.qualification = {
    state: 'QUALIFIED',
    evidence_refs: ['eval:model-adaptive/fixture/openai-codex/gpt-5-codex'],
    eval_profile_ref: 'evalprofile_model_adaptive_v1',
    qualified_at: '2026-10-20T00:00:00Z'
  };
  return profile;
}

// The qualification-side state in force for the fixture model/provider pair.
// The qualification fingerprint is S7-shaped: it carries the effective
// instruction digest the qualification was earned under, and its digest is
// the canonical sha256 over the canonical JSON of its components.
function inForceState({ modelId = 'gpt-5-codex', providerId = 'openai-codex', digest = PINNED_DIGEST } = {}) {
  const components = {
    model_id: modelId,
    provider_id: providerId,
    runtime_harness: HARNESS,
    tool_contract_refs: ['core/contracts/tool-contracts/catalog.json'],
    api_surface_version: '2026-10',
    qualification_profile_ref: 'qualprofile_model_adaptive_v1',
    effective_instruction_digest: PINNED_DIGEST
  };
  return {
    execution_profile: store.executionProfiles.profile_readonly_v1,
    qualification: {
      qualification_id: 'qual_s12_test_0001',
      executor_id: 'exec_openai_codex',
      capability_id: 'cap_repository_analysis',
      execution_profile_ref: 'profile_readonly_v1',
      state: 'QUALIFIED',
      evidence_refs: ['evidence/qualification/s12-test-0001.json'],
      fingerprint_ref: 'fp_s12_test_0001',
      decided_at: '2026-10-20T00:00:00Z'
    },
    fingerprint: {
      fingerprint_id: 'fp_s12_test_0001',
      executor_id: 'exec_openai_codex',
      capability_id: 'cap_repository_analysis',
      execution_profile_ref: 'profile_readonly_v1',
      components,
      digest: sha256Hex(canonicalJson(components))
    },
    effective_instruction_digest: digest
  };
}

const BROADER_EXECUTION_PROFILE = {
  profile_id: 'profile_broader_v1',
  description: 'Broader execution profile used only as a negative fixture in this suite.',
  dimensions: {
    tools: 'write',
    effects: 'workspace',
    context: 'session_full',
    network: 'allowlisted',
    delegation: 1,
    verification: 'verified'
  }
};

// --- contract shape ---------------------------------------------------------

test('the canonical contract exists, is versioned, and exposes only the six optimizable presentation dimensions', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, MODEL_ADAPTIVE_PROFILE_CONTRACT), 'utf8'));
  assert.equal(contract.$id, MODEL_ADAPTIVE_PROFILE_CONTRACT);
  assert.equal(contract.properties.schema_version.const, '1.0.0');
  assert.deepEqual(
    Object.keys(contract.properties.presentation.properties),
    [
      'instruction_density',
      'example_selection',
      'output_formatting',
      'context_packaging',
      'tool_call_interface_requirements',
      'retry_strategy'
    ]
  );
  // The profile binds executor, provider, model and a profile version.
  for (const field of ['executor_id', 'provider_id', 'model_id', 'profile_version', 'execution_profile_ref']) {
    assert.ok(contract.properties[field], `the contract must bind ${field}`);
  }
  // A profile grants no authority.
  assert.equal(contract.properties.authority_grant.const, 'none');
});

test('the invariant semantics block is structurally impossible to widen (all six dimensions are const "unchanged")', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, MODEL_ADAPTIVE_PROFILE_CONTRACT), 'utf8'));
  const block = contract.properties.semantics_preservation;
  for (const dimension of INVARIANT_SEMANTICS_DIMENSIONS) {
    assert.equal(block.properties[dimension].const, 'unchanged', `${dimension} must be const "unchanged"`);
  }
  for (const dimension of INVARIANT_SEMANTICS_DIMENSIONS) {
    assert.ok(block.required.includes(dimension), `${dimension} must be required`);
  }
  assert.equal(block.additionalProperties, false);
});

test('the semantics_preservation block pins the qualification-relevant dimensions of the execution profile in force', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, MODEL_ADAPTIVE_PROFILE_CONTRACT), 'utf8'));
  const pinned = contract.properties.semantics_preservation.properties.pinned_dimensions;
  assert.ok(pinned, 'the contract must require a pinned_dimensions block');
  assert.equal(pinned.additionalProperties, false);
  for (const dimension of [...PINNED_SEMANTICS_DIMENSIONS, INSTRUCTION_DIGEST_DIMENSION]) {
    assert.ok(pinned.required.includes(dimension), `${dimension} must be required`);
    assert.ok(pinned.properties[dimension], `${dimension} must be declared`);
  }
  assert.equal(pinned.properties.effective_instruction_digest.pattern, '^sha256:[a-f0-9]{64}$');
  // The pins are required on the profile, not optional.
  assert.ok(contract.properties.semantics_preservation.required.includes('pinned_dimensions'));
});

test('the model-adaptive contract never introduces a writable execution-profile dimension', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, MODEL_ADAPTIVE_PROFILE_CONTRACT), 'utf8'));
  // Collect every property name the contract declares. A model-adaptive
  // profile must not expose a writable execution-profile dimension; the
  // execution profile keeps sole ownership of them.
  const propertyNames = new Set();
  const collect = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const entry of node) collect(entry);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' && value && typeof value === 'object') {
        for (const name of Object.keys(value)) propertyNames.add(name);
      }
      collect(value);
    }
  };
  collect(contract);
  for (const dimension of ['tools', 'effects', 'context', 'network', 'delegation', 'verification']) {
    assert.ok(
      !propertyNames.has(dimension),
      `the model-adaptive contract must not expose the execution-profile dimension "${dimension}"`
    );
  }
  // The execution profile contract keeps exactly its six qualification dimensions.
  const executionProfile = JSON.parse(fs.readFileSync(path.join(root, 'core/contracts/execution-profile.schema.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(executionProfile.properties.dimensions.properties).sort(),
    ['context', 'delegation', 'effects', 'network', 'tools', 'verification']
  );
});

test('the runtime capability vocabulary is closed and required on every profile', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, MODEL_ADAPTIVE_PROFILE_CONTRACT), 'utf8'));
  const requirements = contract.properties.runtime_requirements;
  assert.ok(contract.required.includes('runtime_requirements'));
  assert.equal(requirements.minItems, 1);
  assert.equal(requirements.uniqueItems, true);
  assert.deepEqual(requirements.items.enum, [...RUNTIME_CAPABILITY_VOCABULARY]);
});

test('the committed store loads and every committed profile is contract-valid, semantics-preserving and fully pinned', () => {
  assert.ok(store.profiles.length >= 5, 'the store must carry committed profiles');
  for (const profile of store.profiles) {
    assert.deepEqual(
      validateInstanceAgainstContract(profile, MODEL_ADAPTIVE_PROFILE_CONTRACT, root),
      [],
      `${profile.profile_id}@${profile.profile_version} must be contract-valid`
    );
    assert.deepEqual(semanticsDeviations(profile), []);
    assert.deepEqual(missingPinnedDimensions(profile), []);
    assert.deepEqual(
      [...profile.runtime_requirements].sort(),
      requiredRuntimeCapabilities(profile),
      `${profile.profile_id}@${profile.profile_version} must declare the capabilities its presentation requires`
    );
  }
});

// --- R1: deterministic resolution -------------------------------------------

test('R1 resolution by (executor, provider, model) is deterministic and returns the newest profile version', () => {
  const resolved = resolveModelAdaptiveProfile({
    executorId: 'exec_openai_codex',
    providerId: 'openai-codex',
    modelId: 'gpt-5-codex',
    store
  });
  assert.equal(resolved.profile_id, 'emp_openai_codex_gpt5_codex');
  assert.equal(resolved.profile_version, '1.1.0');
  const explicit = resolveModelAdaptiveProfile({
    executorId: 'exec_openai_codex',
    providerId: 'openai-codex',
    modelId: 'gpt-5-codex',
    profileVersion: '1.0.0',
    store
  });
  assert.equal(explicit.profile_version, '1.0.0');
});

test('R1 a provider alias resolves to the canonical provider binding', () => {
  const resolved = resolveModelAdaptiveProfile({
    executorId: 'exec_openai_codex',
    providerId: 'codex',
    modelId: 'gpt-5-codex',
    store
  });
  assert.equal(resolved.provider_id, 'openai-codex');
});

test('R1 an unknown provider fails closed as MODEL_PROFILE_PROVIDER_UNKNOWN', () => {
  expectFailClosed('MODEL_PROFILE_PROVIDER_UNKNOWN', () => resolveModelAdaptiveProfile({
    executorId: 'exec_openai_codex',
    providerId: 'not-a-provider',
    modelId: 'gpt-5-codex',
    store
  }));
});

test('R1 an unknown model or executor fails closed as MODEL_PROFILE_NOT_FOUND', () => {
  expectFailClosed('MODEL_PROFILE_NOT_FOUND', () => resolveModelAdaptiveProfile({
    executorId: 'exec_openai_codex',
    providerId: 'openai-codex',
    modelId: 'gpt-9-imaginary',
    store
  }));
  expectFailClosed('MODEL_PROFILE_NOT_FOUND', () => resolveModelAdaptiveProfile({
    executorId: 'exec_unknown_executor',
    providerId: 'openai-codex',
    modelId: 'gpt-5-codex',
    store
  }));
  expectFailClosed('MODEL_PROFILE_NOT_FOUND', () => resolveModelAdaptiveProfile({
    executorId: 'exec_openai_codex',
    providerId: 'openai-codex',
    modelId: 'gpt-5-codex',
    profileVersion: '9.9.9',
    store
  }));
});

test('R1 an unknown model on a known provider fails closed (no silent fallback profile)', () => {
  expectFailClosed('MODEL_PROFILE_NOT_FOUND', () => resolveModelAdaptiveProfile({
    executorId: 'exec_minimax',
    providerId: 'minimax',
    modelId: 'minimax-speech-99',
    store
  }));
});

// --- R2: the immutability assertion -----------------------------------------

test('R2 a profile that declares a changed invariant dimension is rejected', () => {
  const widened = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  widened.semantics_preservation.authority_ceiling = 'widened';
  const error = expectFailClosed('MODEL_PROFILE_SEMANTICS_WIDENED', () => assertSemanticsPreserved(widened));
  assert.deepEqual(error.details.deviations, ['authority_ceiling']);
  assert.deepEqual(semanticsDeviations(widened), ['authority_ceiling']);
});

test('R2 the resolver rejects an injected profile whose semantics_preservation deviates', () => {
  const widened = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  widened.semantics_preservation.tool_rights = 'expanded';
  const injected = {
    ...store,
    profiles: [...store.profiles.filter((profile) => profile.profile_id !== 'emp_openai_codex_gpt5_codex'), widened]
  };
  expectFailClosed('MODEL_PROFILE_SEMANTICS_WIDENED', () => resolveModelAdaptiveProfile({
    executorId: 'exec_openai_codex',
    providerId: 'openai-codex',
    modelId: 'gpt-5-codex',
    profileVersion: '1.0.0',
    store: injected
  }));
});

test('R2 a missing invariant dimension is a deviation, not an implicit unchanged', () => {
  const incomplete = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  delete incomplete.semantics_preservation.security_controls;
  assert.deepEqual(semanticsDeviations(incomplete), ['security_controls']);
  expectFailClosed('MODEL_PROFILE_SEMANTICS_WIDENED', () => assertSemanticsPreserved(incomplete));
});

test('R2 the schema rejects a widened invariant dimension as well (defense in depth)', () => {
  const widened = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  widened.semantics_preservation.completion_criteria = 'relaxed';
  const issues = validateInstanceAgainstContract(widened, MODEL_ADAPTIVE_PROFILE_CONTRACT, root);
  assert.ok(issues.length > 0, 'the schema must reject a widened invariant dimension');
});

// --- R2: no silent widening of the pinned dimensions ------------------------

test('R2 a profile that does not pin the qualification-relevant dimensions is refused', () => {
  const unpinned = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  delete unpinned.semantics_preservation.pinned_dimensions.tool_contract_refs;
  assert.deepEqual(missingPinnedDimensions(unpinned), ['tool_contract_refs']);
  const error = expectFailClosed('MODEL_PROFILE_SEMANTICS_WIDENED', () => assertPinnedDimensionsDeclared(unpinned));
  assert.deepEqual(error.details.missing, ['tool_contract_refs']);
  // The schema refuses the same profile: a missing pin cannot be expressed.
  const issues = validateInstanceAgainstContract(unpinned, MODEL_ADAPTIVE_PROFILE_CONTRACT, root);
  assert.ok(issues.length > 0, 'the schema must reject a profile without the pinned dimensions');
});

test('R2 a profile that pins a wider tool-contract set than the profile in force is a widening', () => {
  const widened = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  widened.semantics_preservation.pinned_dimensions.tool_contract_refs = [
    'core/contracts/tool-contracts/catalog.json',
    'core/contracts/permission-boundary.json'
  ];
  const mismatches = pinnedDimensionMismatches({ profile: widened, inForce: inForceState() });
  assert.ok(mismatches.tool_contract_refs, 'the widened tool-contract set must be detected');
  assert.deepEqual(mismatches.tool_contract_refs.declared, widened.semantics_preservation.pinned_dimensions.tool_contract_refs);
  assert.deepEqual(mismatches.tool_contract_refs.in_force, ['core/contracts/tool-contracts/catalog.json']);
});

test('R2 a profile that pins a different api surface version or qualification profile is a widening', () => {
  const drifted = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  drifted.semantics_preservation.pinned_dimensions.api_surface_version = '2026-11';
  drifted.semantics_preservation.pinned_dimensions.qualification_profile_ref = 'qualprofile_other';
  const mismatches = pinnedDimensionMismatches({ profile: drifted, inForce: inForceState() });
  assert.deepEqual(Object.keys(mismatches).sort(), ['api_surface_version', 'qualification_profile_ref']);
});

test('R2 a profile bound to a different execution profile than the one in force is a widening', () => {
  const widened = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  widened.execution_profile_ref = 'profile_broader_v1';
  const mismatches = executionProfileMismatches({
    profile: widened,
    inForce: inForceState(),
    executionProfiles: { ...store.executionProfiles, profile_broader_v1: BROADER_EXECUTION_PROFILE }
  });
  assert.ok(mismatches.execution_profile_ref, 'the execution profile reference must be detected');
  assert.ok(mismatches.tools, 'the widened tools dimension must be detected');
  assert.equal(mismatches.tools.declared, 'write');
  assert.equal(mismatches.tools.in_force, 'read');
});

// --- R3: the DoD equivalence invariant --------------------------------------

test('R3 DoD: two profiles of the same model with different presentation produce equivalent authority and completion semantics', () => {
  const left = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const right = profileById('emp_openai_codex_gpt5_codex', '1.1.0');
  // The presentation really is different.
  assert.notEqual(left.presentation.instruction_density.level, right.presentation.instruction_density.level);
  assert.notEqual(left.presentation.example_selection.mode, right.presentation.example_selection.mode);
  assert.notEqual(left.presentation.context_packaging.unit, right.presentation.context_packaging.unit);
  assert.notEqual(left.presentation.retry_strategy.max_attempts, right.presentation.retry_strategy.max_attempts);

  const comparison = compareProfileEquivalence({ left, right, executionProfiles: store.executionProfiles });
  assert.equal(comparison.equivalent, true, comparison.findings.join('; '));
  assert.equal(comparison.authority_equivalent, true);
  assert.equal(comparison.completion_equivalent, true);
  assert.equal(comparison.same_model, true);
  assert.deepEqual(comparison.findings, []);
  assert.equal(assertProfileEquivalence({ left, right, executionProfiles: store.executionProfiles }).equivalent, true);
});

test('R3 the equivalence check compares all six execution-profile dimensions', () => {
  const left = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const right = profileById('emp_openai_codex_gpt5_codex', '1.1.0');
  const comparison = compareProfileEquivalence({ left, right, executionProfiles: store.executionProfiles });
  assert.deepEqual(
    Object.keys(comparison.per_dimension).sort(),
    ['context', 'delegation', 'effects', 'network', 'tools', 'verification']
  );
  for (const dimension of AUTHORITY_EXECUTION_DIMENSIONS) {
    assert.equal(comparison.per_dimension[dimension].class, 'authority');
  }
  for (const dimension of COMPLETION_EXECUTION_DIMENSIONS) {
    assert.equal(comparison.per_dimension[dimension].class, 'completion');
  }
});

test('R3 a profile bound to a different execution profile is NOT equivalent and the gate fails closed', () => {
  const left = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const right = clone(profileById('emp_openai_codex_gpt5_codex', '1.1.0'));
  right.execution_profile_ref = 'profile_broader_v1';
  const comparison = compareProfileEquivalence({
    left,
    right,
    executionProfiles: { ...store.executionProfiles, profile_broader_v1: BROADER_EXECUTION_PROFILE }
  });
  assert.equal(comparison.equivalent, false);
  assert.equal(comparison.authority_equivalent, false);
  assert.ok(comparison.findings.some((finding) => finding.includes('execution-profile dimension tools differs')));
  expectFailClosed('MODEL_PROFILE_NOT_EQUIVALENT', () => assertProfileEquivalence({
    left,
    right,
    executionProfiles: { ...store.executionProfiles, profile_broader_v1: BROADER_EXECUTION_PROFILE }
  }));
});

test('R3 a profile whose semantics deviates is reported as non-equivalent by the equivalence check', () => {
  const left = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  const right = profileById('emp_openai_codex_gpt5_codex', '1.1.0');
  left.semantics_preservation.authority_ceiling = 'widened';
  const comparison = compareProfileEquivalence({ left, right, executionProfiles: store.executionProfiles });
  assert.equal(comparison.equivalent, false);
  assert.ok(comparison.findings.some((finding) => finding.includes('left profile deviates from "unchanged" on authority_ceiling')));
});

test('R3 an unanchored comparison can never be equivalent', () => {
  const left = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const right = profileById('emp_openai_codex_gpt5_codex', '1.1.0');
  const comparison = compareProfileEquivalence({ left, right, executionProfiles: {} });
  assert.equal(comparison.equivalent, false);
  assert.ok(comparison.findings.some((finding) => finding.includes('not available for comparison')));
});

// --- R4: a profile switch never widens authority -----------------------------

test('R4 a profile switch that widens an authority dimension fails closed as MODEL_PROFILE_AUTHORITY_WIDENED', () => {
  const left = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const right = clone(profileById('emp_openai_codex_gpt5_codex', '1.1.0'));
  right.execution_profile_ref = 'profile_broader_v1';
  const error = expectFailClosed('MODEL_PROFILE_AUTHORITY_WIDENED', () => assertNoAuthorityWidening({
    left,
    right,
    executionProfiles: { ...store.executionProfiles, profile_broader_v1: BROADER_EXECUTION_PROFILE }
  }));
  assert.ok(error.details.widened.length >= 1);
});

test('R4 a presentation-only switch does not widen authority', () => {
  const left = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const right = profileById('emp_openai_codex_gpt5_codex', '1.1.0');
  assert.deepEqual(assertNoAuthorityWidening({ left, right, executionProfiles: store.executionProfiles }).widened, []);
});

test('R4 a stronger model earns no wider rights: the switch check is independent of the model identity', () => {
  const left = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const stronger = clone(profileById('emp_minimax_text', '1.0.0'));
  stronger.execution_profile_ref = 'profile_broader_v1';
  expectFailClosed('MODEL_PROFILE_AUTHORITY_WIDENED', () => assertNoAuthorityWidening({
    left,
    right: stronger,
    executionProfiles: { ...store.executionProfiles, profile_broader_v1: BROADER_EXECUTION_PROFILE }
  }));
});

// --- R5: requalification on model change / material drift -------------------

function fingerprint({ providerId, modelId, harness = HARNESS }) {
  const components = {
    model_id: modelId,
    provider_id: providerId,
    runtime_harness: harness,
    tool_contract_refs: ['core/contracts/tool-contracts/catalog.json'],
    api_surface_version: '2026-10',
    qualification_profile_ref: 'qualprofile_model_adaptive_v1',
    effective_instruction_digest: PINNED_DIGEST
  };
  return {
    fingerprint_id: `fp_${providerId}_${modelId}`.replace(/[^a-z0-9_]/g, '_'),
    executor_id: 'exec_openai_codex',
    capability_id: 'cap_repository_analysis',
    execution_profile_ref: 'profile_readonly_v1',
    components,
    digest: sha256Hex(canonicalJson(components))
  };
}

test('R5 a model change requires requalification instead of inheriting the previous qualification', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  expectFailClosed('MODEL_PROFILE_REQUALIFICATION_REQUIRED', () => assertProfileRequalification({
    profile,
    qualifiedFingerprint: fingerprint({ providerId: 'openai-codex', modelId: 'gpt-5-codex' }),
    currentFingerprint: fingerprint({ providerId: 'openai-codex', modelId: 'gpt-5.1-codex' })
  }));
});

test('R5 a material fingerprint drift blocks the profile until requalified', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const qualified = fingerprint({ providerId: 'openai-codex', modelId: 'gpt-5-codex' });
  const current = clone(qualified);
  current.components.api_surface_version = '2026-11';
  current.digest = sha256Hex(canonicalJson(current.components));
  expectFailClosed('MODEL_PROFILE_REQUALIFICATION_REQUIRED', () => assertProfileRequalification({
    profile,
    qualifiedFingerprint: qualified,
    currentFingerprint: current
  }));
});

test('R5 a non-material drift keeps the profile routable and an unproven drift is unknown, never inherited', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const qualified = fingerprint({ providerId: 'openai-codex', modelId: 'gpt-5-codex' });
  const current = clone(qualified);
  assert.equal(assertProfileRequalification({ profile, qualifiedFingerprint: qualified, currentFingerprint: current }).overall_class, 'NON_MATERIAL');
  expectFailClosed('MODEL_PROFILE_REQUALIFICATION_UNKNOWN', () => assertProfileRequalification({
    profile,
    qualifiedFingerprint: qualified,
    currentFingerprint: null
  }));
});

// --- R6: provider binding and capability coherence ---------------------------

test('R6 every canonical provider of the capability contract has a committed model-adaptive profile', () => {
  const capabilities = loadProviderCapabilityContract(root);
  const covered = new Set(store.profiles.map((profile) => profile.provider_id));
  for (const provider of capabilities.providers) {
    assert.ok(covered.has(provider.name), `canonical provider ${provider.name} needs a committed model-adaptive profile`);
  }
});

test('R6 the derived provider exports agree with the canonical capability contract', () => {
  const capabilities = loadProviderCapabilityContract(root);
  const exports = loadProviderExports(root);
  for (const provider of capabilities.providers) {
    const resolved = resolveProviderCapability({
      providerCapabilities: capabilities,
      providerExports: exports,
      providerId: provider.name
    });
    assert.equal(resolved.name, provider.name);
    assert.equal(resolved.export_record.canonicalProvider, provider.name);
  }
});

test('R6 a derived export that disagrees with the canonical contract fails closed as projection drift', () => {
  const capabilities = loadProviderCapabilityContract(root);
  const exports = loadProviderExports(root);
  exports['openai-codex'] = {
    ...exports['openai-codex'],
    capabilityProfile: { ...exports['openai-codex'].capabilityProfile, structuredOutputs: 'unsupported' }
  };
  expectFailClosed('MODEL_PROFILE_PROVIDER_PROJECTION_DRIFT', () => resolveProviderCapability({
    providerCapabilities: capabilities,
    providerExports: exports,
    providerId: 'openai-codex'
  }));
});

test('R6 a missing derived export fails closed instead of falling back to the canonical contract alone', () => {
  const capabilities = loadProviderCapabilityContract(root);
  expectFailClosed('MODEL_PROFILE_PROVIDER_PROJECTION_MISSING', () => resolveProviderCapability({
    providerCapabilities: capabilities,
    providerExports: {},
    providerId: 'openai-codex'
  }));
});

test('R6 a presentation that is not realizable under the provider capability state is refused', () => {
  const capabilities = loadProviderCapabilityContract(root);
  const anthropic = capabilities.providers.find((provider) => provider.name === 'anthropic-claude');
  const profile = clone(profileById('emp_anthropic_claude_sonnet', '1.0.0'));
  profile.presentation.output_formatting.structured_output = 'native_schema';
  const issues = presentationCapabilityIssues(profile, anthropic);
  assert.ok(issues.some((issue) => issue.includes('structuredOutputs=adapter')), issues.join('; '));
  expectFailClosed('MODEL_PROFILE_CAPABILITY_INCOHERENT', () => resolveModelAdaptiveProfile({
    executorId: 'exec_anthropic_claude',
    providerId: 'anthropic-claude',
    modelId: 'claude-sonnet-4-5',
    store: { ...store, profiles: [profile] }
  }));
});

test('R6 a profile is a qualification input, never a qualification: PROPOSED profiles are not bindable', () => {
  const proposed = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  assert.equal(proposed.qualification.state, 'PROPOSED');
  expectFailClosed('MODEL_PROFILE_NOT_QUALIFIED', () => assertProfileQualified(proposed));
  const qualified = clone(proposed);
  qualified.qualification = {
    state: 'QUALIFIED',
    evidence_refs: ['eval:model-adaptive/openai-codex/gpt-5-codex'],
    eval_profile_ref: 'evalprofile_model_adaptive_v1',
    qualified_at: '2026-10-20T00:00:00Z'
  };
  assertProfileQualified(qualified);
  const unevidenced = clone(qualified);
  unevidenced.qualification.evidence_refs = [];
  expectFailClosed('MODEL_PROFILE_NOT_QUALIFIED', () => assertProfileQualified(unevidenced));
});

// --- R7: harness runtime capabilities ----------------------------------------

test('R7 the required runtime capabilities are derived from the presentation, not declared by hand', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  assert.deepEqual(requiredRuntimeCapabilities(profile), ['structured_output', 'tool_calls']);
  const plain = clone(profile);
  plain.presentation.tool_call_interface_requirements.call_style = 'none';
  plain.presentation.output_formatting.structured_output = 'none';
  assert.deepEqual(requiredRuntimeCapabilities(plain), []);
});

test('R7 an under-declared runtime_requirements is refused (a missing capability can never be hidden)', () => {
  const underDeclared = clone(profileById('emp_openai_codex_gpt5_codex', '1.0.0'));
  underDeclared.runtime_requirements = ['tool_calls'];
  const error = expectFailClosed('MODEL_PROFILE_RUNTIME_REQUIREMENTS_INCOHERENT', () => assertRuntimeRequirementsDeclared(underDeclared));
  assert.deepEqual(error.details.derived, ['structured_output', 'tool_calls']);
});

test('R7 a harness that does not declare the required capability fails closed', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const issues = harnessCapabilityIssues({
    profile,
    harness: 'development_harness/plan_only/1',
    harnessCapabilities: store.harnessCapabilities
  });
  assert.ok(issues.length >= 1);
  expectFailClosed('MODEL_PROFILE_HARNESS_CAPABILITY_MISSING', () => assertHarnessCapabilities({
    profile,
    harness: 'development_harness/plan_only/1',
    harnessCapabilities: store.harnessCapabilities
  }));
});

test('R7 an undeclared harness declares nothing and is refused (never an assumed capability)', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  expectFailClosed('MODEL_PROFILE_HARNESS_CAPABILITY_MISSING', () => assertHarnessCapabilities({
    profile,
    harness: 'development_harness/unknown/9',
    harnessCapabilities: store.harnessCapabilities
  }));
});

// --- R8: the effective instruction digest ------------------------------------

test('R8 an unchanged effective instruction digest keeps the profile routable', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const qualifiedFingerprint = inForceState().fingerprint;
  const decision = instructionDigestDecision({ profile, currentDigest: PINNED_DIGEST, qualifiedFingerprint });
  assert.equal(decision.overall_class, 'NON_MATERIAL');
  assert.deepEqual(decision.deltas, []);
  assertProfileRequalificationOrPass(assertInstructionDigestCurrent({
    profile,
    currentDigest: PINNED_DIGEST,
    qualifiedFingerprint
  }));
});

test('R8 a changed effective instruction digest blocks the profile with the canonical materiality vocabulary', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const drifted = 'sha256:3333333333333333333333333333333333333333333333333333333333333333';
  const error = expectFailClosed('MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT', () => assertInstructionDigestCurrent({
    profile,
    currentDigest: drifted,
    qualifiedFingerprint: inForceState().fingerprint
  }));
  assert.equal(error.details.overall_class, 'MATERIAL');
  assert.equal(error.details.deltas.length, 1);
  assert.equal(error.details.deltas[0].component, 'effective_instruction_digest');
  assert.equal(error.details.deltas[0].classification, 'MATERIAL');
  // The decision uses the canonical MaterialityDecision contract, not a
  // parallel shape.
  assert.deepEqual(
    validateInstanceAgainstContract(error.details, MATERIALITY_DECISION_CONTRACT, root),
    []
  );
});

test('R8 an unknown instruction digest is UNKNOWN, never assumed to be unchanged', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const error = expectFailClosed('MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT', () => assertInstructionDigestCurrent({
    profile,
    currentDigest: null
  }));
  assert.equal(error.details.overall_class, 'UNKNOWN');
  assert.deepEqual(
    validateInstanceAgainstContract(error.details, MATERIALITY_DECISION_CONTRACT, root),
    []
  );
});

test('S7 the qualification fingerprint must state the effective instruction digest it was earned under', () => {
  // S7 made the effective instruction digest a REQUIRED component of the
  // qualification fingerprint (core/contracts/qualification-fingerprint.schema.json):
  // the fingerprint states the instruction bundle the qualification was
  // earned under. A fingerprint without it states nothing, so the reuse is
  // unproven (UNKNOWN) and blocks the binding.
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const legacy = inForceState();
  delete legacy.fingerprint.components.effective_instruction_digest;
  const error = expectFailClosed('MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT', () => assertInstructionDigestCurrent({
    profile,
    currentDigest: PINNED_DIGEST,
    qualifiedFingerprint: legacy.fingerprint
  }));
  assert.equal(error.details.overall_class, 'UNKNOWN');
  assert.equal(error.details.deltas.length, 1);
  assert.equal(error.details.deltas[0].component, 'effective_instruction_digest');
  assert.equal(error.details.deltas[0].classification, 'UNKNOWN');
  assert.deepEqual(
    validateInstanceAgainstContract(error.details, MATERIALITY_DECISION_CONTRACT, root),
    []
  );
});

test('S7 a fingerprint whose digest differs from the pinned digest leaves the reuse unproven', () => {
  const profile = profileById('emp_openai_codex_gpt5_codex', '1.0.0');
  const divergent = inForceState();
  divergent.fingerprint.components.effective_instruction_digest =
    'sha256:4444444444444444444444444444444444444444444444444444444444444444';
  divergent.fingerprint.digest = sha256Hex(canonicalJson(divergent.fingerprint.components));
  const error = expectFailClosed('MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT', () => assertInstructionDigestCurrent({
    profile,
    currentDigest: PINNED_DIGEST,
    qualifiedFingerprint: divergent.fingerprint
  }));
  assert.equal(error.details.overall_class, 'UNKNOWN');
});

test('S7 the in-force qualification fingerprint satisfies the canonical S7 fingerprint contract', () => {
  const fingerprint = inForceState().fingerprint;
  assert.deepEqual(
    validateInstanceAgainstContract(fingerprint, QUALIFICATION_FINGERPRINT_CONTRACT, root),
    []
  );
  // The digest is the canonical sha256 over the canonical JSON of the
  // components, exactly as runtime/qualification/fingerprint.mjs computes it.
  assert.equal(fingerprint.digest, sha256Hex(canonicalJson(fingerprint.components)));
});

test('S7 the executor profile resolution refuses a fingerprint without the instruction digest', () => {
  const inForce = inForceState();
  delete inForce.fingerprint.components.effective_instruction_digest;
  expectFailClosed('MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce
  }));
});

function assertProfileRequalificationOrPass(profile) {
  assert.equal(profile.profile_id, 'emp_openai_codex_gpt5_codex');
}

// --- qualification coverage --------------------------------------------------

test('the model/provider pair must be covered by a QUALIFIED qualification', () => {
  const qualification = inForceState().qualification;
  const fingerprint = inForceState().fingerprint;
  assert.ok(assertQualificationCoverage({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    qualification,
    fingerprint
  }).qualification);

  expectFailClosed('MODEL_PROFILE_QUALIFICATION_UNCOVERED', () => assertQualificationCoverage({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    qualification: { ...qualification, state: 'DECLARED' },
    fingerprint
  }));
  expectFailClosed('MODEL_PROFILE_QUALIFICATION_UNCOVERED', () => assertQualificationCoverage({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    qualification: { ...qualification, evidence_refs: [] },
    fingerprint
  }));
  expectFailClosed('MODEL_PROFILE_QUALIFICATION_UNCOVERED', () => assertQualificationCoverage({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    qualification,
    fingerprint: null
  }));
});

test('a qualification for another model does not cover the requested pair', () => {
  const error = expectFailClosed('MODEL_PROFILE_QUALIFICATION_UNCOVERED', () => assertQualificationCoverage({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    qualification: inForceState().qualification,
    fingerprint: inForceState({ modelId: 'gpt-5.1-codex' }).fingerprint
  }));
  assert.equal(error.details.qualified.model_id, 'gpt-5.1-codex');
});

// --- the executor-profile resolution ----------------------------------------

test('the executor profile resolves for a qualified profile and returns the deterministic binding', () => {
  const resolved = resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState()
  });
  assert.equal(resolved.profile_id, 'emp_openai_codex_gpt5_codex');
  assert.equal(resolved.profile_version, '1.0.0');
  assert.equal(resolved.provider_id, 'openai-codex');
  assert.equal(resolved.model_id, 'gpt-5-codex');
  assert.equal(resolved.execution_profile_ref, 'profile_readonly_v1');
  assert.deepEqual(resolved.runtime_requirements, ['structured_output', 'tool_calls']);
  assert.equal(resolved.in_force.qualification_ref, 'qual_s12_test_0001');
  assert.equal(resolved.in_force.fingerprint_ref, 'fp_s12_test_0001');
});

test('the executor profile resolution is deterministic (same input, same output)', () => {
  const input = {
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.1.0'),
    store,
    inForce: inForceState()
  };
  const first = resolveExecutorProfile(input);
  const second = resolveExecutorProfile(input);
  assert.deepEqual(first, second);
  assert.equal(profileFingerprint(input.declaredProfile), profileFingerprint(input.declaredProfile));
});

test('a profile that binds another model or provider fails closed as MODEL_PROFILE_BINDING_MISMATCH', () => {
  expectFailClosed('MODEL_PROFILE_BINDING_MISMATCH', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex-preview',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState()
  }));
  expectFailClosed('MODEL_PROFILE_BINDING_MISMATCH', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'minimax',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState()
  }));
});

test('an unqualified profile is not bindable (a profile is a qualification input, never a qualification)', () => {
  expectFailClosed('MODEL_PROFILE_NOT_QUALIFIED', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: profileById('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState()
  }));
});

test('the executor profile resolution denies with the typed code of the violated rule', () => {
  const widened = qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0');
  widened.semantics_preservation.pinned_dimensions.tool_contract_refs = [
    'core/contracts/tool-contracts/catalog.json',
    'core/contracts/permission-boundary.json'
  ];
  expectFailClosed('MODEL_PROFILE_SEMANTICS_WIDENED', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: widened,
    store,
    inForce: inForceState()
  }));

  expectFailClosed('MODEL_PROFILE_QUALIFICATION_UNCOVERED', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState({ modelId: 'gpt-5.1-codex' })
  }));

  expectFailClosed('MODEL_PROFILE_HARNESS_CAPABILITY_MISSING', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: 'development_harness/plan_only/1',
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState()
  }));

  expectFailClosed('MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT', () => resolveExecutorProfile({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState({ digest: 'sha256:3333333333333333333333333333333333333333333333333333333333333333' })
  }));
});

test('the denial code vocabulary is closed and contains exactly the four S12 denial paths', () => {
  assert.deepEqual(
    [...EXECUTOR_PROFILE_DENIAL_CODES].sort(),
    [
      'MODEL_PROFILE_HARNESS_CAPABILITY_MISSING',
      'MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT',
      'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
      'MODEL_PROFILE_SEMANTICS_WIDENED'
    ]
  );
  for (const code of EXECUTOR_PROFILE_DENIAL_CODES) {
    assert.ok(EXECUTOR_PROFILE_CODES.includes(code), `${code} must be part of the closed code set`);
  }
});

test('the non-throwing diagnostic view reports the same denial code as the enforcement path', () => {
  const denied = explainExecutorProfileDenial({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: 'development_harness/plan_only/1',
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState()
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, 'MODEL_PROFILE_HARNESS_CAPABILITY_MISSING');
  const allowed = explainExecutorProfileDenial({
    modelId: 'gpt-5-codex',
    providerId: 'openai-codex',
    harness: HARNESS,
    declaredProfile: qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0'),
    store,
    inForce: inForceState()
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.code, null);
});

test('the diagnostics report every widening signal of a profile', () => {
  const widened = qualifiedProfile('emp_openai_codex_gpt5_codex', '1.0.0');
  widened.execution_profile_ref = 'profile_broader_v1';
  const diagnostics = executorProfileDiagnostics({
    profile: widened,
    inForce: inForceState(),
    harness: HARNESS,
    harnessCapabilities: store.harnessCapabilities,
    executionProfiles: { ...store.executionProfiles, profile_broader_v1: BROADER_EXECUTION_PROFILE }
  });
  assert.equal(diagnostics.widening_detected, true);
  assert.ok(diagnostics.execution_profile_mismatches.execution_profile_ref);
});

// --- the committed instruction digest pin ------------------------------------

test('the committed profile pin matches the repository\'s current effective instruction digest', () => {
  const { bundle } = assembleInstructionBundle({
    root,
    revision: 's12-model-adaptive-profiles-20261020',
    taskRef: 'tasks/model_adaptive_profile',
    workflowClass: 'model_adaptive_profile',
    executorProfileRef: 'exec_openai_codex',
    assemblyPolicyRef: 'assembly_policies/default',
    bundleId: 'bundle_s12_model_adaptive_probe'
  });
  assert.equal(
    bundle.effective_instruction_digest,
    PINNED_DIGEST,
    'the committed model-adaptive profile pins a stale instruction digest; re-pin it before binding'
  );
});

// --- validator surface + committed fixture ----------------------------------

test('validator surface: the committed profiles, provider coverage, DoD pairs and fixture are green', () => {
  const result = validateExecutorModelProfiles({ root });
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
  assert.equal(result.report.fixture.unexpected_results, 0);
  assert.ok(result.report.fixture.cases_checked >= 10);
  assert.equal(result.report.denial_cases.unexpected_results, 0);
  assert.ok(result.report.denial_cases.cases_checked >= 5);
  for (const profile of result.report.profiles) {
    assert.equal(profile.contract_valid, true);
    assert.equal(profile.semantics_preserved, true);
    assert.equal(profile.pinned_dimensions_complete, true);
    assert.equal(profile.runtime_requirements_coherent, true);
  }
  const sameModelPairs = result.report.same_model_pairs;
  assert.ok(sameModelPairs.length >= 1);
  for (const pair of sameModelPairs) {
    assert.equal(pair.equivalent, true, pair.findings.join('; '));
  }
});

test('the committed fixture stays schema-decidable and keeps its positive/negative labels', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, FIXTURE_PATH), 'utf8'));
  let positive = 0;
  let negative = 0;
  for (const entry of fixture.cases) {
    const issues = validateInstanceAgainstContract(entry.instance, entry.schema, root);
    if (entry.valid) {
      positive += 1;
      assert.deepEqual(issues, [], `${entry.case_id} must be schema-valid`);
    } else {
      negative += 1;
      assert.ok(issues.length > 0, `${entry.case_id} must be schema-invalid`);
    }
  }
  assert.ok(positive >= 2, 'the fixture needs positive cases');
  assert.ok(negative >= 5, 'the fixture needs negative cases');
});

test('the committed fixture covers every S12 denial path plus the happy path', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, FIXTURE_PATH), 'utf8'));
  const denialCases = fixture.denial_cases || [];
  const covered = new Set(denialCases.map((entry) => entry.expected_code).filter(Boolean));
  for (const code of EXECUTOR_PROFILE_DENIAL_CODES) {
    assert.ok(covered.has(code), `the fixture must cover the denial path ${code}`);
  }
  assert.ok(
    denialCases.some((entry) => entry.expected_code === null),
    'the fixture must cover the happy path'
  );
  assert.ok(fixture.cases.length + denialCases.length >= 16, 'the fixture must carry at least 16 cases');
});
