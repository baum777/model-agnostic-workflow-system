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
  const verifierSpec = requireObject(spec, 'verifier');
  const executorBindings = requireObject(spec, 'executor_bindings');

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
    executorImplementations[executorId] = fixtureExecutorImplementation(executorId, binding, clock);
  }

  // --- artifacts + spine events
  const runDir = outDir || path.join(root, 'artifacts/runtime-runs', spec.run_id);
  fs.mkdirSync(runDir, { recursive: true });
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
    qualifiedFingerprints: fingerprints,
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
    verifier: ({ executionResult }) => buildVerificationReceipt({
      work_unit_id: executionResult.work_unit_id,
      verifier_executor_id: verifierSpec.verifier_executor_id,
      independent: verifierSpec.independent !== false,
      outcome: verifierSpec.outcome || 'PASS',
      evidence_refs: verifierSpec.evidence_refs || [],
      checks: verifierSpec.checks || []
    }),
    completionEngine: { evaluateCompletion },
    eventSink,
    artifactWriter,
    // Completion honesty: outputs/evidence are derived from what the run
    // actually produced, never from declared spec intent.
    outputsRegistry: (executionResults) => [...new Set(executionResults.flatMap((result) => (result.outputs || []).map((output) => output.output_id)))],
    evidenceRegistry: (executionResults, verificationReceipts) => [...new Set(verificationReceipts.flatMap((receipt) => receipt.evidence_refs || []))],
    now: clock
  });

  const summary = {
    ok: outcome.status === 'COMPLETED',
    run_id: spec.run_id,
    status: outcome.status,
    blocking_reason: outcome.blockingReason || null,
    completion_result: outcome.completionDecision ? outcome.completionDecision.result : null,
    run_dir: runDir.replace(/\\/g, '/'),
    executor_bindings: outcome.graph ? outcome.graph.nodes.map((node) => ({ stage: node.stage, executor_id: node.executor_binding.executor_id, selection_mode: node.executor_binding.selection_mode })) : []
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
    process.exit(code.startsWith('SPEC') || code === 'USAGE' ? 2 : 4);
  }
}
