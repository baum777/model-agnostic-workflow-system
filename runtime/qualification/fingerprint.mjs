// MAWS vNext — Phase 3 qualification runtime: qualification fingerprint
// (OD-12). A fingerprint captures all qualification-relevant execution state
// and hashes it deterministically (canonical JSON -> sha256). Pure function,
// fail closed on unexpected component shapes. No authority logic.
import { FailClosedError, newId, canonicalJson, sha256Hex } from '../vnext/util.mjs';

// Component keys exactly as fixed by qualification-fingerprint.schema.json.
export const FINGERPRINT_COMPONENT_KEYS = [
  'model_id',
  'provider_id',
  'runtime_harness',
  'tool_contract_refs',
  'api_surface_version',
  'qualification_profile_ref'
];

const NULLABLE_COMPONENTS = new Set(['model_id', 'provider_id']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function validateComponents(components) {
  if (components === null || typeof components !== 'object' || Array.isArray(components)) {
    throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', 'components must be an object');
  }
  for (const key of Object.keys(components)) {
    if (!FINGERPRINT_COMPONENT_KEYS.includes(key)) {
      throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', `unexpected component key "${key}"; allowed keys are exactly ${FINGERPRINT_COMPONENT_KEYS.join(', ')}`);
    }
  }
  for (const key of FINGERPRINT_COMPONENT_KEYS) {
    if (!(key in components)) {
      throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', `missing component key "${key}"`);
    }
    const value = components[key];
    if (value === null) {
      if (!NULLABLE_COMPONENTS.has(key)) {
        throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', `component "${key}" may not be null`);
      }
      continue;
    }
    if (key === 'tool_contract_refs') {
      if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
        throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', 'component "tool_contract_refs" must be an array of non-empty strings');
      }
      if (new Set(value).size !== value.length) {
        throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', 'component "tool_contract_refs" must not contain duplicates');
      }
      continue;
    }
    if (!isNonEmptyString(value)) {
      throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', `component "${key}" must be a non-empty string`);
    }
  }
}

// computeFingerprint({ executorId, capabilityId, executionProfileRef, components })
//   -> QualificationFingerprint-shaped object whose digest is
//      sha256Hex(canonicalJson(components)).
export function computeFingerprint({ executorId, capabilityId, executionProfileRef, components }) {
  if (!isNonEmptyString(executorId)) {
    throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', 'executorId must be a non-empty string');
  }
  if (!isNonEmptyString(capabilityId)) {
    throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', 'capabilityId must be a non-empty string');
  }
  if (!isNonEmptyString(executionProfileRef)) {
    throw new FailClosedError('FINGERPRINT_COMPONENTS_INVALID', 'executionProfileRef must be a non-empty string');
  }
  validateComponents(components);

  const normalizedComponents = {};
  for (const key of FINGERPRINT_COMPONENT_KEYS) {
    normalizedComponents[key] = components[key];
  }

  return {
    fingerprint_id: newId('fp'),
    executor_id: executorId,
    capability_id: capabilityId,
    execution_profile_ref: executionProfileRef,
    components: normalizedComponents,
    digest: sha256Hex(canonicalJson(components))
  };
}
