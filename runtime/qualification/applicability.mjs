// MAWS vNext — Phase 3 qualification runtime: qualification applicability
// (OD-09/OD-10/OD-11). Pure function with an injectable clock. Fail closed on
// ambiguity. Applicability is never authority: it only decides whether an
// existing qualification record covers a requested capability/profile pair.
//
// Profile coverage rules:
//   - exact execution_profile_ref match, OR
//   - an explicit ProfileSubsumption record (relation 'subsumes',
//     subsuming_profile_ref === qualification.execution_profile_ref,
//     subsumed_profile_ref === requestedProfileId) whose comparison is
//     RE-VERIFIED via compareProfiles against the actual profiles.
//     The declaration alone is never trusted.
import { FailClosedError } from '../vnext/util.mjs';
import { compareProfiles } from './profile-subsumption.mjs';

function parseTime(value, label) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', `${label} is not a parseable timestamp: ${value}`);
  }
  return ms;
}

// `now` may be an ISO string, a Date, a clock function returning an ISO
// string, or undefined (real clock).
function nowMilliseconds(now) {
  if (typeof now === 'function') return parseTime(now(), 'now');
  if (typeof now === 'string') return parseTime(now, 'now');
  if (now instanceof Date) return now.getTime();
  return Date.now();
}

function findProfile(profiles, profileId) {
  if (Array.isArray(profiles)) {
    const match = profiles.find((profile) => profile && profile.profile_id === profileId);
    return match === undefined ? null : match;
  }
  if (profiles !== null && typeof profiles === 'object') {
    const entry = profiles[profileId];
    return entry !== null && typeof entry === 'object' ? entry : null;
  }
  throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'profiles must be an array or an object map of execution profiles');
}

// isQualificationApplicable({ qualification, capabilityId, requestedProfileId,
// profiles, subsumptionRecords, now }) ->
//   { applicable: boolean, reason: null|'CAPABILITY_MISMATCH'|'PROFILE_NOT_APPLICABLE'|'STATE_NOT_QUALIFIED'|'EXPIRED'|'REVOKED'|'DISQUALIFIED' }
export function isQualificationApplicable({ qualification, capabilityId, requestedProfileId, profiles, subsumptionRecords, now }) {
  if (qualification === null || typeof qualification !== 'object') {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'qualification record is required');
  }

  if (qualification.capability_id !== capabilityId) {
    return { applicable: false, reason: 'CAPABILITY_MISMATCH' };
  }

  const state = qualification.state;
  if (state === 'REVOKED') {
    return { applicable: false, reason: 'REVOKED' };
  }
  if (state === 'DISQUALIFIED') {
    return { applicable: false, reason: 'DISQUALIFIED' };
  }
  if (state === 'EXPIRED') {
    return { applicable: false, reason: 'EXPIRED' };
  }
  if (typeof qualification.expires_at === 'string' && qualification.expires_at.length > 0) {
    if (parseTime(qualification.expires_at, 'qualification.expires_at') < nowMilliseconds(now)) {
      return { applicable: false, reason: 'EXPIRED' };
    }
  }
  if (state !== 'QUALIFIED') {
    return { applicable: false, reason: 'STATE_NOT_QUALIFIED' };
  }

  // Exact profile match covers the request without any subsumption lookup.
  if (qualification.execution_profile_ref === requestedProfileId) {
    return { applicable: true, reason: null };
  }

  // Subsumption path: an explicit declared relation plus mandatory
  // re-verification against the actual profiles. Never trust the declaration.
  const records = Array.isArray(subsumptionRecords) ? subsumptionRecords : [];
  for (const record of records) {
    if (record === null || typeof record !== 'object') continue;
    if (record.relation !== 'subsumes') continue;
    if (record.subsuming_profile_ref !== qualification.execution_profile_ref) continue;
    if (record.subsumed_profile_ref !== requestedProfileId) continue;
    const subsumingProfile = findProfile(profiles, record.subsuming_profile_ref);
    const subsumedProfile = findProfile(profiles, record.subsumed_profile_ref);
    if (subsumingProfile === null || subsumedProfile === null) {
      throw new FailClosedError(
        'QUALIFICATION_AMBIGUOUS',
        `subsumption record ${JSON.stringify(record.subsumption_id ?? '(unknown)')} references profiles missing from the profiles registry; cannot re-verify`
      );
    }
    if (compareProfiles(subsumingProfile, subsumedProfile).allHold) {
      return { applicable: true, reason: null };
    }
    // Declaration does not survive re-verification: keep looking, fail closed.
  }

  return { applicable: false, reason: 'PROFILE_NOT_APPLICABLE' };
}
