import { RuntimeBlockedError } from './runtime-errors.mjs';
import { evaluateAction, validateActionProposal } from './authority-port.mjs';

// CLG P3-C pre-effect enforcement boundary.
//
// Physical order for every external effect:
//   DECISION -> ACTION_PROPOSAL -> AUTHORITY_CHECK -> ALLOW?
//     NO  -> BLOCK (no side effect)
//     YES -> EFFECT PORT -> RECEIPT -> OBSERVE -> VERIFY -> STATE UPDATE
//
// Invariants (structurally enforced, not prose):
//   ActionProposal    != Authority
//   AuthorityDecision != Effect
//   Effect Receipt    != Verification   (receipts carry no result)
//   Verification      != Business Outcome (stays an explicit VerificationRecord)
//
// There is no production effect adapter in this slice: productive dispatch is
// marked EXTERNAL_PORT_NOT_ACTIVATED; tests bind fake/stub EffectPorts.

const PRODUCTION_EFFECT_PORT_STATUS = 'EXTERNAL_PORT_NOT_ACTIVATED';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function createEffectPort(binding) {
  const issues = [];
  if (!binding || typeof binding !== 'object') {
    issues.push('EffectPort binding must be an object.');
  } else {
    if (typeof binding.dispatch !== 'function') {
      issues.push('EffectPort binding is missing required method: dispatch().');
    }
    if (binding.effect_ref !== undefined && !isNonEmptyString(binding.effect_ref)) {
      issues.push('EffectPort binding.effect_ref must be a non-empty string when present.');
    }
  }
  if (issues.length > 0) {
    throw new RuntimeBlockedError('EffectPort binding rejected (fail-closed).', issues);
  }
  return Object.freeze({
    port: 'EffectPort',
    effectRef: binding.effect_ref ?? 'unspecified',
    status: 'test_stub_only',
    dispatch: binding.dispatch
  });
}

// Executes one authorized action proposal. Every denial path returns an
// evaluated result with effectInvocations: 0 — the effect is never attempted,
// and an ALLOW without a bound EffectPort BLOCKs instead of faking success.
function executeActionProposal({
  runtimeState,
  taskContract,
  actionProposal,
  authorityPort = null,
  effectPort = null
}) {
  const proposalCheck = validateActionProposal(actionProposal);
  if (!proposalCheck.ok) {
    throw new RuntimeBlockedError('ActionProposal invalid.', proposalCheck.issues);
  }
  if (runtimeState.lifecycle_state !== 'running') {
    throw new RuntimeBlockedError(`Effects are only possible from running (got ${runtimeState.lifecycle_state}).`, [
      'EFFECTS_ONLY_DURING_RUNNING'
    ]);
  }
  if (runtimeState.task_ref !== taskContract.task_id || actionProposal.task_ref !== taskContract.task_id) {
    throw new RuntimeBlockedError('Subject mismatch: proposal, runtime state and task contract must name the same task_ref.', [
      'TASK_REF_MISMATCH'
    ]);
  }

  const authority = evaluateAction({ authorityPort, actionProposal });
  if (authority.decision !== 'ALLOW') {
    return {
      ok: false,
      stage: 'authority',
      authority,
      effectInvocations: 0,
      receipt: null,
      issues: [`Authority ${authority.decision}: no side effect (${authority.reason}).`]
    };
  }

  if (!effectPort || effectPort.port !== 'EffectPort' || typeof effectPort.dispatch !== 'function') {
    throw new RuntimeBlockedError('ALLOW requires a bound EffectPort before any effect (fail-closed).', [
      'EXTERNAL_PORT_REQUIRED'
    ]);
  }
  let rawResult;
  try {
    rawResult = effectPort.dispatch({ actionProposal, authority });
  } catch (error) {
    throw new RuntimeBlockedError(`EffectPort failed (no silent continue): ${error.message}`, [
      'EFFECT_PORT_FAILED'
    ]);
  }

  const receipt = Object.freeze({
    receipt_version: '1.0.0',
    receipt_id: `rcp_${proposalReceiptSuffix(actionProposal.proposal_id)}`,
    proposal_id: actionProposal.proposal_id,
    action_ref: actionProposal.action_ref,
    effect_ref: effectPort.effectRef,
    authority_decision_ref: authority.decision_ref,
    emitted_at: new Date().toISOString(),
    raw_result: rawResult
  });

  return {
    ok: true,
    stage: 'effect',
    authority,
    effectInvocations: 1,
    receipt,
    issues: []
  };
}

function proposalReceiptSuffix(proposalId) {
  return `${proposalId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(-24) || 'anonymous';
}

// Observation is bookkeeping about a receipt. It deliberately carries no
// result field: an observed receipt is not a verification.
function observeEffect({ receipt, authority }) {
  if (!receipt || receipt.receipt_version !== '1.0.0' || !isNonEmptyString(receipt.receipt_id)) {
    throw new RuntimeBlockedError('Observation requires a valid effect receipt.', ['RECEIPT_REQUIRED']);
  }
  return Object.freeze({
    observation_version: '1.0.0',
    observation_id: `obs_${proposalReceiptSuffix(receipt.receipt_id)}`,
    receipt_ref: receipt.receipt_id,
    authority_decision_ref: authority?.decision_ref ?? 'unspecified',
    observed_at: new Date().toISOString(),
    interpretation: 'none'
  });
}

export {
  PRODUCTION_EFFECT_PORT_STATUS,
  createEffectPort,
  executeActionProposal,
  observeEffect
};
