import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CLG_CONTRACT_FILES,
  COMPLETION_STAGES,
  TRANSITION_DECISIONS,
  loadClgContracts,
  validateCompletionDisposition,
  validateContextManifest,
  validateRuntimeState,
  validateTaskContract,
  validateTransitionRecord,
  validateVerificationRecord,
  defineContextEnginePort
} from '../../runtime/contracts/clg-contracts.mjs';
import { loadRuntimeContracts } from '../../runtime/contracts/load-contracts.mjs';
import { RuntimeBlockedError } from '../../runtime/kernel/runtime-errors.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PY_CHECK = `
import json, sys
from jsonschema import Draft202012Validator
schema = json.load(open(sys.argv[1], encoding="utf-8"))
instance = json.load(open(sys.argv[2], encoding="utf-8"))
Draft202012Validator.check_schema(schema)
errors = sorted(Draft202012Validator(schema).iter_errors(instance), key=lambda e: list(e.path))
if errors:
    for err in errors:
        print(".".join(str(p) for p in err.absolute_path) or "(root)", "->", err.message)
    sys.exit(1)
print("VALID")
`;

function pyValidate(contractFile, instance) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-contract-'));
  const instancePath = path.join(tmp, 'instance.json');
  fs.writeFileSync(instancePath, JSON.stringify(instance), 'utf8');
  try {
    execFileSync('python3', ['-c', PY_CHECK, path.join(repoRoot, 'core', 'contracts', contractFile), instancePath], { stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? error) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const taskContractPositive = {
  ttc_version: '1.0.0',
  task_id: 'TASK-1',
  objective: 'prove the contract layer',
  desired_outcome: 'all contract tests pass',
  success_criteria: [{ criterion_id: 'C1', statement: 'tests green', verification_method_ref: 'test:node --test tests/runtime/clg-contracts.test.mjs' }],
  failure_criteria: [],
  constraints: [{ constraint_id: 'K1', statement: 'no runtime enforcement' }],
  scope: { included: ['runtime/contracts'], excluded: ['projects/'] },
  authority_requirements: []
};

const runtimeStatePositive = {
  rtc_version: '1.0.0',
  task_ref: 'TASK-1',
  lifecycle_state: 'running',  // P8 alignment: kernel SM vocabulary (was non-runtime 'executing')
  verification_status: 'passed',
  latest_verification_ref: 'VR-1',
  domain_state_ref: { type: 'opaque-domain', ref: 'domain/instance-42' }
};

const transitionPositive = { tvc_version: '1.0.0', decision: 'CONTINUE' };

const manifestPositive = {
  ctx_version: '1.0.0',
  context_id: 'CTX-1',
  task_ref: 'TASK-1',
  session_ref: 'SES-1',
  token_budget: 100,
  sections: [
    { source_ref: 'file:a.md', source_type: 'file', provenance: 'repo@8cf4ffc', token_estimate: 30, inclusion_reason: 'task scope' },
    { source_ref: 'chk:CHK-1', source_type: 'checkpoint', resolver_ref: 'engine:baum-context', provenance: 'session SES-1', token_estimate: 40, inclusion_reason: 'resume state', trust_decision: { decision: 'allow', policy_ref: 'policy-1', subject_ref: 'chk:CHK-1' } }
  ],
  omitted_sources: [{ source_ref: 'file:b.md', omission_reason: 'out of scope' }],
  compression_applied: ['tail-trim']
};

const completionPositive = {
  cc_version: '1.0.0',
  task_ref: 'TASK-1',
  disposition: 'ACCEPTED',
  claimed_stages: ['OUTPUT_GENERATED', 'ACTION_EXECUTED', 'VERIFICATION_PASSED', 'TASK_COMPLETE'],
  evidence_refs: ['EV-1'],
  verified_by_refs: ['VR-1'],
  unmet_criteria: []
};

const verificationPositive = {
  vrc_version: '1.0.0',
  verification_id: 'VR-1',
  target_ref: 'artifact:build-123',
  subject_digest: 'deadbeef',
  method: 'sha256 digest + test suite',
  verifier: { verifier_type: 'deterministic', verifier_ref: 'ci-runner' },
  evidence_refs: ['log:run-9'],
  result: 'PASS',
  verified_at: '2026-09-14T00:00:00Z'
};

test('all six CLG contracts are loadable and leave the pre-existing required runtime contracts intact', () => {
  const clg = loadClgContracts(repoRoot);
  assert.equal(clg.ok, true, `issues: ${clg.issues.join('; ')}`);
  assert.deepEqual([...clg.contracts.keys()].sort(), [...CLG_CONTRACT_FILES].sort());

  const all = loadRuntimeContracts(repoRoot);
  assert.equal(all.ok, true, `issues: ${all.issues.join('; ')}`);
  for (const file of CLG_CONTRACT_FILES) {
    assert.equal(all.contracts.get(file).clgId.startsWith('CLG-'), true);
  }
});

test('CLG-001 TaskContract: schema accepts the positive instance and rejects unknown/injected fields', () => {
  assert.equal(pyValidate('clg-task-contract.json', taskContractPositive).ok, true);

  const injected = { ...taskContractPositive, tenant_id: 'T-1', capability_grant: 'G-1' };
  const rejected = pyValidate('clg-task-contract.json', injected);
  assert.equal(rejected.ok, false, 'unknown authority/tenancy fields must be rejected');

  const assertResult = validateTaskContract({ ...taskContractPositive, success_criteria: [{ criterion_id: 'C1', statement: 'x' }] });
  assert.equal(assertResult.ok, false);
  assert.ok(assertResult.issues.some((i) => i.includes('verification_method_ref')));
});

test('CLG-002 RuntimeState: passed requires verification ref; domain_state_ref stays opaque but well-formed', () => {
  assert.equal(validateRuntimeState(runtimeStatePositive).ok, true);
  assert.equal(pyValidate('clg-runtime-state.json', runtimeStatePositive).ok, true);

  const inflated = { ...runtimeStatePositive };
  delete inflated.latest_verification_ref;
  const result = validateRuntimeState(inflated);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('latest_verification_ref')));

  const malformedDomainRef = { ...runtimeStatePositive, domain_state_ref: { type: 'x', ref: 'y', tenant_id: 'T-1' } };
  assert.equal(validateRuntimeState(malformedDomainRef).ok, false);
});

test('CLG-003 Transition vocabulary: explicit decisions only; COMPLETE requires completion evidence', () => {
  assert.ok(TRANSITION_DECISIONS.includes('REPLAN') && TRANSITION_DECISIONS.includes('ACQUIRE_CONTEXT'));
  assert.equal(validateTransitionRecord(transitionPositive).ok, true);

  const invalidDecision = validateTransitionRecord({ tvc_version: '1.0.0', decision: 'LOOKS_GOOD' });
  assert.equal(invalidDecision.ok, false, 'ambiguous free-form endings must be rejected');

  const bareComplete = validateTransitionRecord({ tvc_version: '1.0.0', decision: 'COMPLETE' });
  assert.equal(bareComplete.ok, false);
  assert.ok(bareComplete.issues.some((i) => i.includes('completion_evidence_ref')));

  assert.equal(
    pyValidate('clg-transition-vocabulary.json', { tvc_version: '1.0.0', decision: 'COMPLETE', completion_evidence_ref: 'CC-1' }).ok,
    true
  );
});

test('CLG-004 ContextManifest: provenance-required sections, budget arithmetic, opaque trust decision', () => {
  assert.equal(validateContextManifest(manifestPositive).ok, true);
  assert.equal(pyValidate('clg-context-manifest.json', manifestPositive).ok, true);

  const overBudget = { ...manifestPositive, token_budget: 50 };
  const overBudgetResult = validateContextManifest(overBudget);
  assert.equal(overBudgetResult.ok, false);
  assert.ok(overBudgetResult.issues.some((i) => i.includes('exceed token_budget')));

  const unexplained = {
    ...manifestPositive,
    sections: [{ source_ref: 'file:a.md', source_type: 'file', provenance: 'p', token_estimate: 1 }]
  };
  assert.equal(validateContextManifest(unexplained).ok, false);

  const schemaReject = pyValidate('clg-context-manifest.json', {
    ...manifestPositive,
    sections: [{ source_ref: 'file:a.md', source_type: 'file', token_estimate: 1, inclusion_reason: 'r' }]
  });
  assert.equal(schemaReject.ok, false, 'missing provenance must be schema-rejected');
});

test('CLG-005 Completion contract: stages are not equivalent; TASK_COMPLETE implies all prior stages and evidence', () => {
  assert.deepEqual(COMPLETION_STAGES, ['OUTPUT_GENERATED', 'ACTION_EXECUTED', 'VERIFICATION_PASSED', 'TASK_COMPLETE']);
  assert.equal(validateCompletionDisposition(completionPositive).ok, true);
  assert.equal(pyValidate('clg-completion-contract.json', completionPositive).ok, true);

  const outputOnly = validateCompletionDisposition({
    cc_version: '1.0.0',
    task_ref: 'TASK-1',
    disposition: 'PROPOSED',
    claimed_stages: ['OUTPUT_GENERATED'],
    evidence_refs: []
  });
  assert.equal(outputOnly.ok, true, 'a generated output alone is a valid (incomplete) stage claim');

  const falseComplete = validateCompletionDisposition({
    cc_version: '1.0.0',
    task_ref: 'TASK-1',
    disposition: 'PROPOSED',
    claimed_stages: ['OUTPUT_GENERATED', 'TASK_COMPLETE'],
    evidence_refs: ['EV-1'],
    verified_by_refs: ['VR-1']
  });
  assert.equal(falseComplete.ok, false);
  assert.ok(falseComplete.issues.some((i) => i.includes('not equivalent')));

  const noEvidence = validateCompletionDisposition({
    cc_version: '1.0.0',
    task_ref: 'TASK-1',
    disposition: 'PROPOSED',
    claimed_stages: ['VERIFICATION_PASSED'],
    evidence_refs: []
  });
  assert.equal(noEvidence.ok, false);

  const rejectedWithoutCriteria = validateCompletionDisposition({
    cc_version: '1.0.0',
    task_ref: 'TASK-1',
    disposition: 'INSUFFICIENT_EVIDENCE',
    claimed_stages: ['OUTPUT_GENERATED']
  });
  assert.equal(rejectedWithoutCriteria.ok, false);
  assert.ok(rejectedWithoutCriteria.issues.some((i) => i.includes('unmet_criteria')));
});

test('CLG-006 VerificationRecord: independent, evidence-bound; self-verification and self-reflection PASS denied', () => {
  assert.equal(validateVerificationRecord(verificationPositive).ok, true);
  assert.equal(pyValidate('clg-verification-record.json', verificationPositive).ok, true);

  const selfVerified = validateVerificationRecord({
    ...verificationPositive,
    verifier: { verifier_type: 'deterministic', verifier_ref: 'artifact:build-123' }
  });
  assert.equal(selfVerified.ok, false);
  assert.ok(selfVerified.issues.some((i) => i.includes('may not verify itself')));

  const selfReflectionPass = validateVerificationRecord({
    ...verificationPositive,
    verifier: { verifier_type: 'self_reflection', verifier_ref: 'model:self' }
  });
  assert.equal(selfReflectionPass.ok, false);

  const unknownResult = validateVerificationRecord({
    ...verificationPositive,
    result: 'UNKNOWN'
  });
  assert.equal(unknownResult.ok, true, 'UNKNOWN is a representable fail-closed outcome');

  const noEvidence = validateVerificationRecord({ ...verificationPositive, evidence_refs: [] });
  assert.equal(noEvidence.ok, false);

  assert.equal(pyValidate('clg-verification-record.json', { ...verificationPositive, result: 'MAYBE' }).ok, false);
});

test('generic CLG contracts contain no Unitera domain concepts', () => {
  const forbidden = [
    'Unitera', 'tenant', 'TenantNodeBinding', 'RuntimeAdmission', 'CommitmentStage',
    'PersonalRealm', 'sovereignty', 'CCA-02', 'capability_invocation', 'ConversationContextPackage'
  ];
  for (const file of CLG_CONTRACT_FILES) {
    const content = fs.readFileSync(path.join(repoRoot, 'core', 'contracts', file), 'utf8');
    for (const term of forbidden) {
      assert.equal(content.includes(term), false, `${file} must not contain "${term}"`);
    }
  }
});

test('ContextEnginePort bindings fail closed on missing port surface', () => {
  assert.throws(() => defineContextEnginePort({}), RuntimeBlockedError);
  assert.throws(() => defineContextEnginePort(null), RuntimeBlockedError);

  const port = defineContextEnginePort({
    assemble: () => ({ /* manifest-producing engine call */ }),
    engine_ref: 'baum-os:src/context'
  });
  assert.equal(port.port, 'ContextEnginePort');
  assert.equal(port.contractRef, 'core/contracts/clg-context-manifest.json');
  assert.equal(Object.isFrozen(port), true);
});
