// MAWS vNext — S12 model-adaptive executor profiles: the executor-profile
// computation (spec MAWS-SII-TARGET-SPEC-001 v0.2.0, section 11.5 + slice
// S12).
//
// This module is the single entry point that computes, deterministically,
// the executor profile an executor must use for the model/provider/harness
// it actually runs on. It never confers authority and never confers a
// qualification: a model-adaptive profile is a PRESENTATION layer, and the
// qualification in force is the caller's evidence-backed qualification.
//
// The four denial paths of slice S12 are typed and machine-readable. The
// caller can branch on `error.code` without parsing a message:
//
//   MODEL_PROFILE_SEMANTICS_WIDENED
//       The declared profile's semantics-preserving dimensions do not match
//       the profile actually in force. A model-adaptive profile may not
//       silently widen the pinned qualification dimensions, and it may not
//       bind a different (or broader) execution profile.
//   MODEL_PROFILE_QUALIFICATION_UNCOVERED
//       The model/provider pair is not covered by a QUALIFIED qualification
//       whose fingerprint names exactly that pair.
//   MODEL_PROFILE_HARNESS_CAPABILITY_MISSING
//       The harness does not declare a runtime capability the model
//       requires.
//   MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT
//       The effective instruction digest changed since the profile was
//       qualified. The drift is reported with the canonical
//       MaterialityDecision vocabulary.
//
// Supporting codes (not part of the four denial paths) are listed in
// EXECUTOR_PROFILE_CODES. There is no fallback: every violation is a typed
// FailClosedError, never a default profile and never a silent downgrade.
import { FailClosedError, canonicalJson } from '../../../vnext/util.mjs';
import {
  assertSemanticsPreserved,
  assertRuntimeRequirementsDeclared,
  assertPinnedDimensionsMatch,
  assertHarnessCapabilities,
  assertInstructionDigestCurrent,
  assertQualificationCoverage,
  assertProfileQualified,
  requiredRuntimeCapabilities,
  missingPinnedDimensions,
  pinnedDimensionMismatches,
  executionProfileMismatches,
  harnessCapabilityIssues
} from './profile-resolver.mjs';

// The four slice-S12 denial paths.
export const EXECUTOR_PROFILE_DENIAL_CODES = Object.freeze([
  'MODEL_PROFILE_SEMANTICS_WIDENED',
  'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
  'MODEL_PROFILE_HARNESS_CAPABILITY_MISSING',
  'MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT'
]);

// Every code this module can raise. The set is closed: a caller can switch
// on it exhaustively.
export const EXECUTOR_PROFILE_CODES = Object.freeze([
  ...EXECUTOR_PROFILE_DENIAL_CODES,
  'MODEL_PROFILE_INPUT_INVALID',
  'MODEL_PROFILE_NOT_FOUND',
  'MODEL_PROFILE_BINDING_MISMATCH',
  'MODEL_PROFILE_NOT_QUALIFIED',
  'MODEL_PROFILE_RUNTIME_REQUIREMENTS_INCOHERENT'
]);

function failClosed(code, message, details = {}) {
  throw new FailClosedError(code, message, details);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function clone(value) {
  return value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value));
}

// findProfile(store, { profileId, profileVersion }) -> the committed profile
// with that identity, or null. The version is optional; without it the
// newest committed version of that profile_id wins (deterministic).
function findProfile(store, { profileId, profileVersion = null }) {
  const candidates = store.profiles.filter((profile) => profile && profile.profile_id === profileId);
  if (candidates.length === 0) {
    return null;
  }
  if (isNonEmptyString(profileVersion)) {
    return candidates.find((profile) => profile.profile_version === profileVersion) ?? null;
  }
  const sorted = [...candidates].sort((left, right) => {
    const leftParts = String(left.profile_version).split('.').map((part) => Number.parseInt(part, 10) || 0);
    const rightParts = String(right.profile_version).split('.').map((part) => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] !== rightParts[index]) {
        return rightParts[index] - leftParts[index];
      }
    }
    return 0;
  });
  return sorted[0];
}

// resolveExecutorProfile({ modelId, providerId, harness, declaredProfile,
// store, inForce })
//
//   -> { profile_id, profile_version, executor_id, provider_id, model_id,
//        execution_profile_ref, runtime_requirements, presentation,
//        qualification_state, harness, in_force }
//
// `declaredProfile` identifies the model-adaptive profile the caller wants
// to use ({ profile_id, profile_version? }) OR carries the profile record
// itself. `inForce` is the qualification-side state that is actually in
// force:
//
//   {
//     execution_profile:      the execution profile in force,
//     fingerprint:            the qualification fingerprint in force,
//     qualification:          the qualification record in force,
//     effective_instruction_digest: the CURRENT effective instruction digest
//   }
//
// Every violation is a typed FailClosedError. There is no fallback.
export function resolveExecutorProfile({
  modelId,
  providerId,
  harness,
  declaredProfile,
  store,
  inForce
}) {
  if (!store || typeof store !== 'object' || !Array.isArray(store.profiles)) {
    failClosed('MODEL_PROFILE_INPUT_INVALID', 'a model-adaptive profile store is required to resolve an executor profile');
  }
  if (!isNonEmptyString(modelId) || !isNonEmptyString(providerId) || !isNonEmptyString(harness)) {
    failClosed(
      'MODEL_PROFILE_INPUT_INVALID',
      'model, provider and harness are required to resolve an executor profile'
    );
  }
  if (!inForce || typeof inForce !== 'object' || Array.isArray(inForce)) {
    failClosed('MODEL_PROFILE_INPUT_INVALID', 'the state in force is required to resolve an executor profile');
  }

  // (1) The declared profile must exist in the committed store.
  let profile;
  if (declaredProfile && typeof declaredProfile === 'object' && declaredProfile.presentation) {
    profile = declaredProfile;
  } else {
    const identity = declaredProfile && typeof declaredProfile === 'object' ? declaredProfile : {};
    if (!isNonEmptyString(identity.profile_id)) {
      failClosed(
        'MODEL_PROFILE_INPUT_INVALID',
        'the declared profile must be identified by profile_id (and optionally profile_version)'
      );
    }
    profile = findProfile(store, {
      profileId: identity.profile_id,
      profileVersion: identity.profile_version ?? null
    });
    if (!profile) {
      failClosed(
        'MODEL_PROFILE_NOT_FOUND',
        `no committed model-adaptive profile resolves "${identity.profile_id}@${identity.profile_version ?? 'newest'}"`,
        { profile_id: identity.profile_id, profile_version: identity.profile_version ?? null }
      );
    }
  }

  // (2) The profile must bind exactly the requested executor/provider/model.
  if (profile.model_id !== modelId || profile.provider_id !== providerId) {
    failClosed(
      'MODEL_PROFILE_BINDING_MISMATCH',
      `model-adaptive profile ${profile.profile_id}@${profile.profile_version} binds provider "${profile.provider_id}" / model "${profile.model_id}", not provider "${providerId}" / model "${modelId}"`,
      {
        declared: { provider_id: profile.provider_id, model_id: profile.model_id },
        requested: { provider_id: providerId, model_id: modelId }
      }
    );
  }

  // (3) A profile is a qualification input: only a QUALIFIED profile with
  //     evidence may be bound.
  assertProfileQualified(profile);

  // (4) The profile's own semantics claim must be intact (const "unchanged").
  assertSemanticsPreserved(profile);

  // (5) The declared runtime requirements must match what the presentation
  //     implies (no under-declaration).
  assertRuntimeRequirementsDeclared(profile);

  // (6) The (model, provider) pair must be covered by a qualification.
  const coverage = assertQualificationCoverage({
    modelId,
    providerId,
    qualification: inForce.qualification,
    fingerprint: inForce.fingerprint
  });

  // (7) The harness must declare every runtime capability the model needs.
  assertHarnessCapabilities({
    profile,
    harness,
    harnessCapabilities: store.harnessCapabilities
  });

  // (8) No silent widening: the pinned qualification dimensions and the
  //     bound execution profile must equal the ones actually in force.
  assertPinnedDimensionsMatch({
    profile,
    inForce,
    executionProfiles: store.executionProfiles || {}
  });

  // (9) The effective instruction digest must still be effective.
  assertInstructionDigestCurrent({
    profile,
    currentDigest: inForce.effective_instruction_digest,
    qualifiedRef: coverage.fingerprint.fingerprint_id,
    currentRef: inForce.effective_instruction_bundle_ref ?? 'effective-instruction-bundle'
  });

  return {
    profile_id: profile.profile_id,
    profile_version: profile.profile_version,
    executor_id: profile.executor_id,
    provider_id: profile.provider_id,
    model_id: profile.model_id,
    execution_profile_ref: profile.execution_profile_ref,
    runtime_requirements: requiredRuntimeCapabilities(profile),
    presentation: clone(profile.presentation),
    qualification_state: profile.qualification.state,
    harness,
    in_force: {
      qualification_ref: coverage.qualification.qualification_id,
      fingerprint_ref: coverage.fingerprint.fingerprint_id,
      execution_profile_ref: inForce.execution_profile?.profile_id ?? null,
      effective_instruction_digest: inForce.effective_instruction_digest ?? null
    }
  };
}

// explainExecutorProfileDenial({ modelId, providerId, harness,
// declaredProfile, store, inForce }) -> a non-throwing diagnostic view of
// the same decision: { allowed, code, message, details }. It exists for
// reporting surfaces that must not crash on a denial; the enforcement
// itself stays in resolveExecutorProfile.
export function explainExecutorProfileDenial(input) {
  try {
    const resolved = resolveExecutorProfile(input);
    return { allowed: true, code: null, message: null, details: null, resolved };
  } catch (error) {
    if (!(error instanceof FailClosedError)) {
      throw error;
    }
    return { allowed: false, code: error.code, message: error.message, details: error.details };
  }
}

// executorProfileDiagnostics({ profile, inForce, harness, harnessCapabilities,
// executionProfiles }) -> a report of every widening signal for a profile,
// independent of the enforcement order. Useful for a review surface; it
// never grants anything.
export function executorProfileDiagnostics({
  profile,
  inForce,
  harness,
  harnessCapabilities,
  executionProfiles = {}
}) {
  const missing = missingPinnedDimensions(profile);
  const pinned = pinnedDimensionMismatches({ profile, inForce });
  const execution = executionProfileMismatches({ profile, inForce, executionProfiles });
  const capabilities = harnessCapabilityIssues({ profile, harness, harnessCapabilities });
  return {
    profile_id: profile?.profile_id ?? null,
    profile_version: profile?.profile_version ?? null,
    missing_pinned_dimensions: missing,
    pinned_dimension_mismatches: pinned,
    execution_profile_mismatches: execution,
    missing_harness_capabilities: capabilities,
    widening_detected: missing.length > 0
      || Object.keys(pinned).length > 0
      || Object.keys(execution).length > 0
  };
}

// profileFingerprint(profile) -> a stable digest of the parts of a profile
// that decide the executor profile. Two profiles with the same fingerprint
// are interchangeable for the executor; the digest is never a qualification.
export function profileFingerprint(profile) {
  return canonicalJson({
    profile_id: profile?.profile_id ?? null,
    profile_version: profile?.profile_version ?? null,
    executor_id: profile?.executor_id ?? null,
    provider_id: profile?.provider_id ?? null,
    model_id: profile?.model_id ?? null,
    execution_profile_ref: profile?.execution_profile_ref ?? null,
    runtime_requirements: requiredRuntimeCapabilities(profile),
    presentation: profile?.presentation ?? null,
    semantics_preservation: profile?.semantics_preservation ?? null
  });
}
