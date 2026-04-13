#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, isInsideRoot, readJson, readText, repoRoot } from './_shared.mjs';

const REQUIRED_CONTEXT_FILES = [
  '.qwen/extensions/cheikh-core/resources/core-constitution.md',
  '.qwen/extensions/cheikh-core/resources/response-contract.md',
  '.qwen/extensions/cheikh-core/resources/tool-policy.md',
  '.qwen/extensions/cheikh-core/resources/mode-router.md',
  '.qwen/extensions/cheikh-core/resources/onboarding-router.md'
];

const REQUIRED_RESOURCES = [
  '.qwen/extensions/cheikh-core/resources/core-constitution.md',
  '.qwen/extensions/cheikh-core/resources/response-contract.md',
  '.qwen/extensions/cheikh-core/resources/tool-policy.md',
  '.qwen/extensions/cheikh-core/resources/mode-router.md',
  '.qwen/extensions/cheikh-core/resources/onboarding-router.md'
];

const REQUIRED_AGENTS = [
  '.qwen/extensions/cheikh-core/agents/analysis-expert.yaml',
  '.qwen/extensions/cheikh-core/agents/review-expert.yaml',
  '.qwen/extensions/cheikh-core/agents/runtime-expert.yaml',
  '.qwen/extensions/cheikh-core/agents/migration-expert.yaml'
];

const REQUIRED_SKILLS = [
  '.qwen/extensions/cheikh-core/skills/repo-intake/SKILL.md',
  '.qwen/extensions/cheikh-core/skills/governance-auditor/SKILL.md',
  '.qwen/extensions/cheikh-core/skills/migration-architect/SKILL.md',
  '.qwen/extensions/cheikh-core/skills/runtime-policy-auditor/SKILL.md',
  '.qwen/extensions/cheikh-core/skills/evidence-separator/SKILL.md',
  '.qwen/extensions/cheikh-core/skills/prompt-skill-designer/SKILL.md'
];

function parseArgs(argv) {
  const args = { consumer: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--consumer' && argv[index + 1]) {
      args.consumer = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function displayPath(consumerRoot, filePath) {
  return path.relative(consumerRoot, filePath).replace(/\\/g, '/');
}

function normalizeContextRef(reference) {
  return path.posix.normalize(reference.replace(/\\/g, '/').replace(/^\.\/+/, ''));
}

function issue(issues, code, target, detail) {
  issues.push(`[${code}] ${target}: ${detail}`);
}

function readRequiredText(filePath, consumerRoot, issues, contractCode, missingCode = 'missing-file') {
  const label = displayPath(consumerRoot, filePath);
  if (!exists(filePath)) {
    issue(issues, missingCode, label, 'file is missing');
    return null;
  }

  const text = readText(filePath);
  if (text.trim() === '') {
    issue(issues, contractCode, label, 'file is empty or whitespace-only');
    return null;
  }

  return text;
}

function readRequiredJsonObject(filePath, consumerRoot, issues, label) {
  if (!exists(filePath)) {
    issue(issues, 'missing-file', label, 'file is missing');
    return null;
  }

  let parsed;
  try {
    parsed = readJson(filePath);
  } catch (error) {
    issue(issues, 'invalid-json', label, error.message);
    return null;
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    issue(issues, 'invalid-structure', label, 'top-level value must be a JSON object');
    return null;
  }

  return parsed;
}

function validateSettings(consumerRoot, issues) {
  const settingsPath = path.join(consumerRoot, '.qwen', 'settings.json');
  const settings = readRequiredJsonObject(settingsPath, consumerRoot, issues, '.qwen/settings.json');
  if (!settings) {
    return;
  }

  if (!Array.isArray(settings.contextFiles)) {
    issue(issues, 'invalid-structure', '.qwen/settings.json', 'contextFiles must be an array');
    return;
  }

  const contextRefs = new Set();
  for (const [index, reference] of settings.contextFiles.entries()) {
    if (typeof reference !== 'string' || reference.trim() === '') {
      issue(issues, 'invalid-structure', '.qwen/settings.json', `contextFiles[${index}] must be a non-empty string`);
      continue;
    }

    const normalizedReference = normalizeContextRef(reference);
    contextRefs.add(normalizedReference);

    const resolvedReference = path.resolve(consumerRoot, reference);
    if (!isInsideRoot(consumerRoot, resolvedReference) || !exists(resolvedReference)) {
      issue(issues, 'broken-reference', '.qwen/settings.json', `contextFiles entry ${reference} does not resolve to a file inside the consumer overlay`);
    }
  }

  for (const requiredReference of REQUIRED_CONTEXT_FILES) {
    if (!contextRefs.has(requiredReference)) {
      issue(issues, 'invalid-structure', '.qwen/settings.json', `contextFiles is missing required reference ${requiredReference}`);
    }
  }

  if ('approvalMode' in settings && typeof settings.approvalMode !== 'string') {
    issue(issues, 'invalid-structure', '.qwen/settings.json', 'approvalMode must be a string when present');
  }

  if ('model' in settings && typeof settings.model !== 'string') {
    issue(issues, 'invalid-structure', '.qwen/settings.json', 'model must be a string when present');
  }
}

function validateExtensionManifest(consumerRoot, issues) {
  const extensionPath = path.join(consumerRoot, '.qwen', 'extensions', 'cheikh-core', 'qwen-extension.json');
  const extension = readRequiredJsonObject(extensionPath, consumerRoot, issues, '.qwen/extensions/cheikh-core/qwen-extension.json');
  if (!extension) {
    return;
  }

  for (const key of ['name', 'skillsDir', 'agentsDir', 'resourcesDir']) {
    if (typeof extension[key] !== 'string' || extension[key].trim() === '') {
      issue(issues, 'invalid-structure', '.qwen/extensions/cheikh-core/qwen-extension.json', `${key} must be a non-empty string`);
    }
  }

  if ('enabled' in extension && typeof extension.enabled !== 'boolean') {
    issue(issues, 'invalid-structure', '.qwen/extensions/cheikh-core/qwen-extension.json', 'enabled must be a boolean when present');
  }
}

function validateResources(consumerRoot, issues) {
  for (const relativePath of REQUIRED_RESOURCES) {
    const filePath = path.join(consumerRoot, relativePath);
    readRequiredText(filePath, consumerRoot, issues, 'empty-resource');
  }
}

function validateAgents(consumerRoot, issues) {
  for (const relativePath of REQUIRED_AGENTS) {
    const filePath = path.join(consumerRoot, relativePath);
    const text = readRequiredText(filePath, consumerRoot, issues, 'missing-agent-contract');
    if (!text) {
      continue;
    }

    for (const key of ['name:', 'purpose:', 'default_mode:']) {
      if (!text.includes(key)) {
        issue(issues, 'missing-agent-contract', relativePath, `missing required key ${key}`);
      }
    }
  }
}

function validateSkills(consumerRoot, issues) {
  for (const relativePath of REQUIRED_SKILLS) {
    const filePath = path.join(consumerRoot, relativePath);
    const text = readRequiredText(filePath, consumerRoot, issues, 'missing-skill-contract');
    if (!text) {
      continue;
    }

    for (const marker of [
      '---',
      'name:',
      'description:',
      'tier:',
      'recommended_mode:',
      '# Purpose',
      '# Activation conditions',
      '# Output contract'
    ]) {
      if (!text.includes(marker)) {
        issue(issues, 'missing-skill-contract', relativePath, `missing required marker ${marker}`);
      }
    }
  }
}

function validateQwenBootstrap({ consumerRoot }) {
  const issues = [];
  const bootstrapRoot = path.join(consumerRoot, '.qwen');

  if (!exists(bootstrapRoot)) {
    issue(issues, 'missing-file', '.qwen', 'bootstrap root is missing');
  }

  validateSettings(consumerRoot, issues);
  validateExtensionManifest(consumerRoot, issues);
  validateResources(consumerRoot, issues);
  validateAgents(consumerRoot, issues);
  validateSkills(consumerRoot, issues);

  return {
    ok: issues.length === 0,
    consumerRoot: normalize(consumerRoot),
    bootstrapRoot: normalize(bootstrapRoot),
    issueCount: issues.length,
    issues
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = validateQwenBootstrap({ consumerRoot: args.consumer });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { validateQwenBootstrap };
