#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './_shared.mjs';

const OVERLAY_DIR = 'wiki-overlay';

const REQUIRED_FRONTMATTER_FIELDS = [
  'zone',
  'authority',
  'source_path',
  'llm_processing',
  'summary_allowed',
  'wiki_allowed',
  'copy_policy',
  'privacy',
  'status'
];

const STANDARD_FRONTMATTER_FIELDS = [
  ...REQUIRED_FRONTMATTER_FIELDS,
  'maturity',
  'canonical_source',
  'review_gate',
  'notes',
  'generated_at',
  'overlay_spec_version'
];

const FIELD_ENUMS = {
  zone: [
    'canonical-source',
    'operational-playbook',
    'derived-knowledge',
    'compatibility-mirror',
    'generated-output',
    'template-source',
    'runtime-evidence',
    'private-or-local',
    'project-import',
    'archive-reference',
    'exclude-from-llm-context',
    'needs-human-review'
  ],
  authority: [
    'canonical',
    'operational',
    'derived',
    'archive',
    'compatibility',
    'generated',
    'local-only',
    'private',
    'mixed',
    'unknown',
    'portable',
    'template',
    'example',
    'advisory',
    'mirror',
    'validator-backed',
    'implementation',
    'enforced',
    'canonical-linked',
    'project-import'
  ],
  llm_processing: ['yes', 'no', 'review-only'],
  summary_allowed: ['yes', 'no', 'review-only'],
  wiki_allowed: ['yes', 'no', 'pointer-only', 'review-only'],
  copy_policy: ['pointer-only', 'metadata-only', 'no-copy', 'redacted-summary-only'],
  privacy: ['public', 'internal', 'private', 'local', 'review', 'mixed'],
  maturity: ['prose-governed', 'contract-backed', 'validator-backed', 'runtime-implemented', 'not-claimed'],
  status: ['active', 'proposed', 'review-only', 'excluded', 'archived', 'draft'],
  review_gate: ['none', 'human-review-required', 'exclusion-lock', 'owner-approval-required']
};

const HARD_EXCLUSION_PATTERNS = [
  { id: '.git', regex: /(^|[`'"\s])\.git\/([`'"\s]|$)/ },
  { id: '.codex', regex: /(^|[`'"\s])\.codex\/([`'"\s]|$)/ },
  { id: '.env', regex: /(^|[`'"\s])\.env(\*|[.\w-]*)([`'"\s]|$)/ },
  { id: 'memory', regex: /(^|[`'"\s])memory\/([`'"\s]|scopes\/|stores\/|$)/ },
  { id: 'runtime-runs', regex: /(^|[`'"\s])artifacts\/runtime-runs\/([`'"\s]|$)/ },
  { id: 'private-logs', regex: /\bprivate logs?\b/i },
  { id: 'secret-near', regex: /\b(secret|token|credential|private keys?)\b/i }
];

const HARD_EXCLUSION_LOCK_MARKERS = [
  'exclude',
  'excluded',
  'exclusion',
  'ausgeschlossen',
  'no-copy',
  'no',
  'not',
  'nicht',
  'keine',
  'nur',
  'never',
  'verboten',
  'gesperrt',
  'locked',
  'default',
  'review-only',
  'review',
  'review-gated',
  'human-review-required',
  'owner-approval-required',
  'exclusion-lock',
  'default locked',
  'redacted',
  'redigierte',
  'freigabe',
  'pruef',
  'prüf',
  'fail-closed',
  'stoppe',
  'risiko',
  'scope-matrix'
];

const POINTER_POLICY_MARKERS = [
  'pointer',
  'pointer-only',
  'metadata',
  'metadata-only',
  'no-copy',
  'non-canonical',
  'not copied',
  'not copied',
  'nicht kopieren',
  'keine',
  'no json copy',
  'json not copied',
  'never copied',
  'only',
  'evidence',
  'test data'
];

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function parseArgs(argv) {
  const args = {
    json: false,
    hardExclusionsOnly: false
  };
  for (const arg of argv) {
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--hard-exclusions-only') {
      args.hardExclusionsOnly = true;
    }
  }
  return args;
}

function collectOverlayMarkdownFiles(root) {
  const overlayRoot = path.join(root, OVERLAY_DIR);
  if (!fs.existsSync(overlayRoot)) {
    return [];
  }
  return fs.readdirSync(overlayRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const relativePath = `${OVERLAY_DIR}/${entry.name}`;
      return {
        relativePath,
        fullPath: path.join(root, relativePath)
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('Missing YAML frontmatter block.');
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator === -1) {
      throw new Error(`Invalid frontmatter line: ${trimmed}`);
    }
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    fields[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return fields;
}

function pushFinding(findings, file, severity, code, message, suggestedFix) {
  findings.push({
    file,
    severity,
    code,
    message,
    suggestedFix
  });
}

function hasAnyMarker(line, markers) {
  const lower = line.toLowerCase();
  return markers.some((marker) => lower.includes(marker));
}

function validateFrontmatter(file, content, findings) {
  let frontmatter;
  try {
    frontmatter = parseFrontmatter(content);
  } catch (error) {
    pushFinding(
      findings,
      file.relativePath,
      'error',
      'frontmatter.missing_or_invalid',
      `Missing or invalid overlay frontmatter: ${error.message}`,
      'Add a YAML frontmatter block using wiki-overlay/frontmatter-schema.md.'
    );
    return;
  }

  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (!frontmatter[field]) {
      pushFinding(
        findings,
        file.relativePath,
        'error',
        'frontmatter.required_field_missing',
        `Missing required frontmatter field "${field}".`,
        `Add "${field}" using wiki-overlay/frontmatter-schema.md defaults.`
      );
    }
  }

  for (const field of STANDARD_FRONTMATTER_FIELDS) {
    if (!frontmatter[field]) {
      pushFinding(
        findings,
        file.relativePath,
        'warning',
        'frontmatter.standard_field_missing',
        `Missing standard overlay frontmatter field "${field}".`,
        `Add "${field}" for consistent overlay metadata.`
      );
    }
  }

  for (const [field, allowedValues] of Object.entries(FIELD_ENUMS)) {
    const value = frontmatter[field];
    if (value && !allowedValues.includes(value)) {
      pushFinding(
        findings,
        file.relativePath,
        'error',
        'frontmatter.enum_invalid',
        `Invalid value "${value}" for "${field}".`,
        `Use one of: ${allowedValues.join(', ')}.`
      );
    }
  }

  if (frontmatter.source_path && normalizePath(frontmatter.source_path) !== file.relativePath) {
    pushFinding(
      findings,
      file.relativePath,
      'error',
      'frontmatter.source_path_mismatch',
      `source_path "${frontmatter.source_path}" does not match "${file.relativePath}".`,
      `Set source_path to "${file.relativePath}".`
    );
  }

  if (frontmatter.generated_at && Number.isNaN(Date.parse(frontmatter.generated_at))) {
    pushFinding(
      findings,
      file.relativePath,
      'error',
      'frontmatter.generated_at_invalid',
      `generated_at "${frontmatter.generated_at}" is not parseable as an ISO timestamp.`,
      'Use an ISO8601 timestamp.'
    );
  }
}

function validateOverlayDisclaimer(file, content, findings) {
  const requiredSnippets = [
    'non-migrating overlay',
    'no original file edits',
    'pointer-only'
  ];
  for (const snippet of requiredSnippets) {
    if (!content.toLowerCase().includes(snippet)) {
      pushFinding(
        findings,
        file.relativePath,
        'error',
        'overlay.disclaimer_missing',
        `Missing overlay disclaimer snippet "${snippet}".`,
        'Add the standard non-migrating / no original edits / pointer-only disclaimer.'
      );
    }
  }
}

function validateHardExclusions(file, content, findings) {
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of HARD_EXCLUSION_PATTERNS) {
      if (!pattern.regex.test(line)) continue;
      if (hasAnyMarker(line, HARD_EXCLUSION_LOCK_MARKERS)) continue;
      pushFinding(
        findings,
        file.relativePath,
        'error',
        'hard_exclusion.unlocked_reference',
        `Line ${index + 1} references hard-exclusion pattern "${pattern.id}" without an exclusion/review/no-copy marker.`,
        'Mark the reference as excluded, no-copy, review-only, owner-approval-required, or remove it.'
      );
    }
  });
}

function validatePointerPolicy(file, content, findings) {
  if (/```json[\s\S]*?```/i.test(content)) {
    pushFinding(
      findings,
      file.relativePath,
      'error',
      'pointer_policy.json_block',
      'Overlay files must not include fenced JSON full-content blocks.',
      'Replace JSON body copies with pointer-only or metadata-only references.'
    );
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const mentionsJson = /`?[\w./-]+\.json`?/i.test(line);
    if (!mentionsJson) return;
    if (hasAnyMarker(line, POINTER_POLICY_MARKERS)) return;
    pushFinding(
      findings,
      file.relativePath,
      'error',
      'pointer_policy.json_reference_unmarked',
      `Line ${index + 1} references a JSON path without an explicit pointer/metadata/no-copy marker.`,
      'Mark JSON references as pointer-only, metadata-only, or no-copy.'
    );
  });
}

function validateWikiOverlay(baseRoot = repoRoot(), options = {}) {
  const root = path.resolve(baseRoot);
  const files = collectOverlayMarkdownFiles(root);
  const findings = [];

  if (files.length === 0) {
    pushFinding(
      findings,
      OVERLAY_DIR,
      'error',
      'overlay.files_missing',
      'No wiki-overlay markdown files found.',
      'Create wiki-overlay/*.md before running overlay validation.'
    );
  }

  for (const file of files) {
    const content = fs.readFileSync(file.fullPath, 'utf8');
    if (!options.hardExclusionsOnly) {
      validateFrontmatter(file, content, findings);
      validateOverlayDisclaimer(file, content, findings);
      validatePointerPolicy(file, content, findings);
    }
    validateHardExclusions(file, content, findings);
  }

  const errors = findings.filter((finding) => finding.severity === 'error');
  const warnings = findings.filter((finding) => finding.severity === 'warning');

  return {
    ok: errors.length === 0,
    root: normalizePath(root),
    scope: [OVERLAY_DIR],
    mode: options.hardExclusionsOnly ? 'hard-exclusions-only' : 'full',
    filesChecked: files.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    findings
  };
}

function printReport(report) {
  console.log('# Wiki Overlay Validation');
  console.log('');
  console.log(`- root: ${report.root}`);
  console.log(`- scope: ${report.scope.join(', ')}`);
  console.log(`- mode: ${report.mode}`);
  console.log(`- files checked: ${report.filesChecked}`);
  console.log(`- errors: ${report.errorCount}`);
  console.log(`- warnings: ${report.warningCount}`);
  console.log('');
  if (report.findings.length === 0) {
    console.log('No overlay validation findings.');
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
  const report = validateWikiOverlay(repoRoot(), args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  process.exit(report.ok ? 0 : 1);
}

export { validateWikiOverlay };
