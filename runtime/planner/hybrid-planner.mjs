// MAWS vNext planner — hybrid planner (OD-02).
// The workflow template owns mandatory stages and constraints; the planner
// proposes structure (CandidateGraph) and binds executors inside that
// envelope through deterministic routing. The planner never grants authority.
import { newId, FailClosedError } from '../vnext/util.mjs';
import { validateCandidateGraph, bindGraph } from './graph-versioning.mjs';

export function buildCandidate({ template, workUnits, stageWorkUnitMap = {} }) {
  const rootWorkUnit = workUnits[0];
  if (!rootWorkUnit) {
    throw new FailClosedError('PLANNER_NO_WORK_UNITS', 'candidate construction requires at least one work unit');
  }
  const knownIds = new Set(workUnits.map((workUnit) => workUnit.work_unit_id));
  for (const [stage, workUnitId] of Object.entries(stageWorkUnitMap)) {
    if (!template.mandatory_stages.includes(stage)) {
      throw new FailClosedError('PLANNER_STAGE_UNKNOWN', `stage ${stage} is not part of template ${template.template_id}`);
    }
    if (!knownIds.has(workUnitId)) {
      throw new FailClosedError('PLANNER_WORK_UNIT_UNKNOWN', `stage ${stage} references unknown work unit ${workUnitId}`);
    }
  }

  let previousNodeId = null;
  const nodes = template.mandatory_stages.map((stage, index) => {
    const nodeId = `node_${index.toString().padStart(2, '0')}_${stage}`;
    const node = {
      node_id: nodeId,
      work_unit_id: stageWorkUnitMap[stage] || rootWorkUnit.work_unit_id,
      stage,
      depends_on: previousNodeId ? [previousNodeId] : [],
      status: 'candidate'
    };
    previousNodeId = nodeId;
    return node;
  });

  return {
    candidate_id: newId('cand'),
    template_ref: template.template_id,
    root_work_unit_id: rootWorkUnit.work_unit_id,
    nodes,
    validation: { checked: false, result: 'pending' }
  };
}

// Deterministic gates run BEFORE any binding; a candidate that fails the
// template cannot be bound at all. `workUnits` (optional but strongly
// recommended) enables the S11 binding-scope check: every bound node's
// executor binding must reference the SAME harness context record as its
// WorkUnit.
export function planAndBind({ template, candidate, routingForNode, workGraphStore, graphId, root, createdAt, workUnits, harnessContext }) {
  const issues = validateCandidateGraph(candidate, template);
  if (issues.length > 0) {
    throw new FailClosedError('CANDIDATE_INVALID', issues.join('; '));
  }

  // S11: the WorkUnit collection and the validated HarnessContext record
  // are REQUIRED. Without them the binding gate could not compare the
  // bound (context value, record id) pair against the single source of
  // truth, and a uniform false value could be registered.
  if (!Array.isArray(workUnits)) {
    throw new FailClosedError('CONTEXT_BINDING_MISSING', 'planAndBind requires the workUnits collection; binding without WorkUnit resolution is not permitted');
  }
  if (!harnessContext || typeof harnessContext !== 'object' || harnessContext.context_id === undefined || harnessContext.context === undefined) {
    throw new FailClosedError('CONTEXT_BINDING_MISSING', 'planAndBind requires the validated harnessContext record; binding without context resolution is not permitted');
  }
  const workUnitById = new Map(
    workUnits.filter((workUnit) => workUnit && typeof workUnit === 'object').map((workUnit) => [workUnit.work_unit_id, workUnit])
  );

  const bindings = [];
  for (const node of candidate.nodes) {
    const executorBinding = routingForNode(node);
    if (!executorBinding || typeof executorBinding.executor_id !== 'string') {
      throw new FailClosedError('ROUTING_BINDING_MISSING', `routing produced no binding for node ${node.node_id}`);
    }
    const workUnit = workUnitById.get(node.work_unit_id);
    if (!workUnit) {
      throw new FailClosedError('CONTEXT_BINDING_MISSING', `candidate node ${node.node_id} references work unit ${node.work_unit_id}, which was not provided for binding resolution`);
    }
    if (typeof workUnit.harness_context_ref !== 'string' || workUnit.harness_context_ref.length === 0) {
      throw new FailClosedError('CONTEXT_BINDING_MISSING', `work unit ${workUnit.work_unit_id} carries no harness_context_ref; it cannot bind an executor`);
    }
    if (workUnit.harness_context_ref !== harnessContext.context_id) {
      throw new FailClosedError(
        'CONTEXT_BINDING_CONFLICT',
        `work unit ${workUnit.work_unit_id} declares context "${workUnit.harness_context_ref}" but the run is bound to "${harnessContext.context_id}"`
      );
    }
    if (executorBinding.harness_context !== harnessContext.context || executorBinding.harness_context_ref !== harnessContext.context_id) {
      throw new FailClosedError(
        'CONTEXT_BINDING_CONFLICT',
        `node ${node.node_id} binds ("${executorBinding.harness_context}", "${executorBinding.harness_context_ref}") but the validated record is ("${harnessContext.context}", "${harnessContext.context_id}")`
      );
    }
    bindings.push({ node_id: node.node_id, executor_binding: executorBinding });
  }

  const graph = bindGraph({
    candidate,
    bindings,
    graphId,
    graphVersion: (workGraphStore.activeVersion(graphId) || 0) + 1,
    root,
    createdAt
  });
  workGraphStore.registerVersion(graph);
  return graph;
}
