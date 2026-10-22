#!/usr/bin/env node
// MAWS vNext — S10 corpus runner (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S10
// Cross-Model Optimization).
//
// Runs the independent cross-model comparison corpus
// (evals/s10-cross-model/corpus.json) through
// runtime/optimization/cross-model-comparison.mjs and checks that every case
// produces its expected verdict, reason, preference and exclusions. Every
// produced record is additionally validated against the contract and the
// fail-closed semantic invariants: the engine's own output must satisfy the
// contract it defines, in every corpus case, including the refusals.
//
// The corpus expectations are fixed in the committed corpus file before this
// runner executes; the runner checks the engine against them, never the
// other way around. All corpus inputs are offline replay/fixture evidence:
// no provider is called, no network leaves this process, no runtime surface
// is touched.
//
// Usage:
//   node scripts/tools/run-cross-model-eval.mjs [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareExecutors, CROSS_MODEL_COMPARISON_SCHEMA_VERSION } from '../../runtime/optimization/cross-model-comparison.mjs';
import { validateCrossModelComparison } from './validate-cross-model-comparison.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_PATH = path.join(ROOT, 'evals', 's10-cross-model', 'corpus.json');
// A fixed clock: the comparison ids and created_at stamps of the corpus run
// are deterministic and re-derivable, never wall-clock noise.
const FIXED_NOW = () => '2026-10-22T10:00:00.000Z';

function readCorpus() {
  const raw = fs.readFileSync(CORPUS_PATH, 'utf8');
  return JSON.parse(raw);
}

function exclusionSignature(record) {
  return (record.excluded_candidates ?? [])
    .map((e) => `${e.candidate_id}:${e.exclusion_reason}`)
    .sort()
    .join(',');
}

function runCorpus(corpus) {
  const results = [];
  for (const testCase of corpus.cases) {
    // The corpus speaks snake_case (it is a committed JSON artifact); the
    // engine API speaks camelCase. The translation is explicit and lossless.
    const { basis, candidates, optimization_boundaries, evidence_refs } = testCase.input;
    const engineInput = {
      basis,
      candidates,
      optimizationBoundaries: optimization_boundaries ?? [],
      evidenceRefs: evidence_refs ?? [],
      now: FIXED_NOW
    };
    const record = compareExecutors(engineInput);
    const { valid, issues } = validateCrossModelComparison(record);
    const expected = testCase.expectation;
    const mismatches = [];
    if (record.verdict !== expected.verdict) mismatches.push(`verdict: expected ${expected.verdict}, got ${record.verdict}`);
    if (record.outcome_reason !== expected.outcome_reason) mismatches.push(`reason: expected ${expected.outcome_reason}, got ${record.outcome_reason}`);
    const expectedPreferred = expected.preferred_candidate_id ?? null;
    if (record.preferred_candidate_id !== expectedPreferred) mismatches.push(`preferred: expected ${expectedPreferred}, got ${record.preferred_candidate_id}`);
    const expectedExclusions = [...(expected.excluded ?? [])]
      .map((e) => `${e.candidate_id}:${e.exclusion_reason}`)
      .sort()
      .join(',');
    const actualExclusions = exclusionSignature(record);
    if (actualExclusions !== expectedExclusions) mismatches.push(`exclusions: expected [${expectedExclusions}], got [${actualExclusions}]`);
    if (!valid) mismatches.push(`record invalid against its own contract: ${issues.join('; ')}`);
    results.push({
      case_id: testCase.case_id,
      case_class: testCase.case_class ?? null,
      expected: { verdict: expected.verdict, outcome_reason: expected.outcome_reason, preferred_candidate_id: expectedPreferred, excluded: expected.excluded ?? [] },
      actual: { verdict: record.verdict, outcome_reason: record.outcome_reason, preferred_candidate_id: record.preferred_candidate_id, excluded_candidates: record.excluded_candidates, comparison_id: record.comparison_id },
      pass: mismatches.length === 0,
      mismatches
    });
  }
  // Determinism: the same inputs must produce the same comparison id, byte
  // for byte, on a second execution.
  const probe = corpus.cases[0];
  const { basis, candidates, optimization_boundaries, evidence_refs } = probe.input;
  const probeInput = { basis, candidates, optimizationBoundaries: optimization_boundaries ?? [], evidenceRefs: evidence_refs ?? [], now: FIXED_NOW };
  const first = compareExecutors(probeInput);
  const second = compareExecutors(probeInput);
  const deterministic = first.comparison_id === second.comparison_id && JSON.stringify(first) === JSON.stringify(second);
  return { results, deterministic };
}

function main(argv) {
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex !== -1 ? path.resolve(process.cwd(), argv[outIndex + 1]) : null;

  const corpus = readCorpus();
  const { results, deterministic } = runCorpus(corpus);
  const passed = results.filter((r) => r.pass).length;

  const summary = {
    corpus_id: corpus.corpus_id,
    kind: corpus.kind,
    engine_schema_version: CROSS_MODEL_COMPARISON_SCHEMA_VERSION,
    total: results.length,
    passed,
    failed: results.length - passed,
    deterministic,
    case_classes: results.reduce((acc, r) => { if (r.case_class) acc[r.case_class] = (acc[r.case_class] ?? 0) + 1; return acc; }, {}),
    verdict_counts: results.reduce((acc, r) => { acc[r.actual.verdict] = (acc[r.actual.verdict] ?? 0) + 1; return acc; }, {}),
    limits: corpus.limits ?? []
  };

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'cross-model-comparisons.json'), `${JSON.stringify({ summary, results }, null, 2)}\n`);
  }

  for (const result of results) {
    if (!result.pass) {
      console.error(`CASE ${result.case_id} FAILED: ${result.mismatches.join(' | ')}`);
    }
  }
  if (!deterministic) {
    console.error('DETERMINISM FAILED: the same corpus inputs produced different records on a second execution');
  }
  console.log(`cross-model corpus ${corpus.corpus_id}: ${passed}/${results.length} cases as expected${deterministic ? ', deterministic' : ', NON-DETERMINISTIC'}`);
  const outcomeClass = new Set(results.map((r) => r.actual.verdict));
  console.log(`verdict coverage: ${[...outcomeClass].sort().join(', ')}`);

  process.exitCode = passed === results.length && deterministic ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2));
}
