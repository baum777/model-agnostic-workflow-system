import { loadRuntimeContracts } from './load-contracts.mjs';
import { RuntimeBlockedError } from '../kernel/runtime-errors.mjs';

// CLG generic runtime contracts (P1 — contract materialization only).
// Ownership: shared-core owns these generic contracts; baum-os src/context owns
// context mechanics behind the ContextEnginePort; domain semantics (Unitera
// authority/workflow/context-resolution, personal-memory policy) stay outside.
// See core/contracts/clg-*.json for the normative schemas and decisionBasis.

const CLG_CONTRACT_FILES = [
  'clg-task-contract.json',
  'clg-runtime-state.json',
  'clg-transition-vocabulary.json',
  'clg-context-manifest.json',
  'clg-completion-contract.json',
  'clg-verification-record.json'
];

const TRANSITION_DECISIONS = Object.freeze([
  'CONTINUE',
  'RETRY',
  'REPAIR',
  'REPLAN',
  'ACQUIRE_CONTEXT',
  'DELEGATE',
  'WAIT_EXTERNAL_EVENT',
  'REQUIRE_APPROVAL',
  'ESCALATE',
  'COMPLETE',
  'ABORT'
]);

const COMPLETION_STAGES = Object.freeze([
  'OUTPUT_GENERATED',
  'ACTION_EXECUTED',
  'VERIFICATION_PASSED',
  'TASK_COMPLETE'
]);

const VERIFICATION_RESULTS = Object.freeze(['PASS', 'FAIL', 'PARTIAL', 'UNKNOWN']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateTaskContract(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['TaskContract must be an object.'] };
  }
  for (const field of ['ttc_version', 'task_id', 'objective', 'desired_outcome']) {
    if (!isNonEmptyString(candidate[field])) {
      issues.push(`TaskContract.${field} must be a non-empty string.`);
    }
  }
  if (!Array.isArray(candidate.success_criteria) || candidate.success_criteria.length === 0) {
    issues.push('TaskContract.success_criteria must be a non-empty array.');
  }
  for (const key of ['success_criteria', 'failure_criteria']) {
    for (const criterion of Array.isArray(candidate[key]) ? candidate[key] : []) {
      if (!criterion || !isNonEmptyString(criterion.criterion_id) || !isNonEmptyString(criterion.statement) || !isNonEmptyString(criterion.verification_method_ref)) {
        issues.push(`TaskContract.${key} criteria must carry criterion_id, statement and verification_method_ref.`);
      }
    }
  }
  if (!Array.isArray(candidate.authority_requirements)) {
    issues.push('TaskContract.authority_requirements must be an array (may be empty).');
  }
  if (candidate.resource_budget !== undefined) {
    const rb = candidate.resource_budget;
    if (!rb || typeof rb !== 'object' || Array.isArray(rb) || !isNonEmptyString(rb.budget_id) ||
        !rb.limits || typeof rb.limits !== 'object' || Array.isArray(rb.limits) || Object.keys(rb.limits).length === 0) {
      issues.push('TaskContract.resource_budget must carry budget_id and a non-empty limits object.');
    } else {
      const supportedLimitFields = ['max_effects', 'max_wall_clock_ms'];
      for (const key of Object.keys(rb.limits)) {
        if (!supportedLimitFields.includes(key) || !Number.isInteger(rb.limits[key]) || rb.limits[key] < 0) {
          issues.push(`TaskContract.resource_budget.limits.${key} is not a supported non-negative integer limit.`);
        }
      }
      if (rb.policy_ref !== undefined && !isNonEmptyString(rb.policy_ref)) {
        issues.push('TaskContract.resource_budget.policy_ref must be a non-empty string when present.');
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

function validateRuntimeState(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['RuntimeState must be an object.'] };
  }
  if (!isNonEmptyString(candidate.task_ref)) {
    issues.push('RuntimeState.task_ref must be a non-empty string.');
  }
  if (!isNonEmptyString(candidate.lifecycle_state)) {
    issues.push('RuntimeState.lifecycle_state must be a non-empty string (vocabulary enforced from P2).');
  }
  if (candidate.verification_status === 'passed' && !isNonEmptyString(candidate.latest_verification_ref)) {
    issues.push('RuntimeState: verification_status "passed" requires latest_verification_ref (fail-closed against status inflation).');
  }
  if (candidate.domain_state_ref !== undefined) {
    const ref = candidate.domain_state_ref;
    if (!ref || typeof ref !== 'object' || !isNonEmptyString(ref.type) || !isNonEmptyString(ref.ref) || Object.keys(ref).some((k) => !['type', 'ref'].includes(k))) {
      issues.push('RuntimeState.domain_state_ref must be exactly {type, ref} and stays opaque to the generic runtime.');
    }
  }
  return { ok: issues.length === 0, issues };
}

function validateTransitionRecord(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['TransitionRecord must be an object.'] };
  }
  if (!TRANSITION_DECISIONS.includes(candidate.decision)) {
    issues.push(`TransitionRecord.decision must be one of: ${TRANSITION_DECISIONS.join(', ')}.`);
  }
  if (candidate.decision === 'COMPLETE' && !isNonEmptyString(candidate.completion_evidence_ref)) {
    issues.push('TransitionRecord: COMPLETE requires completion_evidence_ref pointing at a completion disposition.');
  }
  return { ok: issues.length === 0, issues };
}

function validateContextManifest(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['ContextManifest must be an object.'] };
  }
  if (!isNonEmptyString(candidate.context_id) || !isNonEmptyString(candidate.task_ref)) {
    issues.push('ContextManifest.context_id and task_ref must be non-empty strings.');
  }
  if (!Number.isInteger(candidate.token_budget) || candidate.token_budget < 1) {
    issues.push('ContextManifest.token_budget must be a positive integer.');
  }
  if (!Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    issues.push('ContextManifest.sections must be a non-empty array.');
    return { ok: false, issues };
  }
  let totalTokens = 0;
  for (const section of candidate.sections) {
    if (!section || !isNonEmptyString(section.source_ref) || !isNonEmptyString(section.inclusion_reason)) {
      issues.push('ContextManifest sections require source_ref and inclusion_reason.');
    }
    if (!Number.isInteger(section?.token_estimate) || section.token_estimate < 0) {
      issues.push('ContextManifest section token_estimate must be a non-negative integer.');
    } else {
      totalTokens += section.token_estimate;
    }
  }
  if (Number.isInteger(candidate.token_budget) && totalTokens > candidate.token_budget) {
    issues.push(`ContextManifest section tokens (${totalTokens}) exceed token_budget (${candidate.token_budget}).`);
  }
  if (!Array.isArray(candidate.omitted_sources) || !Array.isArray(candidate.compression_applied)) {
    issues.push('ContextManifest.omitted_sources and compression_applied must be arrays (may be empty).');
  }
  return { ok: issues.length === 0, issues };
}

function validateCompletionDisposition(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['CompletionDisposition must be an object.'] };
  }
  if (!isNonEmptyString(candidate.task_ref)) {
    issues.push('CompletionDisposition.task_ref must be a non-empty string.');
  }
  const stages = Array.isArray(candidate.claimed_stages) ? candidate.claimed_stages : [];
  if (stages.length === 0 || stages.some((stage) => !COMPLETION_STAGES.includes(stage))) {
    issues.push(`CompletionDisposition.claimed_stages must be a non-empty subset of: ${COMPLETION_STAGES.join(', ')}.`);
  }
  const hasEvidence = Array.isArray(candidate.evidence_refs) && candidate.evidence_refs.length > 0;
  if ((stages.includes('VERIFICATION_PASSED') || stages.includes('TASK_COMPLETE')) && !hasEvidence) {
    issues.push('CompletionDisposition: claiming VERIFICATION_PASSED or TASK_COMPLETE requires non-empty evidence_refs.');
  }
  if (stages.includes('TASK_COMPLETE')) {
    for (const requiredStage of ['OUTPUT_GENERATED', 'ACTION_EXECUTED', 'VERIFICATION_PASSED']) {
      if (!stages.includes(requiredStage)) {
        issues.push(`CompletionDisposition: TASK_COMPLETE requires ${requiredStage} to be claimed as well (stages are not equivalent).`);
      }
    }
    if (!Array.isArray(candidate.verified_by_refs) || candidate.verified_by_refs.length === 0) {
      issues.push('CompletionDisposition: TASK_COMPLETE requires verified_by_refs.');
    }
  }
  if (['REJECTED', 'INSUFFICIENT_EVIDENCE'].includes(candidate.disposition)) {
    if (!Array.isArray(candidate.unmet_criteria) || candidate.unmet_criteria.length === 0) {
      issues.push('CompletionDisposition: REJECTED / INSUFFICIENT_EVIDENCE require unmet_criteria.');
    }
  }
  return { ok: issues.length === 0, issues };
}

function validateVerificationRecord(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['VerificationRecord must be an object.'] };
  }
  if (!isNonEmptyString(candidate.verification_id) || !isNonEmptyString(candidate.target_ref) || !isNonEmptyString(candidate.method) || !isNonEmptyString(candidate.verified_at)) {
    issues.push('VerificationRecord requires verification_id, target_ref, method and verified_at.');
  }
  if (!Array.isArray(candidate.evidence_refs) || candidate.evidence_refs.length === 0) {
    issues.push('VerificationRecord.evidence_refs must be a non-empty array (claims are not evidence).');
  }
  if (!VERIFICATION_RESULTS.includes(candidate.result)) {
    issues.push(`VerificationRecord.result must be one of: ${VERIFICATION_RESULTS.join(', ')}.`);
  }
  const verifier = candidate.verifier;
  if (!verifier || !isNonEmptyString(verifier.verifier_type) || !isNonEmptyString(verifier.verifier_ref)) {
    issues.push('VerificationRecord.verifier requires verifier_type and verifier_ref.');
  } else {
    if (verifier.verifier_ref === candidate.target_ref) {
      issues.push('VerificationRecord: subject != verifier authority — a target may not verify itself.');
    }
    if (verifier.verifier_type === 'self_reflection' && candidate.result === 'PASS') {
      issues.push('VerificationRecord: self_reflection cannot produce a standalone PASS (evidence beats self-confidence).');
    }
  }
  return { ok: issues.length === 0, issues };
}

const CONTEXT_ENGINE_PORT_METHODS = Object.freeze(['assemble']);

// Fail-closed port definition: shared-core knows only the port; the concrete
// context engine (baum-os src/context) binds to it. A binding that does not
// provide the port surface must never be accepted silently.
function defineContextEnginePort(binding) {
  const issues = [];
  if (!binding || typeof binding !== 'object') {
    issues.push('ContextEnginePort binding must be an object.');
  } else {
    for (const method of CONTEXT_ENGINE_PORT_METHODS) {
      if (typeof binding[method] !== 'function') {
        issues.push(`ContextEnginePort binding is missing required method: ${method}().`);
      }
    }
    if (binding.engine_ref !== undefined && !isNonEmptyString(binding.engine_ref)) {
      issues.push('ContextEnginePort binding.engine_ref must be a non-empty string when present.');
    }
  }
  if (issues.length > 0) {
    throw new RuntimeBlockedError('ContextEnginePort binding rejected (fail-closed).', issues);
  }

  return Object.freeze({
    port: 'ContextEnginePort',
    contractRef: 'core/contracts/clg-context-manifest.json',
    methods: Object.freeze([...CONTEXT_ENGINE_PORT_METHODS]),
    engineRef: binding.engine_ref ?? 'unspecified',
    manifestOnly: true
  });
}

function loadClgContracts(repoRoot = process.cwd()) {
  const loaded = loadRuntimeContracts(repoRoot);
  const contracts = new Map();
  for (const name of CLG_CONTRACT_FILES) {
    const contract = loaded.contracts.get(name);
    if (contract) {
      contracts.set(name, contract);
    } else {
      loaded.issues.push(`Missing CLG contract: core/contracts/${name}`);
    }
  }
  return {
    ok: loaded.ok && contracts.size === CLG_CONTRACT_FILES.length && loaded.issues.length === 0,
    status: loaded.ok && contracts.size === CLG_CONTRACT_FILES.length ? 'completed' : 'blocked',
    issues: loaded.issues,
    contracts
  };
}

export {
  CLG_CONTRACT_FILES,
  TRANSITION_DECISIONS,
  COMPLETION_STAGES,
  VERIFICATION_RESULTS,
  CONTEXT_ENGINE_PORT_METHODS,
  loadClgContracts,
  validateTaskContract,
  validateRuntimeState,
  validateTransitionRecord,
  validateContextManifest,
  validateCompletionDisposition,
  validateVerificationRecord,
  defineContextEnginePort
};
