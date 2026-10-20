// MAWS vNext — S12 model-adaptive executor profiles: resolver and rules
// (spec MAWS-SII-TARGET-SPEC-001 v0.2.0, section 11.5 + slice S12).
//
// CONCEPT SEPARATION (the whole point of this module):
//   * core/contracts/execution-profile.schema.json dimensions the
//     QUALIFICATION (tools, effects, context, network, delegation,
//     verification). It is unchanged and this module never writes it.
//   * core/contracts/provider-capabilities.json describes PROVIDER
//     CAPABILITIES (portability vocabulary native|adapter|unsupported).
//     It is canonical and unchanged by this slice.
//   * providers/*/export.json are DERIVED projections of the capability
//     registry. They are consumed here as INPUTS only, never as authority.
//   * A model-adaptive executor profile is a PRESENTATION and INTERACTION
//     layer above an execution profile. It optimizes how instructions are
//     presented and how the model is interacted with. It changes no
//     execution-profile dimension and grants no authority.
//
// RULES ENFORCED HERE (all fail closed):
//   R1  A profile binds exactly one (executor_id, provider_id, model_id)
//       and carries a profile_version. Resolution is deterministic; an
//       ambiguous binding is a finding, never a guess.
//   R2  The semantics_preservation block must assert all six invariant
//       dimensions (task_scope, authority_ceiling, tool_rights,
//       security_controls, completion_criteria, evidence_requirements) as
//       "unchanged" AND must pin the qualification-relevant dimensions the
//       underlying execution profile pins (tool_contract_refs,
//       api_surface_version, qualification_profile_ref) plus the effective
//       instruction digest. The schema makes a widening impossible to
//       EXPRESS (const + required + additionalProperties:false); this
//       module is the runtime-side re-check against the profile actually in
//       force, so a silent widening is refused, never tolerated.
//   R3  Two profiles of the same model must produce IDENTICAL authority and
//       completion semantics. Equivalence is decided by comparing the six
//       execution-profile dimensions of the execution profiles the profiles
//       bind to (tools/effects/network/delegation = authority;
//       context/verification = completion) and by the semantics_preservation
//       blocks. Presentation differences are irrelevant by construction.
//   R4  A profile switch never widens authority: a profile bound to a
//       broader execution profile is refused, even when the switch is
//       otherwise legal.
//   R5  A model change (or any material fingerprint drift) requires
//       requalification of the affected behavior; a previous qualification
//       is never inherited silently (spec 11.3 / 11.4).
//   R6  The provider binding must be coherent with the canonical provider
//       capability contract, and the derived provider exports must not
//       disagree with it. A profile is never resolved for an unknown
//       provider or model.
//   R7  The runtime capabilities a profile requires must be declared by the
//       harness that runs it, and the declaration must match the set the
//       presentation actually implies (no under-declaration).
//   R8  The effective instruction digest the profile was qualified under
//       must still be the effective digest; a changed digest is a material
//       drift and is classified with the canonical MaterialityDecision
//       vocabulary (core/contracts/materiality-decision.schema.json).
//
// Pure, deterministic, repository-local reads only. No network access.
import fs from 'node:fs';
import path from 'node:path';
import { FailClosedError, canonicalJson } from '../../../vnext/util.mjs';
import { DIMENSIONS as EXECUTION_PROFILE_DIMENSIONS, levelRank } from '../../../qualification/profile-subsumption.mjs';
import { classifyMateriality } from '../../../qualification/materiality.mjs';
import { validateInstanceAgainstContract } from '../../../../scripts/tools/validate-maws-vnext-contracts.mjs';

export const MODEL_ADAPTIVE_PROFILE_CONTRACT = 'core/contracts/executor-model-profile.schema.json';
export const PROVIDER_CAPABILITIES_CONTRACT = 'core/contracts/provider-capabilities.json';
export const EXECUTION_PROFILE_CONTRACT = 'core/contracts/execution-profile.schema.json';
export const MATERIALITY_DECISION_CONTRACT = 'core/contracts/materiality-decision.schema.json';

// The six invariant semantics dimensions of spec 11.5. Every one of them
// must read "unchanged" in a model-adaptive profile.
export const INVARIANT_SEMANTICS_DIMENSIONS = Object.freeze([
  'task_scope',
  'authority_ceiling',
  'tool_rights',
  'security_controls',
  'completion_criteria',
  'evidence_requirements'
]);

// The qualification-relevant dimensions the underlying execution profile
// pins. A model-adaptive profile must pin exactly the same values, so it
// can never widen the qualification silently.
export const PINNED_SEMANTICS_DIMENSIONS = Object.freeze([
  'tool_contract_refs',
  'api_surface_version',
  'qualification_profile_ref'
]);

// The instruction digest is pinned next to them but compared against the
// CURRENT effective digest, not against the fingerprint (the S7 wiring of
// the fingerprint component is a separate, coordinated amendment).
export const INSTRUCTION_DIGEST_DIMENSION = 'effective_instruction_digest';

// The closed runtime-capability vocabulary a harness can declare.
export const RUNTIME_CAPABILITY_VOCABULARY = Object.freeze(['structured_output', 'tool_calls']);

// The six execution-profile dimensions (core/contracts/execution-profile.schema.json)
// split by what they decide. The split is the DoD wording of slice S12:
// "zwei Profile desselben Modells liefern aequivalente Authority- und
// Completion-Semantik".
export const AUTHORITY_EXECUTION_DIMENSIONS = Object.freeze(['tools', 'effects', 'network', 'delegation']);
export const COMPLETION_EXECUTION_DIMENSIONS = Object.freeze(['context', 'verification']);

// Which invariant semantics dimension anchors which execution-profile
// dimension. Used for reporting, not for deciding equivalence.
export const SEMANTICS_TO_EXECUTION_DIMENSION = Object.freeze({
  task_scope: 'context',
  authority_ceiling: 'effects',
  tool_rights: 'tools',
  security_controls: 'network',
  completion_criteria: 'verification',
  evidence_requirements: 'delegation'
});

// Presentation settings that the provider capability state can support.
const STRUCTURED_OUTPUT_BY_CAPABILITY = Object.freeze({
  native: Object.freeze(['native_schema']),
  adapter: Object.freeze(['adapter_schema', 'json_mode_prompt']),
  unsupported: Object.freeze(['none'])
});

const CALL_STYLE_BY_TOOL_USE = Object.freeze({
  native: Object.freeze(['native_function_call', 'openai_compatible_tool_calls']),
  adapter: Object.freeze(['json_instruction', 'openai_compatible_tool_calls']),
  unsupported: Object.freeze(['none'])
});

const OUTPUT_MODE_STRUCTURED_OUTPUT = Object.freeze({
  plain_text: Object.freeze(['none']),
  markdown: Object.freeze(['none']),
  json_mode: Object.freeze(['json_mode_prompt']),
  schema_bound: Object.freeze(['native_schema', 'adapter_schema'])
});

// Which runtime capability a presentation setting requires.
const TOOL_CALL_CAPABILITY = Object.freeze({
  none: null,
  native_function_call: 'tool_calls',
  json_instruction: 'tool_calls',
  openai_compatible_tool_calls: 'tool_calls'
});

const STRUCTURED_OUTPUT_CAPABILITY = Object.freeze({
  none: null,
  json_mode_prompt: 'structured_output',
  adapter_schema: 'structured_output',
  native_schema: 'structured_output'
});

function failClosed(code, message, details = {}) {
  throw new FailClosedError(code, message, details);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// Canonical + derived inputs
// ---------------------------------------------------------------------------

// loadProviderCapabilityContract(root) -> the CANONICAL provider capability
// contract. This is the authority for "which providers exist" and for the
// portability vocabulary. It is read, never written.
export function loadProviderCapabilityContract(root) {
  const contractPath = path.join(root, 'core', 'contracts', 'provider-capabilities.json');
  if (!fs.existsSync(contractPath)) {
    failClosed('MODEL_PROFILE_PROVIDER_CONTRACT_MISSING', `missing canonical provider capability contract: ${contractPath}`);
  }
  return readJson(contractPath);
}

// loadProviderExports(root, { providerIds }) -> the DERIVED provider export
// projections keyed by canonical provider name. Derived inputs only: they
// never decide a capability, they only have to agree with the canonical
// contract (drift is reported, never silently preferred).
export function loadProviderExports(root, { providerIds = null } = {}) {
  const exports = {};
  const names = Array.isArray(providerIds) && providerIds.length > 0
    ? providerIds
    : (loadProviderCapabilityContract(root).providers || []).map((provider) => provider.name);
  for (const name of names) {
    const exportPath = path.join(root, 'providers', name, 'export.json');
    if (!fs.existsSync(exportPath)) {
      continue;
    }
    exports[name] = readJson(exportPath);
  }
  return exports;
}

// resolveProviderCapability({ providerCapabilities, providerExports, providerId })
//   -> { name, capability, export_record } for a canonical provider name or
//      one of its declared aliases. An unknown provider fails closed; a
//      derived export that disagrees with the canonical contract is drift
//      and also fails closed (R6).
export function resolveProviderCapability({ providerCapabilities, providerExports = {}, providerId }) {
  if (!isNonEmptyString(providerId)) {
    failClosed('MODEL_PROFILE_PROVIDER_UNKNOWN', 'provider id is required to resolve a model-adaptive profile');
  }
  const providers = Array.isArray(providerCapabilities?.providers) ? providerCapabilities.providers : [];
  const canonical = providers.find((provider) => provider.name === providerId)
    || providers.find((provider) => Array.isArray(provider.aliases) && provider.aliases.includes(providerId));
  if (!canonical) {
    failClosed(
      'MODEL_PROFILE_PROVIDER_UNKNOWN',
      `provider "${providerId}" is not a canonical provider in ${PROVIDER_CAPABILITIES_CONTRACT}`,
      { providerId, known: providers.map((provider) => provider.name) }
    );
  }
  const exportRecord = providerExports[canonical.name];
  if (!exportRecord) {
    failClosed(
      'MODEL_PROFILE_PROVIDER_PROJECTION_MISSING',
      `provider "${canonical.name}" has no derived export projection under providers/${canonical.name}/export.json`,
      { provider: canonical.name }
    );
  }
  if (exportRecord.canonicalProvider !== canonical.name) {
    failClosed(
      'MODEL_PROFILE_PROVIDER_PROJECTION_DRIFT',
      `derived export for "${canonical.name}" declares canonicalProvider "${exportRecord.canonicalProvider}"`,
      { provider: canonical.name, declared: exportRecord.canonicalProvider }
    );
  }
  const projected = exportRecord.capabilityProfile || {};
  for (const field of ['skillPackaging', 'toolUse', 'structuredOutputs', 'mcp', 'subagents']) {
    if (canonicalJson(projected[field]) !== canonicalJson(canonical[field])) {
      failClosed(
        'MODEL_PROFILE_PROVIDER_PROJECTION_DRIFT',
        `derived export for "${canonical.name}" reports ${field}=${JSON.stringify(projected[field])}, the canonical capability contract reports ${JSON.stringify(canonical[field])}`,
        { provider: canonical.name, field, projected: projected[field], canonical: canonical[field] }
      );
    }
  }
  return { name: canonical.name, capability: canonical, export_record: exportRecord };
}

// ---------------------------------------------------------------------------
// R2 — the immutability assertion
// ---------------------------------------------------------------------------

// semanticsDeviations(profile) -> string[] of invariant dimensions that do
// not read "unchanged" (missing, malformed or widened).
export function semanticsDeviations(profile) {
  const deviations = [];
  const block = profile && typeof profile === 'object' ? profile.semantics_preservation : null;
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    return [...INVARIANT_SEMANTICS_DIMENSIONS];
  }
  for (const dimension of INVARIANT_SEMANTICS_DIMENSIONS) {
    if (block[dimension] !== 'unchanged') {
      deviations.push(dimension);
    }
  }
  return deviations;
}

// assertSemanticsPreserved(profile) -> the profile, or a typed
// FailClosedError. This is the runtime-side re-check of a promise the
// schema already makes structurally (const "unchanged").
export function assertSemanticsPreserved(profile) {
  const deviations = semanticsDeviations(profile);
  if (deviations.length > 0) {
    failClosed(
      'MODEL_PROFILE_SEMANTICS_WIDENED',
      `model-adaptive profile widens invariant semantics (${deviations.join(', ')}); a presentation layer may not change task scope, authority, tool rights, security controls, completion criteria or evidence requirements`,
      { deviations }
    );
  }
  return profile;
}

// ---------------------------------------------------------------------------
// R2 — the pinned qualification dimensions (no silent widening)
// ---------------------------------------------------------------------------

// pinnedDimensions(profile) -> the pinned dimension block, or null.
export function pinnedDimensions(profile) {
  const block = profile?.semantics_preservation?.pinned_dimensions;
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    return null;
  }
  return block;
}

// missingPinnedDimensions(profile) -> the pinned dimensions the profile does
// not declare. A profile that does not pin them cannot be compared against
// the profile in force, and a missing pin is never an implicit "same".
export function missingPinnedDimensions(profile) {
  const block = pinnedDimensions(profile);
  if (block === null) {
    return [...PINNED_SEMANTICS_DIMENSIONS, INSTRUCTION_DIGEST_DIMENSION];
  }
  const missing = [];
  for (const dimension of [...PINNED_SEMANTICS_DIMENSIONS, INSTRUCTION_DIGEST_DIMENSION]) {
    const value = block[dimension];
    if (value === undefined || value === null) {
      missing.push(dimension);
    }
  }
  return missing;
}

// pinnedDimensionMismatches({ profile, inForce }) -> { dimension: {declared,
// in_force} } for every pinned dimension that differs from the profile
// actually in force. The comparison is exact: a different tool-contract set,
// a different API surface version or a different qualification profile is a
// difference, never a "close enough".
export function pinnedDimensionMismatches({ profile, inForce }) {
  const declared = pinnedDimensions(profile);
  const mismatches = {};
  if (declared === null) {
    return mismatches;
  }
  const fingerprintComponents = inForce?.fingerprint?.components ?? {};
  for (const dimension of PINNED_SEMANTICS_DIMENSIONS) {
    const declaredValue = declared[dimension];
    const inForceValue = fingerprintComponents[dimension];
    if (canonicalJson(declaredValue) !== canonicalJson(inForceValue)) {
      mismatches[dimension] = { declared: declaredValue ?? null, in_force: inForceValue ?? null };
    }
  }
  return mismatches;
}

// executionProfileMismatches({ profile, inForce, executionProfiles }) ->
// { dimension: {declared, in_force} } for every execution-profile dimension
// that differs from the execution profile actually in force. A
// model-adaptive profile binds an execution profile; it never re-dimensions
// it. A different execution profile is a widening, even when the profile is
// otherwise well-formed.
export function executionProfileMismatches({ profile, inForce, executionProfiles = {} }) {
  const mismatches = {};
  const inForceExecution = inForce?.execution_profile;
  if (!inForceExecution || typeof inForceExecution !== 'object') {
    return mismatches;
  }
  const declaredRef = profile?.execution_profile_ref;
  if (declaredRef !== inForceExecution.profile_id) {
    mismatches.execution_profile_ref = {
      declared: declaredRef ?? null,
      in_force: inForceExecution.profile_id
    };
  }
  const declaredExecution = executionProfiles?.[declaredRef];
  if (!declaredExecution || typeof declaredExecution !== 'object') {
    return mismatches;
  }
  for (const dimension of EXECUTION_PROFILE_DIMENSIONS) {
    const declaredLevel = declaredExecution.dimensions?.[dimension] ?? null;
    const inForceLevel = inForceExecution.dimensions?.[dimension] ?? null;
    if (canonicalJson(declaredLevel) !== canonicalJson(inForceLevel)) {
      mismatches[dimension] = { declared: declaredLevel, in_force: inForceLevel };
    }
  }
  return mismatches;
}

// assertPinnedDimensionsDeclared(profile) -> the profile, or a typed
// FailClosedError (R2). A profile that does not pin the qualification-
// relevant dimensions cannot be compared against the profile in force, and
// a missing pin is never an implicit "same".
export function assertPinnedDimensionsDeclared(profile) {
  const missing = missingPinnedDimensions(profile);
  if (missing.length > 0) {
    failClosed(
      'MODEL_PROFILE_SEMANTICS_WIDENED',
      `model-adaptive profile does not pin the qualification-relevant dimensions (${missing.join(', ')}); a profile that claims model-adaptivity must pin the same state as the execution profile in force`,
      { missing }
    );
  }
  return profile;
}

// assertPinnedDimensionsMatch({ profile, inForce, executionProfiles }) ->
// the profile, or a typed FailClosedError (R2). A model-adaptive profile
// may not silently widen the qualification-relevant state of the profile in
// force.
export function assertPinnedDimensionsMatch({ profile, inForce, executionProfiles = {} }) {
  assertPinnedDimensionsDeclared(profile);
  const mismatches = {
    ...pinnedDimensionMismatches({ profile, inForce }),
    ...executionProfileMismatches({ profile, inForce, executionProfiles })
  };
  const dimensions = Object.keys(mismatches).sort();
  if (dimensions.length > 0) {
    const detail = dimensions
      .map((dimension) => `${dimension}: ${JSON.stringify(mismatches[dimension].declared)} != ${JSON.stringify(mismatches[dimension].in_force)}`)
      .join('; ');
    failClosed(
      'MODEL_PROFILE_SEMANTICS_WIDENED',
      `model-adaptive profile ${profile?.profile_id ?? '<unknown>'}@${profile?.profile_version ?? '?'} does not match the profile in force (${detail}); a presentation layer may never widen the pinned dimensions`,
      { mismatches }
    );
  }
  return profile;
}

// ---------------------------------------------------------------------------
// R7 — runtime capability requirements
// ---------------------------------------------------------------------------

// requiredRuntimeCapabilities(profile) -> the sorted set of runtime
// capabilities the presentation of a profile implies. This is DERIVED from
// the presentation block, so a profile cannot under-declare what it needs.
export function requiredRuntimeCapabilities(profile) {
  const required = new Set();
  const callStyle = profile?.presentation?.tool_call_interface_requirements?.call_style;
  const toolCapability = TOOL_CALL_CAPABILITY[callStyle] ?? null;
  if (toolCapability) {
    required.add(toolCapability);
  }
  const structuredOutput = profile?.presentation?.output_formatting?.structured_output;
  const outputCapability = STRUCTURED_OUTPUT_CAPABILITY[structuredOutput] ?? null;
  if (outputCapability) {
    required.add(outputCapability);
  }
  return [...required].sort();
}

// assertRuntimeRequirementsDeclared(profile) -> the profile, or a typed
// FailClosedError. The declared runtime_requirements must equal the derived
// set exactly (R7).
export function assertRuntimeRequirementsDeclared(profile) {
  const declared = Array.isArray(profile?.runtime_requirements) ? [...profile.runtime_requirements].sort() : null;
  const derived = requiredRuntimeCapabilities(profile);
  if (declared === null || canonicalJson(declared) !== canonicalJson(derived)) {
    failClosed(
      'MODEL_PROFILE_RUNTIME_REQUIREMENTS_INCOHERENT',
      `model-adaptive profile ${profile?.profile_id ?? '<unknown>'}@${profile?.profile_version ?? '?'} declares runtime_requirements ${JSON.stringify(declared)} but its presentation requires ${JSON.stringify(derived)}`,
      { declared, derived }
    );
  }
  for (const capability of declared) {
    if (!RUNTIME_CAPABILITY_VOCABULARY.includes(capability)) {
      failClosed(
        'MODEL_PROFILE_RUNTIME_REQUIREMENTS_INCOHERENT',
        `runtime capability "${capability}" is outside the closed vocabulary ${RUNTIME_CAPABILITY_VOCABULARY.join(', ')}`,
        { declared, derived }
      );
    }
  }
  return profile;
}

// harnessCapabilitiesOf(harness, harnessCapabilities) -> the capability set
// the harness declares, or null when the harness declares nothing at all.
export function harnessCapabilitiesOf(harness, harnessCapabilities) {
  const harnesses = harnessCapabilities?.harnesses;
  if (!harnesses || typeof harnesses !== 'object') {
    return null;
  }
  const entry = harnesses[harness];
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.capabilities)) {
    return null;
  }
  return entry.capabilities;
}

// harnessCapabilityIssues({ profile, harness, harnessCapabilities }) ->
// string[] of the runtime capabilities the profile requires that the
// harness does not declare.
export function harnessCapabilityIssues({ profile, harness, harnessCapabilities }) {
  const issues = [];
  const declared = harnessCapabilitiesOf(harness, harnessCapabilities);
  const required = requiredRuntimeCapabilities(profile);
  if (declared === null) {
    issues.push(`harness "${harness}" declares no runtime capability set`);
    return issues;
  }
  for (const capability of required) {
    if (!declared.includes(capability)) {
      issues.push(`harness "${harness}" does not declare the runtime capability "${capability}" the model requires`);
    }
  }
  return issues;
}

// assertHarnessCapabilities({ profile, harness, harnessCapabilities }) ->
// the profile, or a typed FailClosedError (R7).
export function assertHarnessCapabilities({ profile, harness, harnessCapabilities }) {
  const issues = harnessCapabilityIssues({ profile, harness, harnessCapabilities });
  if (issues.length > 0) {
    failClosed(
      'MODEL_PROFILE_HARNESS_CAPABILITY_MISSING',
      `model-adaptive profile ${profile?.profile_id ?? '<unknown>'}@${profile?.profile_version ?? '?'} cannot run on harness "${harness}": ${issues.join('; ')}`,
      { harness, issues }
    );
  }
  return profile;
}

// ---------------------------------------------------------------------------
// R8 — the effective instruction digest
// ---------------------------------------------------------------------------

// instructionDigestDecision({ profile, currentDigest, qualifiedRef,
// currentRef, decisionId, decidedAt }) -> a MaterialityDecision-shaped
// record (core/contracts/materiality-decision.schema.json) describing the
// drift of the effective instruction digest. A changed digest is MATERIAL;
// a missing side is UNKNOWN; both block the binding.
export function instructionDigestDecision({
  profile,
  currentDigest,
  qualifiedRef = 'model-adaptive-profile',
  currentRef = 'effective-instruction-bundle',
  decisionId = 'mat_model_adaptive_instruction_digest',
  decidedAt = '1970-01-01T00:00:00Z'
}) {
  const declared = pinnedDimensions(profile)?.[INSTRUCTION_DIGEST_DIMENSION] ?? null;
  const from = declared;
  const to = isNonEmptyString(currentDigest) ? currentDigest : null;
  const shapeOk = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
  let classification = 'NON_MATERIAL';
  if (!shapeOk(from) || !shapeOk(to)) {
    classification = 'UNKNOWN';
  } else if (from !== to) {
    classification = 'MATERIAL';
  }
  return {
    decision_id: decisionId,
    qualified_fingerprint_ref: qualifiedRef,
    current_fingerprint_ref: currentRef,
    deltas: classification === 'NON_MATERIAL'
      ? []
      : [{ component: INSTRUCTION_DIGEST_DIMENSION, from, to, classification }],
    overall_class: classification,
    decided_at: decidedAt
  };
}

// assertInstructionDigestCurrent({ profile, currentDigest, ... }) -> the
// profile, or a typed FailClosedError (R8). The effective instruction
// digest the profile was qualified under must still be effective.
export function assertInstructionDigestCurrent({
  profile,
  currentDigest,
  qualifiedRef,
  currentRef,
  decisionId,
  decidedAt
}) {
  const decision = instructionDigestDecision({
    profile,
    currentDigest,
    qualifiedRef,
    currentRef,
    decisionId,
    decidedAt
  });
  if (decision.overall_class !== 'NON_MATERIAL') {
    failClosed(
      'MODEL_PROFILE_INSTRUCTION_DIGEST_DRIFT',
      `the effective instruction digest changed since qualification of ${profile?.profile_id ?? '<unknown>'}@${profile?.profile_version ?? '?'} (${decision.overall_class}); the profile is blocked until it is requalified against the current instruction set`,
      decision
    );
  }
  return profile;
}

// ---------------------------------------------------------------------------
// R2/R5 — qualification coverage of the (model, provider) pair
// ---------------------------------------------------------------------------

// assertQualificationCoverage({ modelId, providerId, qualification,
// fingerprint }) -> { qualification, fingerprint }, or a typed FailClosedError.
// The (model, provider) pair must be covered by a QUALIFIED qualification
// whose fingerprint names exactly that pair.
export function assertQualificationCoverage({ modelId, providerId, qualification, fingerprint }) {
  if (!qualification || typeof qualification !== 'object' || Array.isArray(qualification)) {
    failClosed(
      'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
      'no qualification record covers the requested model/provider pair; a model-adaptive profile is a qualification input and never confers a qualification'
    );
  }
  if (qualification.state !== 'QUALIFIED') {
    failClosed(
      'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
      `the qualification for "${modelId}" is ${qualification.state}, not QUALIFIED; the model/provider pair is not covered by a qualification profile`,
      { state: qualification.state }
    );
  }
  if (!Array.isArray(qualification.evidence_refs) || qualification.evidence_refs.length === 0) {
    failClosed(
      'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
      'the qualification covering the model/provider pair carries no evidence; coverage is never assumed',
      { state: qualification.state }
    );
  }
  if (!fingerprint || typeof fingerprint !== 'object' || Array.isArray(fingerprint)) {
    failClosed(
      'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
      'the qualification fingerprint is required to prove which model/provider pair is covered'
    );
  }
  if (qualification.fingerprint_ref !== fingerprint.fingerprint_id) {
    failClosed(
      'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
      `the qualification references fingerprint "${qualification.fingerprint_ref}" but fingerprint "${fingerprint.fingerprint_id}" was provided`,
      { qualification_ref: qualification.fingerprint_ref, fingerprint_id: fingerprint.fingerprint_id }
    );
  }
  const components = fingerprint.components ?? {};
  if (components.model_id !== modelId || components.provider_id !== providerId) {
    failClosed(
      'MODEL_PROFILE_QUALIFICATION_UNCOVERED',
      `the qualification covers provider "${components.provider_id ?? 'null'}" / model "${components.model_id ?? 'null'}", not provider "${providerId}" / model "${modelId}"`,
      {
        qualified: { provider_id: components.provider_id ?? null, model_id: components.model_id ?? null },
        requested: { provider_id: providerId, model_id: modelId }
      }
    );
  }
  return { qualification, fingerprint };
}

// ---------------------------------------------------------------------------
// R6 — presentation coherence with the canonical provider capability contract
// ---------------------------------------------------------------------------

export function presentationCapabilityIssues(profile, capability) {
  const issues = [];
  const presentation = profile?.presentation;
  if (!presentation || typeof presentation !== 'object') {
    return ['profile carries no presentation block'];
  }
  const structuredOutput = presentation.output_formatting?.structured_output;
  const allowedStructured = STRUCTURED_OUTPUT_BY_CAPABILITY[capability.structuredOutputs] || [];
  if (!allowedStructured.includes(structuredOutput)) {
    issues.push(
      `presentation.output_formatting.structured_output=${JSON.stringify(structuredOutput)} is not realizable under the canonical provider capability structuredOutputs=${capability.structuredOutputs} (allowed: ${allowedStructured.join(', ')})`
    );
  }
  const callStyle = presentation.tool_call_interface_requirements?.call_style;
  const allowedCallStyle = CALL_STYLE_BY_TOOL_USE[capability.toolUse] || [];
  if (!allowedCallStyle.includes(callStyle)) {
    issues.push(
      `presentation.tool_call_interface_requirements.call_style=${JSON.stringify(callStyle)} is not realizable under the canonical provider capability toolUse=${capability.toolUse} (allowed: ${allowedCallStyle.join(', ')})`
    );
  }
  const mode = presentation.output_formatting?.mode;
  const allowedByMode = OUTPUT_MODE_STRUCTURED_OUTPUT[mode] || [];
  if (!allowedByMode.includes(structuredOutput)) {
    issues.push(
      `presentation.output_formatting.mode=${JSON.stringify(mode)} is inconsistent with structured_output=${JSON.stringify(structuredOutput)} (allowed: ${allowedByMode.join(', ')})`
    );
  }
  return issues;
}

// ---------------------------------------------------------------------------
// R1 — resolution
// ---------------------------------------------------------------------------

function compareVersions(left, right) {
  const leftParts = String(left).split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = String(right).split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return 0;
}

function requireStore(store) {
  if (!store || typeof store !== 'object') {
    failClosed('MODEL_PROFILE_STORE_INVALID', 'a model-adaptive profile store is required');
  }
  if (!Array.isArray(store.profiles)) {
    failClosed('MODEL_PROFILE_STORE_INVALID', 'the model-adaptive profile store must carry a profiles array');
  }
  if (!isNonEmptyString(store.root)) {
    failClosed('MODEL_PROFILE_STORE_INVALID', 'the model-adaptive profile store must carry the repository root for contract validation');
  }
  return store;
}

// resolveModelAdaptiveProfile({ executorId, providerId, modelId, profileVersion, store })
//   -> the single profile bound to that (executor, provider, model).
//      Missing binding -> MODEL_PROFILE_NOT_FOUND. Ambiguous binding ->
//      MODEL_PROFILE_AMBIGUOUS. A profile whose semantics_preservation block
//      deviates -> MODEL_PROFILE_SEMANTICS_WIDENED.
export function resolveModelAdaptiveProfile({ executorId, providerId, modelId, profileVersion = null, store }) {
  requireStore(store);
  if (!isNonEmptyString(executorId)) {
    failClosed('MODEL_PROFILE_NOT_FOUND', 'executor id is required to resolve a model-adaptive profile');
  }
  if (!isNonEmptyString(modelId)) {
    failClosed('MODEL_PROFILE_NOT_FOUND', 'model id is required to resolve a model-adaptive profile');
  }
  const provider = resolveProviderCapability({
    providerCapabilities: store.providerCapabilities,
    providerExports: store.providerExports || {},
    providerId
  });

  const candidates = store.profiles.filter((profile) => profile
    && profile.executor_id === executorId
    && profile.provider_id === provider.name
    && profile.model_id === modelId);

  if (candidates.length === 0) {
    failClosed(
      'MODEL_PROFILE_NOT_FOUND',
      `no model-adaptive profile is bound to executor "${executorId}" on provider "${provider.name}" and model "${modelId}"`,
      { executorId, providerId: provider.name, modelId }
    );
  }

  let selected;
  if (isNonEmptyString(profileVersion)) {
    selected = candidates.filter((profile) => profile.profile_version === profileVersion);
    if (selected.length === 0) {
      failClosed(
        'MODEL_PROFILE_NOT_FOUND',
        `no model-adaptive profile version "${profileVersion}" is bound to executor "${executorId}" on provider "${provider.name}" and model "${modelId}"`,
        { executorId, providerId: provider.name, modelId, profileVersion }
      );
    }
  } else {
    const sorted = [...candidates].sort((left, right) => compareVersions(right.profile_version, left.profile_version));
    selected = [sorted[0]];
  }

  if (selected.length > 1) {
    failClosed(
      'MODEL_PROFILE_AMBIGUOUS',
      `multiple model-adaptive profiles share the binding (executor "${executorId}", provider "${provider.name}", model "${modelId}", version "${selected[0].profile_version}"); profile selection is ambiguous`,
      { executorId, providerId: provider.name, modelId }
    );
  }

  const profile = selected[0];
  // The invariant-semantics check runs BEFORE the schema check so that a
  // widened profile always reports the precise fail-closed code
  // (MODEL_PROFILE_SEMANTICS_WIDENED) instead of a generic contract issue.
  assertSemanticsPreserved(profile);
  const contractIssues = validateInstanceAgainstContract(profile, MODEL_ADAPTIVE_PROFILE_CONTRACT, store.root);
  if (contractIssues.length > 0) {
    failClosed(
      'MODEL_PROFILE_CONTRACT_INVALID',
      `model-adaptive profile ${profile.profile_id}@${profile.profile_version} violates ${MODEL_ADAPTIVE_PROFILE_CONTRACT}: ${contractIssues.join('; ')}`,
      { contractIssues }
    );
  }

  const capabilityIssues = presentationCapabilityIssues(profile, provider.capability);
  if (capabilityIssues.length > 0) {
    failClosed(
      'MODEL_PROFILE_CAPABILITY_INCOHERENT',
      `model-adaptive profile ${profile.profile_id}@${profile.profile_version} is not coherent with the canonical provider capability contract of "${provider.name}": ${capabilityIssues.join('; ')}`,
      { capabilityIssues }
    );
  }
  return profile;
}

// ---------------------------------------------------------------------------
// R3 / R4 — the equivalence invariant
// ---------------------------------------------------------------------------

function executionProfileOf(profile, executionProfiles) {
  const ref = profile?.execution_profile_ref;
  if (!isNonEmptyString(ref)) {
    return null;
  }
  const map = executionProfiles && typeof executionProfiles === 'object' ? executionProfiles : {};
  const candidate = map[ref];
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  return candidate;
}

// compareProfileEquivalence({ left, right, executionProfiles })
//   -> { equivalent, authority_equivalent, completion_equivalent,
//        same_model, per_dimension, findings }.
//
// Never throws for a semantic deviation: a deviation is a FINDING and makes
// the profiles non-equivalent. A missing authority anchor is also a finding
// (an unanchored comparison can never be equivalent).
export function compareProfileEquivalence({ left, right, executionProfiles = {} }) {
  const findings = [];
  const perDimension = {};

  const leftDeviations = semanticsDeviations(left);
  const rightDeviations = semanticsDeviations(right);
  for (const dimension of leftDeviations) {
    findings.push(`left profile deviates from "unchanged" on ${dimension}`);
  }
  for (const dimension of rightDeviations) {
    findings.push(`right profile deviates from "unchanged" on ${dimension}`);
  }

  const leftExecution = executionProfileOf(left, executionProfiles);
  const rightExecution = executionProfileOf(right, executionProfiles);
  if (!leftExecution) {
    findings.push(`left profile binds execution profile "${left?.execution_profile_ref ?? '<missing>'}" which is not available for comparison`);
  }
  if (!rightExecution) {
    findings.push(`right profile binds execution profile "${right?.execution_profile_ref ?? '<missing>'}" which is not available for comparison`);
  }

  let authorityEquivalent = true;
  let completionEquivalent = true;
  for (const dimension of EXECUTION_PROFILE_DIMENSIONS) {
    const leftLevel = leftExecution?.dimensions?.[dimension] ?? null;
    const rightLevel = rightExecution?.dimensions?.[dimension] ?? null;
    const equal = canonicalJson(leftLevel) === canonicalJson(rightLevel);
    perDimension[dimension] = {
      left_level: leftLevel,
      right_level: rightLevel,
      equal,
      class: AUTHORITY_EXECUTION_DIMENSIONS.includes(dimension) ? 'authority' : 'completion'
    };
    if (!equal) {
      findings.push(`execution-profile dimension ${dimension} differs (${JSON.stringify(leftLevel)} vs ${JSON.stringify(rightLevel)})`);
      if (AUTHORITY_EXECUTION_DIMENSIONS.includes(dimension)) {
        authorityEquivalent = false;
      } else {
        completionEquivalent = false;
      }
    }
  }

  const sameModel = left?.model_id === right?.model_id;
  if (!sameModel) {
    findings.push(`profiles bind different models (${JSON.stringify(left?.model_id ?? null)} vs ${JSON.stringify(right?.model_id ?? null)})`);
  }

  const equivalent = authorityEquivalent && completionEquivalent && findings.length === 0;
  return {
    equivalent,
    authority_equivalent: authorityEquivalent,
    completion_equivalent: completionEquivalent,
    same_model: sameModel,
    same_executor: left?.executor_id === right?.executor_id,
    per_dimension: perDimension,
    findings
  };
}

// assertProfileEquivalence({ left, right, executionProfiles }) -> the
// comparison result, or a typed FailClosedError. This is the S12 DoD gate.
export function assertProfileEquivalence({ left, right, executionProfiles = {} }) {
  const comparison = compareProfileEquivalence({ left, right, executionProfiles });
  if (!comparison.equivalent) {
    failClosed(
      'MODEL_PROFILE_NOT_EQUIVALENT',
      `model-adaptive profiles ${left?.profile_id ?? '<unknown>'}@${left?.profile_version ?? '?'} and ${right?.profile_id ?? '<unknown>'}@${right?.profile_version ?? '?'} do not produce equivalent authority and completion semantics: ${comparison.findings.join('; ')}`,
      comparison
    );
  }
  return comparison;
}

// assertNoAuthorityWidening({ left, right, executionProfiles }) -> the
// comparison result, or a typed FailClosedError when the switch broadens any
// authority dimension. A stronger model earns no wider rights (spec 11.4).
export function assertNoAuthorityWidening({ left, right, executionProfiles = {} }) {
  const leftExecution = executionProfileOf(left, executionProfiles);
  const rightExecution = executionProfileOf(right, executionProfiles);
  if (!leftExecution || !rightExecution) {
    failClosed(
      'MODEL_PROFILE_EXECUTION_PROFILE_MISSING',
      'the execution profiles of both model-adaptive profiles are required to decide whether a switch widens authority'
    );
  }
  const widened = [];
  for (const dimension of AUTHORITY_EXECUTION_DIMENSIONS) {
    const leftLevel = leftExecution.dimensions?.[dimension];
    const rightLevel = rightExecution.dimensions?.[dimension];
    if (levelRank(dimension, rightLevel) > levelRank(dimension, leftLevel)) {
      widened.push(`${dimension} (${JSON.stringify(leftLevel)} -> ${JSON.stringify(rightLevel)})`);
    }
  }
  if (widened.length > 0) {
    failClosed(
      'MODEL_PROFILE_AUTHORITY_WIDENED',
      `the model-adaptive profile switch widens authority (${widened.join('; ')}); a presentation layer may never widen rights`,
      { widened }
    );
  }
  return { widened: [] };
}

// ---------------------------------------------------------------------------
// R5 — requalification on model change / material drift
// ---------------------------------------------------------------------------

// assertProfileRequalification({ profile, qualifiedFingerprint, currentFingerprint })
//   -> the materiality decision, or a typed FailClosedError. A model change
//      shows up as a material fingerprint delta (provider_id / model_id are
//      tracked qualification components), so the previous qualification is
//      never inherited silently (spec 11.3 / 11.4).
export function assertProfileRequalification({ profile, qualifiedFingerprint, currentFingerprint }) {
  if (!profile || typeof profile !== 'object') {
    failClosed('MODEL_PROFILE_REQUALIFICATION_UNKNOWN', 'a model-adaptive profile is required for the requalification check');
  }
  if (!qualifiedFingerprint || !currentFingerprint) {
    failClosed(
      'MODEL_PROFILE_REQUALIFICATION_UNKNOWN',
      'the qualified and the current qualification fingerprint are required; an unproven drift blocks instead of inheriting the previous qualification'
    );
  }
  const qualifiedComponents = qualifiedFingerprint.components || {};
  const currentComponents = currentFingerprint.components || {};
  if (qualifiedComponents.provider_id !== profile.provider_id
    || qualifiedComponents.model_id !== profile.model_id
    || currentComponents.provider_id !== profile.provider_id
    || currentComponents.model_id !== profile.model_id) {
    failClosed(
      'MODEL_PROFILE_REQUALIFICATION_REQUIRED',
      `the qualification was not earned for provider "${profile.provider_id}" / model "${profile.model_id}"; a model change requires requalification of the affected behavior`,
      {
        profile_provider_id: profile.provider_id,
        profile_model_id: profile.model_id,
        qualified: { provider_id: qualifiedComponents.provider_id ?? null, model_id: qualifiedComponents.model_id ?? null },
        current: { provider_id: currentComponents.provider_id ?? null, model_id: currentComponents.model_id ?? null }
      }
    );
  }
  const materiality = classifyMateriality(qualifiedFingerprint, currentFingerprint);
  if (materiality.overall_class !== 'NON_MATERIAL') {
    failClosed(
      'MODEL_PROFILE_REQUALIFICATION_REQUIRED',
      `the qualification for model-adaptive profile ${profile.profile_id}@${profile.profile_version} is ${materiality.overall_class}; a material or unknown drift blocks the profile until requalified`,
      materiality
    );
  }
  return materiality;
}

// ---------------------------------------------------------------------------
// Qualification state of a profile (recorded, never conferred)
// ---------------------------------------------------------------------------

// assertProfileQualified(profile) -> the profile, or a typed
// FailClosedError. A model-adaptive profile is a qualification INPUT; only
// a QUALIFIED state backed by eval evidence may be bound to an executor.
export function assertProfileQualified(profile) {
  const qualification = profile?.qualification;
  if (!qualification || typeof qualification !== 'object') {
    failClosed('MODEL_PROFILE_NOT_QUALIFIED', 'the model-adaptive profile carries no qualification record');
  }
  if (qualification.state !== 'QUALIFIED') {
    failClosed(
      'MODEL_PROFILE_NOT_QUALIFIED',
      `the model-adaptive profile is ${qualification.state}, not QUALIFIED; representative-eval qualification is required before binding`,
      { state: qualification.state }
    );
  }
  if (!Array.isArray(qualification.evidence_refs) || qualification.evidence_refs.length === 0) {
    failClosed(
      'MODEL_PROFILE_NOT_QUALIFIED',
      'the model-adaptive profile claims QUALIFIED without any qualification evidence',
      { state: qualification.state }
    );
  }
  return profile;
}

// assertMaterialityDecisionValid(decision, root) -> the decision, or a
// typed FailClosedError. The instruction-digest drift is reported with the
// canonical MaterialityDecision contract, never with a parallel shape.
export function assertMaterialityDecisionValid(decision, root) {
  const issues = validateInstanceAgainstContract(decision, MATERIALITY_DECISION_CONTRACT, root);
  if (issues.length > 0) {
    failClosed(
      'MODEL_PROFILE_CONTRACT_INVALID',
      `the materiality decision violates ${MATERIALITY_DECISION_CONTRACT}: ${issues.join('; ')}`,
      { issues }
    );
  }
  return decision;
}
