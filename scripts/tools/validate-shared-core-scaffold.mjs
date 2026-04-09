#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFrontmatter, readJson, repoRoot } from './_shared.mjs';

const allowedClassifications = new Set(['shared', 'shared-with-local-inputs', 'local-only', 'contract-only', 'deferred']);
const requiredSkillSections = ['## Trigger', '## When Not To Use', '## Workflow', '## Output', '## Quality Checks'];
const requiredSkillFields = ['name', 'description', 'version', 'classification', 'requires_repo_inputs', 'produces_structured_output', 'safe_to_auto_run', 'owner', 'status'];
const requiredSkills = [
  'repo-intake-sot-mapper',
  'runtime-policy-auditor',
  'planning-slice-builder',
  'implementation-contract-extractor',
  'test-matrix-builder',
  'post-implementation-review-writer',
  'patch-strategy-designer',
  'failure-mode-enumerator',
  'release-narrative-builder'
];

function resolveCoreRoot(baseRoot) {
  const directPackageJson = path.join(baseRoot, 'package.json');
  try {
    if (fs.existsSync(directPackageJson)) {
      const packageJson = readJson(directPackageJson);
      if (packageJson.name === 'codex-workflow-core') {
        return baseRoot;
      }
    }
  } catch {
    // Fall through to the nested-scaffold lookup.
  }

  const nestedRoot = path.join(baseRoot, 'codex-workflow-core');
  return nestedRoot;
}

export function validateSharedCoreScaffold(baseRoot = repoRoot()) {
  const root = resolveCoreRoot(baseRoot);
  const issues = [];

  const requiredFiles = [
    'README.md',
    'package.json',
    'CHANGELOG.md',
    'docs/overview.md',
    'docs/usage.md',
    'docs/architecture.md',
    'docs/compatibility.md',
    'docs/adoption-playbook.md',
    'docs/repo-overlay-contract.md',
    'docs/extraction-roadmap.md',
    'docs/validation-checklist.md',
    'docs/consumer-rollout-playbook.md',
    'docs/lock-model.md',
    'docs/maintainer-commands.md',
    'docs/shared-with-local-inputs.md',
    'docs/repo-intake-skill-contract.md',
    'docs/runtime-policy-skill-contract.md',
    'docs/tool-contracts/catalog.json',
    'contracts/README.md',
    'contracts/core-registry.json',
    'contracts/provider-capabilities.json',
    'providers/README.md',
    'providers/openai/README.md',
    'providers/anthropic/README.md',
    'providers/qwen/README.md',
    'providers/kimi/README.md',
    'providers/codex/README.md',
    'scripts/tools/_shared.mjs',
    'scripts/tools/build-neutral-core-registry.mjs',
    'scripts/tools/repo-structure-scanner.mjs',
    'scripts/tools/git-diff-explainer.mjs',
    'scripts/tools/spec-compliance-checker.mjs',
    'scripts/tools/approval-gated-write-executor.mjs',
    'scripts/tools/validate-provider-neutral-core.mjs',
    'scripts/tools/validate-repo-surface.mjs',
    'scripts/tools/validate-local-input-contract.mjs',
    'scripts/tools/validate-runtime-policy-input-contract.mjs',
    'scripts/tools/validate-shared-core-scaffold.mjs',
    'templates/codex-workflow/task-packet-template.md',
    'templates/codex-workflow/review-summary-template.md',
    'templates/codex-workflow/tool-contract-template.json',
    'templates/codex-workflow/validation-checklist-template.md',
    'examples/codex-workflow/planning-slice-example.md',
    'examples/codex-workflow/review-summary-example.md',
    'examples/codex-workflow/tool-contract-example.json'
  ];

  const requiredDirs = [
    'docs',
    'contracts',
    'skills',
    'scripts/tools',
    'providers',
    'providers/openai',
    'providers/anthropic',
    'providers/qwen',
    'providers/kimi',
    'providers/codex',
    'templates/codex-workflow',
    'examples/codex-workflow'
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(root, file))) {
      issues.push(`Missing required file: ${file}`);
    }
  }
  for (const dir of requiredDirs) {
    if (!fs.existsSync(path.join(root, dir))) {
      issues.push(`Missing required directory: ${dir}`);
    }
  }

  try {
    const packageJson = readJson(path.join(root, 'package.json'));
    if (packageJson.name !== 'codex-workflow-core') {
      issues.push(`package.json name must be codex-workflow-core; found ${packageJson.name || '<missing>'}.`);
    }
    if (packageJson.type !== 'module') {
      issues.push('package.json type must be module.');
    }
    if (!packageJson.scripts || !packageJson.scripts.validate) {
      issues.push('package.json must define a validate script.');
    }
  } catch (error) {
    issues.push(`Shared-core package.json parse failed: ${error.message}`);
  }

  try {
    const catalog = readJson(path.join(root, 'docs', 'tool-contracts', 'catalog.json'));
    if (!Array.isArray(catalog.tools) || catalog.tools.length !== 16) {
      issues.push(`Shared-core tool catalog must contain 16 tools; found ${Array.isArray(catalog.tools) ? catalog.tools.length : 'invalid'}.`);
    } else {
      for (const tool of catalog.tools) {
        for (const key of ['name', 'purpose', 'inputs', 'outputs', 'sideEffects', 'approvalRequirement', 'failureBehavior', 'exampleInvocation', 'implementationStatus']) {
          if (tool[key] == null) {
            issues.push(`Shared-core tool ${tool.name || '<unnamed>'} is missing required field ${key}.`);
          }
        }
      }
    }
  } catch (error) {
    issues.push(`Shared-core tool catalog parse failed: ${error.message}`);
  }

  const mapPath = path.join(baseRoot, '.codex', 'shared-core-map.json');
  if (fs.existsSync(mapPath)) {
    try {
      const mapping = readJson(mapPath);
      if (mapping.sharedCoreRoot !== 'codex-workflow-core') {
        issues.push(`shared-core-map sharedCoreRoot must be codex-workflow-core; found ${mapping.sharedCoreRoot || '<missing>'}.`);
      }
      if (!Array.isArray(mapping.assets) || mapping.assets.length === 0) {
        issues.push('shared-core-map assets must be a non-empty array.');
      } else {
        for (const asset of mapping.assets) {
          for (const key of ['assetPath', 'currentRole', 'classification', 'migrationStatus', 'targetPath', 'notes']) {
            if (asset[key] == null || asset[key] === '') {
              issues.push(`shared-core-map entry is missing ${key}.`);
            }
          }
          if (!allowedClassifications.has(asset.classification)) {
            issues.push(`shared-core-map entry ${asset.assetPath || '<unnamed>'} has invalid classification ${asset.classification}.`);
          }
        }
      }
    } catch (error) {
      issues.push(`shared-core-map parse failed: ${error.message}`);
    }
  }

  let skillCount = 0;
  for (const entry of fs.existsSync(path.join(root, 'skills')) ? fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(root, 'skills', entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      issues.push(`Missing skill manifest: skills/${entry.name}/SKILL.md`);
      continue;
    }
    skillCount += 1;
    const content = fs.readFileSync(skillPath, 'utf8');
    const fields = parseSkillFrontmatter(content);
    for (const field of requiredSkillFields) {
      if (fields[field] == null || fields[field] === '') {
        issues.push(`Shared skill ${entry.name} is missing required field ${field}.`);
      }
    }
    if (fields.name !== entry.name) {
      issues.push(`Shared skill name mismatch in skills/${entry.name}/SKILL.md: expected ${entry.name}, found ${fields.name || '<missing>'}.`);
    }
    if (fields.owner !== 'codex-workflow-core') {
      issues.push(`Shared skill ${entry.name} must declare owner codex-workflow-core.`);
    }
    if (fields.status !== 'extracted') {
      issues.push(`Shared skill ${entry.name} must declare status extracted.`);
    }
    if (!allowedClassifications.has(fields.classification)) {
      issues.push(`Shared skill ${entry.name} has invalid classification ${fields.classification}.`);
    }
    if (fields.classification === 'shared-with-local-inputs') {
      if (fields.requires_repo_inputs !== true) {
        issues.push(`Shared skill ${entry.name} must set requires_repo_inputs to true.`);
      }
      if (typeof fields.input_contract_path !== 'string' || fields.input_contract_path.trim() === '') {
        issues.push(`Shared skill ${entry.name} must declare input_contract_path.`);
      }
      if (!content.includes('## Local Inputs')) {
        issues.push(`Shared skill ${entry.name} must include a ## Local Inputs section.`);
      }
    }
    if (entry.name === 'repo-intake-sot-mapper' && fields.input_contract_path !== '.codex/repo-intake-inputs.json') {
      issues.push('Shared skill repo-intake-sot-mapper must declare input_contract_path as .codex/repo-intake-inputs.json.');
    }
    if (entry.name === 'runtime-policy-auditor') {
      if (fields.input_contract_path !== '.codex/runtime-policy-inputs.json') {
        issues.push('Shared skill runtime-policy-auditor must declare input_contract_path as .codex/runtime-policy-inputs.json.');
      }
      if (!content.includes('## Non-Goals')) {
        issues.push('Shared skill runtime-policy-auditor must include a ## Non-Goals section.');
      }
    }
    for (const marker of requiredSkillSections) {
      if (!content.includes(marker)) {
        issues.push(`Shared skill ${entry.name} is missing required section ${marker}.`);
      }
    }
  }

  for (const expected of requiredSkills) {
    if (!fs.existsSync(path.join(root, 'skills', expected, 'SKILL.md'))) {
      issues.push(`Missing shared skill manifest: skills/${expected}/SKILL.md`);
    }
  }

  if (skillCount === 0) {
    issues.push('Shared core must contain at least one skill.');
  }

  return {
    ok: issues.length === 0,
    root,
    issueCount: issues.length,
    issues
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = validateSharedCoreScaffold();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
