// MAWS vNext — Executor registry (MAWS-VN-400).
//
// In-memory lookup surface over validated executor manifest entries.
// OD-01/OD-09: registry entries are DECLARATIONS only. Presence in this
// registry implies zero qualification, eligibility, authority, or routing
// claims — those live in QualificationRecords backed by evidence.
import { FailClosedError } from '../vnext/util.mjs';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function collectDuplicateExecutorIds(entries) {
  const seen = new Set();
  const duplicates = new Set();
  for (const entry of entries) {
    const executorId = entry?.executor_id;
    if (!isNonEmptyString(executorId)) {
      continue;
    }
    if (seen.has(executorId)) {
      duplicates.add(executorId);
    }
    seen.add(executorId);
  }
  return [...duplicates];
}

/**
 * Create an executor registry over manifest entries.
 *
 * @param {object[]} entries - executor manifest objects (schema-validated upstream by the loader)
 * @returns {{ get(id: string): object, list(): object[], findByCapability(capabilityId: string): object[] }}
 * @throws {FailClosedError} EXECUTOR_REGISTRY_INVALID | EXECUTOR_DUPLICATE | EXECUTOR_UNKNOWN
 */
export function createExecutorRegistry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new FailClosedError('EXECUTOR_REGISTRY_INVALID', 'executor registry requires a non-empty array of manifest entries');
  }
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !isNonEmptyString(entry.executor_id)) {
      throw new FailClosedError(
        'EXECUTOR_REGISTRY_INVALID',
        `executor registry entry [${index}] must be an object with a non-empty executor_id`
      );
    }
  }
  const duplicates = collectDuplicateExecutorIds(entries);
  if (duplicates.length > 0) {
    throw new FailClosedError(
      'EXECUTOR_DUPLICATE',
      `executor registry contains duplicate executor_ids: ${duplicates.join(', ')}`
    );
  }

  const byId = new Map(entries.map((entry) => [entry.executor_id, entry]));

  return {
    /**
     * Look up a manifest by executor id. Unknown ids fail closed.
     * @param {string} id
     */
    get(id) {
      const entry = byId.get(id);
      if (entry === undefined) {
        throw new FailClosedError('EXECUTOR_UNKNOWN', `executor ${id} is not registered`);
      }
      return entry;
    },
    /** All manifest entries (fresh array of the stored objects). */
    list() {
      return [...entries];
    },
    /**
     * All manifests declaring a capability. Declarations only — this is not
     * a qualification or eligibility lookup.
     * @param {string} capabilityId
     */
    findByCapability(capabilityId) {
      if (!isNonEmptyString(capabilityId)) {
        throw new FailClosedError('EXECUTOR_REGISTRY_INVALID', 'findByCapability requires a capability id');
      }
      return entries.filter((entry) =>
        (entry.declared_capabilities || []).some((capability) => capability && capability.capability_id === capabilityId)
      );
    }
  };
}
