// MAWS vNext — S9 evaluation of the eight advisory semantic signals
// (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S9, building on the S3 wave 2
// signal layer).
//
// WHY THIS EXISTS
// The wave 2 signal layer was calibrated against the LIVE corpus: 107 raw
// candidates before the calibration, 0 after it. That number says the
// detectors are quiet on one corpus. It does not say whether they are
// CORRECT: a detector that never fires and a detector that fires on the wrong
// occurrences both produce "0 candidates" on a clean tree.
//
// A detector can only be measured against cases whose answer is known
// independently of the detector. This module therefore evaluates the eight
// signals against an INDEPENDENT case corpus: every case states, by
// construction, whether the class holds in that case, and the measurement
// reports what the detector did with it.
//
// WHAT IS REPORTED, AND WHAT IS NOT
// Per class: the true positives, the FALSE POSITIVES, the FALSE NEGATIVES and
// the true negatives, plus precision and recall. The three numbers are
// reported SEPARATELY on purpose: a detector that fires on everything has a
// recall of 1 and a precision of 0, and a detector that never fires has the
// opposite. Averaging them into one score would hide exactly the defect the
// measurement exists to find.
//
// The coverage is reported next to them: a class with no independent case has
// no measured precision and no measured recall, and that gap is stated
// rather than presented as a clean result.
//
// THE LIMIT, STATED PLAINLY
// The labels are CONSTRUCTED. This is a self-measurement of the detectors
// against cases whose answer was fixed when the case was written, NOT an
// owner review. The eight classes remain not statically analyzable, the
// candidates remain advisory, and a candidate remains a hint whose
// classification the owner makes. This module decides nothing.
import fs from 'node:fs';
import path from 'node:path';

import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { collectAdvisorySignals } from '../instructions/instruction-semantic-signals.mjs';
import { createScratchRoot, removeScratchRoot, safeRemove } from '../../scripts/tools/safe-remove.mjs';

export const SIGNAL_EVALUATION_SCHEMA_VERSION = '1.0.0';

// The eight semantic classes of the section 6.2 taxonomy that the wave 2
// signal layer points at. The two statically decidable classes (STALE_
// REFERENCE, INVALID_COMMAND) are not part of this measurement: they are
// decided by the reference graph, not by a candidate signal.
export const SEMANTIC_SIGNAL_CLASSES = Object.freeze([
  'RULE_CONFLICT',
  'PRECEDENCE_CONFLICT',
  'OVERCONSTRAINT',
  'REDUNDANT_INSTRUCTION',
  'CONTEXT_OVERLOAD',
  'AUTHORITY_LEAK',
  'MODEL_DRIFT',
  'SKILL_ROUTING_AMBIGUITY'
]);

function requireCase(entry, index) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new FailClosedError('SIGNAL_CORPUS_INVALID', `case ${index} must be an object`);
  }
  if (typeof entry.case_id !== 'string' || entry.case_id.length < 1) {
    throw new FailClosedError('SIGNAL_CORPUS_INVALID', `case ${index} must carry a case_id`);
  }
  if (!SEMANTIC_SIGNAL_CLASSES.includes(entry.finding_class)) {
    throw new FailClosedError(
      'SIGNAL_CORPUS_INVALID',
      `case ${entry.case_id} names a class outside the eight semantic signal classes: ${entry.finding_class}`
    );
  }
  if (entry.expectation !== 'PRESENT' && entry.expectation !== 'ABSENT') {
    throw new FailClosedError(
      'SIGNAL_CORPUS_INVALID',
      `case ${entry.case_id} must state an expectation of PRESENT or ABSENT`
    );
  }
  if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
    throw new FailClosedError('SIGNAL_CORPUS_INVALID', `case ${entry.case_id} must declare its instruction sources`);
  }
  if (entry.files === null || typeof entry.files !== 'object' || Array.isArray(entry.files)) {
    throw new FailClosedError('SIGNAL_CORPUS_INVALID', `case ${entry.case_id} must declare its files`);
  }
  return entry;
}

// A corpus file key is DATA, and data names a path only inside the case
// directory. A key that resolves outside it - a `../` component, an absolute
// path - is refused before anything is created: the corpus describes a
// fixture tree, and a fixture tree that escapes its directory would be a
// write outside what this evaluation owns.
function caseFilePath(root, relative) {
  const rootResolved = path.resolve(root);
  const absolute = path.resolve(root, relative);
  if (absolute !== rootResolved && !absolute.startsWith(`${rootResolved}${path.sep}`)) {
    throw new FailClosedError(
      'CORPUS_PATH_OUTSIDE_CASE',
      `the corpus file key "${relative}" resolves outside the case directory; a fixture tree stays inside its case`
    );
  }
  return absolute;
}

// Materialize one case into its own clean directory. Every case is measured
// in a fresh tree, so no case can see the files of another one and the
// measurement of one case cannot influence the next.
//
// The trees live inside ONE marked scratch root, and the directory name is
// the case INDEX, never the case id: a case id is data, and data does not
// become a path. The removal of a case tree goes through the repository's
// safe primitive with the scratch root as the boundary, so no removal can
// reach outside what this evaluation created.
function materializeCase(scratchRoot, index, entry) {
  const root = path.join(scratchRoot, `case-${index}`);
  fs.mkdirSync(root, { recursive: true });
  for (const [relative, content] of Object.entries(entry.files)) {
    const absolute = caseFilePath(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

function candidatesOfClass(signals, findingClass) {
  return signals.filter((entry) => entry.finding_class === findingClass);
}

// evaluateSignalCases({ cases }) ->
//   { schema_version, corpus_digest, classes, coverage, case_results, limits }
//
// The corpus digest binds the measurement to the exact case corpus, so a
// number can always be traced back to the cases that produced it.
export function evaluateSignalCases({ cases } = {}) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new FailClosedError('SIGNAL_CORPUS_INVALID', 'the case corpus must be a non-empty array');
  }
  const entries = cases.map((entry, index) => requireCase(entry, index));
  const corpusDigest = sha256Hex(canonicalJson(entries));

  const caseResults = [];
  const scratch = createScratchRoot({ prefix: 'maws-s9-signal-' });
  try {
    for (const [index, entry] of entries.entries()) {
      const root = materializeCase(scratch.root, index, entry);
      let signals;
      try {
        const graph = { nodes: entry.sources.map((source) => ({
          path: source.path,
          role: source.role,
          authority_class: source.authority_class
        })) };
        signals = collectAdvisorySignals({ root, graph });
      } finally {
        safeRemove({ target: root, boundary: scratch.root, recursive: true });
      }
      const candidates = candidatesOfClass(signals.signals, entry.finding_class);
      caseResults.push({
        case_id: entry.case_id,
        finding_class: entry.finding_class,
        expectation: entry.expectation,
        construction: typeof entry.construction === 'string' ? entry.construction : '',
        candidate_count: candidates.length,
        candidates: candidates.map((candidate) => ({
          source_path: candidate.source_path,
          line: candidate.line,
          observed_problem: candidate.observed_problem
        })),
        detected: candidates.length > 0
      });
    }
  } finally {
    removeScratchRoot({ root: scratch.root });
  }

  const classes = SEMANTIC_SIGNAL_CLASSES.map((findingClass) => {
    const relevant = caseResults.filter((result) => result.finding_class === findingClass);
    const present = relevant.filter((result) => result.expectation === 'PRESENT');
    const absent = relevant.filter((result) => result.expectation === 'ABSENT');
    const truePositive = present.filter((result) => result.detected).length;
    const falseNegative = present.length - truePositive;
    const falsePositive = absent.filter((result) => result.detected).length;
    const trueNegative = absent.length - falsePositive;
    const precisionDenominator = truePositive + falsePositive;
    const recallDenominator = truePositive + falseNegative;
    return {
      finding_class: findingClass,
      cases_present: present.length,
      cases_absent: absent.length,
      true_positive: truePositive,
      false_positive: falsePositive,
      false_negative: falseNegative,
      true_negative: trueNegative,
      precision: precisionDenominator > 0 ? truePositive / precisionDenominator : null,
      recall: recallDenominator > 0 ? truePositive / recallDenominator : null,
      coverage_gap: relevant.length === 0,
      missed_cases: present.filter((result) => !result.detected).map((result) => result.case_id),
      overfired_cases: absent.filter((result) => result.detected).map((result) => result.case_id)
    };
  });

  const classesWithoutCases = classes
    .filter((entry) => entry.coverage_gap)
    .map((entry) => entry.finding_class);

  return {
    schema_version: SIGNAL_EVALUATION_SCHEMA_VERSION,
    corpus_digest: corpusDigest,
    classes,
    coverage: {
      classes_with_cases: classes.filter((entry) => !entry.coverage_gap).map((entry) => entry.finding_class),
      classes_without_cases: classesWithoutCases,
      case_count: caseResults.length
    },
    case_results: caseResults,
    limits: [
      'The labels are CONSTRUCTED: each case states by construction whether the class holds. This is a self-measurement of the detector against constructed cases, not an owner review.',
      'The eight classes remain not statically analyzable and their candidates remain advisory. A candidate is a hint; the classification is the owner\'s judgement (spec section 6.5).',
      'Precision and recall are measured per class over the independent case corpus. They do not measure the live corpus, where the calibrated wave 2 layer reports 0 candidates.',
      'A class without an independent case has no measured precision and no measured recall. That gap is a coverage gap, never a clean result.'
    ]
  };
}
