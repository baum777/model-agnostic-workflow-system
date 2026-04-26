#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = { contract: null, skill: 'repo-intake-sot-mapper' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--contract' && argv[index + 1]) {
      args.contract = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--skill' && argv[index + 1]) {
      args.skill = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertStringArray(issues, value, label, options = {}) {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${label} must be a non-empty array of strings.`);
    return;
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      issues.push(`${label} must contain only non-empty strings.`);
      return;
    }
  }
  if (Array.isArray(options.requiredEntries)) {
    for (const required of options.requiredEntries) {
      if (!value.includes(required)) {
        issues.push(`${label} must include ${required}.`);
      }
    }
  }
}

function assertOptionalStringArray(issues, value, label) {
  if (value == null) {
    return;
  }
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${label} must be a non-empty array of strings when provided.`);
    return;
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      issues.push(`${label} must contain only non-empty strings.`);
      return;
    }
  }
}

function validateLocalInputContract(contractPath, expectedSkill = 'repo-intake-sot-mapper') {
  const issues = [];
  const absoluteContractPath = normalize(contractPath);
  if (!fs.existsSync(absoluteContractPath)) {
    return {
      ok: false,
      contractPath: absoluteContractPath,
      issueCount: 1,
      issues: [`Missing local input contract: ${absoluteContractPath}`]
    };
  }

  const root = path.resolve(path.dirname(absoluteContractPath), '..');
  let contract;
  try {
    contract = readJson(absoluteContractPath);
  } catch (error) {
    issues.push(`Contract JSON parse failed: ${error.message}`);
  }

  if (contract) {
    if (contract.skill !== expectedSkill) {
      issues.push(`Contract skill must be ${expectedSkill}; found ${contract.skill || '<missing>'}.`);
    }
    if (contract.repoRoot !== '.') {
      issues.push(`Contract repoRoot must be .; found ${contract.repoRoot || '<missing>'}.`);
    }
    for (const field of ['canonicalSourceFiles', 'primaryDocs', 'governanceFiles', 'likelyEntrypoints', 'testCommands', 'ignorePaths']) {
      assertStringArray(issues, contract[field], field);
    }
    for (const field of ['journalPaths', 'dailyNotePaths', 'evidenceLogPaths']) {
      assertOptionalStringArray(issues, contract[field], field);
    }
    if (typeof contract.notes !== 'string' || contract.notes.trim() === '') {
      issues.push('Contract notes must be a non-empty string.');
    }
    if (Array.isArray(contract.ignorePaths)) {
      for (const required of ['.git', 'node_modules', 'dist', 'coverage']) {
        if (!contract.ignorePaths.includes(required)) {
          issues.push(`ignorePaths must include ${required}.`);
        }
      }
    }
    for (const field of ['canonicalSourceFiles', 'primaryDocs', 'governanceFiles', 'likelyEntrypoints', 'journalPaths', 'dailyNotePaths', 'evidenceLogPaths']) {
      for (const relativePath of contract[field] || []) {
        const target = path.join(root, relativePath);
        if (!fs.existsSync(target)) {
          issues.push(`${field} entry does not exist: ${relativePath}`);
        }
      }
    }
  }

  return {
    ok: issues.length === 0,
    contractPath: absoluteContractPath,
    root: normalize(root),
    issueCount: issues.length,
    issues
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.contract) {
    console.error(JSON.stringify({ ok: false, error: 'Missing --contract <path>.' }, null, 2));
    process.exit(1);
  }
  const result = validateLocalInputContract(args.contract, args.skill);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { validateLocalInputContract };
