// MAWS vNext — Phase 3 qualification runtime: profile subsumption (OD-11).
// Qualification reuse is allowed only through an explicit formal
// profile-subsumption relation: every dimension of the subsuming profile must
// rank at least as broad as the subsumed one (safe downward reuse only).
// No heuristic similarity, no upward inference. Pure functions; a subsumption
// relation never creates authority.
import { FailClosedError } from '../vnext/util.mjs';

// Ordered narrowest -> broadest per maws-vnext-common.schema.json $defs.
export const DIMENSION_ORDERS = {
  tools: ['none', 'read', 'write', 'execute'],
  effects: ['none', 'ephemeral', 'workspace', 'external'],
  context: ['none', 'bounded', 'session_full'],
  network: ['none', 'allowlisted', 'open'],
  verification: ['none', 'self_reported', 'verified', 'independently_verified']
};

// delegation is numeric (integer depth 0..3), not part of DIMENSION_ORDERS.
export const DIMENSIONS = ['tools', 'effects', 'context', 'network', 'delegation', 'verification'];

const DELEGATION_MIN = 0;
const DELEGATION_MAX = 3;

export function levelRank(dimension, level) {
  if (dimension === 'delegation') {
    if (!Number.isInteger(level) || level < DELEGATION_MIN || level > DELEGATION_MAX) {
      throw new FailClosedError(
        'QUALIFICATION_AMBIGUOUS',
        `unknown delegation depth ${JSON.stringify(level)}; expected integer ${DELEGATION_MIN}..${DELEGATION_MAX}`,
        { dimension, level }
      );
    }
    return level;
  }
  const order = DIMENSION_ORDERS[dimension];
  if (!order) {
    throw new FailClosedError(
      'QUALIFICATION_AMBIGUOUS',
      `unknown dimension ${JSON.stringify(dimension)}`,
      { dimension, level }
    );
  }
  const rank = order.indexOf(level);
  if (rank === -1) {
    throw new FailClosedError(
      'QUALIFICATION_AMBIGUOUS',
      `unknown level ${JSON.stringify(level)} for dimension ${dimension}`,
      { dimension, level }
    );
  }
  return rank;
}

function dimensionsOf(profile, role) {
  const dimensions = profile !== null && typeof profile === 'object' ? profile.dimensions : undefined;
  if (dimensions === null || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    throw new FailClosedError(
      'QUALIFICATION_AMBIGUOUS',
      `${role} profile has no dimensions object`,
      { profile }
    );
  }
  return dimensions;
}

// compareProfiles(subsumingProfile, subsumedProfile) -> { perDimension, allHold }
// perDimension matches the profile-subsumption contract's dimension_comparison
// entry shape: { subsuming_level, subsumed_level, holds }.
export function compareProfiles(subsumingProfile, subsumedProfile) {
  const subsumingDimensions = dimensionsOf(subsumingProfile, 'subsuming');
  const subsumedDimensions = dimensionsOf(subsumedProfile, 'subsumed');
  const perDimension = {};
  let allHold = true;
  for (const dimension of DIMENSIONS) {
    if (!(dimension in subsumingDimensions) || !(dimension in subsumedDimensions)) {
      throw new FailClosedError(
        'QUALIFICATION_AMBIGUOUS',
        `dimension ${dimension} is missing from one of the profiles; all six dimensions are mandatory`,
        { dimension }
      );
    }
    const subsumingLevel = subsumingDimensions[dimension];
    const subsumedLevel = subsumedDimensions[dimension];
    const holds = levelRank(dimension, subsumingLevel) >= levelRank(dimension, subsumedLevel);
    perDimension[dimension] = {
      subsuming_level: subsumingLevel,
      subsumed_level: subsumedLevel,
      holds
    };
    allHold = allHold && holds;
  }
  return { perDimension, allHold };
}

// subsumes() -> true only when EVERY dimension of the subsuming profile ranks
// at least as broad as the subsumed one (safe downward reuse).
export function subsumes(subsuming, subsumed) {
  return compareProfiles(subsuming, subsumed).allHold;
}

// evaluateSubsumptionRecord(record, subsumingProfile, subsumedProfile) -> issues[]
// Verifies a declared ProfileSubsumption record against the actual profiles:
// declared per-dimension levels and holds must match the computed comparison,
// the declared relation must match allHold, and the profile refs must match.
// An empty issues array means the record is consistent. Declarations are never
// trusted as computation; this is the re-verification seam.
export function evaluateSubsumptionRecord(record, subsumingProfile, subsumedProfile) {
  const issues = [];
  const comparison = compareProfiles(subsumingProfile, subsumedProfile);
  const wellFormed = record !== null && typeof record === 'object';
  const declared = wellFormed && typeof record.dimension_comparison === 'object' && record.dimension_comparison !== null
    ? record.dimension_comparison
    : {};

  for (const dimension of DIMENSIONS) {
    const computed = comparison.perDimension[dimension];
    const entry = declared[dimension];
    if (entry === null || typeof entry !== 'object') {
      issues.push(`dimension_comparison.${dimension} is missing or malformed`);
      continue;
    }
    if (entry.subsuming_level !== computed.subsuming_level) {
      issues.push(
        `dimension_comparison.${dimension}.subsuming_level is ${JSON.stringify(entry.subsuming_level)}, but the subsuming profile declares ${JSON.stringify(computed.subsuming_level)}`
      );
    }
    if (entry.subsumed_level !== computed.subsumed_level) {
      issues.push(
        `dimension_comparison.${dimension}.subsumed_level is ${JSON.stringify(entry.subsumed_level)}, but the subsumed profile declares ${JSON.stringify(computed.subsumed_level)}`
      );
    }
    if (entry.holds !== computed.holds) {
      issues.push(
        `dimension_comparison.${dimension}.holds is ${entry.holds}, but per-level comparison yields ${computed.holds}`
      );
    }
  }

  if (!wellFormed) {
    issues.push('subsumption record is missing or malformed');
    return issues;
  }

  const expectedRelation = comparison.allHold ? 'subsumes' : 'not_subsumes';
  if (record.relation !== expectedRelation) {
    issues.push(`relation is ${JSON.stringify(record.relation)}, but dimension comparison yields ${expectedRelation}`);
  }
  if (record.subsuming_profile_ref !== subsumingProfile.profile_id) {
    issues.push(
      `subsuming_profile_ref ${JSON.stringify(record.subsuming_profile_ref)} does not match subsuming profile id ${JSON.stringify(subsumingProfile.profile_id)}`
    );
  }
  if (record.subsumed_profile_ref !== subsumedProfile.profile_id) {
    issues.push(
      `subsumed_profile_ref ${JSON.stringify(record.subsumed_profile_ref)} does not match subsumed profile id ${JSON.stringify(subsumedProfile.profile_id)}`
    );
  }
  return issues;
}
