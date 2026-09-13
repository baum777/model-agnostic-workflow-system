import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLoopController, evaluateCompletionGuard } from '../../runtime/kernel/loop-controller.mjs';
import {
  CLG_WORKFLOW_STATE_MACHINE,
  TERMINAL_STATES,
  findTransition,
  isKnownState,
  isTerminalState
} from '../../runtime/kernel/loop-state-machine.mjs';
import { RuntimeBlockedError } from '../../runtime/kernel/runtime-errors.mjs';
import { validateVerificationRecord } from '../../runtime/contracts/clg-contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function makeTaskContract(overrides = {}) {
  return {
    ttc_version: '1.0.0',
    task_id: 'task-1',
    objective: 'objective',
    desired_outcome: 'outcome',
    success_criteria: [
      { criterion_id: 'crit-1', statement: 'done', verification_method_ref: 'method-1' }
    ],
    failure_criteria: [],
    constraints: [],
    scope: { included: ['x'], excluded: [] },
    authority_requirements: [],
    limits: { max_retries: 2, max_replans: 2 },
    ...overrides
  };
}

function makeRuntimeState(lifecycleState = 'candidate', overrides = {}) {
  return {
    rtc_version: '1.0.0',
    task_ref: 'task-1',
    lifecycle_state: lifecycleState,
    verification_status: 'unverified',
    retry_count: 0,
    replan_count: 0,
    context_generation: 0,
    ...overrides
  };
}

const SETUP_STEPS = [
  { to: 'scoped' },
  { to: 'planned' },
  { to: 'policy_checked' },
  { to: 'ready' },
  { to: 'running' }
];

function toRunning(controller, stateOverrides = {}) {
  let state = makeRuntimeState('candidate', stateOverrides);
  for (const step of SETUP_STEPS) {
    state = controller.applyTransition({ runtimeState: state, to: step.to }).runtimeState;
  }
  return state;
}

function makeVerificationRecord(overrides = {}) {
  return {
    vrc_version: '1.0.0',
    verification_id: 'vr-1',
    target_ref: 'task-1',
    method: 'method-1',
    verifier: { verifier_type: 'deterministic', verifier_ref: 'test-runner' },
    evidence_refs: ['evidence-1'],
    result: 'PASS',
    verified_at: new Date().toISOString(),
    ...overrides
  };
}

function makeDisposition(overrides = {}) {
  return {
    cc_version: '1.0.0',
    task_ref: 'task-1',
    disposition: 'ACCEPTED',
    claimed_stages: ['OUTPUT_GENERATED', 'ACTION_EXECUTED', 'VERIFICATION_PASSED', 'TASK_COMPLETE'],
    evidence_refs: ['evidence-1'],
    verified_by_refs: ['vr-1'],
    unmet_criteria: [],
    ...overrides
  };
}

function assertBlocked(call, expectedIssue) {
  assert.throws(call, (error) => {
    assert.ok(error instanceof RuntimeBlockedError, `expected RuntimeBlockedError, got ${error?.name}`);
    if (expectedIssue) {
      assert.ok(
        error.issues.some((issue) => String(issue).includes(expectedIssue)),
        `expected issue ${expectedIssue}, got ${JSON.stringify(error.issues)}`
      );
    }
    return true;
  });
}

test('state machine: canonical vocabulary and terminal set', () => {
  assert.equal(CLG_WORKFLOW_STATE_MACHINE.version, '0.1.0');
  assert.equal(CLG_WORKFLOW_STATE_MACHINE.states.length, 14);
  assert.deepEqual([...TERMINAL_STATES].sort(), ['cancelled', 'failed', 'succeeded']);
  assert.equal(CLG_WORKFLOW_STATE_MACHINE.initial_state, 'candidate');
  for (const terminal of TERMINAL_STATES) {
    assert.ok(isTerminalState(terminal));
    assert.equal(transitionsOut(terminal), 0, `terminal ${terminal} must have no outgoing transitions`);
  }
  function transitionsOut(state) {
    return CLG_WORKFLOW_STATE_MACHINE.transitions.filter((t) => t.from === state).length;
  }
});

test('state machine: every skill forbidden example is rejected by the transition table', () => {
  const forbidden = [
    ['candidate', 'running'],
    ['planned', 'ready'],
    ['running', 'succeeded'],
    ['succeeded', 'running'],
    ['failed', 'running'],
    ['cancelled', 'ready'],
    ['contained', 'running'],
    ['contained', 'succeeded'],
    ['policy_checked', 'running']
  ];
  for (const [from, to] of forbidden) {
    assert.equal(findTransition(from, to), null, `${from}->${to} must not exist`);
  }
});

test('P2-004: unknown state, unknown decision, forbidden transition, terminal reopen, bypass all reject', () => {
  const controller = createLoopController();

  assertBlocked(
    () => controller.applyTransition({ runtimeState: makeRuntimeState('bogus_state'), to: 'scoped' }),
    'UNKNOWN_STATE'
  );
  assertBlocked(
    () => controller.applyTransition({ runtimeState: makeRuntimeState('running'), to: 'nirvana' }),
    'UNKNOWN_STATE'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: makeRuntimeState('running'),
      taskContract: makeTaskContract(),
      decision: 'HACK_THE_LOOP'
    }),
    'UNKNOWN_DECISION'
  );
  assertBlocked(
    () => controller.applyTransition({ runtimeState: makeRuntimeState('running'), to: 'succeeded' }),
    'UNSPECIFIED_TRANSITION'
  );
  assertBlocked(
    () => controller.applyTransition({ runtimeState: makeRuntimeState('candidate'), to: 'running' }),
    'UNSPECIFIED_TRANSITION'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: makeRuntimeState('succeeded'),
      taskContract: makeTaskContract(),
      decision: 'CONTINUE'
    }),
    'TERMINAL_STATE'
  );
  for (const terminal of TERMINAL_STATES) {
    assert.ok(isTerminalState(terminal));
  }
});

test('P2-004: low-level applyTransition cannot bypass the state machine (no direct execution)', () => {
  const controller = createLoopController();
  const running = toRunning(controller);
  assert.equal(running.lifecycle_state, 'running');
  assertBlocked(
    () => controller.applyTransition({ runtimeState: running, to: 'succeeded', decision: 'just_execute' }),
    'UNSPECIFIED_TRANSITION'
  );
  assertBlocked(
    () => controller.applyTransition({ runtimeState: running, to: 'ready', decision: 'rewind' }),
    'UNSPECIFIED_TRANSITION'
  );
});

test('P2-004: foreign state machines are rejected (exactly one runtime owner)', () => {
  assertBlocked(
    () => createLoopController({ stateMachine: { ...CLG_WORKFLOW_STATE_MACHINE, version: '9.9.9' } }),
    'FOREIGN_STATE_MACHINE'
  );
});

test('P2-003: output only, action only, receipt only all DENY COMPLETE', () => {
  const controller = createLoopController();
  const cases = [
    { name: 'output only', claimed: ['OUTPUT_GENERATED'], evidence: ['e-1'], verifiedBy: [] },
    { name: 'action executed only', claimed: ['ACTION_EXECUTED'], evidence: ['e-1'], verifiedBy: [] },
    { name: 'verification claimed without evidence', claimed: ['VERIFICATION_PASSED'], evidence: [], verifiedBy: [] }
  ];
  for (const testCase of cases) {
    const result = controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'COMPLETE',
      completionDisposition: makeDisposition({
        claimed_stages: testCase.claimed,
        evidence_refs: testCase.evidence,
        verified_by_refs: testCase.verifiedBy
      }),
      verificationRecords: []
    });
    assert.equal(result.ok, false, `${testCase.name} must not complete`);
    assert.equal(result.outcome, 'completion_not_met');
    assert.equal(result.runtimeState.lifecycle_state, 'failed');
  }
});

test('P2-003: FAILED verification, unbound verifier ref and unmet criteria DENY COMPLETE', () => {
  const controller = createLoopController();

  const failed = controller.applyDecision({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    decision: 'COMPLETE',
    completionDisposition: makeDisposition(),
    verificationRecords: [makeVerificationRecord({ result: 'FAIL' })]
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.runtimeState.lifecycle_state, 'failed');
  assert.equal(failed.runtimeState.verification_status, 'failed');

  const unbound = controller.applyDecision({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    decision: 'COMPLETE',
    completionDisposition: makeDisposition({ verified_by_refs: ['vr-ghost'] }),
    verificationRecords: [makeVerificationRecord()]
  });
  assert.equal(unbound.ok, false);
  assert.ok(unbound.issues.some((issue) => String(issue).includes('vr-ghost')));

  const unmet = controller.applyDecision({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    decision: 'COMPLETE',
    completionDisposition: makeDisposition({ unmet_criteria: ['crit-1'] }),
    verificationRecords: [makeVerificationRecord()]
  });
  assert.equal(unmet.ok, false);
  assert.equal(unmet.outcome, 'completion_not_met');
});

test('P2-003: UNKNOWN verification contains the task instead of completing it', () => {
  const controller = createLoopController();
  const result = controller.applyDecision({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    decision: 'COMPLETE',
    completionDisposition: makeDisposition(),
    verificationRecords: [makeVerificationRecord({ result: 'UNKNOWN' })]
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'verification_indeterminate');
  assert.equal(result.runtimeState.lifecycle_state, 'contained');
  assert.equal(result.runtimeState.verification_status, 'unknown');
});

test('P2-003: self-verification and self-reflection PASS are denied at record level', () => {
  assert.ok(!validateVerificationRecord(makeVerificationRecord({
    verifier: { verifier_type: 'deterministic', verifier_ref: 'task-1' }
  })).ok, 'target may not verify itself');
  assert.ok(!validateVerificationRecord(makeVerificationRecord({
    verifier: { verifier_type: 'self_reflection', verifier_ref: 'inner-monologue' },
    result: 'PASS'
  })).ok, 'self_reflection cannot produce a standalone PASS');
});

test('P2-003 positive path: all criteria + PASS verification + evidence allow COMPLETE', () => {
  const controller = createLoopController();
  const before = toRunning(controller, { verification_status: 'unverified' });
  const result = controller.applyDecision({
    runtimeState: before,
    taskContract: makeTaskContract(),
    decision: 'COMPLETE',
    completionDisposition: makeDisposition(),
    verificationRecords: [makeVerificationRecord()]
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'completion_verified');
  assert.equal(result.runtimeState.lifecycle_state, 'succeeded');
  assert.equal(result.runtimeState.verification_status, 'passed');
  assert.equal(result.runtimeState.latest_verification_ref, 'vr-1');
  assert.equal(result.transitionRecords.length, 2);
  assert.deepEqual(
    result.transitionRecords.map((record) => `${record.from}->${record.to}`),
    ['running->validating', 'validating->succeeded']
  );
  assert.equal(result.transitionRecords[1].reason_code, 'completion_verified');
  assert.ok(result.transitionRecords.every((record) => record.trc_version === '1.0.0'));
  assert.ok(result.transitionRecords.every((record) => record.transition_id.startsWith('trt_')));
});

test('P2-005: retry below limit is permitted, at limit is contained, unbounded is denied', () => {
  const controller = createLoopController();
  let state = toRunning(controller);

  state = controller.applyDecision({
    runtimeState: state, taskContract: makeTaskContract({ limits: { max_retries: 2, max_replans: 2 } }),
    decision: 'RETRY'
  }).runtimeState;
  assert.equal(state.lifecycle_state, 'recovering');
  assert.equal(state.retry_count, 1);

  state = controller.applyDecision({
    runtimeState: state, taskContract: makeTaskContract(),
    decision: 'CONTINUE', evidenceRefs: ['recovery-evidence']
  }).runtimeState;
  assert.equal(state.lifecycle_state, 'running');

  const exhausted = controller.applyDecision({
    runtimeState: state, taskContract: makeTaskContract({ limits: { max_retries: 1, max_replans: 2 } }),
    decision: 'RETRY'
  });
  assert.equal(exhausted.runtimeState.lifecycle_state, 'contained');
  assert.equal(exhausted.transitionRecords[0].reason_code, 'budget_exceeded');
});

test('P2-005: unbounded retry budget is denied fail-closed', () => {
  const controller = createLoopController();
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract({ limits: {} }),
      decision: 'RETRY'
    }),
    'BUDGET_UNBOUNDED'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract({ limits: {} }),
      decision: 'REPLAN'
    }),
    'BUDGET_UNBOUNDED'
  );
});

test('P2-005: replan budget cycles below the limit and contains at the limit', () => {
  const controller = createLoopController();
  let state = toRunning(controller);
  state = controller.applyDecision({
    runtimeState: state, taskContract: makeTaskContract({ limits: { max_retries: 1, max_replans: 1 } }),
    decision: 'REPLAN', evidenceRefs: ['new-plan-ref']
  }).runtimeState;
  assert.equal(state.lifecycle_state, 'recovering');
  assert.equal(state.replan_count, 1);

  state = controller.applyDecision({
    runtimeState: state, taskContract: makeTaskContract(),
    decision: 'CONTINUE', evidenceRefs: ['replan-applied']
  }).runtimeState;
  assert.equal(state.lifecycle_state, 'running');
  assert.equal(state.replan_count, 1, 'replan_count persists');

  const atLimit = controller.applyDecision({
    runtimeState: state, taskContract: makeTaskContract({ limits: { max_retries: 1, max_replans: 1 } }),
    decision: 'REPLAN', evidenceRefs: ['another-plan']
  });
  assert.equal(atLimit.runtimeState.lifecycle_state, 'contained');
  assert.equal(atLimit.runtimeState.replan_count, 1, 'budget cannot reset implicitly');
});

test('P2-005: repair requires evidence and shares the retry budget', () => {
  const controller = createLoopController();
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'REPAIR',
      evidenceRefs: []
    }),
    'EVIDENCE_REQUIRED'
  );
  const repaired = controller.applyDecision({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract({ limits: { max_retries: 1, max_replans: 0 } }),
    decision: 'REPAIR',
    evidenceRefs: ['repair-plan']
  });
  assert.equal(repaired.runtimeState.lifecycle_state, 'recovering');
  assert.equal(repaired.runtimeState.retry_count, 1);
});

test('containment exit requires an authorized human recovery decision', () => {
  const controller = createLoopController();
  const contained = makeRuntimeState('contained');
  assertBlocked(
    () => controller.applyTransition({ runtimeState: contained, to: 'recovering' }),
    'CONTAINMENT_EXIT_AUTHORIZED_RECOVERY_REQUIRED'
  );
  assertBlocked(
    () => controller.applyTransition({
      runtimeState: contained,
      to: 'recovering',
      authorizedRecovery: { authorized_recovery_decision: true, actor_type: 'agent' }
    }),
    'CONTAINMENT_EXIT_AUTHORIZED_RECOVERY_REQUIRED'
  );
  const recovered = controller.applyTransition({
    runtimeState: contained,
    to: 'recovering',
    authorizedRecovery: { authorized_recovery_decision: true, actor_type: 'human' }
  });
  assert.equal(recovered.runtimeState.lifecycle_state, 'recovering');
  assert.equal(recovered.transitionRecords[0].reason_code, 'authorized_recovery');
});

test('P2-006: context acquisition is an explicit port-mediated transition', () => {
  const controller = createLoopController();
  let assembleCalls = 0;
  const port = {
    engine_ref: 'fake-engine',
    assemble: () => {
      assembleCalls += 1;
      return {
        ctx_version: '1.0.0',
        context_id: 'ctx-1',
        task_ref: 'task-1',
        token_budget: 100,
        sections: [{
          source_ref: 'src-1',
          source_type: 'repo_file',
          provenance: 'test',
          token_estimate: 10,
          inclusion_reason: 'needed'
        }],
        omitted_sources: [],
        compression_applied: []
      };
    }
  };
  const result = controller.applyDecision({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    decision: 'ACQUIRE_CONTEXT',
    contextEnginePort: port
  });
  assert.equal(result.ok, true);
  assert.equal(assembleCalls, 1, 'port invoked exactly once');
  assert.equal(result.runtimeState.context_generation, 1);
  assert.equal(result.runtimeState.lifecycle_state, 'running');
  assert.equal(result.transitionRecords[0].decision, 'ACQUIRE_CONTEXT');
  assert.equal(result.transitionRecords[0].reason_code, 'context_acquired');
});

test('P2-006: missing port, failing port and invalid manifest all block without silent continue', () => {
  const controller = createLoopController();

  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'ACQUIRE_CONTEXT',
      contextEnginePort: null
    }),
    'EXTERNAL_PORT_REQUIRED'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'ACQUIRE_CONTEXT',
      contextEnginePort: { assemble: () => { throw new Error('engine exploded'); } }
    }),
    'CONTEXT_PORT_FAILED'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'ACQUIRE_CONTEXT',
      contextEnginePort: {
        assemble: () => ({
          ctx_version: '1.0.0', context_id: 'ctx-1', task_ref: 'task-1', token_budget: 5,
          sections: [{ source_ref: 's', source_type: 't', provenance: 'p', token_estimate: 50, inclusion_reason: 'r' }],
          omitted_sources: [], compression_applied: []
        })
      }
    }),
    'exceed token_budget'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: makeRuntimeState('planned'),
      taskContract: makeTaskContract(),
      decision: 'ACQUIRE_CONTEXT',
      contextEnginePort: { assemble: () => ({}) }
    }),
    'UNSUPPORTED_DECISION_FOR_STATE'
  );
});

test('documented v0.1.0 gaps deny fail-closed instead of faking success', () => {
  const controller = createLoopController();
  const aborted = controller.applyDecision({
    runtimeState: makeRuntimeState('candidate'),
    taskContract: makeTaskContract(),
    decision: 'ABORT'
  });
  assert.equal(aborted.runtimeState.lifecycle_state, 'cancelled');

  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'ABORT'
    }),
    'UNSPECIFIED_TRANSITION'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'DELEGATE'
    }),
    'EXTERNAL_PORT_REQUIRED'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'WAIT_EXTERNAL_EVENT'
    }),
    'UNSUPPORTED_IN_P2'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'ESCALATE'
    }),
    'UNSUPPORTED_IN_P2'
  );
  assertBlocked(
    () => controller.applyDecision({
      runtimeState: toRunning(controller),
      taskContract: makeTaskContract(),
      decision: 'REQUIRE_APPROVAL'
    }),
    'UNSPECIFIED_TRANSITION'
  );
  const approval = controller.applyDecision({
    runtimeState: makeRuntimeState('policy_checked'),
    taskContract: makeTaskContract(),
    decision: 'REQUIRE_APPROVAL'
  });
  assert.equal(approval.runtimeState.lifecycle_state, 'waiting_for_approval');
});

test('transition records are complete and append-only shaped', () => {
  const controller = createLoopController();
  const result = controller.applyTransition({
    runtimeState: makeRuntimeState('candidate'),
    to: 'scoped',
    decision: 'scope_accepted',
    evidenceRefs: ['scope-doc']
  });
  const record = result.transitionRecords[0];
  assert.equal(record.trc_version, '1.0.0');
  assert.ok(record.transition_id.startsWith('trt_'));
  assert.equal(record.from, 'candidate');
  assert.equal(record.to, 'scoped');
  assert.equal(record.reason_code, 'scope_accepted');
  assert.equal(record.decision, 'scope_accepted');
  assert.deepEqual([...record.evidence_refs], ['scope-doc']);
  assert.ok(typeof record.ts === 'string' && record.ts.length > 0);
});

test('kernel loop files stay domain-free', () => {
  const files = [
    'runtime/kernel/loop-state-machine.mjs',
    'runtime/kernel/loop-controller.mjs',
    'runtime/kernel/loop-artifacts.mjs'
  ];
  const forbidden = /Unitera|tenant|TenantNodeBinding|RuntimeAdmission|CapabilityGrant|capability_invocation|CCA-02|sovereignty|PersonalRealm|CommitmentStage|Mews|Companion/i;
  for (const relative of files) {
    const content = readFileSync(path.resolve(repoRoot, relative), 'utf8');
    assert.ok(!forbidden.test(content), `${relative} must stay domain-free`);
  }
});
