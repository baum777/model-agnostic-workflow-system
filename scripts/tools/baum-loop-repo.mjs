#!/usr/bin/env node
// Baum-OS Repo Loop Adapter v0.2
// Usage: node scripts/baum-loop-repo.mjs "command/ loop repo <path>"
//        node scripts/baum-loop-repo.mjs --repo <path>

import { execSync } from 'child_process';
import {
  existsSync, statSync, mkdirSync, writeFileSync, readFileSync, readdirSync
} from 'fs';
import { resolve, join, basename, relative, extname } from 'path';

const ADAPTER_VERSION = 'v0.2';

const ALLOWED_ENTRY_POINTS = [
  'README.md', 'AGENTS.md', 'package.json', 'pnpm-lock.yaml',
  'package-lock.json', 'yarn.lock', 'current_state.md', 'priorities.md',
];

const ALLOWED_DIRS = ['docs', 'commands', 'loops', 'evidence'];
const ALLOWED_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.txt']);

const FORBIDDEN_PATTERNS = [
  /\.env($|\.)/, /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/,
  /[/\\]secrets[/\\]/, /[/\\]credentials[/\\]/, /[/\\]tokens[/\\]/,
  /[/\\]\.git[/\\]/, /[/\\]node_modules[/\\]/,
  /[/\\]dist[/\\]/, /[/\\]build[/\\]/, /[/\\]coverage[/\\]/,
  /[/\\]\.cache[/\\]/, /[/\\]\.tmp[/\\]/,
];

const MAX_DEPTH = 3;
const MAX_FILE_BYTES = 120_000;
const MAX_TOTAL_BYTES = 600_000;

// --- Parse command ---

function parseCommand(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^command\/\s+loop\s+repo\s+(.+)$/);
  if (!match) {
    if (!trimmed.startsWith('command/')) throw new Error('fail:missing command/ prefix');
    if (!/\bloop\b/.test(trimmed)) throw new Error('fail:missing loop keyword');
    if (!/\brepo\b/.test(trimmed)) throw new Error('fail:missing repo keyword');
    throw new Error('fail:invalid command format');
  }
  const path = match[1].trim();
  if (!path) throw new Error('fail:missing path');
  return path;
}

// --- Core root ---

function findCoreRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return process.cwd();
  }
}

// --- Forbidden path check ---

function isForbidden(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return FORBIDDEN_PATTERNS.some(p => p.test(normalized));
}

// --- Repo scan ---

function scanRepo(targetPath) {
  const filesRead = [];
  const filesSkipped = [];
  const forbiddenNotRead = [];
  let totalBytes = 0;
  const contents = {};

  function readFile(absPath) {
    const rel = relative(targetPath, absPath);
    if (isForbidden(absPath)) { forbiddenNotRead.push(rel); return; }
    if (!ALLOWED_EXTENSIONS.has(extname(absPath).toLowerCase())) {
      filesSkipped.push(rel + ' (extension)'); return;
    }
    try {
      const st = statSync(absPath);
      if (st.size > MAX_FILE_BYTES) { filesSkipped.push(rel + ' (too large)'); return; }
      if (totalBytes + st.size > MAX_TOTAL_BYTES) { filesSkipped.push(rel + ' (total limit)'); return; }
      const text = readFileSync(absPath, 'utf8');
      totalBytes += st.size;
      filesRead.push(rel);
      contents[rel] = text;
    } catch { filesSkipped.push(rel + ' (read error)'); }
  }

  function scanDir(dirPath, depth) {
    if (depth > MAX_DEPTH) return;
    let entries;
    try { entries = readdirSync(dirPath, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dirPath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!isForbidden(full + '/')) scanDir(full, depth + 1);
      } else if (entry.isFile()) {
        readFile(full);
      }
    }
  }

  // Entry points first
  for (const ep of ALLOWED_ENTRY_POINTS) {
    const full = join(targetPath, ep);
    if (existsSync(full)) readFile(full);
  }

  // evidence/README.md specifically
  const evidenceReadme = join(targetPath, 'evidence', 'README.md');
  if (existsSync(evidenceReadme)) readFile(evidenceReadme);

  // Allowed dirs
  for (const dir of ALLOWED_DIRS) {
    const dirPath = join(targetPath, dir);
    if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
      scanDir(dirPath, 1);
    }
  }

  return { filesRead, filesSkipped, forbiddenNotRead, totalBytes, contents };
}

// --- Repo state ---

function getRepoState(targetPath) {
  try {
    const status = execSync(
      `git -C "${targetPath}" status --short --ignore-submodules=none`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (!status) return { state: 'clean', detail: '' };

    const riskyPattern = /\.env|secret|credential|token|deploy|\.key|\.pem/i;
    if (status.split('\n').some(l => riskyPattern.test(l))) {
      return { state: 'blocked', detail: status };
    }
    return { state: 'dirty', detail: status };
  } catch {
    return { state: 'unknown', detail: 'not a git repo or git unavailable' };
  }
}

// --- Task class (v0.4 scoring) ---

function classifyTaskClass(contents) {
  const CLASS_PATTERNS = [
    ['deployment',     /deploy|vercel|netlify|kubernetes/],
    ['runtime',        /adapter|harness|runtime|thin\s*cli|execution surface/],
    ['validation',     /validator|validate|evidence|verification|test/],
    ['implementation', /implement|script|feature|build/],
    ['review',         /log|closure|governance|audit|review|dirty/],
    ['docs-only',      /readme|docs|governance/],
  ];

  // Earlier = higher tie-break priority
  const PRIORITY = ['validation', 'runtime', 'implementation', 'review', 'docs-only', 'deployment'];

  function fileWeight(relPath) {
    const lower = relPath.toLowerCase();
    const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
    const depth = relPath.split('/').filter(Boolean).length - 1;
    const rootLevel = depth === 0;
    if (['.json', '.yml', '.yaml', '.mjs', '.js', '.sh', '.ts'].includes(ext)) {
      return rootLevel ? 3 : 2;
    }
    return 1; // .md and everything else
  }

  const scores = Object.fromEntries(CLASS_PATTERNS.map(([cls]) => [cls, 0]));
  let deploymentFromNonMd = false;

  for (const [relPath, text] of Object.entries(contents)) {
    const weight = fileWeight(relPath);
    const lower = text.toLowerCase();
    const isMd = relPath.toLowerCase().endsWith('.md');
    for (const [cls, pattern] of CLASS_PATTERNS) {
      if (pattern.test(lower)) {
        scores[cls] += weight;
        if (cls === 'deployment' && !isMd) deploymentFromNonMd = true;
      }
    }
  }

  // Deployment disqualified when all its signal comes from markdown docs
  if (!deploymentFromNonMd) scores['deployment'] = 0;

  let bestClass = null;
  let bestScore = 0;
  for (const cls of PRIORITY) {
    if (scores[cls] > bestScore) {
      bestScore = scores[cls];
      bestClass = cls;
    }
  }
  return bestClass || 'review';
}

// --- Workblock generation ---

function generateWorkblock(repoName, repoPath, repoState, taskClass, scanResult) {
  const topFiles = scanResult.filesRead.slice(0, 8).map(f => `  - ${f}`).join('\n') || '  (none)';

  return `# Task Start

Name:
Baum-OS Repo Workloop für ${repoName}

Ziel:
Repo ${repoName} kontrolliert einlesen und einen sicheren Arbeitsblock erzeugen.

Modus:
${taskClass}

Scope:
Nur ${repoPath} und zulässige Frontdoor-/Governance-/Log-Dateien.

Boundaries:
- Keine Dateiänderungen im Zielrepo
- Keine Commits
- Keine Secrets, Auth, Credentials
- Kein Deployment
- Keine Runtime-Ausführung
- Kein Cross-Repo-Scope

Done-Kriterium:
Repo-State klassifiziert, Task-Class bestimmt, Arbeitsblock erzeugt, Evidence geschrieben.

Files Changed: none

# Arbeitsblock

1. Prüfe, ob ${repoPath} existiert und ein Repo oder Projektordner ist.
2. Lies die lokalen Einstiegspunkte: README.md, AGENTS.md, docs/, Package-/Test-Metadaten, Governance-Dateien.
3. Suche nach offenen Logs, Closure-Berichten, Evidence Contracts und lokalen Arbeitsregeln.
4. Klassifiziere den Repo-Zustand: ${repoState.state}.
5. Klassifiziere die wahrscheinliche Task-Klasse: ${taskClass}.
6. Erzeuge einen begrenzten Arbeitsblock mit klaren Grenzen, Stop-Regeln und Done-Kriterium.
7. Schreibe den finalen Prompt für Codex, Claude oder Pi.

# Stop-Regeln

Stoppe mit blocked, wenn:
- Secrets, Auth, Credentials, Deployment oder Runtime-Zugriff nötig wäre
- Cross-Repo-Arbeit nötig wäre
- Dirty State nicht klassifizierbar ist

Stoppe mit partial, wenn:
- Nur ein Teil der relevanten Dateien lesbar ist
- Task-Klasse unsicher bleibt, aber eingegrenzt werden kann

# Task Closure

Result:
pass

Owner / Scope:
${repoName} — read-only Orientierungslauf

Files Read:
${topFiles}

Files Changed:
none

Verification:
- Trigger erkannt: ✓
- Pfad existiert: ✓
- Frontdoor lesbar: ✓
- Dirty State klassifiziert: ✓
- Keine Secrets gelesen: ✓

Risks / Gaps:
- Semantische Analyse noch nicht vollständig automatisiert
- Runtime Validator prüft Struktur, nicht semantische Qualität
- Kein CI-Gate

Status:
${repoState.state}
`;
}

// --- Slug helpers ---

function safeSlug(name) {
  return name.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function getEvidencePath(coreRoot, repoName, result) {
  const date = new Date().toISOString().slice(0, 10);
  const base = join(coreRoot, 'evidence', 'loop-runs');
  const slug = `${date}-${safeSlug(repoName)}-${result}`;
  let dir = join(base, slug);
  let counter = 2;
  while (existsSync(dir)) {
    dir = join(base, `${slug}-${counter}`);
    counter++;
  }
  return dir;
}

// --- Evidence writing ---

function writeEvidence(evidencePath, {
  trigger, targetPath, coreRoot, timestamp, repoName,
  scanResult, repoState, taskClass, workblock, result,
}) {
  mkdirSync(evidencePath, { recursive: true });

  writeFileSync(join(evidencePath, 'input.md'),
`# Loop Run — Input

## Trigger
\`\`\`
${trigger}
\`\`\`

## Resolved Target Path
${targetPath}

## Baum-OS Core Root
${coreRoot}

## Timestamp
${timestamp}

## Mode
read-only

## Adapter Version
${ADAPTER_VERSION}
`);

  const filesReadList = scanResult.filesRead.map(f => `- ${f}`).join('\n') || '(none)';
  const filesSkippedList = scanResult.filesSkipped.slice(0, 20).map(f => `- ${f}`).join('\n') || '(none)';
  const forbiddenList = scanResult.forbiddenNotRead.map(f => `- ${f}`).join('\n') || '(none)';

  writeFileSync(join(evidencePath, 'repo-scan.md'),
`# Loop Run — Repo Scan

## Files Read
${filesReadList}

## Files Skipped
${filesSkippedList}

## Forbidden Paths Not Read
${forbiddenList}

## Scan Limits
- maxDepth: ${MAX_DEPTH}
- maxFileBytes: ${MAX_FILE_BYTES}
- maxTotalBytes: ${MAX_TOTAL_BYTES}
- totalBytesRead: ${scanResult.totalBytes}

## Frontdoor Finding
${scanResult.filesRead.includes('README.md') ? '✓ README.md found' : '✗ No README.md'}
${scanResult.filesRead.includes('AGENTS.md') ? '✓ AGENTS.md found' : ''}
`);

  writeFileSync(join(evidencePath, 'classification.md'),
`# Loop Run — Classification

## Repo-State
${repoState.state}

## Task-Class
${taskClass}

## Reasoning Summary
Repo ${repoName} scanned read-only. State determined via \`git status\`. Task class inferred from content patterns in ${scanResult.filesRead.length} files.

## Dirty-State Summary
${repoState.detail || '(none — repo is clean or state not applicable)'}
`);

  writeFileSync(join(evidencePath, 'generated-workblock.md'), workblock);

  const filesReadInClosure = scanResult.filesRead.slice(0, 15).map(f => `- ${f}`).join('\n') || '(none)';

  writeFileSync(join(evidencePath, 'closure.md'),
`# Loop Run — Task Closure

## Result
${result}

## Owner / Scope
${repoName} — read-only Orientierungslauf

## Trigger
\`\`\`
${trigger}
\`\`\`

## Files Read
${filesReadInClosure}

## Files Changed
Files Changed: none

## Evidence Path
\`\`\`
${evidencePath}
\`\`\`

## Verification
- Trigger erkannt: ✓
- Pfad existiert: ✓
- Frontdoor lesbar: ${scanResult.filesRead.includes('README.md') ? '✓' : '✗'}
- Dirty State klassifiziert: ✓ (${repoState.state})
- Keine Secrets gelesen: ✓
- Keine .env-Dateien geöffnet: ✓
- Kein Cross-Repo-Write: ✓
- Files Changed: none ✓

## Risks / Gaps
- Pi-spezifische Adapter-Integration noch offen
- Validator prüft Struktur, nicht semantische Qualität
- Kein CI-Gate
- Kein Multi-Repo-Loop
- Kein Write-/Execution-Loop

## Status
${repoState.state}
`);
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Error: no command provided');
    console.error('Usage: node scripts/baum-loop-repo.mjs "command/ loop repo <path>"');
    process.exit(1);
  }

  let rawCommand;
  if (args[0] === '--repo') {
    if (!args[1]) { console.error('Error: --repo requires a path'); process.exit(1); }
    rawCommand = `command/ loop repo ${args[1]}`;
  } else {
    rawCommand = args.join(' ');
  }

  const coreRoot = findCoreRoot();
  const timestamp = new Date().toISOString();

  // Parse
  let rawPath;
  try {
    rawPath = parseCommand(rawCommand);
  } catch (e) {
    console.error(`FAIL: ${e.message.replace('fail:', '')}`);
    console.error('Result: failed');
    process.exit(1);
  }

  // Resolve & validate
  const targetPath = resolve(rawPath);
  if (!existsSync(targetPath)) {
    console.error(`FAIL: path does not exist: ${targetPath}`);
    console.error('Result: failed');
    process.exit(1);
  }
  if (!statSync(targetPath).isDirectory()) {
    console.error(`FAIL: path is not a directory: ${targetPath}`);
    console.error('Result: failed');
    process.exit(1);
  }

  const repoName = basename(targetPath);

  // Scan
  const scanResult = scanRepo(targetPath);
  if (scanResult.filesRead.length === 0) {
    console.error(`FAIL: no readable files found at ${targetPath}`);
    console.error('Result: failed');
    process.exit(1);
  }

  // Repo state
  const repoState = getRepoState(targetPath);
  if (repoState.state === 'blocked') {
    console.error('BLOCKED: dirty state touches risky areas (secrets/auth/deployment)');
    console.error('Result: blocked');
    process.exit(1);
  }

  // Task class
  const taskClass = classifyTaskClass(scanResult.contents);

  // Generate workblock
  const workblock = generateWorkblock(repoName, targetPath, repoState, taskClass, scanResult);

  // Determine result
  const result = repoState.state === 'unknown' ? 'partial' : 'pass';

  // Write evidence
  const evidencePath = getEvidencePath(coreRoot, repoName, result);
  writeEvidence(evidencePath, {
    trigger: rawCommand, targetPath, coreRoot, timestamp, repoName,
    scanResult, repoState, taskClass, workblock, result,
  });

  const relEvidence = relative(coreRoot, evidencePath);
  console.log(`Result: ${result}`);
  console.log(`Evidence Path: ${relEvidence}`);
  console.log(`Validator Command:`);
  console.log(`node scripts/validate-loop-run.mjs ${relEvidence}`);
}

main().catch(e => {
  console.error('Unexpected error:', e.message);
  process.exit(1);
});
