#!/usr/bin/env node
// MAWS vNext — S9 regression and rollback evaluation runner
// (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S9 Regression and Rollback).
//
// WHAT THIS RUNS
//   1. The eight advisory semantic signals of the S3 wave 2 layer against the
//      INDEPENDENT case corpus, with the false positives, the false
//      negatives and the coverage gaps reported separately.
//   2. The regression gate over every baseline/candidate pair of the corpus.
//      The two sides are materialized into two SEPARATE clean directories and
//      audited there, so no side can see the other.
//   3. The controlled rollback over every version chain of the corpus.
//
// WHAT IT PROVES AND WHAT IT DOES NOT
// It proves the decision logic: which verdict the gate and the rollback
// reach, and that they refuse when the evidence is missing or the history
// changed. It measures no model behaviour and no real skill: every record in
// the corpus is a constructed fixture.
//
// It also proves the gate writes nothing: the candidate tree is hashed before
// and after the comparison, and the digests are compared. A rejected
// candidate leaves the original state exactly as it was.
//
// Usage:
//   node scripts/tools/run-regression-eval.mjs [--out <dir>] [--corpus <file>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { auditInstructionSources } from '../../runtime/instructions/instruction-auditor.mjs';
import { compareBaselineCandidate } from '../../runtime/regression/regression-gate.mjs';
import { evaluateSignalCases } from '../../runtime/regression/signal-evaluation.mjs';
import { planRollback } from '../../runtime/regression/rollback.mjs';
import { createScratchRoot, removeScratchRoot, safeRemove } from './safe-remove.mjs';
import {
  validateRegressionComparison,
  validateRollbackRecord
} from './validate-regression-comparison.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_CORPUS = path.join(ROOT, 'evals', 's9-regression', 'corpus.json');

// The canonical instruction sources of the repository's own inventory. The
// audit fails closed when a declared source set is incomplete, so a fixture
// tree declares all of them.
const FIXED_SOURCES = [
  'AGENTS.md',
  'WORKFLOW.md',
  'docs/governance/source-hierarchy.md',
  'docs/authority-matrix.md',
  'docs/model-agnostic-core-prompt-system.md',
  'core/contracts/workflow-routing-map.json',
  'core/contracts/permission-boundary.json',
  'core/contracts/workflow-memory-contract.json'
];

// One placeholder skill per declared skill tree. The descriptions are
// deliberately unrelated to each other: two descriptions that cover the same
// ground are themselves a routing ambiguity signal, and a fixture must not
// plant a signal it does not mean to plant.
const SKILL_PLACEHOLDERS = {
  'core/skills': 'Portable reference material for the shared core surface.',
  skills: 'Exported workflow recipes for consumers of this package.',
  '.agents/skills': 'Local orchestration helpers bound to this repository.'
};

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// A corpus file key is DATA, and data names a path only inside the fixture
// tree. A key that resolves outside it - a `../` component, an absolute
// path - is refused before anything is created: the corpus describes a
// fixture tree, and a fixture tree that escapes its directory would be a
// write outside what this run owns.
function fixtureFilePath(root, relative) {
  const rootResolved = path.resolve(root);
  const absolute = path.resolve(root, relative);
  if (absolute !== rootResolved && !absolute.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`the corpus file key "${relative}" resolves outside the fixture tree; a fixture tree stays inside its case`);
  }
  return absolute;
}

// Materialize a fixture tree: the canonical source scaffolding plus the
// files of the case.
//
// The tree lives inside the run's marked scratch root, under a name this
// runner chooses. The removal of a tree goes through the repository's safe
// primitive with the scratch root as the boundary, so a cleanup can never
// reach outside what this run created — the /tmp incident of 2026-10-21 was
// exactly a removal that computed its target from something it was handed.
function materializeTree(scratchRoot, name, files) {
  const root = path.join(scratchRoot, name);
  fs.mkdirSync(root, { recursive: true });
  for (const relative of FIXED_SOURCES) {
    if (files[relative] !== undefined) continue;
    const absolute = fixtureFilePath(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `stub ${relative}\n`);
  }
  for (const [relative, content] of Object.entries(files)) {
    const absolute = fixtureFilePath(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  for (const [tree, description] of Object.entries(SKILL_PLACEHOLDERS)) {
    const directory = path.join(root, tree, 'placeholder');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'SKILL.md'),
      `---\nname: placeholder\ndescription: ${description}\n---\n\nNothing to report here.\n`
    );
  }
  fs.writeFileSync(
    fixtureFilePath(root, 'package.json'),
    `${JSON.stringify({ name: 's9-regression-fixture', private: true })}\n`
  );
  return root;
}

// The digest of a whole tree: the relative paths and the content of every
// file. Two digests that agree mean the tree is byte-identical.
function treeDigest(root) {
  const entries = [];
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }
      entries.push({ relative, digest: sha256(fs.readFileSync(absolute)) });
    }
  };
  walk(root, '');
  return `sha256:${sha256(JSON.stringify(entries))}`;
}

// The advisory signal measurement of one materialized tree: how many advisory
// candidates the audit found, and how many per class.
function auditTree(root, revision) {
  const audit = auditInstructionSources({ root, revision });
  const advisory = audit.findings.filter((finding) => finding.determinism === 'semantic_advisory');
  const byClass = {};
  for (const entry of audit.coverage.classes_detected_advisory ?? []) {
    byClass[entry.finding_class] = entry.candidate_count;
  }
  return {
    candidate_count: advisory.length,
    by_class: byClass,
    deterministic_findings: audit.findings_count - advisory.length
  };
}

function resolveFingerprints(rollbackCase, fingerprints) {
  return (rollbackCase.versions ?? []).map((entry) => {
    const resolved = { ...entry };
    for (const key of ['qualified_fingerprint', 'restored_fingerprint']) {
      if (typeof resolved[key] === 'string') {
        resolved[key] = fingerprints[resolved[key]] ?? null;
      }
    }
    return resolved;
  });
}

export function runRegressionEval({ root = ROOT, corpusPath = DEFAULT_CORPUS, outDir = null } = {}) {
  const corpusBytes = fs.readFileSync(corpusPath);
  const corpus = JSON.parse(corpusBytes.toString('utf8'));
  const issues = [];

  // 1. The eight advisory signals against the independent case corpus.
  const signalEvaluation = evaluateSignalCases({ cases: corpus.signal_cases ?? [] });
  for (const entry of signalEvaluation.classes) {
    if (entry.coverage_gap) {
      issues.push(`signal corpus: the class ${entry.finding_class} has no independent case (coverage gap)`);
    }
    for (const caseId of entry.missed_cases) {
      issues.push(`signal corpus: ${caseId} holds its class but no candidate was produced (false negative)`);
    }
    for (const caseId of entry.overfired_cases) {
      issues.push(`signal corpus: ${caseId} does not hold its class but a candidate was produced (false positive)`);
    }
  }

  // 2. The regression gate over every baseline/candidate pair.
  const comparisons = [];
  const statePreservation = [];
  const scratch = createScratchRoot({ prefix: 'maws-s9-run-' });
  try {
    for (const [index, entry] of (corpus.regression_cases ?? []).entries()) {
      const baselineRoot = materializeTree(scratch.root, `case-${index}-baseline`, entry.trees?.baseline ?? {});
      const candidateRoot = materializeTree(scratch.root, `case-${index}-candidate`, entry.trees?.candidate ?? {});
      try {
        const baselineIntegrity = auditTree(baselineRoot, `s9-${entry.case_id}-baseline`);
        const candidateIntegrity = auditTree(candidateRoot, `s9-${entry.case_id}-candidate`);
        const candidateDigestBefore = treeDigest(candidateRoot);
        const comparison = compareBaselineCandidate({
          baseline: { ...entry.baseline, instructionIntegrity: baselineIntegrity },
          candidate: { ...entry.candidate, instructionIntegrity: candidateIntegrity },
          evidenceRefs: [`corpus:evals/s9-regression/corpus.json#${entry.case_id}`]
        });
        const candidateDigestAfter = treeDigest(candidateRoot);
        statePreservation.push({
          case_id: entry.case_id,
          candidate_tree_digest_before: candidateDigestBefore,
          candidate_tree_digest_after: candidateDigestAfter,
          unchanged: candidateDigestBefore === candidateDigestAfter,
          candidate_rejected: comparison.candidate_rejected,
          verdict: comparison.verdict
        });
        if (candidateDigestBefore !== candidateDigestAfter) {
          issues.push(`${entry.case_id}: the candidate tree changed during the comparison`);
        }
        const contractIssues = validateRegressionComparison(comparison, root);
        if (contractIssues.length > 0) {
          issues.push(`${entry.case_id}: the comparison record violates its contract: ${contractIssues.join('; ')}`);
        }
        if (comparison.verdict !== entry.expectation.verdict) {
          issues.push(`${entry.case_id}: expected verdict ${entry.expectation.verdict}, got ${comparison.verdict}`);
        }
        if (comparison.candidate_rejected !== entry.expectation.candidate_rejected) {
          issues.push(`${entry.case_id}: expected candidate_rejected ${entry.expectation.candidate_rejected}, got ${comparison.candidate_rejected}`);
        }
        comparisons.push({
          case_id: entry.case_id,
          expectation: entry.expectation,
          comparison,
          contract_issues: contractIssues
        });
      } finally {
        safeRemove({ target: baselineRoot, boundary: scratch.root, recursive: true });
        safeRemove({ target: candidateRoot, boundary: scratch.root, recursive: true });
      }
    }
  } finally {
    removeScratchRoot({ root: scratch.root });
  }

  // 3. The controlled rollback PLAN over every version chain.
  //
  // The pre-rollback digest of the evidence inventory is passed through as
  // the corpus states it. It is never derived from the entries it is used to
  // check: a digest computed from the state under examination would make the
  // history check tautological, and a case that omits it must exercise the
  // refusal instead of a default.
  const rollbacks = [];
  for (const entry of corpus.rollback_cases ?? []) {
    const history = {
      entries: entry.history?.entries ?? [],
      digest_before: entry.history?.digest_before
    };
    const record = planRollback({
      subject: entry.subject,
      current: entry.current,
      versions: resolveFingerprints(entry, corpus.fingerprints ?? {}),
      history,
      requestedTargetVersion: entry.requested_target_version ?? null,
      evidenceRefs: [`corpus:evals/s9-regression/corpus.json#${entry.case_id}`]
    });
    const contractIssues = validateRollbackRecord(record, root);
    if (contractIssues.length > 0) {
      issues.push(`${entry.case_id}: the rollback record violates its contract: ${contractIssues.join('; ')}`);
    }
    if (record.verdict !== entry.expectation.verdict) {
      issues.push(`${entry.case_id}: expected verdict ${entry.expectation.verdict}, got ${record.verdict}`);
    }
    if ((record.refusal_code ?? null) !== (entry.expectation.refusal_code ?? null)) {
      issues.push(`${entry.case_id}: expected refusal code ${entry.expectation.refusal_code ?? 'none'}, got ${record.refusal_code ?? 'none'}`);
    }
    rollbacks.push({
      case_id: entry.case_id,
      expectation: entry.expectation,
      record,
      contract_issues: contractIssues
    });
  }

  const result = {
    schema_version: '1.0.0',
    corpus_id: corpus.corpus_id ?? 'unknown',
    corpus_path: path.relative(root, corpusPath),
    corpus_digest: `sha256:${sha256(corpusBytes)}`,
    signal_evaluation: signalEvaluation,
    comparisons,
    rollbacks,
    state_preservation: statePreservation,
    issues,
    limits: [
      'Every record in the corpus is a constructed fixture. This run measures the decision logic of the regression gate and the controlled rollback, and the detectors of the eight advisory signals against cases whose answer is fixed independently of the detectors. It measures no model behaviour and no real skill.',
      'The baseline and the candidate are measured in two separate clean directories, so neither side can observe the other. This is a local measurement, not a hosted CI run: the account\'s GitHub Actions admission is closed by a billing lock.',
      'The signal labels are constructed, not owner-reviewed. The eight classes remain not statically analyzable, their candidates remain advisory, and a candidate is a hint whose classification the owner makes.',
      'A NO_REGRESSION verdict authorizes nothing: adoption_authorized and authority_granted are false by construction, and the owner-governed promotion path (S8) remains the only route to an adoption.'
    ]
  };

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'signal-evaluation.json'), `${JSON.stringify(signalEvaluation, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'regression-comparisons.json'), `${JSON.stringify(comparisons, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'rollback-records.json'), `${JSON.stringify(rollbacks, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'state-preservation.json'), `${JSON.stringify(statePreservation, null, 2)}\n`);
  }

  return result;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = value;
      index += 1;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const corpusPath = options.corpus ? path.resolve(options.corpus) : DEFAULT_CORPUS;
  const outDir = options.out ? path.resolve(options.out) : null;
  const result = runRegressionEval({ corpusPath, outDir });
  const signal = result.signal_evaluation;
  const measured = signal.classes.filter((entry) => !entry.coverage_gap);
  const truePositive = measured.reduce((sum, entry) => sum + entry.true_positive, 0);
  const falsePositive = measured.reduce((sum, entry) => sum + entry.false_positive, 0);
  const falseNegative = measured.reduce((sum, entry) => sum + entry.false_negative, 0);
  process.stdout.write(`S9 regression eval: ${result.corpus_id}\n`);
  process.stdout.write(`  corpus digest: ${result.corpus_digest}\n`);
  process.stdout.write(`  signal cases: ${signal.coverage.case_count} over ${measured.length}/8 classes; `
    + `TP ${truePositive}, FP ${falsePositive}, FN ${falseNegative}; `
    + `coverage gaps: ${signal.coverage.classes_without_cases.length}\n`);
  process.stdout.write(`  regression cases: ${result.comparisons.length} compared\n`);
  process.stdout.write(`  rollback cases: ${result.rollbacks.length} planned\n`);
  process.stdout.write(`  candidate state preserved: ${result.state_preservation.every((entry) => entry.unchanged)}\n`);
  if (result.issues.length > 0) {
    for (const issue of result.issues) {
      process.stderr.write(`  ISSUE ${issue}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write('  result: every expectation met\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
