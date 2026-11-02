#!/usr/bin/env node
/**
 * Read-only MAWS hosted-to-self-hosted CI parity preflight.
 * This tool validates a proposed gate inventory against the *legacy* workflow.
 * It never runs a gate, asserts runner qualification, publishes a GitHub status,
 * changes a workflow or authorizes removal of the hosted CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MANIFEST = 'drafts/selfhosted-ci-migration-20261030/required-gates.json';
const VALID_CONDITIONS = new Set([
  'always', 'after-skill-admission-only', 'when-skill-candidate-changes',
  'when-registry-relevant-change', 'when-provider-export-changes',
  'when-runtime-activation-changes', 'when-context-assembly-changes',
  'when-merge-authority-changes'
]);

export function gitBlobSha(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const h = createHash('sha1');
  h.update(Buffer.from('blob ' + String(bytes.length) + '\0'));
  h.update(bytes);
  return h.digest('hex');
}

// Structural parser for the current, fully enumerated single-job MAWS legacy workflow.
// Fail on an unexpected shape instead of guessing at YAML semantics.
export function parseLegacyWorkflow(input) {
  const lines = String(input).split(/\r?\n/);
  const steps = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^      - name: (.+)$/);
    if (!match) continue;
    let end = i + 1;
    while (end < lines.length &&
           !/^      - name: /.test(lines[end]) &&
           !/^    [a-zA-Z][a-zA-Z_-]*:/.test(lines[end])) end += 1;
    const block = lines.slice(i + 1, end);
    const uses = block.find((line) => /^        uses: /.test(line));
    const runIndex = block.findIndex((line) => /^        run: /.test(line));
    if (Boolean(uses) === (runIndex >= 0)) {
      throw new Error('Unsupported or ambiguous workflow step: ' + match[1]);
    }
    const step = {
      id: 'legacy-' + String(steps.length + 1).padStart(2, '0'),
      order: steps.length + 1, name: match[1],
      type: uses ? 'action' : 'run',
      required: true,
      execution_boundary: uses ?
        'equivalent-source-custody-or-pinned-toolchain-in-vm' :
        'isolated-vm'
    };
    if (uses) {
      step.action = uses.trim().slice('uses: '.length);
      step.with = {};
      const withIndex = block.findIndex((line) => line === '        with:');
      if (withIndex >= 0) {
        for (let j = withIndex + 1; j < block.length && block[j].startsWith('          '); j += 1) {
          const param = block[j].trim().match(/^([\w-]+):\s*(.*)$/);
          if (!param && /^#/.test(block[j].trim())) continue;
          if (!param) throw new Error('Unrecognized action parameter: ' + block[j]);
          step.with[param[1]] = param[2];
        }
      }
    } else {
      if (block[runIndex] === '        run: |') {
        const scriptLines = block.slice(runIndex + 1);
        if (scriptLines.some((line) => line.trim() && !line.startsWith('          '))) {
          throw new Error('Unexpected multiline run indentation: ' + match[1]);
        }
        step.run = scriptLines.filter((line) => line.startsWith('          '))
          .map((line) => line.slice(10)).join('\n');
      } else {
        const inline = block[runIndex].slice('        run: '.length);
        if (!inline || block.slice(runIndex + 1).some((line) => line.trim())) {
          throw new Error('Unexpected inline run block: ' + match[1]);
        }
        step.run = inline;
      }
      if (!step.run) throw new Error('Empty run block: ' + match[1]);
    }
    steps.push(step);
    i = end - 1;
  }
  return steps;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function validateParityInventory(manifest, sourceText, sourceBuffer) {
  const problems = [];
  if (manifest?.schema !== 'maws.selfhosted-ci-parity-candidate.v1') {
    problems.push('unknown manifest schema');
  }
  if (manifest?.source_repository !== 'baum777/model-agnostic-workflow-system') {
    problems.push('source repository identity mismatch');
  }
  if (manifest?.cutover_state !== 'BLOCKED' || manifest?.relay_state !== 'NOT_IMPLEMENTED_NOT_QUALIFIED') {
    problems.push('an inventory cannot declare relay qualification or approve cutover');
  }
  if (manifest?.legacy_workflow_git_blob_sha !== gitBlobSha(sourceBuffer)) {
    problems.push('legacy workflow Git blob digest mismatch');
  }
  if (!/^\s*runs-on: ubuntu-latest\s*$/m.test(sourceText)) {
    problems.push('legacy workflow runner/posture changed; re-inventory required');
  }
  const steps = parseLegacyWorkflow(sourceText);
  if (!Array.isArray(manifest?.legacy_steps) || manifest.legacy_steps.length !== steps.length ||
      manifest.legacy_step_count !== steps.length) {
    problems.push('legacy workflow step count or inventory mismatch');
  } else {
    for (let i = 0; i < steps.length; i += 1) {
      if (JSON.stringify(stableValue(manifest.legacy_steps[i])) !== JSON.stringify(stableValue(steps[i]))) {
        problems.push('legacy step drift: ' + steps[i].id + ' ' + steps[i].name);
      }
    }
  }
  if (steps.length !== 23) problems.push('unexpected baseline step count; review required');
  const supplement = manifest?.supplemental_policy_gates;
  if (!Array.isArray(supplement) || supplement.length < 20) {
    problems.push('MAWS supplementary governance gate inventory incomplete');
  } else {
    const ids = new Set(steps.map((step) => step.id));
    for (const gate of supplement) {
      if (typeof gate.id !== 'string' || ids.has(gate.id) ||
          typeof gate.command !== 'string' || !gate.command.trim() ||
          !VALID_CONDITIONS.has(gate.condition) || gate.evidence_required !== true) {
        problems.push('invalid/duplicate supplemental gate ' + String(gate.id));
      }
      ids.add(gate.id);
    }
    if (!supplement.some((x) => x.condition === 'when-skill-candidate-changes' &&
        x.command.startsWith('npm run skill:frontdoor'))) {
      problems.push('missing exact candidate skill frontdoor');
    }
  }
  return { ok: problems.length === 0, problems,
    legacySteps: steps.length, additionalGates: supplement?.length ?? 0,
    cutoverAuthorized: false, qualifiedRunner: false };
}

function main(argv) {
  let root = ROOT, manifestFile = DEFAULT_MANIFEST;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1]) root = path.resolve(argv[++i]);
    else if (argv[i] === '--manifest' && argv[i + 1]) manifestFile = argv[++i];
    else throw new Error('Usage: node scripts/tools/validate-selfhosted-ci-parity.mjs [--root dir] [--manifest file]');
  }
  const manifest = JSON.parse(fs.readFileSync(path.resolve(root, manifestFile), 'utf8'));
  const workflow = path.resolve(root, manifest.legacy_workflow_path);
  const bytes = fs.readFileSync(workflow);
  const report = validateParityInventory(manifest, bytes.toString('utf8'), bytes);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write('BLOCKED: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
