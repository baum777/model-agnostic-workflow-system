// MAWS vNext — Phase 3 qualification runtime: eligibility (OD-09/OD-10/OD-12).
// computeEligibility is the closed deterministic filter applied to a WorkUnit
// capability requirement. It produces EligibilityDecision objects only.
//
// Runtime success NEVER creates a qualification: the only artifact runtime
// success may produce is a QualificationReviewCandidate via
// buildQualificationReviewCandidate (declaration/qualification state changes
// belong to the qualification authority, not to the runtime).
//
// Pure functions, injectable clock, fail closed on ambiguity, no authority
// logic: authority_compatible / context_compatible are injectable gates owned
// by their own lanes; when not injected they impose no additional restriction
// from this lane (default true), never widening any other gate.
import { FailClosedError, newId, nowIso } from '../vnext/util.mjs';
import { isQualificationApplicable } from './applicability.mjs';
import { classifyMateriality, isRoutable } from './materiality.mjs';

function resolveStamp(now) {
  if (typeof now === 'function') return nowIso(now);
  if (typeof now === 'string') return now;
  if (now instanceof Date) return now.toISOString();
  return nowIso();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

// computeEligibility({...}) -> EligibilityDecision[]
//
// Decisions are emitted per executor manifest declaring the capability.
// Exclusion precedence (first match wins, single reported reason):
//   NOT_DECLARED (no qualification record for executor+capability)
//   NOT_QUALIFIED (record state DECLARED / QUALIFICATION_PENDING / UNKNOWN)
//   DISQUALIFIED
//   REVOKED
//   EXPIRED (record state EXPIRED, or QUALIFIED with expires_at < now)
//   PROFILE_NOT_APPLICABLE (exact or re-verified subsumption coverage fails)
//   MATERIAL_FINGERPRINT_DRIFT / UNKNOWN_FINGERPRINT_DRIFT
//     (applicable but materiality vs current fingerprint is not NON_MATERIAL;
//      missing qualified or current fingerprint = UNKNOWN, fail closed)
//   PROVIDER_UNAVAILABLE
//   POLICY_INCOMPATIBLE
//   BUDGET_INCOMPATIBLE
//   AUTHORITY_INCOMPATIBLE / CONTEXT_INCOMPATIBLE (only when injected)
//
// eligible=true requires a qualification_ref and every check passing.
export function computeEligibility({
  workUnit,
  capabilityRequirement,
  manifests,
  qualifications,
  profiles,
  subsumptionRecords,
  currentFingerprints,
  qualifiedFingerprints = {},
  availability = {},
  policyCompatible = {},
  budgetCompatible = {},
  authorityCompatible = null,
  contextCompatible = null,
  now
}) {
  if (workUnit === null || typeof workUnit !== 'object' || !isNonEmptyString(workUnit.work_unit_id)) {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'workUnit.work_unit_id is required');
  }
  if (capabilityRequirement === null || typeof capabilityRequirement !== 'object') {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'capabilityRequirement is required');
  }
  const capabilityId = capabilityRequirement.capability_id;
  const requestedProfileId = capabilityRequirement.min_profile_ref;
  if (!isNonEmptyString(capabilityId)) {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'capabilityRequirement.capability_id is required');
  }
  if (!isNonEmptyString(requestedProfileId)) {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'capabilityRequirement.min_profile_ref is required');
  }
  if (!Array.isArray(manifests)) {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'manifests must be an array');
  }
  if (!Array.isArray(qualifications)) {
    throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'qualifications must be an array');
  }

  const decidedAt = resolveStamp(now);
  const decisions = [];

  for (const manifest of manifests) {
    if (manifest === null || typeof manifest !== 'object') {
      throw new FailClosedError('QUALIFICATION_AMBIGUOUS', 'manifest entries must be objects');
    }
    const declaresCapability = Array.isArray(manifest.declared_capabilities)
      && manifest.declared_capabilities.some((entry) => entry !== null && typeof entry === 'object' && entry.capability_id === capabilityId);
    if (!declaresCapability) {
      continue; // decisions exist only for manifests declaring the capability
    }
    const executorId = manifest.executor_id;

    const checks = {
      availability: availability[executorId] === true,
      policy_compatible: policyCompatible[executorId] === true,
      budget_compatible: budgetCompatible[executorId] === true,
      authority_compatible: authorityCompatible === null ? true : authorityCompatible[executorId] === true,
      context_compatible: contextCompatible === null ? true : contextCompatible[executorId] === true
    };

    const decision = {
      eligibility_id: newId('elig'),
      work_unit_id: workUnit.work_unit_id,
      executor_id: executorId,
      capability_id: capabilityId,
      eligible: false,
      exclusion_reasons: [],
      qualification_ref: null,
      checks,
      decided_at: decidedAt
    };

    const records = qualifications.filter(
      (record) => record !== null && typeof record === 'object'
        && record.executor_id === executorId
        && record.capability_id === capabilityId
    );
    if (records.length === 0) {
      decision.exclusion_reasons.push('NOT_DECLARED');
    } else if (records.length > 1) {
      // Multi-record selection policy (supersession / latest-by-decided_at) is
      // not decided by the contracts yet: fail closed instead of guessing.
      throw new FailClosedError(
        'QUALIFICATION_AMBIGUOUS',
        `multiple qualification records exist for executor ${executorId} and capability ${capabilityId}; record selection is ambiguous`
      );
    } else {
      const record = records[0];
      decision.qualification_ref = record.qualification_id ?? null;

      const applicability = isQualificationApplicable({
        qualification: record,
        capabilityId,
        requestedProfileId,
        profiles,
        subsumptionRecords,
        now
      });
      if (!applicability.applicable) {
        decision.exclusion_reasons.push(
          applicability.reason === 'STATE_NOT_QUALIFIED' ? 'NOT_QUALIFIED' : applicability.reason
        );
      } else {
        const qualifiedFingerprint = qualifiedFingerprints !== null && typeof qualifiedFingerprints === 'object'
          ? qualifiedFingerprints[executorId]
          : null;
        const currentFingerprint = currentFingerprints !== null && typeof currentFingerprints === 'object'
          ? currentFingerprints[executorId]
          : null;
        if (qualifiedFingerprint == null || currentFingerprint == null) {
          decision.exclusion_reasons.push('UNKNOWN_FINGERPRINT_DRIFT');
        } else {
          const materiality = classifyMateriality(qualifiedFingerprint, currentFingerprint, now);
          if (!isRoutable(materiality)) {
            decision.exclusion_reasons.push(
              materiality.overall_class === 'UNKNOWN' ? 'UNKNOWN_FINGERPRINT_DRIFT' : 'MATERIAL_FINGERPRINT_DRIFT'
            );
          }
        }
      }
    }

    if (decision.exclusion_reasons.length === 0) {
      if (!checks.availability) {
        decision.exclusion_reasons.push('PROVIDER_UNAVAILABLE');
      } else if (!checks.policy_compatible) {
        decision.exclusion_reasons.push('POLICY_INCOMPATIBLE');
      } else if (!checks.budget_compatible) {
        decision.exclusion_reasons.push('BUDGET_INCOMPATIBLE');
      } else if (!checks.authority_compatible) {
        decision.exclusion_reasons.push('AUTHORITY_INCOMPATIBLE');
      } else if (!checks.context_compatible) {
        decision.exclusion_reasons.push('CONTEXT_INCOMPATIBLE');
      }
    }

    decision.eligible = decision.exclusion_reasons.length === 0 && decision.qualification_ref !== null;
    decisions.push(decision);
  }

  return decisions;
}

// buildQualificationReviewCandidate({...}, now?) -> the ONLY artifact runtime
// success may produce. It is a review request for the qualification
// authority, never a qualification: no state, no evidence grant, no
// qualification_id, no authority.
export function buildQualificationReviewCandidate(
  { executorId, capabilityId, executionProfileRef, runEvidenceRef },
  now
) {
  if (!isNonEmptyString(executorId)) {
    throw new FailClosedError('QUALIFICATION_REVIEW_CANDIDATE_INVALID', 'executorId must be a non-empty string');
  }
  if (!isNonEmptyString(capabilityId)) {
    throw new FailClosedError('QUALIFICATION_REVIEW_CANDIDATE_INVALID', 'capabilityId must be a non-empty string');
  }
  if (!isNonEmptyString(executionProfileRef)) {
    throw new FailClosedError('QUALIFICATION_REVIEW_CANDIDATE_INVALID', 'executionProfileRef must be a non-empty string');
  }
  if (!isNonEmptyString(runEvidenceRef)) {
    throw new FailClosedError('QUALIFICATION_REVIEW_CANDIDATE_INVALID', 'runEvidenceRef must be a non-empty string');
  }
  return {
    candidate_id: newId('qrc'),
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: executionProfileRef,
    run_evidence_ref: runEvidenceRef,
    created_at: resolveStamp(now)
  };
}
