import fs from 'node:fs';
import path from 'node:path';

const PHASE_1_ARTIFACTS = ['manifest.json', 'events.jsonl', 'permissions.jsonl', 'validation-receipt.json'];

function writeValidationReceipt(context, checks) {
  const result = checks.every((check) => check.result === 'pass') ? 'pass' : 'blocked';
  const receipt = {
    runId: context.runId,
    result,
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
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return runDirs[0] ?? null;
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
  try {
    manifest = readJson(path.join(runDir, 'manifest.json'));
    receipt = readJson(path.join(runDir, 'validation-receipt.json'));
    events = readJsonLines(path.join(runDir, 'events.jsonl'));
    permissions = readJsonLines(path.join(runDir, 'permissions.jsonl'));
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
  if (!Array.isArray(events) || events.length === 0) {
    issues.push('events.jsonl must contain at least one event.');
  }
  if (!permissions.some((permission) => permission.claim === 'external.http' && permission.decision === 'deny')) {
    issues.push('permissions.jsonl must contain a denied external.http decision.');
  }

  return {
    ok: issues.length === 0,
    issues,
    runDir,
    manifest,
    receipt,
    events,
    permissions
  };
}

export { PHASE_1_ARTIFACTS, findLatestRunDir, validateRuntimeRun, writeValidationReceipt };
