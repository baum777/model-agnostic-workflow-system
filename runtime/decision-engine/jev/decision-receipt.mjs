// Jev decision receipts (MAWS-VN-202, OD-18).
//
// A receipt is immutable provenance evidence for one typed Jev decision. It
// records the question, offered choices, chosen answer, confidence, requested
// and resolved model, contract/policy versions, and mode. Receipts never
// contain secrets, API keys, full work state, or execution payloads; only the
// closed field set below. Receipt != Verification: a receipt proves a decision
// was made, not that its outcome was executed or accepted.
import { FailClosedError, newId, nowIso } from '../../vnext/util.mjs';

// 'openrouter' = canonical live path via the OpenRouter Decisions API;
// 'live' = optional direct-TypeSafe compatibility provider.
const MODES = ['fixture', 'live', 'openrouter'];
const STRING_FIELDS = [
  'question_id',
  'requested_model',
  'resolved_model',
  'decision_contract_version',
  'threshold_policy_version'
];

export function buildDecisionReceipt(input) {
  const invalid = (detail) => new FailClosedError('RECEIPT_INVALID', `decision receipt rejected: ${detail}`);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('input must be an object');
  }
  for (const name of STRING_FIELDS) {
    const value = input[name];
    if (typeof value !== 'string' || value === '') {
      throw invalid(`${name} must be a non-empty string`);
    }
  }
  const { question_id, choices, answer, confidence, requested_model, resolved_model } = input;
  const { decision_contract_version, threshold_policy_version, mode } = input;
  if (!Array.isArray(choices) || choices.length === 0 || choices.some((choice) => typeof choice !== 'string' || choice === '')) {
    throw invalid('choices must be a non-empty array of non-empty strings');
  }
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw invalid('confidence must be a number between 0 and 1');
  }
  if (!MODES.includes(mode)) {
    throw invalid(`mode must be one of ${MODES.join(', ')}`);
  }
  if (resolved_model === '*') {
    throw invalid('resolved_model must be a concrete model id, not the "*" wildcard');
  }
  if (!choices.includes(answer)) {
    throw new FailClosedError('ANSWER_OUTSIDE_ALLOWED_SPACE', 'receipt answer is not within the recorded choices');
  }
  const createdAt = input.created_at === undefined ? nowIso() : input.created_at;
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw invalid('created_at must be an ISO-8601 timestamp string');
  }
  return Object.freeze({
    receipt_id: newId('jevr'),
    question_id,
    choices: Object.freeze([...choices]),
    answer,
    confidence,
    requested_model,
    resolved_model,
    decision_contract_version,
    threshold_policy_version,
    mode,
    created_at: createdAt
  });
}

// Shape check for receipt consumers; returns a list of issues (empty = valid).
export function validateReceiptShape(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return ['receipt must be a plain object'];
  }
  const issues = [];
  const push = (issue) => issues.push(issue);
  if (!/^jevr_[a-z0-9]+$/.test(typeof receipt.receipt_id === 'string' ? receipt.receipt_id : '')) {
    push('receipt_id must match ^jevr_[a-z0-9]+$');
  }
  for (const name of STRING_FIELDS) {
    if (typeof receipt[name] !== 'string' || receipt[name] === '') {
      push(`${name} must be a non-empty string`);
    }
  }
  if (!Array.isArray(receipt.choices) || receipt.choices.length === 0 || receipt.choices.some((choice) => typeof choice !== 'string')) {
    push('choices must be a non-empty array of strings');
  }
  if (typeof receipt.confidence !== 'number' || receipt.confidence < 0 || receipt.confidence > 1) {
    push('confidence must be a number in [0,1]');
  }
  if (!MODES.includes(receipt.mode)) {
    push(`mode must be one of ${MODES.join(', ')}`);
  }
  if (typeof receipt.created_at === 'string' && Number.isNaN(Date.parse(receipt.created_at))) {
    push('created_at must be an ISO-8601 timestamp');
  }
  if (Array.isArray(receipt.choices) && typeof receipt.answer === 'string' && !receipt.choices.includes(receipt.answer)) {
    push('answer must be within choices');
  }
  if (receipt.resolved_model === '*') {
    push('resolved_model must be a concrete model id, not the "*" wildcard');
  }
  return issues;
}
