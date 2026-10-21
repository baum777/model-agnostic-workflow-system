// MAWS vNext — S12 model-adaptive executor profile store (spec
// MAWS-SII-TARGET-SPEC-001 v0.2.0, section 11.5 + slice S12).
//
// The store holds the committed model-adaptive profile definitions, the
// reference-only pins of the execution profiles they bind to, and the
// harness runtime-capability declarations. It is a READING surface: it never
// writes, never mints authority and never confers a qualification.
//
// The execution-profile pins are NOT a second authority for execution
// profiles. The canonical contract stays
// core/contracts/execution-profile.schema.json and the qualification-side
// instances stay where the qualification lane owns them. The pins exist so
// the equivalence check can anchor the authority/completion semantics of a
// model-adaptive profile without reaching into runtime state.
//
// Fail closed: an invalid, unanchored or incoherent committed profile makes
// the whole store unreadable.
import fs from 'node:fs';
import path from 'node:path';
import { FailClosedError } from '../../../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../../../scripts/tools/validate-maws-vnext-contracts.mjs';
import {
  MODEL_ADAPTIVE_PROFILE_CONTRACT,
  EXECUTION_PROFILE_CONTRACT,
  RUNTIME_CAPABILITY_VOCABULARY,
  loadProviderCapabilityContract,
  loadProviderExports,
  assertSemanticsPreserved,
  assertRuntimeRequirementsDeclared,
  presentationCapabilityIssues,
  resolveProviderCapability
} from './profile-resolver.mjs';

export const MODEL_ADAPTIVE_PROFILE_DIR = 'runtime/harness-context/profiles/model-adaptive/profiles';
export const MODEL_ADAPTIVE_EXECUTION_PROFILE_REFS = 'runtime/harness-context/profiles/model-adaptive/execution-profile-refs.json';
export const MODEL_ADAPTIVE_HARNESS_CAPABILITIES = 'runtime/harness-context/profiles/model-adaptive/harness-capabilities.json';

function failClosed(code, message, details = {}) {
  throw new FailClosedError(code, message, details);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// loadHarnessCapabilities(root) -> the declared harness runtime capabilities.
// A harness that is not declared declares nothing (fail closed at the point
// of use, never an assumed capability).
export function loadHarnessCapabilities(root) {
  const capabilitiesPath = path.join(root, MODEL_ADAPTIVE_HARNESS_CAPABILITIES);
  if (!fs.existsSync(capabilitiesPath)) {
    failClosed('MODEL_PROFILE_STORE_INVALID', `missing harness capability declarations: ${MODEL_ADAPTIVE_HARNESS_CAPABILITIES}`);
  }
  const declarations = readJson(capabilitiesPath);
  if (!declarations || typeof declarations !== 'object' || !declarations.harnesses
    || typeof declarations.harnesses !== 'object' || Array.isArray(declarations.harnesses)) {
    failClosed('MODEL_PROFILE_STORE_INVALID', `${MODEL_ADAPTIVE_HARNESS_CAPABILITIES} must declare a harnesses object`);
  }
  const vocabulary = Array.isArray(declarations.capability_vocabulary) ? declarations.capability_vocabulary : [];
  for (const capability of vocabulary) {
    if (!RUNTIME_CAPABILITY_VOCABULARY.includes(capability)) {
      failClosed(
        'MODEL_PROFILE_STORE_INVALID',
        `${MODEL_ADAPTIVE_HARNESS_CAPABILITIES} declares the capability "${capability}" outside the closed vocabulary ${RUNTIME_CAPABILITY_VOCABULARY.join(', ')}`
      );
    }
  }
  for (const [harness, entry] of Object.entries(declarations.harnesses)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.capabilities)) {
      failClosed('MODEL_PROFILE_STORE_INVALID', `harness "${harness}" must declare a capabilities array`);
    }
    for (const capability of entry.capabilities) {
      if (!RUNTIME_CAPABILITY_VOCABULARY.includes(capability)) {
        failClosed(
          'MODEL_PROFILE_STORE_INVALID',
          `harness "${harness}" declares the capability "${capability}" outside the closed vocabulary ${RUNTIME_CAPABILITY_VOCABULARY.join(', ')}`
        );
      }
    }
  }
  return declarations;
}

// loadProfileStore({ root }) -> the store object consumed by
// resolveModelAdaptiveProfile(), compareProfileEquivalence() and
// resolveExecutorProfile().
//
// The returned store carries: root (for contract validation), profiles
// (validated model-adaptive records), executionProfiles (reference-only
// pins), providerCapabilities (the canonical contract), providerExports
// (the derived projections, inputs only) and harnessCapabilities (the
// declared harness runtime capabilities).
export function loadProfileStore({ root }) {
  if (typeof root !== 'string' || root.length === 0) {
    failClosed('MODEL_PROFILE_STORE_INVALID', 'the model-adaptive profile store requires the repository root');
  }
  const profileDir = path.join(root, MODEL_ADAPTIVE_PROFILE_DIR);
  if (!fs.existsSync(profileDir)) {
    failClosed('MODEL_PROFILE_STORE_INVALID', `missing model-adaptive profile directory: ${MODEL_ADAPTIVE_PROFILE_DIR}`);
  }
  const refsPath = path.join(root, MODEL_ADAPTIVE_EXECUTION_PROFILE_REFS);
  if (!fs.existsSync(refsPath)) {
    failClosed('MODEL_PROFILE_STORE_INVALID', `missing execution-profile reference pins: ${MODEL_ADAPTIVE_EXECUTION_PROFILE_REFS}`);
  }

  const providerCapabilities = loadProviderCapabilityContract(root);
  const providerExports = loadProviderExports(root);
  const harnessCapabilities = loadHarnessCapabilities(root);
  const refs = readJson(refsPath);
  const executionProfiles = refs.execution_profiles;
  if (!executionProfiles || typeof executionProfiles !== 'object' || Array.isArray(executionProfiles)) {
    failClosed('MODEL_PROFILE_STORE_INVALID', `${MODEL_ADAPTIVE_EXECUTION_PROFILE_REFS} must declare an execution_profiles object`);
  }
  for (const [profileId, executionProfile] of Object.entries(executionProfiles)) {
    const issues = validateInstanceAgainstContract(executionProfile, EXECUTION_PROFILE_CONTRACT, root);
    if (issues.length > 0) {
      failClosed(
        'MODEL_PROFILE_STORE_INVALID',
        `execution-profile reference pin "${profileId}" violates ${EXECUTION_PROFILE_CONTRACT}: ${issues.join('; ')}`,
        { profileId, issues }
      );
    }
  }

  const profiles = [];
  const files = fs.readdirSync(profileDir).filter((name) => name.endsWith('.json')).sort();
  for (const fileName of files) {
    const profile = readJson(path.join(profileDir, fileName));
    const issues = validateInstanceAgainstContract(profile, MODEL_ADAPTIVE_PROFILE_CONTRACT, root);
    if (issues.length > 0) {
      failClosed(
        'MODEL_PROFILE_STORE_INVALID',
        `model-adaptive profile ${fileName} violates ${MODEL_ADAPTIVE_PROFILE_CONTRACT}: ${issues.join('; ')}`,
        { fileName, issues }
      );
    }
    assertSemanticsPreserved(profile);
    assertRuntimeRequirementsDeclared(profile);
    const provider = resolveProviderCapability({
      providerCapabilities,
      providerExports,
      providerId: profile.provider_id
    });
    const capabilityIssues = presentationCapabilityIssues(profile, provider.capability);
    if (capabilityIssues.length > 0) {
      failClosed(
        'MODEL_PROFILE_STORE_INVALID',
        `model-adaptive profile ${fileName} is not coherent with the canonical provider capability contract of "${provider.name}": ${capabilityIssues.join('; ')}`,
        { fileName, capabilityIssues }
      );
    }
    if (!executionProfiles[profile.execution_profile_ref]) {
      failClosed(
        'MODEL_PROFILE_STORE_INVALID',
        `model-adaptive profile ${fileName} binds execution profile "${profile.execution_profile_ref}" which has no reference pin in ${MODEL_ADAPTIVE_EXECUTION_PROFILE_REFS}`,
        { fileName, executionProfileRef: profile.execution_profile_ref }
      );
    }
    profiles.push(profile);
  }

  if (profiles.length === 0) {
    failClosed('MODEL_PROFILE_STORE_INVALID', 'the model-adaptive profile store is empty');
  }

  const seen = new Map();
  for (const profile of profiles) {
    const key = `${profile.executor_id}|${profile.provider_id}|${profile.model_id}|${profile.profile_version}`;
    if (seen.has(key)) {
      failClosed(
        'MODEL_PROFILE_STORE_INVALID',
        `two model-adaptive profiles share the binding ${key}; profile identity is ambiguous`,
        { key }
      );
    }
    seen.set(key, profile.profile_id);
  }

  return {
    root,
    profiles,
    executionProfiles,
    providerCapabilities,
    providerExports,
    harnessCapabilities,
    source: {
      profile_dir: MODEL_ADAPTIVE_PROFILE_DIR,
      execution_profile_refs: MODEL_ADAPTIVE_EXECUTION_PROFILE_REFS,
      harness_capabilities: MODEL_ADAPTIVE_HARNESS_CAPABILITIES,
      profile_contract: MODEL_ADAPTIVE_PROFILE_CONTRACT
    }
  };
}
