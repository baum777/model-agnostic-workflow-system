import crypto from 'node:crypto';

import {
  CONTAINMENT_EXIT_REQUIRES,
  CONTAINMENT_STATE,
  CLG_WORKFLOW_STATE_MACHINE,
  findTransition,
  isKnownState,
  isTerminalState
} from './loop-state-machine.mjs';
import { evaluateCompletion } from './completion-evaluator.mjs';
import { RuntimeBlockedError } from './runtime-errors.mjs';
import {
  TRANSITION_DECISIONS,
  validateCompletionDisposition,
  validateContextManifest,
  validateRuntimeState,
  validateTaskContract,
  validateVerificationRecord
} from '../contracts/clg-contracts.mjs';

// CLG P2/P3 loop enforcement — the single canonical transition controller for
// the generic runtime. All runtime lifecycle state changes must go through this
// controller: current state + decision + evidence/preconditions in, next state
// + TransitionRecords out. Direct mutation of lifecycle_state outside this
// controller is a contract violation. Unspecified transitions and unsupported
// decisions DENY fail-closed; missing external ports BLOCK instead of faking
// success. Authority is never invented here: it arrives via external ports
// (e.g. the deny-by-default permission engine) or is denied. COMPLETE runs the
// P3 CompletionEvaluator (deterministic, criterion-bound facts) BEFORE the P2
// completion guard (transition admissibility); both must agree.

const TRC_VERSION = '1.0.0';

function makeTransitionRecord({ from, to, reasonCode, decision, evidenceRefs }) {
  return Object.freeze({
    trc_version: TRC_VERSION,
    transition_id: `trt_${crypto.randomBytes(4).toString('hex')}`,
    ts: new Date().toISOString(),
    from,
    to,
    reason_code: reasonCode,
    decision,
    evidence_refs: Object.freeze([...evidenceRefs])
  });
}

function assertValidRuntimeState(runtimeState) {
  const stateCheck = validateRuntimeState(runtimeState);
  if (!stateCheck.ok) {
    throw new RuntimeBlockedError('RuntimeState invalid.', stateCheck.issues);
  }
  if (!isKnownState(runtimeState.lifecycle_state)) {
    throw new RuntimeBlockedError(`Unknown lifecycle state: ${String(runtimeState.lifecycle_state)}.`, [
      'UNKNOWN_STATE'
    ]);
  }
}

function assertNotTerminal(runtimeState) {
  if (isTerminalState(runtimeState.lifecycle_state)) {
    throw new RuntimeBlockedError(`Terminal state ${runtimeState.lifecycle_state} cannot be reopened.`, [
      'TERMINAL_STATE'
    ]);
  }
}

function applyAuthorizedTransition({ runtimeState, to, decision, evidenceRefs, authorizedRecovery }) {
  const from = runtimeState.lifecycle_state;
  const transition = findTransition(from, to);
  if (!transition) {
    throw new RuntimeBlockedError(`Transition ${from} -> ${to} is not defined (unspecified transition = DENY).`, [
      'UNSPECIFIED_TRANSITION'
    ]);
  }
  if (from === CONTAINMENT_STATE) {
    if (!authorizedRecovery
      || authorizedRecovery.authorized_recovery_decision !== CONTAINMENT_EXIT_REQUIRES.authorized_recovery_decision
      || authorizedRecovery.actor_type !== CONTAINMENT_EXIT_REQUIRES.actor_type) {
      throw new RuntimeBlockedError('Containment exit requires an authorized human recovery decision.', [
        'CONTAINMENT_EXIT_AUTHORIZED_RECOVERY_REQUIRED'
      ]);
    }
  }
  const record = makeTransitionRecord({
    from,
    to,
    reasonCode: transition.reason_code,
    decision,
    evidenceRefs
  });
  return {
    runtimeState: { ...runtimeState, lifecycle_state: to },
    transitionRecords: [record]
  };
}

function budgetLimitOrDeny(taskContract, limitField, decision) {
  const limits = taskContract.limits ?? {};
  const max = limits[limitField];
  if (!Number.isInteger(max) || max < 0) {
    throw new RuntimeBlockedError(`${decision} requires taskContract.limits.${limitField} (fail-closed: no unbounded retry/replan).`, [
      'BUDGET_UNBOUNDED'
    ]);
  }
  return max;
}

function recoveryCycle({
  runtimeState,
  taskContract,
  decision,
  evidenceRefs,
  countField,
  limitField,
  fromStates,
  reasonCodeByFrom
}) {
  const from = runtimeState.lifecycle_state;
  if (!fromStates.includes(from)) {
    throw new RuntimeBlockedError(`${decision} is not supported from state ${from}.`, [
      'UNSUPPORTED_DECISION_FOR_STATE'
    ]);
  }
  const max = budgetLimitOrDeny(taskContract, limitField, decision);
  if (runtimeState[countField] >= max) {
    if (from === 'running') {
      const contained = applyAuthorizedTransition({
        runtimeState,
        to: 'contained',
        decision,
        evidenceRefs
      });
      return { ok: true, outcome: 'budget_contained', ...contained, issues: [] };
    }
    throw new RuntimeBlockedError(`${decision} budget exhausted (${countField}=${runtimeState[countField]} >= ${limitField}=${max}).`, [
      'BUDGET_EXHAUSTED'
    ]);
  }
  if (decision === 'REPAIR' && evidenceRefs.length === 0) {
    throw new RuntimeBlockedError('REPAIR requires repair evidence refs.', ['EVIDENCE_REQUIRED']);
  }
  if (decision === 'REPLAN' && evidenceRefs.length === 0) {
    throw new RuntimeBlockedError('REPLAN requires replan evidence refs.', ['EVIDENCE_REQUIRED']);
  }
  const record = makeTransitionRecord({
    from,
    to: 'recovering',
    reasonCode: reasonCodeByFrom[from],
    decision,
    evidenceRefs
  });
  return {
    ok: true,
    runtimeState: {
      ...runtimeState,
      lifecycle_state: 'recovering',
      [countField]: runtimeState[countField] + 1
    },
    transitionRecords: [record],
    issues: []
  };
}

// Completion guard (P2-003): a COMPLETE decision is only accepted when the
// completion contract is satisfied — all preceding stages claimed, non-empty
// evidence, independent verification records that actually bind to the claim.
// Receipts, outputs and executed actions are never sufficient on their own.
function evaluateCompletionGuard({ completionDisposition, verificationRecords }) {
  const dispositionCheck = validateCompletionDisposition(completionDisposition);
  if (!dispositionCheck.ok) {
    return { outcome: 'completion_not_met', issues: dispositionCheck.issues };
  }
  if (!completionDisposition.claimed_stages.includes('TASK_COMPLETE')) {
    return { outcome: 'completion_not_met', issues: ['COMPLETE requires a TASK_COMPLETE claim.'] };
  }
  if (Array.isArray(completionDisposition.unmet_criteria) && completionDisposition.unmet_criteria.length > 0) {
    return { outcome: 'completion_not_met', issues: ['Unmet success criteria remain: completion denied.'] };
  }

  const records = Array.isArray(verificationRecords) ? verificationRecords : [];
  const recordsById = new Map(records.map((record) => [record?.verification_id, record]));
  const referencedRefs = completionDisposition.verified_by_refs ?? [];

  if (referencedRefs.length === 0) {
    return { outcome: 'completion_not_met', issues: ['TASK_COMPLETE requires verified_by_refs.'] };
  }
  for (const ref of referencedRefs) {
    if (!recordsById.has(ref)) {
      return {
        outcome: 'completion_not_met',
        issues: [`verified_by_ref ${ref} has no VerificationRecord (claims are not verification).`]
      };
    }
  }

  let sawPass = false;
  for (const ref of referencedRefs) {
    const record = recordsById.get(ref);
    const recordCheck = validateVerificationRecord(record);
    if (!recordCheck.ok) {
      return { outcome: 'completion_not_met', issues: recordCheck.issues };
    }
    if (record.result === 'FAIL') {
      return { outcome: 'completion_not_met', issues: [`Verification ${ref} FAILED.`] };
    }
    if (record.result === 'UNKNOWN' || record.result === 'PARTIAL') {
      return { outcome: 'verification_indeterminate', issues: [`Verification ${ref} is ${record.result} (fail-closed).`] };
    }
    sawPass = true;
  }

  if (!sawPass) {
    return { outcome: 'completion_not_met', issues: ['No PASS verification bound to the completion claim.'] };
  }
  return { outcome: 'completion_verified', issues: [] };
}

function completionOutcomeTransition(outcome) {
  if (outcome === 'completion_verified') {
    return { to: 'succeeded', reason_code: 'completion_verified' };
  }
  if (outcome === 'verification_indeterminate') {
    return { to: 'contained', reason_code: 'verification_indeterminate' };
  }
  return { to: 'failed', reason_code: 'completion_not_met' };
}

function acquireContext({ runtimeState, contextEnginePort }) {
  if (!contextEnginePort || typeof contextEnginePort !== 'object' || typeof contextEnginePort.assemble !== 'function') {
    throw new RuntimeBlockedError('ACQUIRE_CONTEXT requires a ContextEnginePort binding with assemble().', [
      'EXTERNAL_PORT_REQUIRED'
    ]);
  }
  let manifest;
  try {
    manifest = contextEnginePort.assemble({ runtimeState });
  } catch (error) {
    throw new RuntimeBlockedError(`ContextEnginePort failed (no silent continue): ${error.message}`, [
      'CONTEXT_PORT_FAILED'
    ]);
  }
  const manifestCheck = validateContextManifest(manifest);
  if (!manifestCheck.ok) {
    throw new RuntimeBlockedError('ContextEnginePort returned an invalid ContextManifest.', manifestCheck.issues);
  }
  if (manifest.task_ref !== runtimeState.task_ref) {
    throw new RuntimeBlockedError('ContextEnginePort returned a manifest for a foreign task (fail-closed).', [
      'CONTEXT_TASK_BINDING_MISMATCH'
    ]);
  }
  return {
    runtimeState: {
      ...runtimeState,
      context_generation: (runtimeState.context_generation ?? 0) + 1
    },
    manifest
  };
}

function createLoopController({ stateMachine = CLG_WORKFLOW_STATE_MACHINE } = {}) {
  if (stateMachine !== CLG_WORKFLOW_STATE_MACHINE) {
    throw new RuntimeBlockedError('Only the canonical CLG workflow state machine is accepted (exactly one runtime owner).', [
      'FOREIGN_STATE_MACHINE'
    ]);
  }

  function applyTransition({ runtimeState, to, decision = 'TRANSITION', evidenceRefs = [], authorizedRecovery = null }) {
    assertValidRuntimeState(runtimeState);
    assertNotTerminal(runtimeState);
    if (!isKnownState(to)) {
      throw new RuntimeBlockedError(`Unknown target state: ${String(to)}.`, ['UNKNOWN_STATE']);
    }
    return applyAuthorizedTransition({ runtimeState, to, decision, evidenceRefs, authorizedRecovery });
  }

  function applyDecision({
    runtimeState,
    taskContract,
    decision,
    evidenceRefs = [],
    completionDisposition = null,
    verificationRecords = [],
    contextEnginePort = null,
    authorizedRecovery = null
  }) {
    assertValidRuntimeState(runtimeState);
    const contractCheck = validateTaskContract(taskContract);
    if (!contractCheck.ok) {
      throw new RuntimeBlockedError('TaskContract invalid.', contractCheck.issues);
    }
    assertNotTerminal(runtimeState);
    if (!TRANSITION_DECISIONS.includes(decision)) {
      throw new RuntimeBlockedError(`Unknown decision: ${String(decision)}.`, ['UNKNOWN_DECISION']);
    }

    const from = runtimeState.lifecycle_state;

    if (decision === 'CONTINUE') {
      if (from === 'running') {
        const record = makeTransitionRecord({ from, to: 'running', reasonCode: 'loop_iteration', decision, evidenceRefs });
        return { ok: true, runtimeState, transitionRecords: [record], issues: [] };
      }
      if (from === 'recovering') {
        if (evidenceRefs.length === 0) {
          throw new RuntimeBlockedError('CONTINUE from recovering requires recovery evidence refs.', ['EVIDENCE_REQUIRED']);
        }
        const resumed = applyAuthorizedTransition({ runtimeState, to: 'running', decision, evidenceRefs });
        return { ok: true, ...resumed, issues: [] };
      }
      if (from === 'waiting_for_input') {
        if (evidenceRefs.length === 0) {
          throw new RuntimeBlockedError('CONTINUE from waiting_for_input requires the received input as evidence.', ['EVIDENCE_REQUIRED']);
        }
        const resumed = applyAuthorizedTransition({ runtimeState, to: 'scoped', decision, evidenceRefs });
        return { ok: true, ...resumed, issues: [] };
      }
      throw new RuntimeBlockedError(`CONTINUE is not supported from state ${from}.`, ['UNSUPPORTED_DECISION_FOR_STATE']);
    }

    if (decision === 'RETRY' || decision === 'REPAIR') {
      return recoveryCycle({
        runtimeState,
        taskContract,
        decision,
        evidenceRefs,
        countField: 'retry_count',
        limitField: 'max_retries',
        fromStates: ['running', 'validating'],
        reasonCodeByFrom: { running: 'retryable_failure', validating: 'verification_retryable' }
      });
    }

    if (decision === 'REPLAN') {
      return recoveryCycle({
        runtimeState,
        taskContract,
        decision,
        evidenceRefs,
        countField: 'replan_count',
        limitField: 'max_replans',
        fromStates: ['running'],
        reasonCodeByFrom: { running: 'retryable_failure' }
      });
    }

    if (decision === 'ACQUIRE_CONTEXT') {
      if (from !== 'running') {
        throw new RuntimeBlockedError(`ACQUIRE_CONTEXT is only supported from running (got ${from}).`, [
          'UNSUPPORTED_DECISION_FOR_STATE'
        ]);
      }
      const { runtimeState: updated } = acquireContext({ runtimeState, contextEnginePort });
      const record = makeTransitionRecord({
        from,
        to: 'running',
        reasonCode: 'context_acquired',
        decision,
        evidenceRefs
      });
      return { ok: true, runtimeState: updated, transitionRecords: [record], issues: [] };
    }

    if (decision === 'DELEGATE') {
      throw new RuntimeBlockedError('DELEGATE requires a delegation port that does not exist in P2.', [
        'EXTERNAL_PORT_REQUIRED'
      ]);
    }

    if (decision === 'WAIT_EXTERNAL_EVENT') {
      throw new RuntimeBlockedError('WAIT_EXTERNAL_EVENT has no state-machine representation in v0.1.0 (documented gap).', [
        'UNSUPPORTED_IN_P2'
      ]);
    }

    if (decision === 'REQUIRE_APPROVAL') {
      if (from !== 'policy_checked') {
        throw new RuntimeBlockedError(`REQUIRE_APPROVAL is only defined from policy_checked (got ${from}; running -> waiting_for_approval is a documented state-machine gap).`, [
          'UNSPECIFIED_TRANSITION'
        ]);
      }
      const waiting = applyAuthorizedTransition({ runtimeState, to: 'waiting_for_approval', decision, evidenceRefs });
      return { ok: true, ...waiting, issues: [] };
    }

    if (decision === 'ESCALATE') {
      throw new RuntimeBlockedError('ESCALATE has no state-machine transition in v0.1.0 (documented gap).', [
        'UNSUPPORTED_IN_P2'
      ]);
    }

    if (decision === 'ABORT') {
      const aborted = applyAuthorizedTransition({ runtimeState, to: 'cancelled', decision, evidenceRefs });
      return { ok: true, ...aborted, issues: [] };
    }

    if (decision === 'COMPLETE') {
      // P3-A evaluates the facts (criterion-bound, deterministic); the P2 guard
      // still owns transition admissibility. Fail-closed precedence: any hard
      // blocker denies as completion_not_met; only if nothing is blocked do
      // indeterminate verifications contain instead of complete.
      const evaluation = evaluateCompletion({ taskContract, runtimeState, verificationRecords });
      const guard = evaluateCompletionGuard({ completionDisposition, verificationRecords });
      const blocked = evaluation.result === 'BLOCKED'
        || evaluation.result === 'INCOMPLETE'
        || guard.outcome === 'completion_not_met';
      const indeterminate = evaluation.result === 'UNKNOWN'
        || guard.outcome === 'verification_indeterminate';
      const outcome = blocked
        ? 'completion_not_met'
        : (indeterminate ? 'verification_indeterminate' : 'completion_verified');
      const issues = blocked || indeterminate ? [...evaluation.issues, ...guard.issues] : [];
      const target = completionOutcomeTransition(outcome);
      const transitionRecords = [];
      let workingState = runtimeState;
      if (from === 'running') {
        const firstHop = applyAuthorizedTransition({
          runtimeState: workingState,
          to: 'validating',
          decision,
          evidenceRefs
        });
        workingState = firstHop.runtimeState;
        transitionRecords.push(...firstHop.transitionRecords);
      }
      const finalHop = applyAuthorizedTransition({
        runtimeState: workingState,
        to: target.to,
        decision,
        evidenceRefs
      });
      transitionRecords.push(...finalHop.transitionRecords);
      // Keep RuntimeState coherent with the completion outcome (CLG-002:
      // verification_status 'passed' requires latest_verification_ref).
      const verifiedState = { ...finalHop.runtimeState };
      if (outcome === 'completion_verified') {
        const passingRef = (completionDisposition.verified_by_refs ?? []).find((ref) => {
          const record = (verificationRecords ?? []).find((entry) => entry?.verification_id === ref);
          return record?.result === 'PASS';
        });
        verifiedState.verification_status = 'passed';
        verifiedState.latest_verification_ref = passingRef ?? 'unknown-verifier';
      } else if (outcome === 'verification_indeterminate') {
        verifiedState.verification_status = 'unknown';
      } else {
        verifiedState.verification_status = 'failed';
      }
      // A denied completion is an evaluated outcome, not an illegal operation:
      // the state machine lands on failed/contained and the caller sees ok:false.
      return {
        ok: outcome === 'completion_verified',
        outcome,
        runtimeState: verifiedState,
        transitionRecords,
        issues
      };
    }

    throw new RuntimeBlockedError(`Decision ${decision} is not operationalized.`, ['UNSUPPORTED_IN_P2']);
  }

  return Object.freeze({
    stateMachine,
    applyTransition,
    applyDecision,
    evaluateCompletionGuard
  });
}

export {
  TRC_VERSION,
  createLoopController,
  evaluateCompletionGuard
};
