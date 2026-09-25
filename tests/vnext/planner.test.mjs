import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createWorkUnitStore, deepFreeze } from '../../runtime/planner/work-unit-store.mjs';
import { createWorkGraphStore } from '../../runtime/planner/work-graph-store.mjs';
import { buildCandidate, planAndBind } from '../../runtime/planner/hybrid-planner.mjs';
import { evaluateDecompositionRequest, instantiateChildren, validateDecompositionRequest } from '../../runtime/planner/decomposition.mjs';
import { createRevisionEngine, validateRevisionRequest } from '../../runtime/planner/revision-engine.mjs';
import { arbitrate, validateArbitrationPolicy } from '../../runtime/planner/arbitration-engine.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { FailClosedError } from '../../runtime/vnext/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const template = {
  template_id: 'tpl_audit_repair_v1',
  workflow_class: 'implementation',
  mandatory_stages: ['analysis', 'implementation', 'verification'],
  decomposition_limits: { max_depth: 2, max_children_per_node: 4, max_total_work_units: 12 },
  composition_policy_ref: 'comp_default_v1',
  authority_ceiling_default: {
    scope_ref: 'scope/run_default',
    allowed_effects: ['ephemeral', 'workspace'],
    delegation_depth_max: 1,
    authority_source_refs: ['policies/maws-vnext-defaults.yaml']
  },
  verification_requirements: { required: true, independent: true }
};

const rootWorkUnitDraft = {
  work_unit_id: 'wu_audit_repo_001',
  objective: 'Audit and repair repository',
  required_capabilities: [{ capability_id: 'cap_repository_analysis' }],
  context_envelope_ref: 'ctx/run_0001/envelope',
  authority_ceiling: {
    scope_ref: 'scope/run_0001',
    allowed_effects: ['ephemeral', 'workspace'],
    delegation_depth_max: 1,
    authority_source_refs: ['policies/maws-vnext-defaults.yaml']
  },
  decomposition_policy_ref: 'tpl_audit_repair_v1',
  completion_contract_ref: 'cc_audit_repo_001',
  created_by: 'interaction_session',
  run_ref: 'run_0001'
};

const binding = {
  executor_id: 'exec_openrouter_glm',
  routing_decision_ref: 'rd_0001',
  qualification_ref: 'qual_or_glm_ana_0001',
  selection_mode: 'NORMAL_SELECTION'
};

function buildBoundGraph() {
  const workUnits = createWorkUnitStore({ root });
  const rootWorkUnit = workUnits.create(rootWorkUnitDraft);
  const graphStore = createWorkGraphStore({ root });
  const candidate = buildCandidate({ template, workUnits: [rootWorkUnit] });
  const graph = planAndBind({
    template,
    candidate,
    routingForNode: () => ({ ...binding }),
    workGraphStore: graphStore,
    graphId: 'graph_run_0001',
    root
  });
  return { workUnits, graphStore, graph, candidate };
}

test('bound graph is immutable, versioned, schema-valid, and registered as active', () => {
  const { graphStore, graph } = buildBoundGraph();
  assert.equal(Object.isFrozen(graph), true);
  assert.equal(graph.graph_version, 1);
  assert.equal(graphStore.activeVersion('graph_run_0001'), 1);
  const issues = validateInstanceAgainstContract(graph, 'core/contracts/bound-execution-graph.schema.json', root);
  assert.deepEqual(issues, []);
  assert.throws(() => { graph.nodes = []; }, TypeError);
});

test('graph store refuses to overwrite an existing version (OD-05)', () => {
  const { graphStore, graph } = buildBoundGraph();
  assert.throws(
    () => graphStore.registerVersion(graph),
    (error) => error instanceof FailClosedError && error.code === 'GRAPH_VERSION_EXISTS'
  );
});

test('candidate missing a mandatory stage cannot be bound (OD-02)', () => {
  const workUnits = createWorkUnitStore({ root });
  const rootWorkUnit = workUnits.create(rootWorkUnitDraft);
  const candidate = buildCandidate({ template, workUnits: [rootWorkUnit] });
  candidate.nodes = candidate.nodes.filter((node) => node.stage !== 'verification');
  assert.throws(
    () => planAndBind({ template, candidate, routingForNode: () => ({ ...binding }), workGraphStore: createWorkGraphStore({ root }), graphId: 'graph_x', root }),
    (error) => error instanceof FailClosedError && error.code === 'CANDIDATE_INVALID' && error.message.includes('verification')
  );
});

test('decomposition within envelope is approved and children stay subsets (OD-03/OD-04)', () => {
  const workUnits = createWorkUnitStore({ root });
  const rootWorkUnit = workUnits.create(rootWorkUnitDraft);
  const request = {
    request_id: 'decomp_0001',
    source: 'executor',
    parent_work_unit_id: 'wu_audit_repo_001',
    requested_children: [
      {
        objective: 'Analyze test failures',
        required_capabilities: ['cap_repository_analysis'],
        context_subset_ref: 'ctx/run_0001/envelope/tests',
        effects_subset: ['ephemeral'],
        authority_depth_requested: 0
      }
    ],
    limits_snapshot: { current_depth: 1, max_depth: 2, current_total_work_units: 3, max_total_work_units: 12 }
  };
  validateDecompositionRequest(request, root);
  const { decision } = evaluateDecompositionRequest({
    request,
    parentWorkUnit: rootWorkUnit,
    template,
    graphStats: { current_depth: 1, current_total_work_units: 3 },
    root
  });
  assert.equal(decision.decision, 'APPROVED');
  const decisionIssues = validateInstanceAgainstContract(decision, 'core/contracts/decomposition-decision.schema.json', root);
  assert.deepEqual(decisionIssues, []);

  const childIds = instantiateChildren({ decision, request, parentWorkUnit: rootWorkUnit, workUnitStore: workUnits });
  assert.equal(childIds.length, 1);
  const child = workUnits.get(childIds[0]);
  assert.equal(child.parent_work_unit_id, 'wu_audit_repo_001');
  assert.deepEqual(child.authority_ceiling.allowed_effects, ['ephemeral']);
  assert.ok(child.authority_ceiling.scope_ref.startsWith('scope/run_0001/'));
  const childIssues = validateInstanceAgainstContract(child, 'core/contracts/work-unit.schema.json', root);
  assert.deepEqual(childIssues, []);
});

test('decomposition exceeding limits is rejected with limits_respected false (OD-03)', () => {
  const workUnits = createWorkUnitStore({ root });
  const rootWorkUnit = workUnits.create(rootWorkUnitDraft);
  const request = {
    request_id: 'decomp_0002',
    source: 'executor',
    parent_work_unit_id: 'wu_audit_repo_001',
    requested_children: [
      { objective: 'c1', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/run_0001/envelope/a', effects_subset: ['ephemeral'], authority_depth_requested: 0 },
      { objective: 'c2', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/run_0001/envelope/b', effects_subset: ['ephemeral'], authority_depth_requested: 0 },
      { objective: 'c3', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/run_0001/envelope/c', effects_subset: ['ephemeral'], authority_depth_requested: 0 },
      { objective: 'c4', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/run_0001/envelope/d', effects_subset: ['ephemeral'], authority_depth_requested: 0 },
      { objective: 'c5', required_capabilities: ['cap_repository_analysis'], context_subset_ref: 'ctx/run_0001/envelope/e', effects_subset: ['ephemeral'], authority_depth_requested: 0 }
    ],
    limits_snapshot: { current_depth: 2, max_depth: 2, current_total_work_units: 11, max_total_work_units: 12 }
  };
  const { decision } = evaluateDecompositionRequest({ request, parentWorkUnit: rootWorkUnit, template, graphStats: { current_depth: 2, current_total_work_units: 11 }, root });
  assert.equal(decision.decision, 'REJECTED');
  assert.equal(decision.envelope_check.limits_respected, false);
});

test('revision anchored at active version is accepted and creates a new immutable version (OD-05/OD-07)', () => {
  const { graphStore } = buildBoundGraph();
  const engine = createRevisionEngine({ workGraphStore: graphStore, root });
  const request = {
    request_id: 'rev_0001',
    base_graph_version: 1,
    request_type: 'rebind_executor',
    source: 'verifier',
    motivation: 'verification failed on analysis node',
    payload: { node_id: 'node_00_analysis', executor_binding: { executor_id: 'exec_local_tests', routing_decision_ref: 'rd_0009', qualification_ref: 'qual_local_tests_verify_0001', selection_mode: 'FALLBACK' } }
  };
  validateRevisionRequest(request, root);
  const { decision, newGraph } = engine.submit('graph_run_0001', request);
  assert.equal(decision.outcome, 'ACCEPTED');
  assert.equal(decision.new_graph_version, 2);
  assert.equal(graphStore.activeVersion('graph_run_0001'), 2);
  assert.equal(graphStore.getVersion('graph_run_0001', 1).nodes.length, 3);
  assert.equal(newGraph.nodes.find((node) => node.node_id === 'node_00_analysis').executor_binding.executor_id, 'exec_local_tests');
  assert.notEqual(graphStore.getVersion('graph_run_0001', 1).nodes.find((node) => node.node_id === 'node_00_analysis').executor_binding.executor_id, 'exec_local_tests');
  const decisionIssues = validateInstanceAgainstContract(decision, 'core/contracts/plan-revision-decision.schema.json', root);
  assert.deepEqual(decisionIssues, []);
});

test('stale revision request becomes STALE with explicit revalidation and never mutates (OD-07)', () => {
  const { graphStore } = buildBoundGraph();
  const engine = createRevisionEngine({ workGraphStore: graphStore, root });
  const request = {
    request_id: 'rev_0002',
    base_graph_version: 1,
    request_type: 'rebind_executor',
    source: 'executor',
    motivation: 'late request',
    payload: { node_id: 'node_00_analysis', executor_binding: { executor_id: 'exec_local_tests', routing_decision_ref: 'rd_0010', qualification_ref: 'qual_local_tests_verify_0001', selection_mode: 'FALLBACK' } }
  };
  // advance active version to 2 first
  engine.submit('graph_run_0001', {
    request_id: 'rev_0003',
    base_graph_version: 1,
    request_type: 'update_budget',
    source: 'runtime',
    motivation: 'budget refresh',
    payload: {}
  });
  const { decision, newGraph } = engine.submit('graph_run_0001', request);
  assert.equal(decision.outcome, 'STALE');
  assert.ok(['CONFLICTING', 'OBSOLETE', 'REQUIRES_REBASE'].includes(decision.revalidation));
  assert.equal(newGraph, null);
  assert.equal(graphStore.activeVersion('graph_run_0001'), 2);
  const decisionIssues = validateInstanceAgainstContract(decision, 'core/contracts/plan-revision-decision.schema.json', root);
  assert.deepEqual(decisionIssues, []);
});

test('revision request without base version fails contract validation (OD-07)', () => {
  assert.throws(
    () => validateRevisionRequest({ request_id: 'rev_bad', request_type: 'add_node', source: 'runtime', motivation: 'x' }, root),
    (error) => error instanceof FailClosedError && error.code === 'REVISION_REQUEST_INVALID'
  );
});

test('authority conflict arbitration blocks or escalates, never synthesizes (OD-08)', () => {
  const policy = {
    policy_id: 'arb_authority_v1',
    conflict_class: 'authority_conflict',
    resolution_order: ['human_gate', 'fail_closed'],
    tie_break: 'human_gate'
  };
  validateArbitrationPolicy(policy, root);
  const blocked = arbitrate({ policy, requestRefs: ['rev_0001', 'rev_0002'], conflictInvolvesAuthority: true, root });
  assert.equal(blocked.disposition, 'BLOCKED');
  assert.equal(blocked.synthesis_used, false);
  const escalated = arbitrate({ policy, requestRefs: ['rev_0001'], conflictInvolvesAuthority: true, humanDecision: { decided_by: 'human' }, root });
  assert.equal(escalated.disposition, 'ESCALATE');
  assert.equal(escalated.resolved_by, 'human_gate');
  for (const decision of [blocked, escalated]) {
    const issues = validateInstanceAgainstContract(decision, 'core/contracts/arbitration-decision.schema.json', root);
    assert.deepEqual(issues, []);
  }
});

test('non-authority arbitration follows deterministic resolution order (OD-08)', () => {
  const policy = {
    policy_id: 'arb_revision_v1',
    conflict_class: 'revision_conflict',
    resolution_order: ['reroute', 'human_gate'],
    tie_break: 'deterministic_priority'
  };
  const decision = arbitrate({ policy, requestRefs: ['rev_0004'], conflictInvolvesAuthority: false, root });
  assert.equal(decision.disposition, 'REROUTE');
  assert.equal(decision.resolved_by, 'deterministic_policy');
});

test('activation supersession records are monotonic and schema-valid (OD-05)', () => {
  const { graphStore, allSupersessions } = { ...buildBoundGraph(), allSupersessions: null };
  const engine = createRevisionEngine({ workGraphStore: graphStore, root });
  engine.submit('graph_run_0001', {
    request_id: 'rev_0009',
    base_graph_version: 1,
    request_type: 'update_context',
    source: 'human',
    motivation: 'context refresh',
    payload: {}
  });
  const records = graphStore.allSupersessions();
  assert.ok(records.length >= 1);
  for (const record of records) {
    assert.ok(record.superseded_by_graph_version > record.superseded_graph_version);
    const issues = validateInstanceAgainstContract(record, 'core/contracts/graph-supersession-record.schema.json', root);
    assert.deepEqual(issues, []);
  }
});
