// MAWS vNext — Phase 3 qualification + eligibility runtime tests
// (MAWS-VN-300..302). node:test + node:assert/strict, no new dependencies.
// Profile dimensions and the valid subsumption record are loaded from
// evals/fixtures/maws-vnext/capability-profile.contracts.json (repo truth).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { canonicalJson, sha256Hex } from '../../runtime/vnext/util.mjs';
import {
  DIMENSION_ORDERS,
  levelRank,
  compareProfiles,
  subsumes,
  evaluateSubsumptionRecord
} from '../../runtime/qualification/profile-subsumption.mjs';
import { isQualificationApplicable } from '../../runtime/qualification/applicability.mjs';
import { computeFingerprint } from '../../runtime/qualification/fingerprint.mjs';
import { classifyMateriality, isRoutable } from '../../runtime/qualification/materiality.mjs';
import * as eligibilityModule from '../../runtime/qualification/eligibility.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = '2026-09-25T12:00:00.000Z';

// ---------------------------------------------------------------------------
// Fixture-derived inputs (evals/fixtures/maws-vnext/capability-profile.contracts.json)
// ---------------------------------------------------------------------------

const fixture = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'capability-profile.contracts.json'), 'utf8')
);
const fixtureCases = new Map(fixture.cases.map((caseEntry) => [caseEntry.case_id, caseEntry]));
const READONLY = structuredClone(fixtureCases.get('profile-valid-readonly').instance);
const WORKSPACE_WRITE = structuredClone(fixtureCases.get('profile-valid-workspace-write').instance);
const SUBSUMPTION_WORKSPACE_OVER_READONLY = structuredClone(
  fixtureCases.get('subsumption-valid-downward-reuse').instance
);
const PROFILES = [READONLY, WORKSPACE_WRITE];

// Declared subsumption that lies: claims profile_readonly_v1 subsumes
// profile_workspace_write_v1 with holds=true everywhere (upward inference).
const LYING_SUBSUMPTION = {
  subsumption_id: 'psub_readover_workspacelie',
  subsuming_profile_ref: 'profile_readonly_v1',
  subsumed_profile_ref: 'profile_workspace_write_v1',
  dimension_comparison: {
    tools: { subsuming_level: 'read', subsumed_level: 'write', holds: true },
    effects: { subsuming_level: 'ephemeral', subsumed_level: 'workspace', holds: true },
    context: { subsuming_level: 'bounded', subsumed_level: 'bounded', holds: true },
    network: { subsuming_level: 'none', subsumed_level: 'none', holds: true },
    delegation: { subsuming_level: 0, subsumed_level: 0, holds: true },
    verification: { subsuming_level: 'self_reported', subsumed_level: 'verified', holds: true }
  },
  relation: 'subsumes',
  declared_by: 'owner_policy'
};

const EXECUTOR_ID = 'exec_openrouter_glm';
const CAPABILITY_ID = 'cap_repository_analysis';

const BASE_COMPONENTS = {
  model_id: 'zai/glm-4.7',
  provider_id: 'openrouter',
  runtime_harness: 'maws-runtime/1',
  tool_contract_refs: ['docs/tool-contracts/catalog.json'],
  api_surface_version: '2026-09',
  qualification_profile_ref: 'qualprofile_analysis_v1'
};

function fingerprint(overrides = {}, componentOverrides = {}) {
  return computeFingerprint({
    executorId: EXECUTOR_ID,
    capabilityId: CAPABILITY_ID,
    executionProfileRef: 'profile_readonly_v1',
    components: { ...BASE_COMPONENTS, ...componentOverrides },
    ...overrides
  });
}

function qualificationRecord(overrides = {}) {
  return {
    qualification_id: 'qual_or_glm_ana_0001',
    executor_id: EXECUTOR_ID,
    capability_id: CAPABILITY_ID,
    execution_profile_ref: 'profile_readonly_v1',
    state: 'QUALIFIED',
    evidence_refs: ['evidence/qualification/or-glm-ana.json'],
    fingerprint_ref: 'fp_or_glm_ana_0001',
    decided_at: '2026-09-25T00:00:00.000Z',
    expires_at: '2026-12-25T00:00:00.000Z',
    ...overrides
  };
}

const MANIFEST_GLM = {
  executor_id: EXECUTOR_ID,
  executor_class: 'llm',
  display_name: 'OpenRouter GLM',
  declared_capabilities: [{ capability_id: CAPABILITY_ID }],
  provider: { provider_id: 'openrouter', model_id: 'zai/glm-4.7' },
  transport: 'openrouter_api',
  session_model_can_bind: false
};

// Declares a different capability: no decision may be emitted for it.
const MANIFEST_CODEX = {
  executor_id: 'exec_codex_chatgpt',
  executor_class: 'agent_harness',
  declared_capabilities: [{ capability_id: 'cap_code_implementation' }],
  transport: 'codex_exec',
  session_model_can_bind: false
};

function eligibilityInput(overrides = {}) {
  return {
    workUnit: { work_unit_id: 'wu_audit_repo_001' },
    capabilityRequirement: { capability_id: CAPABILITY_ID, min_profile_ref: 'profile_readonly_v1' },
    manifests: [MANIFEST_GLM, MANIFEST_CODEX],
    qualifications: [qualificationRecord()],
    profiles: PROFILES,
    subsumptionRecords: [SUBSUMPTION_WORKSPACE_OVER_READONLY],
    currentFingerprints: { [EXECUTOR_ID]: fingerprint() },
    qualifiedFingerprints: { [EXECUTOR_ID]: fingerprint() },
    availability: { [EXECUTOR_ID]: true },
    policyCompatible: { [EXECUTOR_ID]: true },
    budgetCompatible: { [EXECUTOR_ID]: true },
    now: NOW,
    ...overrides
  };
}

function validateAgainstContract(instance, contractPath) {
  return validateInstanceAgainstContract(instance, contractPath, ROOT);
}

function runEligibility(overrides = {}) {
  return eligibilityModule.computeEligibility(eligibilityInput(overrides));
}

// ---------------------------------------------------------------------------
// profile-subsumption
// ---------------------------------------------------------------------------

test('DIMENSION_ORDERS matches the frozen common-vocabulary orders', () => {
  assert.deepEqual(DIMENSION_ORDERS, {
    tools: ['none', 'read', 'write', 'execute'],
    effects: ['none', 'ephemeral', 'workspace', 'external'],
    context: ['none', 'bounded', 'session_full'],
    network: ['none', 'allowlisted', 'open'],
    verification: ['none', 'self_reported', 'verified', 'independently_verified']
  });
});

test('levelRank orders levels and treats delegation as numeric depth', () => {
  assert.equal(levelRank('tools', 'none') < levelRank('tools', 'read'), true);
  assert.equal(levelRank('tools', 'read') < levelRank('tools', 'write'), true);
  assert.equal(levelRank('tools', 'write') < levelRank('tools', 'execute'), true);
  assert.equal(levelRank('effects', 'ephemeral') < levelRank('effects', 'external'), true);
  assert.equal(levelRank('context', 'bounded') < levelRank('context', 'session_full'), true);
  assert.equal(levelRank('network', 'allowlisted') < levelRank('network', 'open'), true);
  assert.equal(levelRank('verification', 'verified') < levelRank('verification', 'independently_verified'), true);
  assert.equal(levelRank('delegation', 2), 2);
});

test('levelRank fails closed with QUALIFICATION_AMBIGUOUS on unknown levels and dimensions', () => {
  assert.throws(() => levelRank('tools', 'destroy'), (error) => {
    assert.equal(error.name, 'FailClosedError');
    assert.equal(error.code, 'QUALIFICATION_AMBIGUOUS');
    return true;
  });
  assert.throws(() => levelRank('money', 'read'), (error) => {
    assert.equal(error.code, 'QUALIFICATION_AMBIGUOUS');
    return true;
  });
  assert.throws(() => levelRank('delegation', 7), (error) => {
    assert.equal(error.code, 'QUALIFICATION_AMBIGUOUS');
    return true;
  });
  assert.throws(() => levelRank('delegation', 'none'), (error) => {
    assert.equal(error.code, 'QUALIFICATION_AMBIGUOUS');
    return true;
  });
});

test('compareProfiles: workspace_write subsumes readonly across every dimension', () => {
  const { perDimension, allHold } = compareProfiles(WORKSPACE_WRITE, READONLY);
  assert.equal(allHold, true);
  assert.deepEqual(perDimension.tools, { subsuming_level: 'write', subsumed_level: 'read', holds: true });
  assert.deepEqual(perDimension.verification, { subsuming_level: 'verified', subsumed_level: 'self_reported', holds: true });
  assert.deepEqual(Object.keys(perDimension).sort(), ['context', 'delegation', 'effects', 'network', 'tools', 'verification']);
  assert.equal(subsumes(WORKSPACE_WRITE, READONLY), true);
});

test('subsumes rejects upward inference: readonly does not subsume workspace_write', () => {
  const { allHold, perDimension } = compareProfiles(READONLY, WORKSPACE_WRITE);
  assert.equal(allHold, false);
  assert.equal(perDimension.tools.holds, false);
  assert.equal(perDimension.effects.holds, false);
  assert.equal(perDimension.verification.holds, false);
  assert.equal(subsumes(READONLY, WORKSPACE_WRITE), false);
});

test('evaluateSubsumptionRecord accepts the fixture-declared valid relation', () => {
  const issues = evaluateSubsumptionRecord(SUBSUMPTION_WORKSPACE_OVER_READONLY, WORKSPACE_WRITE, READONLY);
  assert.deepEqual(issues, []);
});

test('evaluateSubsumptionRecord flags a record that lies with holds=true', () => {
  const issues = evaluateSubsumptionRecord(LYING_SUBSUMPTION, READONLY, WORKSPACE_WRITE);
  assert.equal(issues.length > 0, true);
  const toolsIssue = issues.find((issue) => issue.includes('dimension_comparison.tools.holds'));
  assert.equal(typeof toolsIssue, 'string');
  assert.match(toolsIssue, /holds is true, but per-level comparison yields false/);
  assert.equal(issues.some((issue) => issue.includes('relation')), true);
});

test('evaluateSubsumptionRecord flags mismatched profile refs', () => {
  const issues = evaluateSubsumptionRecord(SUBSUMPTION_WORKSPACE_OVER_READONLY, READONLY, WORKSPACE_WRITE);
  assert.equal(issues.some((issue) => issue.includes('subsuming_profile_ref')), true);
  assert.equal(issues.some((issue) => issue.includes('subsumed_profile_ref')), true);
});

// ---------------------------------------------------------------------------
// fingerprint
// ---------------------------------------------------------------------------

test('computeFingerprint produces a schema-valid fingerprint with a reproducible canonical digest', () => {
  const printed = fingerprint();
  const issues = validateAgainstContract(printed, 'core/contracts/qualification-fingerprint.schema.json');
  assert.deepEqual(issues, []);
  assert.equal(printed.digest, sha256Hex(canonicalJson(BASE_COMPONENTS)));

  const again = fingerprint();
  assert.equal(again.digest, printed.digest);

  // Key order is irrelevant: canonical JSON sorts keys.
  const reordered = computeFingerprint({
    executorId: EXECUTOR_ID,
    capabilityId: CAPABILITY_ID,
    executionProfileRef: 'profile_readonly_v1',
    components: {
      qualification_profile_ref: BASE_COMPONENTS.qualification_profile_ref,
      api_surface_version: BASE_COMPONENTS.api_surface_version,
      tool_contract_refs: BASE_COMPONENTS.tool_contract_refs,
      runtime_harness: BASE_COMPONENTS.runtime_harness,
      provider_id: BASE_COMPONENTS.provider_id,
      model_id: BASE_COMPONENTS.model_id
    }
  });
  assert.equal(reordered.digest, printed.digest);
});

test('computeFingerprint fails closed on unexpected component shapes', () => {
  assert.throws(() => fingerprint(null, { model_id: '' }), (error) => {
    assert.equal(error.name, 'FailClosedError');
    return true;
  });
  assert.throws(() => fingerprint(null, { extra_key: 'x' }), /unexpected component key/);
  assert.throws(
    () => computeFingerprint({
      executorId: EXECUTOR_ID,
      capabilityId: CAPABILITY_ID,
      executionProfileRef: 'profile_readonly_v1',
      components: Object.fromEntries(Object.entries(BASE_COMPONENTS).filter(([key]) => key !== 'api_surface_version'))
    }),
    /missing component key/
  );
  assert.throws(() => fingerprint(null, { runtime_harness: null }), /may not be null/);
  assert.throws(() => fingerprint(null, { tool_contract_refs: 'catalog.json' }), /tool_contract_refs/);
});

// ---------------------------------------------------------------------------
// materiality
// ---------------------------------------------------------------------------

test('classifyMateriality: identical qualification-relevant state is NON_MATERIAL and routable', () => {
  const qualified = fingerprint();
  const current = fingerprint();
  const decision = classifyMateriality(qualified, current, NOW);
  assert.equal(decision.overall_class, 'NON_MATERIAL');
  assert.deepEqual(decision.deltas, []);
  assert.equal(isRoutable(decision), true);
  assert.equal(decision.qualified_fingerprint_ref, qualified.fingerprint_id);
  assert.equal(decision.current_fingerprint_ref, current.fingerprint_id);
  assert.equal(decision.decided_at, NOW);
});

test('classifyMateriality: material drift (model_id) is MATERIAL, unroutable, and schema-valid', () => {
  const qualified = fingerprint();
  const current = fingerprint(null, { model_id: 'zai/glm-5.3' });
  const decision = classifyMateriality(qualified, current, NOW);
  assert.equal(decision.overall_class, 'MATERIAL');
  assert.equal(isRoutable(decision), false);
  assert.deepEqual(
    decision.deltas.map((delta) => delta.component),
    ['model_id']
  );
  assert.deepEqual(decision.deltas[0].classification, 'MATERIAL');
  assert.deepEqual(decision.deltas[0].from, 'zai/glm-4.7');
  assert.deepEqual(decision.deltas[0].to, 'zai/glm-5.3');
  const issues = validateAgainstContract(decision, 'core/contracts/materiality-decision.schema.json');
  assert.deepEqual(issues, []);
});

test('classifyMateriality: api_surface_version and execution_profile_ref drift are MATERIAL', () => {
  const surfaceDecision = classifyMateriality(fingerprint(), fingerprint(null, { api_surface_version: '2026-10' }), NOW);
  assert.equal(surfaceDecision.overall_class, 'MATERIAL');
  assert.deepEqual(surfaceDecision.deltas.map((d) => d.component), ['api_surface_version']);

  const profileDecision = classifyMateriality(
    fingerprint(),
    fingerprint({ executionProfileRef: 'profile_workspace_write_v1' }),
    NOW
  );
  assert.equal(profileDecision.overall_class, 'MATERIAL');
  assert.deepEqual(profileDecision.deltas.map((d) => d.component), ['execution_profile_ref']);
});

test('classifyMateriality: null or unexpected shape on either side classifies UNKNOWN (fail closed)', () => {
  const nullModel = classifyMateriality(fingerprint(), fingerprint(null, { model_id: null }), NOW);
  assert.equal(nullModel.overall_class, 'UNKNOWN');
  assert.equal(nullModel.deltas[0].classification, 'UNKNOWN');
  assert.equal(isRoutable(nullModel), false);

  // computeFingerprint refuses malformed shapes by design, so simulate a
  // corrupted stored fingerprint by mutating a valid one after construction.
  const garbage = fingerprint();
  garbage.components.tool_contract_refs = 'oops';
  const garbageTools = classifyMateriality(fingerprint(), garbage, NOW);
  assert.equal(garbageTools.overall_class, 'UNKNOWN');
});

test('classifyMateriality fails closed on malformed fingerprints', () => {
  assert.throws(() => classifyMateriality(fingerprint(), { fingerprint_id: 'fp_x' }, NOW), (error) => {
    assert.equal(error.name, 'FailClosedError');
    return true;
  });
});

// ---------------------------------------------------------------------------
// applicability
// ---------------------------------------------------------------------------

test('isQualificationApplicable: exact profile match is applicable', () => {
  const result = isQualificationApplicable({
    qualification: qualificationRecord(),
    capabilityId: CAPABILITY_ID,
    requestedProfileId: 'profile_readonly_v1',
    profiles: PROFILES,
    subsumptionRecords: [],
    now: NOW
  });
  assert.deepEqual(result, { applicable: true, reason: null });
});

test('isQualificationApplicable: safe subsumption reuse via explicit re-verified relation', () => {
  const result = isQualificationApplicable({
    qualification: qualificationRecord({ execution_profile_ref: 'profile_workspace_write_v1' }),
    capabilityId: CAPABILITY_ID,
    requestedProfileId: 'profile_readonly_v1',
    profiles: PROFILES,
    subsumptionRecords: [SUBSUMPTION_WORKSPACE_OVER_READONLY],
    now: NOW
  });
  assert.deepEqual(result, { applicable: true, reason: null });
});

test('isQualificationApplicable: upward inference is rejected with PROFILE_NOT_APPLICABLE', () => {
  const result = isQualificationApplicable({
    qualification: qualificationRecord(),
    capabilityId: CAPABILITY_ID,
    requestedProfileId: 'profile_workspace_write_v1',
    profiles: PROFILES,
    subsumptionRecords: [SUBSUMPTION_WORKSPACE_OVER_READONLY],
    now: NOW
  });
  assert.deepEqual(result, { applicable: false, reason: 'PROFILE_NOT_APPLICABLE' });
});

test('isQualificationApplicable: a lying subsumption declaration is not trusted', () => {
  const result = isQualificationApplicable({
    qualification: qualificationRecord(),
    capabilityId: CAPABILITY_ID,
    requestedProfileId: 'profile_workspace_write_v1',
    profiles: PROFILES,
    subsumptionRecords: [LYING_SUBSUMPTION],
    now: NOW
  });
  assert.deepEqual(result, { applicable: false, reason: 'PROFILE_NOT_APPLICABLE' });
});

test('isQualificationApplicable: capability mismatch and non-QUALIFIED states fail closed', () => {
  const base = {
    capabilityId: CAPABILITY_ID,
    requestedProfileId: 'profile_readonly_v1',
    profiles: PROFILES,
    subsumptionRecords: [],
    now: NOW
  };
  assert.deepEqual(
    isQualificationApplicable({ ...base, qualification: qualificationRecord({ capability_id: 'cap_other' }) }),
    { applicable: false, reason: 'CAPABILITY_MISMATCH' }
  );
  assert.deepEqual(
    isQualificationApplicable({ ...base, qualification: qualificationRecord({ state: 'DECLARED', evidence_refs: [] }) }),
    { applicable: false, reason: 'STATE_NOT_QUALIFIED' }
  );
  assert.deepEqual(
    isQualificationApplicable({ ...base, qualification: qualificationRecord({ state: 'QUALIFICATION_PENDING' }) }),
    { applicable: false, reason: 'STATE_NOT_QUALIFIED' }
  );
  assert.deepEqual(
    isQualificationApplicable({ ...base, qualification: qualificationRecord({ state: 'REVOKED', revoked_at: NOW }) }),
    { applicable: false, reason: 'REVOKED' }
  );
  assert.deepEqual(
    isQualificationApplicable({ ...base, qualification: qualificationRecord({ state: 'DISQUALIFIED' }) }),
    { applicable: false, reason: 'DISQUALIFIED' }
  );
});

test('isQualificationApplicable: time-based expiry honors the injectable clock', () => {
  const expired = qualificationRecord({ expires_at: '2026-06-25T00:00:00.000Z' });
  const input = {
    qualification: expired,
    capabilityId: CAPABILITY_ID,
    requestedProfileId: 'profile_readonly_v1',
    profiles: PROFILES,
    subsumptionRecords: []
  };
  assert.deepEqual(
    isQualificationApplicable({ ...input, now: '2026-09-25T12:00:00.000Z' }),
    { applicable: false, reason: 'EXPIRED' }
  );
  // Before the expiry instant the same record is applicable.
  assert.deepEqual(
    isQualificationApplicable({ ...input, now: '2026-05-01T00:00:00.000Z' }),
    { applicable: true, reason: null }
  );
  assert.deepEqual(
    isQualificationApplicable({ ...input, qualification: qualificationRecord({ state: 'EXPIRED' }) }),
    { applicable: false, reason: 'EXPIRED' }
  );
});

test('isQualificationApplicable fails closed when a subsumption record references unknown profiles', () => {
  assert.throws(
    () => isQualificationApplicable({
      qualification: qualificationRecord({ execution_profile_ref: 'profile_workspace_write_v1' }),
      capabilityId: CAPABILITY_ID,
      requestedProfileId: 'profile_readonly_v1',
      profiles: [],
      subsumptionRecords: [SUBSUMPTION_WORKSPACE_OVER_READONLY],
      now: NOW
    }),
    (error) => {
      assert.equal(error.name, 'FailClosedError');
      assert.equal(error.code, 'QUALIFICATION_AMBIGUOUS');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// eligibility
// ---------------------------------------------------------------------------

test('computeEligibility: eligible decision is schema-valid with qualification ref and all checks true', () => {
  const decisions = runEligibility();
  assert.equal(decisions.length, 1); // only the manifest declaring the capability
  const decision = decisions[0];
  assert.equal(decision.eligible, true);
  assert.equal(decision.qualification_ref, 'qual_or_glm_ana_0001');
  assert.deepEqual(decision.exclusion_reasons, []);
  assert.deepEqual(decision.checks, {
    availability: true,
    policy_compatible: true,
    budget_compatible: true,
    authority_compatible: true,
    context_compatible: true
  });
  const issues = validateAgainstContract(decision, 'core/contracts/eligibility-decision.schema.json');
  assert.deepEqual(issues, []);
});

test('computeEligibility: every emitted decision validates against the contract', () => {
  const scenarios = [
    {},
    { qualifications: [qualificationRecord({ state: 'DECLARED', evidence_refs: [] })] },
    { qualifications: [qualificationRecord({ state: 'REVOKED', revoked_at: NOW })] },
    { qualifications: [qualificationRecord({ state: 'DISQUALIFIED' })] },
    { qualifications: [qualificationRecord({ expires_at: '2026-06-25T00:00:00.000Z' })] },
    { qualifications: [] },
    { currentFingerprints: {} },
    { currentFingerprints: { [EXECUTOR_ID]: fingerprint(null, { model_id: 'zai/glm-5.3' }) } },
    { availability: { [EXECUTOR_ID]: false } },
    { policyCompatible: { [EXECUTOR_ID]: false } },
    { budgetCompatible: { [EXECUTOR_ID]: false } },
    { authorityCompatible: { [EXECUTOR_ID]: false }, contextCompatible: { [EXECUTOR_ID]: false } }
  ];
  for (const scenario of scenarios) {
    const decisions = eligibilityModule.computeEligibility(eligibilityInput(scenario));
    for (const decision of decisions) {
      assert.deepEqual(validateAgainstContract(decision, 'core/contracts/eligibility-decision.schema.json'), []);
    }
  }
});

test('computeEligibility: DECLARED is never eligible (NOT_QUALIFIED)', () => {
  const decisions = runEligibility({
    qualifications: [qualificationRecord({ state: 'DECLARED', evidence_refs: [] })]
  });
  assert.deepEqual(decisions[0].exclusion_reasons, ['NOT_QUALIFIED']);
  assert.equal(decisions[0].eligible, false);
  assert.equal(decisions[0].qualification_ref, 'qual_or_glm_ana_0001');
});

test('computeEligibility: DISQUALIFIED, REVOKED, and expired records fail closed', () => {
  assert.deepEqual(
    runEligibility({ qualifications: [qualificationRecord({ state: 'DISQUALIFIED' })] })[0].exclusion_reasons,
    ['DISQUALIFIED']
  );
  assert.deepEqual(
    runEligibility({ qualifications: [qualificationRecord({ state: 'REVOKED', revoked_at: NOW })] })[0].exclusion_reasons,
    ['REVOKED']
  );
  assert.deepEqual(
    runEligibility({ qualifications: [qualificationRecord({ expires_at: '2026-06-25T00:00:00.000Z' })] })[0].exclusion_reasons,
    ['EXPIRED']
  );
});

test('computeEligibility: no qualification record yields NOT_DECLARED with null ref', () => {
  const decisions = runEligibility({ qualifications: [] });
  assert.deepEqual(decisions[0].exclusion_reasons, ['NOT_DECLARED']);
  assert.equal(decisions[0].qualification_ref, null);
  assert.equal(decisions[0].eligible, false);
});

test('computeEligibility: upward profile inference yields PROFILE_NOT_APPLICABLE', () => {
  const decisions = runEligibility({
    capabilityRequirement: { capability_id: CAPABILITY_ID, min_profile_ref: 'profile_workspace_write_v1' }
  });
  assert.deepEqual(decisions[0].exclusion_reasons, ['PROFILE_NOT_APPLICABLE']);
  assert.equal(decisions[0].eligible, false);
});

test('computeEligibility: safe subsumption reuse makes a broader qualified profile eligible', () => {
  const decisions = runEligibility({
    qualifications: [qualificationRecord({ execution_profile_ref: 'profile_workspace_write_v1', qualification_id: 'qual_or_glm_ana_0002' })],
    qualifiedFingerprints: { [EXECUTOR_ID]: fingerprint({ executionProfileRef: 'profile_workspace_write_v1' }) },
    currentFingerprints: { [EXECUTOR_ID]: fingerprint({ executionProfileRef: 'profile_workspace_write_v1' }) }
  });
  assert.deepEqual(decisions[0].exclusion_reasons, []);
  assert.equal(decisions[0].eligible, true);
  assert.equal(decisions[0].qualification_ref, 'qual_or_glm_ana_0002');
});

test('computeEligibility: material fingerprint drift is unroutable (MATERIAL_FINGERPRINT_DRIFT)', () => {
  const decisions = runEligibility({
    currentFingerprints: { [EXECUTOR_ID]: fingerprint(null, { model_id: 'zai/glm-5.3' }) }
  });
  assert.deepEqual(decisions[0].exclusion_reasons, ['MATERIAL_FINGERPRINT_DRIFT']);
  assert.equal(decisions[0].eligible, false);
  assert.equal(decisions[0].qualification_ref, 'qual_or_glm_ana_0001');
});

test('computeEligibility: missing current fingerprint is UNKNOWN_FINGERPRINT_DRIFT', () => {
  const decisions = runEligibility({ currentFingerprints: {} });
  assert.deepEqual(decisions[0].exclusion_reasons, ['UNKNOWN_FINGERPRINT_DRIFT']);
  assert.equal(decisions[0].eligible, false);
});

test('computeEligibility: unknown-shape drift is UNKNOWN_FINGERPRINT_DRIFT', () => {
  const decisions = runEligibility({
    currentFingerprints: { [EXECUTOR_ID]: fingerprint(null, { model_id: null }) }
  });
  assert.deepEqual(decisions[0].exclusion_reasons, ['UNKNOWN_FINGERPRINT_DRIFT']);
});

test('computeEligibility: provider unavailability excludes with PROVIDER_UNAVAILABLE', () => {
  const decisions = runEligibility({ availability: { [EXECUTOR_ID]: false } });
  assert.deepEqual(decisions[0].exclusion_reasons, ['PROVIDER_UNAVAILABLE']);
  assert.equal(decisions[0].checks.availability, false);
  assert.equal(decisions[0].eligible, false);
});

test('computeEligibility: policy and budget incompatibility exclude in precedence order', () => {
  assert.deepEqual(
    runEligibility({ policyCompatible: { [EXECUTOR_ID]: false } })[0].exclusion_reasons,
    ['POLICY_INCOMPATIBLE']
  );
  assert.deepEqual(
    runEligibility({ budgetCompatible: { [EXECUTOR_ID]: false } })[0].exclusion_reasons,
    ['BUDGET_INCOMPATIBLE']
  );
  assert.deepEqual(
    runEligibility({
      availability: { [EXECUTOR_ID]: false },
      policyCompatible: { [EXECUTOR_ID]: false }
    })[0].exclusion_reasons,
    ['PROVIDER_UNAVAILABLE']
  );
});

test('computeEligibility: injected authority/context gates exclude without widening defaults', () => {
  const decisions = runEligibility({
    authorityCompatible: { [EXECUTOR_ID]: false },
    contextCompatible: { [EXECUTOR_ID]: false }
  });
  assert.deepEqual(decisions[0].exclusion_reasons, ['AUTHORITY_INCOMPATIBLE']);
  assert.equal(decisions[0].checks.authority_compatible, false);
  assert.equal(decisions[0].checks.context_compatible, false);
  assert.equal(decisions[0].eligible, false);
});

test('computeEligibility: multiple qualification records for one executor+capability fail closed', () => {
  assert.throws(
    () => runEligibility({
      qualifications: [qualificationRecord(), qualificationRecord({ qualification_id: 'qual_or_glm_ana_0002' })]
    }),
    (error) => {
      assert.equal(error.name, 'FailClosedError');
      assert.equal(error.code, 'QUALIFICATION_AMBIGUOUS');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// runtime success produces only QualificationReviewCandidate
// ---------------------------------------------------------------------------

test('runtime success produces only a QualificationReviewCandidate, never a qualification', () => {
  // The eligibility module exports exactly the deterministic filter and the
  // single success artifact builder.
  assert.deepEqual(Object.keys(eligibilityModule).sort(), ['buildQualificationReviewCandidate', 'computeEligibility']);

  const candidate = eligibilityModule.buildQualificationReviewCandidate(
    {
      executorId: EXECUTOR_ID,
      capabilityId: CAPABILITY_ID,
      executionProfileRef: 'profile_readonly_v1',
      runEvidenceRef: 'evidence/runs/run-0001-report.json'
    },
    NOW
  );
  assert.match(candidate.candidate_id, /^qrc_[a-z0-9_]+$/);
  assert.equal(candidate.executor_id, EXECUTOR_ID);
  assert.equal(candidate.capability_id, CAPABILITY_ID);
  assert.equal(candidate.execution_profile_ref, 'profile_readonly_v1');
  assert.equal(candidate.run_evidence_ref, 'evidence/runs/run-0001-report.json');
  assert.equal(candidate.created_at, NOW);

  // A review candidate carries no qualification state, no qualification id,
  // no evidence grant: runtime success cannot mint qualification.
  assert.equal('state' in candidate, false);
  assert.equal('qualification_id' in candidate, false);
  assert.equal('evidence_refs' in candidate, false);

  // Eligibility output objects are decisions (eligibility_id), not records.
  for (const decision of runEligibility()) {
    assert.equal('eligibility_id' in decision, true);
    assert.equal('state' in decision, false);
    assert.equal('evidence_refs' in decision, false);
  }

  assert.throws(
    () => eligibilityModule.buildQualificationReviewCandidate({
      executorId: EXECUTOR_ID,
      capabilityId: CAPABILITY_ID,
      executionProfileRef: 'profile_readonly_v1',
      runEvidenceRef: ''
    }),
    (error) => {
      assert.equal(error.name, 'FailClosedError');
      return true;
    }
  );
});
