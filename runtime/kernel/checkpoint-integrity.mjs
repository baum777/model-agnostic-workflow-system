import crypto from 'node:crypto';
import { validateRuntimeState } from '../contracts/clg-contracts.mjs';

// CLG P4-001/002 checkpoint envelope contract and canonical integrity.
//
// Ownership: runtime/kernel owns durable runtime-state persistence (same
// surface as loop-artifacts.mjs); this module defines the checkpoint envelope
// and its digest. It is generic: opaque refs only, no domain semantics.
//
// DIGEST BOUNDARY (explicit, P4-002):
//   runtime_state_digest = sha256(canonical(runtime_state))
//   payload              = envelope WITHOUT the `integrity` object
//                          (checkpoint_id, task_ref, run_ref, runtime_state,
//                          runtime_state_digest, runtime_version,
//                          contract_version, created_at,
//                          previous_checkpoint_ref, sequence, reason)
//   integrity.payload_digest = sha256(canonical(payload))
// The integrity block is never part of its own digest (no cycle). Canonical
// form is deterministic recursively key-sorted JSON, so digests do not depend
// on JSON key order.

const CHECKPOINT_CONTRACT_VERSION = '1.0.0';
const DIGEST_ALGORITHM = 'sha256';

// Explicit safepoints only (P4: no automatic per-transition persistence).
const CHECKPOINT_REASONS = Object.freeze([
  'manual',
  'before_external_wait',
  'before_containment',
  'after_verified_state_update'
]);

const CHECKPOINT_ID_PATTERN = /^chk_[A-Za-z0-9_-]+$/;
const RUN_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
// Repo-relative, self-locating ref; every segment path-safe (anti-traversal).
const CHECKPOINT_REF_PATTERN = /^artifacts\/runtime-runs\/([A-Za-z0-9][A-Za-z0-9._-]*)\/checkpoints\/cp_(\d{6})_(chk_[A-Za-z0-9_-]+)\.json$/;

function canonicalize(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical form requires finite numbers.');
    return JSON.stringify(value);
  }
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'object') {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error(`Canonical form undefined for type ${type}.`);
}

function sha256OfCanonical(value) {
  const digest = crypto.createHash(DIGEST_ALGORITHM).update(canonicalize(value)).digest('hex');
  return `${DIGEST_ALGORITHM}:${digest}`;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// Strict allowlist validation of a deserialized checkpoint envelope.
function validateCheckpointEnvelope(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, issues: ['Checkpoint must be an object.'] };
  }
  const issues = [];
  const requiredStrings = ['checkpoint_id', 'task_ref', 'run_ref', 'runtime_state_digest', 'runtime_version', 'contract_version', 'created_at', 'reason'];
  for (const field of requiredStrings) {
    if (!isNonEmptyString(candidate[field])) {
      issues.push(`Checkpoint.${field} must be a non-empty string.`);
    }
  }
  if (!CHECKPOINT_ID_PATTERN.test(candidate.checkpoint_id ?? '')) {
    issues.push('Checkpoint.checkpoint_id must match chk_[A-Za-z0-9_-]+ (path-safe identity).');
  }
  if (isNonEmptyString(candidate.run_ref) && !RUN_REF_PATTERN.test(candidate.run_ref)) {
    issues.push('Checkpoint.run_ref must be path-safe.');
  }
  if (!Number.isInteger(candidate.sequence) || candidate.sequence < 1) {
    issues.push('Checkpoint.sequence must be an integer >= 1.');
  }
  if (!CHECKPOINT_REASONS.includes(candidate.reason)) {
    issues.push(`Checkpoint.reason must be one of: ${CHECKPOINT_REASONS.join(', ')}.`);
  }
  if (!DIGEST_PATTERN.test(candidate.runtime_state_digest ?? '')) {
    issues.push('Checkpoint.runtime_state_digest must be a sha256:<hex> digest.');
  }
  if (candidate.previous_checkpoint_ref !== null
    && candidate.previous_checkpoint_ref !== undefined
    && !isNonEmptyString(candidate.previous_checkpoint_ref)) {
    issues.push('Checkpoint.previous_checkpoint_ref must be null or a checkpoint ref string.');
  }
  const integrity = candidate.integrity;
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)) {
    issues.push('Checkpoint.integrity must be an object.');
  } else {
    if (integrity.algorithm !== DIGEST_ALGORITHM) {
      issues.push(`Checkpoint.integrity.algorithm must be "${DIGEST_ALGORITHM}".`);
    }
    if (!DIGEST_PATTERN.test(integrity.payload_digest ?? '')) {
      issues.push('Checkpoint.integrity.payload_digest must be a sha256:<hex> digest.');
    }
    if (Object.keys(integrity).some((key) => !['algorithm', 'payload_digest'].includes(key))) {
      issues.push('Checkpoint.integrity carries unexpected fields.');
    }
  }
  if (!candidate.runtime_state || typeof candidate.runtime_state !== 'object') {
    issues.push('Checkpoint.runtime_state must be an object.');
  } else {
    const stateCheck = validateRuntimeState(candidate.runtime_state);
    if (!stateCheck.ok) {
      issues.push('Checkpoint.runtime_state violates the CLG-002 contract.', ...stateCheck.issues);
    }
  }
  const allowed = new Set([...requiredStrings, 'sequence', 'reason', 'integrity', 'runtime_state', 'previous_checkpoint_ref']);
  for (const key of Object.keys(candidate)) {
    if (!allowed.has(key)) {
      issues.push(`Checkpoint carries unexpected field: ${key}.`);
    }
  }
  if (candidate.checkpoint_id !== undefined && candidate.runtime_state?.task_ref !== undefined
    && isNonEmptyString(candidate.runtime_state.task_ref) && isNonEmptyString(candidate.task_ref)
    && candidate.runtime_state.task_ref !== candidate.task_ref) {
    issues.push('Checkpoint identity mismatch: runtime_state.task_ref != checkpoint.task_ref.');
  }
  return { ok: issues.length === 0, issues };
}

// Verifies both digests of a validated envelope (identity + integrity).
function verifyCheckpointIntegrity(candidate) {
  const envelopeCheck = validateCheckpointEnvelope(candidate);
  if (!envelopeCheck.ok) {
    return { ok: false, issues: envelopeCheck.issues };
  }
  const issues = [];
  const stateDigest = sha256OfCanonical(candidate.runtime_state);
  if (stateDigest !== candidate.runtime_state_digest) {
    issues.push('runtime_state_digest mismatch: persisted state does not match its digest.');
  }
  const payload = { ...candidate };
  delete payload.integrity;
  const payloadDigest = sha256OfCanonical(payload);
  if (payloadDigest !== candidate.integrity.payload_digest) {
    issues.push('payload_digest mismatch: checkpoint payload mutated.');
  }
  return { ok: issues.length === 0, issues };
}

export {
  CHECKPOINT_CONTRACT_VERSION,
  CHECKPOINT_ID_PATTERN,
  CHECKPOINT_REASONS,
  CHECKPOINT_REF_PATTERN,
  DIGEST_ALGORITHM,
  canonicalize,
  sha256OfCanonical,
  validateCheckpointEnvelope,
  verifyCheckpointIntegrity
};
