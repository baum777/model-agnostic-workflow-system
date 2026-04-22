#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNeutralCoreRegistry } from './build-neutral-core-registry.mjs';
import { buildProviderExports } from './build-provider-exports.mjs';
import { readJson, repoRoot } from './_shared.mjs';
import { evaluateSemanticLayoutDecisionsFixture } from './eval-semantic-layout-decisions.mjs';
import { evaluateStaticVsDynamicRenderingAdvisorFixture } from './eval-static-vs-dynamic-rendering-advisor.mjs';
import { evaluateRenderLayoutFixture } from './eval-render-layout-cases.mjs';
import { evaluateWcagA11yFixture } from './eval-wcag-a11y-cases.mjs';

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function parseRunnerArgs(argv) {
  const args = {
    kinds: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--kind' && argv[index + 1]) {
      const rawKinds = argv[index + 1];
      args.kinds = rawKinds
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      index += 1;
    }
  }

  return args;
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

const skillRoutingClasses = new Set(['single-skill', 'multi-step', 'false-positive']);
const routePacketFields = [
  'route_type',
  'primary_skill',
  'skill_chain',
  'new_skill_creation_allowed',
  'overlap_guard',
  'confidence',
  'notes'
];
const routeTypeValues = new Set(['single-skill', 'multi-step']);
const routeConfidenceValues = new Set(['high', 'medium', 'low']);
const allowedSecretClasses = new Set(['A', 'B', 'C', 'P']);

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

function parseGenericJsonPayload(rawOutput) {
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

function normalizeRoutePacket(rawOutput) {
  const parsed = parseGenericJsonPayload(rawOutput);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      passed: false,
      issues: ['Route output must be a JSON object or JSON string.']
    };
  }

  const issues = [];
  for (const field of routePacketFields) {
    if (!(field in parsed)) {
      issues.push(`Route packet is missing ${field}.`);
    }
  }
  for (const key of Object.keys(parsed)) {
    if (!routePacketFields.includes(key)) {
      issues.push(`Route packet has unsupported field ${key}.`);
    }
  }

  if (issues.length > 0) {
    return { passed: false, issues };
  }

  const packet = {
    route_type: parsed.route_type,
    primary_skill: parsed.primary_skill,
    skill_chain: Array.isArray(parsed.skill_chain) ? parsed.skill_chain : null,
    new_skill_creation_allowed: parsed.new_skill_creation_allowed,
    overlap_guard: parsed.overlap_guard,
    confidence: parsed.confidence,
    notes: parsed.notes
  };

  if (!routeTypeValues.has(packet.route_type)) {
    issues.push(`Invalid route_type ${packet.route_type}.`);
  }
  if (typeof packet.primary_skill !== 'string' || packet.primary_skill.trim() === '') {
    issues.push('primary_skill must be a non-empty string.');
  }
  if (!Array.isArray(packet.skill_chain) || packet.skill_chain.length === 0 || packet.skill_chain.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    issues.push('skill_chain must be a non-empty array of skill names.');
  }
  if (typeof packet.new_skill_creation_allowed !== 'boolean') {
    issues.push('new_skill_creation_allowed must be a boolean.');
  }
  if (typeof packet.overlap_guard !== 'string' || packet.overlap_guard.trim() === '') {
    issues.push('overlap_guard must be a non-empty string.');
  }
  if (!routeConfidenceValues.has(packet.confidence)) {
    issues.push(`Invalid confidence ${packet.confidence}.`);
  }
  if (typeof packet.notes !== 'string') {
    issues.push('notes must be a string.');
  }

  if (packet.route_type === 'single-skill' && packet.skill_chain.length !== 1) {
    issues.push('single-skill route_type must use exactly one entry in skill_chain.');
  }
  if (packet.route_type === 'multi-step' && packet.skill_chain.length < 2) {
    issues.push('multi-step route_type must use at least two entries in skill_chain.');
  }
  if (packet.skill_chain[0] !== packet.primary_skill) {
    issues.push('primary_skill must match the first skill_chain entry.');
  }

  if (issues.length > 0) {
    return { passed: false, issues };
  }
  return {
    passed: true,
    packet,
    issues: []
  };
}

function evaluateSkillRouting(_root, fixture) {
  const result = {
    passed: true,
    issues: []
  };

  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  if (cases.length === 0) {
    result.passed = false;
    result.issues.push('skill-routing fixture must contain cases.');
    return result;
  }

  const classCounts = {
    'single-skill': 0,
    'multi-step': 0,
    'false-positive': 0
  };
  const minimumCases = fixture.expectations?.minimumCases || classCounts;
  const seenIds = new Set();

  for (const caseEntry of cases) {
    if (!caseEntry || typeof caseEntry !== 'object') {
      result.passed = false;
      result.issues.push('skill-routing cases must be objects.');
      continue;
    }
    if (typeof caseEntry.id !== 'string' || caseEntry.id.trim() === '') {
      result.passed = false;
      result.issues.push('skill-routing case missing id.');
      continue;
    }
    if (seenIds.has(caseEntry.id)) {
      result.passed = false;
      result.issues.push(`Duplicate skill-routing case id: ${caseEntry.id}.`);
    }
    seenIds.add(caseEntry.id);

    if (!skillRoutingClasses.has(caseEntry.class)) {
      result.passed = false;
      result.issues.push(`skill-routing case ${caseEntry.id} has invalid class ${caseEntry.class}.`);
    } else {
      classCounts[caseEntry.class] += 1;
    }

    if (typeof caseEntry.request !== 'string' || caseEntry.request.trim() === '') {
      result.passed = false;
      result.issues.push(`skill-routing case ${caseEntry.id} is missing request text.`);
    }

    const expectedRoute = normalizeRoutePacket(caseEntry.expectedRoute);
    if (!expectedRoute.passed) {
      result.passed = false;
      result.issues.push(...expectedRoute.issues.map((issue) => `skill-routing case ${caseEntry.id} expectedRoute ${issue}`));
      continue;
    }

    const observedRoute = normalizeRoutePacket(caseEntry.observedRouteOutput);
    if (!observedRoute.passed) {
      result.passed = false;
      result.issues.push(...observedRoute.issues.map((issue) => `skill-routing case ${caseEntry.id} observedRouteOutput ${issue}`));
      continue;
    }

    if (!sameJson(expectedRoute.packet, observedRoute.packet)) {
      result.passed = false;
      result.issues.push(`skill-routing case ${caseEntry.id} normalized observed route does not match expectedRoute.`);
    }

    if (caseEntry.class === 'false-positive' && expectedRoute.packet.new_skill_creation_allowed !== false) {
      result.passed = false;
      result.issues.push(`skill-routing case ${caseEntry.id} must set new_skill_creation_allowed to false.`);
    }
  }

  for (const [className, minimum] of Object.entries(minimumCases)) {
    if ((classCounts[className] || 0) < minimum) {
      result.passed = false;
      result.issues.push(`skill-routing fixture needs at least ${minimum} ${className} case(s).`);
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

function evaluateWorkflowRoutingMap(registry, fixture) {
  const result = {
    passed: true,
    issues: []
  };

  if (!Array.isArray(registry.workflows) || registry.workflows.length === 0) {
    result.passed = false;
    result.issues.push('Registry workflows are missing.');
    return result;
  }

  const expectedClasses = Array.isArray(fixture.expectations?.workflowClasses)
    ? fixture.expectations.workflowClasses
    : [];
  const workflowClassSet = new Set(registry.workflows.map((entry) => entry.workflowClass));
  for (const workflowClass of expectedClasses) {
    if (!workflowClassSet.has(workflowClass)) {
      result.passed = false;
      result.issues.push(`Workflow class ${workflowClass} is missing from registry workflows.`);
    }
  }

  const expectedControlPlaneSkills = Array.isArray(fixture.expectations?.controlPlaneSkills)
    ? fixture.expectations.controlPlaneSkills
    : [];
  const controlPlaneSkills = new Set(
    registry.workflows.flatMap((entry) => Array.isArray(entry.controlPlaneSkills) ? entry.controlPlaneSkills : [])
  );
  for (const skillName of expectedControlPlaneSkills) {
    if (!controlPlaneSkills.has(skillName)) {
      result.passed = false;
      result.issues.push(`Control-plane skill ${skillName} is missing from workflow mappings.`);
    }
  }

  const expectedMcpPostures = Array.isArray(fixture.expectations?.mcpPostures)
    ? fixture.expectations.mcpPostures
    : [];
  const mcpPostures = new Set(registry.workflows.map((entry) => entry.mcpPosture));
  for (const posture of expectedMcpPostures) {
    if (!mcpPostures.has(posture)) {
      result.passed = false;
      result.issues.push(`MCP posture ${posture} is missing from workflow mappings.`);
    }
  }

  const expectedWorkflowFields = Array.isArray(fixture.expectations?.requiredWorkflowFields)
    ? fixture.expectations.requiredWorkflowFields
    : [];
  for (const workflow of registry.workflows) {
    for (const field of expectedWorkflowFields) {
      if (workflow[field] == null) {
        result.passed = false;
        result.issues.push(`Workflow ${workflow.workflowClass || '<unnamed>'} is missing required field ${field}.`);
      }
    }
  }

  return result;
}

function evaluateWorkflowExecutionEvidence(registry, fixture) {
  const result = {
    passed: true,
    issues: []
  };

  if (!Array.isArray(registry.workflows) || registry.workflows.length === 0) {
    result.passed = false;
    result.issues.push('Registry workflows are missing.');
    return result;
  }

  const requiredContracts = new Set(Array.isArray(fixture.expectations?.requiredContracts) ? fixture.expectations.requiredContracts : []);
  const expectedPolicy = fixture.expectations?.completionPolicy || {};
  const workflowByClass = new Map(registry.workflows.map((entry) => [entry.workflowClass, entry]));

  for (const workflow of registry.workflows) {
    if (!Array.isArray(workflow.requiredEvidenceArtifacts) || workflow.requiredEvidenceArtifacts.length === 0) {
      result.passed = false;
      result.issues.push(`Workflow ${workflow.workflowClass} must declare requiredEvidenceArtifacts.`);
    }
    for (const contractId of workflow.requiredEvidenceArtifacts || []) {
      if (!Array.isArray(workflow.expectedOutputContracts) || !workflow.expectedOutputContracts.includes(contractId)) {
        result.passed = false;
        result.issues.push(`Workflow ${workflow.workflowClass} must include required evidence contract ${contractId} in expectedOutputContracts.`);
      }
    }
    if (!workflow.completionPosture || typeof workflow.completionPosture !== 'object') {
      result.passed = false;
      result.issues.push(`Workflow ${workflow.workflowClass} must declare completionPosture.`);
      continue;
    }
    for (const [field, expectedValue] of Object.entries(expectedPolicy)) {
      if (workflow.completionPosture[field] !== expectedValue) {
        result.passed = false;
        result.issues.push(`Workflow ${workflow.workflowClass} completionPosture.${field} is ${workflow.completionPosture[field]}, expected ${expectedValue}.`);
      }
    }
  }

  for (const workflowClass of fixture.expectations?.workflowsRequiringCertification || []) {
    const workflow = workflowByClass.get(workflowClass);
    if (!workflow) {
      result.passed = false;
      result.issues.push(`Expected workflow class ${workflowClass} is missing.`);
      continue;
    }
    for (const contractId of requiredContracts) {
      if (!Array.isArray(workflow.requiredEvidenceArtifacts) || !workflow.requiredEvidenceArtifacts.includes(contractId)) {
        result.passed = false;
        result.issues.push(`Workflow ${workflowClass} must require evidence contract ${contractId}.`);
      }
    }
  }

  return result;
}

function evaluateExecutionClaimPolicy(outputContractCatalog, fixture) {
  const result = {
    passed: true,
    issues: []
  };
  const policy = fixture.expectations?.executionClaimPolicy;
  if (!policy) {
    return result;
  }

  const contracts = Array.isArray(outputContractCatalog?.contracts) ? outputContractCatalog.contracts : [];
  const workflowRunSummary = contracts.find((entry) => entry.contract_id === 'workflow-run-summary-v1');
  if (!workflowRunSummary) {
    result.passed = false;
    result.issues.push('workflow-run-summary-v1 is missing from output contract catalog.');
    return result;
  }

  const requiredSections = new Set(Array.isArray(workflowRunSummary.required_sections) ? workflowRunSummary.required_sections : []);
  for (const section of policy.requiredWorkflowRunSummarySections || []) {
    if (!requiredSections.has(section)) {
      result.passed = false;
      result.issues.push(`workflow-run-summary-v1 is missing required section ${section}.`);
    }
  }

  const validationNotesText = Array.isArray(workflowRunSummary.validation_notes)
    ? workflowRunSummary.validation_notes.join('\n')
    : '';
  for (const snippet of policy.requiredValidationNotesSubstrings || []) {
    if (!validationNotesText.includes(snippet)) {
      result.passed = false;
      result.issues.push(`workflow-run-summary-v1 validation notes are missing substring: ${snippet}.`);
    }
  }

  for (const status of policy.requiredExecutionStatuses || []) {
    if (!validationNotesText.includes(status)) {
      result.passed = false;
      result.issues.push(`workflow-run-summary-v1 validation notes are missing execution status ${status}.`);
    }
  }

  const failureBehavior = String(workflowRunSummary.failure_or_partial_completion_behavior || '');
  for (const snippet of policy.requiredFailureBehaviorSubstrings || []) {
    if (!failureBehavior.includes(snippet)) {
      result.passed = false;
      result.issues.push(`workflow-run-summary-v1 failure behavior is missing substring: ${snippet}.`);
    }
  }

  const requiredOutcomes = policy.requiredValidationOutcomes || [];
  for (const outcome of requiredOutcomes) {
    if (!validationNotesText.includes(outcome) && !failureBehavior.includes(outcome)) {
      result.passed = false;
      result.issues.push(`workflow-run-summary-v1 must reference validation outcome ${outcome}.`);
    }
  }

  return result;
}

function evaluateProviderExportAlignment(providerExports, fixture) {
  const result = {
    passed: true,
    issues: []
  };

  const providers = Array.isArray(fixture.expectations?.providers) ? fixture.expectations.providers : [];
  const requiredSourceContracts = fixture.expectations?.requiredSourceContracts || {};
  const requiredCapabilityOwnership = fixture.expectations?.requiredCapabilityOwnership || {};
  const requiredCapabilityStates = Array.isArray(fixture.expectations?.requiredCapabilityStates) ? new Set(fixture.expectations.requiredCapabilityStates) : null;
  const requiredSkillFields = Array.isArray(fixture.expectations?.requiredSkillFields) ? fixture.expectations.requiredSkillFields : [];
  const requiredWorkflowFields = Array.isArray(fixture.expectations?.requiredWorkflowFields) ? fixture.expectations.requiredWorkflowFields : [];

  for (const providerName of providers) {
    const exportJson = providerExports[providerName];
    if (!exportJson) {
      result.passed = false;
      result.issues.push(`Missing provider export for ${providerName}.`);
      continue;
    }

    for (const [field, expectedPath] of Object.entries(requiredSourceContracts)) {
      if (exportJson.sourceContracts?.[field] !== expectedPath) {
        result.passed = false;
        result.issues.push(`Provider ${providerName} sourceContracts.${field} is ${exportJson.sourceContracts?.[field]}, expected ${expectedPath}.`);
      }
    }
    for (const [field, expectedValue] of Object.entries(requiredCapabilityOwnership)) {
      if (exportJson.capabilityOwnership?.[field] !== expectedValue) {
        result.passed = false;
        result.issues.push(`Provider ${providerName} capabilityOwnership.${field} is ${exportJson.capabilityOwnership?.[field]}, expected ${expectedValue}.`);
      }
    }
    if (requiredCapabilityStates) {
      for (const field of ['toolUse', 'structuredOutputs', 'mcp', 'subagents']) {
        if (!requiredCapabilityStates.has(exportJson.capabilityProfile?.[field])) {
          result.passed = false;
          result.issues.push(`Provider ${providerName} capabilityProfile.${field} has invalid value ${exportJson.capabilityProfile?.[field]}.`);
        }
      }
    }

    if (!Array.isArray(exportJson.skills) || exportJson.skills.length === 0) {
      result.passed = false;
      result.issues.push(`Provider ${providerName} must include non-empty skills.`);
    } else {
      for (const skill of exportJson.skills) {
        for (const field of requiredSkillFields) {
          if (skill[field] == null) {
            result.passed = false;
            result.issues.push(`Provider ${providerName} skill ${skill.name || '<unnamed>'} is missing ${field}.`);
          }
        }
        if (skill.workflowSupport != null) {
          if (typeof skill.workflowSupport !== 'object' || Array.isArray(skill.workflowSupport)) {
            result.passed = false;
            result.issues.push(`Provider ${providerName} skill ${skill.name || '<unnamed>'} workflowSupport must be an object.`);
          } else {
            for (const field of ['status', 'workflowClasses', 'requiredValidationGates', 'expectedOutputContracts', 'requiredEvidenceArtifacts', 'recommendedTemplates', 'exampleArtifacts']) {
              if (skill.workflowSupport[field] == null) {
                result.passed = false;
                result.issues.push(`Provider ${providerName} skill ${skill.name || '<unnamed>'} workflowSupport is missing ${field}.`);
              }
            }
          }
        }
        if (skill.outputContractId && skill.outputContractPath == null) {
          result.passed = false;
          result.issues.push(`Provider ${providerName} skill ${skill.name || '<unnamed>'} must declare outputContractPath when outputContractId is set.`);
        }
        if (skill.outputContractId && skill.toolContractCatalogPath == null) {
          result.passed = false;
          result.issues.push(`Provider ${providerName} skill ${skill.name || '<unnamed>'} must declare toolContractCatalogPath when outputContractId is set.`);
        }
      }
    }

    if (!Array.isArray(exportJson.workflows) || exportJson.workflows.length === 0) {
      result.passed = false;
      result.issues.push(`Provider ${providerName} must include non-empty workflows.`);
    } else {
      for (const workflow of exportJson.workflows) {
        for (const field of requiredWorkflowFields) {
          if (workflow[field] == null) {
            result.passed = false;
            result.issues.push(`Provider ${providerName} workflow ${workflow.workflowClass || '<unnamed>'} is missing ${field}.`);
          }
        }
      }
    }
  }

  return result;
}

function evaluateSecretBoundaryCase(caseEntry) {
  const issues = [];
  const type = caseEntry.caseType;
  const sample = caseEntry.sample || {};
  let passed = true;

  if (type === 'tool-contract') {
    const requiredFields = ['requires_secret', 'secret_classes', 'credential_binding', 'raw_secret_exposure', 'model_visible', 'secret_scope', 'environment_scope', 'access_level', 'short_lived_preferred', 'fallback_context_policy', 'trace_redaction', 'memory_persistence'];
    for (const field of requiredFields) {
      if (!(field in sample)) {
        passed = false;
        issues.push(`tool-contract case ${caseEntry.id} missing field ${field}.`);
      }
    }
    if (sample.raw_secret_exposure !== 'forbidden') {
      passed = false;
      issues.push(`tool-contract case ${caseEntry.id} must forbid raw secret exposure.`);
    }
    for (const secretClass of sample.secret_classes || []) {
      if (!allowedSecretClasses.has(secretClass)) {
        passed = false;
        issues.push(`tool-contract case ${caseEntry.id} uses unknown secret class ${secretClass}.`);
      }
    }
  } else if (type === 'provider-security') {
    const requiredFlags = ['raw_secret_prompting_forbidden', 'server_bound_credentials_required', 'provider_switch_requires_reminimization', 'fallback_full_context_reuse_forbidden', 'trace_redaction_required', 'memory_secret_persistence_forbidden'];
    for (const field of requiredFlags) {
      if (sample[field] !== true) {
        passed = false;
        issues.push(`provider-security case ${caseEntry.id} must set ${field} to true.`);
      }
    }
  } else if (type === 'provider-switch') {
    if (sample.from_provider === sample.to_provider) {
      passed = false;
      issues.push(`provider-switch case ${caseEntry.id} must switch providers.`);
    }
    if (sample.context_policy !== 're-minimize') {
      passed = false;
      issues.push(`provider-switch case ${caseEntry.id} must re-minimize context.`);
    }
  } else if (type === 'context-redaction' || type === 'trace-sanitization') {
    if (!Array.isArray(sample.findings) || sample.findings.length === 0) {
      passed = false;
      issues.push(`${type} case ${caseEntry.id} must declare findings.`);
    }
    if (sample.redaction_state !== 'redacted') {
      passed = false;
      issues.push(`${type} case ${caseEntry.id} must be redacted.`);
    }
  } else if (type === 'memory-rejection') {
    if (sample.memory_persistence !== 'forbidden') {
      passed = false;
      issues.push(`memory-rejection case ${caseEntry.id} must forbid memory persistence.`);
    }
    if (sample.decision !== 'reject') {
      passed = false;
      issues.push(`memory-rejection case ${caseEntry.id} must reject persistence.`);
    }
  } else {
    passed = false;
    issues.push(`Unsupported secret-boundary caseType ${type}.`);
  }

  const expectedPass = caseEntry.expectedPass !== false;
  if (passed !== expectedPass) {
    return {
      passed: false,
      issues: [`secret-boundary case ${caseEntry.id} expected ${expectedPass ? 'pass' : 'fail'} but observed ${passed ? 'pass' : 'fail'}.`, ...issues]
    };
  }

  return {
    passed: true,
    issues: []
  };
}

function evaluateSecretBoundaryFixture(fixture) {
  const result = {
    passed: true,
    issues: []
  };

  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  if (cases.length === 0) {
    result.passed = false;
    result.issues.push('secret-boundary fixture must contain cases.');
    return result;
  }

  for (const caseEntry of cases) {
    const caseResult = evaluateSecretBoundaryCase(caseEntry);
    result.passed = result.passed && caseResult.passed;
    result.issues.push(...caseResult.issues);
  }

  return result;
}

async function evaluateFixture(root, registry, providerExports, outputContractCatalog, fixture) {
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
  } else if (fixture.kind === 'workflow-routing') {
    const check = evaluateWorkflowRoutingMap(registry, fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else if (fixture.kind === 'workflow-evidence') {
    const check = evaluateWorkflowExecutionEvidence(registry, fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
    const claimPolicyCheck = evaluateExecutionClaimPolicy(outputContractCatalog, fixture);
    result.passed = result.passed && claimPolicyCheck.passed;
    result.issues.push(...claimPolicyCheck.issues);
  } else if (fixture.kind === 'provider-export-alignment') {
    const check = evaluateProviderExportAlignment(providerExports, fixture);
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
  } else if (fixture.kind === 'skill-routing') {
    const check = evaluateSkillRouting(root, fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else if (fixture.kind === 'semantic-layout') {
    const check = evaluateSemanticLayoutDecisionsFixture(fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else if (fixture.kind === 'render-layout') {
    const check = await evaluateRenderLayoutFixture(fixture, { baseRoot: root });
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else if (fixture.kind === 'wcag-a11y') {
    const check = await evaluateWcagA11yFixture(fixture, { baseRoot: root });
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else if (fixture.kind === 'rendering-posture') {
    const check = evaluateStaticVsDynamicRenderingAdvisorFixture(fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else if (fixture.kind === 'secret-boundary') {
    const check = evaluateSecretBoundaryFixture(fixture);
    result.passed = check.passed;
    result.issues.push(...check.issues);
  } else {
    result.passed = false;
    result.issues.push(`Unsupported eval kind: ${fixture.kind}`);
  }

  return result;
}

async function runCertificationEvals(baseRoot = repoRoot(), options = {}) {
  const root = baseRoot;
  const catalog = loadEvalCatalog(root);
  const registry = buildNeutralCoreRegistry(root);
  const providerExports = loadProviderExports(root);
  const outputContractsPath = path.join(root, 'core', 'contracts', 'output-contracts.json');
  const outputContractCatalog = fs.existsSync(outputContractsPath) ? readJson(outputContractsPath) : { contracts: [] };
  const fixtures = loadEvalFixtures(root, catalog);
  const requestedKinds = Array.isArray(options.kinds) && options.kinds.length > 0 ? new Set(options.kinds) : null;
  const selectedFixtures = requestedKinds
    ? fixtures.filter((fixture) => requestedKinds.has(String(fixture.kind)))
    : fixtures;
  if (requestedKinds && selectedFixtures.length === 0) {
    return {
      ok: false,
      root: normalize(root),
      suite: catalog.suite || 'provider-neutral-certification',
      total: 0,
      passed: 0,
      failed: 0,
      blockingFailures: 1,
      filters: {
        kinds: [...requestedKinds]
      },
      results: [],
      issues: ['No eval fixtures matched the requested --kind filter.']
    };
  }
  const results = await Promise.all(
    selectedFixtures.map((fixture) => evaluateFixture(root, registry, providerExports, outputContractCatalog, fixture))
  );
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
    filters: requestedKinds ? { kinds: [...requestedKinds] } : null,
    results
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = parseRunnerArgs(process.argv.slice(2));
  const result = await runCertificationEvals(repoRoot(), args);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { runCertificationEvals };
