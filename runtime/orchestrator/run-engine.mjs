// MAWS vNext orchestrator — the governed run pipeline (Phases 2..7 wiring).
// Pipeline: intake -> deterministic envelope -> eligibility -> Jev bounded
// preference -> routing -> BoundExecutionGraph -> execution -> verification
// -> CompletionContract -> evidence. Every stage emits a spine event; every
// decision artifact is validated against its canonical contract.
// All collaborators are injected: the engine itself owns no authority,
// no transport, and no Jev client construction.
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { createWorkUnitStore, deepFreeze } from '../planner/work-unit-store.mjs';
import { createWorkGraphStore } from '../planner/work-graph-store.mjs';
import { buildCandidate, planAndBind } from '../planner/hybrid-planner.mjs';
import {
  validateHarnessContextRecord,
  assertWorkUnitContextBinding,
  assertQualificationContextBinding,
  assertNoProductAuthorityFromDevContext
} from '../harness-context/context-binding.mjs';

function validateOrThrow(instance, contract, code, root) {
  const issues = validateInstanceAgainstContract(instance, contract, root);
  if (issues.length > 0) {
    throw new FailClosedError(code, issues.join('; '));
  }
}

export async function executeWorkRun(options) {
  const {
    root,
    runId,
    interactionSession,
    workRequest,
    template,
    profiles,
    subsumptionRecords,
    qualifications,
    manifests,
    currentFingerprints = {},
    availability = {},
    policyCompatible = {},
    budgetCompatible = {},
    eligibilityEngine,
    routingEngine,
    jevAsker = null,
    thresholdDecider = null,
    executorImplementations,
    verifier,
    contextEnvelopeRef = null,
    harnessContext = null,
    eventSink = () => {},
    artifactWriter = null,
    outputsRegistry = () => [],
    evidenceRegistry = () => [],
    now = nowIso
  } = options;

  const event = (family, type, payload, correlation = {}) => {
    const envelope = {
      family,
      type,
      run_id: runId,
      occurred_at: now(),
      provenance: 'observed',
      ...correlation,
      ...payload
    };
    eventSink(envelope);
    return envelope;
  };

  // --- intake (OD-18): session is metadata; the WorkUnit never binds it.
  validateOrThrow(interactionSession, 'core/contracts/interaction-session.schema.json', 'SESSION_INVALID', root);
  event('work_unit.lifecycle', 'session_intake', { details: { interaction_host: interactionSession.interaction_host, session_model: interactionSession.session_model } });

  // --- S11: the run binds its harness context before anything else. A run
  // without a valid context record never creates a WorkUnit and never binds
  // an executor (R6; CONTEXT_BINDING_MISSING, no fallback).
  // Clone + deep-freeze: the record is engine-owned evidence from here on;
  // a mutating executor implementation must not be able to corrupt later
  // nodes or the written artifact.
  const boundContext = deepFreeze(structuredClone(validateHarnessContextRecord(harnessContext, root)));
  // The record must be bound to THIS run: a valid record naming another
  // run (or another plan graph) is a contradictory binding, not a fallback.
  if (boundContext.run_ref !== runId) {
    throw new FailClosedError('CONTEXT_BINDING_CONFLICT', `harness context record ${boundContext.context_id} is bound to run "${boundContext.run_ref}", not this run "${runId}"`);
  }
  if (boundContext.plan_graph_ref !== undefined && boundContext.plan_graph_ref !== `graph_${runId}`) {
    throw new FailClosedError('CONTEXT_BINDING_CONFLICT', `harness context record ${boundContext.context_id} references plan graph "${boundContext.plan_graph_ref}", not this run's "graph_${runId}"`);
  }
  event('harness_context', 'bound', { details: { context: boundContext.context, context_id: boundContext.context_id } });

  const workUnitStore = createWorkUnitStore({ root });
  const workUnit = workUnitStore.create({
    work_unit_id: `wu_${runId}_root`,
    objective: workRequest.objective,
    required_capabilities: workRequest.requiredCapabilities,
    // The context envelope the caller declared (S3); the synthetic fallback
    // keeps engine-only callers unchanged.
    context_envelope_ref: contextEnvelopeRef || `ctx/${runId}/envelope`,
    authority_ceiling: template.authority_ceiling_default,
    decomposition_policy_ref: template.template_id,
    completion_contract_ref: `cc_${runId}_root`,
    created_by: 'interaction_session',
    run_ref: runId,
    harness_context_ref: boundContext.context_id
  });
  assertWorkUnitContextBinding({ workUnit, context: boundContext });
  // S11 R2: a development-harness run must not present product-runtime
  // authority claims in its authority ceiling.
  assertNoProductAuthorityFromDevContext({ context: boundContext, authoritySourceRefs: workUnit.authority_ceiling.authority_source_refs });
  event('work_unit.lifecycle', 'work_unit_created', {}, { work_unit_id: workUnit.work_unit_id });

  const completionContract = {
    contract_id: `cc_${runId}_root`,
    work_unit_id: workUnit.work_unit_id,
    clauses: {
      execution_success: { required: true },
      required_outputs: workRequest.requiredOutputs || [],
      required_evidence: workRequest.requiredEvidence || [],
      verification: template.verification_requirements,
      dependency_closure: { required: true },
      child_closure: { required: true },
      disagreement_closure: [],
      graph_conditions: [{ condition: 'all_nodes_completed', expected: true }]
    }
  };
  validateOrThrow(completionContract, 'core/contracts/completion-contract.schema.json', 'COMPLETION_CONTRACT_INVALID', root);

  // --- deterministic envelope: eligibility per capability requirement.
  // Stage-specific capability requirements (when declared) join the union so
  // every node's routing has a deterministic qualification basis.
  const requirementSet = new Map();
  for (const requirement of workUnit.required_capabilities) {
    requirementSet.set(requirement.capability_id, requirement);
  }
  for (const stageCapabilities of Object.values(workRequest.stageCapabilities || {})) {
    for (const capabilityId of stageCapabilities) {
      if (!requirementSet.has(capabilityId)) {
        requirementSet.set(capabilityId, { capability_id: capabilityId });
      }
    }
  }
  const eligibilityDecisions = [];
  // capability_id -> Map(executor_id -> qualification_ref)
  const eligibilityByCapability = new Map();
  for (const requirement of requirementSet.values()) {
    const decisions = eligibilityEngine.computeEligibility({
      workUnit,
      capabilityRequirement: requirement,
      manifests,
      qualifications,
      profiles,
      subsumptionRecords,
      currentFingerprints,
      qualifiedFingerprints: options.qualifiedFingerprints,
      availability,
      policyCompatible,
      budgetCompatible,
      now: now()
    });
    const perCapability = new Map();
    for (const decision of decisions) {
      eligibilityDecisions.push(decision);
      event('eligibility', 'decision', { details: { eligible: decision.eligible, exclusion_reasons: decision.exclusion_reasons } }, { work_unit_id: workUnit.work_unit_id, executor_id: decision.executor_id });
      if (decision.eligible) {
        perCapability.set(decision.executor_id, decision.qualification_ref);
      }
    }
    eligibilityByCapability.set(requirement.capability_id, perCapability);
  }
  const eligibleExecutorIds = [...new Set([...eligibilityByCapability.values()].flatMap((entries) => [...entries.keys()]))];
  if (eligibleExecutorIds.length === 0) {
    event('routing', 'no_eligible_executor', { outcome: 'BLOCKED' });
    return { runId, status: 'BLOCKED', blockingReason: 'NO_ELIGIBLE_EXECUTOR', eligibilityDecisions };
  }
  // Pre-flight: every mandatory stage needs at least one eligible executor;
  // otherwise the run blocks with typed evidence instead of failing mid-plan.
  for (const stage of template.mandatory_stages) {
    const stageCapabilities = (workRequest.stageCapabilities && workRequest.stageCapabilities[stage]) || workUnit.required_capabilities.map((requirement) => requirement.capability_id);
    const stageEligible = new Set(stageCapabilities.flatMap((capabilityId) => [...(eligibilityByCapability.get(capabilityId) || []).keys()]));
    if (stageEligible.size === 0) {
      event('routing', 'no_eligible_executor_for_stage', { outcome: 'BLOCKED', details: { stage } });
      return {
        runId,
        status: 'BLOCKED',
        blockingReason: 'NO_ELIGIBLE_EXECUTOR_FOR_STAGE',
        blockingStage: stage,
        eligibilityDecisions
      };
    }
  }

  // --- Jev bounded preference (OD-18): choices are ONLY the eligible set.
  let jevAnswer = null;
  if (jevAsker) {
    const asked = await jevAsker({ eligibleExecutorIds });
    if (asked && asked.ok) {
      const threshold = thresholdDecider ? thresholdDecider(asked) : { action: 'PROCEED' };
      event('planner.decision', 'jev_preference', { details: { answer: asked.answer, confidence: asked.receipt.confidence, threshold_action: threshold.action } });
      jevAnswer = {
        preferred_executor_id: asked.answer,
        receipt_ref: asked.receipt.receipt_id,
        threshold_met: threshold.action === 'PROCEED'
      };
    } else if (asked && !asked.ok) {
      event('planner.decision', 'jev_unavailable', { outcome: 'BLOCKED', details: { error_class: asked.error_class } });
    }
  }

  // --- routing + binding (OD-13): one routing decision per graph node.
  const routingDecisions = [];
  // S11 R4: qualification-vs-context comparison at binding scope. Every
  // bound qualification fingerprint must declare the bound harness context;
  // cross-context qualification never transfers and ambiguous qualification
  // (no resolvable fingerprint) binds no executor.
  // R4 compares against the QUALIFIED snapshot (the fingerprint the
  // qualification was earned under), not the current observed state;
  // current-vs-qualified drift is materiality's concern (S7).
  const fingerprintById = new Map(Object.values(options.qualifiedFingerprints || {}).map((fingerprint) => [fingerprint.fingerprint_id, fingerprint]));
  const qualificationById = new Map((qualifications || []).map((qualification) => [qualification.qualification_id, qualification]));
  const assertBindingContextForDecision = (decision) => {
    const qualification = qualificationById.get(decision.qualification_ref);
    const fingerprint = qualification ? fingerprintById.get(qualification.fingerprint_ref) : null;
    if (!fingerprint) {
      throw new FailClosedError('CONTEXT_BINDING_CONFLICT', `routing decision ${decision.decision_id} references qualification ${decision.qualification_ref} without a resolvable fingerprint; an ambiguous qualification binds no executor`);
    }
    assertQualificationContextBinding({ runtimeHarness: fingerprint.components.runtime_harness, context: boundContext.context });
  };
  const routingForNode = (node) => {
    const stageRequirements = (workRequest.stageCapabilities && workRequest.stageCapabilities[node.stage]) || workUnit.required_capabilities.map((requirement) => requirement.capability_id);
    // Per-stage deterministic eligible set: executors qualified for at least
    // one capability this stage requires. Jev and routing see ONLY this set.
    const eligibleSet = new Map();
    for (const capabilityId of stageRequirements) {
      for (const [executorId, qualificationRef] of eligibilityByCapability.get(capabilityId) || []) {
        eligibleSet.set(executorId, qualificationRef);
      }
    }
    if (eligibleSet.size === 0) {
      throw new FailClosedError('NO_ELIGIBLE_EXECUTOR_FOR_STAGE', `stage ${node.stage} has no eligible executor`);
    }
    const jevAnswerForStage = jevAnswer && eligibleSet.has(jevAnswer.preferred_executor_id) ? jevAnswer : null;
    const request = routingEngine.buildRoutingRequest({
      work_unit_id: node.work_unit_id,
      capability_requirements: stageRequirements,
      eligible: [...eligibleSet.entries()].map(([executorId, qualificationRef]) => ({ executor_id: executorId, qualification_ref: qualificationRef })),
      policy_context_ref: workRequest.policyContextRef,
      workload_safety_class: workRequest.workloadSafetyClass,
      session_model_preference: interactionSession.session_model
    });
    const decision = routingEngine.route({
      routing_request: request,
      jev_answer: jevAnswerForStage,
      scores: null,
      exploration_policy: null,
      decided_at: now()
    });
    routingDecisions.push(decision);
    event('routing', 'decision', { details: { selection_mode: decision.selection_mode } }, { work_unit_id: node.work_unit_id, executor_id: decision.selected_executor_id, routing_decision_ref: decision.decision_id });
    assertBindingContextForDecision(decision);
    return {
      executor_id: decision.selected_executor_id,
      routing_decision_ref: decision.decision_id,
      qualification_ref: decision.qualification_ref,
      selection_mode: decision.selection_mode,
      harness_context: boundContext.context,
      harness_context_ref: boundContext.context_id
    };
  };

  const graphStore = createWorkGraphStore({ root });
  const graphId = `graph_${runId}`;
  const candidate = buildCandidate({ template, workUnits: [workUnit] });
  const graph = planAndBind({ template, candidate, routingForNode, workGraphStore: graphStore, graphId, root, createdAt: now(), workUnits: [workUnit], harnessContext: boundContext });
  event('planner.decision', 'graph_bound', { details: { graph_version: graph.graph_version, nodes: graph.nodes.length } }, { work_unit_id: workUnit.work_unit_id, graph_version: graph.graph_version });
  event('executor.binding', 'bound', {}, { graph_version: graph.graph_version });

  // --- execution in dependency order (single-stage-at-a-time, deterministic).
  const executionResults = [];
  const verificationReceipts = [];
  const executed = new Set();
  const nodeStates = new Map(graph.nodes.map((node) => [node.node_id, { status: 'pending' }]));

  while (executed.size < graph.nodes.length) {
    const ready = graph.nodes.filter((node) => !executed.has(node.node_id) && node.depends_on.every((dependency) => executed.has(dependency)));
    if (ready.length === 0) {
      throw new FailClosedError('GRAPH_DEADLOCK', 'no executable node while graph is incomplete');
    }
    for (const node of ready) {
      const executorId = node.executor_binding.executor_id;
      const implementation = executorImplementations[executorId];
      if (!implementation) {
        throw new FailClosedError('EXECUTOR_IMPLEMENTATION_MISSING', `no implementation registered for ${executorId}`);
      }
      const attemptId = newId('att');
      event('execution', 'started', {}, { work_unit_id: node.work_unit_id, executor_id: executorId, graph_version: graph.graph_version, execution_attempt_id: attemptId });
      const result = await implementation({
        execution_attempt_id: attemptId,
        work_unit_id: node.work_unit_id,
        node_id: node.node_id,
        context_package: { objective: workUnit.objective, bounded_payload: workRequest.boundedPayload || {}, provenance_refs: [`run:${runId}`] },
        authority_envelope: { scope_ref: workUnit.authority_ceiling.scope_ref, allowed_effects: workUnit.authority_ceiling.allowed_effects },
        harness_context: boundContext
      });
      executionResults.push(result);
      nodeStates.set(node.node_id, { status: result.outcome === 'SUCCESS' ? 'completed' : 'failed', outcome: result.outcome });
      executed.add(node.node_id);
      event('execution', 'finished', { outcome: result.outcome, details: { error_class: result.error_class } }, { work_unit_id: node.work_unit_id, executor_id: executorId, graph_version: graph.graph_version, execution_attempt_id: attemptId });

      if (node.stage === 'verification' && result.outcome === 'SUCCESS') {
        const receipt = verifier({ workUnit, node, executionResult: result });
        verificationReceipts.push(receipt);
        event('verification', 'receipt', { outcome: receipt.outcome }, { work_unit_id: node.work_unit_id, executor_id: executorId });
      }
    }
  }

  const allNodesCompleted = [...nodeStates.values()].every((state) => state.status === 'completed');

  // --- completion (OD-17): executor success alone never completes.
  const completionDecision = options.completionEngine.evaluateCompletion({
    completion_contract: completionContract,
    execution_results: executionResults,
    verification_receipts: verificationReceipts,
    dependency_states: [],
    child_states: [],
    disagreement_decisions: [],
    graph_state: { all_nodes_completed: allNodesCompleted, active_graph_version: graph.graph_version, expected_graph_version: graph.graph_version },
    outputs_present: options.outputsRegistry(executionResults),
    evidence_present: options.evidenceRegistry(executionResults, verificationReceipts),
    decided_at: now()
  });
  event('completion', 'decision', { outcome: completionDecision.result }, { work_unit_id: workUnit.work_unit_id, graph_version: graph.graph_version });

  if (artifactWriter) {
    artifactWriter.write('interaction-session.json', interactionSession);
    artifactWriter.write('harness-context.json', boundContext);
    artifactWriter.write('work-unit.json', workUnit);
    artifactWriter.write('completion-contract.json', completionContract);
    artifactWriter.write('eligibility-decisions.json', eligibilityDecisions);
    artifactWriter.write('routing-decisions.json', routingDecisions);
    artifactWriter.write(`graph-v${graph.graph_version}.json`, graph);
    artifactWriter.write('execution-results.json', executionResults);
    artifactWriter.write('verification-receipts.json', verificationReceipts);
    artifactWriter.write('completion-decision.json', completionDecision);
  }

  return {
    runId,
    status: completionDecision.result === 'COMPLETED' ? 'COMPLETED' : 'NOT_COMPLETED',
    interactionSession,
    workUnit,
    completionContract,
    eligibilityDecisions,
    routingDecisions,
    graph,
    executionResults,
    verificationReceipts,
    completionDecision
  };
}
