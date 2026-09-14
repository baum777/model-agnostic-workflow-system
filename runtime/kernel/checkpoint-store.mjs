import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateRuntimeState } from '../contracts/clg-contracts.mjs';
import { RuntimeBlockedError } from './runtime-errors.mjs';
import { RUNTIME_VERSION } from './runtime-context.mjs';
import {
  CHECKPOINT_CONTRACT_VERSION,
  CHECKPOINT_REASONS,
  CHECKPOINT_REF_PATTERN,
  sha256OfCanonical,
  validateCheckpointEnvelope,
  verifyCheckpointIntegrity
} from './checkpoint-integrity.mjs';

// CLG P4-003/004 durable checkpoint store.
//
// Single owner of checkpoint persistence, extending the kernel runtime-state
// persistence surface (loop-artifacts.mjs) — deliberately NOT a second
// persistence architecture. Writes follow the house pattern: permission-gated
// via the deny-by-default engine, deterministic paths derived from
// (run_ref, sequence, checkpoint_id), atomic temp+rename, no silent overwrite.
// Checkpoint creation never mutates RuntimeState: snapshot in, ref out.
//
// Checkpoint != runtime transition != verification PASS != task completion.

const MAX_CHECKPOINT_BYTES = 1024 * 1024;

function isRunRefSafe(runRef) {
  return typeof runRef === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runRef);
}

function checkpointsDir(repoRoot, runRef) {
  return path.join(path.resolve(repoRoot), 'artifacts', 'runtime-runs', runRef, 'checkpoints');
}

function checkpointFileName(sequence, checkpointId) {
  return `cp_${String(sequence).padStart(6, '0')}_${checkpointId}.json`;
}

// Repo-relative, self-locating ref derived only from validated components.
function buildCheckpointRef(runRef, sequence, checkpointId) {
  return `artifacts/runtime-runs/${runRef}/checkpoints/${checkpointFileName(sequence, checkpointId)}`;
}

function parseCheckpointRef(checkpointRef) {
  const match = CHECKPOINT_REF_PATTERN.exec(checkpointRef ?? '');
  if (!match) {
    return null;
  }
  return { runRef: match[1], sequence: Number(match[2]), checkpointId: match[3] };
}

// Loads a checkpoint file fail-closed: exact expected path rebuilt from the
// ref (anti-traversal), leaf realpath check (anti symlink swap), size cap,
// strict JSON, envelope schema, digest verification.
function loadCheckpoint({ repoRoot, checkpointRef }) {
  const parsedRef = parseCheckpointRef(checkpointRef);
  if (!parsedRef) {
    return { ok: false, denied: 'MALFORMED_CHECKPOINT_REF', checkpoint: null, issues: [`checkpoint_ref is malformed or not path-safe: ${String(checkpointRef)}`] };
  }
  const expectedPath = path.join(checkpointsDir(repoRoot, parsedRef.runRef), checkpointFileName(parsedRef.sequence, parsedRef.checkpointId));
  if (!fs.existsSync(expectedPath)) {
    return { ok: false, denied: 'CHECKPOINT_MISSING', checkpoint: null, issues: [`checkpoint not found: ${checkpointRef}`] };
  }
  const real = fs.realpathSync(expectedPath);
  if (real !== expectedPath) {
    return { ok: false, denied: 'CHECKPOINT_REF_UNSAFE', checkpoint: null, issues: ['checkpoint path is not a regular file (symlink escape denied).'] };
  }
  const stat = fs.statSync(expectedPath);
  if (!stat.isFile() || stat.size > MAX_CHECKPOINT_BYTES) {
    return { ok: false, denied: 'MALFORMED_CHECKPOINT', checkpoint: null, issues: ['checkpoint payload missing or oversized.'] };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  } catch (error) {
    return { ok: false, denied: 'MALFORMED_CHECKPOINT', checkpoint: null, issues: [`checkpoint is not valid JSON: ${error.message}`] };
  }
  const envelopeCheck = validateCheckpointEnvelope(raw);
  if (!envelopeCheck.ok) {
    return { ok: false, denied: 'MALFORMED_CHECKPOINT', checkpoint: null, issues: ['checkpoint envelope invalid.', ...envelopeCheck.issues] };
  }
  const integrity = verifyCheckpointIntegrity(raw);
  if (!integrity.ok) {
    return { ok: false, denied: 'DIGEST_MISMATCH', checkpoint: null, issues: ['checkpoint integrity failed.', ...integrity.issues] };
  }
  return { ok: true, denied: null, checkpoint: raw, checkpointPath: expectedPath, issues: [] };
}

function listCheckpoints({ repoRoot, runRef }) {
  if (!isRunRefSafe(runRef)) {
    return { ok: false, checkpoints: [], issues: ['run_ref must be path-safe.'] };
  }
  const dir = checkpointsDir(repoRoot, runRef);
  if (!fs.existsSync(dir)) {
    return { ok: true, checkpoints: [], issues: [] };
  }
  const checkpoints = [];
  const issues = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith('.json')) continue;
    const loaded = loadCheckpoint({ repoRoot, checkpointRef: `artifacts/runtime-runs/${runRef}/checkpoints/${entry}` });
    if (!loaded.ok) {
      issues.push(`${entry}: ${loaded.issues.join(' ')}`);
      continue;
    }
    checkpoints.push(loaded.checkpoint);
  }
  checkpoints.sort((a, b) => a.sequence - b.sequence);
  return { ok: issues.length === 0, checkpoints, issues };
}

function getLatestCheckpoint({ repoRoot, runRef }) {
  const list = listCheckpoints({ repoRoot, runRef });
  const latest = list.checkpoints.length > 0 ? list.checkpoints[list.checkpoints.length - 1] : null;
  return { ...list, latest };
}

// P4-004: RuntimeState in, CheckpointRef out — the passed state object is
// never mutated; the snapshot is a structured clone taken before digesting.
function createCheckpoint({
  repoRoot,
  permissionEngine,
  runRef,
  runtimeState,
  reason,
  previousCheckpointRef = null,
  checkpointId = null
}) {
  if (!isRunRefSafe(runRef)) {
    throw new RuntimeBlockedError('run_ref must be path-safe.', ['MALFORMED_RUN_REF']);
  }
  if (previousCheckpointRef !== null && !CHECKPOINT_REF_PATTERN.test(previousCheckpointRef)) {
    throw new RuntimeBlockedError('previous_checkpoint_ref is malformed.', ['MALFORMED_CHECKPOINT_REF']);
  }
  const stateCheck = validateRuntimeState(runtimeState);
  if (!stateCheck.ok) {
    throw new RuntimeBlockedError('Checkpoint creation requires a valid RuntimeState (CLG-002).', stateCheck.issues);
  }
  if (typeof runtimeState.task_ref !== 'string' || runtimeState.task_ref.length === 0) {
    throw new RuntimeBlockedError('Checkpoint requires a non-empty string task_ref.', ['MALFORMED_RUNTIME_STATE']);
  }
  if (!CHECKPOINT_REASONS.includes(reason)) {
    throw new RuntimeBlockedError(`Checkpoint reason must be an explicit safepoint: ${CHECKPOINT_REASONS.join(', ')}.`, ['INVALID_CHECKPOINT_REASON']);
  }
  const list = getLatestCheckpoint({ repoRoot, runRef });
  if (!list.ok) {
    throw new RuntimeBlockedError('Checkpoint store inspection failed (fail-closed).', list.issues);
  }
  const previous = list.latest;
  const sequence = previous ? previous.sequence + 1 : 1;
  if (previousCheckpointRef !== null
    && (!previous || previousCheckpointRef !== buildCheckpointRef(runRef, previous.sequence, previous.checkpoint_id))) {
    throw new RuntimeBlockedError('previous_checkpoint_ref does not reference the current chain head.', ['CHAIN_HEAD_MISMATCH']);
  }
  const id = checkpointId ?? `chk_${crypto.randomBytes(8).toString('hex')}`;
  if (!/^chk_[A-Za-z0-9_-]+$/.test(id)) {
    throw new RuntimeBlockedError('checkpoint_id must match chk_[A-Za-z0-9_-]+.', ['MALFORMED_CHECKPOINT_ID']);
  }
  const runtimeStateSnapshot = JSON.parse(JSON.stringify(runtimeState));
  const payload = {
    checkpoint_id: id,
    task_ref: runtimeStateSnapshot.task_ref,
    run_ref: runRef,
    runtime_state: runtimeStateSnapshot,
    runtime_state_digest: sha256OfCanonical(runtimeStateSnapshot),
    runtime_version: RUNTIME_VERSION,
    contract_version: CHECKPOINT_CONTRACT_VERSION,
    created_at: new Date().toISOString(),
    previous_checkpoint_ref: previousCheckpointRef,
    sequence,
    reason
  };
  const checkpoint = {
    ...payload,
    integrity: { algorithm: 'sha256', payload_digest: sha256OfCanonical(payload) }
  };
  const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CHECKPOINT_BYTES) {
    throw new RuntimeBlockedError('Checkpoint payload exceeds the practical size cap.', ['CHECKPOINT_OVERSIZED']);
  }

  const dir = checkpointsDir(repoRoot, runRef);
  const finalPath = path.join(dir, checkpointFileName(sequence, id));
  const checkpointRef = buildCheckpointRef(runRef, sequence, id);
  if (fs.existsSync(finalPath)) {
    throw new RuntimeBlockedError('Checkpoint already exists (no silent overwrite).', ['DUPLICATE_CHECKPOINT']);
  }
  const permission = permissionEngine.decide({ claim: 'filesystem.write', target: finalPath });
  if (permission.decision !== 'allow') {
    throw new RuntimeBlockedError(`checkpoint write denied: ${permission.reason}`, ['WRITE_DENIED']);
  }
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${finalPath}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tempPath, serialized, 'utf8');
  fs.renameSync(tempPath, finalPath);
  return { ok: true, issues: [], checkpointRef, checkpoint, checkpointPath: finalPath };
}

export {
  MAX_CHECKPOINT_BYTES,
  buildCheckpointRef,
  checkpointsDir,
  createCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
  loadCheckpoint,
  parseCheckpointRef
};
