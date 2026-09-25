// MAWS-VN-901 — failure matrix. Every failure case must terminate
// deterministically in a typed disposition (RETRY, REVALIDATE, REROUTE,
// ESCALATE, BLOCKED, FAILED) or a typed FailClosedError. No silent downgrade
// of authority, verification, or qualification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeWorkRun } from '../../runtime/orchestrator/run-engine.mjs';
import { computeEligibility, buildQualificationReviewCandidate } from '../../runtime/qualification/eligibility.mjs';
import { classifyMateriality } from '../../runtime/qualification/materiality.mjs';
import { buildRoutingRequest, route } from '../../runtime/routing/routing-engine.mjs';
import { scoreCandidates } from '../../runtime/routing/scoring.mjs';
import { decideExploration } from '../../runtime/routing/exploration.mjs';
import { buildComposition } from '../../runtime/routing/composition.mjs';
import { resolveDisagreement } from '../../runtime/routing/disagreement.mjs';
import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';
import { buildPreferredExecutorQuestion } from '../../runtime/decision-engine/jev/questions/registry.mjs';
import { recordResolution } from '../../runtime/decision-engine/jev/model-resolution.mjs';
import { loadThresholdPolicy } from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import { createRevisionEngine } from '../../runtime/planner/revision-engine.mjs';
import { evaluateDecompositionRequest } from '../../runtime/planner/decomposition.mjs';
import { arbitrate } from '../../runtime/planner/arbitration-engine.mjs';
import { buildCandidate, planAndBind } from '../../runtime/planner/hybrid-planner.mjs';
import { createWorkGraphStore } from '../../runtime/planner/work-graph-store.mjs';
import { createWorkUnitStore } from '../../runtime/planner/work-unit-store.mjs';
import { createOpenRouterExecutor } from '../../runtime/executors/openrouter-executor.mjs';
import { createCodexExecutor } from '../../runtime/executors/codex-executor.mjs';
import { evaluateCompletion } from '../../runtime/completion/completion-engine.mjs';
import { buildVerificationReceipt } from '../../runtime/completion/verification.mjs';
import { FailClosedError } from '../../runtime/vnext/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWED_DISPOSITIONS = new Set(['RETRY', 'REVALIDATE', 'REROUTE', 'ESCALATE', 'BLOCKED', 'FAILED']);

function baseWorld() {
  const fp = (executorId, capabilityId) => ({
    fingerprint_id: `fp_${executorId.replace('exec_', '')}_${capabilityId.replace('cap_', '')}`,
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: 'profile_readonly_v1',
    components: {
      model_id: null, provider_id: null, runtime_harness: 'in_process_fixture/1',
      tool_contract_refs: ['tests/vnext/failure-matrix.test.mjs'], api_surface_version: '2026-09',
      qualification_profile_ref: 'qualprofile_v1'
    },
    digest: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
  });
  const qual = (executorId, capabilityId, overrides = {}) => ({
    qualification_id: `qual_${executorId.replace('exec_', '')}_${capabilityId.replace('cap_', '')}`,
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: 'profile_readonly_v1',
    state: 'QUALIFIED',
    evidence_refs: ['evidence/qualification/x.json'],
    fingerprint_ref: fp(executorId, capabilityId).fingerprint_id,
    decided_at: '2026-09-25T00:00:00Z',
    expires_at: '2026-12-25T00:00:00Z',
    ...overrides
  });
  const fpA = fp('exec_openrouter_glm', 'cap_repository_analysis');
  const fpV = fp('exec_local_tests', 'cap_deterministic_verification');
  return {
    manifests: [
      { executor_id: 'exec_openrouter_glm', executor_class: 'llm', declared_capabilities: [{ capability_id: 'cap_repository_analysis' }], provider: { provider_id: 'openrouter', model_id: 'zai/glm-4.7' }, transport: 'openrouter_api', session_model_can_bind: false },
      { executor_id: 'exec_local_tests', executor_class: 'deterministic_service', declared_capabilities: [{ capability_id: 'cap_deterministic_verification' }], transport: 'in_process', session_model_can_bind: false }
    ],
    profiles: { profile_readonly_v1: { profile_id: 'profile_readonly_v1', dimensions: { tools: 'read', effects: 'ephemeral', context: 'bounded', network: 'none', delegation: 0, verification: 'self_reported' } } },
    subsumptionRecords: [],
    qualifications: [qual('exec_openrouter_glm', 'cap_repository_analysis'), qual('exec_local_tests', 'cap_deterministic_verification')],
    qualifiedFingerprints: { exec_openrouter_glm: fpA, exec_local_tests: fpV },
    currentFingerprints: { exec_openrouter_glm: fpA, exec_local_tests: fpV },
    availability: { exec_openrouter_glm: true, exec_local_tests: true },
    policyCompatible: { exec_openrouter_glm: true, exec_local_tests: true },
    budgetCompatible: { exec_openrouter_glm: true, exec_local_tests: true }
  };
}

const template = {
  template_id: 'tpl_audit_repair_v1',
  workflow_class: 'implementation',
  mandatory_stages: ['analysis', 'verification'],
  decomposition_limits: { max_depth: 2, max_children_per_node: 4, max_total_work_units: 12 },
  composition_policy_ref: 'comp_default_v1',
  authority_ceiling_default: { scope_ref: 'scope/run_fm', allowed_effects: ['ephemeral', 'workspace'], delegation_depth_max: 1, authority_source_refs: ['policies/maws-vnext-defaults.yaml'] },
  verification_requirements: { required: true, independent: true }
};

const fixtureImpl = (executorId, outcome = 'SUCCESS') => async (invocation) => ({
  execution_attempt_id: invocation.execution_attempt_id, executor_id: executorId, work_unit_id: invocation.work_unit_id,
  started_at: '2026-09-25T00:00:00Z', finished_at: '2026-09-25T00:00:01Z', outcome,
  outputs: outcome === 'SUCCESS' ? [{ output_id: 'audit_report', inline_payload: {} }] : [],
  metrics: { latency_ms: 1, cost_units: 0, tokens_in: 0, tokens_out: 0 }, error_class: outcome === 'SUCCESS' ? null : 'SIMULATED_FAILURE', exit_code: null
});

const passReceipt = (workUnitId) => buildVerificationReceipt({ work_unit_id: workUnitId, verifier_executor_id: 'exec_local_tests', independent: true, outcome: 'PASS', evidence_refs: ['evidence/fm/x.json'], checks: ['ok'] });

async function runMatrix(worldOverrides = {}, engineOverrides = {}) {
  const world = { ...baseWorld(), ...worldOverrides };
  return executeWorkRun({
    root,
    runId: `run_fm_${Math.random().toString(36).slice(2, 8)}`,
    interactionSession: { session_id: 'sess_fm', interaction_host: 'zcode', session_model: 'glm-5.3', orchestration_owner: 'maws', submitted_at: '2026-09-25T00:00:00Z' },
    workRequest: {
      objective: 'Audit and repair repository',
      requiredCapabilities: [
        { capability_id: 'cap_repository_analysis', min_profile_ref: 'profile_readonly_v1' },
        { capability_id: 'cap_deterministic_verification', min_profile_ref: 'profile_readonly_v1' }
      ],
      stageCapabilities: { analysis: ['cap_repository_analysis'], verification: ['cap_deterministic_verification'] },
      requiredOutputs: [{ output_id: 'audit_report', artifact_ref: 'artifacts/x.json' }],
      requiredEvidence: ['evidence/fm/x.json'],
      policyContextRef: 'policies/maws-vnext-defaults.yaml', workloadSafetyClass: 'safe'
    },
    template,
    ...world,
    eligibilityEngine: { computeEligibility },
    routingEngine: { buildRoutingRequest, route },
    executorImplementations: { exec_openrouter_glm: fixtureImpl('exec_openrouter_glm'), exec_local_tests: fixtureImpl('exec_local_tests') },
    verifier: ({ executionResult }) => passReceipt(executionResult.work_unit_id),
    completionEngine: { evaluateCompletion },
    outputsRegistry: () => ['audit_report'],
    evidenceRegistry: () => ['evidence/fm/x.json'],
    now: () => '2026-09-25T00:00:00Z',
    ...engineOverrides
  });
}

test('FM-01 Jev unavailable: deterministic fallback routing, no silent model switch', async () => {
  const outcome = await runMatrix({}, { jevAsker: async () => ({ ok: false, disposition: 'BLOCKED', error_class: 'JEV_UNAVAILABLE' }) });
  assert.equal(outcome.status, 'COMPLETED');
  for (const decision of outcome.routingDecisions) {
    assert.equal(decision.jev_receipt_ref, null);
  }
});

test('FM-02 Jev low confidence: threshold gate prevents binding, deterministic selection', async () => {
  const thresholdPolicy = await loadThresholdPolicy(path.join(root, 'policies/decision-thresholds.yaml'));
  const jevClient = createJevClient({ mode: 'fixture', fixtureDir: path.join(root, 'runtime/decision-engine/jev/fixtures'), thresholdPolicy });
  const outcome = await runMatrix({}, {
    jevAsker: async ({ eligibleExecutorIds }) => {
      const question = buildPreferredExecutorQuestion(eligibleExecutorIds);
      return jevClient.ask({ question, choices: question.answer_space.values, caseId: 'low-confidence' });
    },
    thresholdDecider: () => ({ action: 'HUMAN_GATE' })
  });
  assert.equal(outcome.status, 'COMPLETED');
  assert.ok(outcome.routingDecisions.every((decision) => decision.jev_receipt_ref === null));
});

test('FM-03 jev-latest alias drift is a MATERIAL materiality event', () => {
  const resolution = recordResolution('jev-latest', 'jev-1.14.0', 'jev-1.13.0');
  assert.equal(resolution.alias_drift, true);
  assert.equal(resolution.drift_class, 'MATERIAL');
});

test('FM-04 invalid Jev candidate injection: BLOCKED, never binds outside the set', async () => {
  const thresholdPolicy = await loadThresholdPolicy(path.join(root, 'policies/decision-thresholds.yaml'));
  const jevClient = createJevClient({ mode: 'fixture', fixtureDir: path.join(root, 'runtime/decision-engine/jev/fixtures'), thresholdPolicy });
  const asked = await jevClient.ask({ question: buildPreferredExecutorQuestion(['exec_openrouter_glm']), choices: ['exec_openrouter_glm'], caseId: 'disallowed-injection' });
  assert.equal(asked.ok, false);
  assert.equal(asked.disposition, 'BLOCKED');
  const outcome = await runMatrix({}, { jevAsker: async () => asked });
  assert.equal(outcome.status, 'COMPLETED');
  for (const node of outcome.graph.nodes) {
    assert.ok(['exec_openrouter_glm', 'exec_local_tests'].includes(node.executor_binding.executor_id));
  }
});

test('FM-05 OpenRouter unavailable: typed FAILED execution, completion blocked', async () => {
  const executor = createOpenRouterExecutor({
    modelId: 'zai/glm-4.7',
    fetchImpl: async () => { throw new Error('network down'); },
    env: { OPENROUTER_API_KEY: 'test-key' }
  });
  const result = await executor.execute({
    execution_attempt_id: 'att_fm05', work_unit_id: 'wu_fm05', node_id: 'n1',
    context_package: { objective: 'x', bounded_payload: {}, provenance_refs: [] },
    authority_envelope: { scope_ref: 's', allowed_effects: ['ephemeral'] }
  });
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'OR_UNAVAILABLE');
  assert.ok(ALLOWED_DISPOSITIONS.has('FAILED'));
});

test('FM-06 Codex unavailable: typed EXECUTOR_UNAVAILABLE, not a crash', async () => {
  const executor = createCodexExecutor({
    model: 'zai/glm-4.7',
    env: { PATH: '/bin' },
    spawnImpl: () => {
      const error = new Error('spawn ENOENT');
      error.code = 'ENOENT';
      throw error;
    }
  });
  const result = await executor.execute({
    execution_attempt_id: 'att_fm06', work_unit_id: 'wu_fm06', node_id: 'n1',
    context_package: { objective: 'x', bounded_payload: {}, provenance_refs: [] },
    authority_envelope: { scope_ref: 's', allowed_effects: ['workspace'] }
  });
  assert.equal(result.outcome, 'FAILED');
  assert.equal(result.error_class, 'EXECUTOR_UNAVAILABLE');
});

test('FM-07 requested executor not qualified: excluded deterministically, run blocked when set empty', async () => {
  const world = baseWorld();
  world.qualifications = world.qualifications.map((record) => ({ ...record, state: 'DECLARED', evidence_refs: [] }));
  const outcome = await runMatrix(world);
  assert.equal(outcome.status, 'BLOCKED');
  assert.equal(outcome.blockingReason, 'NO_ELIGIBLE_EXECUTOR');
  assert.ok(outcome.eligibilityDecisions.some((decision) => decision.exclusion_reasons.includes('NOT_QUALIFIED')));
});

test('FM-08 required executor unavailable: PROVIDER_UNAVAILABLE exclusion blocks the stage', async () => {
  const world = baseWorld();
  world.availability = { exec_openrouter_glm: false, exec_local_tests: true };
  const outcome = await runMatrix(world);
  assert.equal(outcome.status, 'BLOCKED');
  assert.equal(outcome.blockingReason, 'NO_ELIGIBLE_EXECUTOR_FOR_STAGE');
  assert.equal(outcome.blockingStage, 'analysis');
  assert.ok(outcome.eligibilityDecisions.some((decision) => decision.executor_id === 'exec_openrouter_glm' && decision.exclusion_reasons.includes('PROVIDER_UNAVAILABLE')));
});

test('FM-09 hidden provider fallback: substitution is surfaced, never silent', async () => {
  const executor = createOpenRouterExecutor({
    modelId: 'zai/glm-4.7',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ model: 'other/model-x', choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }) }),
    env: { OPENROUTER_API_KEY: 'test-key' }
  });
  const result = await executor.execute({
    execution_attempt_id: 'att_fm09', work_unit_id: 'wu_fm09', node_id: 'n1',
    context_package: { objective: 'x', bounded_payload: {}, provenance_refs: [] },
    authority_envelope: { scope_ref: 's', allowed_effects: ['ephemeral'] }
  });
  assert.equal(result.flags.model_substitution, true);
  assert.equal(result.flags.served_model, 'other/model-x');
});

test('FM-10 stale graph revision: STALE + REQUIRES_REBASE, graph untouched', () => {
  const workUnits = createWorkUnitStore({ root });
  const rootWu = workUnits.create({
    work_unit_id: 'wu_fm10', objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/fm', authority_ceiling: { scope_ref: 'scope/fm', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: 'cc_fm10', created_by: 'interaction_session', run_ref: 'run_fm10'
  });
  const graphStore = createWorkGraphStore({ root });
  planAndBind({ template, candidate: buildCandidate({ template, workUnits: [rootWu] }), routingForNode: () => ({ executor_id: 'exec_local_tests', routing_decision_ref: 'rd', qualification_ref: 'q', selection_mode: 'NORMAL_SELECTION' }), workGraphStore: graphStore, graphId: 'graph_fm10', root });
  const engine = createRevisionEngine({ workGraphStore: graphStore, root });
  engine.submit('graph_fm10', { request_id: 'rev_a', base_graph_version: 1, request_type: 'update_context', source: 'runtime', motivation: 'x', payload: {} });
  const { decision } = engine.submit('graph_fm10', { request_id: 'rev_b', base_graph_version: 1, request_type: 'update_budget', source: 'executor', motivation: 'late', payload: {} });
  assert.equal(decision.outcome, 'STALE');
  assert.equal(decision.revalidation, 'REQUIRES_REBASE');
});

test('FM-11 graph version conflict arbitration: REVALIDATE disposition', () => {
  const decision = arbitrate({
    policy: { policy_id: 'arb_revision_v1', conflict_class: 'revision_conflict', resolution_order: ['plan_revision', 'reroute'], tie_break: 'deterministic_priority' },
    requestRefs: ['rev_a', 'rev_b'], conflictInvolvesAuthority: false, root
  });
  assert.equal(decision.disposition, 'REVALIDATE');
});

test('FM-12 decomposition max depth exceeded: REJECTED with limits_respected false', () => {
  const workUnits = createWorkUnitStore({ root });
  const parent = workUnits.create({
    work_unit_id: 'wu_fm12', objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/fm', authority_ceiling: { scope_ref: 'scope/fm', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: 'cc_fm12', created_by: 'interaction_session', run_ref: 'run_fm12'
  });
  const { decision } = evaluateDecompositionRequest({
    request: { request_id: 'decomp_fm12', source: 'executor', parent_work_unit_id: 'wu_fm12', requested_children: [{ objective: 'c', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/fm/sub', effects_subset: ['ephemeral'], authority_depth_requested: 0 }], limits_snapshot: { current_depth: 2, max_depth: 2, current_total_work_units: 3, max_total_work_units: 12 } },
    parentWorkUnit: parent, template, graphStats: { current_depth: 2, current_total_work_units: 3 }, root
  });
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.envelope_check.limits_respected, false);
});

test('FM-13 max work-unit count exceeded: REJECTED', () => {
  const workUnits = createWorkUnitStore({ root });
  const parent = workUnits.create({
    work_unit_id: 'wu_fm13', objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/fm', authority_ceiling: { scope_ref: 'scope/fm', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: 'cc_fm13', created_by: 'interaction_session', run_ref: 'run_fm13'
  });
  const children = Array.from({ length: 5 }, (_, index) => ({ objective: `c${index}`, required_capabilities: ['cap_repository_analysis'], context_subset_ref: `ctx/fm/s${index}`, effects_subset: ['ephemeral'], authority_depth_requested: 0 }));
  const { decision } = evaluateDecompositionRequest({
    request: { request_id: 'decomp_fm13', source: 'executor', parent_work_unit_id: 'wu_fm13', requested_children: children, limits_snapshot: { current_depth: 1, max_depth: 2, current_total_work_units: 11, max_total_work_units: 12 } },
    parentWorkUnit: parent, template, graphStats: { current_depth: 1, current_total_work_units: 11 }, root
  });
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.envelope_check.limits_respected, false);
});

test('FM-14 budget exceeded: BUDGET_INCOMPATIBLE exclusion blocks executor', async () => {
  const world = baseWorld();
  world.budgetCompatible = { exec_openrouter_glm: false, exec_local_tests: true };
  const outcome = await runMatrix(world);
  assert.equal(outcome.status, 'BLOCKED');
  assert.equal(outcome.blockingStage, 'analysis');
  assert.ok(outcome.eligibilityDecisions.some((decision) => decision.executor_id === 'exec_openrouter_glm' && decision.exclusion_reasons.includes('BUDGET_INCOMPATIBLE')));
});

test('FM-15 authority conflict: BLOCKED or ESCALATE, never runtime-resolved', () => {
  const blocked = arbitrate({ policy: { policy_id: 'arb_a', conflict_class: 'authority_conflict', resolution_order: ['human_gate', 'fail_closed'], tie_break: 'human_gate' }, requestRefs: ['r1'], conflictInvolvesAuthority: true, root });
  assert.equal(blocked.disposition, 'BLOCKED');
  const disagreement = resolveDisagreement({ disagreement_class: 'authority_conflict', policy: { policy_id: 'dis_a', disagreement_class: 'authority_conflict', required_actions: { independent_verification: false, evidence_review: false, human_gate: true }, synthesizer_authority: 'none', fail_closed: true }, evidence: {} });
  assert.ok(['ESCALATED', 'BLOCKED'].includes(disagreement.outcome));
  assert.notEqual(disagreement.outcome, 'RESOLVED');
});

test('FM-16 unresolved disagreement blocks completion', () => {
  const decision = evaluateCompletion({
    completion_contract: {
      contract_id: 'cc_fm16', work_unit_id: 'wu_fm16',
      clauses: { execution_success: { required: true }, required_outputs: [], required_evidence: [], verification: { required: false, independent: false }, dependency_closure: { required: false }, child_closure: { required: false }, disagreement_closure: ['factual_conflict'], graph_conditions: [] }
    },
    execution_results: [{ execution_attempt_id: 'a1', work_unit_id: 'wu_fm16', outcome: 'SUCCESS' }],
    verification_receipts: [], dependency_states: [], child_states: [],
    disagreement_decisions: [{ disagreement_class: 'factual_conflict', outcome: 'ESCALATED' }],
    graph_state: { all_nodes_completed: true, active_graph_version: 1, expected_graph_version: 1 },
    outputs_present: [], evidence_present: [], decided_at: '2026-09-25T00:00:00Z'
  });
  assert.equal(decision.result, 'NOT_COMPLETED');
  assert.ok(decision.unsatisfied_clauses.includes('disagreement_closure'));
});

test('FM-17 verification failure blocks completion despite executor success', async () => {
  const outcome = await runMatrix({}, {
    verifier: ({ executionResult }) => buildVerificationReceipt({ work_unit_id: executionResult.work_unit_id, verifier_executor_id: 'exec_local_tests', independent: true, outcome: 'FAIL', evidence_refs: [], checks: ['failed'] })
  });
  assert.equal(outcome.status, 'NOT_COMPLETED');
  assert.equal(outcome.completionDecision.result, 'NOT_COMPLETED');
  assert.equal(outcome.completionDecision.verification_satisfied, false);
});

test('FM-18 completion evidence missing blocks completion', async () => {
  const outcome = await runMatrix({}, { evidenceRegistry: () => [] });
  assert.equal(outcome.status, 'NOT_COMPLETED');
  assert.ok(outcome.completionDecision.unsatisfied_clauses.includes('required_evidence'));
});

test('FM-19 invalid context widening decomposition: REJECTED', () => {
  const workUnits = createWorkUnitStore({ root });
  const parent = workUnits.create({
    work_unit_id: 'wu_fm19', objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/fm19', authority_ceiling: { scope_ref: 'scope/fm19', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: 'cc_fm19', created_by: 'interaction_session', run_ref: 'run_fm19'
  });
  const { decision } = evaluateDecompositionRequest({
    request: { request_id: 'decomp_fm19', source: 'executor', parent_work_unit_id: 'wu_fm19', requested_children: [{ objective: 'c', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/OTHER/envelope', effects_subset: ['ephemeral'], authority_depth_requested: 0 }], limits_snapshot: { current_depth: 0, max_depth: 2, current_total_work_units: 1, max_total_work_units: 12 } },
    parentWorkUnit: parent, template, graphStats: { current_depth: 0, current_total_work_units: 1 }, root
  });
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.envelope_check.context_subset, false);
});

test('FM-20 invalid effects (scope) widening decomposition: REJECTED', () => {
  const workUnits = createWorkUnitStore({ root });
  const parent = workUnits.create({
    work_unit_id: 'wu_fm20', objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/fm20', authority_ceiling: { scope_ref: 'scope/fm20', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: 'cc_fm20', created_by: 'interaction_session', run_ref: 'run_fm20'
  });
  const { decision } = evaluateDecompositionRequest({
    request: { request_id: 'decomp_fm20', source: 'executor', parent_work_unit_id: 'wu_fm20', requested_children: [{ objective: 'c', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/fm20/sub', effects_subset: ['external'], authority_depth_requested: 0 }], limits_snapshot: { current_depth: 0, max_depth: 2, current_total_work_units: 1, max_total_work_units: 12 } },
    parentWorkUnit: parent, template, graphStats: { current_depth: 0, current_total_work_units: 1 }, root
  });
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.envelope_check.effects_subset, false);
});

test('FM-21 invalid authority widening decomposition: REJECTED', () => {
  const workUnits = createWorkUnitStore({ root });
  const parent = workUnits.create({
    work_unit_id: 'wu_fm21', objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/fm21', authority_ceiling: { scope_ref: 'scope/fm21', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: 'cc_fm21', created_by: 'interaction_session', run_ref: 'run_fm21'
  });
  const { decision } = evaluateDecompositionRequest({
    request: { request_id: 'decomp_fm21', source: 'executor', parent_work_unit_id: 'wu_fm21', requested_children: [{ objective: 'c', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/fm21/sub', effects_subset: ['ephemeral'], authority_depth_requested: 2 }], limits_snapshot: { current_depth: 0, max_depth: 2, current_total_work_units: 1, max_total_work_units: 12 } },
    parentWorkUnit: parent, template, graphStats: { current_depth: 0, current_total_work_units: 1 }, root
  });
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.envelope_check.authority_not_widened, false);
});

test('FM-22 expired qualification: EXPIRED exclusion, fail closed', async () => {
  const world = baseWorld();
  world.qualifications = world.qualifications.map((record) => ({ ...record, expires_at: '2026-01-01T00:00:00Z' }));
  const outcome = await runMatrix(world);
  assert.equal(outcome.status, 'BLOCKED');
  assert.ok(outcome.eligibilityDecisions.some((decision) => decision.exclusion_reasons.includes('EXPIRED')));
});

test('FM-23 unknown fingerprint drift: UNKNOWN_FINGERPRINT_DRIFT, unroutable', async () => {
  const world = baseWorld();
  world.currentFingerprints = {};
  const outcome = await runMatrix(world);
  assert.equal(outcome.status, 'BLOCKED');
  assert.ok(outcome.eligibilityDecisions.some((decision) => decision.exclusion_reasons.includes('UNKNOWN_FINGERPRINT_DRIFT')));
  const drifted = classifyMateriality(world.qualifiedFingerprints.exec_openrouter_glm, {
    ...world.qualifiedFingerprints.exec_openrouter_glm,
    components: { ...world.qualifiedFingerprints.exec_openrouter_glm.components, runtime_harness: 'in_process_fixture/2' }
  });
  assert.equal(drifted.overall_class, 'MATERIAL');
});

test('FM-24 forced binding outside eligible set: ignored or fail closed, never binds outside', () => {
  const request = buildRoutingRequest({
    work_unit_id: 'wu_fm24',
    capability_requirements: ['cap_repository_analysis'],
    eligible: [{ executor_id: 'exec_openrouter_glm', qualification_ref: 'qual_a' }],
    policy_context_ref: 'policies/maws-vnext-defaults.yaml',
    workload_safety_class: 'safe'
  });
  const decision = route({
    routing_request: request,
    jev_answer: { preferred_executor_id: 'exec_codex_harness', receipt_ref: 'jevr_x', threshold_met: true },
    scores: null, exploration_policy: null, decided_at: '2026-09-25T00:00:00Z'
  });
  assert.equal(decision.selected_executor_id, 'exec_openrouter_glm');
  assert.notEqual(decision.selected_executor_id, 'exec_codex_harness');
  assert.equal(decision.jev_receipt_ref, null);
  const unverified = scoreCandidates({
    candidates: [{ executor_id: 'exec_openrouter_glm', signals: { verified_success: { value: 1, evidence_ref: 'self:exec_openrouter_glm' } } }],
    weights: { verified_success: 1 }
  });
  assert.equal(unverified[0].score, 0);
  assert.ok(unverified[0].flags.includes('UNVERIFIED_SIGNAL_REJECTED'));
  const exploration = decideExploration({ explorationPolicy: { policy_ref: 'p', max_traffic_share: 0.2, allowed_safety_classes: ['safe'] }, workloadSafetyClass: 'irreversible', candidateCount: 2 });
  assert.equal(exploration.allowed, false);
  assert.throws(
    () => buildComposition({
      composition_policy: { policy_id: 'comp_default_v1', allowed_modes: ['independent_parallel'], max_executors: 2, max_parallelism: 2, workload_safety_classes_allowed: ['safe'] },
      mode: 'specialist_synthesis', participants: [{ executor_id: 'exec_openrouter_glm', routing_decision_ref: 'rd_1' }], authority_ceiling_ref: 'scope/x'
    }),
    (error) => error instanceof FailClosedError && error.code === 'COMPOSITION_POLICY_VIOLATION'
  );
  const reviewCandidate = buildQualificationReviewCandidate({ executorId: 'exec_openrouter_glm', capabilityId: 'cap_repository_analysis', executionProfileRef: 'profile_readonly_v1', runEvidenceRef: 'evidence/x.json' });
  assert.ok(reviewCandidate.candidate_id.startsWith('qrc_'));
  assert.ok(!('state' in reviewCandidate) || reviewCandidate.state !== 'QUALIFIED');
});
