#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNeutralCoreRegistry } from './build-neutral-core-registry.mjs';
import { parseSkillFrontmatter, readJson, repoRoot } from './_shared.mjs';

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function readSkillOutputHeadings(skillPath) {
  const text = fs.readFileSync(skillPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const headings = [];
  let inOutput = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '## Output') {
      inOutput = true;
      continue;
    }
    if (inOutput && line.startsWith('## ')) {
      break;
    }
    if (!inOutput) continue;

    const bullet = line.match(/^-\s+`([^`]+)`\s*$/);
    if (bullet) {
      headings.push(bullet[1]);
    }
  }

  return headings;
}

function validateProviderNeutralCore(baseRoot = repoRoot()) {
  const root = baseRoot;
  const issues = [];
  const registryPath = path.join(root, 'contracts', 'core-registry.json');
  const providerCapabilitiesPath = path.join(root, 'contracts', 'provider-capabilities.json');
  const catalogPath = path.join(root, 'docs', 'tool-contracts', 'catalog.json');

  if (!fs.existsSync(registryPath)) {
    return {
      ok: false,
      root: normalize(root),
      issueCount: 1,
      issues: ['Missing provider-neutral registry: contracts/core-registry.json']
    };
  }

  const committedRegistry = readJson(registryPath);
  const generatedRegistry = buildNeutralCoreRegistry(root);
  if (JSON.stringify(committedRegistry, null, 2) !== JSON.stringify(generatedRegistry, null, 2)) {
    issues.push('contracts/core-registry.json does not match the generated neutral registry snapshot.');
  }

  if (!fs.existsSync(providerCapabilitiesPath)) {
    issues.push('Missing provider capability profile: contracts/provider-capabilities.json');
  } else {
    const capabilities = readJson(providerCapabilitiesPath);
    if (!Array.isArray(capabilities.providers) || capabilities.providers.length === 0) {
      issues.push('contracts/provider-capabilities.json must contain a non-empty providers array.');
    } else {
      const providerNames = capabilities.providers.map((provider) => provider.name);
      for (const required of ['openai', 'anthropic', 'qwen', 'kimi', 'codex']) {
        if (!providerNames.includes(required)) {
          issues.push(`contracts/provider-capabilities.json must include provider ${required}.`);
        }
      }
    }
  }

  if (!fs.existsSync(catalogPath)) {
    issues.push('Missing tool contract compatibility export: docs/tool-contracts/catalog.json');
  }

  const providerDirectories = ['openai', 'anthropic', 'qwen', 'kimi', 'codex'];
  for (const provider of providerDirectories) {
    const readmePath = path.join(root, 'providers', provider, 'README.md');
    if (!fs.existsSync(readmePath)) {
      issues.push(`Missing provider adapter scaffold: providers/${provider}/README.md`);
    }
  }

  const skillsRoot = path.join(root, 'skills');
  const skillDirectories = fs.existsSync(skillsRoot) ? fs.readdirSync(skillsRoot, { withFileTypes: true }) : [];
  const currentSkills = [];
  for (const entry of skillDirectories) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const frontmatter = parseSkillFrontmatter(fs.readFileSync(skillPath, 'utf8'));
    currentSkills.push(entry.name);
    if (frontmatter.name !== entry.name) {
      issues.push(`Skill frontmatter mismatch for ${entry.name}: found ${frontmatter.name || '<missing>'}.`);
    }
  }

  if (committedRegistry.core?.name !== 'agent-workflow-core') {
    issues.push(`core.name must be agent-workflow-core; found ${committedRegistry.core?.name || '<missing>'}.`);
  }
  if (committedRegistry.core?.status !== 'provider-neutral') {
    issues.push(`core.status must be provider-neutral; found ${committedRegistry.core?.status || '<missing>'}.`);
  }
  if (!Array.isArray(committedRegistry.skills) || committedRegistry.skills.length !== currentSkills.length) {
    issues.push(`Registry skill count must match the current skill manifests; found ${Array.isArray(committedRegistry.skills) ? committedRegistry.skills.length : 'invalid'} vs ${currentSkills.length}.`);
  }
  if (!Array.isArray(committedRegistry.tools) || committedRegistry.tools.length === 0) {
    issues.push('Registry tools must be a non-empty array.');
  }

  for (const skill of committedRegistry.skills || []) {
    if (typeof skill.sourcePath !== 'string' || skill.sourcePath.trim() === '') {
      issues.push(`Skill ${skill.name || '<unnamed>'} must declare sourcePath.`);
      continue;
    }
    if (!fs.existsSync(path.join(root, skill.sourcePath))) {
      issues.push(`Skill sourcePath does not exist: ${skill.sourcePath}`);
      continue;
    }
    const outputHeadings = readSkillOutputHeadings(path.join(root, skill.sourcePath));
    if (!Array.isArray(skill.outputHeadings) || skill.outputHeadings.length === 0) {
      issues.push(`Skill ${skill.name} must declare outputHeadings.`);
    } else if (JSON.stringify(skill.outputHeadings) !== JSON.stringify(outputHeadings)) {
      issues.push(`Skill ${skill.name} outputHeadings do not match the SKILL.md output contract.`);
    }
  }

  for (const tool of committedRegistry.tools || []) {
    if (typeof tool.name !== 'string' || tool.name.trim() === '') {
      issues.push('Tool entry must declare a name.');
      continue;
    }
    if (tool.sourcePath && !fs.existsSync(path.join(root, tool.sourcePath))) {
      issues.push(`Tool ${tool.name} sourcePath does not exist: ${tool.sourcePath}`);
    }
  }

  for (const provider of committedRegistry.providers || []) {
    if (typeof provider.name !== 'string' || provider.name.trim() === '') {
      issues.push('Provider entry must declare a name.');
      continue;
    }
    if (!provider.aliases || !Array.isArray(provider.aliases)) {
      issues.push(`Provider ${provider.name} must declare aliases as an array.`);
    }
    if (!provider.packaging) {
      issues.push(`Provider ${provider.name} must declare packaging.`);
    }
  }

  return {
    ok: issues.length === 0,
    root: normalize(root),
    issueCount: issues.length,
    issues
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = validateProviderNeutralCore();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { validateProviderNeutralCore };
