// MAWS vNext planner — WorkUnit store (MAWS-VN-500 support).
// WorkUnits are validated against the canonical contract at creation and
// stored deeply frozen; the store never mutates a stored WorkUnit.
import { FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const CONTRACT = 'core/contracts/work-unit.schema.json';

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  Object.freeze(value);
  return value;
}

export function createWorkUnitStore({ root, validate = true } = {}) {
  const byId = new Map();

  return {
    create(draft) {
      if (!draft || typeof draft !== 'object' || typeof draft.work_unit_id !== 'string') {
        throw new FailClosedError('WORK_UNIT_INVALID', 'work unit draft must be an object with work_unit_id');
      }
      if (byId.has(draft.work_unit_id)) {
        throw new FailClosedError('WORK_UNIT_DUPLICATE', `work unit ${draft.work_unit_id} already exists`);
      }
      if (validate) {
        const issues = validateInstanceAgainstContract(draft, CONTRACT, root);
        if (issues.length > 0) {
          throw new FailClosedError('WORK_UNIT_CONTRACT_INVALID', issues.join('; '));
        }
      }
      const stored = deepFreeze(structuredClone(draft));
      byId.set(stored.work_unit_id, stored);
      return stored;
    },
    get(workUnitId) {
      const entry = byId.get(workUnitId);
      if (!entry) {
        throw new FailClosedError('WORK_UNIT_UNKNOWN', `work unit ${workUnitId} does not exist`);
      }
      return entry;
    },
    has(workUnitId) {
      return byId.has(workUnitId);
    },
    list() {
      return [...byId.values()];
    },
    childrenOf(workUnitId) {
      return this.list().filter((workUnit) => workUnit.parent_work_unit_id === workUnitId);
    },
    listByRun(runRef) {
      return this.list().filter((workUnit) => workUnit.run_ref === runRef);
    }
  };
}
