// CLG generic loop state machine (P2 enforcement vocabulary).
//
// Ownership: shared-core runtime/kernel owns the generic runtime lifecycle.
// This definition is derived 1:1 from the normative skill-harness state machine
// (baum-os skills/baum-os-agentic-workflow-orchestration/state/workflow-state-machine.yaml
// v0.1.0). It is the single runtime-enforced copy; the skill file remains the
// harness input it always was. Sync is owner-maintained; deviations: none.
//
// Transitions not listed here are FORBIDDEN and must be rejected fail-closed
// (unspecified transition = DENY).

const STATE_MACHINE_ID = 'clg-workflow';
const STATE_MACHINE_VERSION = '0.1.0';

const STATES = Object.freeze([
  'candidate',
  'scoped',
  'planned',
  'policy_checked',
  'waiting_for_input',
  'waiting_for_approval',
  'ready',
  'running',
  'validating',
  'recovering',
  'contained',
  'succeeded',
  'failed',
  'cancelled'
]);

const TERMINAL_STATES = Object.freeze(['succeeded', 'failed', 'cancelled']);

// `contained` is NOT terminal, but may only be left via authorized recovery.
const CONTAINMENT_STATE = 'contained';
const CONTAINMENT_EXIT_REQUIRES = Object.freeze({
  authorized_recovery_decision: true,
  actor_type: 'human'
});

const TRANSITIONS = Object.freeze([
  { from: 'candidate', to: 'scoped', reason_code: 'scope_accepted' },
  { from: 'candidate', to: 'cancelled', reason_code: 'cancelled_by_owner' },
  { from: 'scoped', to: 'planned', reason_code: 'plan_created' },
  { from: 'scoped', to: 'contained', reason_code: 'contract_gate_failed' },
  { from: 'scoped', to: 'cancelled', reason_code: 'cancelled_by_owner' },
  { from: 'planned', to: 'policy_checked', reason_code: 'policy_evaluated' },
  { from: 'policy_checked', to: 'ready', reason_code: 'policy_allow' },
  { from: 'policy_checked', to: 'waiting_for_input', reason_code: 'input_missing' },
  { from: 'policy_checked', to: 'waiting_for_approval', reason_code: 'approval_required' },
  { from: 'policy_checked', to: 'contained', reason_code: 'policy_conflict' },
  { from: 'policy_checked', to: 'failed', reason_code: 'policy_denied' },
  { from: 'waiting_for_input', to: 'scoped', reason_code: 'input_received' },
  { from: 'waiting_for_input', to: 'cancelled', reason_code: 'input_timeout' },
  { from: 'waiting_for_approval', to: 'ready', reason_code: 'approval_granted' },
  { from: 'waiting_for_approval', to: 'cancelled', reason_code: 'approval_rejected' },
  { from: 'waiting_for_approval', to: 'contained', reason_code: 'approval_expired' },
  { from: 'ready', to: 'running', reason_code: 'execution_started' },
  { from: 'ready', to: 'cancelled', reason_code: 'cancelled_by_owner' },
  { from: 'running', to: 'validating', reason_code: 'execution_finished' },
  { from: 'running', to: 'recovering', reason_code: 'retryable_failure' },
  { from: 'running', to: 'contained', reason_code: 'budget_exceeded' },
  { from: 'running', to: 'failed', reason_code: 'permanent_failure' },
  { from: 'recovering', to: 'running', reason_code: 'recovery_succeeded' },
  { from: 'recovering', to: 'contained', reason_code: 'recovery_blocked' },
  { from: 'recovering', to: 'failed', reason_code: 'recovery_failed' },
  { from: 'contained', to: 'recovering', reason_code: 'authorized_recovery' },
  { from: 'contained', to: 'cancelled', reason_code: 'cancelled_by_owner' },
  { from: 'validating', to: 'succeeded', reason_code: 'completion_verified' },
  { from: 'validating', to: 'recovering', reason_code: 'verification_retryable' },
  { from: 'validating', to: 'contained', reason_code: 'verification_indeterminate' },
  { from: 'validating', to: 'failed', reason_code: 'completion_not_met' }
]);

function isKnownState(state) {
  return typeof state === 'string' && STATES.includes(state);
}

function isTerminalState(state) {
  return typeof state === 'string' && TERMINAL_STATES.includes(state);
}

function findTransition(fromState, toState) {
  return TRANSITIONS.find((t) => t.from === fromState && t.to === toState) ?? null;
}

function transitionsFrom(fromState) {
  return TRANSITIONS.filter((t) => t.from === fromState);
}

const CLG_WORKFLOW_STATE_MACHINE = Object.freeze({
  state_machine_id: STATE_MACHINE_ID,
  version: STATE_MACHINE_VERSION,
  derived_from: 'baum-os skills/baum-os-agentic-workflow-orchestration/state/workflow-state-machine.yaml v0.1.0',
  sync_posture: 'owner-maintained; deviations: none',
  initial_state: 'candidate',
  states: STATES,
  terminal_states: TERMINAL_STATES,
  containment_state: CONTAINMENT_STATE,
  containment_exit_requires: CONTAINMENT_EXIT_REQUIRES,
  transitions: TRANSITIONS
});

export {
  CLG_WORKFLOW_STATE_MACHINE,
  CONTAINMENT_EXIT_REQUIRES,
  CONTAINMENT_STATE,
  STATES,
  STATE_MACHINE_ID,
  STATE_MACHINE_VERSION,
  TERMINAL_STATES,
  TRANSITIONS,
  findTransition,
  isKnownState,
  isTerminalState,
  transitionsFrom
};
