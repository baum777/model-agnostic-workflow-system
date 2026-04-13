#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNeutralCoreRegistry } from './build-neutral-core-registry.mjs';
import { buildProviderExports } from './build-provider-exports.mjs';
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

function providerCapabilities(root) {
  for (const candidate of [
    path.join(root, 'core', 'contracts', 'provider-capabilities.json'),
    path.join(root, 'contracts', 'provider-capabilities.json')
  ]) {
    if (fs.existsSync(candidate)) {
      return readJson(candidate);
    }
  }
  return { providers: [] };
}

const qwenCapabilityMarkers = [
  'Qwen3.6-Plus',
  '/think',
  '/no_think',
  '1M token',
  '1,000 calls/day',
  'enable_thinking',
  'modelProviders'
];

const canonicalQwenSurfacePaths = [
  'docs/architecture.md',
  'docs/authority-matrix.md',
  'docs/compatibility.md',
  'docs/lock-model.md',
  'docs/model-agnostic-core-prompt-system.md',
  'docs/repo-overlay-contract.md',
  'docs/shared-with-local-inputs.md',
  'docs/repo-intake-skill-contract.md',
  'docs/runtime-policy-skill-contract.md',
  'docs/tool-contracts/catalog.json',
  'docs/portability.md',
  'docs/provider-capability-matrix.md',
  'core/README.md',
  'core/contracts/README.md',
  'core/contracts/core-registry.json',
  'core/contracts/provider-capabilities.json'
];

function validateQwenBoundaryHygiene(root) {
  const issues = [];
  const derivedGuidePath = path.join(root, 'docs', 'qwen-3-6-intro.md');

  if (!fs.existsSync(derivedGuidePath)) {
    issues.push('Missing derived Qwen guide: docs/qwen-3-6-intro.md');
    return issues;
  }

  const derivedGuide = fs.readFileSync(derivedGuidePath, 'utf8');
  if (!derivedGuide.includes('Class: derived.')) {
    issues.push('docs/qwen-3-6-intro.md must declare Class: derived.');
  }
  if (!derivedGuide.includes('External / Unverified')) {
    issues.push('docs/qwen-3-6-intro.md must contain External / Unverified.');
  }

  for (const relativePath of canonicalQwenSurfacePaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      issues.push(`Missing canonical surface: ${relativePath}`);
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const marker of qwenCapabilityMarkers) {
      if (content.includes(marker)) {
        issues.push(`Canonical surface ${relativePath} must not contain external Qwen capability marker: ${marker}`);
      }
    }
  }

  return issues;
}

function validateProviderNeutralCore(baseRoot = repoRoot()) {
  const root = baseRoot;
  const issues = [];
  const registryPath = path.join(root, 'core', 'contracts', 'core-registry.json');
  const compatibilityRegistryPath = path.join(root, 'contracts', 'core-registry.json');
  const providerCapabilitiesPath = path.join(root, 'core', 'contracts', 'provider-capabilities.json');
  const compatibilityProviderCapabilitiesPath = path.join(root, 'contracts', 'provider-capabilities.json');
  const toolCatalogPath = path.join(root, 'core', 'contracts', 'tool-contracts', 'catalog.json');
  const compatibilityToolCatalogPath = path.join(root, 'docs', 'tool-contracts', 'catalog.json');
  const evalCatalogPath = path.join(root, 'evals', 'catalog.json');
  const evalRunnerPath = path.join(root, 'scripts', 'tools', 'run-certification-evals.mjs');
  const exportBuilderPath = path.join(root, 'scripts', 'tools', 'build-provider-exports.mjs');

  if (!fs.existsSync(registryPath) && !fs.existsSync(compatibilityRegistryPath)) {
    return {
      ok: false,
      root: normalize(root),
      issueCount: 1,
      issues: ['Missing provider-neutral registry: core/contracts/core-registry.json']
    };
  }

  const committedRegistry = fs.existsSync(registryPath) ? readJson(registryPath) : readJson(compatibilityRegistryPath);
  const generatedRegistry = buildNeutralCoreRegistry(root);
  if (JSON.stringify(committedRegistry, null, 2) !== JSON.stringify(generatedRegistry, null, 2)) {
    issues.push('core/contracts/core-registry.json does not match the generated neutral registry snapshot.');
  }
  if (fs.existsSync(compatibilityRegistryPath) && JSON.stringify(readJson(compatibilityRegistryPath), null, 2) !== JSON.stringify(generatedRegistry, null, 2)) {
    issues.push('contracts/core-registry.json does not match the generated neutral registry snapshot.');
  }

  const capabilities = providerCapabilities(root);
  const providerNames = Array.isArray(capabilities.providers) ? capabilities.providers.map((provider) => provider.name) : [];
  if (!fs.existsSync(providerCapabilitiesPath) && !fs.existsSync(compatibilityProviderCapabilitiesPath)) {
    issues.push('Missing provider capability profile: core/contracts/provider-capabilities.json');
  } else if (providerNames.length === 0) {
    issues.push('provider capability profile must contain a non-empty providers array.');
  } else {
    for (const required of ['openai-codex', 'anthropic-claude', 'qwen-code', 'kimi-k2_5']) {
      if (!providerNames.includes(required)) {
        issues.push(`provider capability profile must include provider ${required}.`);
      }
    }
  }

  if (!fs.existsSync(toolCatalogPath) && !fs.existsSync(compatibilityToolCatalogPath)) {
    issues.push('Missing tool contract catalog: core/contracts/tool-contracts/catalog.json');
  }
  if (!fs.existsSync(evalCatalogPath)) {
    issues.push('Missing certification eval catalog: evals/catalog.json');
  }
  if (!fs.existsSync(evalRunnerPath)) {
    issues.push('Missing certification eval runner: scripts/tools/run-certification-evals.mjs');
  }
  if (!fs.existsSync(exportBuilderPath)) {
    issues.push('Missing provider export builder: scripts/tools/build-provider-exports.mjs');
  }

  const providerDirectories = [
    'openai-codex',
    'anthropic-claude',
    'qwen-code',
    'kimi-k2_5',
    'openai',
    'anthropic',
    'qwen',
    'kimi',
    'codex'
  ];
  const generatedProviderExports = new Map(buildProviderExports(root, {}).map(({ provider, export: exportJson }) => [provider, exportJson]));
  for (const provider of providerDirectories) {
    const readmePath = path.join(root, 'providers', provider, 'README.md');
    const exportPath = path.join(root, 'providers', provider, 'export.json');
    if (!fs.existsSync(readmePath)) {
      issues.push(`Missing provider adapter scaffold: providers/${provider}/README.md`);
    }
    if (!fs.existsSync(exportPath)) {
      issues.push(`Missing provider export artifact: providers/${provider}/export.json`);
      continue;
    }
    const committedExport = readJson(exportPath);
    const providerName = committedExport.canonicalProvider || committedExport.provider || provider;
    const generatedExport = generatedProviderExports.get(providerName);
    if (!generatedExport) {
      issues.push(`No generated provider export is available for ${providerName}.`);
      continue;
    }
    if (JSON.stringify(committedExport, null, 2) !== JSON.stringify(generatedExport, null, 2)) {
      issues.push(`providers/${provider}/export.json does not match the generated provider export.`);
    }
  }

  if (fs.existsSync(evalCatalogPath)) {
    const evalCatalog = readJson(evalCatalogPath);
    if (!Array.isArray(evalCatalog.fixtures) || evalCatalog.fixtures.length === 0) {
      issues.push('evals/catalog.json must declare a non-empty fixtures array.');
    } else {
      for (const fixtureRef of evalCatalog.fixtures) {
        if (typeof fixtureRef !== 'string' || fixtureRef.trim() === '') {
          issues.push('evals/catalog.json fixtures must be non-empty path strings.');
          continue;
        }
        const fixturePath = path.join(root, 'evals', fixtureRef);
        if (!fs.existsSync(fixturePath)) {
          issues.push(`Missing eval fixture: ${fixtureRef}`);
          continue;
        }
        const fixture = readJson(fixturePath);
        if (typeof fixture.id !== 'string' || fixture.id.trim() === '') {
          issues.push(`Eval fixture ${fixtureRef} must declare an id.`);
        }
        if (typeof fixture.kind !== 'string' || fixture.kind.trim() === '') {
          issues.push(`Eval fixture ${fixtureRef} must declare a kind.`);
        }
        if (typeof fixture.target !== 'object' || fixture.target === null || typeof fixture.target.name !== 'string' || fixture.target.name.trim() === '') {
          issues.push(`Eval fixture ${fixtureRef} must declare target.name.`);
        }
      }
    }
  }

  const skillsRootCandidates = [
    path.join(root, 'core', 'skills'),
    path.join(root, 'skills')
  ];
  const skillNames = new Set();
  for (const skillsRoot of skillsRootCandidates) {
    if (!fs.existsSync(skillsRoot)) {
      continue;
    }
    const skillDirectories = fs.readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of skillDirectories) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const frontmatter = parseSkillFrontmatter(fs.readFileSync(skillPath, 'utf8'));
      skillNames.add(entry.name);
      if (frontmatter.name !== entry.name) {
        issues.push(`Skill frontmatter mismatch for ${entry.name}: found ${frontmatter.name || '<missing>'}.`);
      }
      const outputHeadings = readSkillOutputHeadings(skillPath);
      if (!Array.isArray(outputHeadings) || outputHeadings.length === 0) {
        issues.push(`Skill ${entry.name} must declare output headings.`);
      }
    }
  }

  if (committedRegistry.core?.name !== 'agent-workflow-core') {
    issues.push(`core.name must be agent-workflow-core; found ${committedRegistry.core?.name || '<missing>'}.`);
  }
  if (committedRegistry.core?.status !== 'provider-neutral') {
    issues.push(`core.status must be provider-neutral; found ${committedRegistry.core?.status || '<missing>'}.`);
  }
  if (!Array.isArray(committedRegistry.skills) || committedRegistry.skills.length !== skillNames.size) {
    issues.push(`Registry skill count must match the current skill manifests; found ${Array.isArray(committedRegistry.skills) ? committedRegistry.skills.length : 'invalid'} vs ${skillNames.size}.`);
  }
  if (!Array.isArray(committedRegistry.tools) || committedRegistry.tools.length === 0) {
    issues.push('Registry tools must be a non-empty array.');
  }

  issues.push(...validateQwenBoundaryHygiene(root));

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
    if (typeof tool.tool_name !== 'string' || tool.tool_name.trim() === '') {
      issues.push('Tool entry must declare tool_name.');
      continue;
    }
    if (!Array.isArray(tool.providers) || tool.providers.length === 0) {
      issues.push(`Tool ${tool.tool_name} must declare providers.`);
    }
    if (!Array.isArray(tool.routing_hints) || tool.routing_hints.length === 0) {
      issues.push(`Tool ${tool.tool_name} must declare routing_hints.`);
    }
    if (tool.sourcePath && !fs.existsSync(path.join(root, tool.sourcePath))) {
      issues.push(`Tool ${tool.tool_name} sourcePath does not exist: ${tool.sourcePath}`);
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
