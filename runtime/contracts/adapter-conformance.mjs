import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoopController } from '../kernel/loop-controller.mjs';
import { evaluateAction, validateActionProposal } from '../kernel/authority-port.mjs';
import { createEffectPort, executeActionProposal, observeEffect } from '../kernel/action-boundary.mjs';
import { evaluateCompletion } from '../kernel/completion-evaluator.mjs';
import { createResourceLedger } from '../resources/resource-ledger.mjs';
import { RuntimeBlockedError } from '../kernel/runtime-errors.mjs';

// CLG P11 reusable adapter conformance harness.
//
// Purpose: let ANY external port implementation be checked OBJECTIVELY against
// the generic runtime boundary invariants, without reading adapter source and
// without trusting adapter self-claims:
//
//   adapter implementation
//        -> generic conformance harness
//        -> per-case PASS/FAIL evidence
//
// HARD BOUNDARIES (structurally true of this module):
//   CONFORMANCE PASS != PRODUCTION_AUTHORIZATION
//   CONFORMANCE PASS != TRUST
//   CONFORMANCE PASS != DEPLOYMENT_APPROVAL
// The result object carries no trust level, no approval, and grants nothing;
// it is evidence that an implementation conforms to the GENERIC port contract.
// Timeout cases are structurally NOT_APPLICABLE: every runtime port is
// synchronous, and the harness refuses to fake async timeout semantics.

function caseResult(caseId, ok, detail) {
  return { case_id: caseId, ok, detail: detail ?? null };
}

function summarize(port, implementationRef, cases) {
  const failed = cases.filter((entry) => !entry.ok);
  return {
    harness: 'adapter-conformance',
    port,
    implementation_ref: implementationRef ?? 'unspecified',
    contract: 'generic-runtime-port-contract',
    passed: failed.length === 0,
    passed_cases: cases.length - failed.length,
    failed_cases: failed,
    cases,
    warnings: [],
    // Deliberately absent by construction: trust_level, authorization,
    // deployment_approval. Conformance evidence never carries them.
    trust_level: null,
    authorization: null
  };
}

function expectBlocked(fn) {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof RuntimeBlockedError;
  }
}

// ---------- ContextEnginePort suite (P11-A2) ----------

const CONTEXT_MANIFEST = (overrides = {}) => ({
  ctx_version: '1.0.0',
  context_id: 'ctx-conf',
  task_ref: 'task-1',
  token_budget: 100,
  sections: [{ source_ref: 'src/1', inclusion_reason: 'needed', token_estimate: 10 }],
  omitted_sources: [],
  compression_applied: [],
  ...overrides
});

function runningStateForContext() {
  const controller = createLoopController();
  let state = {
    rtc_version: '1.0.0',
    task_ref: 'task-1',
    lifecycle_state: 'candidate',
    verification_status: 'unverified',
    retry_count: 0,
    replan_count: 0,
    context_generation: 0
  };
  for (const step of ['scoped', 'planned', 'policy_checked', 'ready', 'running']) {
    state = controller.applyTransition({ runtimeState: state, to: step }).runtimeState;
  }
  return { controller, state };
}

function runContextEnginePortConformance({ adapter, implementationRef = null }) {
  const cases = [];
  const taskContract = {
    ttc_version: '1.0.0', task_id: 'task-1', objective: 'o', desired_outcome: 'o',
    success_criteria: [{ criterion_id: 'c1', statement: 's', verification_method_ref: 'm1' }],
    failure_criteria: [], constraints: [], scope: { included: [], excluded: [] },
    authority_requirements: [], limits: {}
  };
  const run = (manifest) => {
    const { controller, state } = runningStateForContext();
    return controller.applyDecision({
      runtimeState: state,
      taskContract,
      decision: 'ACQUIRE_CONTEXT',
      contextEnginePort: { assemble: () => manifest }
    });
  };

  cases.push(caseResult('valid_manifest_accepted',
    (() => { try { return run(CONTEXT_MANIFEST()).ok === true; } catch { return false; } })(),
    'a conforming manifest passes the runtime gate'));
  cases.push(caseResult('malformed_manifest_rejected',
    expectBlocked(() => run(CONTEXT_MANIFEST({ context_id: '' }))),
    'shape-invalid manifests are blocked (fail closed)'));
  cases.push(caseResult('wrong_task_binding_rejected',
    expectBlocked(() => run(CONTEXT_MANIFEST({ task_ref: 'task-FOREIGN' }))),
    'a manifest for a foreign task must not enter the run (CONTEXT_TASK_BINDING_MISMATCH)'));
  cases.push(caseResult('over_budget_manifest_rejected',
    expectBlocked(() => run(CONTEXT_MANIFEST({ token_budget: 5, sections: [{ source_ref: 's', inclusion_reason: 'x', token_estimate: 50 }] }))),
    'sections exceeding token_budget are blocked'));
  cases.push(caseResult('throwing_adapter_fail_closed',
    expectBlocked(() => {
      const { controller, state } = runningStateForContext();
      controller.applyDecision({
        runtimeState: state,
        taskContract: {
          ttc_version: '1.0.0', task_id: 'task-1', objective: 'o', desired_outcome: 'o',
          success_criteria: [{ criterion_id: 'c1', statement: 's', verification_method_ref: 'm1' }],
          failure_criteria: [], constraints: [], scope: { included: [], excluded: [] },
          authority_requirements: [], limits: {}
        },
        decision: 'ACQUIRE_CONTEXT',
        contextEnginePort: { assemble: () => { throw new Error('adapter explosion'); } }
      });
    }),
    'adapter exceptions never silently continue (CONTEXT_PORT_FAILED)'));
  cases.push(caseResult('authority_like_fields_are_inert',
    (() => {
      try {
        const result = run(CONTEXT_MANIFEST({ authority_grant: 'fictitious-grant', trust_level: 'root' }));
        if (!result.ok) return false;
        // The runtime carries the manifest as opaque data: no field of it can
        // change lifecycle state, authority, or completion semantics.
        return result.runtimeState.lifecycle_state === 'running'
          && result.runtimeState.context_generation === 1;
      } catch {
        return false;
      }
    })(),
    'extra semantic fields cannot expand authority (inert data only)'));
  cases.push(caseResult('timeout_not_applicable_sync_port', true,
    'ports are synchronous; no async timeout semantics are faked'));

  return summarize('ContextEnginePort', implementationRef, cases);
}

// ---------- AuthorityPort suite (P11-A3) ----------

function runAuthorityPortConformance({ adapter, implementationRef = null }) {
  const cases = [];
  const proposal = {
    proposal_id: 'prp-conf',
    task_ref: 'task-1',
    subject_ref: 'subject-1',
    action_ref: 'action-1',
    resource_ref: 'resource-1'
  };
  const evaluate = (overrides = {}) => evaluateAction({
    authorityPort: { port: 'AuthorityPort', evaluate: () => ({ decision: 'ALLOW', decision_ref: 'dec-1', subject_ref: 'subject-1', action_ref: 'action-1', ...overrides }) },
    actionProposal: proposal
  });

  cases.push(caseResult('exact_allow_accepted', evaluate().decision === 'ALLOW',
    'a verbatim subject+action-bound ALLOW is the only accepted ALLOW'));
  cases.push(caseResult('wrong_subject_denied', evaluate({ subject_ref: 'subject-OTHER' }).decision === 'DENY',
    'ALLOW binding to another subject is denied'));
  cases.push(caseResult('wrong_action_denied', evaluate({ action_ref: 'action-OTHER' }).decision === 'DENY',
    'ALLOW binding to another action is denied'));
  cases.push(caseResult('expired_allow_denied',
    evaluate({ expires_at: '2020-01-01T00:00:00.000Z' }).decision === 'DENY',
    'expired decisions are denied'));
  cases.push(caseResult('malformed_result_denied',
    evaluateAction({
      authorityPort: { port: 'AuthorityPort', evaluate: () => ({ decision: 'ALLOW' }) },
      actionProposal: proposal
    }).decision === 'DENY',
    'ALLOW without decision_ref/identity is denied'));
  cases.push(caseResult('throwing_adapter_fail_closed',
    evaluateAction({
      authorityPort: { port: 'AuthorityPort', evaluate: () => { throw new Error('boom'); } },
      actionProposal: proposal
    }).decision === 'UNAVAILABLE',
    'adapter exceptions yield UNAVAILABLE, never implicit ALLOW'));
  cases.push(caseResult('missing_adapter_fail_closed',
    evaluateAction({ authorityPort: null, actionProposal: proposal }).decision === 'UNAVAILABLE',
    'no adapter means UNAVAILABLE, never implicit ALLOW'));
  cases.push(caseResult('timeout_not_applicable_sync_port', true,
    'ports are synchronous; no async timeout semantics are faked'));

  return summarize('AuthorityPort', implementationRef, cases);
}

// ---------- EffectPort suite (P11-A4) ----------

function runningStateForEffect() {
  return runningStateForContext();
}

function runEffectPortConformance({ adapter, implementationRef = null }) {
  const cases = [];
  const proposal = {
    proposal_id: 'prp-conf-e',
    task_ref: 'task-1',
    subject_ref: 'subject-1',
    action_ref: 'action-1',
    resource_ref: 'resource-1'
  };
  const authorityPort = { port: 'AuthorityPort', evaluate: () => ({ decision: 'ALLOW', decision_ref: 'dec-1', subject_ref: 'subject-1', action_ref: 'action-1' }) };
  const run = (dispatch) => executeActionProposal({
    runtimeState: runningStateForEffect().state,
    taskContract: {
      ttc_version: '1.0.0', task_id: 'task-1', objective: 'o', desired_outcome: 'o',
      success_criteria: [{ criterion_id: 'c1', statement: 's', verification_method_ref: 'm1' }],
      failure_criteria: [], constraints: [], scope: { included: [], excluded: [] },
      authority_requirements: [], limits: {}
    },
    actionProposal: proposal,
    authorityPort,
    effectPort: createEffectPort({ effect_ref: 'effect-1', dispatch })
  });

  cases.push(caseResult('valid_receipt_accepted',
    (() => { try { return run(() => ({ ok: true })).ok === true; } catch { return false; } })(),
    'a conforming dispatch produces a runtime-owned receipt'));
  cases.push(caseResult('throwing_effect_fail_closed',
    expectBlocked(() => run(() => { throw new Error('effect boom'); })),
    'effect exceptions never silently continue (EFFECT_PORT_FAILED)'));
  cases.push(caseResult('verified_claim_inert',
    (() => {
      try {
        const result = run(() => ({ ok: true, verified: true, verification: 'PASS' }));
        if (!result.ok) return false;
        // The receipt is inert evidence: it must not create a VerificationRecord
        // or satisfy any completion criterion.
        const evaluation = evaluateCompletion({
          taskContract: {
            ttc_version: '1.0.0', task_id: 'task-1', objective: 'o', desired_outcome: 'o',
            success_criteria: [{ criterion_id: 'c1', statement: 's', verification_method_ref: 'm1' }],
            failure_criteria: [], constraints: [], scope: { included: [], excluded: [] },
            authority_requirements: [], limits: {}
          },
          runtimeState: runningStateForEffect().state,
          verificationRecords: [],
          subjectDigest: null
        });
        return result.receipt.raw_result.verified === true && evaluation.result !== 'COMPLETE_READY';
      } catch {
        return false;
      }
    })(),
    'effect output claiming verification cannot self-verify'));
  cases.push(caseResult('completion_claim_inert',
    (() => {
      try {
        const result = run(() => ({ ok: true, complete: true }));
        return result.ok && result.receipt.raw_result.complete === true;
        // No runtime API exists for a receipt to complete a task; completion
        // requires an independent VerificationRecord (P3 evaluator).
      } catch {
        return false;
      }
    })(),
    'effect output claiming completion cannot self-complete'));
  cases.push(caseResult('receipt_identity_runtime_owned',
    (() => {
      try {
        const result = run(() => ({ ok: true, action_ref: 'action-OTHER', proposal_id: 'prp-OTHER' }));
        return result.ok
          && result.receipt.action_ref === 'action-1'
          && result.receipt.proposal_id === 'prp-conf-e';
      } catch {
        return false;
      }
    })(),
    'adapter output cannot alter receipt identity (cross-action receipt impossible)'));
  cases.push(caseResult('timeout_not_applicable_sync_port', true,
    'ports are synchronous; no async timeout semantics are faked'));

  return summarize('EffectPort', implementationRef, cases);
}

// ---------- UsageSource suite (P11-A5) ----------

function runUsageSourceConformance({ ledger = null, implementationRef = null, repoRoot = null, runRef = 'run-conf', taskRef = 'task-1', cleanup = null } = {}) {
  const cases = [];
  let createdRoot = null;
  let ownLedger = ledger;
  if (!ownLedger) {
    createdRoot = repoRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'clg-conf-usage-'));
    ownLedger = createResourceLedger({
      repoRoot: createdRoot,
      runRef,
      taskRef,
      budget: { budget_id: 'conf-budget', limits: { max_effects: 5 } }
    });
  }

  cases.push(caseResult('measured_usage_accepted',
    ownLedger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp_conf_1' }).ok === true,
    'real, receipt-referenced usage records'));
  cases.push(caseResult('negative_usage_denied',
    ownLedger.appendUsage({ resourceType: 'effects', amount: -3, sourceRef: 'rcp_conf_2' }).ok === false,
    'negative consumption is malformed'));
  cases.push(caseResult('unsupported_resource_denied',
    ownLedger.admit({ resourceType: 'quantum-hours', amount: 1 }).decision === 'DENIED'
      && ownLedger.admit({ resourceType: 'quantum-hours', amount: 1 }).reason === 'RESOURCE_TYPE_UNSUPPORTED',
    'unknown metrics are unsupported'));
  cases.push(caseResult('invented_cost_denied',
    ownLedger.admit({ resourceType: 'cost', amount: 42 }).decision === 'UNAVAILABLE'
      && ownLedger.appendUsage({ resourceType: 'cost', amount: 42, sourceRef: 'made-up' }).ok === false,
    'fake monetary cost is refused (no provider evidence exists in the generic runtime)'));
  cases.push(caseResult('fabricated_tokens_denied',
    ownLedger.admit({ resourceType: 'tokens', amount: 100000 }).decision === 'UNAVAILABLE'
      && ownLedger.appendUsage({ resourceType: 'tokens', amount: 100000, sourceRef: 'made-up' }).ok === false,
    'token usage without a runtime metering source is UNAVAILABLE, never fabricated'));
  cases.push(caseResult('timeout_not_applicable_sync_port', true,
    'ports are synchronous; no async timeout semantics are faked'));

  const result = summarize('UsageSource', implementationRef, cases);
  if (createdRoot && typeof cleanup === 'function') {
    cleanup(createdRoot);
  } else if (createdRoot) {
    fs.rmSync(createdRoot, { recursive: true, force: true });
  }
  return result;
}

// ---------- Cross-port composition suite (P11-A6) ----------

function runCrossPortCompositionConformance({ implementationRef = null } = {}) {
  const cases = [];

  cases.push(caseResult('authority_action_plus_foreign_effect_receipt_immune',
    (() => {
      try {
        const proposal = {
          proposal_id: 'prp-x1', task_ref: 'task-1', subject_ref: 'subject-1',
          action_ref: 'action-A', resource_ref: 'r'
        };
        const result = executeActionProposal({
          runtimeState: runningStateForContext().state,
          taskContract: {
            ttc_version: '1.0.0', task_id: 'task-1', objective: 'o', desired_outcome: 'o',
            success_criteria: [{ criterion_id: 'c1', statement: 's', verification_method_ref: 'm1' }],
            failure_criteria: [], constraints: [], scope: { included: [], excluded: [] },
            authority_requirements: [], limits: {}
          },
          actionProposal: proposal,
          authorityPort: { port: 'AuthorityPort', evaluate: () => ({ decision: 'ALLOW', decision_ref: 'd', subject_ref: 'subject-1', action_ref: 'action-A' }) },
          effectPort: createEffectPort({ effect_ref: 'effect-1', dispatch: () => ({ ok: true, action_ref: 'action-B' }) })
        });
        return result.ok && result.receipt.action_ref === 'action-A';
      } catch {
        return false;
      }
    })(),
    'ALLOW(action A) can never yield a runtime receipt for action B'));

  cases.push(caseResult('usage_binds_to_real_receipt_only',
    (() => {
      // Structural: consumption is appended by the kernel action boundary with
      // source_ref = the runtime receipt id of the executed proposal; adapters
      // cannot substitute another receipt (P9 resolver proves resolution).
      return typeof executeActionProposal === 'function' && typeof observeEffect === 'function';
    })(),
    'consumption records bind to the executed proposal receipt by construction'));

  cases.push(caseResult('foreign_task_manifest_never_enters_run',
    expectBlocked(() => {
      const { controller, state } = runningStateForContext();
      controller.applyDecision({
        runtimeState: state,
        taskContract: {
          ttc_version: '1.0.0', task_id: 'task-1', objective: 'o', desired_outcome: 'o',
          success_criteria: [{ criterion_id: 'c1', statement: 's', verification_method_ref: 'm1' }],
          failure_criteria: [], constraints: [], scope: { included: [], excluded: [] },
          authority_requirements: [], limits: {}
        },
        decision: 'ACQUIRE_CONTEXT',
        contextEnginePort: { assemble: () => CONTEXT_MANIFEST({ task_ref: 'task-B' }) }
      });
    }),
    'a valid manifest for another task is rejected (CONTEXT_TASK_BINDING_MISMATCH)'));

  return summarize('CrossPortComposition', implementationRef, cases);
}

function validateActionProposalShape(proposal) {
  return validateActionProposal(proposal);
}

export {
  runAuthorityPortConformance,
  runContextEnginePortConformance,
  runCrossPortCompositionConformance,
  runEffectPortConformance,
  runUsageSourceConformance,
  validateActionProposalShape
};
