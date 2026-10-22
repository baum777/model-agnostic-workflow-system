// MAWS vNext — S9 regression gate (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S9
// "Regression and Rollback").
//
// WHAT THIS IS
// A comparison of two versions of the same subject: the baseline revision and
// the candidate revision. The gate answers exactly one question — did the
// candidate regress anything that matters? — and it answers it from measured
// numbers, never from an opinion about the change.
//
// WHAT THIS IS NOT
// The gate is not an approval frontdoor. It never promotes, never adopts,
// never qualifies, never writes and never grants authority. A candidate that
// passes every criterion here is a candidate that MAY BE PROPOSED for the
// owner-governed promotion path (S8); it is not an adopted skill. The record
// therefore carries `adoption_authorized: false` and `authority_granted:
// false` as constants, and an improved score metric authorizes nothing
// (spec section 13.4: Eval PASS != Authority).
//
// THE FAIL-CLOSED POSTURE
// A comparison that cannot be decided on complete evidence is BLOCKED. It is
// never NO_REGRESSION. Missing evidence, a corpus mismatch, an unmeasured
// blocking criterion or a blocked security gate all mean: the gate refuses to
// answer, and the candidate is not accepted.
//
// THE SEPARATION OF CONCERNS
// Two things are measured and they are kept apart:
//   - the CRITERIA (routing accuracy, output assertions, security regressions,
//     advisory instruction-integrity candidates) say how the candidate
//     compares, as a matter of degree;
//   - the GOVERNANCE INVARIANTS (evidence complete, one corpus, two distinct
//     revisions, no adoption) say whether the comparison is admissible at
//     all.
// A governance failure is not a matter of degree. It is a refusal, and no
// amount of metric improvement offsets it: a candidate that routes better,
// asserts more and costs less still fails when it carries a security
// regression.
import { FailClosedError, canonicalJson, sha256Hex, nowIso } from '../vnext/util.mjs';

export const REGRESSION_COMPARISON_SCHEMA_VERSION = '1.0.0';
export const REGRESSION_COMPARISON_CONTRACT = 'core/contracts/regression-comparison.schema.json';

// The closed criterion set. `blocking` says whether a regression of the
// criterion rejects the candidate.
//
// INSTRUCTION_INTEGRITY_CANDIDATES is deliberately NOT blocking: the S3 wave 2
// candidates are advisory by construction (spec section 6.5 — a semantic
// candidate is a hint, the classification is the owner's judgement). A rise in
// the candidate count is therefore an OBSERVATION that is carried in the
// record, and it never decides the verdict on its own.
export const REGRESSION_CRITERIA = Object.freeze([
  { criterion: 'SKILL_ROUTING_ACCURACY', blocking: true, direction: 'higher_is_better' },
  { criterion: 'OUTPUT_ASSERTION_PASS_RATE', blocking: true, direction: 'higher_is_better' },
  { criterion: 'SECURITY_REGRESSION_COUNT', blocking: true, direction: 'lower_is_better' },
  { criterion: 'INSTRUCTION_INTEGRITY_CANDIDATES', blocking: false, direction: 'lower_is_better' }
]);

// The closed governance invariant set. These are the ADMISSIBILITY checks:
// they say whether the comparison can be adjudicated at all. The security
// dimension is not here but in the criteria, as the blocking criterion
// SECURITY_REGRESSION_COUNT: a candidate that carries a security regression
// is REJECTED, and no improvement in any other criterion offsets it.
export const GOVERNANCE_INVARIANTS = Object.freeze([
  'EVIDENCE_COMPLETE',
  'SAME_CORPUS',
  'SAME_SUBJECT',
  'DISTINCT_REVISION',
  'ADOPTION_NOT_AUTHORIZED'
]);

const EPSILON = 1e-12;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireRecord(record, role) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new FailClosedError('REGRESSION_INPUT_INVALID', `${role} record must be an object`);
  }
  if (typeof record.eval_id !== 'string' || record.eval_id.length < 1) {
    throw new FailClosedError('REGRESSION_INPUT_INVALID', `${role} record must carry an eval_id`);
  }
  return record;
}

function ratio(numerator, denominator) {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

// The measured value of one criterion on one side of the comparison.
function measureCriterion(criterion, side) {
  const { record } = side;
  switch (criterion) {
    case 'SKILL_ROUTING_ACCURACY':
      return ratio(record?.metrics?.routing?.decisions_matched, record?.metrics?.routing?.decisions_expected);
    case 'OUTPUT_ASSERTION_PASS_RATE':
      return ratio(record?.metrics?.output?.assertions_passed, record?.metrics?.output?.assertions_total);
    case 'SECURITY_REGRESSION_COUNT': {
      const value = record?.security_gate?.security_regressions;
      return isFiniteNumber(value) ? value : null;
    }
    case 'INSTRUCTION_INTEGRITY_CANDIDATES': {
      const value = side.instructionIntegrity?.candidate_count;
      return isFiniteNumber(value) ? value : null;
    }
    default:
      return null;
  }
}

function criterionVerdict(criterion, baselineValue, candidateValue) {
  if (!isFiniteNumber(baselineValue) || !isFiniteNumber(candidateValue)) return 'NOT_MEASURED';
  if (Math.abs(candidateValue - baselineValue) < EPSILON) return 'EQUAL';
  const better = criterion.direction === 'higher_is_better'
    ? candidateValue > baselineValue
    : candidateValue < baselineValue;
  return better ? 'IMPROVED' : 'REGRESSED';
}

// The verdict of one criterion, derived from its two measured values.
//
// This is the SINGLE definition of that verdict: the gate produces it and
// the contract validator re-derives it from the values a record states, so
// a record cannot claim a verdict its own numbers contradict.
//
// The security criterion is NOT judged by the relative comparison alone. A
// candidate that carries ONE security regression is not acceptable, however
// it compares with a baseline that carried two: the security verdict is
// ABSOLUTE, and the relative delta stays the arithmetic difference. This
// mirrors the S5 rule R1, where any security regression forces the blocked
// outcome. Without it, a candidate that halves the regressions while still
// carrying one would pass the comparison.
export function criterionVerdictFor(criterion, baselineValue, candidateValue) {
  if (!isFiniteNumber(baselineValue) || !isFiniteNumber(candidateValue)) return 'NOT_MEASURED';
  if (criterion === 'SECURITY_REGRESSION_COUNT') {
    if (candidateValue > 0) return 'REGRESSED';
    if (baselineValue > 0) return 'IMPROVED';
    return 'EQUAL';
  }
  return criterionVerdict(
    REGRESSION_CRITERIA.find((definition) => definition.criterion === criterion),
    baselineValue,
    candidateValue
  );
}

function sideEvidence(side) {
  const reproducibility = side.record?.reproducibility ?? {};
  return {
    eval_id: side.record?.eval_id ?? null,
    content_digest: typeof reproducibility.content_digest === 'string' ? reproducibility.content_digest : null,
    corpus_digest: typeof reproducibility.corpus_digest === 'string' ? reproducibility.corpus_digest : null,
    subject_ref: side.record?.subject?.ref ?? null,
    subject_kind: side.record?.subject?.kind ?? null,
    version: typeof side.version === 'string' && side.version.length > 0 ? side.version : null
  };
}

// The evidence of one side is complete when the record names the content it
// measured, the corpus it was measured over, the subject it measured, its
// version, and the metrics the criteria are derived from.
function evidenceComplete(side, unmeasuredCriteria) {
  const evidence = sideEvidence(side);
  const missing = [];
  if (!evidence.content_digest) missing.push('reproducibility.content_digest');
  if (!evidence.corpus_digest) missing.push('reproducibility.corpus_digest');
  if (!evidence.subject_ref) missing.push('subject.ref');
  if (!evidence.version) missing.push('version');
  if (unmeasuredCriteria.length > 0) {
    missing.push(`unmeasured blocking criteria: ${unmeasuredCriteria.join(', ')}`);
  }
  return { complete: missing.length === 0, missing };
}

// compareBaselineCandidate({ baseline, candidate, instructionIntegrity, now })
//
//   baseline / candidate: { version, record, instructionIntegrity? }
//     `record` is the S5 behavioral evaluation record of that side.
//     `instructionIntegrity` is { candidate_count, by_class } as measured by
//     the S3 instruction audit of that side.
//
// The returned object is a RegressionComparison record (contract
// core/contracts/regression-comparison.schema.json). The function is pure:
// it reads its arguments, writes nothing and mutates nothing.
export function compareBaselineCandidate({ baseline, candidate, evidenceRefs = [], now } = {}) {
  const baselineSide = { ...(baseline ?? {}) };
  const candidateSide = { ...(candidate ?? {}) };
  requireRecord(baselineSide.record, 'baseline');
  requireRecord(candidateSide.record, 'candidate');

  const criteria = REGRESSION_CRITERIA.map((definition) => {
    const baselineValue = measureCriterion(definition.criterion, baselineSide);
    const candidateValue = measureCriterion(definition.criterion, candidateSide);
    const verdict = criterionVerdictFor(definition.criterion, baselineValue, candidateValue);
    const measured = verdict !== 'NOT_MEASURED';
    return {
      criterion: definition.criterion,
      blocking: definition.blocking,
      baseline_value: measured ? baselineValue : null,
      candidate_value: measured ? candidateValue : null,
      delta: measured ? candidateValue - baselineValue : null,
      verdict
    };
  });

  const unmeasuredBlocking = criteria
    .filter((entry) => entry.blocking && entry.verdict === 'NOT_MEASURED')
    .map((entry) => entry.criterion);

  const baselineEvidence = sideEvidence(baselineSide);
  const candidateEvidence = sideEvidence(candidateSide);

  const baselineComplete = evidenceComplete(baselineSide, unmeasuredBlocking);
  const candidateComplete = evidenceComplete(candidateSide, unmeasuredBlocking);
  const sameCorpus = Boolean(
    baselineEvidence.corpus_digest
    && candidateEvidence.corpus_digest
    && baselineEvidence.corpus_digest === candidateEvidence.corpus_digest
  );
  const distinctRevision = Boolean(
    baselineEvidence.eval_id !== candidateEvidence.eval_id
    || baselineEvidence.content_digest !== candidateEvidence.content_digest
  );
  // A comparison of two different subjects proves nothing about either of
  // them, even when both were measured over the same corpus. The two sides
  // must describe the SAME subject: the same kind and the same reference.
  const sameSubject = Boolean(
    baselineEvidence.subject_ref
    && candidateEvidence.subject_ref
    && baselineEvidence.subject_ref === candidateEvidence.subject_ref
    && baselineEvidence.subject_kind === candidateEvidence.subject_kind
  );

  const invariants = [
    {
      invariant: 'EVIDENCE_COMPLETE',
      holds: baselineComplete.complete && candidateComplete.complete,
      detail: `baseline missing: ${baselineComplete.missing.length > 0 ? baselineComplete.missing.join(', ') : 'nothing'}; candidate missing: ${candidateComplete.missing.length > 0 ? candidateComplete.missing.join(', ') : 'nothing'}`
    },
    {
      invariant: 'SAME_CORPUS',
      holds: sameCorpus,
      detail: sameCorpus
        ? `both sides were measured over corpus ${baselineEvidence.corpus_digest}`
        : `the two sides name different corpora (baseline ${baselineEvidence.corpus_digest ?? 'none'}, candidate ${candidateEvidence.corpus_digest ?? 'none'})`
    },
    {
      invariant: 'SAME_SUBJECT',
      holds: sameSubject,
      detail: sameSubject
        ? `both sides measure the same subject (${baselineEvidence.subject_kind}: ${baselineEvidence.subject_ref})`
        : `the two sides measure different subjects (baseline ${baselineEvidence.subject_kind ?? 'none'}: ${baselineEvidence.subject_ref ?? 'none'}, candidate ${candidateEvidence.subject_kind ?? 'none'}: ${candidateEvidence.subject_ref ?? 'none'}); a comparison of two subjects proves nothing about either`
    },
    {
      invariant: 'DISTINCT_REVISION',
      holds: distinctRevision,
      detail: distinctRevision
        ? `baseline ${baselineEvidence.eval_id} and candidate ${candidateEvidence.eval_id} are two distinct measurements`
        : 'baseline and candidate name the same evaluation and the same content; a comparison needs two sides'
    },
    {
      invariant: 'ADOPTION_NOT_AUTHORIZED',
      holds: true,
      detail: 'this comparison grants no adoption and no authority; an improved metric authorizes nothing (spec section 13.4)'
    }
  ];

  const failedInvariants = invariants.filter((entry) => !entry.holds).map((entry) => entry.invariant);
  const blockingRegressions = criteria
    .filter((entry) => entry.blocking && entry.verdict === 'REGRESSED')
    .map((entry) => entry.criterion);

  const advisoryObservations = [];
  for (const entry of criteria) {
    if (entry.blocking || entry.verdict !== 'REGRESSED') continue;
    let detail = `${entry.criterion} moved from ${entry.baseline_value} to ${entry.candidate_value} (${entry.delta})`;
    if (entry.criterion === 'INSTRUCTION_INTEGRITY_CANDIDATES') {
      const byClass = candidateSide.instructionIntegrity?.by_class ?? {};
      const named = Object.keys(byClass).sort().map((key) => `${key}=${byClass[key]}`).join(', ');
      detail += `; advisory candidates stay advisory and never gate (spec section 6.5)${named ? `; candidate classes: ${named}` : ''}`;
    }
    advisoryObservations.push({ observation: entry.criterion, detail });
  }

  let verdict = 'NO_REGRESSION';
  if (failedInvariants.length > 0) {
    verdict = 'BLOCKED';
  } else if (blockingRegressions.length > 0) {
    verdict = 'REGRESSION_DETECTED';
  }

  const comparisonId = `rgr_${sha256Hex(canonicalJson({
    baseline: baselineEvidence,
    candidate: candidateEvidence,
    criteria
  })).slice(0, 16)}`;

  return {
    schema_version: REGRESSION_COMPARISON_SCHEMA_VERSION,
    comparison_id: comparisonId,
    created_at: nowIso(typeof now === 'function' ? now : undefined),
    baseline: {
      eval_id: baselineEvidence.eval_id,
      version: baselineEvidence.version ?? 'unversioned',
      content_digest: baselineEvidence.content_digest ?? 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      corpus_digest: baselineEvidence.corpus_digest ?? 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      subject_kind: baselineEvidence.subject_kind ?? 'harness',
      subject_ref: baselineEvidence.subject_ref ?? 'unknown'
    },
    candidate: {
      eval_id: candidateEvidence.eval_id,
      version: candidateEvidence.version ?? 'unversioned',
      content_digest: candidateEvidence.content_digest ?? 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      corpus_digest: candidateEvidence.corpus_digest ?? 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      subject_kind: candidateEvidence.subject_kind ?? 'harness',
      subject_ref: candidateEvidence.subject_ref ?? 'unknown'
    },
    criteria,
    governance_invariants: invariants,
    verdict,
    blocking_regressions: blockingRegressions,
    advisory_observations: advisoryObservations,
    candidate_rejected: verdict !== 'NO_REGRESSION',
    adoption_authorized: false,
    authority_granted: false,
    evidence_refs: evidenceRefs.length > 0
      ? [...evidenceRefs]
      : [
        `eval:${baselineEvidence.eval_id}`,
        `eval:${candidateEvidence.eval_id}`
      ]
  };
}
