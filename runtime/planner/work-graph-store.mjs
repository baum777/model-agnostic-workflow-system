// MAWS vNext planner — WorkGraph store (MAWS-VN-500).
// Immutable graph versions plus an active-version pointer. Historical
// versions are never rewritten; supersession is tracked through sidecar
// records, never by mutating a stored graph object.
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { assertSupersessionContextChange } from '../harness-context/context-binding.mjs';
import { deepFreeze } from './work-unit-store.mjs';

const SUPERSESSION_CONTRACT = 'core/contracts/graph-supersession-record.schema.json';

export function createWorkGraphStore({ root } = {}) {
  const graphs = new Map();
  const supersessions = [];

  function graphEntry(graphId) {
    if (!graphs.has(graphId)) {
      graphs.set(graphId, { versions: new Map(), activeVersion: null, graphId });
    }
    return graphs.get(graphId);
  }

function requireVersion(entry, version) {
  const graph = entry.versions.get(version);
  if (!graph) {
    throw new FailClosedError('GRAPH_VERSION_UNKNOWN', `graph ${entry.graphId} has no version ${version}`);
  }
  return graph;
}

// The set of full "context|ref" pairs declared by a graph version's
// executor bindings. One graph version binds one pair; mixed sets fail
// closed at activation, and a reference-only change is a transition like a
// context value change.
function bindingContextPairs(graph) {
  const pairs = new Set();
  for (const node of graph.nodes || []) {
    const binding = node?.executor_binding;
    if (binding?.harness_context !== undefined) {
      pairs.add(`${binding.harness_context}|${binding.harness_context_ref ?? ''}`);
    }
  }
  return pairs;
}

  return {
    registerVersion(graph, { activate = true, contextChange = null, reason = 'registration', revisionRequestRef = 'manual_registration' } = {}) {
      const entry = graphEntry(graph.graph_id);
      if (entry.versions.has(graph.graph_version)) {
        throw new FailClosedError('GRAPH_VERSION_EXISTS', `graph ${entry.graphId} v${graph.graph_version} already exists; versions are immutable`);
      }
      if (!Object.isFrozen(graph)) {
        throw new FailClosedError('GRAPH_NOT_IMMUTABLE', 'bound graphs must be frozen before registration');
      }
      // S11: the uniformity check applies to the INITIAL version too --
      // a graph mixing development and product nodes never becomes a
      // registered (and therefore activatable) version.
      const graphPairs = bindingContextPairs(graph);
      if (graphPairs.size > 1) {
        throw new FailClosedError('CONTEXT_BINDING_CONFLICT', 'a graph version with mixed node harness context pairs cannot be registered; one graph version binds one context pair');
      }
      if (graphPairs.size === 0) {
        throw new FailClosedError('CONTEXT_BINDING_MISSING', 'a graph version without any harness context binding cannot be registered');
      }
      // S11 R3: a noninitial DIRECT activation is a transition like any
      // other and routes through the same evidenced supersession gate, so
      // a repeated planAndBind cannot switch the context unevidenced.
      // Registration + activation are atomic: a rejected candidate is
      // discarded again so the version slot stays usable.
      if (activate && entry.activeVersion !== null) {
        entry.versions.set(graph.graph_version, graph);
        try {
          const activated = this.activateVersion(graph.graph_id, graph.graph_version, {
            reason,
            revisionRequestRef,
            contextChange
          });
          return { graph, record: activated.record, directActivation: true };
        } catch (error) {
          entry.versions.delete(graph.graph_version);
          throw error;
        }
      }
      entry.versions.set(graph.graph_version, graph);
      if (activate) {
        if (entry.activeVersion !== null && graph.graph_version <= entry.activeVersion) {
          entry.versions.delete(graph.graph_version);
          throw new FailClosedError('GRAPH_VERSION_NOT_MONOTONIC', `new version ${graph.graph_version} must exceed active ${entry.activeVersion}`);
        }
        entry.activeVersion = graph.graph_version;
      }
      return graph;
    },

    activateVersion(graphId, version, { reason, revisionRequestRef, contextChange = null, effectiveAt = nowIso() } = {}) {
      const entry = graphEntry(graphId);
      const previousActive = entry.activeVersion;
      const activating = requireVersion(entry, version);
      if (previousActive === version) {
        throw new FailClosedError('GRAPH_ALREADY_ACTIVE', `graph ${graphId} v${version} is already active`);
      }
      if (previousActive !== null && version <= previousActive) {
        throw new FailClosedError('GRAPH_VERSION_NOT_MONOTONIC', `cannot activate v${version} over v${previousActive}`);
      }
      // S11 R3: any transition across graph versions -- a context value
      // change OR a reference-only re-anchoring -- is legal only as an
      // explicit, evidence-backed transition asserted against the ACTUAL
      // binding-pair delta between the superseded and the activating graph.
      let contextChangeRecord = null;
      // The uniformity check applies to EVERY activation, including the
      // initial version: a schema-valid graph mixing development and
      // product nodes must never become active.
      const nextPairs = bindingContextPairs(activating);
      if (nextPairs.size > 1) {
        throw new FailClosedError('CONTEXT_BINDING_CONFLICT', 'a graph version with mixed node harness context pairs cannot activate; one graph version binds one context pair');
      }
      if (nextPairs.size === 0) {
        throw new FailClosedError('CONTEXT_BINDING_MISSING', 'a graph version without any harness context binding cannot activate');
      }
      // The transition comparison needs a previous version; the initial
      // version has none.
      if (previousActive !== null) {
        const previousPairs = bindingContextPairs(requireVersion(entry, previousActive));
        if (previousPairs.size > 1) {
          throw new FailClosedError('CONTEXT_BINDING_CONFLICT', 'a graph version with mixed node harness context pairs cannot activate; one graph version binds one context pair');
        }
        assertSupersessionContextChange({
          previousPair: [...previousPairs][0],
          nextPair: [...nextPairs][0],
          contextChange
        });
        if (contextChange) {
          contextChangeRecord = { ...contextChange };
        }
      }
      const record = deepFreeze({
        record_id: newId('sup'),
        superseded_graph_version: previousActive,
        superseded_by_graph_version: version,
        effective_at: effectiveAt,
        reason: reason || 'activation',
        revision_request_ref: revisionRequestRef || 'manual_activation',
        ...(contextChangeRecord ? { context_change: contextChangeRecord } : {})
      });
      if (root) {
        const issues = validateInstanceAgainstContract(record, SUPERSESSION_CONTRACT, root);
        if (issues.length > 0) {
          throw new FailClosedError('SUPERSESSION_INVALID', issues.join('; '));
        }
      }
      supersessions.push(record);
      entry.activeVersion = version;
      return { record, activated: activating };
    },

    getActive(graphId) {
      const entry = graphEntry(graphId);
      return requireVersion(entry, entry.activeVersion);
    },

    activeVersion(graphId) {
      return graphEntry(graphId).activeVersion;
    },

    getVersion(graphId, version) {
      return requireVersion(graphEntry(graphId), version);
    },

    // Remove a candidate version that was registered with activate:false
    // and then REJECTED during activation. Never touches the active version
    // or any superseded history; frees the version slot again so a corrected
    // request can recompute the same version number.
    discardCandidateVersion(graphId, version) {
      const entry = graphEntry(graphId);
      if (entry.activeVersion === version) {
        throw new FailClosedError('GRAPH_VERSION_ACTIVE', `cannot discard active version ${version} of ${graphId}`);
      }
      if (!entry.versions.has(version)) {
        return false;
      }
      entry.versions.delete(version);
      return true;
    },

    supersessionsOf(graphId) {
      return supersessions.filter((record) => {
        const entry = graphs.get(graphId);
        return entry !== undefined;
      });
    },

    allSupersessions() {
      return [...supersessions];
    }
  };
}
