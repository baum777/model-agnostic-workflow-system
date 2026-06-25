#!/usr/bin/env node
// Baum-OS Runtime Validator — loop-run evidence
// Usage: node scripts/validate-loop-run.mjs evidence/loop-runs/<slug>
//        node scripts/validate-loop-run.mjs --json evidence/loop-runs/<slug>
//        node scripts/validate-loop-run.mjs --quality evidence/loop-runs/<slug>
//        node scripts/validate-loop-run.mjs --quality --json evidence/loop-runs/<slug>

import { existsSync, readFileSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';

const REQUIRED_FILES = [
  'input.md', 'repo-scan.md', 'classification.md', 'generated-workblock.md', 'closure.md',
];

const WORKBLOCK_SECTIONS = ['# Task Start', '# Arbeitsblock', '# Stop-Regeln', '# Task Closure'];
const WORKBLOCK_REQUIRED_TERMS = ['Done-Kriterium', 'Files Changed: none'];

const CLOSURE_REQUIRED_TERMS = [
  'Result', 'Owner / Scope', 'Trigger', 'Files Read',
  'Files Changed', 'Evidence Path', 'Verification', 'Risks / Gaps', 'Status',
];

const FORBIDDEN_TERMS = [
  'next smallest step',
  'next safe gate',
  'automatically proceed',
  'continue until everything is done',
  'read .env',
  'deploy automatically',
  'commit all changes',
];

const VALID_RESULTS = ['pass', 'partial', 'blocked', 'failed'];

// v0.3 Quality Gate constants
const VALID_TASK_CLASSES = ['docs-only', 'implementation', 'validation', 'runtime', 'deployment', 'review', 'unknown'];
const VALID_REPO_STATES = ['clean', 'dirty', 'unknown', 'blocked'];

// Extract the # Arbeitsblock section and count numbered steps
function countStepsInArbeitsblock(content) {
  const match = content.match(/# Arbeitsblock\n([\s\S]*?)(?=\n# |\s*$)/);
  if (!match) return 0;
  const section = match[1];
  const steps = section.match(/^\d+\./gm);
  return steps ? steps.length : 0;
}

// Check if closure contains a valid result value after "## Result"
function hasValidResultInClosure(closure) {
  for (const r of VALID_RESULTS) {
    if (/##\s*Result\s*\n+\s*(pass|partial|blocked|failed)/i.test(closure)) return true;
    if (closure.includes(`Result: ${r}`)) return true;
  }
  return false;
}

// --- v0.3 Quality Gate Checks ---

function runQualityGate(runDir, workblock, closure, classification, issues, checks) {

  // QG1: Scope-Treue — Scope: section must declare a bounded repo path restriction
  const scopeLineMatch = workblock.match(/^Scope:\s*\n(\s*.+)/m);
  const scopeLine = scopeLineMatch ? scopeLineMatch[1].trim() : '';
  const hasScopeTreue = scopeLine.length > 5 && (
    /\bNur\b/.test(scopeLine) ||
    /\bonly\b/i.test(scopeLine) ||
    scopeLine.includes('/') ||
    /erlaubt/i.test(scopeLine)
  );
  checks['qg: scope-treue'] = hasScopeTreue;
  if (!hasScopeTreue) {
    issues.push('qg: scope-treue: "Scope:" section missing or lacks a bounded repo restriction');
  }

  // QG2: Stop-Regel-Abdeckung — # Stop-Regeln must cover secrets/auth, deployment/runtime, cross-repo, dirty-state
  const stopMatch = workblock.match(/# Stop-Regeln\n([\s\S]*?)(?=\n# |\s*$)/);
  const stopSection = stopMatch ? stopMatch[1].toLowerCase() : '';
  const stopCoverageChecks = {
    'secrets/auth':      /secrets?|auth|credentials?/.test(stopSection),
    'deployment/runtime': /deploy|runtime/.test(stopSection),
    'cross-repo':        /cross[- ]?repo/.test(stopSection),
    'dirty-state':       /dirty.?state|unklassifizierbar|unclassifiabl/.test(stopSection),
  };
  const missingStopCoverage = Object.entries(stopCoverageChecks).filter(([, v]) => !v).map(([k]) => k);
  checks['qg: stop-regel-abdeckung'] = missingStopCoverage.length === 0;
  if (missingStopCoverage.length > 0) {
    issues.push(`qg: stop-regel-abdeckung: missing coverage for: ${missingStopCoverage.join(', ')}`);
  }

  // QG3: Task-Class-Plausibilität — valid enum + non-empty reasoning in classification.md
  const taskClassMatch = classification.match(/##\s*Task-Class\s*\n+(\S+)/i);
  const taskClassValue = taskClassMatch ? taskClassMatch[1].trim().toLowerCase() : '';
  const reasoningMatch = classification.match(/##\s*Reasoning Summary\s*\n+([\s\S]*?)(?=\n##|\s*$)/i);
  const reasoningContent = reasoningMatch ? reasoningMatch[1].trim() : '';
  const hasValidTaskClass = VALID_TASK_CLASSES.includes(taskClassValue) && reasoningContent.length > 0;
  checks['qg: task-class-plausibilitaet'] = hasValidTaskClass;
  if (!VALID_TASK_CLASSES.includes(taskClassValue)) {
    issues.push(`qg: task-class-plausibilitaet: invalid or missing task class "${taskClassValue}" (allowed: ${VALID_TASK_CLASSES.join(', ')})`);
  } else if (reasoningContent.length === 0) {
    issues.push('qg: task-class-plausibilitaet: Reasoning Summary is empty in classification.md');
  }

  // QG4: Repo-State-Plausibilität — valid enum in classification.md
  const repoStateMatch = classification.match(/##\s*Repo-State\s*\n+(\S+)/i);
  const repoStateValue = repoStateMatch ? repoStateMatch[1].trim().toLowerCase() : '';
  const hasValidRepoState = VALID_REPO_STATES.includes(repoStateValue);
  checks['qg: repo-state-plausibilitaet'] = hasValidRepoState;
  if (!hasValidRepoState) {
    issues.push(`qg: repo-state-plausibilitaet: invalid or missing repo state "${repoStateValue}" (allowed: ${VALID_REPO_STATES.join(', ')})`);
  }

  // QG5: Risk/Gaps-Pflicht — Risks / Gaps in closure.md must exist and be non-empty
  const risksMatch = closure.match(/##\s*Risks\s*\/\s*Gaps\s*\n+([\s\S]*?)(?=\n##|\s*$)/i);
  const risksContent = risksMatch ? risksMatch[1].trim() : '';
  checks['qg: risks-gaps-pflicht'] = risksContent.length > 0;
  if (risksContent.length === 0) {
    issues.push('qg: risks-gaps-pflicht: "Risks / Gaps" section is missing or empty in closure.md');
  }

  // QG6: Evidence-Konsistenz — Evidence Path in closure.md must reference the validated run dir
  const runDirSlug = basename(runDir.replace(/\/+$/, ''));
  const evidencePathMatch = closure.match(/##\s*Evidence Path\s*\n+```\s*\n?([\s\S]*?)\n?```/i);
  const evidencePathInClosure = evidencePathMatch ? evidencePathMatch[1].trim() : '';
  const hasEvidenceConsistency = evidencePathInClosure.includes(runDirSlug);
  checks['qg: evidence-konsistenz'] = hasEvidenceConsistency;
  if (!hasEvidenceConsistency) {
    issues.push(`qg: evidence-konsistenz: closure Evidence Path "${evidencePathInClosure}" does not reference run dir "${runDirSlug}"`);
  }
}

function validateRun(runDir, jsonMode, qualityMode) {
  const issues = [];
  const checks = {};

  // 1. Run directory exists
  if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
    const msg = `run directory does not exist: ${runDir}`;
    if (jsonMode) console.log(JSON.stringify({ pass: false, issues: [msg] }, null, 2));
    else { console.log('FAIL loop-run validation\n\nIssues:\n- ' + msg); }
    process.exit(1);
  }

  // 2. Required files
  const missingFiles = REQUIRED_FILES.filter(f => !existsSync(join(runDir, f)));
  checks['required files'] = missingFiles.length === 0;
  if (missingFiles.length > 0) {
    issues.push(`missing required files: ${missingFiles.join(', ')}`);
  }

  if (missingFiles.length > 0) {
    output(false, checks, issues, jsonMode, qualityMode);
    return;
  }

  const workblock = readFileSync(join(runDir, 'generated-workblock.md'), 'utf8');
  const closure = readFileSync(join(runDir, 'closure.md'), 'utf8');

  // 3. Workblock sections
  const missingSections = WORKBLOCK_SECTIONS.filter(s => !workblock.includes(s));
  const missingTerms = WORKBLOCK_REQUIRED_TERMS.filter(t => !workblock.includes(t));
  checks['workblock sections'] = missingSections.length === 0 && missingTerms.length === 0;
  if (missingSections.length > 0) issues.push(`workblock missing sections: ${missingSections.join(', ')}`);
  if (missingTerms.length > 0) issues.push(`workblock missing required terms: ${missingTerms.join(', ')}`);

  // 4. Step count (only within # Arbeitsblock section)
  const stepCount = countStepsInArbeitsblock(workblock);
  checks['step count'] = stepCount >= 3 && stepCount <= 7;
  if (stepCount < 3) issues.push(`workblock has too few steps: ${stepCount} (min 3)`);
  if (stepCount > 7) issues.push(`workblock has too many steps: ${stepCount} (max 7)`);

  // 5. Forbidden terms in Arbeitsblock section
  const arbMatch = workblock.match(/# Arbeitsblock\n([\s\S]*?)(?=\n# |\s*$)/);
  const arbSection = (arbMatch ? arbMatch[1] : '').toLowerCase();
  const foundForbidden = FORBIDDEN_TERMS.filter(t => arbSection.includes(t));
  checks['forbidden terms'] = foundForbidden.length === 0;
  if (foundForbidden.length > 0) {
    issues.push(`forbidden terms in Arbeitsblock: ${foundForbidden.join(', ')}`);
  }

  // 6. Read-only invariant: "Files Changed: none" in workblock or closure
  const hasReadOnly =
    workblock.includes('Files Changed: none') ||
    closure.includes('Files Changed: none') ||
    /##\s*Files Changed\s*\n+\s*none\b/i.test(closure) ||
    /##\s*Files Changed\s*\n+\s*none\b/i.test(workblock);
  checks['read-only invariant'] = hasReadOnly;
  if (!hasReadOnly) {
    issues.push('"Files Changed: none" not found in workblock or closure');
  }

  // 7. Closure structure
  const missingClosureTerms = CLOSURE_REQUIRED_TERMS.filter(t => !closure.includes(t));
  checks['closure format'] = missingClosureTerms.length === 0;
  if (missingClosureTerms.length > 0) {
    issues.push(`closure missing required terms: ${missingClosureTerms.join(', ')}`);
  }

  // 8. Result value
  const validResult = hasValidResultInClosure(closure);
  checks['result value'] = validResult;
  if (!validResult) {
    issues.push('closure does not contain a valid result value (pass|partial|blocked|failed)');
  }

  // --- v0.3 Quality Gate ---
  if (qualityMode) {
    const classification = readFileSync(join(runDir, 'classification.md'), 'utf8');
    runQualityGate(runDir, workblock, closure, classification, issues, checks);
  }

  output(issues.length === 0, checks, issues, jsonMode, qualityMode);
}

function output(pass, checks, issues, jsonMode, qualityMode) {
  if (jsonMode) {
    console.log(JSON.stringify({ pass, checks, issues }, null, 2));
    process.exit(pass ? 0 : 1);
  }

  const mode = qualityMode ? 'loop-run validation + quality gate' : 'loop-run validation';

  if (pass) {
    console.log(`PASS ${mode}\n`);
    console.log('Checks:');
    for (const [name, result] of Object.entries(checks)) {
      console.log(`- ${name}: ${result ? 'pass' : 'fail'}`);
    }
    process.exit(0);
  } else {
    console.log(`FAIL ${mode}\n`);
    console.log('Issues:');
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    if (Object.keys(checks).length > 0) {
      console.log('\nChecks:');
      for (const [name, result] of Object.entries(checks)) {
        console.log(`- ${name}: ${result ? 'pass' : 'fail'}`);
      }
    }
    process.exit(1);
  }
}

// --- Main ---

const args = process.argv.slice(2);
let jsonMode = false;
let qualityMode = false;
let runDirArg = null;

for (const arg of args) {
  if (arg === '--json') jsonMode = true;
  else if (arg === '--quality') qualityMode = true;
  else runDirArg = arg;
}

if (!runDirArg) {
  console.error('Usage: node scripts/validate-loop-run.mjs [--quality] [--json] <evidence/loop-runs/slug>');
  process.exit(1);
}

validateRun(resolve(runDirArg), jsonMode, qualityMode);
