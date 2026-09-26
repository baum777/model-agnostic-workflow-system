// Jev model resolution tracking (MAWS-VN-202, OD-18 / OD-12).
//
// Development may request the moving alias "jev-latest", but every decision
// receipt must record the resolved version returned by TypeSafe. When the
// alias resolves to a different concrete version than a previous resolution,
// that is alias drift and a qualification-fingerprint/materiality event; it
// must never be silently treated as identical behavior. Drift classification:
//   NON_MATERIAL — no previous resolution, or identical resolution;
//   MATERIAL     — previous and current are both concrete versions and differ;
//   UNKNOWN      — they differ but at least one side is not concrete (fail
//                  closed: UNKNOWN is unroutable without requalification).
import { FailClosedError } from '../../vnext/util.mjs';

// A concrete model id carries a numeric version. TypeSafe-direct ids end in
// a semver triple (e.g. jev-1.13.0); OpenRouter Decisions snapshots carry a
// major.minor release plus a dated snapshot suffix (e.g.
// typesafe/jev-1.13-20260917). Aliases ("jev-latest", "~typesafe/jev-latest")
// and the wildcard "*" are not concrete.
function isConcreteModelId(modelId) {
  return typeof modelId === 'string' && modelId !== '' && modelId !== '*'
    && /\d+\.\d+(\.\d+)?(-[A-Za-z0-9]+)*$/.test(modelId);
}

export function recordResolution(requestedModel, resolvedModel, previousResolvedModel) {
  const invalid = (detail) => new FailClosedError('MODEL_RESOLUTION_INVALID', `model resolution rejected: ${detail}`);
  if (typeof requestedModel !== 'string' || requestedModel === '') {
    throw invalid('requestedModel must be a non-empty string');
  }
  if (typeof resolvedModel !== 'string' || resolvedModel === '') {
    throw invalid('resolvedModel must be a non-empty string');
  }
  if (resolvedModel === '*') {
    throw invalid('resolvedModel must be a concrete resolved id, not the "*" wildcard');
  }
  let previous = null;
  if (previousResolvedModel !== null && previousResolvedModel !== undefined) {
    if (typeof previousResolvedModel !== 'string' || previousResolvedModel === '') {
      throw invalid('previousResolvedModel must be null or a non-empty string');
    }
    previous = previousResolvedModel;
  }
  const aliasDrift = previous !== null && previous !== resolvedModel;
  let driftClass;
  if (!aliasDrift) {
    driftClass = 'NON_MATERIAL';
  } else if (isConcreteModelId(previous) && isConcreteModelId(resolvedModel)) {
    driftClass = 'MATERIAL';
  } else {
    driftClass = 'UNKNOWN';
  }
  return Object.freeze({
    requested_model: requestedModel,
    resolved_model: resolvedModel,
    alias_drift: aliasDrift,
    drift_class: driftClass
  });
}
