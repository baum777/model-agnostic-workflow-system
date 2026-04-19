#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNeutralCoreRegistry } from './build-neutral-core-registry.mjs';
import { buildProviderExports } from './build-provider-exports.mjs';
import { readJson, repoRoot } from './_shared.mjs';

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function loadEvalCatalog(root) {
  const catalogPath = path.join(root, 'evals', 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error('Missing eval catalog: evals/catalog.json');
  }
  const catalog = readJson(catalogPath);
  if (!Array.isArray(catalog.fixtures) || catalog.fixtures.length === 0) {
    throw new Error('Eval catalog must declare a non-empty fixtures array.');
  }
  return catalog;
}

function loadEvalFixture(root, fixtureRef) {
  if (typeof fixtureRef === 'object' && fixtureRef !== null) {
    return fixtureRef;
  }
  if (typeof fixtureRef !== 'string' || fixtureRef.trim() === '') {
    throw new Error('Eval catalog fixture entries must be strings or objects.');
  }

  const fixturePath = path.join(root, 'evals', fixtureRef);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Missing eval fixture: ${fixtureRef}`);
  }
  return readJson(fixturePath);
}

function loadEvalFixtures(root, catalog) {
  const refs = Array.isArray(catalog.fixtures) ? catalog.fixtures : [];
  return refs.map((fixtureRef) => loadEvalFixture(root, fixtureRef));
}

function loadProviderExports(root) {
  const exports = {};
  const providerExports = buildProviderExports(root, {});
  const providerCapabilitiesPath = [
    path.join(root, 'core', 'contracts', 'provider-capabilities.json'),
    path.join(root, 'contracts', 'provider-capabilities.json')
  ].find((candidate) => fs.existsSync(candidate));
  const providerCapabilities = providerCapabilitiesPath ? readJson(providerCapabilitiesPath) : { providers: [] };

  for (const { provider, export: exportJson } of providerExports) {
    exports[provider] = exportJson;
    const capability = (providerCapabilities.providers || []).find((entry) => entry.name === provider);
    for (const alias of capability?.aliases || []) {
      exports[alias] = exportJson;
    }
    for (const legacy of capability?.legacyExportDirectories || []) {
      exports[legacy] = exportJson;
    }
  }
  return exports;
}

function sameJson(left, right) {
  return JSON.stringify(left, null, 2) === JSON.stringify(right, null, 2);
}

const surfaceDecisionCategories = [
  'new skill',
  'new tool',
  'new MCP surface',
  'extend existing surface',
  'router/contracts/docs-only change',
  'no justified reusable surface'
];

const surfaceDecisionCaseTypes = new Set(['positive', 'negative', 'borderline']);
const surfaceDecisionPacketFields = [
  'decision',
  'confidence',
  'reasoning_basis',
  'tie_break_rule',
  'recommended_repo_action',
  'placement',
  'followup_required',
  'reject_reason'
];
const surfaceDecisionConfidenceValues = new Set(['high', 'medium', 'low']);
const surfaceDecisionReasoningBasisValues = new Set([
  'repeatable_workflow',
  'deterministic_tooling',
  'remote_protocol_boundary',
  'nearest_existing_coverage',
  'authority_or_metadata_only',
  'insufficient_evidence'
]);
const surfaceDecisionTieBreakValues = new Set([
  'none',
  'prefer_extension_over_creation',
  'prefer_metadata_or_authority_only',
  'fail_closed_on_missing_evidence'
]);
const surfaceDecisionRepoActionValues = new Set([
  'create_skill',
  'create_tool',
  'create_mcp_surface',
  'extend_existing_surface',
  'update_router_contracts_docs',
  'reject_new_surface'
]);
const surfaceDecisionPlacementValues = new Set([
  'canonical/shared-core',
  'repo-local-control-plane',
  'compatibility-only',
  'docs/router/contracts',
  'external MCP boundary',
  'none'
]);
const surfaceDecisionMapping = new Map([
  ['new skill', { action: 'create_skill', placement: 'canonical/shared-core' }],
  ['new tool', { action: 'create_tool', placement: 'canonical/shared-core' }],
  ['new MCP surface', { action: 'create_mcp_surface', placement: 'external MCP boundary' }],
  ['extend existing surface', { action: 'extend_existing_surface', placement: 'canonical/shared-core' }],
  ['router/contracts/docs-only change', { action: 'update_router_contracts_docs', placement: 'docs/router/contracts' }],
  ['no justified reusable surface', { action: 'reject_new_surface', placement: 'none' }]
]);

function loadSkillText(root, skillPath) {
  const absolutePath = path.join(root, skillPath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function parseSurfaceDecisionOutput(rawOutput) {
  if (typeof rawOutput === 'object' && rawOutput !== null && !Array.isArray(rawOutput)) {
    return rawOutput;
  }
  if (typeof rawOutput !== 'string') {
    return null;
  }

  const trimmed = rawOutput.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeSurfaceDecisionPacket(rawOutput) {
  const parsed = parseSurfaceDecisionOutput(rawOutput);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      passed: false,
      issues: ['Surface-decision output must be a JSON object or JSON string.']
    };
  }

  const keys = Object.keys(parsed);
  const issues = [];
  for (const key of surfaceDecisionPacketFields) {
    if (!(key in parsed)) {
      issues.push(`Surface-decision output is missing ${key}.`);
    }
  }
  for (const key of keys) {
    if (!surfaceDecisionPacketFields.includes(key)) {
      issues.push(`Surface-decision output has unsupported field ${key}.`);
    }
  }

  if (issues.length > 0) {
    return {
      passed: false,
      issues
    };
  }

  const canonical = {};
  for (const key of surfaceDecisionPacketFields) {
    canonical[key] = parsed[key];
  }

  return {
    passed: true,
    packet: canonical,
    issues: []
  };
}

function validateDecisionPacket(root, fixture, caseEntry, skillText) {
  const result = {
    passed: true,
    issues: []
  };

  for (const field of surfaceDecisionPacketFields) {
    if (!skillText.includes(field)) {
      result.passed = false;
      result.issues.push(`Builder skill does not declare decision packet field ${field}.`);
    }
  }
  if (!skillText.includes('## Decision Packet')) {
    result.passed = false;
    result.issues.push('Builder skill does not declare a Decision Packet section.');
  }
  for (const category of surfaceDecisionCategories) {
    if (!skillText.includes(category)) {
      result.passed = false;
      result.issues.push(`Builder skill does not declare category ${category}.`);
    }
  }
  for (const token of ['prefer_extension_over_creation', 'prefer_metadata_or_authority_only', 'fail_closed_on_missing_evidence']) {
    if (!skillText.includes(token)) {
      result.passed = false;
      result.issues.push(`Builder skill does not declare tie-break rule ${token}.`);
    }
  }

  const packet = caseEntry.expectedDecisionPacket;
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} is missing expectedDecisionPacket.`);
    return result;
  }

  const packetKeys = Object.keys(packet);
  for (const key of surfaceDecisionPacketFields) {
    if (!(key in packet)) {
      result.passed = false;
      result.issues.push(`Surface-decision case ${caseEntry.id} expectedDecisionPacket is missing ${key}.`);
    }
  }
  for (const key of packetKeys) {
    if (!surfaceDecisionPacketFields.includes(key)) {
      result.passed = false;
      result.issues.push(`Surface-decision case ${caseEntry.id} expectedDecisionPacket has unsupported field ${key}.`);
    }
  }

  if (packet.decision !== caseEntry.expectedDecision) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} decision ${packet.decision} does not match expectedDecision ${caseEntry.expectedDecision}.`);
  }
  if (!surfaceDecisionCategories.includes(packet.decision)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} uses unsupported decision ${packet.decision}.`);
  }
  if (!surfaceDecisionConfidenceValues.has(packet.confidence)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} has invalid confidence ${packet.confidence}.`);
  }
  if (!surfaceDecisionReasoningBasisValues.has(packet.reasoning_basis)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} has invalid reasoning_basis ${packet.reasoning_basis}.`);
  }
  if (!surfaceDecisionTieBreakValues.has(packet.tie_break_rule)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} has invalid tie_break_rule ${packet.tie_break_rule}.`);
  }
  if (!surfaceDecisionRepoActionValues.has(packet.recommended_repo_action)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} has invalid recommended_repo_action ${packet.recommended_repo_action}.`);
  }
  if (!surfaceDecisionPlacementValues.has(packet.placement)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} has invalid placement ${packet.placement}.`);
  }
  if (typeof packet.followup_required !== 'boolean') {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} followup_required must be boolean.`);
  }

  const expectedMapping = surfaceDecisionMapping.get(packet.decision);
  if (expectedMapping) {
    if (packet.recommended_repo_action !== expectedMapping.action) {
      result.passed = false;
      result.issues.push(`Surface-decision case ${caseEntry.id} recommended_repo_action ${packet.recommended_repo_action} does not match decision ${packet.decision}.`);
    }
    if (packet.placement !== expectedMapping.placement) {
      result.passed = false;
      result.issues.push(`Surface-decision case ${caseEntry.id} placement ${packet.placement} does not match decision ${packet.decision}.`);
    }
  }

  if (caseEntry.class === 'borderline' && packet.tie_break_rule === 'none') {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} must carry a tie-break rule for borderline classification.`);
  }
  if (packet.decision === 'no justified reusable surface') {
    if (typeof packet.reject_reason !== 'string' || packet.reject_reason.trim() === '') {
      result.passed = false;
      result.issues.push(`Surface-decision case ${caseEntry.id} must provide reject_reason for a rejected surface.`);
    }
    if (packet.followup_required !== false) {
      result.passed = false;
      result.issues.push(`Surface-decision case ${caseEntry.id} must set followup_required to false when rejecting a surface.`);
    }
  } else if (packet.reject_reason !== null) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} reject_reason must be null for non-reject decisions.`);
  }

  const observedSource = caseEntry.observedDecisionOutput ?? caseEntry.observedDecisionPacket;
  const normalizedObserved = normalizeSurfaceDecisionPacket(observedSource);
  if (!normalizedObserved.passed) {
    result.passed = false;
    result.issues.push(...normalizedObserved.issues.map((issue) => `Surface-decision case ${caseEntry.id} ${issue}`));
  } else if (!sameJson(normalizedObserved.packet, packet)) {
    result.passed = false;
    result.issues.push(`Surface-decision case ${caseEntry.id} normalized observed decision packet does not match expectedDecisionPacket.`);
  }

  return result;
}

function evaluateSurfaceDecision(root, fixture) {
  const result = {
    passed: true,
    issues: []
  };

  const targetName = fixture.target?.name;
  if (!targetName) {
    result.passed = false;
    result.issues.push('Fixture missing target.name.');
    return result;
  }

  const skillPath = path.join('.agents', 'skills', targetName, 'SKILL.md');
  const skillText = loadSkillText(root, skillPath);
  if (!skillText) {
    result.passed = false;
    result.issues.push(`Missing builder skill: ${skillPath}`);
    return result;
  }

  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  if (cases.length === 0) {
    result.passed = false;
    result.issues.push('Surface-decision fixture must contain cases.');
    return result;
  }

  const seenIds = new Set();
  const classCounts = { positive: 0, negative: 0, borderline: 0 };
  const categoryCounts = new Map();
  const minimumCases = fixture.expectations?.minimumCases || { positive: 2, negative: 2, borderline: 2 };

  for (const entry of cases) {
    if (!entry || typeof entry !== 'object') {
      result.passed = false;
      result.issues.push('Surface-decision cases must be objects.');
      continue;
    }

    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      result.passed = false;
      result.issues.push('Surface-decision case missing id.');
      continue;
    }
    if (seenIds.has(entry.id)) {
      result.passed = false;
      result.issues.push(`Duplicate surface-decision case id: ${entry.id}.`);
    }
    seenIds.add(entry.id);

    if (!surfaceDecisionCaseTypes.has(entry.class)) {
      result.passed = false;
      result.issues.push(`Surface-decision case ${entry.id} has invalid class ${entry.class}.`);
    } else {
      classCounts[entry.class] += 1;
    }

    if (typeof entry.request !== 'string' || entry.request.trim() === '') {
      result.passed = false;
      result.issues.push(`Surface-decision case ${entry.id} is missing request text.`);
    }
    if (typeof entry.expectedDecision !== 'string' || entry.expectedDecision.trim() === '') {
      result.passed = false;
      result.issues.push(`Surface-decision case ${entry.id} is missing expectedDecision.`);
    } else if (!surfaceDecisionCategories.includes(entry.expectedDecision)) {
      result.passed = false;
      result.issues.push(`Surface-decision case ${entry.id} uses unsupported expectedDecision ${entry.expectedDecision}.`);
    } else {
      categoryCounts.set(entry.expectedDecision, (categoryCounts.get(entry.expectedDecision) || 0) + 1);
    }

    const packetCheck = validateDecisionPacket(root, fixture, entry, skillText);
    result.passed = result.passed && packetCheck.passed;
    result.issues.push(...packetCheck.issues);
  }

  for (const [className, minimum] of Object.entries(minimumCases)) {
    if ((classCounts[className] || 0) < minimum) {
      result.passed = false;
      result.issues.push(`Surface-decision fixture needs at least ${minimum} ${className} cases.`);
    }
  }

  for (const category of surfaceDecisionCategories) {
    if ((categoryCounts.get(category) || 0) === 0) {
      result.passed = false;
      result.issues.push(`Surface-decision fixture does not cover category ${category}.`);
    }
  }

  return result;
}

function evaluateToolSelection(registry, fixture) {
  const result = {
    passed: true,
    issues: []
  };
  const targetName = fixture.target?.name;
  const skill = registry.skills.find((entry) => entry.name === targetName);
  if (!skill) {
    result.passed = false;
    result.issues.push(`Registry does not include skill ${targetName}.`);
    return result;
  }

  const requiredTools = Array.isArray(fixture.expectations.requiredTools) ? fixture.expectations.requiredTools : [];
  const optionalTools = Array.isArray(fixture.expectations.optionalTools) ? fixture.expectations.optionalTools : [];
  for (const requiredTool of requiredTools) {
    if (!Array.isArray(skill.requiredTools) || !skill.requiredTools.includes(requiredTool)) {
      result.passed = false;
      result.issues.push(`Skill ${targetName} does not declare required tool ${requiredTool}.`);
    }
  }
  for (const optionalTool of optionalTools) {
    if (!Array.isArray(skill.optionalTools) || !skill.optionalTools.includes(optionalTool)) {
      result.issues.push(`Skill ${targetName} does not declare optional tool ${optionalTool}.`);
    }
  }

  return result;
}

function evaluateFixture(root, registry, providerExports, fixture) {
  const result = {
    id: fixture.id,
    kind: fixture.kind,
    blocking: fixture.blocking !== false,
    passed: true,
    issues: []
  };

  const targetName = fixture.target?.name;
  if (!targetName) {
    result.passed = false;
    result.issues.push('Fixture missing target.name.');
    return result;
  }

  if (fixture.kind === 'routing') {
    for (const providerName of fixture.expectations.providers || []) {
      const providerExport = providerExports[providerName];
      if (!providerExport) {
        result.passed = false;
        result.issues.push(`Missing provider export for ${providerName}.`);
        continue;
      }
      const skill = providerExport.skills.find((entry) => entry.name === targetName);
      if (!skill) {
        result.passed = false;
        result.issues.push(`Provider ${providerName} does not export skill ${targetName}.`);
      }
    }
  } else if (fixture.kind === 'schema') {
    const registrySkill = registry.skills.find((entry) => entry.name === targetName);
    if (!registrySkill) {
      result.passed = false;
      result.issues.push(`Registry does not include skill ${targetName}.`);
    } else if (!Array.isArray(registrySkill.outputHeadings) || registrySkill.outputHeadings.length === 0) {
      result.passed = false;
      result.issues.push(`Skill ${targetName} does not declare output headings.`);
    } else if (fixture.expectations.outputHeadings && !sameJson(registrySkill.outputHeadings, fixture.expectations.outputHeadings)) {
      result.passed = false;
      result.issues.push(`Skill ${targetName} output headings do not match the fixture.`);
    }
  } else if (fixture.kind === 'tool-selection') {
    const check = evaluateToolSelection(registry, fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else if (fixture.kind === 'approval-boundary') {
    const tool = registry.tools.find((entry) => entry.tool_name === targetName || entry.name === targetName);
    if (!tool) {
      result.passed = false;
      result.issues.push(`Registry does not include tool ${targetName}.`);
    } else {
      if (fixture.expectations.approvalRequirement && tool.approvalRequirement !== fixture.expectations.approvalRequirement) {
        result.passed = false;
        result.issues.push(`Tool ${targetName} approval requirement is ${tool.approvalRequirement}, expected ${fixture.expectations.approvalRequirement}.`);
      }
      if (fixture.expectations.sideEffects && tool.sideEffects !== fixture.expectations.sideEffects) {
        result.passed = false;
        result.issues.push(`Tool ${targetName} sideEffects is ${tool.sideEffects}, expected ${fixture.expectations.sideEffects}.`);
      }
    }
  } else if (fixture.kind === 'provider-parity') {
    const baselineProvider = fixture.expectations.baselineProvider || 'openai-codex';
    const baseline = providerExports[baselineProvider]?.skills.find((entry) => entry.name === targetName);
    if (!baseline) {
      result.passed = false;
      result.issues.push(`Baseline provider ${baselineProvider} does not export skill ${targetName}.`);
    } else {
      for (const providerName of fixture.expectations.providers || []) {
        const providerSkill = providerExports[providerName]?.skills.find((entry) => entry.name === targetName);
        if (!providerSkill) {
          result.passed = false;
          result.issues.push(`Provider ${providerName} does not export skill ${targetName}.`);
          continue;
        }
        if (!sameJson(providerSkill.outputHeadings, baseline.outputHeadings)) {
          result.passed = false;
          result.issues.push(`Provider ${providerName} output headings diverge for ${targetName}.`);
        }
      }
    }
  } else if (fixture.kind === 'failure-mode') {
    const skill = registry.skills.find((entry) => entry.name === targetName);
    if (!skill) {
      result.passed = false;
      result.issues.push(`Registry does not include skill ${targetName}.`);
    } else {
      if (fixture.expectations.requiresRepoInputs !== undefined && skill.requiresRepoInputs !== fixture.expectations.requiresRepoInputs) {
        result.passed = false;
        result.issues.push(`Skill ${targetName} requiresRepoInputs mismatch.`);
      }
      if (fixture.expectations.subagentPolicy && skill.subagentPolicy !== fixture.expectations.subagentPolicy) {
        result.passed = false;
        result.issues.push(`Skill ${targetName} subagentPolicy is ${skill.subagentPolicy}, expected ${fixture.expectations.subagentPolicy}.`);
      }
    }
  } else if (fixture.kind === 'surface-decision') {
    const check = evaluateSurfaceDecision(root, fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else {
    result.passed = false;
    result.issues.push(`Unsupported eval kind: ${fixture.kind}`);
  }

  return result;
}

function runCertificationEvals(baseRoot = repoRoot()) {
  const root = baseRoot;
  const catalog = loadEvalCatalog(root);
  const registry = buildNeutralCoreRegistry(root);
  const providerExports = loadProviderExports(root);
  const fixtures = loadEvalFixtures(root, catalog);
  const results = fixtures.map((fixture) => evaluateFixture(root, registry, providerExports, fixture));
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const blockingFailures = results.filter((result) => !result.passed && result.blocking).length;

  return {
    ok: failed === 0,
    root: normalize(root),
    suite: catalog.suite || 'provider-neutral-certification',
    total: results.length,
    passed,
    failed,
    blockingFailures,
    results
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = runCertificationEvals();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { runCertificationEvals };
