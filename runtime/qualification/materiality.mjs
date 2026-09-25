// MAWS vNext — Phase 3 qualification runtime: materiality classification
// (OD-12). Compares the qualified fingerprint against the current fingerprint
// per component. Deep-equal components are omitted from deltas. Changed
// tracked components are MATERIAL; null/undefined/unexpected shape on either
// side of a delta is UNKNOWN (fail closed). MATERIAL and UNKNOWN are
// unroutable without requalification. Pure, injectable clock.
import { FailClosedError, newId, nowIso, canonicalJson } from '../vnext/util.mjs';

// All qualification-relevant components: the six fingerprint components plus
// the top-level execution_profile_ref (materiality-decision contract enum).
export const TRACKED_COMPONENTS = [
  'model_id',
  'provider_id',
  'runtime_harness',
  'tool_contract_refs',
  'api_surface_version',
  'qualification_profile_ref',
  'execution_profile_ref'
];

function resolveStamp(now) {
  if (typeof now === 'function') return nowIso(now);
  if (typeof now === 'string') return now;
  if (now instanceof Date) return now.toISOString();
  return nowIso();
}

function requireFingerprint(fingerprint, role) {
  if (fingerprint === null || typeof fingerprint !== 'object' || Array.isArray(fingerprint)) {
    throw new FailClosedError('MATERIALITY_INPUT_INVALID', `${role} fingerprint must be an object`);
  }
  if (typeof fingerprint.fingerprint_id !== 'string' || fingerprint.fingerprint_id.length < 1) {
    throw new FailClosedError('MATERIALITY_INPUT_INVALID', `${role} fingerprint must carry a non-empty fingerprint_id`);
  }
  const components = fingerprint.components;
  if (components === null || typeof components !== 'object' || Array.isArray(components)) {
    throw new FailClosedError('MATERIALITY_INPUT_INVALID', `${role} fingerprint must carry a components object`);
  }
}

function readComponent(fingerprint, component) {
  return component === 'execution_profile_ref'
    ? fingerprint.execution_profile_ref
    : fingerprint.components[component];
}

function componentShapeOk(component, value) {
  if (value === undefined || value === null) return false;
  if (component === 'tool_contract_refs') {
    return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length >= 1);
  }
  return typeof value === 'string' && value.length >= 1;
}

// classifyMateriality(qualifiedFingerprint, currentFingerprint, now?)
//   -> MaterialityDecision-shaped object. overall_class is UNKNOWN if any
//      delta is UNKNOWN, else MATERIAL if any delta is MATERIAL, else
//      NON_MATERIAL (identical qualification-relevant state).
export function classifyMateriality(qualifiedFingerprint, currentFingerprint, now) {
  requireFingerprint(qualifiedFingerprint, 'qualified');
  requireFingerprint(currentFingerprint, 'current');

  const deltas = [];
  for (const component of TRACKED_COMPONENTS) {
    const from = readComponent(qualifiedFingerprint, component);
    const to = readComponent(currentFingerprint, component);
    if (canonicalJson(from) === canonicalJson(to)) {
      continue; // deep-equal -> omitted from deltas
    }
    const classification = componentShapeOk(component, from) && componentShapeOk(component, to)
      ? 'MATERIAL'
      : 'UNKNOWN';
    deltas.push({
      component,
      from: from === undefined ? null : from,
      to: to === undefined ? null : to,
      classification
    });
  }

  let overallClass = 'NON_MATERIAL';
  if (deltas.some((delta) => delta.classification === 'UNKNOWN')) {
    overallClass = 'UNKNOWN';
  } else if (deltas.some((delta) => delta.classification === 'MATERIAL')) {
    overallClass = 'MATERIAL';
  }

  return {
    decision_id: newId('mat'),
    qualified_fingerprint_ref: qualifiedFingerprint.fingerprint_id,
    current_fingerprint_ref: currentFingerprint.fingerprint_id,
    deltas,
    overall_class: overallClass,
    decided_at: resolveStamp(now)
  };
}

// isRoutable(decision) -> true only when the materiality decision is
// unambiguously NON_MATERIAL. MATERIAL and UNKNOWN fail closed.
export function isRoutable(decision) {
  return decision !== null && typeof decision === 'object' && decision.overall_class === 'NON_MATERIAL';
}
