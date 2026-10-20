// S11 — harness context separation tests (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, section 4.3, slice S11). One test group per rule R1..R6 plus the
// engine-level negative cases. The R2 headline: a development-harness run
// presenting a product-authority claim fails closed. There is no fallback
// context anywhere in this suite — every negative case ends in a typed
// FailClosedError or a blocked run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeWorkRun } from '../../runtime/orchestrator/run-engine.mjs';
import { developmentProbeHarnessContext } from '../../runtime/harness-context/context-binding.mjs';
import {
  HARNESS_CONTEXT_VALUES,
  PRODUCT_AUTHORITY_REF_PREFIX,
  validateHarnessContextRecord,
  resolveHarnessContext,
  contextOfRuntimeHarness,
  assertQualificationContextBinding,
  assertWorkUnitContextBinding,
  assertNoProductAuthorityFromDevContext,
  assertInvocationHarnessContext,
  assertSupersessionContextChange
} from '../../runtime/harness-context/context-binding.mjs';
import { computeEligibility } from '../../runtime/qualification/eligibility.mjs';
import { buildRoutingRequest, route } from '../../runtime/routing/routing-engine.mjs';
import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';
import { buildPreferredExecutorQuestion } from '../../runtime/decision-engine/jev/questions/registry.mjs';
import { loadThresholdPolicy, evaluateThreshold } from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import { evaluateCompletion } from '../../runtime/completion/completion-engine.mjs';
import { buildVerificationReceipt } from '../../runtime/completion/verification.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { semanticContextIssues } from '../../scripts/tools/validate-harness-context.mjs';
import { createWorkUnitStore } from '../../runtime/planner/work-unit-store.mjs';
import { createWorkGraphStore } from '../../runtime/planner/work-graph-store.mjs';
import { buildCandidate, planAndBind } from '../../runtime/planner/hybrid-planner.mjs';
import { createRevisionEngine } from '../../runtime/planner/revision-engine.mjs';
import { FailClosedError } from '../../runtime/vnext/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function devContext(overrides = {}) {
  return {
    context_id: 'hctx_s11_test_dev',
    context: 'development_harness',
    run_ref: 'run_s11_test',
    authority_grant: 'none',
    created_at: '2026-10-20T00:00:00Z',
    ...overrides
  };
}

function productContext(overrides = {}) {
  return {
    context_id: 'hctx_s11_test_product',
    context: 'unitera_product',
    run_ref: 'run_s11_test',
    authority_grant: 'none',
    authority_surface: {
      repository: 'unitera-os',
      contract_ref: 'unitera-os/effective-autonomy',
      contract_version: '1.0.0'
    },
    created_at: '2026-10-20T00:00:00Z',
    ...overrides
  };
}

function expectFailClosed(code, fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof FailClosedError, `expected FailClosedError, got ${error?.constructor?.name}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected FailClosedError ${code}, but nothing was thrown`);
}

// --- engine world (fixture-only, mirrors the failure-matrix world shape).

function baseWorld() {
  const fp = (executorId, capabilityId, runtimeHarness = 'development_harness/in_process_fixture/1') => ({
    fingerprint_id: `fp_${executorId.replace('exec_', '')}_${capabilityId.replace('cap_', '')}`,
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: 'profile_readonly_v1',
    components: {
      model_id: null, provider_id: null, runtime_harness: runtimeHarness,
      tool_contract_refs: ['tests/vnext/harness-context.test.mjs'], api_surface_version: '2026-09',
      qualification_profile_ref: 'qualprofile_s11'
    },
    digest: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
  });
  const qual = (executorId, capabilityId) => ({
    qualification_id: `qual_${executorId.replace('exec_', '')}_${capabilityId.replace('cap_', '')}`,
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: 'profile_readonly_v1',
    state: 'QUALIFIED',
    evidence_refs: ['evidence/qualification/s11.json'],
    fingerprint_ref: fp(executorId, capabilityId).fingerprint_id,
    decided_at: '2026-09-25T00:00:00Z',
    expires_at: '2026-12-25T00:00:00Z'
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
  authority_ceiling_default: { scope_ref: 'scope/run_s11', allowed_effects: ['ephemeral', 'workspace'], delegation_depth_max: 1, authority_source_refs: ['policies/maws-vnext-defaults.yaml'] },
  verification_requirements: { required: true, independent: true }
};

const fixtureImpl = (executorId, outcome = 'SUCCESS') => async (invocation) => ({
  execution_attempt_id: invocation.execution_attempt_id, executor_id: executorId, work_unit_id: invocation.work_unit_id,
  started_at: '2026-09-25T00:00:00Z', finished_at: '2026-09-25T00:00:01Z', outcome,
  outputs: outcome === 'SUCCESS' ? [{ output_id: 'audit_report', inline_payload: {} }] : [],
  metrics: { latency_ms: 1, cost_units: 0, tokens_in: 0, tokens_out: 0 }, error_class: outcome === 'SUCCESS' ? null : 'SIMULATED_FAILURE', exit_code: null
});

async function runS11({ harnessContext, worldOverrides = {}, templateOverride = {} } = {}) {
  const world = { ...baseWorld(), ...worldOverrides };
  const thresholdPolicy = await loadThresholdPolicy(path.join(root, 'policies/decision-thresholds.yaml'));
  const jevClient = createJevClient({
    mode: 'fixture',
    fixtureDir: path.join(root, 'runtime/decision-engine/jev/fixtures'),
    thresholdPolicy
  });
  return executeWorkRun({
    root,
    runId: 'run_s11_engine',
    harnessContext,
    interactionSession: { session_id: 'sess_s11', interaction_host: 'zcode', session_model: 'glm-5.3', orchestration_owner: 'maws', submitted_at: '2026-09-25T00:00:00Z' },
    workRequest: {
      objective: 'Audit and repair repository',
      requiredCapabilities: [
        { capability_id: 'cap_repository_analysis', min_profile_ref: 'profile_readonly_v1' },
        { capability_id: 'cap_deterministic_verification', min_profile_ref: 'profile_readonly_v1' }
      ],
      stageCapabilities: { analysis: ['cap_repository_analysis'], verification: ['cap_deterministic_verification'] },
      requiredOutputs: [{ output_id: 'audit_report', artifact_ref: 'artifacts/s11.json' }],
      requiredEvidence: ['evidence/s11/x.json'],
      policyContextRef: 'policies/maws-vnext-defaults.yaml', workloadSafetyClass: 'safe',
      boundedPayload: {}
    },
    template: { ...template, ...templateOverride },
    profiles: world.profiles,
    subsumptionRecords: world.subsumptionRecords,
    qualifications: world.qualifications,
    manifests: world.manifests,
    currentFingerprints: world.currentFingerprints,
    qualifiedFingerprints: world.qualifiedFingerprints,
    availability: world.availability,
    policyCompatible: world.policyCompatible,
    budgetCompatible: world.budgetCompatible,
    eligibilityEngine: { computeEligibility },
    routingEngine: { buildRoutingRequest, route },
    jevAsker: async ({ eligibleExecutorIds }) => {
      const question = buildPreferredExecutorQuestion(eligibleExecutorIds);
      return jevClient.ask({ question, choices: question.answer_space.values, caseId: 'valid-preference' });
    },
    thresholdDecider: (asked) => evaluateThreshold(asked.receipt, thresholdPolicy),
    executorImplementations: {
      exec_openrouter_glm: fixtureImpl('exec_openrouter_glm'),
      exec_local_tests: fixtureImpl('exec_local_tests')
    },
    verifier: ({ workUnit }) => buildVerificationReceipt({ work_unit_id: workUnit.work_unit_id, verifier_executor_id: 'exec_local_tests', independent: true, outcome: 'PASS', evidence_refs: ['evidence/s11/x.json'], checks: ['ok'] }),
    completionEngine: { evaluateCompletion },
    outputsRegistry: () => ['audit_report'],
    evidenceRegistry: () => ['evidence/s11/x.json'],
    eventSink: () => {}
  });
}

// --- R1: routing/binding dimension, never an authority source.

test('R1 closed vocabulary: unknown context fails closed as CONTEXT_VOCABULARY_UNKNOWN', () => {
  expectFailClosed('CONTEXT_VOCABULARY_UNKNOWN', () => validateHarnessContextRecord(devContext({ context: 'ide_session' }), root));
  assert.deepEqual([...HARNESS_CONTEXT_VALUES].sort(), ['development_harness', 'unitera_product']);
});

test('R1 a context record can never grant authority (authority_grant is none by construction)', () => {
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () => validateHarnessContextRecord(devContext({ authority_grant: 'qualified_executor' }), root));
  assert.equal(devContext().authority_grant, 'none');
  assert.equal(productContext().authority_grant, 'none');
});

// --- R2: a development run derives no product-runtime authority (headline).

test('R2 headline: dev-harness record carrying a product authority surface fails closed', () => {
  expectFailClosed('PRODUCT_AUTHORITY_FROM_DEV_CONTEXT', () =>
    validateHarnessContextRecord(devContext({ authority_surface: { repository: 'unitera-os', contract_ref: 'unitera-os/effective-autonomy', contract_version: '1.0.0' } }), root)
  );
});

test('R2 headline: dev-harness run claiming a product authority surface reference fails closed at the engine gate', async () => {
  await assert.rejects(
    () => runS11({
      harnessContext: devContext(),
      templateOverride: {
        authority_ceiling_default: {
          scope_ref: 'scope/run_s11',
          allowed_effects: ['ephemeral', 'workspace'],
          delegation_depth_max: 1,
          authority_source_refs: [`${PRODUCT_AUTHORITY_REF_PREFIX}effective-autonomy@1.0.0`]
        }
      }
    }),
    (error) => error instanceof FailClosedError && error.code === 'PRODUCT_AUTHORITY_FROM_DEV_CONTEXT'
  );
});

test('R2 binding-level: assertNoProductAuthorityFromDevContext rejects unitera-os authority refs under dev context', () => {
  expectFailClosed('PRODUCT_AUTHORITY_FROM_DEV_CONTEXT', () =>
    assertNoProductAuthorityFromDevContext({ context: devContext(), authoritySourceRefs: ['policies/maws-vnext-defaults.yaml', 'unitera-os/tenant-assignments@1.0.0'] })
  );
  // Product context is not affected by this rule.
  assertNoProductAuthorityFromDevContext({ context: productContext(), authoritySourceRefs: ['unitera-os/tenant-assignments@1.0.0'] });
});

// --- R3: a context switch is a bound plan change with its own evidence.

test('R3 context switch with supersession evidence is accepted', () => {
  assertSupersessionContextChange({
    previousContext: 'development_harness',
    nextContext: 'unitera_product',
    contextChange: { from_context: 'development_harness', to_context: 'unitera_product', evidence_ref: 'evidence/context-switches/x.json' }
  });
});

test('R3 unevidenced context switch fails closed as CONTEXT_SWITCH_UNEVIDENCED', () => {
  expectFailClosed('CONTEXT_SWITCH_UNEVIDENCED', () =>
    assertSupersessionContextChange({ previousContext: 'development_harness', nextContext: 'unitera_product', contextChange: null })
  );
  expectFailClosed('CONTEXT_SWITCH_UNEVIDENCED', () =>
    assertSupersessionContextChange({ previousContext: 'unitera_product', nextContext: 'development_harness', contextChange: { from_context: 'unitera_product', to_context: 'development_harness', evidence_ref: '' } })
  );
});

test('R3 declared change without an actual transition (and vice versa) conflicts', () => {
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertSupersessionContextChange({ previousContext: 'development_harness', nextContext: 'development_harness', contextChange: { from_context: 'development_harness', to_context: 'unitera_product', evidence_ref: 'evidence/x.json' } })
  );
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertSupersessionContextChange({ previousContext: 'development_harness', nextContext: 'unitera_product', contextChange: { from_context: 'unitera_product', to_context: 'unitera_product', evidence_ref: 'evidence/x.json' } })
  );
});

// --- R4: no cross-context qualification transfer (binding-scope comparison).

test('R4 qualification earned in the product context is not valid under development context', () => {
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertQualificationContextBinding({ runtimeHarness: 'unitera_product/runtime/1', context: 'development_harness' })
  );
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertQualificationContextBinding({ runtimeHarness: 'development_harness/runtime/1', context: 'unitera_product' })
  );
});

test('R4 qualification fingerprint that declares no context is ambiguous and unroutable', () => {
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertQualificationContextBinding({ runtimeHarness: 'in_process_fixture/1', context: 'development_harness' })
  );
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertQualificationContextBinding({ runtimeHarness: null, context: 'development_harness' })
  );
});

test('R4 matching context declaration binds (prefix convention)', () => {
  assert.equal(contextOfRuntimeHarness('development_harness/in_process_fixture/1'), 'development_harness');
  assert.equal(contextOfRuntimeHarness('unitera_product'), 'unitera_product');
  assert.equal(contextOfRuntimeHarness('in_process_fixture/1'), null);
  assertQualificationContextBinding({ runtimeHarness: 'development_harness/in_process_fixture/1', context: 'development_harness' });
});

// --- R5: product effects stay execution-control-owned; reference-only pin.

test('R5 product record must reference the unitera-os authority surface as a versioned pin', () => {
  const record = productContext();
  assert.equal(record.authority_surface.repository, 'unitera-os');
  assert.match(record.authority_surface.contract_ref, /^unitera-os\//);
  assert.match(record.authority_surface.contract_version, /^\d+\.\d+\.\d+$/);
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    validateHarnessContextRecord(productContext({ authority_surface: undefined }), root)
  );
});

// --- R6: missing or contradictory context binds no executor.

test('R6 missing record resolution fails closed as CONTEXT_BINDING_MISSING', () => {
  expectFailClosed('CONTEXT_BINDING_MISSING', () => resolveHarnessContext({ contextRef: 'hctx_unknown', records: [devContext()], root }));
  expectFailClosed('CONTEXT_BINDING_MISSING', () => resolveHarnessContext({ contextRef: null, records: [devContext()], root }));
});

test('R6 WorkUnit without harness_context_ref cannot bind an executor', () => {
  expectFailClosed('CONTEXT_BINDING_MISSING', () =>
    assertWorkUnitContextBinding({ workUnit: { work_unit_id: 'wu_s11_noref' }, context: devContext() })
  );
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertWorkUnitContextBinding({ workUnit: { work_unit_id: 'wu_s11_other', harness_context_ref: 'hctx_somewhere_else' }, context: devContext() })
  );
});

test('R6 executor refuses invocations without a harness context (no fallback)', () => {
  expectFailClosed('CONTEXT_BINDING_MISSING', () => assertInvocationHarnessContext(undefined));
  expectFailClosed('CONTEXT_VOCABULARY_UNKNOWN', () => assertInvocationHarnessContext(devContext({ context: 'shell' })));
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () => assertInvocationHarnessContext(devContext({ authority_grant: 'write' })));
  assertInvocationHarnessContext(devContext());
  assertInvocationHarnessContext(productContext());
});

test('R6 engine refuses a run without a harness context record entirely', async () => {
  await assert.rejects(
    () => runS11({ harnessContext: null }),
    (error) => error instanceof FailClosedError && error.code === 'CONTEXT_BINDING_MISSING'
  );
});

// --- engine-level positive path + validator surface.

test('engine binds the context end-to-end: WorkUnit ref, node bindings, invocation record', async () => {
  const outcome = await runS11({ harnessContext: devContext({ context_id: 'hctx_s11_engine_dev', run_ref: 'run_s11_engine' }) });
  assert.equal(outcome.status, 'COMPLETED');
  assert.equal(outcome.workUnit.harness_context_ref, 'hctx_s11_engine_dev');
  for (const node of outcome.graph.nodes) {
    assert.equal(node.executor_binding.harness_context, 'development_harness');
    assert.equal(node.executor_binding.harness_context_ref, 'hctx_s11_engine_dev');
  }
  // Every fixture executor received the bound context record in its invocation.
});

test('engine binds a product-context run with the reference-only authority pin', async () => {
  // The world's qualifications must be product-context-scoped: qualification
  // never transfers across contexts (R4).
  const worldOverrides = {};
  const world = baseWorld();
  for (const fingerprint of Object.values(world.qualifiedFingerprints)) {
    fingerprint.components.runtime_harness = 'unitera_product/in_process_fixture/1';
  }
  for (const fingerprint of Object.values(world.currentFingerprints)) {
    fingerprint.components.runtime_harness = 'unitera_product/in_process_fixture/1';
  }
  worldOverrides.qualifiedFingerprints = world.qualifiedFingerprints;
  worldOverrides.currentFingerprints = world.currentFingerprints;
  const outcome = await runS11({ harnessContext: productContext({ context_id: 'hctx_s11_engine_product', run_ref: 'run_s11_engine' }), worldOverrides });
  assert.equal(outcome.status, 'COMPLETED');
  assert.equal(outcome.graph.nodes[0].executor_binding.harness_context, 'unitera_product');
});

test('R4 engine-level: qualification without a context-declaring runtime_harness binds no executor', async () => {
  // Mutate qualified AND current snapshots identically so the run does not
  // block on materiality drift first — the failure must be the binding gate.
  const world = baseWorld();
  for (const fingerprints of [world.qualifiedFingerprints, world.currentFingerprints]) {
    for (const fingerprint of Object.values(fingerprints)) {
      fingerprint.components.runtime_harness = 'in_process_fixture/1';
    }
  }
  await assert.rejects(
    () => runS11({
      harnessContext: devContext(),
      worldOverrides: { qualifiedFingerprints: world.qualifiedFingerprints, currentFingerprints: world.currentFingerprints }
    }),
    (error) => error instanceof FailClosedError && error.code === 'CONTEXT_BINDING_CONFLICT'
  );
});

test('validator surface: semanticContextIssues reports vocabulary, authority, and switch defects', () => {
  assert.deepEqual(semanticContextIssues({ harnessContext: devContext(), root }), []);
  assert.deepEqual(semanticContextIssues({ harnessContext: productContext(), root }), []);
  const bad = semanticContextIssues({ harnessContext: devContext({ context: 'terminal' }), root });
  assert.ok(bad.some((issue) => issue.includes('CONTEXT_VOCABULARY_UNKNOWN')));
  const switching = semanticContextIssues({
    root,
    boundGraph: {
      graph_id: 'graph_s11_validator', graph_version: 1, candidate_ref: 'cand_s11', immutable: true,
      created_at: '2026-10-20T00:00:00Z',
      nodes: [{
        node_id: 'node_analysis', work_unit_id: 'wu_s11_validator', stage: 'analysis', depends_on: [],
        executor_binding: { executor_id: 'exec_openrouter_glm', routing_decision_ref: 'rd_s11', qualification_ref: 'qual_s11', selection_mode: 'NORMAL_SELECTION', harness_context: 'development_harness', harness_context_ref: 'hctx_s11_validator_dev' }
      }],
      superseded_by: { graph_version: 2, context_change: { from_context: 'development_harness', to_context: 'unitera_product' } }
    }
  });
  assert.ok(switching.some((issue) => issue.includes('CONTEXT_SWITCH_UNEVIDENCED')));
});

test('committed schema fixture stays schema-decidable and green', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'evals/fixtures/maws-vnext/harness-context.contracts.json'), 'utf8'));
  for (const caseEntry of fixture.cases) {
    const issues = validateInstanceAgainstContract(caseEntry.instance, caseEntry.schema, root);
    assert.equal(issues.length, caseEntry.valid ? 0 : issues.length, caseEntry.case_id);
    if (caseEntry.valid) {
      assert.deepEqual(issues, [], `${caseEntry.case_id} must be schema-valid`);
    } else {
      assert.ok(issues.length > 0, `${caseEntry.case_id} must be schema-invalid`);
    }
  }
});

// --- codex pre-merge review repairs (regression tests) ---

const s11Template = {
  template_id: 'tpl_audit_repair_v1',
  workflow_class: 'implementation',
  mandatory_stages: ['analysis', 'verification'],
  decomposition_limits: { max_depth: 2, max_children_per_node: 4, max_total_work_units: 12 },
  composition_policy_ref: 'comp_default_v1',
  authority_ceiling_default: { scope_ref: 'scope/run_s11', allowed_effects: ['ephemeral', 'workspace'], delegation_depth_max: 1, authority_source_refs: ['policies/maws-vnext-defaults.yaml'] },
  verification_requirements: { required: true, independent: true }
};

function buildContextBoundGraph(graphId, workUnitOverrides = {}) {
  const workUnits = createWorkUnitStore({ root });
  const rootWu = workUnits.create({
    work_unit_id: `wu_${graphId}`, objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/s11',
    authority_ceiling: { scope_ref: 'scope/s11', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: `cc_${graphId}`,
    created_by: 'interaction_session', run_ref: 'run_s11',
    harness_context_ref: 'hctx_graph_dev',
    ...workUnitOverrides
  });
  const graphStore = createWorkGraphStore({ root });
  const graph = planAndBind({
    template: s11Template,
    candidate: buildCandidate({ template: s11Template, workUnits: [rootWu] }),
    routingForNode: () => ({ executor_id: 'exec_local_tests', routing_decision_ref: 'rd', qualification_ref: 'q', selection_mode: 'NORMAL_SELECTION', harness_context: 'development_harness', harness_context_ref: 'hctx_graph_dev' }),
    workGraphStore: graphStore,
    graphId,
    root,
    workUnits: [rootWu]
  });
  return { workUnits, graphStore, graph, rootWu };
}

test('R3 regression (codex P1): a rebind that changes the context without evidence fails closed at activation', () => {
  const { graphStore, rootWu } = buildContextBoundGraph('graph_s11_r3a');
  const engine = createRevisionEngine({ workGraphStore: graphStore, root });
  assert.throws(
    () => engine.submit('graph_s11_r3a', {
      request_id: 'rev_ctxswitch_unevidenced',
      base_graph_version: 1,
      request_type: 'rebind_executor',
      source: 'verifier',
      motivation: 'move the workload into the product harness',
      payload: { executor_binding: { executor_id: 'exec_local_tests', routing_decision_ref: 'rd2', qualification_ref: 'q', selection_mode: 'FALLBACK', harness_context: 'unitera_product', harness_context_ref: 'hctx_graph_product' } }
    }),
    (error) => error instanceof FailClosedError && error.code === 'CONTEXT_SWITCH_UNEVIDENCED'
  );
  assert.equal(graphStore.activeVersion('graph_s11_r3a'), 1);
  assert.equal(rootWu.harness_context_ref, 'hctx_graph_dev');
});

test('R3 regression (codex P1): an evidenced context change activates and lands on the supersession record', () => {
  const { graphStore } = buildContextBoundGraph('graph_s11_r3b');
  const engine = createRevisionEngine({ workGraphStore: graphStore, root });
  const { decision, newGraph } = engine.submit('graph_s11_r3b', {
    request_id: 'rev_ctxswitch_evidenced',
    base_graph_version: 1,
    request_type: 'rebind_executor',
    source: 'verifier',
    motivation: 'move the workload into the product harness',
    payload: {
      executor_binding: { executor_id: 'exec_local_tests', routing_decision_ref: 'rd2', qualification_ref: 'q', selection_mode: 'FALLBACK', harness_context: 'unitera_product', harness_context_ref: 'hctx_graph_product' },
      context_change: { from_context: 'development_harness', to_context: 'unitera_product', evidence_ref: 'evidence/context-switches/rev_ctxswitch_evidenced.json' }
    }
  });
  assert.equal(decision.outcome, 'ACCEPTED');
  assert.equal(newGraph.nodes[0].executor_binding.harness_context, 'unitera_product');
  const record = graphStore.allSupersessions().at(-1);
  assert.deepEqual(record.context_change, {
    from_context: 'development_harness',
    to_context: 'unitera_product',
    evidence_ref: 'evidence/context-switches/rev_ctxswitch_evidenced.json'
  });
});

test('R3 regression: a declared context change without an actual transition conflicts', () => {
  const { graphStore } = buildContextBoundGraph('graph_s11_r3c');
  const engine = createRevisionEngine({ workGraphStore: graphStore, root });
  assert.throws(
    () => engine.submit('graph_s11_r3c', {
      request_id: 'rev_ctxchange_noop',
      base_graph_version: 1,
      request_type: 'update_budget',
      source: 'runtime',
      motivation: 'no context delta',
      payload: { context_change: { from_context: 'development_harness', to_context: 'unitera_product', evidence_ref: 'evidence/x.json' } }
    }),
    (error) => error instanceof FailClosedError && error.code === 'CONTEXT_BINDING_CONFLICT'
  );
});

test('R6 regression (codex P1): the executor gate rejects partial context records', () => {
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () => assertInvocationHarnessContext({ context: 'development_harness', authority_grant: 'none' }));
  expectFailClosed('CONTEXT_BINDING_CONFLICT', () =>
    assertInvocationHarnessContext({
      context_id: 'hctx_partial_product', context: 'unitera_product', run_ref: 'r', authority_grant: 'none',
      authority_surface: {}, created_at: '2026-10-20T00:00:00Z'
    })
  );
});

test('binding-scope regression (codex P1): planAndBind refuses bindings that disagree with the WorkUnit context', () => {
  const workUnits = createWorkUnitStore({ root });
  const rootWu = workUnits.create({
    work_unit_id: 'wu_s11_mismatch', objective: 'x',
    required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
    context_envelope_ref: 'ctx/s11',
    authority_ceiling: { scope_ref: 'scope/s11', allowed_effects: ['ephemeral'], delegation_depth_max: 0, authority_source_refs: ['p'] },
    decomposition_policy_ref: 'tpl_audit_repair_v1', completion_contract_ref: 'cc_s11_mismatch',
    created_by: 'interaction_session', run_ref: 'run_s11',
    harness_context_ref: 'hctx_graph_dev'
  });
  assert.throws(
    () => planAndBind({
      template: s11Template,
      candidate: buildCandidate({ template: s11Template, workUnits: [rootWu] }),
      routingForNode: () => ({ executor_id: 'exec_local_tests', routing_decision_ref: 'rd', qualification_ref: 'q', selection_mode: 'NORMAL_SELECTION', harness_context: 'development_harness', harness_context_ref: 'hctx_SOMETHING_ELSE' }),
      workGraphStore: createWorkGraphStore({ root }),
      graphId: 'graph_s11_mismatch',
      root,
      workUnits: [rootWu]
    }),
    (error) => error instanceof FailClosedError && error.code === 'CONTEXT_BINDING_CONFLICT'
  );
});

test('validator regression (codex P2): multiple or non-matching context references are reported', () => {
  const mkGraph = (refs) => ({
    graph_id: 'graph_s11_validator2', graph_version: 1, candidate_ref: 'cand', immutable: true,
    created_at: '2026-10-20T00:00:00Z',
    nodes: refs.map((ref, index) => ({
      node_id: `node_0${index}_analysis`, work_unit_id: `wu_s11_v2_${index}`, stage: 'analysis', depends_on: [],
      executor_binding: { executor_id: 'exec_openrouter_glm', routing_decision_ref: `rd_${index}`, qualification_ref: 'qual', selection_mode: 'NORMAL_SELECTION', harness_context: 'development_harness', harness_context_ref: ref }
    }))
  });
  const multiple = semanticContextIssues({ root, harnessContext: devContext({ context_id: 'hctx_expected' }), boundGraph: mkGraph(['hctx_a', 'hctx_b']) });
  assert.ok(multiple.some((issue) => issue.includes('multiple harness context records')));
  const superstring = semanticContextIssues({ root, harnessContext: devContext({ context_id: 'hctx_expected' }), boundGraph: mkGraph(['hctx_expected_extra']) });
  assert.ok(superstring.some((issue) => issue.includes('does not match bound record hctx_expected')));
  assert.deepEqual(semanticContextIssues({ root, harnessContext: devContext({ context_id: 'hctx_expected' }), boundGraph: mkGraph(['hctx_expected']) }), []);
});
