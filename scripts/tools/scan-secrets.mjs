#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive, repoRoot } from './_shared.mjs';

const FILE_PATTERNS = [
  /^\.env/i,
  /^docs\//,
  /^examples\//,
  /^evals\//,
  /^templates\//
];

const SECRET_PATTERNS = [
  { name: 'generic-api-key', regex: /\b(?:sk|rk|pk)_[A-Za-z0-9]{16,}\b/g },
  { name: 'authorization-bearer', regex: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{12,}/gi },
  { name: 'secret-assignment', regex: /\b(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)\s*[:=]\s*["']?[A-Za-z0-9._/+={}-]{12,}/g }
];

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function shouldScan(relativePath) {
  return FILE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function scanSecrets(baseRoot = repoRoot()) {
  const findings = [];
  const files = listFilesRecursive(baseRoot, (_fullPath, relativePath) => shouldScan(relativePath));

  for (const { fullPath, relativePath } of files) {
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(content)) {
        findings.push({
          file: relativePath,
          type: pattern.name
        });
      }
      pattern.regex.lastIndex = 0;
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

export { scanSecrets };
