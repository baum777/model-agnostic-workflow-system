// Typed Jev decision threshold policy (MAWS-VN-200..203, OD-18).
//
// Parses and evaluates the strict policy shape used by
// policies/decision-thresholds.yaml (contract:
// core/contracts/decision-threshold-policy.schema.json):
//
//   policy_id: <string>
//   version: "<string>"
//   model_thresholds:
//     - model: "<model id or *>"
//       min_confidence: <number 0..1>
//       low_confidence_action: RE_EVALUATE|DETERMINISTIC_FALLBACK|HUMAN_GATE|BLOCKED
//
// The parser is intentionally line-based and strict: exactly one list level,
// no nesting beyond that, no tabs, no inline comments. Any deviation is a
// FailClosedError('POLICY_PARSE_FAILED'). The low_confidence_action enum is
// closed; no action widens authority. PROCEED is a runtime evaluation
// outcome (confidence >= min_confidence), never a policy value.
import fs from 'node:fs';

import { FailClosedError } from '../../vnext/util.mjs';

export const LOW_CONFIDENCE_ACTIONS = ['RE_EVALUATE', 'DETERMINISTIC_FALLBACK', 'HUMAN_GATE', 'BLOCKED'];

const TOP_LEVEL_KEYS = ['policy_id', 'version', 'model_thresholds'];
const ENTRY_KEYS = ['model', 'min_confidence', 'low_confidence_action'];

function fail(detail) {
  throw new FailClosedError('POLICY_PARSE_FAILED', `decision threshold policy rejected: ${detail}`);
}

// Allowed scalar shapes: double/single quoted strings, plain decimal numbers,
// bare identifiers (letters, digits, dots, underscores, dashes, leading '*').
function parseScalar(raw, where) {
  const value = raw.trim();
  if (value === '') fail(`empty value for ${where}`);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return { kind: 'string', value: value.slice(1, -1) };
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return { kind: 'string', value: value.slice(1, -1) };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return { kind: 'number', value: Number(value) };
  }
  if (/^[A-Za-z*][A-Za-z0-9*._-]*$/.test(value)) {
    return { kind: 'string', value };
  }
  fail(`unparsable value ${JSON.stringify(value)} for ${where}`);
}

function splitKeyValue(line, where) {
  const match = /^([A-Za-z0-9_]+):\s?(.*)$/.exec(line);
  if (!match) fail(`expected "key: value" at ${where}`);
  return { key: match[1], rawValue: match[2] };
}

export function parseThresholdPolicy(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    fail('policy text must be a non-empty string');
  }

  const top = new Map();
  const entries = [];
  let currentEntry = null;
  let sawList = false;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const where = `line ${index + 1}`;
    if (rawLine.includes('\t')) fail(`${where}: tabs are not allowed`);
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (rawLine.startsWith('      ')) {
      fail(`${where}: nesting deeper than one model_thresholds list level is not allowed`);
    }
    if (rawLine.startsWith('    ')) {
      if (currentEntry === null) fail(`${where}: indented field outside a model_thresholds entry`);
      const { key, rawValue } = splitKeyValue(trimmed, where);
      if (!ENTRY_KEYS.includes(key)) fail(`${where}: unknown model_thresholds field "${key}"`);
      if (key in currentEntry) fail(`${where}: duplicate field "${key}"`);
      currentEntry[key] = parseScalar(rawValue, `${where} field "${key}"`);
      continue;
    }
    if (rawLine.startsWith('  ')) {
      if (!rawLine.startsWith('  - ')) fail(`${where}: unexpected indentation; list entries must start with "  - "`);
      if (!sawList) fail(`${where}: list entry outside model_thresholds`);
      const inline = rawLine.slice(4).trim();
      if (inline === '') fail(`${where}: list entry must start with a field`);
      const { key, rawValue } = splitKeyValue(inline, where);
      if (!ENTRY_KEYS.includes(key)) fail(`${where}: unknown model_thresholds field "${key}"`);
      currentEntry = { [key]: parseScalar(rawValue, `${where} field "${key}"`) };
      entries.push(currentEntry);
      continue;
    }
    if (rawLine.startsWith(' ')) fail(`${where}: unexpected indentation`);

    const { key, rawValue } = splitKeyValue(trimmed, where);
    if (!TOP_LEVEL_KEYS.includes(key)) fail(`${where}: unknown top-level key "${key}"`);
    if (top.has(key)) fail(`${where}: duplicate top-level key "${key}"`);
    if (key === 'model_thresholds') {
      if (rawValue.trim() !== '') fail(`${where}: model_thresholds must open a list, not carry a scalar value`);
      sawList = true;
      currentEntry = null;
      top.set(key, true);
      continue;
    }
    const parsed = parseScalar(rawValue, `${where} key "${key}"`);
    if (parsed.kind !== 'string') fail(`${where}: "${key}" must be a string (quote numeric values)`);
    top.set(key, parsed.value);
  }

  for (const requiredKey of TOP_LEVEL_KEYS) {
    if (!top.has(requiredKey)) fail(`missing required top-level key "${requiredKey}"`);
  }
  if (entries.length === 0) fail('model_thresholds must contain at least one entry');

  const modelThresholds = entries.map((entry, entryIndex) => {
    const label = `model_thresholds entry ${entryIndex + 1}`;
    for (const field of ENTRY_KEYS) {
      if (!(field in entry)) fail(`${label} is missing "${field}"`);
    }
    const model = entry.model;
    const minConfidence = entry.min_confidence;
    const action = entry.low_confidence_action;
    if (model.kind !== 'string' || model.value === '') fail(`${label}: model must be a non-empty string`);
    if (minConfidence.kind !== 'number' || minConfidence.value < 0 || minConfidence.value > 1) {
      fail(`${label}: min_confidence must be a number between 0 and 1`);
    }
    if (action.kind !== 'string' || !LOW_CONFIDENCE_ACTIONS.includes(action.value)) {
      fail(`${label}: low_confidence_action must be one of ${LOW_CONFIDENCE_ACTIONS.join(', ')}`);
    }
    return Object.freeze({
      model: model.value,
      min_confidence: minConfidence.value,
      low_confidence_action: action.value
    });
  });

  return Object.freeze({
    policy_id: top.get('policy_id'),
    version: top.get('version'),
    model_thresholds: Object.freeze(modelThresholds)
  });
}

export async function loadThresholdPolicy(filePath) {
  if (typeof filePath !== 'string' || filePath === '') {
    throw new FailClosedError('POLICY_LOAD_FAILED', 'threshold policy path must be a non-empty string');
  }
  let text;
  try {
    text = await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    throw new FailClosedError('POLICY_LOAD_FAILED', `cannot read threshold policy at ${filePath}: ${error.message}`);
  }
  return parseThresholdPolicy(text);
}

// Structural validation for policy objects that did not come from
// parseThresholdPolicy (e.g. assembled in code). Fail-closed.
export function assertThresholdPolicyShape(policy) {
  const invalid = (detail) => new FailClosedError('POLICY_INVALID', `decision threshold policy is invalid: ${detail}`);
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw invalid('policy must be an object');
  if (typeof policy.policy_id !== 'string' || policy.policy_id === '') throw invalid('policy_id must be a non-empty string');
  if (typeof policy.version !== 'string' || policy.version === '') throw invalid('version must be a non-empty string');
  if (!Array.isArray(policy.model_thresholds) || policy.model_thresholds.length === 0) {
    throw invalid('model_thresholds must be a non-empty array');
  }
  policy.model_thresholds.forEach((entry, index) => {
    const label = `model_thresholds entry ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalid(`${label} must be an object`);
    if (typeof entry.model !== 'string' || entry.model === '') throw invalid(`${label}: model must be a non-empty string`);
    if (typeof entry.min_confidence !== 'number' || entry.min_confidence < 0 || entry.min_confidence > 1) {
      throw invalid(`${label}: min_confidence must be a number in [0,1]`);
    }
    if (!LOW_CONFIDENCE_ACTIONS.includes(entry.low_confidence_action)) {
      throw invalid(`${label}: low_confidence_action must be one of ${LOW_CONFIDENCE_ACTIONS.join(', ')}`);
    }
  });
}

// Most specific entry wins: an exact model match ("jev-x.y.z") beats "*".
// Ambiguous or missing coverage fails closed.
export function selectThreshold(policy, resolvedModel) {
  assertThresholdPolicyShape(policy);
  if (typeof resolvedModel !== 'string' || resolvedModel === '') {
    throw new FailClosedError('MODEL_RESOLUTION_INVALID', 'resolvedModel must be a non-empty string');
  }
  if (resolvedModel === '*') {
    throw new FailClosedError('MODEL_RESOLUTION_INVALID', 'resolvedModel must be a concrete model id, not the "*" wildcard');
  }
  const exact = policy.model_thresholds.filter((entry) => entry.model === resolvedModel);
  const wildcard = policy.model_thresholds.filter((entry) => entry.model === '*');
  if (exact.length > 1) {
    throw new FailClosedError('POLICY_AMBIGUOUS', `multiple threshold entries match resolved model ${resolvedModel}`);
  }
  if (exact.length === 1) return exact[0];
  if (wildcard.length > 1) {
    throw new FailClosedError('POLICY_AMBIGUOUS', 'multiple wildcard ("*") threshold entries are ambiguous');
  }
  if (wildcard.length === 1) return wildcard[0];
  throw new FailClosedError('POLICY_NO_MATCH', `no threshold entry matches resolved model ${resolvedModel} and no "*" entry exists`);
}

// action is 'PROCEED' when confidence >= min_confidence, otherwise the
// entry's low_confidence_action. PROCEED is a runtime outcome, not a
// schema enum member. applied_threshold is the numeric min_confidence used.
export function evaluateThreshold(receipt, policy) {
  if (!receipt || typeof receipt !== 'object') {
    throw new FailClosedError('RECEIPT_INVALID', 'evaluateThreshold requires a decision receipt object');
  }
  if (typeof receipt.confidence !== 'number' || receipt.confidence < 0 || receipt.confidence > 1) {
    throw new FailClosedError('RECEIPT_INVALID', 'receipt.confidence must be a number in [0,1]');
  }
  const entry = selectThreshold(policy, receipt.resolved_model);
  const action = receipt.confidence >= entry.min_confidence ? 'PROCEED' : entry.low_confidence_action;
  return Object.freeze({ action, applied_threshold: entry.min_confidence });
}
