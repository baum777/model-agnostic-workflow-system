import crypto from 'node:crypto';
import path from 'node:path';
import { appendJsonLine } from '../adapters/jsonl/jsonl-adapter.mjs';

const RUNTIME_MEMORY_SCOPE = 'runtime';
const SECRET_PATTERNS = [
  /\bapi[_-]?key\b/i,
  /\btoken\b/i,
  /\bprivate\s+key\b/i,
  /\bpassword\b/i,
  /\bauthorization\b/i,
  /\bbearer\s+[a-z0-9._-]+/i,
  /\bsecret\b/i
];

function toRepoRelativePath(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
}

function hasSecretLikeContent(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return SECRET_PATTERNS.some((pattern) => pattern.test(serialized));
}

function buildRuntimeMemoryEntry({
  context,
  scope = RUNTIME_MEMORY_SCOPE,
  summary,
  details = {},
  provenancePath,
  source = 'runtime-run'
}) {
  const issues = [];
  if (scope !== RUNTIME_MEMORY_SCOPE) {
    issues.push('Runtime memory writer only allows runtime scope.');
  }
  if (!summary || typeof summary !== 'string') {
    issues.push('Runtime memory entry summary is required.');
  }
  if (!provenancePath) {
    issues.push('Runtime memory entry requires provenance path.');
  }
  if (hasSecretLikeContent({ summary, details })) {
    issues.push('Runtime memory entry blocked by secret exclusion policy.');
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const now = new Date().toISOString();
  const entry = {
    id: `mem_${now.replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}`,
    createdAt: now,
    updatedAt: now,
    scope,
    source,
    writer: {
      type: 'runtime',
      id: 'local-runtime'
    },
    confidence: 'validated',
    ttl: 'session',
    provenance: {
      runId: context.runId,
      path: toRepoRelativePath(context.repoRoot, provenancePath),
      commit: null
    },
    content: {
      summary,
      details
    },
    policy: {
      secretChecked: true,
      scopeChecked: true,
      promotionRequired: false
    },
    promotion: {
      status: 'none',
      target: null,
      reviewedBy: null,
      reviewedAt: null
    }
  };

  return { ok: true, issues: [], entry };
}

function writeRuntimeMemoryEntry(input) {
  const built = buildRuntimeMemoryEntry(input);
  if (!built.ok) {
    return built;
  }

  const runMemoryPath = path.join(input.context.runDir, 'memory.jsonl');
  const localStorePath = path.join(input.context.repoRoot, 'memory', 'stores', 'jsonl', 'runtime-memory.jsonl');
  appendJsonLine(runMemoryPath, built.entry);
  appendJsonLine(localStorePath, built.entry);

  return {
    ok: true,
    issues: [],
    entry: built.entry,
    runMemoryPath,
    localStorePath
  };
}

export { RUNTIME_MEMORY_SCOPE, buildRuntimeMemoryEntry, hasSecretLikeContent, writeRuntimeMemoryEntry };
