#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFrontmatter, readJson, repoRoot } from './_shared.mjs';

const DEFAULT_OUT = path.join('contracts', 'core-registry.json');

function parseArgs(argv) {
  const args = {
    write: false,
    out: DEFAULT_OUT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') {
      args.write = true;
      continue;
    }
    if (value === '--out' && argv[index + 1]) {
      args.out = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function extractOutputHeadings(skillText) {
  const lines = skillText.split(/\r?\n/);
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
    if (!inOutput) {
      continue;
    }

    const match = line.match(/^-\s+`([^`]+)`\s*$/);
    if (match) {
      headings.push(match[1]);
      continue;
    }

    const plain = line.match(/^-\s+(.+)$/);
    if (plain) {
      headings.push(plain[1].replace(/^`|`$/g, ''));
    }
  }

  return headings;
}

function buildProviderCompatibility(providers) {
  const compatibility = {};
  for (const provider of providers) {
    compatibility[provider.name] = provider.name === 'codex' ? 'compatibility-export' : 'adapter';
  }
  return compatibility;
}

function buildSkillRecords(root, providerNames) {
  const skillsRoot = path.join(root, 'skills');
  const entries = fs.existsSync(skillsRoot) ? fs.readdirSync(skillsRoot, { withFileTypes: true }) : [];
  const records = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    const text = fs.readFileSync(skillPath, 'utf8');
    const frontmatter = parseSkillFrontmatter(text);
    const outputHeadings = extractOutputHeadings(text);

    records.push({
      name: frontmatter.name || entry.name,
      sourcePath: `skills/${entry.name}/SKILL.md`,
      classification: frontmatter.classification || 'unknown',
      requiresRepoInputs: frontmatter.requires_repo_inputs === true,
      producesStructuredOutput: frontmatter.produces_structured_output === true,
      safeToAutoRun: frontmatter.safe_to_auto_run === true,
      status: frontmatter.status || 'unknown',
      approvalMode: frontmatter.safe_to_auto_run === true ? 'read-only' : 'approval-required',
      subagentPolicy: frontmatter.classification === 'shared-with-local-inputs' ? 'forbid' : 'allow',
      requiredTools: [],
      optionalTools: [],
      outputHeadings,
      providerCompatibility: buildProviderCompatibility(providerNames.map((name) => ({ name })))
    });
  }

  return records.sort((left, right) => left.name.localeCompare(right.name));
}

function buildToolRecords(root, providerNames) {
  const catalog = readJson(path.join(root, 'docs', 'tool-contracts', 'catalog.json'));
  const tools = Array.isArray(catalog.tools) ? catalog.tools : [];

  return tools.map((tool) => ({
    name: tool.name,
    purpose: tool.purpose,
    inputs: tool.inputs,
    outputs: tool.outputs,
    sideEffects: tool.sideEffects,
    approvalRequirement: tool.approvalRequirement,
    failureBehavior: tool.failureBehavior,
    exampleInvocation: tool.exampleInvocation,
    implementationStatus: tool.implementationStatus,
    sourcePath: tool.entrypoint || null,
    providerCompatibility: buildProviderCompatibility(providerNames.map((name) => ({ name })))
  }));
}

function buildNeutralCoreRegistry(baseRoot = repoRoot()) {
  const root = baseRoot;
  const providerCapabilities = readJson(path.join(root, 'contracts', 'provider-capabilities.json'));
  const providers = Array.isArray(providerCapabilities.providers) ? providerCapabilities.providers : [];
  const providerNames = providers.map((provider) => provider.name);

  return {
    schemaVersion: '1.0.0',
    core: {
      name: 'agent-workflow-core',
      status: 'provider-neutral',
      sourcePackage: {
        name: 'codex-workflow-core',
        version: readJson(path.join(root, 'package.json')).version
      },
      compatibilityExports: [
        {
          provider: 'codex',
          packageName: 'codex-workflow-core',
          manifestPath: '.codex-plugin/plugin.json',
          status: 'compatibility-export'
        }
      ]
    },
    skills: buildSkillRecords(root, providerNames),
    tools: buildToolRecords(root, providerNames),
    providers
  };
}

function writeRegistry(root, outPath, registry) {
  const absoluteOutPath = path.join(root, outPath);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return absoluteOutPath;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const registry = buildNeutralCoreRegistry();
  if (args.write) {
    const outPath = writeRegistry(repoRoot(), args.out, registry);
    console.log(JSON.stringify({ ok: true, written: normalize(outPath) }, null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify(registry, null, 2));
}

export { buildNeutralCoreRegistry };
