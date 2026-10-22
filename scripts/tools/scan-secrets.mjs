#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive, parseSimpleYaml, repoRoot } from './_shared.mjs';

const FILE_PATTERNS = [
  /^\.env/i,
  /^docs\//,
  /^examples\//,
  /^evals\//,
  /^templates\//,
  /^policies\//,
  /^providers\/[^/]+\/export\.json$/
];

const SECRET_PATTERNS = [
  { name: 'generic-api-key', regex: /\b(?:sk|rk|pk)_[A-Za-z0-9]{16,}\b/g },
  { name: 'authorization-bearer', regex: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{12,}/gi },
  { name: 'secret-assignment', regex: /\b(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)\s*[:=]\s*["']?[A-Za-z0-9._/+={}-]{12,}/g }
];
const SECRET_CLASS_POLICY_PATH = path.join('policies', 'secret-classes.yaml');
const DEFAULT_SYNTHETIC_POLICY = {
  syntheticPrefixes: [],
  syntheticAllowedPaths: [],
  syntheticOutsideAllowedPaths: 'forbidden'
};

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function shouldScan(relativePath) {
  return FILE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function normalizeRelativePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePathPrefix(value) {
  const normalized = normalizeRelativePath(value).replace(/^\.?\//, '');
  if (!normalized) {
    return '';
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function isInsideAllowedPath(relativePath, allowedPaths) {
  const normalizedPath = normalizeRelativePath(relativePath);
  for (const rawPrefix of allowedPaths) {
    const prefix = normalizePathPrefix(rawPrefix);
    if (!prefix) {
      continue;
    }
    if (normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function containsSyntheticPrefix(value, prefixes) {
  return prefixes.some((prefix) => String(value).includes(prefix));
}

function findSyntheticMatches(content, prefixes) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    return [];
  }
  const alternatives = prefixes
    .filter((prefix) => typeof prefix === 'string' && prefix.length > 0)
    .map((prefix) => escapeRegex(prefix));
  if (alternatives.length === 0) {
    return [];
  }
  const regex = new RegExp(`(?:${alternatives.join('|')})[A-Za-z0-9._/+={}-]+`, 'g');
  return content.match(regex) || [];
}

function loadSyntheticFixtureSecretPolicy(baseRoot, findings) {
  const policyPath = path.join(baseRoot, SECRET_CLASS_POLICY_PATH);
  if (!fs.existsSync(policyPath)) {
    findings.push({
      file: SECRET_CLASS_POLICY_PATH.replace(/\\/g, '/'),
      type: 'synthetic-policy-missing'
    });
    return DEFAULT_SYNTHETIC_POLICY;
  }

  try {
    const parsed = parseSimpleYaml(fs.readFileSync(policyPath, 'utf8'));
    const policy = parsed.eval_fixture_secret_policy || {};
    const syntheticPrefixes = Array.isArray(policy.synthetic_prefixes)
      ? policy.synthetic_prefixes.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [];
    const syntheticAllowedPaths = Array.isArray(policy.synthetic_allowed_paths)
      ? policy.synthetic_allowed_paths.filter((entry) => typeof entry === 'string' && entry.length > 0)
      : [];
    const syntheticOutsideAllowedPaths = typeof policy.synthetic_outside_allowed_paths === 'string'
      ? policy.synthetic_outside_allowed_paths
      : DEFAULT_SYNTHETIC_POLICY.syntheticOutsideAllowedPaths;

    return {
      syntheticPrefixes,
      syntheticAllowedPaths,
      syntheticOutsideAllowedPaths
    };
  } catch {
    findings.push({
      file: SECRET_CLASS_POLICY_PATH.replace(/\\/g, '/'),
      type: 'synthetic-policy-invalid'
    });
    return DEFAULT_SYNTHETIC_POLICY;
  }
}

function scanSecrets(baseRoot = repoRoot()) {
  const findings = [];
  const syntheticPolicy = loadSyntheticFixtureSecretPolicy(baseRoot, findings);
  const files = listFilesRecursive(baseRoot, (_fullPath, relativePath) => shouldScan(relativePath));

  for (const { fullPath, relativePath } of files) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const insideSyntheticAllowedPath = isInsideAllowedPath(relativePath, syntheticPolicy.syntheticAllowedPaths);
    const syntheticMatches = findSyntheticMatches(content, syntheticPolicy.syntheticPrefixes);

    if (syntheticMatches.length > 0 && syntheticPolicy.syntheticOutsideAllowedPaths === 'forbidden' && !insideSyntheticAllowedPath) {
      findings.push({
        file: relativePath,
        type: 'synthetic-placeholder-outside-approved-path'
      });
    }

    for (const pattern of SECRET_PATTERNS) {
      const matches = content.match(pattern.regex) || [];
      pattern.regex.lastIndex = 0;
      const actionableMatches = matches.filter((entry) => !(insideSyntheticAllowedPath && containsSyntheticPrefix(entry, syntheticPolicy.syntheticPrefixes)));
      if (actionableMatches.length > 0) {
        findings.push({
          file: relativePath,
          type: pattern.name
        });
      }
    }
  }

  return {
    ok: findings.length === 0,
    root: normalize(baseRoot),
    findingCount: findings.length,
    findings
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = scanSecrets();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { scanSecrets, SECRET_PATTERNS };
