// MAWS vNext planner — policy arbitration (OD-08).
// Conflicting valid requests resolve through explicit ArbitrationPolicy.
// Authority conflicts can only escalate to a human gate or fail closed.
import { newId, nowIso, FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const POLICY_CONTRACT = 'core/contracts/arbitration-policy.schema.json';
const DECISION_CONTRACT = 'core/contracts/arbitration-decision.schema.json';

const ACTION_TO_DISPOSITION = new Map([
  ['plan_revision', 'REVALIDATE'],
  ['reroute', 'REROUTE'],
  ['budget_adjustment', 'RETRY'],
  ['human_gate', 'ESCALATE'],
  ['fail_closed', 'BLOCKED']
]);

export function validateArbitrationPolicy(policy, root) {
  const issues = validateInstanceAgainstContract(policy, POLICY_CONTRACT, root);
  if (issues.length > 0) {
    throw new FailClosedError('ARBITRATION_POLICY_INVALID', issues.join('; '));
  }
}

export function arbitrate({ policy, requestRefs, conflictInvolvesAuthority = false, humanDecision = null, evidenceRefs = [], decidedAt = nowIso(), root }) {
  const issues = [];
  if (conflictInvolvesAuthority) {
    if (!humanDecision) {
      const decision = {
        decision_id: newId('adec'),
        policy_ref: policy.policy_id,
        request_refs: requestRefs,
        conflict_involves_authority: true,
        disposition: 'BLOCKED',
        resolved_by: 'human_gate',
        synthesis_used: false,
        evidence_refs: evidenceRefs,
        decided_at: decidedAt
      };
      return finalizeDecision(decision, root);
    }
    const decision = {
      decision_id: newId('adec'),
      policy_ref: policy.policy_id,
      request_refs: requestRefs,
      conflict_involves_authority: true,
      disposition: 'ESCALATE',
      resolved_by: 'human_gate',
      synthesis_used: false,
      evidence_refs: evidenceRefs,
      decided_at: decidedAt
    };
    return finalizeDecision(decision, root);
  }

  for (const action of policy.resolution_order) {
    if (action === 'human_gate' && !humanDecision) {
      issues.push(`resolution action ${action} unavailable without human decision`);
      continue;
    }
    const disposition = ACTION_TO_DISPOSITION.get(action);
    if (!disposition) {
      throw new FailClosedError('ARBITRATION_ACTION_UNKNOWN', `unknown resolution action ${action}`);
    }
    const decision = {
      decision_id: newId('adec'),
      policy_ref: policy.policy_id,
      request_refs: requestRefs,
      conflict_involves_authority: false,
      disposition,
      resolved_by: action === 'human_gate' ? 'human_gate' : 'deterministic_policy',
      synthesis_used: false,
      evidence_refs: evidenceRefs,
      decided_at: decidedAt
    };
    return finalizeDecision(decision, root);
  }

  throw new FailClosedError('ARBITRATION_UNSOLVABLE', `no applicable resolution action remained: ${issues.join('; ')}`);
}

function finalizeDecision(decision, root) {
  const validationIssues = validateInstanceAgainstContract(decision, DECISION_CONTRACT, root);
  if (validationIssues.length > 0) {
    throw new FailClosedError('ARBITRATION_DECISION_INVALID', validationIssues.join('; '));
  }
  return decision;
}
