#!/usr/bin/env node
// runtime:run — the operational entry point for the governed run pipeline
// (Phases 2..7). Loads a run specification, wires the engine collaborators
// exactly like the e2e reference run, drives executeWorkRun, and persists the
// evidence bundle under artifacts/runtime-runs/<runId>/.
//
// Transport policy: fixture transports only. Live transports (codex_exec,
// openrouter_api, ...) are deliberately NOT wired here; they are separately
// probed by runtime:activate-vnext and will be admitted per-transport with
// their own qualification. An unknown or live transport in a spec fails
// closed with RUN_SPEC_TRANSPORT_UNSUPPORTED — there is no fallback.
//
// Derived registries: outputs and evidence presented to the completion
// engine are DERIVED from what executors actually produced (execution
// results / verification receipts), never from declared spec intent. A run
// only reaches COMPLETED when the work really satisfied the contract.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeWorkRun } from '../orchestrator/run-engine.mjs';
import { computeEligibility } from '../qualification/eligibility.mjs';
import { buildRoutingRequest, route } from '../routing/routing-engine.mjs';
import { createJevClient } from '../decision-engine/jev/client.mjs';
import { buildPreferredExecutorQuestion } from '../decision-engine/jev/questions/registry.mjs';
import { loadThresholdPolicy, evaluateThreshold } from '../decision-engine/jev/threshold-policy.mjs';
import { evaluateCompletion } from '../completion/completion-engine.mjs';
import { buildVerificationReceipt } from '../completion/verification.mjs';
import { loadExecutorRegistry } from '../executors/manifest-loader.mjs';
import { executionControlFixtureExecutor, INTAKE_FX_EXECUTOR_ID } from '../intake/execution-control-fixture.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const SUPPORTED_TRANSPORTS = ['fixture'];

class SpecError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function requireObject(spec, key) {
  const value = spec[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SpecError('SPEC_INVALID', `missing or non-object field: ${key}`);
  }
  return value;
}

function validateOrThrow(instance, contractPath, code, root) {
  const issues = validateInstanceAgainstContract(instance, contractPath, root);
  if (issues.length > 0) {
    throw new SpecError(code, `${contractPath}: ${issues.join('; ')}`);
  }
}

function fixtureExecutorImplementation(executorId, binding, now) {
  const template = binding.result || {};
  return async (invocation) => ({
    execution_attempt_id: invocation.execution_attempt_id,
    executor_id: executorId,
    work_unit_id: invocation.work_unit_id,
    started_at: now(),
    finished_at: now(),
    outcome: template.outcome || 'SUCCESS',
    outputs: template.outputs || [],
    metrics: template.metrics || { latency_ms: 0, cost_units: 0, tokens_in: 0, tokens_out: 0 },
    error_class: template.error_class || null,
    exit_code: template.exit_code === undefined ? null : template.exit_code
  });
}

export async function runRuntimeRun({ specPath, outDir = null, repoRoot = null, now = null } = {}) {
  const root = repoRoot
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const clock = now || (() => new Date().toISOString());
  if (!specPath) {
    throw new SpecError('USAGE', 'usage: runtime-run.mjs --spec <run-spec.json> [--out <dir>]');
  }
  if (!fs.existsSync(specPath)) {
    throw new SpecError('SPEC_NOT_FOUND', `spec file not found: ${specPath}`);
  }

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (error) {
    throw new SpecError('SPEC_INVALID_JSON', `spec is not valid JSON: ${error.message}`);
  }
  if (!spec.run_id || typeof spec.run_id !== 'string') {
    throw new SpecError('SPEC_INVALID', 'missing run_id');
  }

  // --- validate spec parts against the canonical contracts they claim to be.
  const interactionSession = requireObject(spec, 'interaction_session');
  validateOrThrow(interactionSession, 'core/contracts/interaction-session.schema.json', 'SPEC_SESSION_INVALID', root);
  const template = requireObject(spec, 'template');
  validateOrThrow(template, 'core/contracts/execution-plan-template.schema.json', 'SPEC_TEMPLATE_INVALID', root);
  const workRequest = requireObject(spec, 'work_request');
  if (!workRequest.objective) {
    throw new SpecError('SPEC_INVALID', 'work_request.objective is required');
  }
  const profiles = spec.profiles || {};
  for (const [profileId, profile] of Object.entries(profiles)) {
    validateOrThrow(profile, 'core/contracts/execution-profile.schema.json', 'SPEC_PROFILE_INVALID', root);
    if (profile.profile_id && profile.profile_id !== profileId) {
      throw new SpecError('SPEC_PROFILE_INVALID', `profiles key ${profileId} does not match profile_id ${profile.profile_id}`);
    }
  }
  const qualifications = spec.qualifications || [];
  for (const qualification of qualifications) {
    validateOrThrow(qualification, 'core/contracts/qualification-record.schema.json', 'SPEC_QUALIFICATION_INVALID', root);
  }
  const fingerprints = spec.fingerprints || {};
  for (const [executorId, fingerprint] of Object.entries(fingerprints)) {
    validateOrThrow(fingerprint, 'core/contracts/qualification-fingerprint.schema.json', 'SPEC_FINGERPRINT_INVALID', root);
    if (fingerprint.executor_id && fingerprint.executor_id !== executorId) {
      throw new SpecError('SPEC_FINGERPRINT_INVALID', `fingerprints key ${executorId} does not match executor_id ${fingerprint.executor_id}`);
    }
  }
  // The qualified fingerprint snapshots are a separate spec part. Aliasing the
  // current fingerprints as the qualified state would manufacture a no-drift
  // determination for eligibility; both states must be declared explicitly.
  const qualifiedFingerprints = requireObject(spec, 'qualified_fingerprints');
  for (const [executorId, fingerprint] of Object.entries(qualifiedFingerprints)) {
    validateOrThrow(fingerprint, 'core/contracts/qualification-fingerprint.schema.json', 'SPEC_FINGERPRINT_INVALID', root);
    if (fingerprint.executor_id && fingerprint.executor_id !== executorId) {
      throw new SpecError('SPEC_FINGERPRINT_INVALID', `qualified_fingerprints key ${executorId} does not match executor_id ${fingerprint.executor_id}`);
    }
  }
  // Each QUALIFIED qualification must name the qualified snapshot that
  // belongs to it (identity, capability, profile) — an unrelated
  // schema-valid snapshot must not satisfy the drift check.
  for (const qualification of qualifications) {
    if (qualification.state !== 'QUALIFIED') continue;
    const snapshot = qualifiedFingerprints[qualification.executor_id];
    if (!snapshot
      || snapshot.fingerprint_id !== qualification.fingerprint_ref
      || snapshot.capability_id !== qualification.capability_id
      || snapshot.execution_profile_ref !== qualification.execution_profile_ref) {
      throw new SpecError('SPEC_FINGERPRINT_INVALID', `qualification ${qualification.qualification_id} is not bound to a matching qualified_fingerprints entry for executor ${qualification.executor_id} (fingerprint_ref, capability_id and execution_profile_ref must match)`);
    }
  }
  const verifierSpec = requireObject(spec, 'verifier');
  // A verifier declaration may not be upgraded into an attestation by
  // defaults: outcome, independence and — for PASS — at least one evidence
  // ref must be declared explicitly.
  if (typeof verifierSpec.verifier_executor_id !== 'string' || verifierSpec.verifier_executor_id.length === 0) {
    throw new SpecError('SPEC_VERIFIER_INVALID', 'verifier.verifier_executor_id is required');
  }
  if (verifierSpec.outcome !== 'PASS' && verifierSpec.outcome !== 'FAIL') {
    throw new SpecError('SPEC_VERIFIER_INVALID', 'verifier.outcome must be PASS or FAIL, declared explicitly (no default PASS)');
  }
  if (typeof verifierSpec.independent !== 'boolean') {
    throw new SpecError('SPEC_VERIFIER_INVALID', 'verifier.independent must be an explicit boolean');
  }
  if (!Array.isArray(verifierSpec.evidence_refs)
    || verifierSpec.evidence_refs.some((ref) => typeof ref !== 'string' || ref.length === 0)) {
    throw new SpecError('SPEC_VERIFIER_INVALID', 'verifier.evidence_refs must be an array of non-empty strings');
  }
  if (verifierSpec.outcome === 'PASS' && verifierSpec.evidence_refs.length === 0) {
    throw new SpecError('SPEC_VERIFIER_INVALID', 'a PASS verifier declaration requires at least one evidence ref (no empty attestations)');
  }
  const executorBindings = requireObject(spec, 'executor_bindings');

  // --- S2b intake bindings: WorkUnit -> external execution intent for the
  // Unitera Systems execution-control chain (fixture only in wave 1). A
  // binding is validated against the ExecutionIntakeBinding contract and may
  // only target the fixture executor; the live HTTP intake is deliberately
  // not wired and fails closed (owner-gated wave 2 auth lane).
  const intakeBindings = spec.intake_bindings || {};
  const intentBindingRecords = [];
  for (const [executorId, intakeBinding] of Object.entries(intakeBindings)) {
    validateOrThrow(intakeBinding, 'core/contracts/execution-intake-binding.schema.json', 'SPEC_INTAKE_BINDING_INVALID', root);
    if (intakeBinding.target.transport !== 'fixture') {
      throw new SpecError(
        'RUN_INTAKE_TRANSPORT_UNSUPPORTED',
        `intake binding ${intakeBinding.binding_id} declares transport ${JSON.stringify(intakeBinding.target.transport)}; supported: fixture. The live Unitera execution-control intake is not wired (owner-gated wave 2 auth lane).`
      );
    }
    if (executorId !== INTAKE_FX_EXECUTOR_ID) {
      throw new SpecError('SPEC_INTAKE_BINDING_INVALID', `intake_bindings key ${executorId} must reference ${INTAKE_FX_EXECUTOR_ID} in wave 1`);
    }
    if (!executorBindings[executorId]) {
      throw new SpecError('SPEC_INTAKE_BINDING_INVALID', `intake_bindings references ${executorId} without a matching executor_bindings entry`);
    }
  }

  // --- deny-by-default availability/policy/budget: an executor that the spec
  // does not explicitly admit is ineligible, never silently admitted.
  const availability = spec.availability || {};
  const policyCompatible = spec.policy_compatible || {};
  const budgetCompatible = spec.budget_compatible || {};

  const registryFile = loadExecutorRegistry(path.join(root, 'runtime/executors/registry.default.json'), root);
  const manifests = registryFile.executors;
  const manifestIds = new Set(manifests.map((manifest) => manifest.executor_id));

  const executorImplementations = {};
  for (const [executorId, binding] of Object.entries(executorBindings)) {
    if (!manifestIds.has(executorId)) {
      throw new SpecError('SPEC_UNKNOWN_EXECUTOR', `executor_bindings references ${executorId}, which is not in runtime/executors/registry.default.json`);
    }
    if (!SUPPORTED_TRANSPORTS.includes(binding.transport)) {
      throw new SpecError(
        'RUN_SPEC_TRANSPORT_UNSUPPORTED',
        `executor ${executorId} declares transport ${JSON.stringify(binding.transport)}; supported: ${SUPPORTED_TRANSPORTS.join(', ')}. Live transports are not wired into runtime:run; use runtime:activate-vnext for live lane probes.`
      );
    }
    executorImplementations[executorId] = intakeBindings[executorId]
      ? executionControlFixtureExecutor(executorId, binding, intakeBindings[executorId], intentBindingRecords, clock)
      : fixtureExecutorImplementation(executorId, binding, clock);
  }

  // --- artifacts + spine events
  const runDir = outDir || path.join(root, 'artifacts/runtime-runs', spec.run_id);
  // Evidence integrity: the run directory is claimed EXCLUSIVELY via atomic
  // creation. A pre-existing directory — empty, non-empty, or one a
  // concurrent process just claimed — fails closed, so two runs of the same
  // spec can never interleave their event streams or overwrite artifacts.
  if (fs.existsSync(runDir) && fs.readdirSync(runDir).length > 0) {
    throw new SpecError('RUN_DIR_EXISTS', `run directory ${runDir} already exists and is not empty; move it aside or pass a fresh --out (no silent reuse)`);
  }
  fs.mkdirSync(path.dirname(runDir), { recursive: true });
  try {
    fs.mkdirSync(runDir);
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      throw new SpecError('RUN_DIR_EXISTS', `run directory ${runDir} already exists (claimed exclusively); move it aside or pass a fresh --out`);
    }
    throw error;
  }
  const events = [];
  const artifactWriter = {
    write(name, value) {
      fs.writeFileSync(path.join(runDir, name), `${JSON.stringify(value, null, 2)}\n`);
    }
  };
  const eventSink = (event) => {
    events.push(event);
    fs.appendFileSync(path.join(runDir, 'run-events.jsonl'), `${JSON.stringify(event)}\n`);
  };

  // --- Jev bounded preference (fixture mode only, like the reference run).
  const jevSpec = spec.jev || { mode: 'fixture', case_id: 'valid-preference' };
  if (jevSpec.mode !== 'fixture') {
    throw new SpecError('SPEC_JEV_MODE_UNSUPPORTED', `jev.mode ${jevSpec.mode} is not wired into runtime:run; supported: fixture`);
  }
  const thresholdPolicy = await loadThresholdPolicy(path.join(root, 'policies/decision-thresholds.yaml'));
  const jevClient = createJevClient({
    mode: 'fixture',
    fixtureDir: path.join(root, 'runtime/decision-engine/jev/fixtures'),
    thresholdPolicy
  });

  const outcome = await executeWorkRun({
    root,
    runId: spec.run_id,
    interactionSession,
    workRequest,
    template,
    profiles,
    subsumptionRecords: spec.subsumption_records || [],
    qualifications,
    manifests,
    currentFingerprints: fingerprints,
    qualifiedFingerprints,
    availability,
    policyCompatible,
    budgetCompatible,
    eligibilityEngine: { computeEligibility },
    routingEngine: { buildRoutingRequest, route },
    jevAsker: async ({ eligibleExecutorIds }) => {
      const question = buildPreferredExecutorQuestion(eligibleExecutorIds);
      return jevClient.ask({ question, choices: question.answer_space.values, caseId: jevSpec.case_id });
    },
    thresholdDecider: (asked) => evaluateThreshold(asked.receipt, thresholdPolicy),
    executorImplementations,
    verifier: ({ node, executionResult }) => {
      // The attestation must belong to the verifier that actually executed
      // the verification node — a declared id that routing did not bind
      // never attests anything.
      const boundVerifierId = node && node.executor_binding ? node.executor_binding.executor_id : null;
      if (boundVerifierId !== verifierSpec.verifier_executor_id) {
        throw new SpecError('SPEC_VERIFIER_MISMATCH', `verification node is executed by ${boundVerifierId} but the spec declares verifier_executor_id ${verifierSpec.verifier_executor_id}; the attestation must belong to the verifier that actually ran`);
      }
      return buildVerificationReceipt({
        work_unit_id: executionResult.work_unit_id,
        verifier_executor_id: verifierSpec.verifier_executor_id,
        independent: verifierSpec.independent,
        outcome: verifierSpec.outcome,
        evidence_refs: verifierSpec.evidence_refs,
        checks: verifierSpec.checks || []
      });
    },
    completionEngine: { evaluateCompletion },
    eventSink,
    artifactWriter,
    // Completion honesty: outputs/evidence are derived from what the run
    // actually produced, never from declared spec intent.
    outputsRegistry: (executionResults) => [...new Set(executionResults.flatMap((result) => (result.outputs || []).map((output) => output.output_id)))],
    evidenceRegistry: (executionResults, verificationReceipts) => [...new Set(verificationReceipts.flatMap((receipt) => receipt.evidence_refs || []))],
    now: clock
  });

  // S2b evidence: intake binding records are part of the run bundle — they
  // are derived from what the fixture chain actually executed, and their
  // business_outcome stays 'not_asserted' by construction.
  if (intentBindingRecords.length > 0) {
    artifactWriter.write('intent-bindings.json', intentBindingRecords);
  }

  const summary = {
    ok: outcome.status === 'COMPLETED',
    run_id: spec.run_id,
    status: outcome.status,
    blocking_reason: outcome.blockingReason || null,
    completion_result: outcome.completionDecision ? outcome.completionDecision.result : null,
    run_dir: runDir.replace(/\\/g, '/'),
    executor_bindings: outcome.graph ? outcome.graph.nodes.map((node) => ({ stage: node.stage, executor_id: node.executor_binding.executor_id, selection_mode: node.executor_binding.selection_mode })) : [],
    intake_bindings: intentBindingRecords.map((record) => ({ binding_id: record.binding_id, status: record.status, business_outcome: record.business_outcome }))
  };
  return { summary, outcome, events, runDir };
}

function exitCodeFor(summary) {
  if (summary.status === 'COMPLETED') return 0;
  if (summary.status === 'BLOCKED') return 3;
  return 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const readFlag = (name) => {
    const index = args.indexOf(name);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };
  try {
    const { summary } = await runRuntimeRun({
      specPath: readFlag('--spec'),
      outDir: readFlag('--out')
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(exitCodeFor(summary));
  } catch (error) {
    const code = error.code || 'RUN_FAILED';
    console.error(JSON.stringify({ ok: false, error_code: code, error: error.message }, null, 2));
    process.exit(code.startsWith('SPEC') || code === 'USAGE' || code === 'RUN_DIR_EXISTS' ? 2 : 4);
  }
}
