import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateCompletion } from '../../runtime/kernel/completion-evaluator.mjs';
import {
  createAuthorityPort,
  evaluateAction,
  validateActionProposal
} from '../../runtime/kernel/authority-port.mjs';
import {
  PRODUCTION_EFFECT_PORT_STATUS,
  createEffectPort,
  executeActionProposal,
  observeEffect
} from '../../runtime/kernel/action-boundary.mjs';
import { createLoopController } from '../../runtime/kernel/loop-controller.mjs';
import { RuntimeBlockedError } from '../../runtime/kernel/runtime-errors.mjs';

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

function makeProposal(overrides = {}) {
  return {
    proposal_id: 'prp-1',
    task_ref: 'task-1',
    subject_ref: 'subject-1',
    action_ref: 'action-1',
    resource_ref: 'resource-1',
    ...overrides
  };
}

// ---------- P3-A CompletionEvaluator ----------

test('evaluator is deterministic: same evidence, same evaluation', () => {
  const input = {
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord()]
  };
  const first = evaluateCompletion(input);
  const second = evaluateCompletion(input);
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(first.result, 'COMPLETE_READY');
});

test('agent says done: no verification records -> INCOMPLETE', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: []
  });
  assert.equal(evaluation.result, 'INCOMPLETE');
  assert.deepEqual(evaluation.criteria.unsatisfied, ['crit-1']);
});

test('output exists: a produced output satisfies no criterion -> INCOMPLETE', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: []
  });
  assert.equal(evaluation.result, 'INCOMPLETE');
  assert.equal(evaluation.criteria.satisfied.length, 0);
});

test('effect receipt only: a receipt is not a verification', () => {
  // A receipt existing in the world satisfies no criterion: the evaluator
  // consumes VerificationRecords only.
  const receiptOnly = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: []
  });
  assert.equal(receiptOnly.result, 'INCOMPLETE');
  // And a receipt passed off as a verification record is malformed evidence:
  // fail-closed BLOCKED, never a PASS.
  const receipt = {
    receipt_version: '1.0.0',
    receipt_id: 'rcp-1',
    proposal_id: 'prp-1',
    action_ref: 'action-1',
    effect_ref: 'effect-1',
    raw_result: { ok: true }
  };
  const passedAsRecord = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [receipt]
  });
  assert.equal(passedAsRecord.result, 'BLOCKED');
});

test('one of N success criteria missing -> INCOMPLETE with named criterion', () => {
  const taskContract = makeTaskContract({
    success_criteria: [
      { criterion_id: 'crit-1', statement: 'a', verification_method_ref: 'method-1' },
      { criterion_id: 'crit-2', statement: 'b', verification_method_ref: 'method-2' }
    ]
  });
  const evaluation = evaluateCompletion({
    taskContract,
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord({ method: 'method-1' })]
  });
  assert.equal(evaluation.result, 'INCOMPLETE');
  assert.deepEqual(evaluation.criteria.satisfied, ['crit-1']);
  assert.deepEqual(evaluation.criteria.unsatisfied, ['crit-2']);
});

test('required verification missing -> INCOMPLETE', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord({ method: 'some-other-method' })]
  });
  assert.equal(evaluation.result, 'INCOMPLETE');
});

test('verification FAIL -> BLOCKED', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord({ result: 'FAIL' })]
  });
  assert.equal(evaluation.result, 'BLOCKED');
});

test('evidence subject digest mismatch -> BLOCKED', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord({ subject_digest: 'sha256:other-bytes' })],
    subjectDigest: 'sha256:expected-bytes'
  });
  assert.equal(evaluation.result, 'BLOCKED');
});

test('verification subject mismatch (target_ref != contract subject) -> BLOCKED', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord({ target_ref: 'task-2' })]
  });
  assert.equal(evaluation.result, 'BLOCKED');
});

test('task_ref mismatch between state and contract -> BLOCKED', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating', { task_ref: 'task-9' }),
    verificationRecords: [makeVerificationRecord()]
  });
  assert.equal(evaluation.result, 'BLOCKED');
});

test('malformed verification record -> BLOCKED (fail-closed)', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord({ evidence_refs: [] })]
  });
  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.result, 'BLOCKED');
});

test('all criteria + valid evidence + required PASS -> COMPLETE_READY', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('validating'),
    verificationRecords: [makeVerificationRecord()]
  });
  assert.equal(evaluation.result, 'COMPLETE_READY');
  assert.deepEqual(evaluation.criteria.satisfied, ['crit-1']);
  assert.deepEqual(evaluation.verification_refs, ['vr-1']);
  assert.ok(evaluation.evidence_refs.includes('evidence-1'));
});

test('completion requires evaluator AND guard: impeccable disposition, unsatisfied criteria -> DENIED', () => {
  const controller = createLoopController();
  const runtimeState = toRunning(controller);
  const result = controller.applyDecision({
    runtimeState,
    taskContract: makeTaskContract(),
    decision: 'COMPLETE',
    completionDisposition: makeDisposition(),
    verificationRecords: [makeVerificationRecord({ method: 'never-declared-method' })]
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'completion_not_met');
  assert.equal(result.runtimeState.lifecycle_state, 'failed');
});

test('completion requires evaluator AND guard: satisfied criteria, output-only disposition -> DENIED by guard', () => {
  const controller = createLoopController();
  const runtimeState = toRunning(controller);
  const result = controller.applyDecision({
    runtimeState,
    taskContract: makeTaskContract(),
    decision: 'COMPLETE',
    completionDisposition: makeDisposition({
      disposition: 'PROPOSED',
      claimed_stages: ['OUTPUT_GENERATED'],
      evidence_refs: []
    }),
    verificationRecords: [makeVerificationRecord()]
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'completion_not_met');
  assert.equal(result.runtimeState.lifecycle_state, 'failed');
});

test('verification does not auto-complete: a PASS record alone completes nothing', () => {
  const evaluation = evaluateCompletion({
    taskContract: makeTaskContract(),
    runtimeState: makeRuntimeState('running'),
    verificationRecords: [makeVerificationRecord()]
  });
  // The evaluator only evaluates; state transition needs the guard + COMPLETE.
  assert.equal(evaluation.result, 'COMPLETE_READY');
  assert.equal(makeRuntimeState('running').lifecycle_state, 'running');
});

// ---------- P3-B AuthorityPort ----------

test('validateActionProposal rejects malformed proposals', () => {
  assert.equal(validateActionProposal(null).ok, false);
  assert.equal(validateActionProposal({ proposal_id: 'x' }).ok, false);
  assert.equal(validateActionProposal(makeProposal()).ok, true);
});

test('createAuthorityPort rejects bindings without evaluate() (fail-closed)', () => {
  assert.throws(() => createAuthorityPort({}), (error) => error instanceof RuntimeBlockedError);
});

test('missing AuthorityPort -> UNAVAILABLE, no side effect', () => {
  const result = evaluateAction({ authorityPort: null, actionProposal: makeProposal() });
  assert.equal(result.decision, 'UNAVAILABLE');
  assert.equal(result.portCalled, false);
});

test('failing AuthorityPort -> UNAVAILABLE, no side effect', () => {
  const port = createAuthorityPort({
    evaluate: () => {
      throw new Error('authority backend down');
    }
  });
  const result = evaluateAction({ authorityPort: port, actionProposal: makeProposal() });
  assert.equal(result.decision, 'UNAVAILABLE');
  assert.equal(result.portCalled, true);
  assert.match(result.reason, /authority backend down/);
});

test('invalid decision value -> DENY', () => {
  const port = createAuthorityPort({
    evaluate: () => ({ decision: 'SURE_WHY_NOT', decision_ref: 'dec-1', subject_ref: 'subject-1', action_ref: 'action-1' })
  });
  const result = evaluateAction({ authorityPort: port, actionProposal: makeProposal() });
  assert.equal(result.decision, 'DENY');
});

test('expired authority -> DENY, no side effect', () => {
  const port = createAuthorityPort({
    evaluate: () => ({
      decision: 'ALLOW',
      decision_ref: 'dec-1',
      subject_ref: 'subject-1',
      action_ref: 'action-1',
      expires_at: '2000-01-01T00:00:00.000Z'
    })
  });
  const result = evaluateAction({ authorityPort: port, actionProposal: makeProposal() });
  assert.equal(result.decision, 'DENY');
  assert.match(result.reason, /expired/i);
});

test('authority subject/action mismatch -> DENY, no side effect', () => {
  const port = createAuthorityPort({
    evaluate: () => ({
      decision: 'ALLOW',
      decision_ref: 'dec-1',
      subject_ref: 'somebody-else',
      action_ref: 'action-1'
    })
  });
  const result = evaluateAction({ authorityPort: port, actionProposal: makeProposal() });
  assert.equal(result.decision, 'DENY');
  assert.match(result.reason, /mismatch/i);
});

test('missing decision_ref -> DENY', () => {
  const port = createAuthorityPort({
    evaluate: () => ({ decision: 'ALLOW', subject_ref: 'subject-1', action_ref: 'action-1' })
  });
  const result = evaluateAction({ authorityPort: port, actionProposal: makeProposal() });
  assert.equal(result.decision, 'DENY');
});

test('valid ALLOW is normalized with evidence refs', () => {
  const port = createAuthorityPort({
    evaluate: () => ({
      decision: 'ALLOW',
      decision_ref: 'dec-1',
      subject_ref: 'subject-1',
      action_ref: 'action-1',
      evidence_refs: ['auth-evidence-1']
    })
  });
  const result = evaluateAction({ authorityPort: port, actionProposal: makeProposal() });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.decision_ref, 'dec-1');
  assert.deepEqual(result.evidence_refs, ['auth-evidence-1']);
});

// ---------- P3-C Action boundary ----------

function buildEffectSpy() {
  const calls = [];
  return {
    calls,
    port: createEffectPort({
      effect_ref: 'effect-1',
      dispatch: ({ actionProposal }) => {
        calls.push(actionProposal.proposal_id);
        return { ok: true, echo: actionProposal.action_ref };
      }
    })
  };
}

const allowPort = createAuthorityPort({
  evaluate: ({ actionProposal }) => ({
    decision: 'ALLOW',
    decision_ref: 'dec-allow',
    subject_ref: actionProposal.subject_ref,
    action_ref: actionProposal.action_ref
  })
});

const denyPort = createAuthorityPort({
  evaluate: ({ actionProposal }) => ({
    decision: 'DENY',
    decision_ref: 'dec-deny',
    subject_ref: actionProposal.subject_ref,
    action_ref: actionProposal.action_ref
  })
});

const requireApprovalPort = createAuthorityPort({
  evaluate: ({ actionProposal }) => ({
    decision: 'REQUIRE_APPROVAL',
    decision_ref: 'dec-approval',
    subject_ref: actionProposal.subject_ref,
    action_ref: actionProposal.action_ref
  })
});

test('DENY: effect mock call count == 0', () => {
  const controller = createLoopController();
  const { calls, port } = buildEffectSpy();
  const result = executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: denyPort,
    effectPort: port
  });
  assert.equal(result.ok, false);
  assert.equal(result.effectInvocations, 0);
  assert.equal(calls.length, 0);
});

test('missing authority: effect mock call count == 0', () => {
  const controller = createLoopController();
  const { calls, port } = buildEffectSpy();
  const result = executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: null,
    effectPort: port
  });
  assert.equal(result.ok, false);
  assert.equal(result.authority.decision, 'UNAVAILABLE');
  assert.equal(result.effectInvocations, 0);
  assert.equal(calls.length, 0);
});

test('REQUIRE_APPROVAL: no side effect and no invented state transition', () => {
  const controller = createLoopController();
  const { calls, port } = buildEffectSpy();
  const runtimeState = toRunning(controller);
  const result = executeActionProposal({
    runtimeState,
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: requireApprovalPort,
    effectPort: port
  });
  assert.equal(result.ok, false);
  assert.equal(result.effectInvocations, 0);
  assert.equal(calls.length, 0);
  // State-machine interaction: without an owner-dispositioned transition,
  // REQUIRE_APPROVAL from running is denied, not silently redirected.
  assert.equal(runtimeState.lifecycle_state, 'running');
  assert.throws(() => controller.applyDecision({
    runtimeState,
    taskContract: makeTaskContract(),
    decision: 'REQUIRE_APPROVAL',
    evidenceRefs: ['approval-request-1']
  }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('UNSPECIFIED_TRANSITION'));
});

test('UNAVAILABLE authority: no side effect', () => {
  const controller = createLoopController();
  const { calls, port } = buildEffectSpy();
  const failing = createAuthorityPort({
    evaluate: () => {
      throw new Error('down');
    }
  });
  const result = executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: failing,
    effectPort: port
  });
  assert.equal(result.ok, false);
  assert.equal(result.effectInvocations, 0);
  assert.equal(calls.length, 0);
});

test('ALLOW: effect mock call count == 1, receipt issued', () => {
  const controller = createLoopController();
  const { calls, port } = buildEffectSpy();
  const result = executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: allowPort,
    effectPort: port
  });
  assert.equal(result.ok, true);
  assert.equal(result.effectInvocations, 1);
  assert.equal(calls.length, 1);
  assert.equal(result.receipt.proposal_id, 'prp-1');
  assert.equal(result.receipt.authority_decision_ref, 'dec-allow');
});

test('AuthorityDecision != Effect: ALLOW alone is not task completion', () => {
  const controller = createLoopController();
  const { port } = buildEffectSpy();
  const runtimeState = toRunning(controller);
  const result = executeActionProposal({
    runtimeState,
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: allowPort,
    effectPort: port
  });
  assert.equal(result.ok, true);
  assert.equal(runtimeState.lifecycle_state, 'running');
});

test('effects outside running are rejected', () => {
  const controller = createLoopController();
  const { port } = buildEffectSpy();
  assert.throws(() => executeActionProposal({
    runtimeState: makeRuntimeState('candidate'),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: allowPort,
    effectPort: port
  }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('EFFECTS_ONLY_DURING_RUNNING'));
});

test('ALLOW without EffectPort blocks instead of faking success', () => {
  const controller = createLoopController();
  assert.throws(() => executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: allowPort,
    effectPort: null
  }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('EXTERNAL_PORT_REQUIRED'));
});

test('failing EffectPort -> EFFECT_PORT_FAILED (no silent continue)', () => {
  const controller = createLoopController();
  const broken = createEffectPort({
    effect_ref: 'effect-broken',
    dispatch: () => {
      throw new Error('effect backend exploded');
    }
  });
  assert.throws(() => executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: allowPort,
    effectPort: broken
  }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('EFFECT_PORT_FAILED'));
});

test('invalid ActionProposal is rejected before any authority check', () => {
  const controller = createLoopController();
  const { port } = buildEffectSpy();
  assert.throws(() => executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: { proposal_id: 'prp-1' },
    authorityPort: allowPort,
    effectPort: port
  }), (error) => error instanceof RuntimeBlockedError);
});

test('task_ref mismatch between proposal and contract is rejected', () => {
  const controller = createLoopController();
  const { port } = buildEffectSpy();
  assert.throws(() => executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal({ task_ref: 'task-2' }),
    authorityPort: allowPort,
    effectPort: port
  }), (error) => error instanceof RuntimeBlockedError && error.issues.includes('TASK_REF_MISMATCH'));
});

test('receipt does not auto-verify: observation carries no result', () => {
  const controller = createLoopController();
  const { port } = buildEffectSpy();
  const result = executeActionProposal({
    runtimeState: toRunning(controller),
    taskContract: makeTaskContract(),
    actionProposal: makeProposal(),
    authorityPort: allowPort,
    effectPort: port
  });
  const observation = observeEffect({ receipt: result.receipt, authority: result.authority });
  assert.equal(observation.interpretation, 'none');
  assert.equal(Object.keys(observation).includes('result'), false);
  assert.equal(typeof observation.receipt_ref, 'string');
  // No VerificationRecord was produced anywhere in the boundary return.
  assert.equal(result.verificationRecord, undefined);
  assert.equal(result.runtimeState, undefined);
});

test('observation requires a valid receipt', () => {
  assert.throws(() => observeEffect({ receipt: null, authority: null }), (error) => error instanceof RuntimeBlockedError);
});

test('production effect adapter stays deactivated', () => {
  assert.equal(PRODUCTION_EFFECT_PORT_STATUS, 'EXTERNAL_PORT_NOT_ACTIVATED');
});

test('domain-free scan: P3 kernel files carry no domain semantics', () => {
  const files = [
    'runtime/kernel/completion-evaluator.mjs',
    'runtime/kernel/authority-port.mjs',
    'runtime/kernel/action-boundary.mjs'
  ];
  const domainPattern = /Unitera|tenant|TenantNodeBinding|RuntimeAdmission|CapabilityGrant|capability_invocation|CCA-02|sovereignty|PersonalRealm|CommitmentStage|Mews|Companion|RPA/i;
  for (const file of files) {
    const content = readFileSync(path.join(repoRoot, file), 'utf8');
    assert.equal(domainPattern.test(content), false, `${file} must stay domain-free`);
  }
});
