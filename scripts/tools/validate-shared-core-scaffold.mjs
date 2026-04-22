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
  'release-narrative-builder',
    'repo-audit',
    'readiness-check',
    'supabase-deployment',
    'migration-planner',
    'research-synthesis',
    'long-document-to-knowledge-asset',
    'secret-boundary-audit'
];

const requiredDocMarkers = new Map([
  [
    'WORKFLOW.md',
    [
      '## Workflow Classes',
      '## Standard Phase Order',
      '## Routing Rules',
      '## Validation Posture',
      '## Stop Conditions',
      '## Handoff And Reporting Expectations'
    ]
  ],
  [
    'docs/governance/source-hierarchy.md',
    [
      '## Authority Order',
      '## Source Classes',
      '## Conflict Handling',
      '## Evidence Versus Authority'
    ]
  ],
  [
    'docs/mcp/policy.md',
    [
      '## MCP Modes',
      '## Non-Authority Rule',
      '## Adapter Requirements',
      '## Fail-Closed Behavior',
      '## Current Implementation Status'
    ]
  ],
  [
    'docs/workflows/README.md',
    [
      '## Objective',
      '## Relationship To WORKFLOW.md',
      '## Canonical Deep-Dive Surfaces',
      '## Workflow-Class Deep Dives',
      '## Maturity Posture'
    ]
  ],
  [
    'README.md',
    [
      '## Phase-7 Authoring Und Adoption Quickstart',
      '## Beispiele, Templates und lokale Repo-Steuerung'
    ]
  ],
  [
    'docs/README.md',
    [
      '## Consumer Onboarding Quickstart',
      '## Authoring Quickstart'
    ]
  ],
  [
    'docs/authoring-guides.md',
    [
      '## Canonical Ownership First',
      '## Skill Authoring',
      '## Workflow/Output/Template Authoring',
      '## Tool Contract Authoring',
      '## Provider Capability And Export Authoring',
      '## Required Validation Gate',
      '## Drift Prevention Rules',
      '## Maturity Posture'
    ]
  ],
  [
    'docs/validation-checklist.md',
    [
      '## Enforced Checks',
      '## Authoring Drift Prevention Checks',
      '## Conditional Checks',
      '## Maturity Posture'
    ]
  ],
  [
    'docs/compatibility.md',
    [
      '## Objective',
      '## Canonical Versus Compatibility Surfaces',
      '## Consumer Adoption Rule',
      '## Bounded Migration And Handoff',
      '## Validator And Export Linkage',
      '## Maturity Posture'
    ]
  ],
  [
    'docs/adoption-playbook.md',
    [
      '## Scope',
      '## Canonical Inputs',
      '## Consumer First-Time Flow',
      '## Canonical Versus Compatibility Rule',
      '## Handoff Checklist',
      '## Maturity Posture'
    ]
  ],
  [
    'docs/consumer-rollout-playbook.md',
    [
      '## Scope',
      '## Rollout Flow',
      '## Compatibility Governance During Rollout',
      '## Handoff Evidence',
      '## Maturity Posture'
    ]
  ],
  [
    'contracts/README.md',
    [
      '## Current Surfaces',
      '## Compatibility Rules',
      '## Consumer Adoption Rule',
      '## Required Build And Validation Gate'
    ]
  ],
  [
    'providers/README.md',
    [
      '## Canonical Rule',
      '## Current Provider Scaffolds',
      '## Generated Exports',
      '## Compatibility Governance'
    ]
  ],
  [
    'core/contracts/README.md',
    [
      '## Canonical Files',
      '## Safe Extension Flow',
      '## Compatibility Rule',
      '## Maturity Posture'
    ]
  ],
  [
    'core/skills/README.md',
    [
      '## Canonical Skills',
      '## Safe Extension Flow',
      '## Compatibility Rule',
      '## Maturity Posture'
    ]
  ],
  [
    'templates/codex-workflow/README.md',
    [
      '## Objective',
      '## Canonical Contract Links',
      '## Template Map',
      '## Safe Extension Steps',
      '## Maturity Posture'
    ]
  ],
  [
    'examples/codex-workflow/README.md',
    [
      '## Objective',
      '## Example Map',
      '## Portability Posture',
      '## Safe Extension Steps',
      '## Maturity Posture'
    ]
  ]
]);

function resolveCoreRoot(baseRoot) {
  const directPackageJson = path.join(baseRoot, 'package.json');
  try {
    if (fs.existsSync(directPackageJson)) {
      const packageJson = readJson(directPackageJson);
      if (packageJson.name === 'model-agnostic-workflow-system') {
        return baseRoot;
      }
    }
  } catch {
    // Fall through to the nested-scaffold lookup.
  }

  const nestedRoot = path.join(baseRoot, 'model-agnostic-workflow-system');
  return nestedRoot;
}

export function validateSharedCoreScaffold(baseRoot = repoRoot()) {
  const root = resolveCoreRoot(baseRoot);
  const issues = [];

  const requiredFiles = [
    'README.md',
    'WORKFLOW.md',
    'package.json',
    'CHANGELOG.md',
    'core/README.md',
    'core/contracts/README.md',
    'core/contracts/portable-skill-manifest.json',
    'core/contracts/output-contracts.json',
    'core/contracts/tool-contracts/catalog.json',
    'core/contracts/provider-capabilities.json',
    'core/contracts/core-registry.json',
    'core/contracts/workflow-routing-map.json',
    'core/evals/README.md',
    'core/overlays/README.md',
    'core/skills/README.md',
    'docs/overview.md',
    'docs/usage.md',
    'docs/architecture.md',
    'docs/governance/source-hierarchy.md',
    'docs/mcp/policy.md',
    'docs/workflows/README.md',
    'docs/workflows/implementation-and-handoff.md',
    'docs/workflows/verification-and-certification.md',
    'docs/secret-handling.md',
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
    'providers/openai-codex/README.md',
    'providers/openai-codex/export.json',
    'providers/anthropic-claude/README.md',
    'providers/anthropic-claude/export.json',
    'providers/qwen-code/README.md',
    'providers/qwen-code/export.json',
    'providers/kimi-k2_5/README.md',
    'providers/kimi-k2_5/export.json',
    'providers/openai/README.md',
    'providers/openai/export.json',
    'providers/anthropic/README.md',
    'providers/anthropic/export.json',
    'providers/qwen/README.md',
    'providers/qwen/export.json',
    'providers/kimi/README.md',
    'providers/kimi/export.json',
    'providers/codex/README.md',
    'providers/codex/export.json',
    'policies/secret-classes.yaml',
    'policies/tool-capabilities.yaml',
    'scripts/tools/_shared.mjs',
    'scripts/tools/build-neutral-core-registry.mjs',
    'scripts/tools/repo-structure-scanner.mjs',
    'scripts/tools/git-diff-explainer.mjs',
    'scripts/tools/spec-compliance-checker.mjs',
    'scripts/tools/approval-gated-write-executor.mjs',
    'scripts/tools/validate-provider-neutral-core.mjs',
    'scripts/tools/validate-secret-boundaries.mjs',
    'scripts/tools/scan-secrets.mjs',
    'scripts/tools/validate-repo-surface.mjs',
    'scripts/tools/validate-local-input-contract.mjs',
    'scripts/tools/validate-runtime-policy-input-contract.mjs',
    'scripts/tools/validate-shared-core-scaffold.mjs',
    'templates/codex-workflow/task-packet-template.md',
    'templates/codex-workflow/review-summary-template.md',
    'templates/codex-workflow/handoff-summary-template.md',
    'templates/codex-workflow/README.md',
    'templates/codex-workflow/tool-contract-template.json',
    'templates/codex-workflow/validation-checklist-template.md',
    'examples/codex-workflow/planning-slice-example.md',
    'examples/codex-workflow/review-summary-example.md',
    'examples/codex-workflow/handoff-summary-example.md',
    'examples/codex-workflow/README.md',
    'examples/codex-workflow/tool-contract-example.json'
  ];

  const requiredDirs = [
    'core',
    'core/contracts',
    'core/contracts/tool-contracts',
    'core/evals',
    'core/overlays',
    'core/skills',
    'docs',
    'docs/governance',
    'docs/mcp',
    'docs/workflows',
    'contracts',
    'policies',
    'skills',
    'scripts/tools',
    'providers',
    'providers/openai-codex',
    'providers/anthropic-claude',
    'providers/qwen-code',
    'providers/kimi-k2_5',
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

  for (const [relativePath, markers] of requiredDocMarkers.entries()) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const marker of markers) {
      if (!content.includes(marker)) {
        issues.push(`${relativePath} is missing required section ${marker}.`);
      }
    }
  }

  try {
    const packageJson = readJson(path.join(root, 'package.json'));
    if (packageJson.name !== 'model-agnostic-workflow-system') {
      issues.push(`package.json name must be model-agnostic-workflow-system; found ${packageJson.name || '<missing>'}.`);
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
    const catalogCandidates = [
      path.join(root, 'core', 'contracts', 'tool-contracts', 'catalog.json'),
      path.join(root, 'docs', 'tool-contracts', 'catalog.json')
    ];
    const catalogPath = catalogCandidates.find((candidate) => fs.existsSync(candidate));
    if (!catalogPath) {
      issues.push('Shared-core tool catalog is missing.');
    } else {
      const catalog = readJson(catalogPath);
      if (!Array.isArray(catalog.tools) || catalog.tools.length === 0) {
        issues.push('Shared-core tool catalog must contain at least one tool.');
      } else {
        for (const tool of catalog.tools) {
          const normalizedName = tool.tool_name || tool.name;
          if (!normalizedName) {
            issues.push('Shared-core tool entry is missing tool_name or name.');
          }
          const normalizedFields = ['tool_name', 'intent_class', 'schema', 'side_effects', 'approval_required', 'mcp_compatible', 'providers', 'routing_hints'];
          const legacyFields = ['name', 'purpose', 'inputs', 'outputs', 'sideEffects', 'approvalRequirement', 'failureBehavior', 'exampleInvocation', 'implementationStatus'];
          const requiredFields = catalogPath.includes(path.join('core', 'contracts')) ? normalizedFields : legacyFields;
          for (const key of requiredFields) {
            if (tool[key] == null) {
              issues.push(`Shared-core tool ${normalizedName || '<unnamed>'} is missing required field ${key}.`);
            }
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
      if (mapping.sharedCoreRoot !== 'model-agnostic-workflow-system') {
        issues.push(`shared-core-map sharedCoreRoot must be model-agnostic-workflow-system; found ${mapping.sharedCoreRoot || '<missing>'}.`);
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
  const skillRoots = [
    path.join(root, 'core', 'skills'),
    path.join(root, 'skills')
  ];
  for (const skillsRoot of skillRoots) {
    if (!fs.existsSync(skillsRoot)) {
      continue;
    }
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        issues.push(`Missing skill manifest: ${path.relative(root, skillPath).replace(/\\/g, '/')}`);
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
        issues.push(`Shared skill name mismatch in ${path.relative(root, skillPath).replace(/\\/g, '/')}: expected ${entry.name}, found ${fields.name || '<missing>'}.`);
      }
      if (fields.owner !== 'model-agnostic-workflow-system') {
        issues.push(`Shared skill ${entry.name} must declare owner model-agnostic-workflow-system.`);
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
        if (typeof fields.input_contract_path !== 'string' && typeof fields.output_contract_path !== 'string') {
          // no-op: core portable skills use explicit contract path fields in the frontmatter, but legacy contract-bound skills need input contract paths.
        }
        if (!content.includes('## Local Inputs') && entry.name !== 'repo-audit') {
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
      if (path.relative(root, skillPath).startsWith(path.join('core', 'skills'))) {
        for (const marker of ['## Tool Requirements', '## Approval Mode', '## Provider Projections', '## Eval Scaffolding']) {
          if (!content.includes(marker)) {
            issues.push(`Portable core skill ${entry.name} is missing required section ${marker}.`);
          }
        }
      }
      for (const marker of requiredSkillSections) {
        if (!content.includes(marker)) {
          issues.push(`Shared skill ${entry.name} is missing required section ${marker}.`);
        }
      }
    }
  }

  for (const expected of requiredSkills) {
    if (!fs.existsSync(path.join(root, 'skills', expected, 'SKILL.md'))) {
    const existsInCore = fs.existsSync(path.join(root, 'core', 'skills', expected, 'SKILL.md'));
    const existsInLegacy = fs.existsSync(path.join(root, 'skills', expected, 'SKILL.md'));
    if (!existsInCore && !existsInLegacy) {
      issues.push(`Missing shared skill manifest: ${expected}/SKILL.md`);
    }
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
