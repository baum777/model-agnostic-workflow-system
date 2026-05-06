import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function defaultAppliedStep(context) {
  const receiptRef = `artifacts/runtime-runs/${context.runId}/validation-receipt.json`;
  return {
    step_id: 'runtime-dry-run',
    description: 'Runtime dry-run artifacts created locally.',
    execution_status: 'verified',
    artifact: {
      artifact_ref: receiptRef,
      artifact_type: 'validation-receipt'
    },
    verification_reference: receiptRef
  };
}

function buildHandoffEnvelope({
  context,
  objective = 'Transfer local runtime run state.',
  currentStateSummary = 'Runtime dry-run completed with local artifacts.',
  appliedSteps = [defaultAppliedStep(context)],
  openGaps = [],
  acceptanceCriteria = [
    {
      criterion_id: 'runtime-run-readable',
      description: 'Runtime run artifacts can be validated and replayed locally.',
      verification_method: 'npm run runtime:validate -- --runId <runId>'
    }
  ]
}) {
  const envelopeId = `handoff_${context.runId}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    mahp_version: '1.0.0',
    envelope_id: envelopeId,
    emitter: {
      skill_id: 'runtime-dry-run',
      run_id: context.runId,
      agent_role: 'primary-agent',
      execution_status: 'verified'
    },
    receiver: {
      skill_id: 'local-operator',
      agent_role: 'human'
    },
    execution_context: {
      objective,
      applied_steps: appliedSteps,
      current_state_summary: currentStateSummary,
      state_claim_status: 'observed'
    },
    provenance_chain: [
      {
        sequence: 1,
        relationship: 'origin',
        envelope_id: envelopeId,
        skill_id: 'runtime-dry-run',
        run_id: context.runId
      }
    ],
    open_gaps: openGaps,
    acceptance_criteria: acceptanceCriteria,
    composition_pattern: 'sequential',
    fan_out_group_id: null
  };
}

function validateHandoffEnvelope(envelope) {
  const issues = [];
  if (envelope.mahp_version !== '1.0.0') {
    issues.push('handoff envelope mahp_version must be 1.0.0.');
  }
  if (!envelope.envelope_id) {
    issues.push('handoff envelope requires envelope_id.');
  }
  if (!envelope.emitter?.run_id) {
    issues.push('handoff envelope emitter requires run_id.');
  }
  if (!Array.isArray(envelope.provenance_chain) || !envelope.provenance_chain.some((entry) => entry.relationship === 'origin')) {
    issues.push('handoff envelope provenance_chain requires origin entry.');
  }
  if (!Array.isArray(envelope.acceptance_criteria) || envelope.acceptance_criteria.length === 0) {
    issues.push('handoff envelope requires acceptance criteria.');
  }
  return { ok: issues.length === 0, issues };
}

function writeHandoffEnvelope(input) {
  const envelope = buildHandoffEnvelope(input);
  const validation = validateHandoffEnvelope(envelope);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  const handoffPath = path.join(input.context.runDir, 'handoff-envelope.json');
  fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
  fs.writeFileSync(handoffPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return { ok: true, issues: [], envelope, handoffPath };
}

function readHandoffEnvelope({ runDir }) {
  const handoffPath = path.join(runDir, 'handoff-envelope.json');
  try {
    const envelope = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
    const validation = validateHandoffEnvelope(envelope);
    return { ok: validation.ok, issues: validation.issues, envelope, handoffPath };
  } catch (error) {
    return { ok: false, issues: [`handoff envelope read failed: ${error.message}`], handoffPath };
  }
}

export { buildHandoffEnvelope, readHandoffEnvelope, validateHandoffEnvelope, writeHandoffEnvelope };
