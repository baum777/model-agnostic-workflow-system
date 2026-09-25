// MAWS vNext planner — WorkGraph store (MAWS-VN-500).
// Immutable graph versions plus an active-version pointer. Historical
// versions are never rewritten; supersession is tracked through sidecar
// records, never by mutating a stored graph object.
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
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

  return {
    registerVersion(graph, { activate = true } = {}) {
      const entry = graphEntry(graph.graph_id);
      if (entry.versions.has(graph.graph_version)) {
        throw new FailClosedError('GRAPH_VERSION_EXISTS', `graph ${entry.graphId} v${graph.graph_version} already exists; versions are immutable`);
      }
      if (!Object.isFrozen(graph)) {
        throw new FailClosedError('GRAPH_NOT_IMMUTABLE', 'bound graphs must be frozen before registration');
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

    activateVersion(graphId, version, { reason, revisionRequestRef, effectiveAt = nowIso() } = {}) {
      const entry = graphEntry(graphId);
      const previousActive = entry.activeVersion;
      const activating = requireVersion(entry, version);
      if (previousActive === version) {
        throw new FailClosedError('GRAPH_ALREADY_ACTIVE', `graph ${graphId} v${version} is already active`);
      }
      if (previousActive !== null && version <= previousActive) {
        throw new FailClosedError('GRAPH_VERSION_NOT_MONOTONIC', `cannot activate v${version} over v${previousActive}`);
      }
      const record = deepFreeze({
        record_id: newId('sup'),
        superseded_graph_version: previousActive,
        superseded_by_graph_version: version,
        effective_at: effectiveAt,
        reason: reason || 'activation',
        revision_request_ref: revisionRequestRef || 'manual_activation'
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
