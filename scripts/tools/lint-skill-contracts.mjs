#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFilesRecursive, parseSkillFrontmatter, repoRoot } from './_shared.mjs';

const REQUIRED_FIELDS = [
  'name',
  'description',
  'version',
  'classification',
  'requires_repo_inputs',
  'produces_structured_output',
  'safe_to_auto_run',
  'owner',
  'status'
];

const REQUIRED_SECTIONS = [
  '## Trigger',
  '## When Not To Use',
  '## Workflow',
  '## Output',
  '## Quality Checks'
];

const CORE_REQUIRED_SECTIONS = [
  '## Tool Requirements',
  '## Approval Mode',
  '## Provider Projections',
  '## Eval Scaffolding'
];

const INPUT_SECTION_ALTERNATIVES = [
  '## Required Inputs',
  '## Local Inputs',
  '## Expected Inputs'
];

const OVERLAP_SECTION_ALTERNATIVES = [
  '## Nearest Sibling Skills',
  '## Boundary Differentiation',
  '## Non-Goals'
];

const DEFAULTS = {
  includeAgents: false,
  strictCoreWarnings: false,
  json: false
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--include-agents') {
      args.includeAgents = true;
    } else if (value === '--strict-core-warnings') {
      args.strictCoreWarnings = true;
    } else if (value === '--json') {
      args.json = true;
    }
  }
  return args;
}

function collectSkillFiles(root, includeAgents) {
  const roots = [
    path.join(root, 'core', 'skills'),
    path.join(root, 'skills')
  ];
  if (includeAgents) {
    roots.push(path.join(root, '.agents', 'skills'));
  }

  const files = [];
  for (const skillRoot of roots) {
    if (!fs.existsSync(skillRoot)) continue;
    files.push(...listFilesRecursive(
      skillRoot,
      (_fullPath, relativePath) => relativePath.endsWith('/SKILL.md') || relativePath === 'SKILL.md',
      root
    ));
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function hasSection(content, sectionHeading) {
  return content.includes(sectionHeading);
}

function pushFinding(findings, relativePath, severity, code, message, suggestedFix) {
  findings.push({
    file: relativePath,
    severity,
    code,
    message,
    suggestedFix
  });
}

function lintSkillFile(root, file, options) {
  const findings = [];
  const relativePath = file.relativePath;
  const content = fs.readFileSync(file.fullPath, 'utf8');
  const isCoreSkill = relativePath.startsWith('core/skills/');

  let frontmatter = null;
  try {
    frontmatter = parseSkillFrontmatter(content);
  } catch (error) {
    pushFinding(
      findings,
      relativePath,
      'error',
      'frontmatter.missing_or_invalid',
      `Missing or invalid YAML frontmatter: ${error.message}`,
      'Add valid frontmatter with required canonical fields.'
    );
    return findings;
  }

  for (const field of REQUIRED_FIELDS) {
    if (frontmatter[field] == null || frontmatter[field] === '') {
      pushFinding(
        findings,
        relativePath,
        'error',
        'frontmatter.required_field_missing',
        `Missing required frontmatter field "${field}".`,
        `Add "${field}" to frontmatter with a non-empty value.`
      );
    }
  }

  const expectedName = path.basename(path.dirname(file.fullPath));
  if (frontmatter.name && frontmatter.name !== expectedName) {
    pushFinding(
      findings,
      relativePath,
      'error',
      'frontmatter.name_mismatch',
      `Frontmatter name "${frontmatter.name}" does not match directory "${expectedName}".`,
      `Set frontmatter name to "${expectedName}" or rename the skill directory.`
    );
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(content, section)) {
      pushFinding(
        findings,
        relativePath,
        'error',
        'section.required_missing',
        `Missing required section "${section}".`,
        `Add section heading "${section}" with bounded content.`
      );
    }
  }

  if (isCoreSkill) {
    for (const section of CORE_REQUIRED_SECTIONS) {
      if (!hasSection(content, section)) {
        pushFinding(
          findings,
          relativePath,
          'error',
          'section.core_required_missing',
          `Portable core skill is missing required section "${section}".`,
          `Add "${section}" to align with portable-core contract shape.`
        );
      }
    }
  }

  const hasPurpose = hasSection(content, '## Purpose');
  if (!hasPurpose) {
    pushFinding(
      findings,
      relativePath,
      isCoreSkill && options.strictCoreWarnings ? 'error' : 'warning',
      'section.purpose_missing',
      'Missing recommended section "## Purpose".',
      'Add "## Purpose" to make intent explicit and reduce routing ambiguity.'
    );
  }

  const hasInputSection = INPUT_SECTION_ALTERNATIVES.some((section) => hasSection(content, section));
  if (!hasInputSection) {
    pushFinding(
      findings,
      relativePath,
      isCoreSkill && options.strictCoreWarnings ? 'error' : 'warning',
      'section.inputs_missing',
      'Missing recommended input section (Required Inputs / Local Inputs / Expected Inputs).',
      'Add one input section that states required source evidence explicitly.'
    );
  }

  const hasOverlapSection = OVERLAP_SECTION_ALTERNATIVES.some((section) => hasSection(content, section));
  if (!hasOverlapSection) {
    pushFinding(
      findings,
      relativePath,
      isCoreSkill && options.strictCoreWarnings ? 'error' : 'warning',
      'section.overlap_clarity_missing',
      'Missing overlap clarity section (Nearest Sibling Skills / Boundary Differentiation / Non-Goals).',
      'Add a boundary/overlap section to reduce sibling ambiguity.'
    );
  }

  return findings;
}

function lintSkillContracts(baseRoot = repoRoot(), options = DEFAULTS) {
  const files = collectSkillFiles(baseRoot, options.includeAgents);
  const findings = [];
  for (const file of files) {
    findings.push(...lintSkillFile(baseRoot, file, options));
  }

  const errors = findings.filter((entry) => entry.severity === 'error');
  const warnings = findings.filter((entry) => entry.severity === 'warning');

  return {
    ok: errors.length === 0,
    root: path.resolve(baseRoot).replace(/\\/g, '/'),
    scope: options.includeAgents ? ['core/skills', 'skills', '.agents/skills'] : ['core/skills', 'skills'],
    filesChecked: files.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    findings
  };
}

function printReport(report) {
  console.log('# Skill Contract Lint');
  console.log('');
  console.log(`- root: ${report.root}`);
  console.log(`- scope: ${report.scope.join(', ')}`);
  console.log(`- files checked: ${report.filesChecked}`);
  console.log(`- errors: ${report.errorCount}`);
  console.log(`- warnings: ${report.warningCount}`);
  console.log('');
  if (report.findings.length === 0) {
    console.log('No lint findings.');
    return;
  }
  console.log('## Findings');
  for (const finding of report.findings) {
    console.log(`- [${finding.severity}] ${finding.file} (${finding.code})`);
    console.log(`  ${finding.message}`);
    console.log(`  fix: ${finding.suggestedFix}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const report = lintSkillContracts(repoRoot(), args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  process.exit(report.ok ? 0 : 1);
}

export { lintSkillContracts };
