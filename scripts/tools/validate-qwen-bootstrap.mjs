#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './_shared.mjs';

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

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function listFilesRecursive(rootPath, relativeBase = rootPath, output = []) {
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = path.join(rootPath, entry.name);
    const relativePath = path.relative(relativeBase, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      listFilesRecursive(fullPath, relativeBase, output);
    } else {
      output.push({ fullPath, relativePath });
    }
  }
  return output;
}

function parseScalar(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === '[]') return [];
  return raw;
}

function parseYamlFrontmatter(text, label) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error(`${label} is missing YAML frontmatter.`);
  }

  const fields = {};
  let currentArrayKey = null;
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch) {
      if (!currentArrayKey) {
        throw new Error(`${label} contains an array item without an array key.`);
      }
      fields[currentArrayKey].push(listMatch[1]);
      continue;
    }
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      throw new Error(`${label} contains an invalid frontmatter line: ${line}`);
    }
    const [, key, rawValue] = keyMatch;
    if (rawValue === '') {
      fields[key] = [];
      currentArrayKey = key;
      continue;
    }
    fields[key] = parseScalar(rawValue);
    currentArrayKey = null;
  }

  return fields;
}

function parseSimpleYaml(text, label) {
  const fields = {};
  let currentArrayKey = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch) {
      if (!currentArrayKey) {
        throw new Error(`${label} contains an array item without an array key.`);
      }
      fields[currentArrayKey].push(listMatch[1]);
      continue;
    }
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      throw new Error(`${label} contains an invalid YAML line: ${line}`);
    }
    const [, key, rawValue] = keyMatch;
    if (rawValue === '') {
      fields[key] = [];
      currentArrayKey = key;
      continue;
    }
    fields[key] = parseScalar(rawValue);
    currentArrayKey = null;
  }

  return fields;
}

function deepEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (typeof left !== typeof right || left == null || right == null) {
    return false;
  }
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (typeof left === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
      return false;
    }
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

function validateJsonFile(filePath, expected, issues, label) {
  try {
    const actual = readJson(filePath);
    if (!deepEqual(actual, expected)) {
      issues.push(`${label} does not match the expected scaffold shape.`);
    }
  } catch (error) {
    issues.push(`${label} JSON parse failed: ${error.message}`);
  }
}

function validateResourceFile(filePath, requiredSnippets, issues, label) {
  let text;
  try {
    text = readText(filePath);
  } catch (error) {
    issues.push(`${label} could not be read: ${error.message}`);
    return;
  }
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      issues.push(`${label} is missing required text: ${snippet}`);
    }
  }
}

function validateAgentFile(filePath, expected, issues, label) {
  let text;
  try {
    text = readText(filePath);
  } catch (error) {
    issues.push(`${label} could not be read: ${error.message}`);
    return;
  }
  let actual;
  try {
    actual = parseSimpleYaml(text, label);
  } catch (error) {
    issues.push(error.message);
    return;
  }

  if (!deepEqual(actual, expected)) {
    issues.push(`${label} does not match the expected agent spec.`);
  }
}

function validateSkillFile(filePath, expected, issues, label) {
  let text;
  try {
    text = readText(filePath);
  } catch (error) {
    issues.push(`${label} could not be read: ${error.message}`);
    return;
  }

  let frontmatter;
  try {
    frontmatter = parseYamlFrontmatter(text, label);
  } catch (error) {
    issues.push(error.message);
    return;
  }

  const requiredFrontmatterFields = [
    'name',
    'description',
    'tier',
    'recommended_mode',
    'thinking',
    'approval',
    'allowed_tools',
    'required_tools',
    'forbidden_shortcuts'
  ];

  for (const field of requiredFrontmatterFields) {
    if (!(field in frontmatter)) {
      issues.push(`${label} is missing frontmatter field ${field}.`);
    }
  }

  if (!deepEqual(frontmatter, expected.frontmatter)) {
    issues.push(`${label} frontmatter does not match the expected scaffold shape.`);
  }

  for (const section of expected.sections) {
    if (!text.includes(section)) {
      issues.push(`${label} is missing required section ${section}.`);
    }
  }
}

function validateQwenBootstrap({ consumerRoot }) {
  const bootstrapRoot = path.join(consumerRoot, '.qwen');
  const issues = [];
  const expectedFiles = [
    '.qwen/settings.json',
    '.qwen/extensions/cheikh-core/qwen-extension.json',
    '.qwen/extensions/cheikh-core/resources/core-constitution.md',
    '.qwen/extensions/cheikh-core/resources/response-contract.md',
    '.qwen/extensions/cheikh-core/resources/tool-policy.md',
    '.qwen/extensions/cheikh-core/resources/mode-router.md',
    '.qwen/extensions/cheikh-core/resources/onboarding-router.md',
    '.qwen/extensions/cheikh-core/agents/analysis-expert.yaml',
    '.qwen/extensions/cheikh-core/agents/review-expert.yaml',
    '.qwen/extensions/cheikh-core/agents/runtime-expert.yaml',
    '.qwen/extensions/cheikh-core/agents/migration-expert.yaml',
    '.qwen/extensions/cheikh-core/skills/repo-intake/SKILL.md',
    '.qwen/extensions/cheikh-core/skills/governance-auditor/SKILL.md',
    '.qwen/extensions/cheikh-core/skills/migration-architect/SKILL.md',
    '.qwen/extensions/cheikh-core/skills/runtime-policy-auditor/SKILL.md',
    '.qwen/extensions/cheikh-core/skills/evidence-separator/SKILL.md',
    '.qwen/extensions/cheikh-core/skills/prompt-skill-designer/SKILL.md'
  ];

  if (!fs.existsSync(bootstrapRoot)) {
    return {
      ok: false,
      consumerRoot: normalize(consumerRoot),
      bootstrapRoot: normalize(bootstrapRoot),
      issueCount: 1,
      issues: ['Missing Qwen bootstrap root: .qwen']
    };
  }

  const actualFiles = listFilesRecursive(bootstrapRoot).map((entry) => `.qwen/${entry.relativePath}`.replace(/\/+/g, '/'));
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);

  for (const file of expectedFiles) {
    if (!actualSet.has(file)) {
      issues.push(`Missing required file: ${file}`);
    }
  }

  for (const file of actualFiles) {
    if (!expectedSet.has(file)) {
      issues.push(`Unexpected file in Qwen bootstrap: ${file}`);
    }
  }

  const settingsPath = path.join(consumerRoot, '.qwen', 'settings.json');
  const extensionPath = path.join(consumerRoot, '.qwen', 'extensions', 'cheikh-core', 'qwen-extension.json');
  const resourceRoot = path.join(consumerRoot, '.qwen', 'extensions', 'cheikh-core', 'resources');
  const agentRoot = path.join(consumerRoot, '.qwen', 'extensions', 'cheikh-core', 'agents');
  const skillRoot = path.join(consumerRoot, '.qwen', 'extensions', 'cheikh-core', 'skills');

  if (fs.existsSync(settingsPath)) {
    validateJsonFile(settingsPath, {
      model: 'qwen3.6-plus',
      approvalMode: 'plan',
      modelProviders: {
        primary: {
          name: 'qwen',
          model: 'qwen3.6-plus'
        }
      },
      features: {
        planModeDefault: true,
        skillsEnabled: true,
        hooksEnabled: true,
        mcpEnabled: true
      },
      sessionDefaults: {
        responseStyle: 'structured_concise',
        epistemicMode: 'evidence_first',
        changePolicy: 'minimal_invasive',
        toolPolicy: 'skill_scoped'
      },
      contextFiles: [
        '.qwen/extensions/cheikh-core/resources/core-constitution.md',
        '.qwen/extensions/cheikh-core/resources/response-contract.md',
        '.qwen/extensions/cheikh-core/resources/tool-policy.md',
        '.qwen/extensions/cheikh-core/resources/mode-router.md',
        '.qwen/extensions/cheikh-core/resources/onboarding-router.md'
      ]
    }, issues, 'settings.json');
  }

  if (fs.existsSync(extensionPath)) {
    validateJsonFile(extensionPath, {
      name: 'cheikh-core',
      version: '0.1.0',
      description: 'Governance-first skill tree for repo analysis, migration, runtime review, and controlled workflow execution.',
      skillsDir: 'skills',
      agentsDir: 'agents',
      resourcesDir: 'resources',
      enabled: true
    }, issues, 'qwen-extension.json');
  }

  validateResourceFile(path.join(resourceRoot, 'core-constitution.md'), [
    '# Core Constitution',
    '## Non-negotiable rules',
    'Prefer correctness over speed.',
    'Never invent a second authority path.',
    '## Epistemic discipline',
    'Always distinguish between:',
    '## Behavioral defaults'
  ], issues, 'core-constitution.md');

  validateResourceFile(path.join(resourceRoot, 'response-contract.md'), [
    '# Response Contract',
    'Default response shape:',
    '## Response style',
    '## Additional rules'
  ], issues, 'response-contract.md');

  validateResourceFile(path.join(resourceRoot, 'tool-policy.md'), [
    '# Tool Policy',
    '## Core rule',
    'Tools are selected by active skill, not by availability.',
    '## Prohibited shortcuts'
  ], issues, 'tool-policy.md');

  validateResourceFile(path.join(resourceRoot, 'mode-router.md'), [
    '# Mode Router',
    '## Analysis Mode',
    '## Review Mode',
    '## Planning Mode',
    '## Migration Mode',
    '## Runtime/Ops Mode',
    '## Helpdesk Mode',
    '## Implementation Mode'
  ], issues, 'mode-router.md');

  validateResourceFile(path.join(resourceRoot, 'onboarding-router.md'), [
    '# Onboarding Router',
    '## Layer 1 - Base Context',
    '## Layer 2 - Domain Context',
    '## Layer 3 - Mode Context',
    '## Layer 4 - Task Context',
    '## Routing rule'
  ], issues, 'onboarding-router.md');

  validateAgentFile(path.join(agentRoot, 'analysis-expert.yaml'), {
    name: 'analysis-expert',
    purpose: 'Understand current reality before proposing changes.',
    default_mode: 'analysis',
    thinking: 'on',
    approval: 'plan',
    skills: ['repo-intake', 'evidence-separator'],
    response_contract: 'structured_concise'
  }, issues, 'analysis-expert.yaml');

  validateAgentFile(path.join(agentRoot, 'review-expert.yaml'), {
    name: 'review-expert',
    purpose: 'Evaluate correctness, architecture boundaries, and governance compliance.',
    default_mode: 'review',
    thinking: 'on',
    approval: 'plan',
    skills: ['governance-auditor', 'evidence-separator'],
    response_contract: 'structured_concise'
  }, issues, 'review-expert.yaml');

  validateAgentFile(path.join(agentRoot, 'runtime-expert.yaml'), {
    name: 'runtime-expert',
    purpose: 'Diagnose runtime, deployment, and environment-state issues.',
    default_mode: 'runtime_ops',
    thinking: 'on',
    approval: 'default',
    skills: ['runtime-policy-auditor', 'evidence-separator'],
    response_contract: 'structured_concise'
  }, issues, 'runtime-expert.yaml');

  validateAgentFile(path.join(agentRoot, 'migration-expert.yaml'), {
    name: 'migration-expert',
    purpose: 'Convert prompt or workflow systems into modular Qwen-native structures.',
    default_mode: 'migration',
    thinking: 'on',
    approval: 'plan',
    skills: ['migration-architect', 'prompt-skill-designer'],
    response_contract: 'structured_concise'
  }, issues, 'migration-expert.yaml');

  const commonSkillSections = [
    '# Purpose',
    '# Activation conditions',
    '# Input contract',
    '# Procedure',
    '# Output contract',
    '# Validation contract',
    '# Escalation rules'
  ];

  validateSkillFile(path.join(skillRoot, 'repo-intake', 'SKILL.md'), {
    frontmatter: {
      name: 'repo-intake',
      description: 'Build an evidence-based first map of a repo or project state.',
      tier: 'core',
      recommended_mode: 'analysis',
      thinking: 'on',
      approval: 'plan',
      allowed_tools: ['files', 'search', 'shell'],
      required_tools: ['files', 'search'],
      forbidden_shortcuts: ['early redesign', 'root-cause claims without file evidence']
    },
    sections: commonSkillSections
  }, issues, 'repo-intake/SKILL.md');

  validateSkillFile(path.join(skillRoot, 'governance-auditor', 'SKILL.md'), {
    frontmatter: {
      name: 'governance-auditor',
      description: 'Check scope, authority boundaries, canonicality, and silent architecture drift.',
      tier: 'core',
      recommended_mode: 'review',
      thinking: 'on',
      approval: 'plan',
      allowed_tools: ['files', 'search', 'diff'],
      required_tools: ['files'],
      forbidden_shortcuts: ['style-only review', 'approval without evidence']
    },
    sections: commonSkillSections
  }, issues, 'governance-auditor/SKILL.md');

  validateSkillFile(path.join(skillRoot, 'migration-architect', 'SKILL.md'), {
    frontmatter: {
      name: 'migration-architect',
      description: 'Convert prompt and workflow systems into modular Qwen-native operating structures.',
      tier: 'core',
      recommended_mode: 'migration',
      thinking: 'on',
      approval: 'plan',
      allowed_tools: ['files', 'search', 'web'],
      required_tools: ['files'],
      forbidden_shortcuts: ['direct rewrite without decomposition', 'monolith prompt by default']
    },
    sections: commonSkillSections
  }, issues, 'migration-architect/SKILL.md');

  validateSkillFile(path.join(skillRoot, 'runtime-policy-auditor', 'SKILL.md'), {
    frontmatter: {
      name: 'runtime-policy-auditor',
      description: 'Diagnose config, env, startup, deployment, health, and runtime-mode correctness.',
      tier: 'core',
      recommended_mode: 'runtime_ops',
      thinking: 'on',
      approval: 'default',
      allowed_tools: ['files', 'shell', 'search'],
      required_tools: ['files', 'shell'],
      forbidden_shortcuts: ['generic docs-only diagnosis', 'mixing paper/live assumptions']
    },
    sections: commonSkillSections
  }, issues, 'runtime-policy-auditor/SKILL.md');

  validateSkillFile(path.join(skillRoot, 'evidence-separator', 'SKILL.md'), {
    frontmatter: {
      name: 'evidence-separator',
      description: 'Separate observation, inference, recommendation, and uncertainty with strict labeling.',
      tier: 'core',
      recommended_mode: 'analysis',
      thinking: 'hybrid',
      approval: 'plan',
      allowed_tools: ['files', 'search'],
      required_tools: [],
      forbidden_shortcuts: ['mixed unsupported claims']
    },
    sections: commonSkillSections
  }, issues, 'evidence-separator/SKILL.md');

  validateSkillFile(path.join(skillRoot, 'prompt-skill-designer', 'SKILL.md'), {
    frontmatter: {
      name: 'prompt-skill-designer',
      description: 'Design modular prompts, skill trees, response contracts, and tool-governance structures.',
      tier: 'core',
      recommended_mode: 'migration',
      thinking: 'on',
      approval: 'plan',
      allowed_tools: ['files', 'web'],
      required_tools: ['files'],
      forbidden_shortcuts: ['decorative prompting without operating logic', 'tool-enabled design without governance']
    },
    sections: commonSkillSections
  }, issues, 'prompt-skill-designer/SKILL.md');

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
