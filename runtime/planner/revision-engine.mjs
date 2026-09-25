// MAWS vNext planner — versioned revision engine (OD-06/OD-07).
// Revision requests are version-anchored; stale requests are explicitly
// revalidated (STILL_VALID / CONFLICTING / OBSOLETE / REQUIRES_REBASE) and
// never silently rebased. Accepted revisions create a NEW graph version.
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { deepFreeze } from './work-unit-store.mjs';

const REQUEST_CONTRACT = 'core/contracts/plan-revision-request.schema.json';
const DECISION_CONTRACT = 'core/contracts/plan-revision-decision.schema.json';

export function validateRevisionRequest(request, root) {
  const issues = validateInstanceAgainstContract(request, REQUEST_CONTRACT, root);
  if (issues.length > 0) {
    throw new FailClosedError('REVISION_REQUEST_INVALID', issues.join('; '));
  }
}

function applyChangeToNodes(nodes, request) {
  const payload = request.payload || {};
  switch (request.request_type) {
    case 'add_node':
      return [...nodes, {
        node_id: payload.node_id,
        work_unit_id: payload.work_unit_id,
        stage: payload.stage,
        depends_on: payload.depends_on || [],
        executor_binding: payload.executor_binding
      }].filter((node) => node.node_id && node.executor_binding);
    case 'remove_node':
    case 'cancel_work_unit':
      return nodes.filter((node) => node.node_id !== payload.node_id && node.work_unit_id !== payload.work_unit_id);
    case 'rebind_executor':
      return nodes.map((node) => node.node_id === payload.node_id
        ? { ...node, executor_binding: { ...node.executor_binding, ...payload.executor_binding } }
        : node);
    case 'change_dependencies':
      return nodes.map((node) => node.node_id === payload.node_id
        ? { ...node, depends_on: payload.depends_on || node.depends_on }
        : node);
    case 'update_context':
    case 'update_budget':
      return nodes.map((node) => node);
    default:
      throw new FailClosedError('REVISION_TYPE_UNKNOWN', `unsupported revision type ${request.request_type}`);
  }
}

// Deterministic stale analysis: how does the request sit relative to the
// active graph? Target-node disappearance is OBSOLETE; any intervening
// supersession touching the same node is CONFLICTING; otherwise REQUIRES_REBASE.
function classifyStale(request, activeGraph, supersessionsBetween) {
  const payload = request.payload || {};
  const targetNodeId = payload.node_id || null;
  const nodeIds = new Set(activeGraph.nodes.map((node) => node.node_id));
  if (targetNodeId && !nodeIds.has(targetNodeId)) {
    return 'OBSOLETE';
  }
  const touching = supersessionsBetween.some((record) => {
    const requester = String(record.revision_request_ref || '');
    return requester !== request.request_id;
  });
  if (touching && targetNodeId) {
    return 'CONFLICTING';
  }
  return 'REQUIRES_REBASE';
}

export function createRevisionEngine({ workGraphStore, root, decidedAt = nowIso }) {
  return {
    submit(graphId, request, { buildNewVersion } = {}) {
      validateRevisionRequest(request, root);
      const activeVersion = workGraphStore.activeVersion(graphId);
      const base = request.base_graph_version;

      if (base !== activeVersion) {
        const activeGraph = workGraphStore.getActive(graphId);
        const supersessionsBetween = workGraphStore.allSupersessions()
          .filter((record) => record.superseded_graph_version >= base && record.superseded_by_graph_version <= activeVersion);
        const revalidation = classifyStale(request, activeGraph, supersessionsBetween);
        const decision = {
          decision_id: newId('rdec'),
          request_ref: request.request_id,
          base_graph_version: base,
          active_graph_version: activeVersion,
          revalidation,
          outcome: 'STALE',
          new_graph_version: null,
          supersession_ref: null,
          decided_at: decidedAt(),
          reason: `request anchored at v${base} but active is v${activeVersion}; explicit revalidation required`
        };
        const issues = validateInstanceAgainstContract(decision, DECISION_CONTRACT, root);
        if (issues.length > 0) {
          throw new FailClosedError('REVISION_DECISION_INVALID', issues.join('; '));
        }
        return { decision, newGraph: null };
      }

      const activeGraph = workGraphStore.getActive(graphId);
      const newVersionNumber = activeVersion + 1;
      const candidateNodes = applyChangeToNodes(activeGraph.nodes.map((node) => structuredClone(node)), request);
      if (candidateNodes.length === 0) {
        throw new FailClosedError('REVISION_EMPTIES_GRAPH', 'revision would leave the graph without nodes');
      }
      const newGraph = buildNewVersion
        ? buildNewVersion({ baseGraph: activeGraph, nodes: candidateNodes, newVersionNumber, request })
        : deepFreeze({
          ...structuredClone(activeGraph),
          graph_version: newVersionNumber,
          nodes: deepFreeze(candidateNodes),
          created_at: decidedAt()
        });
      workGraphStore.registerVersion(newGraph, { activate: false });
      const { record } = workGraphStore.activateVersion(graphId, newVersionNumber, {
        reason: `accepted revision ${request.request_id} (${request.request_type})`,
        revisionRequestRef: request.request_id
      });
      const decision = {
        decision_id: newId('rdec'),
        request_ref: request.request_id,
        base_graph_version: base,
        active_graph_version: base,
        revalidation: 'STILL_VALID',
        outcome: 'ACCEPTED',
        new_graph_version: newVersionNumber,
        supersession_ref: record.record_id,
        decided_at: decidedAt(),
        reason: `request anchored at active version; applied as v${newVersionNumber}`
      };
      const issues = validateInstanceAgainstContract(decision, DECISION_CONTRACT, root);
      if (issues.length > 0) {
        throw new FailClosedError('REVISION_DECISION_INVALID', issues.join('; '));
      }
      return { decision, newGraph };
    }
  };
}
