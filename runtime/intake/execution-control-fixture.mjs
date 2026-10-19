// S2b wave 1: fixture executor for the Unitera Systems execution-control
// intake binding (ExecutionIntakeBinding contract). It simulates the Systems
// REST chain prepare -> evaluate -> clearances -> authorize -> execute ->
// reconcile deterministically, in process, with no network and no
// credentials. The live HTTP transport is deliberately NOT wired: the
// runtime:run spec gate fails closed on any non-fixture transport
// (RUN_INTAKE_TRANSPORT_UNSUPPORTED) until the owner-gated wave 2 auth lane
// exists (Systems has no service-principal JWT lane today).
//
// The binding record this executor emits is derived evidence, not authority:
// business_outcome stays 'not_asserted' — an outcome assertion requires
// Systems-side verification read-model evidence, which only the live lane
// can produce.
class IntakeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const INTAKE_FX_EXECUTOR_ID = 'exec_unitera_execution_control_fixture';

const CHAIN_STEPS = ['prepare', 'evaluate', 'clearances', 'authorize', 'execute', 'reconcile'];

export function executionControlFixtureExecutor(executorId, binding, intakeBinding, recordSink, now) {
  const template = binding.result || {};
  return async (invocation) => {
    // The binding describes THIS work unit; a mismatched invocation never
    // attests or executes anything.
    if (invocation.work_unit_id !== intakeBinding.work_unit_id) {
      throw new IntakeError(
        'INTAKE_WORK_UNIT_MISMATCH',
        `intake binding ${intakeBinding.binding_id} is bound to work unit ${intakeBinding.work_unit_id}, but the invocation is for ${invocation.work_unit_id}`
      );
    }
    // Rights transition: the runtime authority envelope must cover the
    // binding's declared ceiling (scope must match, declared effects must be
    // granted). Deny by default — no silent widening.
    const envelope = invocation.authority_envelope || {};
    if (envelope.scope_ref !== intakeBinding.rights_transition.authority_ceiling_ref) {
      throw new IntakeError(
        'INTAKE_AUTHORITY_ENVELOPE_MISMATCH',
        `intake binding ${intakeBinding.binding_id} declares authority_ceiling_ref ${intakeBinding.rights_transition.authority_ceiling_ref}, but the invocation envelope scope is ${envelope.scope_ref}`
      );
    }
    const granted = new Set(envelope.allowed_effects || []);
    for (const effect of intakeBinding.rights_transition.allowed_effects) {
      if (!granted.has(effect)) {
        throw new IntakeError(
          'INTAKE_AUTHORITY_ENVELOPE_MISMATCH',
          `intake binding ${intakeBinding.binding_id} requires effect ${effect}, which the invocation envelope does not grant (${[...granted].join(', ') || 'none'})`
        );
      }
    }

    const boundAt = now();
    // Chain evidence mirrors the configured fixture outcome: a FAILED
    // fixture marks execute as FAILED, leaves reconcile NOT_RUN and records
    // status 'failed' — the evidence bundle never claims a successful chain
    // for a failed execution.
    const failed = template.outcome === 'FAILED';
    const executeIndex = CHAIN_STEPS.indexOf('execute');
    const chain = CHAIN_STEPS.map((step, index) => ({
      step,
      status: failed ? (index < executeIndex ? 'OK' : index === executeIndex ? 'FAILED' : 'NOT_RUN') : 'OK',
      sequence: index + 1,
      at: now()
    }));
    const record = {
      binding_id: intakeBinding.binding_id,
      work_unit_id: intakeBinding.work_unit_id,
      executor_id: executorId,
      node_id: invocation.node_id,
      target: { ...intakeBinding.target },
      capability_mapping: { ...intakeBinding.capability_mapping },
      rights_transition: { ...intakeBinding.rights_transition },
      evidence_transition: { ...intakeBinding.evidence_transition },
      outcome_semantics: { ...intakeBinding.outcome_semantics },
      commitment_context: { ...intakeBinding.commitment_context },
      status: failed ? 'failed' : 'executed',
      business_outcome: 'not_asserted',
      execution_receipt_ref: `er_${intakeBinding.binding_id.replace(/^eib_/, '')}`,
      chain,
      bound_at: boundAt
    };
    recordSink.push(record);

    return {
      execution_attempt_id: invocation.execution_attempt_id,
      executor_id: executorId,
      work_unit_id: invocation.work_unit_id,
      started_at: boundAt,
      finished_at: now(),
      outcome: template.outcome || 'SUCCESS',
      outputs: template.outputs || [],
      metrics: template.metrics || { latency_ms: chain.length * 10, cost_units: 0, tokens_in: 0, tokens_out: 0 },
      error_class: template.error_class || null,
      exit_code: template.exit_code === undefined ? null : template.exit_code
    };
  };
}

export { IntakeError };
