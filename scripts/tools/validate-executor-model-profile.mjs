#!/usr/bin/env node
// S12 validator (MAWS-SII-TARGET-SPEC-001 v0.2.0, section 11.5 + slice S12):
// model-adaptive executor profiles.
//
// Usage:
//   node scripts/tools/validate-executor-model-profile.mjs
//                                                                   validate the committed
//                                                                   store and the canonical
//                                                                   fixture (schema cases and
//                                                                   runtime denial cases)
//   node scripts/tools/validate-executor-model-profile.mjs <file.json> ...
//                                                                   validate explicit profile
//                                                                   records (all must be valid)
//
// It proves five things and nothing else:
//   1. every committed profile is contract-valid, keeps all six invariant
//      semantics dimensions at "unchanged", pins the qualification-relevant
//      dimensions, declares exactly the runtime capabilities its
//      presentation implies, and is coherent with the canonical provider
//      capability contract;
//   2. every canonical provider of core/contracts/provider-capabilities.json
//      has a committed model-adaptive profile, and the derived provider
//      exports agree with the canonical contract (they are inputs, never
//      authority);
//   3. the S12 DoD invariant: two profiles of the SAME model produce
//      IDENTICAL authority and completion semantics even when their
//      presentation differs, and no profile switch widens authority;
//   4. the committed schema fixture cases stay schema-decidable;
//   5. the committed runtime denial cases deny with exactly the expected
//      typed code, and the four S12 denial paths are all covered.
//
// A model-adaptive profile grants no authority, confers no qualification and
// changes no execution-profile dimension. This validator proves record
// shape, the equivalence invariant and the denial paths only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';
import { loadProfileStore } from '../../runtime/harness-context/profiles/model-adaptive/profile-store.mjs';
import {
  MODEL_ADAPTIVE_PROFILE_CONTRACT,
  EXECUTION_PROFILE_CONTRACT,
  compareProfileEquivalence,
  assertNoAuthorityWidening,
  semanticsDeviations,
  missingPinnedDimensions,
  requiredRuntimeCapabilities
} from '../../runtime/harness-context/profiles/model-adaptive/profile-resolver.mjs';
import {
  EXECUTOR_PROFILE_DENIAL_CODES,
  resolveExecutorProfile
} from '../../runtime/harness-context/profiles/model-adaptive/executor-profile.mjs';

const FIXTURE_PATH = 'evals/fixtures/maws-vnext/executor-model-profile.contracts.json';
const QUALIFICATION_FINGERPRINT_CONTRACT = 'core/contracts/qualification-fingerprint.schema.json';
const QUALIFICATION_RECORD_CONTRACT = 'core/contracts/qualification-record.schema.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pairsOf(items) {
  const pairs = [];
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      pairs.push([items[left], items[right]]);
    }
  }
  return pairs;
}

// deepMerge(base, overrides) -> a new object. Plain objects are merged
// key-wise, every other value is replaced. Used to apply the synthetic
// fixture overrides to a committed profile without mutating the store.
export function deepMerge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return JSON.parse(JSON.stringify(overrides ?? null));
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return merged;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// buildInForce({ payload, store }) -> the qualification-side state in force
// for a fixture case. The execution profile is taken from the committed
// reference pins; the qualification and the fingerprint come from the case.
export function buildInForce({ payload, store }) {
  const inForce = payload?.in_force ?? {};
  const executionProfileRef = inForce.execution_profile_ref ?? inForce.qualification?.execution_profile_ref ?? null;
  const executionProfile = executionProfileRef ? store.executionProfiles?.[executionProfileRef] ?? null : null;
  return {
    execution_profile: executionProfile,
    qualification: inForce.qualification ?? null,
    fingerprint: inForce.fingerprint ?? null,
    effective_instruction_digest: inForce.effective_instruction_digest ?? null,
    effective_instruction_bundle_ref: inForce.effective_instruction_bundle_ref ?? null
  };
}

// evaluateDenialCase({ entry, store, root }) -> string[] of issues. An empty
// list means the runtime behaved exactly as the case declares.
export function evaluateDenialCase({ entry, store, root }) {
  const issues = [];
  const payload = entry.payload ?? {};
  const request = payload.request ?? {};
  const expectedCode = entry.expected_code ?? null;

  // The in-force qualification and fingerprint must be contract-valid: the
  // denial corpus is contract-backed, not free-form.
  const inForce = buildInForce({ payload, store });
  if (inForce.qualification) {
    for (const issue of validateInstanceAgainstContract(inForce.qualification, QUALIFICATION_RECORD_CONTRACT, root)) {
      issues.push(`${entry.case_id}: in_force qualification violates ${QUALIFICATION_RECORD_CONTRACT}: ${issue}`);
    }
  }
  if (inForce.fingerprint) {
    for (const issue of validateInstanceAgainstContract(inForce.fingerprint, QUALIFICATION_FINGERPRINT_CONTRACT, root)) {
      issues.push(`${entry.case_id}: in_force fingerprint violates ${QUALIFICATION_FINGERPRINT_CONTRACT}: ${issue}`);
    }
  }
  if (!inForce.execution_profile) {
    issues.push(`${entry.case_id}: in_force execution profile "${payload.in_force?.execution_profile_ref ?? 'null'}" has no committed reference pin`);
  }

  let declaredProfile = null;
  if (request.profile_id) {
    declaredProfile = store.profiles.find((profile) => profile.profile_id === request.profile_id
      && (request.profile_version === undefined || profile.profile_version === request.profile_version)) ?? null;
    if (!declaredProfile) {
      issues.push(`${entry.case_id}: the committed profile "${request.profile_id}@${request.profile_version ?? 'newest'}" does not exist`);
      return issues;
    }
  }
  const profile = payload.profile_overrides
    ? deepMerge(declaredProfile ?? {}, payload.profile_overrides)
    : declaredProfile;

  try {
    const resolved = resolveExecutorProfile({
      modelId: request.model_id,
      providerId: request.provider_id,
      harness: request.harness,
      declaredProfile: profile,
      store,
      inForce
    });
    if (expectedCode !== null) {
      issues.push(`${entry.case_id}: expected the denial ${expectedCode} but the executor profile was resolved for ${resolved.profile_id}@${resolved.profile_version}`);
    }
  } catch (error) {
    const observed = error?.code ?? 'ERROR';
    if (expectedCode === null) {
      issues.push(`${entry.case_id}: expected the executor profile to resolve but observed ${observed}: ${error?.message}`);
    } else if (observed !== expectedCode) {
      issues.push(`${entry.case_id}: expected the denial ${expectedCode} but observed ${observed}: ${error?.message}`);
    }
  }
  return issues;
}

// validateExecutorModelProfiles({ root }) -> { ok, issues, report }
export function validateExecutorModelProfiles({ root }) {
  const issues = [];
  const report = {
    profiles: [],
    same_model_pairs: [],
    provider_coverage: {},
    fixture: null,
    denial_cases: null
  };

  let store;
  try {
    store = loadProfileStore({ root });
  } catch (error) {
    return {
      ok: false,
      issues: [`profile store: ${error.code ?? 'ERROR'}: ${error.message}`],
      report
    };
  }

  // (1) per-profile shape and invariant semantics.
  for (const profile of store.profiles) {
    const contractIssues = validateInstanceAgainstContract(profile, MODEL_ADAPTIVE_PROFILE_CONTRACT, root);
    const deviations = semanticsDeviations(profile);
    const missingPins = missingPinnedDimensions(profile);
    const declaredRequirements = Array.isArray(profile.runtime_requirements) ? [...profile.runtime_requirements].sort() : [];
    const derivedRequirements = requiredRuntimeCapabilities(profile);
    if (contractIssues.length > 0) {
      issues.push(`profile ${profile.profile_id}@${profile.profile_version}: contract violation: ${contractIssues.join('; ')}`);
    }
    if (deviations.length > 0) {
      issues.push(`profile ${profile.profile_id}@${profile.profile_version}: invariant semantics widened (${deviations.join(', ')})`);
    }
    if (missingPins.length > 0) {
      issues.push(`profile ${profile.profile_id}@${profile.profile_version}: does not pin the qualification-relevant dimensions (${missingPins.join(', ')})`);
    }
    if (JSON.stringify(declaredRequirements) !== JSON.stringify(derivedRequirements)) {
      issues.push(`profile ${profile.profile_id}@${profile.profile_version}: declares runtime_requirements ${JSON.stringify(declaredRequirements)} but its presentation requires ${JSON.stringify(derivedRequirements)}`);
    }
    report.profiles.push({
      profile_id: profile.profile_id,
      profile_version: profile.profile_version,
      executor_id: profile.executor_id,
      provider_id: profile.provider_id,
      model_id: profile.model_id,
      execution_profile_ref: profile.execution_profile_ref,
      qualification_state: profile.qualification?.state ?? null,
      contract_valid: contractIssues.length === 0,
      semantics_preserved: deviations.length === 0,
      pinned_dimensions_complete: missingPins.length === 0,
      runtime_requirements_coherent: JSON.stringify(declaredRequirements) === JSON.stringify(derivedRequirements)
    });
  }

  // (2a) provider coverage: every canonical provider has a committed profile.
  const coveredProviders = new Set(store.profiles.map((profile) => profile.provider_id));
  for (const provider of store.providerCapabilities.providers || []) {
    report.provider_coverage[provider.name] = coveredProviders.has(provider.name);
    if (!coveredProviders.has(provider.name)) {
      issues.push(`canonical provider "${provider.name}" has no committed model-adaptive executor profile`);
    }
  }

  // (2b) the derived provider exports must agree with the canonical contract.
  for (const provider of store.providerCapabilities.providers || []) {
    const exportRecord = store.providerExports[provider.name];
    if (!exportRecord) {
      issues.push(`canonical provider "${provider.name}" has no derived export projection under providers/${provider.name}/export.json`);
      continue;
    }
    if (exportRecord.canonicalProvider !== provider.name) {
      issues.push(`derived export providers/${provider.name}/export.json declares canonicalProvider "${exportRecord.canonicalProvider}"`);
    }
    for (const legacyDirectory of provider.legacyExportDirectories || []) {
      const legacyPath = path.join(root, 'providers', legacyDirectory, 'export.json');
      if (!fs.existsSync(legacyPath)) {
        issues.push(`declared legacy export directory providers/${legacyDirectory}/ is missing for canonical provider "${provider.name}"`);
        continue;
      }
      const legacyExport = readJson(legacyPath);
      if (legacyExport.canonicalProvider !== provider.name) {
        issues.push(`derived export providers/${legacyDirectory}/export.json declares canonicalProvider "${legacyExport.canonicalProvider}" instead of "${provider.name}"`);
      }
    }
  }

  // (3) the S12 DoD invariant over the committed profiles.
  const byModel = new Map();
  const byBinding = new Map();
  for (const profile of store.profiles) {
    const modelKey = `${profile.provider_id}::${profile.model_id}`;
    const bindingKey = `${profile.executor_id}|${profile.provider_id}|${profile.model_id}`;
    if (!byModel.has(modelKey)) byModel.set(modelKey, []);
    byModel.get(modelKey).push(profile);
    if (!byBinding.has(bindingKey)) byBinding.set(bindingKey, []);
    byBinding.get(bindingKey).push(profile);
  }

  for (const [modelKey, group] of byModel.entries()) {
    for (const [left, right] of pairsOf(group)) {
      const comparison = compareProfileEquivalence({
        left,
        right,
        executionProfiles: store.executionProfiles
      });
      report.same_model_pairs.push({
        model_key: modelKey,
        left: `${left.profile_id}@${left.profile_version}`,
        right: `${right.profile_id}@${right.profile_version}`,
        equivalent: comparison.equivalent,
        authority_equivalent: comparison.authority_equivalent,
        completion_equivalent: comparison.completion_equivalent,
        findings: comparison.findings
      });
      if (!comparison.equivalent) {
        issues.push(
          `profiles of the same model "${modelKey}" (${left.profile_id}@${left.profile_version} / ${right.profile_id}@${right.profile_version}) are not equivalent: ${comparison.findings.join('; ')}`
        );
      }
    }
  }

  for (const [bindingKey, group] of byBinding.entries()) {
    for (const [left, right] of pairsOf(group)) {
      try {
        assertNoAuthorityWidening({ left, right, executionProfiles: store.executionProfiles });
      } catch (error) {
        issues.push(`profile switch on binding "${bindingKey}" widens authority: ${error.message}`);
      }
    }
  }

  // (4) the committed fixture: schema cases and runtime denial cases.
  const fixturePath = path.join(root, FIXTURE_PATH);
  if (!fs.existsSync(fixturePath)) {
    issues.push(`missing committed fixture: ${FIXTURE_PATH}`);
  } else {
    const fixture = readJson(fixturePath);
    let checked = 0;
    let unexpected = 0;
    for (const entry of fixture.cases || []) {
      checked += 1;
      const caseIssues = validateInstanceAgainstContract(entry.instance, MODEL_ADAPTIVE_PROFILE_CONTRACT, root);
      const failed = caseIssues.length > 0;
      if (failed !== !entry.valid) {
        unexpected += 1;
        issues.push(
          `fixture case ${entry.case_id}: expected ${entry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${caseIssues.join('; ') || '(no issues)'}`
        );
      }
    }
    report.fixture = { cases_checked: checked, unexpected_results: unexpected };

    let denialChecked = 0;
    let denialUnexpected = 0;
    const coveredCodes = new Set();
    for (const entry of fixture.denial_cases || []) {
      denialChecked += 1;
      const caseIssues = evaluateDenialCase({ entry, store, root });
      if (caseIssues.length > 0) {
        denialUnexpected += 1;
        issues.push(...caseIssues);
      }
      if (entry.expected_code) {
        coveredCodes.add(entry.expected_code);
      }
    }
    for (const code of EXECUTOR_PROFILE_DENIAL_CODES) {
      if (!coveredCodes.has(code)) {
        denialUnexpected += 1;
        issues.push(`the denial fixture does not cover the S12 denial path ${code}`);
      }
    }
    report.denial_cases = {
      cases_checked: denialChecked,
      unexpected_results: denialUnexpected,
      covered_codes: [...coveredCodes].sort()
    };
  }

  return { ok: issues.length === 0, issues, report };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const result = validateExecutorModelProfiles({ root });

  if (args.length > 0) {
    let records = 0;
    let invalid = 0;
    for (const arg of args) {
      const filePath = path.resolve(arg);
      let record;
      try {
        record = readJson(filePath);
      } catch (error) {
        invalid += 1;
        console.error(`${arg}: cannot read or parse (${error.message})`);
        continue;
      }
      records += 1;
      const issues = validateInstanceAgainstContract(record, MODEL_ADAPTIVE_PROFILE_CONTRACT, root);
      if (issues.length > 0) {
        invalid += 1;
        console.error(`${arg}: ${issues.join('; ')}`);
      }
    }
    console.log(`executor-model-profile records: ${records} checked, ${invalid} invalid`);
    process.exit(invalid === 0 ? 0 : 1);
  }

  const fixture = result.report.fixture ?? { cases_checked: 0, unexpected_results: 0 };
  const denials = result.report.denial_cases ?? { cases_checked: 0, unexpected_results: 0 };
  console.log(`executor-model-profile fixture: ${fixture.cases_checked} cases checked, ${fixture.unexpected_results} unexpected results`);
  console.log(`executor-model-profile denial cases: ${denials.cases_checked} checked, ${denials.unexpected_results} unexpected results`);
  console.log(`executor-model-profile store: ${result.report.profiles.length} profiles checked, ${result.issues.length} issues`);
  if (result.issues.length > 0) {
    for (const issue of result.issues) {
      console.error(issue);
    }
  }
  process.exit(result.ok ? 0 : 1);
}
