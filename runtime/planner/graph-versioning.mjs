// MAWS vNext planner — graph versioning (OD-02/OD-05/OD-13).
// Candidate graphs carry structure only; binding produces an immutable,
// versioned BoundExecutionGraph. Every binding references a routing decision
// and a qualification record.
import { nowIso } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { deepFreeze } from './work-unit-store.mjs';

const BOUND_GRAPH_CONTRACT = 'core/contracts/bound-execution-graph.schema.json';

export function validateCandidateGraph(candidate, template) {
  const issues = [];
  const stages = new Set(candidate.nodes.map((node) => node.stage));
  for (const stage of template.mandatory_stages) {
    if (!stages.has(stage)) {
      issues.push(`candidate graph is missing mandatory stage "${stage}"`);
    }
  }
  const nodeIds = new Set(candidate.nodes.map((node) => node.node_id));
  for (const node of candidate.nodes) {
    for (const dependency of node.depends_on) {
      if (!nodeIds.has(dependency)) {
        issues.push(`node ${node.node_id} depends on unknown node ${dependency}`);
      }
    }
  }
  if (candidate.template_ref !== template.template_id) {
    issues.push(`candidate references template ${candidate.template_ref}, expected ${template.template_id}`);
  }
  return issues;
}

export function bindGraph({ candidate, bindings, graphId, graphVersion, root, createdAt = nowIso() }) {
  const bindingByNode = new Map(bindings.map((binding) => [binding.node_id, binding.executor_binding]));
  const nodes = candidate.nodes.map((node) => {
    const executorBinding = bindingByNode.get(node.node_id);
    if (!executorBinding) {
      throw new Error(`missing executor binding for node ${node.node_id}`);
    }
    return {
      node_id: node.node_id,
      work_unit_id: node.work_unit_id,
      stage: node.stage,
      depends_on: [...node.depends_on],
      executor_binding: executorBinding
    };
  });
  const graph = {
    graph_id: graphId,
    graph_version: graphVersion,
    candidate_ref: candidate.candidate_id,
    nodes,
    immutable: true,
    created_at: createdAt
  };
  const issues = validateInstanceAgainstContract(graph, BOUND_GRAPH_CONTRACT, root);
  if (issues.length > 0) {
    throw new Error(`bound graph violates contract: ${issues.join('; ')}`);
  }
  return deepFreeze(graph);
}
