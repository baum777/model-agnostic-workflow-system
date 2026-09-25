// MAWS vNext verification receipts (MAWS-VN-701 / MAWS-VN-702 support).
// OD-17: Receipt != Verification. A receipt records one verifier outcome
// (PASS or FAIL); completion satisfaction is derived deterministically
// from the receipt set, never from executor self-report.
//
// Posture:
// - Pure functions. Callers persist receipts; this module performs no I/O.
// - Unknown or missing verification outcome is invalid, never a default PASS.
// - A FAIL receipt is blocking evidence and can never be downgraded.
// - independent=true asserts the verifier is not the producing executor.
// - Secrets must never enter receipts; refs and checks carry references only.
import { FailClosedError, newId, nowIso } from '../vnext/util.mjs';

const VERIFICATION_OUTCOMES = ['PASS', 'FAIL'];
const WORK_UNIT_ID_PATTERN = /^wu_[a-z0-9_]+$/;
const EXECUTOR_ID_PATTERN = /^exec_[a-z0-9_]+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function assertNonEmptyStringArray(values, field) {
  if (values === undefined) {
    return [];
  }
  if (!Array.isArray(values)) {
    throw new FailClosedError('VERIFICATION_RECEIPT_INVALID', `${field} must be an array of non-empty strings`);
  }
  for (const value of values) {
    if (!isNonEmptyString(value)) {
      throw new FailClosedError('VERIFICATION_RECEIPT_INVALID', `${field} entries must be non-empty strings`);
    }
  }
  return [...values];
}

// Build a VerificationReceipt. Pure: returns the receipt; callers persist it.
function buildVerificationReceipt(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new FailClosedError('VERIFICATION_RECEIPT_INVALID', 'buildVerificationReceipt requires a receipt input object');
  }

  const {
    work_unit_id: workUnitId,
    verifier_executor_id: verifierExecutorId,
    independent,
    outcome,
    evidence_refs: evidenceRefs,
    checks,
    created_at: createdAt
  } = input;

  if (!isNonEmptyString(workUnitId) || !WORK_UNIT_ID_PATTERN.test(workUnitId)) {
    throw new FailClosedError(
      'VERIFICATION_RECEIPT_INVALID',
      `work_unit_id must match ${WORK_UNIT_ID_PATTERN.source} (maws-vnext-common workUnitId)`
    );
  }
  if (!isNonEmptyString(verifierExecutorId) || !EXECUTOR_ID_PATTERN.test(verifierExecutorId)) {
    throw new FailClosedError(
      'VERIFICATION_RECEIPT_INVALID',
      `verifier_executor_id must match ${EXECUTOR_ID_PATTERN.source} (maws-vnext-common executorId)`
    );
  }
  if (independent !== undefined && typeof independent !== 'boolean') {
    throw new FailClosedError('VERIFICATION_RECEIPT_INVALID', 'independent must be a boolean when present');
  }
  if (!VERIFICATION_OUTCOMES.includes(outcome)) {
    throw new FailClosedError(
      'VERIFICATION_RECEIPT_INVALID',
      `outcome must be PASS or FAIL; got ${JSON.stringify(outcome)} (fail closed, no default PASS)`
    );
  }
  if (createdAt !== undefined && !isNonEmptyString(createdAt)) {
    throw new FailClosedError('VERIFICATION_RECEIPT_INVALID', 'created_at must be a non-empty timestamp string when present');
  }

  return {
    verification_receipt_id: newId('vr'),
    work_unit_id: workUnitId,
    verifier_executor_id: verifierExecutorId,
    independent: independent === true,
    outcome,
    evidence_refs: assertNonEmptyStringArray(evidenceRefs, 'evidence_refs'),
    checks: assertNonEmptyStringArray(checks, 'checks'),
    created_at: createdAt !== undefined ? createdAt : nowIso()
  };
}

function assertReceiptShape(receipt, index) {
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new FailClosedError(
      'VERIFICATION_RECEIPT_INVALID',
      `verification_receipts[${index}] must be an object (fail closed on malformed receipts)`
    );
  }
  if (!isNonEmptyString(receipt.verification_receipt_id)) {
    throw new FailClosedError(
      'VERIFICATION_RECEIPT_INVALID',
      `verification_receipts[${index}] is missing verification_receipt_id`
    );
  }
  if (!VERIFICATION_OUTCOMES.includes(receipt.outcome)) {
    throw new FailClosedError(
      'VERIFICATION_RECEIPT_INVALID',
      `verification receipt ${receipt.verification_receipt_id} has outcome ${JSON.stringify(receipt.outcome)}; expected PASS or FAIL`
    );
  }
}

// Deterministically evaluate a set of verification receipts.
// Callers scope the receipt set (for example to one work unit) before calling.
// satisfied requires: no FAIL receipt, at least one PASS receipt, and — when
// independentRequired is true — at least one PASS receipt with independent=true.
function evaluateVerificationReceipts(receipts, options = {}) {
  const { independentRequired = false } = options;
  const receiptList = receipts === undefined ? [] : receipts;
  if (!Array.isArray(receiptList)) {
    throw new FailClosedError('VERIFICATION_RECEIPT_INVALID', 'verification receipts must be provided as an array');
  }
  receiptList.forEach((receipt, index) => assertReceiptShape(receipt, index));

  const blocking = [];
  let passCount = 0;
  let independentPassCount = 0;

  for (const receipt of receiptList) {
    if (receipt.outcome === 'FAIL') {
      blocking.push(
        `verification receipt ${receipt.verification_receipt_id} recorded FAIL` +
          (isNonEmptyString(receipt.work_unit_id) ? ` for work unit ${receipt.work_unit_id}` : '')
      );
      continue;
    }
    passCount += 1;
    if (receipt.independent === true) {
      independentPassCount += 1;
    }
  }

  if (passCount === 0) {
    blocking.push('verification requires at least one PASS receipt; none is present');
  }
  if (independentRequired && independentPassCount === 0) {
    blocking.push('independent verification is required; no PASS receipt with independent=true is present');
  }

  return {
    satisfied: blocking.length === 0,
    blocking
  };
}

export { buildVerificationReceipt, evaluateVerificationReceipts };
