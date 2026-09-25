// MAWS vNext routing — verified-only candidate scoring (MAWS-VN-601, OD-13).
//
// Qualification is the hard routing gate; this module only ranks candidates
// INSIDE the already-eligible set using bounded, evidence-backed runtime
// signals. Unverified self-report and unsupported quality inference are
// forbidden routing signals (OD-13): any candidate carrying a signal that is
// outside the allowed enum, missing/empty evidence, self-referential
// evidence, or a non-finite value scores exactly 0 and is flagged
// UNVERIFIED_SIGNAL_REJECTED so it can never win a routing decision.
//
// Pure module: no I/O, no randomness, no authority widening. Weights are
// caller-supplied multipliers (the bounded routing policy may express
// direction, including negative weights for cost-like signals); there is no
// hidden normalization. A missing or malformed weight contributes 0
// (fail-closed: no policy means no scoring influence).
import { FailClosedError } from '../vnext/util.mjs';

export const ALLOWED_SIGNALS = Object.freeze([
  'verified_success',
  'verification_failure_rate',
  'latency',
  'cost',
  'retry_rate',
  'timeout_rate',
  'provider_availability'
]);

export const UNVERIFIED_SIGNAL_FLAG = 'UNVERIFIED_SIGNAL_REJECTED';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Structural self-score detection. Evidence provenance itself is established
// upstream (the verification plane); here a reference is treated as a
// self-score when it names the reporting executor itself or uses an explicit
// self-report marker. Self-scores never contribute (OD-13).
function isSelfScoredEvidence(executorId, evidenceRef) {
  const ref = evidenceRef.trim();
  const lower = ref.toLowerCase();
  if (ref === executorId) {
    return true;
  }
  if (lower === 'self' || lower.startsWith('self:') || lower.startsWith('self/') || lower.startsWith('self_report')) {
    return true;
  }
  return ref.split(/[/#?&=:]/).includes(executorId);
}

function isValidSignal(executorId, name, signal) {
  if (!ALLOWED_SIGNALS.includes(name)) {
    return false;
  }
  if (signal === null || typeof signal !== 'object' || Array.isArray(signal)) {
    return false;
  }
  if (typeof signal.value !== 'number' || !Number.isFinite(signal.value)) {
    return false;
  }
  if (!isNonEmptyString(signal.evidence_ref)) {
    return false;
  }
  if (isSelfScoredEvidence(executorId, signal.evidence_ref)) {
    return false;
  }
  return true;
}

function weightFor(weights, name) {
  const weight = weights[name];
  if (typeof weight === 'number' && Number.isFinite(weight)) {
    return weight;
  }
  return 0;
}

function scoreCandidate(candidate, weights) {
  if (candidate === null || typeof candidate !== 'object' || !isNonEmptyString(candidate.executor_id)) {
    throw new FailClosedError('SCORING_INPUT_INVALID', 'each candidate must be an object with a non-empty executor_id');
  }
  const signals = candidate.signals === undefined ? {} : candidate.signals;
  if (signals === null || typeof signals !== 'object' || Array.isArray(signals)) {
    throw new FailClosedError('SCORING_INPUT_INVALID', `candidate ${candidate.executor_id}: signals must be an object`);
  }

  let score = 0;
  const contributingSignals = [];
  for (const [name, signal] of Object.entries(signals)) {
    if (!isValidSignal(candidate.executor_id, name, signal)) {
      // One unverified/unknown/malformed signal poisons the whole candidate:
      // score 0 and an explicit flag. It can never win via scoring.
      return {
        executor_id: candidate.executor_id,
        score: 0,
        contributing_signals: [],
        flags: [UNVERIFIED_SIGNAL_FLAG]
      };
    }
    const weight = weightFor(weights, name);
    score += weight * signal.value;
    if (weight !== 0) {
      contributingSignals.push({ signal: name, evidence_ref: signal.evidence_ref.trim() });
    }
  }

  return {
    executor_id: candidate.executor_id,
    score,
    contributing_signals: contributingSignals,
    flags: []
  };
}

// scoreCandidates({ candidates, weights }) ranks candidates by weighted,
// verified-only runtime signals. Missing signals contribute 0. The output is
// deterministic for identical input.
export function scoreCandidates({ candidates, weights = {} } = {}) {
  if (!Array.isArray(candidates)) {
    throw new FailClosedError('SCORING_INPUT_INVALID', 'candidates must be an array');
  }
  if (weights === null || typeof weights !== 'object' || Array.isArray(weights)) {
    throw new FailClosedError('SCORING_INPUT_INVALID', 'weights must be an object mapping signal name to finite number');
  }
  return candidates.map((candidate) => scoreCandidate(candidate, weights));
}
