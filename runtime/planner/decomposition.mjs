// MAWS vNext planner — bounded decomposition + governed recursion (OD-03/OD-04).
// Executors only ever emit DecompositionRequests; the planner validates the
// inheritance envelope and limits, and instantiates child WorkUnits itself.
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const REQUEST_CONTRACT = 'core/contracts/decomposition-request.schema.json';
const DECISION_CONTRACT = 'core/contracts/decomposition-decision.schema.json';

export function validateDecompositionRequest(request, root) {
  const issues = validateInstanceAgainstContract(request, REQUEST_CONTRACT, root);
  if (issues.length > 0) {
    throw new FailClosedError('DECOMPOSITION_REQUEST_INVALID', issues.join('; '));
  }
}

export function evaluateDecompositionRequest({ request, parentWorkUnit, template, graphStats, root, decidedAt = nowIso() }) {
  const limits = template.decomposition_limits;
  const snapshot = request.limits_snapshot;

  const envelopeCheck = {
    scope_subset: true,
    context_subset: true,
    effects_subset: true,
    authority_not_widened: true,
    limits_respected: true
  };

  const issues = [];
  for (const child of request.requested_children) {
    for (const effect of child.effects_subset) {
      if (!parentWorkUnit.authority_ceiling.allowed_effects.includes(effect)) {
        envelopeCheck.effects_subset = false;
        issues.push(`child effect "${effect}" is outside the parent allowed effects`);
      }
    }
    if (child.authority_depth_requested > parentWorkUnit.authority_ceiling.delegation_depth_max) {
      envelopeCheck.authority_not_widened = false;
      issues.push(`child delegation depth ${child.authority_depth_requested} exceeds parent ceiling ${parentWorkUnit.authority_ceiling.delegation_depth_max}`);
    }
    if (!parentWorkUnit.context_envelope_ref || !child.context_subset_ref || !child.context_subset_ref.startsWith(`${parentWorkUnit.context_envelope_ref}`)) {
      envelopeCheck.context_subset = false;
      issues.push('child context subset must live under the parent context envelope');
    }
  }

  const nextDepth = (snapshot.current_depth ?? graphStats.current_depth) + 1;
  if (nextDepth > limits.max_depth) {
    envelopeCheck.limits_respected = false;
    issues.push(`decomposition depth ${nextDepth} would exceed max_depth ${limits.max_depth}`);
  }
  if (request.requested_children.length > limits.max_children_per_node) {
    envelopeCheck.limits_respected = false;
    issues.push(`requested ${request.requested_children.length} children, limit is ${limits.max_children_per_node}`);
  }
  const currentTotal = snapshot.current_total_work_units ?? graphStats.current_total_work_units;
  if (currentTotal + request.requested_children.length > limits.max_total_work_units) {
    envelopeCheck.limits_respected = false;
    issues.push(`total work units ${currentTotal + request.requested_children.length} would exceed ${limits.max_total_work_units}`);
  }

  const approved = Object.values(envelopeCheck).every(Boolean);
  const decision = {
    decision_id: newId('ddec'),
    request_ref: request.request_id,
    decision: approved ? 'APPROVED' : 'REJECTED',
    envelope_check: envelopeCheck,
    decided_by: 'planner',
    reason: approved ? 'child envelopes verified within parent envelope and limits' : issues.join('; ')
  };
  const validationIssues = validateInstanceAgainstContract(decision, DECISION_CONTRACT, root);
  if (validationIssues.length > 0) {
    throw new FailClosedError('DECOMPOSITION_DECISION_INVALID', validationIssues.join('; '));
  }
  return { decision, issues };
}

// The planner instantiates validated children; children never widen the
// parent envelope: delegation depth drops by one and effects stay a subset.
export function instantiateChildren({ decision, request, parentWorkUnit, workUnitStore, decidedAt = nowIso() }) {
  if (decision.decision !== 'APPROVED') {
    throw new FailClosedError('DECOMPOSITION_NOT_APPROVED', 'children may only be instantiated for APPROVED decisions');
  }
  const childIds = [];
  request.requested_children.forEach((child, index) => {
    const workUnitId = `${parentWorkUnit.work_unit_id}_child_${String(index + 1).padStart(3, '0')}`;
    const draft = {
      work_unit_id: workUnitId,
      parent_work_unit_id: parentWorkUnit.work_unit_id,
      objective: child.objective,
      required_capabilities: child.required_capabilities.map((capabilityId) => ({ capability_id: capabilityId })),
      context_envelope_ref: child.context_subset_ref,
      authority_ceiling: {
        scope_ref: `${parentWorkUnit.authority_ceiling.scope_ref}/${workUnitId}`,
        allowed_effects: [...child.effects_subset],
        delegation_depth_max: Math.max(0, parentWorkUnit.authority_ceiling.delegation_depth_max - 1),
        authority_source_refs: [...parentWorkUnit.authority_ceiling.authority_source_refs]
      },
      decomposition_policy_ref: parentWorkUnit.decomposition_policy_ref,
      completion_contract_ref: `${workUnitId}_completion`,
      dependencies: [],
      created_by: 'planner_decomposition',
      run_ref: parentWorkUnit.run_ref
    };
    workUnitStore.create(draft);
    childIds.push(workUnitId);
  });
  return childIds;
}
