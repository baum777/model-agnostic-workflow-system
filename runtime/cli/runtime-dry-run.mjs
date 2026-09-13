#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeContracts } from '../contracts/load-contracts.mjs';
import { validateLoadedContracts } from '../contracts/validate-contracts.mjs';
import { createRunContext } from '../kernel/runtime-context.mjs';
import { createLoopController } from '../kernel/loop-controller.mjs';
import { writeLoopArtifacts } from '../kernel/loop-artifacts.mjs';
import { createAuthorityPort } from '../kernel/authority-port.mjs';
import { createEffectPort, executeActionProposal, observeEffect } from '../kernel/action-boundary.mjs';
import { RuntimeBlockedError } from '../kernel/runtime-errors.mjs';
import { createPermissionEngine } from '../permissions/permission-engine.mjs';
import { createEventWriter } from '../observability/event-writer.mjs';
import { writePermissionLog, writeRunManifest } from '../observability/run-manifest.mjs';
import { writeValidationReceipt } from '../observability/validation-receipt.mjs';
import { writeRuntimeMemoryEntry } from '../memory/memory-writer.mjs';
import { writeHandoffEnvelope } from '../handoff/handoff-writer.mjs';
import { createResourceGovernor } from '../resources/resource-governor.mjs';
import { runManualTrigger } from '../scheduler/manual-trigger.mjs';
import { resolveAuthContext } from '../auth/auth-context.mjs';
import { writeServiceActionReceipts } from '../service/service-action-receipts.mjs';
import { writeServiceRequestReceipts } from '../service/service-request-receipts.mjs';

// Self-check fixtures for the loop enforcement demonstration below. They are
// test-grade local constants; no external authority, identity or domain data.
const dryRunTaskContract = Object.freeze({
  ttc_version: '1.0.0',
  task_id: 'runtime-dry-run-selfcheck',
  objective: 'Validate the CLG P2 loop enforcement surface end-to-end.',
  desired_outcome: 'Runtime state lands on succeeded via the canonical transition controller.',
  success_criteria: [
    {
      criterion_id: 'crit_loop_enforced',
      statement: 'All lifecycle transitions pass the canonical transition controller.',
      verification_method_ref: 'runtime/kernel/loop-controller.mjs'
    }
  ],
  failure_criteria: [],
  constraints: [],
  scope: { included: ['runtime self-check'], excluded: ['production workloads'] },
  authority_requirements: [],
  limits: { max_retries: 1, max_replans: 1 }
});

const dryRunTaskContractWithoutBudgets = Object.freeze({
  ...dryRunTaskContract,
  limits: {}
});

const dryRunContextPort = Object.freeze({
  engine_ref: 'runtime-dry-run-selfcheck-context',
  assemble: () => ({
    ctx_version: '1.0.0',
    context_id: 'ctx_dryrun_selfcheck',
    task_ref: 'runtime-dry-run-selfcheck',
    token_budget: 100,
    sections: [
      {
        source_ref: 'runtime/kernel/loop-controller.mjs',
        source_type: 'repo_file',
        provenance: 'local runtime self-check fixture',
        token_estimate: 10,
        inclusion_reason: 'loop enforcement self-check'
      }
    ],
    omitted_sources: [],
    compression_applied: []
  })
});

const dryRunSubjectDigest = 'sha256:runtime-dry-run-selfcheck';

// P3 authority/effect self-check fixtures (generic, opaque refs only).
const dryRunActionProposal = Object.freeze({
  proposal_id: 'prp_dryrun_selfcheck',
  task_ref: 'runtime-dry-run-selfcheck',
  subject_ref: 'runtime-dry-run-selfcheck',
  action_ref: 'runtime:self-check-effect',
  resource_ref: 'runtime/cli/runtime-dry-run.mjs',
  policy_ref: 'runtime-dry-run-selfcheck-policy',
  context_ref: 'runtime-dry-run-selfcheck-context'
});

const dryRunAllowAuthorityPort = createAuthorityPort({
  authority_ref: 'runtime-dry-run-selfcheck-authority',
  evaluate: ({ actionProposal }) => ({
    decision: 'ALLOW',
    decision_ref: 'dec_dryrun_allow',
    subject_ref: actionProposal.subject_ref,
    action_ref: actionProposal.action_ref,
    evidence_refs: ['runtime-dry-run-selfcheck-authority-evidence']
  })
});

const dryRunDenyAuthorityPort = createAuthorityPort({
  authority_ref: 'runtime-dry-run-selfcheck-authority',
  evaluate: ({ actionProposal }) => ({
    decision: 'DENY',
    decision_ref: 'dec_dryrun_deny',
    subject_ref: actionProposal.subject_ref,
    action_ref: actionProposal.action_ref
  })
});

let dryRunEffectCalls = 0;
const dryRunEffectPort = createEffectPort({
  effect_ref: 'runtime-dry-run-selfcheck-effect',
  dispatch: ({ actionProposal }) => {
    dryRunEffectCalls += 1;
    return { ok: true, action_ref: actionProposal.action_ref, note: 'self-check stub effect' };
  }
});

function runRuntimeDryRun({ repoRoot = process.cwd() } = {}) {
  const context = createRunContext({
    repoRoot,
    mode: 'dry-run',
    entrypoint: 'npm run runtime:dry-run'
  });
  fs.mkdirSync(context.runDir, { recursive: true });

  const permissionEngine = createPermissionEngine(context);
  const loadedContracts = loadRuntimeContracts(context.repoRoot);
  const contractValidation = validateLoadedContracts(loadedContracts);
  const eventWriter = createEventWriter(context, permissionEngine);
  const checks = [];

  checks.push({
    name: 'contracts_loaded',
    result: contractValidation.ok ? 'pass' : 'blocked',
    details: contractValidation.issues
  });

  if (!contractValidation.ok) {
    eventWriter.writeEvent({
      eventName: 'workflow.blocked',
      eventFamily: 'workflow.lifecycle',
      status: 'BLOCKED',
      component: 'contracts',
      message: 'runtime contract loading blocked',
      blockingReasons: ['VALIDATION_FAILED']
    });
    writePermissionLog(context, permissionEngine.decisions);
    writeRunManifest(context, loadedContracts.requiredSources.map((source) => source.relativePath), 'blocked');
    writeValidationReceipt(context, checks);
    return { ok: false, context, checks };
  }

  const startEvent = eventWriter.writeEvent({
    eventName: 'workflow.started',
    eventFamily: 'workflow.lifecycle',
    component: 'kernel',
    message: 'runtime run started'
  });

  const deniedExternal = permissionEngine.decide({
    claim: 'external.http',
    target: 'https://example.com'
  });

  eventWriter.writeEvent({
    eventName: 'permission.check',
    eventFamily: 'workflow.permission',
    status: 'BLOCKED',
    component: 'permissions',
    message: 'external action denied by default',
    blockingReasons: ['PERMISSION_DENIED']
  });

  checks.push({
    name: 'permission_gate_active',
    result: deniedExternal.decision === 'deny' ? 'pass' : 'blocked'
  });
  checks.push({
    name: 'observability_event_written',
    result: startEvent.event_name === 'workflow.started' ? 'pass' : 'blocked'
  });

  writePermissionLog(context, permissionEngine.decisions);
  writeRunManifest(context, loadedContracts.requiredSources.map((source) => source.relativePath), 'completed');

  checks.push({
    name: 'runtime_artifacts_created',
    result: ['manifest.json', 'events.jsonl', 'permissions.jsonl'].every((fileName) => fs.existsSync(path.join(context.runDir, fileName)))
      ? 'pass'
      : 'blocked'
  });

  const { receipt, receiptPath } = writeValidationReceipt(context, checks);
  const memoryWrite = writeRuntimeMemoryEntry({
    context,
    summary: 'Runtime dry-run completed with permission gate active.',
    details: {
      mode: context.mode,
      permissionGate: 'deny-by-default',
      contractSources: loadedContracts.requiredSources.map((source) => source.relativePath)
    },
    provenancePath: receiptPath
  });

  checks.push({
    name: 'memory_policy_enforced',
    result: memoryWrite.ok ? 'pass' : 'blocked',
    details: memoryWrite.issues
  });
  checks.push({
    name: 'runtime_memory_written',
    result: memoryWrite.ok ? 'pass' : 'blocked'
  });

  const handoffWrite = writeHandoffEnvelope({
    context,
    objective: 'Transfer local runtime run state to the next operator.',
    currentStateSummary: 'Runtime dry-run artifacts were produced and validated locally.'
  });
  checks.push({
    name: 'handoff_envelope_written',
    result: handoffWrite.ok ? 'pass' : 'blocked',
    details: handoffWrite.issues
  });

  const resourceGovernor = createResourceGovernor({ context, timeoutMs: 5000, budgetCap: 10 });
  const resourceReport = resourceGovernor.writeReport({ startedAtMs: Date.parse(context.createdAt), nowMs: Date.now(), plannedActions: 3 });
  checks.push({
    name: 'resource_governor_active',
    result: resourceReport.ok ? 'pass' : 'blocked'
  });

  const triggerWrite = runManualTrigger({ context, workflowId: 'runtime-dry-run' });
  checks.push({
    name: 'manual_trigger_written',
    result: triggerWrite.ok ? 'pass' : 'blocked',
    details: triggerWrite.issues
  });

  // CLG P2 loop enforcement self-check: exercise the canonical transition
  // controller end-to-end, including its fail-closed denials, then persist the
  // runtime state and transition records as run artifacts.
  const loopController = createLoopController();
  const loopDeniedExpectations = [];
  let loopRuntimeState = {
    rtc_version: '1.0.0',
    task_ref: 'runtime-dry-run-selfcheck',
    lifecycle_state: 'candidate',
    verification_status: 'unverified',
    retry_count: 0,
    replan_count: 0,
    context_generation: 0
  };
  let loopTransitionRecords = [];
  let loopFailed = false;
  const loopStep = (call) => {
    try {
      const result = call();
      loopRuntimeState = result.runtimeState;
      loopTransitionRecords.push(...result.transitionRecords);
      return result;
    } catch (error) {
      if (error instanceof RuntimeBlockedError) {
        loopFailed = true;
        loopDeniedExpectations.push({ expected: false, issues: error.issues });
        return { ok: false, blocked: true, issues: error.issues };
      }
      throw error;
    }
  };
  for (const step of [
    { to: 'scoped', reason: 'scope_accepted' },
    { to: 'planned', reason: 'plan_created' },
    { to: 'policy_checked', reason: 'policy_evaluated' },
    { to: 'ready', reason: 'policy_allow' },
    { to: 'running', reason: 'execution_started' }
  ]) {
    loopStep(() => loopController.applyTransition({
      runtimeState: loopRuntimeState,
      to: step.to,
      decision: step.reason
    }));
  }
  loopStep(() => loopController.applyDecision({
    runtimeState: loopRuntimeState,
    taskContract: dryRunTaskContract,
    decision: 'ACQUIRE_CONTEXT',
    contextEnginePort: dryRunContextPort
  }));
  loopStep(() => loopController.applyDecision({
    runtimeState: loopRuntimeState,
    taskContract: dryRunTaskContract,
    decision: 'CONTINUE'
  }));
  let unboundedRetryBlocked = false;
  try {
    loopController.applyDecision({
      runtimeState: loopRuntimeState,
      taskContract: dryRunTaskContractWithoutBudgets,
      decision: 'RETRY'
    });
  } catch (error) {
    unboundedRetryBlocked = error instanceof RuntimeBlockedError && error.issues.includes('BUDGET_UNBOUNDED');
  }
  const stateBeforeNegative = loopRuntimeState;
  const negativeComplete = loopController.applyDecision({
    runtimeState: loopRuntimeState,
    taskContract: dryRunTaskContract,
    decision: 'COMPLETE',
    completionDisposition: {
      cc_version: '1.0.0',
      task_ref: 'runtime-dry-run-selfcheck',
      disposition: 'PROPOSED',
      claimed_stages: ['OUTPUT_GENERATED'],
      evidence_refs: []
    },
    verificationRecords: []
  });
  loopTransitionRecords.push(...negativeComplete.transitionRecords);
  // The denied completion legitimately landed on `failed` (terminal). The
  // positive path continues from the pristine pre-denial snapshot while the
  // denial itself stays on the transition record.
  loopRuntimeState = stateBeforeNegative;
  const verificationRecord = {
    vrc_version: '1.0.0',
    verification_id: 'vr_dryrun_selfcheck',
    target_ref: 'runtime-dry-run-selfcheck',
    subject_digest: dryRunSubjectDigest,
    method: 'runtime/kernel/loop-controller.mjs',
    verifier: { verifier_type: 'deterministic', verifier_ref: 'runtime/cli/runtime-dry-run.mjs' },
    evidence_refs: ['artifacts/runtime-runs/selfcheck'],
    result: 'PASS',
    verified_at: new Date().toISOString()
  };
  const completionResult = loopController.applyDecision({
    runtimeState: loopRuntimeState,
    taskContract: dryRunTaskContract,
    decision: 'COMPLETE',
    completionDisposition: {
      cc_version: '1.0.0',
      task_ref: 'runtime-dry-run-selfcheck',
      disposition: 'ACCEPTED',
      claimed_stages: ['OUTPUT_GENERATED', 'ACTION_EXECUTED', 'VERIFICATION_PASSED', 'TASK_COMPLETE'],
      evidence_refs: ['artifacts/runtime-runs/selfcheck'],
      verified_by_refs: ['vr_dryrun_selfcheck'],
      unmet_criteria: []
    },
    verificationRecords: [verificationRecord]
  });
  loopRuntimeState = completionResult.runtimeState;
  loopTransitionRecords.push(...completionResult.transitionRecords);

  checks.push({
    name: 'loop_controller_active',
    result: !loopFailed
      && unboundedRetryBlocked === true
      && negativeComplete.ok === false
      && negativeComplete.outcome === 'completion_not_met'
      && completionResult.ok === true
      && loopRuntimeState.lifecycle_state === 'succeeded'
      ? 'pass'
      : 'blocked',
    details: loopFailed ? loopDeniedExpectations.flatMap((entry) => entry.issues) : []
  });

  const loopArtifacts = writeLoopArtifacts({
    context,
    permissionEngine,
    runtimeState: loopRuntimeState,
    transitionRecords: loopTransitionRecords
  });
  checks.push({
    name: 'runtime_loop_artifacts_written',
    result: loopArtifacts.ok ? 'pass' : 'blocked',
    details: loopArtifacts.issues
  });

  // CLG P3 authority/effect boundary self-check: a proposal never authorizes,
  // DENY and a missing port produce zero side effects, and an ALLOW reaches
  // exactly one stub effect whose receipt is observed but never treated as
  // verification and never completes the task by itself.
  let p3RuntimeState = {
    rtc_version: '1.0.0',
    task_ref: 'runtime-dry-run-selfcheck',
    lifecycle_state: 'candidate',
    verification_status: 'unverified',
    retry_count: 0,
    replan_count: 0,
    context_generation: 0
  };
  for (const step of [
    { to: 'scoped' },
    { to: 'planned' },
    { to: 'policy_checked' },
    { to: 'ready' },
    { to: 'running' }
  ]) {
    p3RuntimeState = loopController.applyTransition({ runtimeState: p3RuntimeState, to: step.to }).runtimeState;
  }
  const deniedAction = executeActionProposal({
    runtimeState: p3RuntimeState,
    taskContract: dryRunTaskContract,
    actionProposal: dryRunActionProposal,
    authorityPort: dryRunDenyAuthorityPort,
    effectPort: dryRunEffectPort
  });
  const missingAuthorityAction = executeActionProposal({
    runtimeState: p3RuntimeState,
    taskContract: dryRunTaskContract,
    actionProposal: dryRunActionProposal,
    authorityPort: null,
    effectPort: dryRunEffectPort
  });
  const allowedAction = executeActionProposal({
    runtimeState: p3RuntimeState,
    taskContract: dryRunTaskContract,
    actionProposal: dryRunActionProposal,
    authorityPort: dryRunAllowAuthorityPort,
    effectPort: dryRunEffectPort
  });
  const observation = allowedAction.receipt
    ? observeEffect({ receipt: allowedAction.receipt, authority: allowedAction.authority })
    : null;

  checks.push({
    name: 'authority_gate_active',
    result: deniedAction.ok === false
      && deniedAction.effectInvocations === 0
      && deniedAction.authority.decision === 'DENY'
      && missingAuthorityAction.ok === false
      && missingAuthorityAction.effectInvocations === 0
      && missingAuthorityAction.authority.decision === 'UNAVAILABLE'
      && allowedAction.ok === true
      && allowedAction.effectInvocations === 1
      ? 'pass'
      : 'blocked',
    details: []
  });
  checks.push({
    name: 'action_receipt_observation_boundary',
    result: Boolean(allowedAction.receipt)
      && Boolean(observation)
      && observation.receipt_ref === allowedAction.receipt.receipt_id
      && observation.interpretation === 'none'
      && observation.result === undefined
      && p3RuntimeState.verification_status === 'unverified'
      && p3RuntimeState.lifecycle_state === 'running'
      && dryRunEffectCalls === 1
      ? 'pass'
      : 'blocked',
    details: []
  });

  const serviceIdentity = resolveAuthContext({ fixtureIdentity: 'local-user' });
  const serviceActionReceipts = serviceIdentity.ok
    ? writeServiceActionReceipts({ context, identity: serviceIdentity.identity })
    : { ok: false, issues: serviceIdentity.issues };
  checks.push({
    name: 'service_action_receipts_written',
    result: serviceActionReceipts.ok ? 'pass' : 'blocked',
    details: serviceActionReceipts.issues
  });

  const serviceRequestReceipts = serviceIdentity.ok
    ? writeServiceRequestReceipts({ context, identity: serviceIdentity.identity })
    : { ok: false, issues: serviceIdentity.issues };
  checks.push({
    name: 'service_request_receipts_written',
    result: serviceRequestReceipts.ok ? 'pass' : 'blocked',
    details: serviceRequestReceipts.issues
  });

  const finalReceipt = writeValidationReceipt(context, checks).receipt;
  return { ok: finalReceipt.result === 'pass', context, checks, receipt: finalReceipt };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = runRuntimeDryRun();
    console.log(JSON.stringify({
      ok: result.ok,
      runId: result.context.runId,
      runDir: result.context.runDir.replace(/\\/g, '/'),
      checks: result.checks
    }, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  }
}

export { runRuntimeDryRun };
