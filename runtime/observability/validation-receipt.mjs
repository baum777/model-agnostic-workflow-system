import fs from 'node:fs';
import path from 'node:path';

const PHASE_1_ARTIFACTS = ['manifest.json', 'events.jsonl', 'permissions.jsonl', 'validation-receipt.json'];
const PHASE_3_ARTIFACTS = ['memory.jsonl'];
const VALIDATION_RECEIPT_VERSION = '1.0.0';

function writeValidationReceipt(context, checks) {
  const result = checks.every((check) => check.result === 'pass') ? 'pass' : 'blocked';
  const generatedAt = new Date().toISOString();
  const receipt = {
    receiptVersion: VALIDATION_RECEIPT_VERSION,
    runId: context.runId,
    generatedAt,
    result,
    summary: {
      runId: context.runId,
      result,
      checkCount: checks.length,
      passedChecks: checks.filter((check) => check.result === 'pass').length,
      blockedChecks: checks.filter((check) => check.result !== 'pass').length
    },
    checks
  };
  const receiptPath = path.join(context.runDir, 'validation-receipt.json');
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function findLatestRunDir(repoRoot) {
  const runRoot = path.join(repoRoot, 'artifacts', 'runtime-runs');
  if (!fs.existsSync(runRoot)) {
    return null;
  }

  const runDirs = fs.readdirSync(runRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('run_'))
    .map((entry) => path.join(runRoot, entry.name))
    .map((runDir) => {
      try {
        const manifest = readJson(path.join(runDir, 'manifest.json'));
        const createdAt = Date.parse(manifest.createdAt);
        if (manifest.runId !== path.basename(runDir) || Number.isNaN(createdAt)) {
          return null;
        }
        return { runDir, createdAt };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);

  return runDirs[0]?.runDir ?? null;
}

function hasString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateManifestShape(manifest) {
  const issues = [];
  for (const field of ['runId', 'createdAt', 'mode', 'runtimeVersion', 'status', 'entrypoint']) {
    if (!hasString(manifest[field])) {
      issues.push(`manifest.${field} must be a non-empty string.`);
    }
  }
  if (!Array.isArray(manifest.contractSources) || manifest.contractSources.length === 0) {
    issues.push('manifest.contractSources must be a non-empty array.');
  }
  if (Number.isNaN(Date.parse(manifest.createdAt))) {
    issues.push('manifest.createdAt must be a valid date-time string.');
  }
  return issues;
}

function validateReceiptShape(receipt) {
  const issues = [];
  if (receipt.receiptVersion !== VALIDATION_RECEIPT_VERSION) {
    issues.push(`validation receipt version must be ${VALIDATION_RECEIPT_VERSION}.`);
  }
  if (!hasString(receipt.runId)) {
    issues.push('validation receipt runId must be a non-empty string.');
  }
  if (!['pass', 'blocked', 'failed'].includes(receipt.result)) {
    issues.push('validation receipt result must be pass, blocked, or failed.');
  }
  if (!Array.isArray(receipt.checks)) {
    issues.push('validation receipt checks must be an array.');
  }
  if (!receipt.summary || receipt.summary.runId !== receipt.runId || receipt.summary.result !== receipt.result) {
    issues.push('validation receipt summary must match runId and result.');
  }
  return issues;
}

function validateEventShape(event, index, runId) {
  const issues = [];
  for (const field of ['event_id', 'event_name', 'event_family', 'timestamp']) {
    if (!hasString(event[field])) {
      issues.push(`events.jsonl[${index}].${field} must be a non-empty string.`);
    }
  }
  if (event.workflow?.run_id !== runId) {
    issues.push(`events.jsonl[${index}] workflow run_id must match manifest runId.`);
  }
  if (!['SUCCESS', 'BLOCKED', 'FAILED'].includes(event.outcome?.status)) {
    issues.push(`events.jsonl[${index}] outcome status must be SUCCESS, BLOCKED, or FAILED.`);
  }
  return issues;
}

function validatePermissionShape(permission, index, runId) {
  const issues = [];
  if (permission.runId !== runId) {
    issues.push(`permissions.jsonl[${index}] runId must match manifest runId.`);
  }
  if (!hasString(permission.claim)) {
    issues.push(`permissions.jsonl[${index}] claim must be a non-empty string.`);
  }
  if (!['allow', 'deny'].includes(permission.decision)) {
    issues.push(`permissions.jsonl[${index}] permission decision must be allow or deny.`);
  }
  if (permission.claim === 'external.http' && permission.decision !== 'deny') {
    issues.push(`permissions.jsonl[${index}] external.http permission decision must be deny.`);
  }
  if (!hasString(permission.reason)) {
    issues.push(`permissions.jsonl[${index}] reason must be a non-empty string.`);
  }
  return issues;
}

function validateMemoryShape(entry, index, runId) {
  const issues = [];
  if (!hasString(entry.id)) {
    issues.push(`memory.jsonl[${index}] id must be a non-empty string.`);
  }
  if (entry.scope !== 'runtime') {
    issues.push('memory.jsonl entries must use runtime scope.');
  }
  if (entry.provenance?.runId !== runId) {
    issues.push('memory.jsonl entry provenance runId must match manifest runId.');
  }
  if (entry.provenance?.path !== `artifacts/runtime-runs/${runId}/validation-receipt.json`) {
    issues.push('memory.jsonl entry provenance path must point to validation-receipt.json.');
  }
  if (entry.promotion?.status !== 'none') {
    issues.push('memory.jsonl entries must not promote canonically.');
  }
  return issues;
}

function validateRuntimeRun({ repoRoot = process.cwd(), runId, latest = false } = {}) {
  const root = path.resolve(repoRoot);
  const runDir = latest
    ? findLatestRunDir(root)
    : runId
      ? path.join(root, 'artifacts', 'runtime-runs', runId)
      : null;
  const issues = [];

  if (!runDir || !fs.existsSync(runDir)) {
    return {
      ok: false,
      issues: ['Runtime run directory not found.'],
      runDir
    };
  }

  for (const artifact of PHASE_1_ARTIFACTS) {
    if (!fs.existsSync(path.join(runDir, artifact))) {
      issues.push(`Missing runtime artifact: ${artifact}`);
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues, runDir };
  }

  let manifest;
  let receipt;
  let events;
  let permissions;
  let memoryEntries = [];
  try {
    manifest = readJson(path.join(runDir, 'manifest.json'));
    receipt = readJson(path.join(runDir, 'validation-receipt.json'));
    events = readJsonLines(path.join(runDir, 'events.jsonl'));
    permissions = readJsonLines(path.join(runDir, 'permissions.jsonl'));
    if (fs.existsSync(path.join(runDir, 'memory.jsonl'))) {
      memoryEntries = readJsonLines(path.join(runDir, 'memory.jsonl'));
    }
  } catch (error) {
    return { ok: false, issues: [`Runtime artifact parse failed: ${error.message}`], runDir };
  }

  if (manifest.runId !== receipt.runId) {
    issues.push('manifest runId and validation receipt runId differ.');
  }
  if (manifest.runId !== path.basename(runDir)) {
    issues.push('manifest runId does not match run directory name.');
  }
  if (manifest.status !== 'completed') {
    issues.push(`manifest status must be completed; found ${manifest.status}.`);
  }
  if (receipt.result !== 'pass') {
    issues.push(`validation receipt result must be pass; found ${receipt.result}.`);
  }
  issues.push(...validateManifestShape(manifest));
  issues.push(...validateReceiptShape(receipt));
  if (!Array.isArray(events) || events.length === 0) {
    issues.push('events.jsonl must contain at least one event.');
  }
  for (const [index, event] of events.entries()) {
    issues.push(...validateEventShape(event, index, manifest.runId));
  }
  for (const [index, permission] of permissions.entries()) {
    issues.push(...validatePermissionShape(permission, index, manifest.runId));
  }
  if (!permissions.some((permission) => permission.claim === 'external.http' && permission.decision === 'deny')) {
    issues.push('permissions.jsonl must contain a denied external.http decision.');
  }
  if (memoryEntries.length > 0) {
    for (const [index, entry] of memoryEntries.entries()) {
      issues.push(...validateMemoryShape(entry, index, manifest.runId));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    runDir,
    manifest,
    receipt,
    events,
    permissions,
    memoryEntries
  };
}

export {
  PHASE_1_ARTIFACTS,
  PHASE_3_ARTIFACTS,
  VALIDATION_RECEIPT_VERSION,
  findLatestRunDir,
  readJson,
  readJsonLines,
  validateRuntimeRun,
  writeValidationReceipt
};
