// MAWS-VN-900 — end-to-end reference run:
// ZCode session -> MAWS intake -> deterministic envelope -> Jev bounded
// preference -> routing -> BoundExecutionGraph -> fixture executors ->
// verification -> CompletionContract -> evidence. No live credentials; all
// external transports are fixture implementations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeWorkRun } from '../../runtime/orchestrator/run-engine.mjs';
import { computeEligibility } from '../../runtime/qualification/eligibility.mjs';
import { buildRoutingRequest, route } from '../../runtime/routing/routing-engine.mjs';
import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';
import { buildPreferredExecutorQuestion } from '../../runtime/decision-engine/jev/questions/registry.mjs';
import { loadThresholdPolicy, evaluateThreshold } from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import { evaluateCompletion } from '../../runtime/completion/completion-engine.mjs';
import { buildVerificationReceipt } from '../../runtime/completion/verification.mjs';
import { loadExecutorRegistry } from '../../runtime/executors/manifest-loader.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadFixtureProfiles() {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'evals/fixtures/maws-vnext/capability-profile.contracts.json'), 'utf8'));
  const profiles = {};
  for (const caseEntry of fixture.cases) {
    if (caseEntry.instance && caseEntry.instance.profile_id && caseEntry.instance.dimensions) {
      profiles[caseEntry.instance.profile_id] = caseEntry.instance;
    }
  }
  return profiles;
}

function fingerprint(executorId, capabilityId, profileRef) {
  return {
    fingerprint_id: `fp_${executorId.replace('exec_', '')}_${capabilityId.replace('cap_', '')}`,
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: profileRef,
    components: {
      model_id: executorId === 'exec_openrouter_glm' ? 'zai/glm-4.7' : null,
      provider_id: executorId === 'exec_openrouter_glm' ? 'openrouter' : null,
      runtime_harness: 'in_process_fixture/1',
      tool_contract_refs: ['tests/vnext/e2e-reference-run.test.mjs'],
      api_surface_version: '2026-09',
      qualification_profile_ref: 'qualprofile_e2e_v1'
    },
    digest: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
  };
}

function qualification(executorId, capabilityId, profileRef, fp) {
  return {
    qualification_id: `qual_${executorId.replace('exec_', '')}_${capabilityId.replace('cap_', '')}`,
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: profileRef,
    state: 'QUALIFIED',
    evidence_refs: [`evidence/qualification/${executorId}-${capabilityId}.json`],
    fingerprint_ref: fp.fingerprint_id,
    decided_at: '2026-09-25T00:00:00Z',
    expires_at: '2026-12-25T00:00:00Z'
  };
}

function buildWorld() {
  const registryFile = loadExecutorRegistry(path.join(root, 'runtime/executors/registry.default.json'), root);
  const manifests = registryFile.executors;
  const profiles = loadFixtureProfiles();

  const fpAnalysis = fingerprint('exec_openrouter_glm', 'cap_repository_analysis', 'profile_readonly_v1');
  const fpVerify = fingerprint('exec_local_tests', 'cap_deterministic_verification', 'profile_readonly_v1');
  const qualAnalysis = qualification('exec_openrouter_glm', 'cap_repository_analysis', 'profile_readonly_v1', fpAnalysis);
  const qualVerify = qualification('exec_local_tests', 'cap_deterministic_verification', 'profile_readonly_v1', fpVerify);

  return {
    manifests,
    profiles,
    subsumptionRecords: [],
    qualifications: [qualAnalysis, qualVerify],
    qualifiedFingerprints: {
      exec_openrouter_glm: fpAnalysis,
      exec_local_tests: fpVerify
    },
    currentFingerprints: {
      exec_openrouter_glm: fpAnalysis,
      exec_local_tests: fpVerify
    },
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
  authority_ceiling_default: {
    scope_ref: 'scope/run_e2e',
    allowed_effects: ['ephemeral', 'workspace'],
    delegation_depth_max: 1,
    authority_source_refs: ['policies/maws-vnext-defaults.yaml']
  },
  verification_requirements: { required: true, independent: true }
};

async function runReferenceScenario(sessionModel, { runId = 'run_e2e_0001', artifactDir = null } = {}) {
  const world = buildWorld();
  const events = [];
  const thresholdPolicy = await loadThresholdPolicy(path.join(root, 'policies/decision-thresholds.yaml'));
  const jevClient = createJevClient({
    mode: 'fixture',
    fixtureDir: path.join(root, 'runtime/decision-engine/jev/fixtures'),
    thresholdPolicy
  });

  let artifactWriter = null;
  if (artifactDir) {
    fs.mkdirSync(artifactDir, { recursive: true });
    artifactWriter = {
      write(name, value) {
        fs.writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
      }
    };
  }

  return executeWorkRun({
    root,
    runId,
    interactionSession: {
      session_id: 'sess_zcode_e2e',
      interaction_host: 'zcode',
      session_model: sessionModel,
      orchestration_owner: 'maws',
      transport: 'local_stdio',
      identity: 'local-user',
      submitted_at: '2026-09-25T00:00:00Z'
    },
    workRequest: {
      objective: 'Audit and repair repository',
      requiredCapabilities: [
        { capability_id: 'cap_repository_analysis', min_profile_ref: 'profile_readonly_v1' },
        { capability_id: 'cap_deterministic_verification', min_profile_ref: 'profile_readonly_v1' }
      ],
      stageCapabilities: {
        analysis: ['cap_repository_analysis'],
        verification: ['cap_deterministic_verification']
      },
      requiredOutputs: [{ output_id: 'audit_report', artifact_ref: 'artifacts/runtime-runs/run_e2e_0001/outputs/audit-report.json' }],
      requiredEvidence: ['evidence/e2e/analysis-receipt.json'],
      policyContextRef: 'policies/maws-vnext-defaults.yaml',
      workloadSafetyClass: 'safe',
      boundedPayload: { repository: 'self' }
    },
    template,
    ...world,
    eligibilityEngine: { computeEligibility },
    routingEngine: { buildRoutingRequest, route },
    jevAsker: async ({ eligibleExecutorIds }) => {
      const question = buildPreferredExecutorQuestion(eligibleExecutorIds);
      return jevClient.ask({ question, choices: question.answer_space.values, caseId: 'valid-preference' });
    },
    thresholdDecider: (asked) => evaluateThreshold(asked.receipt, thresholdPolicy),
    executorImplementations: {
      exec_openrouter_glm: async (invocation) => ({
        execution_attempt_id: invocation.execution_attempt_id,
        executor_id: 'exec_openrouter_glm',
        work_unit_id: invocation.work_unit_id,
        started_at: '2026-09-25T00:00:01Z',
        finished_at: '2026-09-25T00:00:02Z',
        outcome: 'SUCCESS',
        outputs: [{ output_id: 'audit_report', inline_payload: { findings: [] } }],
        metrics: { latency_ms: 1000, cost_units: 1, tokens_in: 10, tokens_out: 10 },
        error_class: null,
        exit_code: null
      }),
      exec_local_tests: async (invocation) => ({
        execution_attempt_id: invocation.execution_attempt_id,
        executor_id: 'exec_local_tests',
        work_unit_id: invocation.work_unit_id,
        started_at: '2026-09-25T00:00:03Z',
        finished_at: '2026-09-25T00:00:04Z',
        outcome: 'SUCCESS',
        outputs: [],
        metrics: { latency_ms: 500, cost_units: 0, tokens_in: 0, tokens_out: 0 },
        error_class: null,
        exit_code: null
      })
    },
    verifier: ({ executionResult }) => buildVerificationReceipt({
      work_unit_id: executionResult.work_unit_id,
      verifier_executor_id: 'exec_local_tests',
      independent: true,
      outcome: 'PASS',
      evidence_refs: ['evidence/e2e/analysis-receipt.json'],
      checks: ['outputs_present', 'analysis_evidence_linked']
    }),
    completionEngine: { evaluateCompletion },
    eventSink: (event) => events.push(event),
    artifactWriter,
    outputsRegistry: () => ['audit_report'],
    evidenceRegistry: () => ['evidence/e2e/analysis-receipt.json'],
    now: () => '2026-09-25T00:00:00Z'
  });
}

test('reference run completes with typed Jev preference, per-stage routing, and full evidence', async () => {
  const artifactDir = path.join(root, 'artifacts/runtime-runs/run_e2e_0001');
  fs.rmSync(artifactDir, { recursive: true, force: true });
  const outcome = await runReferenceScenario('glm-5.3', { artifactDir });

  assert.equal(outcome.status, 'COMPLETED');
  assert.equal(outcome.completionDecision.result, 'COMPLETED');

  // Deterministic envelope -> distinct executors per stage; session model
  // never binds an executor (OD-18).
  const analysisNode = outcome.graph.nodes.find((node) => node.stage === 'analysis');
  const verificationNode = outcome.graph.nodes.find((node) => node.stage === 'verification');
  assert.equal(analysisNode.executor_binding.executor_id, 'exec_openrouter_glm');
  assert.equal(analysisNode.executor_binding.selection_mode, 'NORMAL_SELECTION');
  assert.ok(analysisNode.executor_binding.routing_decision_ref.length > 0);
  assert.equal(verificationNode.executor_binding.executor_id, 'exec_local_tests');
  for (const node of outcome.graph.nodes) {
    assert.notEqual(node.executor_binding.executor_id, 'glm-5.3');
    assert.ok(node.executor_binding.qualification_ref.startsWith('qual_'));
  }

  // Jev bounded decision evidence: receipt recorded, resolved model present.
  const analysisRouting = outcome.routingDecisions.find(
    (decision) => decision.selected_executor_id === 'exec_openrouter_glm'
  );
  assert.ok(analysisRouting.jev_receipt_ref, 'jev receipt must be referenced');
  assert.equal(analysisRouting.qualification_ref, 'qual_openrouter_glm_repository_analysis');

  // Eligibility closure evidence exists for both capabilities.
  assert.ok(outcome.eligibilityDecisions.some((decision) => decision.capability_id === 'cap_repository_analysis' && decision.eligible));
  assert.ok(outcome.eligibilityDecisions.some((decision) => decision.capability_id === 'cap_deterministic_verification' && decision.eligible));

  // Every decision artifact validates against its canonical contract.
  for (const decision of outcome.routingDecisions) {
    const issues = validateInstanceAgainstContract(decision, 'core/contracts/routing-decision.schema.json', root);
    assert.deepEqual(issues, []);
  }
  for (const decision of outcome.eligibilityDecisions) {
    const issues = validateInstanceAgainstContract(decision, 'core/contracts/eligibility-decision.schema.json', root);
    assert.deepEqual(issues, []);
  }
  const graphIssues = validateInstanceAgainstContract(outcome.graph, 'core/contracts/bound-execution-graph.schema.json', root);
  assert.deepEqual(graphIssues, []);
  const completionIssues = validateInstanceAgainstContract(outcome.completionDecision, 'core/contracts/completion-decision.schema.json', root);
  assert.deepEqual(completionIssues, []);

  // Evidence bundle written as run artifacts (gitignored runtime evidence).
  for (const artifact of [
    'interaction-session.json', 'work-unit.json', 'completion-contract.json',
    'eligibility-decisions.json', 'routing-decisions.json', 'graph-v1.json',
    'execution-results.json', 'verification-receipts.json', 'completion-decision.json'
  ]) {
    assert.ok(fs.existsSync(path.join(artifactDir, artifact)), `missing evidence artifact ${artifact}`);
  }
});

test('adversarial session model string never becomes an executor (OD-18)', async () => {
  const outcome = await runReferenceScenario('exec_local_tests', { runId: 'run_e2e_0002' });
  assert.equal(outcome.status, 'COMPLETED');
  const analysisNode = outcome.graph.nodes.find((node) => node.stage === 'analysis');
  assert.equal(analysisNode.executor_binding.executor_id, 'exec_openrouter_glm');
  const verificationNode = outcome.graph.nodes.find((node) => node.stage === 'verification');
  assert.equal(verificationNode.executor_binding.executor_id, 'exec_local_tests');
});

test('session model equality alone does not change routing: identical executor set for both runs', async () => {
  const first = await runReferenceScenario('glm-5.3', { runId: 'run_e2e_0003a' });
  const second = await runReferenceScenario('codex-main', { runId: 'run_e2e_0003b' });
  const executorsOf = (outcome) => outcome.graph.nodes.map((node) => node.executor_binding.executor_id).sort().join(',');
  assert.equal(executorsOf(first), executorsOf(second));
});
