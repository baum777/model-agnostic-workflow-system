import {
  validateRuntimeState,
  validateTaskContract,
  validateVerificationRecord
} from '../contracts/clg-contracts.mjs';

// CLG P3-A CompletionEvaluator — deterministic fact evaluation for completion.
//
// Separation of concerns (owner-ordered):
//   CompletionEvaluator  evaluates facts/evidence against TaskContract criteria
//   CompletionGuard (P2) decides whether the COMPLETE transition is admissible
//
// The evaluator is independent of agent self-judgment: a criterion counts as
// satisfied only when a valid, subject-bound VerificationRecord with result
// PASS exists whose `method` equals the criterion's `verification_method_ref`.
// Outputs, executed actions and receipts never satisfy criteria by themselves.
// No domain semantics: criteria, methods and subjects stay opaque references.

const COMPLETION_EVALUATION_VERSION = '1.0.0';
const COMPLETION_RESULTS = Object.freeze(['COMPLETE_READY', 'INCOMPLETE', 'BLOCKED', 'UNKNOWN']);

function block(result, issues) {
  return { ok: true, result, issues };
}

function evaluateCompletion({ taskContract, runtimeState, verificationRecords = [], subjectDigest = null }) {
  const issues = [];

  const contractCheck = validateTaskContract(taskContract);
  if (!contractCheck.ok) {
    return { ok: false, result: 'BLOCKED', criteria: emptyCriteria(), verification_refs: [], evidence_refs: [], issues: ['TaskContract invalid.', ...contractCheck.issues] };
  }
  const stateCheck = validateRuntimeState(runtimeState);
  if (!stateCheck.ok) {
    return { ok: false, result: 'BLOCKED', criteria: emptyCriteria(), verification_refs: [], evidence_refs: [], issues: ['RuntimeState invalid.', ...stateCheck.issues] };
  }
  if (runtimeState.task_ref !== taskContract.task_id) {
    return block('BLOCKED', [`Subject mismatch: runtimeState.task_ref (${runtimeState.task_ref}) != taskContract.task_id (${taskContract.task_id}).`]);
  }

  const records = Array.isArray(verificationRecords) ? verificationRecords : [];
  for (const record of records) {
    const recordCheck = validateVerificationRecord(record);
    if (!recordCheck.ok) {
      return { ok: false, result: 'BLOCKED', criteria: emptyCriteria(), verification_refs: [], evidence_refs: [], issues: ['Malformed VerificationRecord (fail-closed).', ...recordCheck.issues] };
    }
    if (record.target_ref !== taskContract.task_id) {
      return block('BLOCKED', [`Verification ${record.verification_id} targets ${record.target_ref}, not the contract subject ${taskContract.task_id}.`]);
    }
    if (subjectDigest !== null && record.subject_digest !== subjectDigest) {
      return block('BLOCKED', [`Evidence subject digest mismatch on verification ${record.verification_id}.`]);
    }
  }

  const criteria = { satisfied: [], unsatisfied: [], unknown: [] };
  const verificationRefs = [];
  const evidenceRefs = new Set();
  let blocked = false;
  let unknown = false;

  for (const criterion of taskContract.success_criteria) {
    const bound = records.filter((record) => record.method === criterion.verification_method_ref);
    for (const record of bound) {
      verificationRefs.push(record.verification_id);
      for (const ref of record.evidence_refs) {
        evidenceRefs.add(ref);
      }
    }
    const failed = bound.find((record) => record.result === 'FAIL');
    if (failed) {
      issues.push(`Criterion ${criterion.criterion_id}: verification ${failed.verification_id} FAILED.`);
      blocked = true;
      continue;
    }
    if (bound.some((record) => record.result === 'PASS')) {
      criteria.satisfied.push(criterion.criterion_id);
      continue;
    }
    if (bound.some((record) => record.result === 'PARTIAL' || record.result === 'UNKNOWN')) {
      issues.push(`Criterion ${criterion.criterion_id}: verification is indeterminate.`);
      unknown = true;
      criteria.unknown.push(criterion.criterion_id);
      continue;
    }
    issues.push(`Criterion ${criterion.criterion_id}: no verification of declared method ${criterion.verification_method_ref}.`);
    criteria.unsatisfied.push(criterion.criterion_id);
  }

  if (blocked) {
    return { ok: true, result: 'BLOCKED', criteria, verification_refs: dedupe(verificationRefs), evidence_refs: [...evidenceRefs], issues };
  }
  if (criteria.unsatisfied.length > 0) {
    return { ok: true, result: 'INCOMPLETE', criteria, verification_refs: dedupe(verificationRefs), evidence_refs: [...evidenceRefs], issues };
  }
  if (unknown || criteria.unknown.length > 0) {
    return { ok: true, result: 'UNKNOWN', criteria, verification_refs: dedupe(verificationRefs), evidence_refs: [...evidenceRefs], issues };
  }
  return { ok: true, result: 'COMPLETE_READY', criteria, verification_refs: dedupe(verificationRefs), evidence_refs: [...evidenceRefs], issues };
}

function emptyCriteria() {
  return { satisfied: [], unsatisfied: [], unknown: [] };
}

function dedupe(refs) {
  return [...new Set(refs)];
}

export { COMPLETION_EVALUATION_VERSION, COMPLETION_RESULTS, evaluateCompletion };
