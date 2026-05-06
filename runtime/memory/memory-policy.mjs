import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_MEMORY_FILES = [
  'memory/README.md',
  'memory/MEMORY_CONTRACT.md',
  'memory/scopes/runtime.md',
  'memory/scopes/project.md',
  'memory/scopes/operator.md',
  'memory/scopes/decision-candidates.md',
  'memory/policies/retention-policy.md',
  'memory/policies/secret-exclusion-policy.md',
  'memory/policies/promotion-policy.md',
  'memory/policies/scope-policy.md',
  'memory/stores/jsonl/README.md',
  'memory/schemas/memory-entry.schema.json',
  'memory/schemas/memory-query.schema.json',
  'memory/schemas/memory-promotion.schema.json'
];

const REQUIRED_POLICY_MARKERS = new Map([
  ['memory/MEMORY_CONTRACT.md', ['non-canonical', 'Controlled runtime memory writes', 'No automatic canonical promotion']],
  ['memory/policies/secret-exclusion-policy.md', ['secrets', 'tokens', 'private keys', 'BLOCKED']],
  ['memory/policies/promotion-policy.md', ['review', 'SOT.md', 'DECISIONS.md', 'core/contracts/*']],
  ['memory/policies/scope-policy.md', ['runtime', 'project', 'operator', 'decision-candidate']]
]);

const REQUIRED_SCHEMA_FIELDS = new Map([
  ['memory/schemas/memory-entry.schema.json', ['id', 'createdAt', 'scope', 'source', 'writer', 'confidence', 'provenance', 'content', 'policy', 'promotion']],
  ['memory/schemas/memory-query.schema.json', ['scope', 'confidence', 'source']],
  ['memory/schemas/memory-promotion.schema.json', ['memoryId', 'target', 'reviewedBy', 'decision']]
]);

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function parseJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function validateSchemaRequiredFields(root, relativePath, requiredFields) {
  const schema = parseJson(root, relativePath);
  const required = new Set(schema.required ?? []);
  const missing = requiredFields.filter((field) => !required.has(field));
  return {
    ok: missing.length === 0,
    missing
  };
}

function validateMemorySkeleton({ repoRoot = process.cwd() } = {}) {
  const root = path.resolve(repoRoot);
  const issues = [];

  for (const relativePath of REQUIRED_MEMORY_FILES) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      issues.push(`Missing required memory skeleton file: ${relativePath}`);
    }
  }

  for (const [relativePath, markers] of REQUIRED_POLICY_MARKERS.entries()) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const text = readText(root, relativePath);
    for (const marker of markers) {
      if (!text.includes(marker)) {
        issues.push(`${relativePath} is missing required marker: ${marker}`);
      }
    }
  }

  for (const [relativePath, requiredFields] of REQUIRED_SCHEMA_FIELDS.entries()) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    try {
      const result = validateSchemaRequiredFields(root, relativePath, requiredFields);
      for (const field of result.missing) {
        issues.push(`${relativePath} schema is missing required field: ${field}`);
      }
    } catch (error) {
      issues.push(`${relativePath} schema parse failed: ${error.message}`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    checkedFiles: REQUIRED_MEMORY_FILES,
    capabilities: {
      runtimeMemoryWrites: true,
      canonicalPromotion: false,
      sqlite: false,
      scheduler: false
    }
  };
}

export { REQUIRED_MEMORY_FILES, validateMemorySkeleton };
