// MAWS vNext planner — versioned revision engine (OD-06/OD-07).
// Revision requests are version-anchored; stale requests are explicitly
// revalidated (STILL_VALID / CONFLICTING / OBSOLETE / REQUIRES_REBASE) and
// never silently rebased. Accepted revisions create a NEW graph version.
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { deepFreeze } from './work-unit-store.mjs';
import { assertQualificationContextBinding } from '../harness-context/context-binding.mjs';

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
      // A rebind WITHOUT node_id is graph-wide. Context changes are always
      // graph-wide (one graph version binds one context, S11); the store's
      // activation gate asserts the transition against the binding delta.
      if (!payload.node_id) {
        return nodes.map((node) => ({ ...node, executor_binding: { ...node.executor_binding, ...payload.executor_binding } }));
      }
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
    // `workUnits` is REQUIRED: every candidate node's WorkUnit is resolved
    // and its context reference checked exactly like initial planning
    // (S11); without it an add_node revision could anchor a node to a
    // WorkUnit bound to a different context.
    submit(graphId, request, { buildNewVersion, workUnits, qualifications = null, qualifiedFingerprints = null } = {}) {
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
      // S11: every candidate node's WorkUnit is resolved and its context
      // reference checked exactly like initial planning. Without this, an
      // add_node revision could anchor a node to a WorkUnit bound to a
      // different context.
      if (!Array.isArray(workUnits)) {
        throw new FailClosedError('CONTEXT_BINDING_MISSING', 'revision submission requires the workUnits collection; binding without WorkUnit resolution is not permitted');
      }
      const workUnitById = new Map(workUnits.filter((workUnit) => workUnit && typeof workUnit === 'object').map((workUnit) => [workUnit.work_unit_id, workUnit]));
      const assertNodesResolveWorkUnits = (nodes) => {
        for (const node of nodes) {
          const workUnit = workUnitById.get(node.work_unit_id);
          if (!workUnit) {
            throw new FailClosedError('CONTEXT_BINDING_MISSING', `revision node ${node.node_id} references work unit ${node.work_unit_id}, which was not provided for binding resolution`);
          }
          if (workUnit.harness_context_ref !== node.executor_binding.harness_context_ref) {
            throw new FailClosedError(
              'CONTEXT_BINDING_CONFLICT',
              `revision node ${node.node_id} binds context "${node.executor_binding.harness_context_ref}" but its work unit ${node.work_unit_id} declares "${workUnit.harness_context_ref}"`
            );
          }
        }
      };
      assertNodesResolveWorkUnits(candidateNodes);
      // S11 R4 on the revision path: a rebind that REPLACES a qualification
      // must present a qualification earned under the graph's bound context.
      // Without the qualification/fingerprint inputs this cannot be proven
      // and fails closed; unchanged qualification refs are not re-claimed.
      const assertQualificationsHoldContext = (nodes) => {
        for (const node of nodes) {
          const previous = activeGraph.nodes.find((candidate) => candidate.node_id === node.node_id);
          // Skip only when a previous binding EXISTS and the qualification
          // ref is unchanged -- a NEW node (add_node) claims a qualification
          // for the first time and must prove the context binding like a
          // changed ref does.
          if (previous && previous.executor_binding.qualification_ref === node.executor_binding.qualification_ref) {
            continue;
          }
          if (!Array.isArray(qualifications) || qualifiedFingerprints === null || typeof qualifiedFingerprints !== 'object') {
            const claim = previous
              ? `rebind of node ${node.node_id} replaces qualification "${previous.executor_binding.qualification_ref}" with "${node.executor_binding.qualification_ref}"`
              : `new node ${node.node_id} claims qualification "${node.executor_binding.qualification_ref}"`;
            throw new FailClosedError('CONTEXT_BINDING_MISSING', `${claim}; qualification and qualifiedFingerprint inputs are required to prove the context binding`);
          }
          const qualification = qualifications.find((entry) => entry && entry.qualification_id === node.executor_binding.qualification_ref);
          const fingerprint = qualification ? Object.values(qualifiedFingerprints).find((entry) => entry && entry.fingerprint_id === qualification.fingerprint_ref) : null;
          if (!fingerprint) {
            throw new FailClosedError('CONTEXT_BINDING_CONFLICT', `routing replacement on node ${node.node_id} references qualification ${node.executor_binding.qualification_ref} without a resolvable fingerprint; an ambiguous qualification binds no executor`);
          }
          assertQualificationContextBinding({ runtimeHarness: fingerprint.components.runtime_harness, context: activeGraph.nodes[0].executor_binding.harness_context });
        }
      };
      assertQualificationsHoldContext(candidateNodes);
      // S11 R3/R4: the referenced WorkUnits are immutable, so a graph
      // revision cannot change the harness context -- a context switch is a
      // bound plan change that re-anchors WorkUnits through a new plan.
      // Supersession records still represent evidenced transitions on the
      // read side (graph-supersession-record.schema.json context_change),
      // but the live revision path fails closed here.
      const contextPair = (node) => `${node.executor_binding.harness_context ?? ''}|${node.executor_binding.harness_context_ref ?? ''}`;
      const contextChanged = new Set(candidateNodes.map(contextPair)).size > 1
        || [...new Set(candidateNodes.map(contextPair))].some((pair) => !activeGraph.nodes.some((node) => contextPair(node) === pair));
      if (contextChanged) {
        throw new FailClosedError(
          'CONTEXT_BINDING_CONFLICT',
          'a graph revision cannot change the harness context; the referenced WorkUnits are immutable and a context switch is a bound plan change that re-anchors WorkUnits through a new plan'
        );
      }
      const newGraph = buildNewVersion
        ? buildNewVersion({ baseGraph: activeGraph, nodes: candidateNodes, newVersionNumber, request })
        : deepFreeze({
          ...structuredClone(activeGraph),
          graph_version: newVersionNumber,
          nodes: deepFreeze(candidateNodes),
          created_at: decidedAt()
        });
      // A buildNewVersion callback may substitute the node set: the returned
      // graph is re-validated against the SAME checks as the candidate --
      // WorkUnit resolution AND the pair-level context-delta rule -- before
      // registration (a swapped-in uniform false-value graph cannot bypass
      // the gate, with or without an evidenced context_change).
      if (newGraph !== null && typeof newGraph === 'object' && Array.isArray(newGraph.nodes)) {
        assertNodesResolveWorkUnits(newGraph.nodes);
        assertQualificationsHoldContext(newGraph.nodes);
        const callbackPair = (node) => `${node.executor_binding.harness_context ?? ''}|${node.executor_binding.harness_context_ref ?? ''}`;
        const callbackChanged = new Set(newGraph.nodes.map(callbackPair)).size > 1
          || [...new Set(newGraph.nodes.map(callbackPair))].some((pair) => !activeGraph.nodes.some((node) => contextPair(node) === pair));
        if (callbackChanged) {
          throw new FailClosedError(
            'CONTEXT_BINDING_CONFLICT',
            'a buildNewVersion callback cannot change the harness context; the referenced WorkUnits are immutable and a context switch is a bound plan change that re-anchors WorkUnits through a new plan'
          );
        }
      }
      // Registration and activation are one atomic step from the caller's
      // perspective: a candidate rejected during activation is discarded so
      // the version slot stays usable for corrected requests.
      workGraphStore.registerVersion(newGraph, { activate: false });
      let activated;
      try {
        activated = workGraphStore.activateVersion(graphId, newVersionNumber, {
          reason: `accepted revision ${request.request_id} (${request.request_type})`,
          revisionRequestRef: request.request_id,
          // S11 R3: a revision payload may declare an evidenced context
          // transition for the store's activation gate; the context-delta
          // refusal above has already rejected live context switches.
          contextChange: (request.payload && request.payload.context_change) || null
        });
      } catch (error) {
        workGraphStore.discardCandidateVersion(graphId, newVersionNumber);
        throw error;
      }
      const { record } = activated;
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
