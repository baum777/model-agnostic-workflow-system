// MAWS vNext — DSI skill registry loader.
//
// Resolves a skill by identity against the skill registry snapshot, verifies
// its content digest and fails closed with typed, machine-readable denial
// codes. The loader never selects anything: it answers exactly one question
// ("may this skill be used, and which bytes are they?") and answers it with a
// denial code when the answer is no.
//
// The snapshot is built from canonical repository inputs only:
//   - core/contracts/core-registry.json          (validator-backed neutral registry snapshot)
//   - core/contracts/portable-skill-manifest.json (registration state)
//   - core/contracts/workflow-routing-map.json    (closed scope vocabulary + skill/scope assignment)
//   - the S2 instruction inventory                 (content digest of every skill instruction file)
//
// DSI capability derivation (slice-local, owner-decidable, documented in the
// run record): a skill PROVIDES its own domain capability `cap_<skill_name>`
// plus one `cap_<workflow_class>` for every scope it is ACTIVE in, and it
// REQUIRES one `cap_<tool_name>` for every tool the neutral registry snapshot
// declares as required for it. The capability ids use the canonical
// `cap_[a-z0-9_]+` shape of maws-vnext-common.schema.json.
//
// Posture: the loader grants no permission, promotes no skill, changes no
// qualification state and activates no runtime path. A denial is data, not an
// exception: the caller can record it and keep going.
import fs from 'node:fs';
import path from 'node:path';

import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { buildInstructionInventory } from '../instructions/instruction-inventory.mjs';

export const SKILL_REGISTRY_SNAPSHOT_VERSION = '1.0.0';
export const SKILL_SELECTION_CONTRACT = 'core/contracts/skill-selection.schema.json';
export const NEUTRAL_REGISTRY_PATH = 'core/contracts/core-registry.json';
export const PORTABLE_SKILL_MANIFEST_PATH = 'core/contracts/portable-skill-manifest.json';
export const WORKFLOW_ROUTING_MAP_PATH = 'core/contracts/workflow-routing-map.json';

export const SKILL_REGISTRATION_STATES = ['REGISTERED', 'UNREGISTERED'];
export const SKILL_SCOPE_STATES = ['ACTIVE', 'SUSPENDED'];

// Closed denial vocabulary of the loader. Every refusal to hand a skill to a
// caller is one of these four codes; there is no silent path.
export const SKILL_DENIAL_CODES = [
  'SKILL_NOT_FOUND',
  'SKILL_DIGEST_MISMATCH',
  'SKILL_STATE_NOT_ALLOWED',
  'SKILL_CAPABILITY_MISSING'
];

// Why a state denial happened. It is a detail of SKILL_STATE_NOT_ALLOWED, not
// a second denial code: the scope is either not declared for the skill, or
// declared with a state that does not allow use.
export const SKILL_STATE_DENIAL_REASONS = ['SCOPE_NOT_DECLARED', 'STATE_NOT_ACTIVE'];

const CAPABILITY_ID_PATTERN = /^cap_[a-z0-9_]+$/;
const SKILL_ID_PATTERN = /^[a-z]+\.[a-z0-9][a-z0-9-]*$/;

function fail(code, message, details = {}) {
  throw new FailClosedError(code, message, details);
}

function readJsonFile(root, relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    fail('SKILL_REGISTRY_SOURCE_UNREADABLE', `${relativePath} is not readable: ${error.message}`);
  }
}

// capabilityIdFor('repo-audit') -> 'cap_repo_audit'
//
// The capability id shape is the canonical one of
// maws-vnext-common.schema.json#/$defs/capabilityId, so a skill capability
// and an executor capability live in the same vocabulary.
export function capabilityIdFor(name) {
  if (typeof name !== 'string' || name.length === 0) {
    fail('SKILL_CAPABILITY_NAME_INVALID', `capability name must be a non-empty string: ${String(name)}`);
  }
  const capabilityId = `cap_${name.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}`;
  if (!CAPABILITY_ID_PATTERN.test(capabilityId)) {
    fail('SKILL_CAPABILITY_NAME_INVALID', `capability name does not map onto a canonical capability id: ${name}`);
  }
  return capabilityId;
}

// The closed scope vocabulary of the contract, read from the contract itself,
// so the contract is the single place the vocabulary is declared.
export function readContractScopes(root) {
  const contract = readJsonFile(root, SKILL_SELECTION_CONTRACT);
  const scopes = contract?.properties?.request?.properties?.scope?.enum;
  if (!Array.isArray(scopes) || scopes.length === 0) {
    fail('SKILL_SCOPE_VOCABULARY_MISSING', 'the selection contract declares no closed scope vocabulary');
  }
  return [...scopes];
}

// The canonical scope vocabulary of the routing map. The two vocabularies
// must be identical; a workflow class that exists in one and not the other is
// a drift that would silently widen or narrow what is selectable.
export function readRoutingMapScopes(root) {
  const routingMap = readJsonFile(root, WORKFLOW_ROUTING_MAP_PATH);
  const classes = Array.isArray(routingMap?.workflowClasses) ? routingMap.workflowClasses : [];
  return classes.map((entry) => entry?.workflowClass).filter((value) => typeof value === 'string');
}

// compareScopeVocabularies(contractScopes, routingScopes) -> contractScopes
//
// The two vocabularies must be identical. A workflow class that exists in one
// and not the other is a drift that would silently widen or narrow what is
// selectable, so it fails closed instead.
export function compareScopeVocabularies(contractScopes, routingScopes) {
  const contractSet = new Set(contractScopes);
  const routingSet = new Set(routingScopes);
  const missingInContract = routingScopes.filter((scope) => !contractSet.has(scope));
  const missingInRoutingMap = contractScopes.filter((scope) => !routingSet.has(scope));
  if (missingInContract.length > 0 || missingInRoutingMap.length > 0) {
    fail(
      'SKILL_SCOPE_VOCABULARY_DRIFT',
      'the selection contract and the workflow routing map disagree about the scope vocabulary',
      { missing_in_contract: missingInContract, missing_in_routing_map: missingInRoutingMap }
    );
  }
  return [...contractScopes];
}

export function assertScopeVocabularyAligned(root) {
  return compareScopeVocabularies(readContractScopes(root), readRoutingMapScopes(root));
}

// buildSkillRegistrySnapshot({ root, revision }) ->
//   { schema_version, revision, snapshot_digest, skills: [...] }
//
// Deterministic: the same repository state and the same revision always
// produce the same snapshot and the same digest. Nothing in the construction
// depends on wall-clock time, on randomness or on filesystem order — every
// list is sorted by a stable key before it is hashed.
export function buildSkillRegistrySnapshot({ root, revision }) {
  if (!root) {
    fail('SKILL_REGISTRY_ROOT_REQUIRED', 'repository root is required to build the skill registry snapshot');
  }
  if (typeof revision !== 'string' || revision.length === 0) {
    fail('SKILL_REGISTRY_REVISION_REQUIRED', 'revision is required: a registry snapshot without a revision binding cannot be reconstructed later');
  }

  const scopes = assertScopeVocabularyAligned(root);
  const registry = readJsonFile(root, NEUTRAL_REGISTRY_PATH);
  const manifest = readJsonFile(root, PORTABLE_SKILL_MANIFEST_PATH);
  const routingMap = readJsonFile(root, WORKFLOW_ROUTING_MAP_PATH);

  const registeredNames = new Set(
    (Array.isArray(manifest?.skills) ? manifest.skills : [])
      .map((entry) => entry && entry.name)
      .filter((name) => typeof name === 'string')
  );

  // The scope assignment of a skill is the canonical routing-map projection:
  // a skill supports a work class when the routing map lists it as a
  // supporting skill of that class.
  const supportingSkillsByScope = new Map();
  for (const classEntry of Array.isArray(routingMap?.workflowClasses) ? routingMap.workflowClasses : []) {
    const scope = classEntry?.workflowClass;
    if (typeof scope !== 'string') continue;
    const list = Array.isArray(classEntry.supportingSkills) ? classEntry.supportingSkills : [];
    supportingSkillsByScope.set(scope, new Set(list.filter((name) => typeof name === 'string')));
  }

  // The content digest of every skill instruction file comes from the
  // canonical S2 instruction inventory, so the digest of a skill is the same
  // digest the instruction audit and the inventory use.
  const inventory = buildInstructionInventory({ root, revision });
  const digestByPath = new Map(inventory.sources.map((source) => [source.path, source.sha256]));

  const registrySkills = Array.isArray(registry?.skills) ? registry.skills : [];
  const skills = [];

  for (const entry of registrySkills) {
    const skillId = entry?.skillId;
    const skillName = entry?.name;
    const skillPath = entry?.skillPath;
    if (typeof skillId !== 'string' || !SKILL_ID_PATTERN.test(skillId)) {
      fail('SKILL_REGISTRY_ENTRY_INVALID', `registry skill id is not a canonical identity: ${String(skillId)}`);
    }
    if (typeof skillName !== 'string' || skillName.length === 0) {
      fail('SKILL_REGISTRY_ENTRY_INVALID', `registry skill ${skillId} carries no name`);
    }
    if (typeof skillPath !== 'string' || skillPath.length === 0) {
      fail('SKILL_REGISTRY_ENTRY_INVALID', `registry skill ${skillId} carries no instruction path`);
    }
    const digest = digestByPath.get(skillPath);
    if (typeof digest !== 'string') {
      fail(
        'SKILL_INSTRUCTION_NOT_IN_INVENTORY',
        `the skill instruction file of ${skillId} is not part of the canonical instruction inventory: ${skillPath}`
      );
    }

    const registration = registeredNames.has(skillName) ? 'REGISTERED' : 'UNREGISTERED';
    const scopeStates = {};
    for (const scope of scopes) {
      const supporting = supportingSkillsByScope.get(scope);
      if (!supporting || !supporting.has(skillName)) continue;
      // A skill that is known as an instruction file but is not registered in
      // the portable skill manifest is SUSPENDED in every scope it supports:
      // it stays visible, it can never be selected, and the manifest gap is
      // never hidden (the S4 manifest-gap precedent).
      scopeStates[scope] = registration === 'REGISTERED' ? 'ACTIVE' : 'SUSPENDED';
    }

    const providesCapabilities = [capabilityIdFor(skillName)];
    for (const scope of scopes) {
      if (scopeStates[scope] === 'ACTIVE') providesCapabilities.push(capabilityIdFor(scope));
    }
    providesCapabilities.sort();

    const requiresCapabilities = (Array.isArray(entry.requiredTools) ? entry.requiredTools : [])
      .filter((tool) => typeof tool === 'string' && tool.length > 0)
      .map((tool) => capabilityIdFor(tool));
    requiresCapabilities.sort();

    skills.push({
      skill_id: skillId,
      skill_name: skillName,
      skill_path: skillPath,
      digest,
      registration,
      scope_states: scopeStates,
      provides_capabilities: providesCapabilities,
      requires_capabilities: requiresCapabilities
    });
  }

  skills.sort((left, right) => (left.skill_id < right.skill_id ? -1 : left.skill_id > right.skill_id ? 1 : 0));

  const snapshotDigest = sha256Hex(canonicalJson({
    revision,
    schema_version: SKILL_REGISTRY_SNAPSHOT_VERSION,
    skills: skills.map((skill) => ({
      skill_id: skill.skill_id,
      skill_path: skill.skill_path,
      digest: skill.digest,
      registration: skill.registration,
      scope_states: skill.scope_states,
      provides_capabilities: skill.provides_capabilities,
      requires_capabilities: skill.requires_capabilities
    }))
  }));

  return {
    schema_version: SKILL_REGISTRY_SNAPSHOT_VERSION,
    revision,
    snapshot_digest: snapshotDigest,
    skills
  };
}

export function findSkillInSnapshot(snapshot, skillId) {
  if (!snapshot || !Array.isArray(snapshot.skills)) {
    fail('SKILL_REGISTRY_SNAPSHOT_INVALID', 'the skill registry snapshot is missing or malformed');
  }
  return snapshot.skills.find((skill) => skill.skill_id === skillId) || null;
}

function denial(code, reason, skillId, extra = {}) {
  return {
    outcome: 'DENIED',
    denial: { code, reason, skill_id: skillId, ...extra }
  };
}

// loadSkill({ snapshot, skill_id, expected_digest, scope, context })
//   -> { outcome: 'LOADED', skill }
//   -> { outcome: 'DENIED', denial: { code, reason, skill_id } }
//
// The four denial codes are the complete set of ways a skill can be refused:
// it is absent, its digest does not match, it is not in an allowed state for
// the caller's scope, or one of its own required capabilities is missing from
// the current context.
export function loadSkill({ snapshot, skill_id, expected_digest = null, scope = null, context = {} }) {
  if (typeof skill_id !== 'string' || skill_id.length === 0) {
    fail('SKILL_ID_REQUIRED', 'a skill id is required to resolve a skill');
  }
  const skill = findSkillInSnapshot(snapshot, skill_id);
  if (!skill) {
    return denial('SKILL_NOT_FOUND', 'the skill is not part of the registry snapshot', skill_id);
  }

  if (expected_digest !== null && expected_digest !== undefined) {
    if (typeof expected_digest !== 'string' || expected_digest !== skill.digest) {
      return denial(
        'SKILL_DIGEST_MISMATCH',
        'the expected digest does not match the digest recorded in the registry snapshot',
        skill_id,
        { expected_digest: String(expected_digest), snapshot_digest: skill.digest }
      );
    }
  }

  if (typeof scope === 'string' && scope.length > 0) {
    const state = skill.scope_states ? skill.scope_states[scope] : undefined;
    if (state === undefined) {
      return denial(
        'SKILL_STATE_NOT_ALLOWED',
        'the skill is not registered for the requested scope',
        skill_id,
        { scope, state_reason: 'SCOPE_NOT_DECLARED' }
      );
    }
    if (state !== 'ACTIVE') {
      return denial(
        'SKILL_STATE_NOT_ALLOWED',
        'the skill is not in an allowed state for the requested scope',
        skill_id,
        { scope, state, state_reason: 'STATE_NOT_ACTIVE' }
      );
    }
  }

  const available = Array.isArray(context?.available_capabilities) ? context.available_capabilities : [];
  const missing = (skill.requires_capabilities || []).filter((capabilityId) => !available.includes(capabilityId));
  if (missing.length > 0) {
    return denial(
      'SKILL_CAPABILITY_MISSING',
      'a capability the skill itself requires is not present in the current context',
      skill_id,
      { missing_capabilities: [...missing].sort() }
    );
  }

  return { outcome: 'LOADED', skill };
}

// requireSkill(args) -> the loaded skill, or a FailClosedError carrying the
// same typed denial code. For call sites that want an exception instead of a
// denial record; the denial vocabulary is identical.
export function requireSkill(args) {
  const result = loadSkill(args);
  if (result.outcome === 'DENIED') {
    fail(result.denial.code, result.denial.reason, { ...result.denial });
  }
  return result.skill;
}
