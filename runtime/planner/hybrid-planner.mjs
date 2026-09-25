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
// template cannot be bound at all.
export function planAndBind({ template, candidate, routingForNode, workGraphStore, graphId, root, createdAt }) {
  const issues = validateCandidateGraph(candidate, template);
  if (issues.length > 0) {
    throw new FailClosedError('CANDIDATE_INVALID', issues.join('; '));
  }

  const bindings = [];
  for (const node of candidate.nodes) {
    const executorBinding = routingForNode(node);
    if (!executorBinding || typeof executorBinding.executor_id !== 'string') {
      throw new FailClosedError('ROUTING_BINDING_MISSING', `routing produced no binding for node ${node.node_id}`);
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
