// MAWS vNext — Skill Frontdoor admission gate.
// Analyzer evidence is prerequisite evidence only. PASS != authority.
// UNKNOWN/INCOMPLETE cannot be overridden because risk has not been bounded.
import { FailClosedError } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const CONTRACT = 'core/contracts/skill-frontdoor-admission.schema.json';
const BLOCKING_SEVERITIES = new Set(['high', 'critical', 'unknown']);

function hasActiveOwnerException(ownerException, now) {
  if (!ownerException || typeof ownerException !== 'object') return false;
  const required = ['decision_id', 'approved_by', 'rationale', 'scope_limit', 'expires_at'];
  if (required.some((key) => typeof ownerException[key] !== 'string' || ownerException[key].trim() === '')) {
    return false;
  }
  if (!Array.isArray(ownerException.accepted_risks) || ownerException.accepted_risks.length === 0) {
    return false;
  }
  const expiry = Date.parse(ownerException.expires_at);
  const current = Date.parse(now);
  return Number.isFinite(expiry) && Number.isFinite(current) && expiry > current;
}

export function deriveSkillFrontdoorDisposition(record, { now = new Date().toISOString() } = {}) {
  const blockers = [];
  const incomplete = [];
  const security = record?.evidence?.skillspector;
  const quality = record?.evidence?.skillevaluator_tier1;

  if (!security) {
    incomplete.push('SKILLSPECTOR_EVIDENCE_MISSING');
  } else {
    if (security.version === 'unknown' || !security.version) incomplete.push('SKILLSPECTOR_VERSION_UNKNOWN');
    if (security.status === 'INCOMPLETE') incomplete.push('SKILLSPECTOR_INCOMPLETE');
    if (security.status === 'BLOCKED') blockers.push('SKILLSPECTOR_BLOCKED');
    if (security.exit_code !== 0 && security.status !== 'BLOCKED') {
      incomplete.push('SKILLSPECTOR_NONZERO_WITHOUT_BLOCKED_EVIDENCE');
    }
    if (BLOCKING_SEVERITIES.has(security.severity)) {
      blockers.push('SKILLSPECTOR_SEVERITY_' + String(security.severity).toUpperCase());
    }
    if ((security.severity_counts?.critical ?? 0) > 0) blockers.push('SKILLSPECTOR_CRITICAL_FINDINGS');
    if ((security.severity_counts?.high ?? 0) > 0) blockers.push('SKILLSPECTOR_HIGH_FINDINGS');
  }

  if (!quality) {
    incomplete.push('SKILLEVALUATOR_EVIDENCE_MISSING');
  } else {
    if (quality.version === 'unknown' || !quality.version) incomplete.push('SKILLEVALUATOR_VERSION_UNKNOWN');
    if (quality.status === 'INCOMPLETE') incomplete.push('SKILLEVALUATOR_INCOMPLETE');
    if (quality.status === 'BLOCKED') blockers.push('SKILLEVALUATOR_BLOCKED');
    if (quality.exit_code !== 0 && quality.status !== 'BLOCKED') {
      incomplete.push('SKILLEVALUATOR_NONZERO_WITHOUT_BLOCKED_EVIDENCE');
    }
    if (quality.overall_status === 'failed' || quality.overall_passed === false) {
      blockers.push('SKILLEVALUATOR_TIER1_FAILED');
    }
    if (quality.overall_status === 'incomplete' || quality.overall_status === 'not-run') {
      incomplete.push('SKILLEVALUATOR_TIER1_INCOMPLETE');
    }
  }

  let analysis_disposition = 'CLEAN';
  if (blockers.length > 0) analysis_disposition = 'BLOCKED';
  else if (incomplete.length > 0) analysis_disposition = 'INCOMPLETE';

  let implementation_disposition = 'BLOCKED';
  if (analysis_disposition === 'CLEAN') {
    implementation_disposition = 'ELIGIBLE';
  } else if (
    analysis_disposition === 'BLOCKED' &&
    hasActiveOwnerException(record?.owner_exception, now)
  ) {
    implementation_disposition = 'OWNER_EXCEPTION';
  }

  return {
    analysis_disposition,
    implementation_disposition,
    blockers: [...new Set([...blockers, ...incomplete])],
    authority_granted: false
  };
}

export function assertSkillImplementationFrontdoor(record, {
  root,
  now = new Date().toISOString()
} = {}) {
  if (!root) {
    throw new FailClosedError(
      'SKILL_FRONTDOOR_ROOT_REQUIRED',
      'repository root is required for contract validation'
    );
  }

  const schemaIssues = validateInstanceAgainstContract(record, CONTRACT, root);
  if (schemaIssues.length > 0) {
    throw new FailClosedError(
      'SKILL_FRONTDOOR_CONTRACT_INVALID',
      'skill frontdoor record does not satisfy the canonical contract',
      { issues: schemaIssues }
    );
  }

  const derived = deriveSkillFrontdoorDisposition(record, { now });
  if (
    record.analysis_disposition !== derived.analysis_disposition ||
    record.implementation_disposition !== derived.implementation_disposition ||
    record.authority_granted !== false
  ) {
    throw new FailClosedError(
      'SKILL_FRONTDOOR_DISPOSITION_MISMATCH',
      'declared frontdoor disposition does not match deterministic evidence evaluation',
      {
        declared: {
          analysis_disposition: record.analysis_disposition,
          implementation_disposition: record.implementation_disposition,
          authority_granted: record.authority_granted
        },
        derived
      }
    );
  }

  if (derived.implementation_disposition === 'BLOCKED') {
    throw new FailClosedError(
      'SKILL_FRONTDOOR_BLOCKED',
      'skill candidate is not eligible to proceed past the MAWS frontdoor',
      {
        blockers: derived.blockers,
        analysis_disposition: derived.analysis_disposition
      }
    );
  }

  return {
    frontdoor_passed: true,
    implementation_disposition: derived.implementation_disposition,
    exception_used: derived.implementation_disposition === 'OWNER_EXCEPTION',
    authority_granted: false,
    blockers: derived.blockers
  };
}
