#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNeutralCoreRegistry } from './build-neutral-core-registry.mjs';
import { buildProviderExports } from './build-provider-exports.mjs';
import { parseSkillFrontmatter, readJson, repoRoot } from './_shared.mjs';
import { validateSecretBoundaries } from './validate-secret-boundaries.mjs';

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function sameJson(left, right) {
  return JSON.stringify(left, null, 2) === JSON.stringify(right, null, 2);
}

function sortWorkflows(workflows) {
  return [...workflows].sort((left, right) => String(left.workflowClass || '').localeCompare(String(right.workflowClass || '')));
}

function readSkillOutputHeadings(skillPath) {
  const text = fs.readFileSync(skillPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const headings = [];
  let inOutput = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '## Output') {
      inOutput = true;
      continue;
    }
    if (inOutput && line.startsWith('## ')) {
      break;
    }
    if (!inOutput) continue;

    const bullet = line.match(/^-\s+`([^`]+)`\s*$/);
    if (bullet) {
      headings.push(bullet[1]);
    }
  }

  return headings;
}

function providerCapabilities(root) {
  for (const candidate of [
    path.join(root, 'core', 'contracts', 'provider-capabilities.json'),
    path.join(root, 'contracts', 'provider-capabilities.json')
  ]) {
    if (fs.existsSync(candidate)) {
      return readJson(candidate);
    }
  }
  return { providers: [] };
}

const qwenCapabilityMarkers = [
  'Qwen3.6-Plus',
  '/think',
  '/no_think',
  '1M token',
  '1,000 calls/day',
  'enable_thinking',
  'modelProviders'
];

const canonicalQwenSurfacePaths = [
  'docs/architecture.md',
  'docs/authority-matrix.md',
  'docs/compatibility.md',
  'docs/lock-model.md',
  'docs/model-agnostic-core-prompt-system.md',
  'docs/repo-overlay-contract.md',
  'docs/shared-with-local-inputs.md',
  'docs/repo-intake-skill-contract.md',
  'docs/runtime-policy-skill-contract.md',
  'docs/tool-contracts/catalog.json',
  'docs/portability.md',
  'docs/provider-capability-matrix.md',
  'core/README.md',
  'core/contracts/README.md',
  'core/contracts/core-registry.json',
  'core/contracts/provider-capabilities.json',
  'core/contracts/workflow-routing-map.json'
];

const allowedMcpPostures = new Set(['disabled', 'read-only', 'bounded-read-write', 'advisory-external', 'experimental']);
const allowedMaturityLabels = new Set(['prose-governed', 'contract-backed', 'validator-backed', 'runtime-implemented']);
const allowedBlockingGatePolicies = new Set(['all-blocking-gates-pass']);
const allowedAdvisoryGatePolicies = new Set(['record-only']);
const allowedEvidencePolicies = new Set(['all-required-evidence-artifacts-present']);
const allowedWorkflowCoverageLabels = new Set(['covered', 'partial', 'planned', 'out-of-scope']);
const allowedProviderCapabilityStates = new Set(['native', 'adapter', 'unsupported']);
const compatibilityToolCatalogSourcePath = 'core/contracts/tool-contracts/catalog.json';
const requiredExecutionStatuses = new Set(['proposed', 'drafted', 'applied', 'verified']);
const requiredValidationOutcomes = new Set(['PASS', 'BLOCKED']);
const requiredWorkflowRunSummarySections = [
  'EXECUTION STATUS',
  'WRITE EVIDENCE',
  'POST-WRITE VERIFICATION',
  'VALIDATION OUTCOME'
];
const requiredWorkflowRunSummaryValidationNotes = [
  'Execution status must be one of proposed, drafted, applied, or verified.',
  'Validation outcome must be PASS or BLOCKED',
  'Applied claims require real write evidence',
  'Verified claims require post-write verification evidence'
];
const requiredWorkflowRunSummaryFailureBehavior = [
  'missing write evidence',
  'post-write verification evidence',
  'return BLOCKED'
];
const requiredWorkflowExampleHeadings = [
  '## WORKFLOW COVERAGE',
  '## WORKFLOW CLASS',
  '## SUMMARY'
];
const requiredWorkflowTemplateContracts = new Set([
  'workflow-plan-v1',
  'workflow-run-summary-v1',
  'workflow-handoff-summary-v1',
  'workflow-validation-summary-v1',
  'workflow-certification-summary-v1'
]);

function validateWorkflowRunSummaryContract(outputContractCatalog) {
  const issues = [];
  const contracts = Array.isArray(outputContractCatalog?.contracts) ? outputContractCatalog.contracts : [];
  const workflowRunSummary = contracts.find((entry) => entry.contract_id === 'workflow-run-summary-v1');
  if (!workflowRunSummary) {
    issues.push('output contract catalog must include workflow-run-summary-v1.');
    return issues;
  }

  const requiredSections = new Set(Array.isArray(workflowRunSummary.required_sections) ? workflowRunSummary.required_sections : []);
  for (const section of requiredWorkflowRunSummarySections) {
    if (!requiredSections.has(section)) {
      issues.push(`workflow-run-summary-v1 must include required section ${section}.`);
    }
  }

  const validationNotes = Array.isArray(workflowRunSummary.validation_notes) ? workflowRunSummary.validation_notes.join('\n') : '';
  for (const snippet of requiredWorkflowRunSummaryValidationNotes) {
    if (!validationNotes.includes(snippet)) {
      issues.push(`workflow-run-summary-v1 validation_notes must include: ${snippet}`);
    }
  }

  const failureBehavior = String(workflowRunSummary.failure_or_partial_completion_behavior || '');
  for (const snippet of requiredWorkflowRunSummaryFailureBehavior) {
    if (!failureBehavior.includes(snippet)) {
      issues.push(`workflow-run-summary-v1 failure behavior must include: ${snippet}`);
    }
  }

  for (const status of requiredExecutionStatuses) {
    if (!validationNotes.includes(status)) {
      issues.push(`workflow-run-summary-v1 validation_notes must reference execution status ${status}.`);
    }
  }
  for (const outcome of requiredValidationOutcomes) {
    if (!validationNotes.includes(outcome) && !failureBehavior.includes(outcome)) {
      issues.push(`workflow-run-summary-v1 must reference validation outcome ${outcome}.`);
    }
  }

  return issues;
}

function validateWorkflowTemplateContractCoverage(outputContractCatalog) {
  const issues = [];
  const contracts = Array.isArray(outputContractCatalog?.contracts) ? outputContractCatalog.contracts : [];
  const contractById = new Map(
    contracts
      .filter((entry) => entry && typeof entry.contract_id === 'string')
      .map((entry) => [entry.contract_id, entry])
  );

  for (const contractId of requiredWorkflowTemplateContracts) {
    const contract = contractById.get(contractId);
    if (!contract) {
      issues.push(`output contract catalog must include ${contractId}.`);
      continue;
    }
    if (!Array.isArray(contract.recommended_templates) || contract.recommended_templates.length === 0) {
      issues.push(`${contractId} must declare non-empty recommended_templates.`);
    }
  }

  return issues;
}

function validateWorkflowExampleArtifact(root, examplePath, workflowClass) {
  const issues = [];
  const absolutePath = path.join(root, examplePath);
  if (!fs.existsSync(absolutePath)) {
    issues.push(`Workflow ${workflowClass} references missing example ${examplePath}.`);
    return issues;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const heading of requiredWorkflowExampleHeadings) {
    if (!content.includes(heading)) {
      issues.push(`Workflow example ${examplePath} must include heading ${heading}.`);
    }
  }
  return issues;
}

function validateQwenBoundaryHygiene(root) {
  const issues = [];
  const derivedGuidePath = path.join(root, 'docs', 'qwen-3-6-intro.md');

  if (!fs.existsSync(derivedGuidePath)) {
    issues.push('Missing derived Qwen guide: docs/qwen-3-6-intro.md');
    return issues;
  }

  const derivedGuide = fs.readFileSync(derivedGuidePath, 'utf8');
  if (!derivedGuide.includes('Class: derived.')) {
    issues.push('docs/qwen-3-6-intro.md must declare Class: derived.');
  }
  if (!derivedGuide.includes('External / Unverified')) {
    issues.push('docs/qwen-3-6-intro.md must contain External / Unverified.');
  }

  for (const relativePath of canonicalQwenSurfacePaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      issues.push(`Missing canonical surface: ${relativePath}`);
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const marker of qwenCapabilityMarkers) {
      if (content.includes(marker)) {
        issues.push(`Canonical surface ${relativePath} must not contain external Qwen capability marker: ${marker}`);
      }
    }
  }

  return issues;
}

function validateProviderNeutralCore(baseRoot = repoRoot()) {
  const root = baseRoot;
  const issues = [];
  const registryPath = path.join(root, 'core', 'contracts', 'core-registry.json');
  const compatibilityRegistryPath = path.join(root, 'contracts', 'core-registry.json');
  const providerCapabilitiesPath = path.join(root, 'core', 'contracts', 'provider-capabilities.json');
  const compatibilityProviderCapabilitiesPath = path.join(root, 'contracts', 'provider-capabilities.json');
  const workflowRoutingPath = path.join(root, 'core', 'contracts', 'workflow-routing-map.json');
  const outputContractsPath = path.join(root, 'core', 'contracts', 'output-contracts.json');
  const toolCatalogPath = path.join(root, 'core', 'contracts', 'tool-contracts', 'catalog.json');
  const compatibilityToolCatalogPath = path.join(root, 'docs', 'tool-contracts', 'catalog.json');
  const evalCatalogPath = path.join(root, 'evals', 'catalog.json');
  const evalRunnerPath = path.join(root, 'scripts', 'tools', 'run-certification-evals.mjs');
  const exportBuilderPath = path.join(root, 'scripts', 'tools', 'build-provider-exports.mjs');

  if (!fs.existsSync(registryPath) && !fs.existsSync(compatibilityRegistryPath)) {
    return {
      ok: false,
      root: normalize(root),
      issueCount: 1,
      issues: ['Missing provider-neutral registry: core/contracts/core-registry.json']
    };
  }

  const committedRegistry = fs.existsSync(registryPath) ? readJson(registryPath) : readJson(compatibilityRegistryPath);
  const generatedRegistry = buildNeutralCoreRegistry(root);
  if (JSON.stringify(committedRegistry, null, 2) !== JSON.stringify(generatedRegistry, null, 2)) {
    issues.push('core/contracts/core-registry.json does not match the generated neutral registry snapshot.');
  }
  if (fs.existsSync(compatibilityRegistryPath) && JSON.stringify(readJson(compatibilityRegistryPath), null, 2) !== JSON.stringify(generatedRegistry, null, 2)) {
    issues.push('contracts/core-registry.json does not match the generated neutral registry snapshot.');
  }

  const capabilities = providerCapabilities(root);
  const providerNames = Array.isArray(capabilities.providers) ? capabilities.providers.map((provider) => provider.name) : [];
  if (!fs.existsSync(providerCapabilitiesPath) && !fs.existsSync(compatibilityProviderCapabilitiesPath)) {
    issues.push('Missing provider capability profile: core/contracts/provider-capabilities.json');
  } else if (providerNames.length === 0) {
    issues.push('provider capability profile must contain a non-empty providers array.');
  } else {
    if (fs.existsSync(providerCapabilitiesPath) && fs.existsSync(compatibilityProviderCapabilitiesPath)) {
      if (JSON.stringify(readJson(providerCapabilitiesPath), null, 2) !== JSON.stringify(readJson(compatibilityProviderCapabilitiesPath), null, 2)) {
        issues.push('contracts/provider-capabilities.json does not match core/contracts/provider-capabilities.json compatibility mirror expectations.');
      }
    }
    for (const required of ['openai-codex', 'anthropic-claude', 'qwen-code', 'kimi-k2_5']) {
      if (!providerNames.includes(required)) {
        issues.push(`provider capability profile must include provider ${required}.`);
      }
    }
    if (capabilities.canonicalOwner !== 'core/contracts/provider-capabilities.json') {
      issues.push(`provider capability canonicalOwner must be core/contracts/provider-capabilities.json; found ${capabilities.canonicalOwner || '<missing>'}.`);
    }
    if (capabilities.projectionPolicy?.exportDerivation !== 'provider-capabilities-derived-only') {
      issues.push('provider capability projectionPolicy.exportDerivation must be provider-capabilities-derived-only.');
    }
    if (capabilities.projectionPolicy?.sourceContract !== 'core/contracts/provider-capabilities.json') {
      issues.push('provider capability projectionPolicy.sourceContract must be core/contracts/provider-capabilities.json.');
    }
    if (!Array.isArray(capabilities.portabilityModel?.allowedStates) || capabilities.portabilityModel.allowedStates.length === 0) {
      issues.push('provider capability portabilityModel.allowedStates must be a non-empty array.');
    } else {
      for (const state of capabilities.portabilityModel.allowedStates) {
        if (!allowedProviderCapabilityStates.has(state)) {
          issues.push(`provider capability portabilityModel.allowedStates contains invalid state ${state}.`);
        }
      }
    }
    const normalizedFields = capabilities.portabilityModel?.normalizedCapabilityFields || [];
    for (const field of ['toolUse', 'structuredOutputs', 'mcp', 'subagents']) {
      if (!Array.isArray(normalizedFields) || !normalizedFields.includes(field)) {
        issues.push(`provider capability portabilityModel.normalizedCapabilityFields must include ${field}.`);
      }
    }
    for (const provider of capabilities.providers || []) {
      for (const field of ['toolUse', 'structuredOutputs', 'mcp', 'subagents']) {
        if (!allowedProviderCapabilityStates.has(provider[field])) {
          issues.push(`provider capability ${provider.name || '<unnamed>'} has invalid ${field} state ${provider[field] || '<missing>'}.`);
        }
      }
    }
  }

  if (!fs.existsSync(toolCatalogPath) && !fs.existsSync(compatibilityToolCatalogPath)) {
    issues.push('Missing tool contract catalog: core/contracts/tool-contracts/catalog.json');
  }
  if (fs.existsSync(compatibilityToolCatalogPath)) {
    try {
      const compatibilityToolCatalog = readJson(compatibilityToolCatalogPath);
      if (compatibilityToolCatalog.surfaceRole !== 'compatibility-export') {
        issues.push('docs/tool-contracts/catalog.json must declare surfaceRole as compatibility-export.');
      }
      if (compatibilityToolCatalog.canonicalSourcePath !== compatibilityToolCatalogSourcePath) {
        issues.push(`docs/tool-contracts/catalog.json must declare canonicalSourcePath as ${compatibilityToolCatalogSourcePath}.`);
      }
      if (compatibilityToolCatalog.releaseClassification !== 'derived-compatibility') {
        issues.push('docs/tool-contracts/catalog.json must declare releaseClassification as derived-compatibility.');
      }
      if (compatibilityToolCatalog.releaseCanonicalAuthority !== compatibilityToolCatalogSourcePath) {
        issues.push(`docs/tool-contracts/catalog.json must declare releaseCanonicalAuthority as ${compatibilityToolCatalogSourcePath}.`);
      }
      if (compatibilityToolCatalog.authoritative !== false) {
        issues.push('docs/tool-contracts/catalog.json must declare authoritative as false.');
      }
    } catch (error) {
      issues.push(`docs/tool-contracts/catalog.json parse failed: ${error.message}`);
    }
  }
  if (!fs.existsSync(workflowRoutingPath)) {
    issues.push('Missing workflow routing map: core/contracts/workflow-routing-map.json');
  }
  if (!fs.existsSync(outputContractsPath)) {
    issues.push('Missing output contract catalog: core/contracts/output-contracts.json');
  }
  if (!fs.existsSync(evalCatalogPath)) {
    issues.push('Missing certification eval catalog: evals/catalog.json');
  }
  if (!fs.existsSync(evalRunnerPath)) {
    issues.push('Missing certification eval runner: scripts/tools/run-certification-evals.mjs');
  }
  if (!fs.existsSync(exportBuilderPath)) {
    issues.push('Missing provider export builder: scripts/tools/build-provider-exports.mjs');
  }

  const providerDirectories = [
    'openai-codex',
    'anthropic-claude',
    'qwen-code',
    'kimi-k2_5',
    'openai',
    'anthropic',
    'qwen',
    'kimi',
    'codex'
  ];
  const generatedProviderExports = new Map(buildProviderExports(root, {}).map(({ provider, export: exportJson }) => [provider, exportJson]));
  const expectedSourceContracts = {
    skillManifest: 'core/contracts/portable-skill-manifest.json',
    outputContracts: 'core/contracts/output-contracts.json',
    workflowRoutingMap: 'core/contracts/workflow-routing-map.json',
    toolCatalog: 'core/contracts/tool-contracts/catalog.json',
    providerCapabilities: 'core/contracts/provider-capabilities.json'
  };
  for (const provider of providerDirectories) {
    const readmePath = path.join(root, 'providers', provider, 'README.md');
    const exportPath = path.join(root, 'providers', provider, 'export.json');
    if (!fs.existsSync(readmePath)) {
      issues.push(`Missing provider adapter scaffold: providers/${provider}/README.md`);
    }
    if (!fs.existsSync(exportPath)) {
      issues.push(`Missing provider export artifact: providers/${provider}/export.json`);
      continue;
    }
    const committedExport = readJson(exportPath);
    if (committedExport.sourceRegistry !== 'core/contracts/core-registry.json') {
      issues.push(`providers/${provider}/export.json must declare sourceRegistry as core/contracts/core-registry.json.`);
    }
    for (const [key, expectedPath] of Object.entries(expectedSourceContracts)) {
      if (committedExport.sourceContracts?.[key] !== expectedPath) {
        issues.push(`providers/${provider}/export.json must declare sourceContracts.${key} as ${expectedPath}.`);
      }
    }
    if (committedExport.capabilityOwnership?.sourceContract !== 'core/contracts/provider-capabilities.json') {
      issues.push(`providers/${provider}/export.json must declare capabilityOwnership.sourceContract as core/contracts/provider-capabilities.json.`);
    }
    if (committedExport.capabilityOwnership?.projectionPolicy !== 'provider-capabilities-derived-only') {
      issues.push(`providers/${provider}/export.json must declare capabilityOwnership.projectionPolicy as provider-capabilities-derived-only.`);
    }
    if (committedExport.capabilityOwnership?.portabilityVocabulary !== 'provider-portability-v1') {
      issues.push(`providers/${provider}/export.json must declare capabilityOwnership.portabilityVocabulary as provider-portability-v1.`);
    }
    for (const field of ['toolUse', 'structuredOutputs', 'mcp', 'subagents']) {
      if (!allowedProviderCapabilityStates.has(committedExport.capabilityProfile?.[field])) {
        issues.push(`providers/${provider}/export.json capabilityProfile.${field} has invalid value ${committedExport.capabilityProfile?.[field] || '<missing>'}.`);
      }
    }
    if (committedExport.certification?.completionModel !== 'artifact-and-gate-based') {
      issues.push(`providers/${provider}/export.json must declare certification.completionModel as artifact-and-gate-based.`);
    }
    if (committedExport.certification?.blockingSource !== 'workflow.validationPosture.requiredGates') {
      issues.push(`providers/${provider}/export.json must declare certification.blockingSource as workflow.validationPosture.requiredGates.`);
    }
    if (committedExport.certification?.requiredEvidenceSource !== 'workflow.requiredEvidenceArtifacts') {
      issues.push(`providers/${provider}/export.json must declare certification.requiredEvidenceSource as workflow.requiredEvidenceArtifacts.`);
    }
    for (const skill of committedExport.skills || []) {
      for (const field of ['skillId', 'manifestPath', 'category', 'status', 'maturityLabel', 'mcpPosture', 'toolUsagePosture', 'workflowSupport']) {
        if (skill[field] == null) {
          issues.push(`providers/${provider}/export.json skill ${skill.name || '<unnamed>'} is missing ${field}.`);
        }
      }
      if (!skill.workflowSupport || typeof skill.workflowSupport !== 'object') {
        issues.push(`providers/${provider}/export.json skill ${skill.name || '<unnamed>'} must declare workflowSupport as an object.`);
      } else {
        for (const field of ['status', 'workflowClasses', 'requiredValidationGates', 'expectedOutputContracts', 'requiredEvidenceArtifacts', 'recommendedTemplates', 'exampleArtifacts']) {
          if (skill.workflowSupport[field] == null) {
            issues.push(`providers/${provider}/export.json skill ${skill.name || '<unnamed>'} workflowSupport is missing ${field}.`);
          }
        }
      }
      if (skill.outputContractId && skill.outputContractPath !== 'core/contracts/output-contracts.json') {
        issues.push(`providers/${provider}/export.json skill ${skill.name || '<unnamed>'} must declare outputContractPath as core/contracts/output-contracts.json when outputContractId is set.`);
      }
      if (skill.outputContractId && skill.toolContractCatalogPath !== 'core/contracts/tool-contracts/catalog.json') {
        issues.push(`providers/${provider}/export.json skill ${skill.name || '<unnamed>'} must declare toolContractCatalogPath as core/contracts/tool-contracts/catalog.json when outputContractId is set.`);
      }
    }
    for (const workflow of committedExport.workflows || []) {
      if (!Array.isArray(workflow.requiredEvidenceArtifacts) || workflow.requiredEvidenceArtifacts.length === 0) {
        issues.push(`providers/${provider}/export.json workflow ${workflow.workflowClass || '<unnamed>'} must declare requiredEvidenceArtifacts.`);
      }
      if (!workflow.completionPosture || typeof workflow.completionPosture !== 'object') {
        issues.push(`providers/${provider}/export.json workflow ${workflow.workflowClass || '<unnamed>'} must declare completionPosture.`);
      }
    }
    const providerName = committedExport.canonicalProvider || committedExport.provider || provider;
    const generatedExport = generatedProviderExports.get(providerName);
    if (!generatedExport) {
      issues.push(`No generated provider export is available for ${providerName}.`);
      continue;
    }
    if (JSON.stringify(committedExport, null, 2) !== JSON.stringify(generatedExport, null, 2)) {
      issues.push(`providers/${provider}/export.json does not match the generated provider export.`);
    }
  }

  if (fs.existsSync(evalCatalogPath)) {
    const evalCatalog = readJson(evalCatalogPath);
    if (!Array.isArray(evalCatalog.fixtures) || evalCatalog.fixtures.length === 0) {
      issues.push('evals/catalog.json must declare a non-empty fixtures array.');
    } else {
      for (const fixtureRef of evalCatalog.fixtures) {
        if (typeof fixtureRef !== 'string' || fixtureRef.trim() === '') {
          issues.push('evals/catalog.json fixtures must be non-empty path strings.');
          continue;
        }
        const fixturePath = path.join(root, 'evals', fixtureRef);
        if (!fs.existsSync(fixturePath)) {
          issues.push(`Missing eval fixture: ${fixtureRef}`);
          continue;
        }
        const fixture = readJson(fixturePath);
        if (typeof fixture.id !== 'string' || fixture.id.trim() === '') {
          issues.push(`Eval fixture ${fixtureRef} must declare an id.`);
        }
        if (typeof fixture.kind !== 'string' || fixture.kind.trim() === '') {
          issues.push(`Eval fixture ${fixtureRef} must declare a kind.`);
        }
        if (typeof fixture.target !== 'object' || fixture.target === null || typeof fixture.target.name !== 'string' || fixture.target.name.trim() === '') {
          issues.push(`Eval fixture ${fixtureRef} must declare target.name.`);
        }
      }
    }
  }

  const skillsRootCandidates = [
    path.join(root, 'core', 'skills'),
    path.join(root, 'skills')
  ];
  const skillNames = new Set();
  for (const skillsRoot of skillsRootCandidates) {
    if (!fs.existsSync(skillsRoot)) {
      continue;
    }
    const skillDirectories = fs.readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of skillDirectories) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const frontmatter = parseSkillFrontmatter(fs.readFileSync(skillPath, 'utf8'));
      skillNames.add(entry.name);
      if (frontmatter.name !== entry.name) {
        issues.push(`Skill frontmatter mismatch for ${entry.name}: found ${frontmatter.name || '<missing>'}.`);
      }
      const outputHeadings = readSkillOutputHeadings(skillPath);
      if (!Array.isArray(outputHeadings) || outputHeadings.length === 0) {
        issues.push(`Skill ${entry.name} must declare output headings.`);
      }
    }
  }

  if (committedRegistry.core?.name !== 'model-agnostic-workflow-system') {
    issues.push(`core.name must be model-agnostic-workflow-system; found ${committedRegistry.core?.name || '<missing>'}.`);
  }
  if (committedRegistry.core?.status !== 'provider-neutral') {
    issues.push(`core.status must be provider-neutral; found ${committedRegistry.core?.status || '<missing>'}.`);
  }
  const expectedCanonicalContracts = {
    skillManifest: 'core/contracts/portable-skill-manifest.json',
    outputContracts: 'core/contracts/output-contracts.json',
    workflowRoutingMap: 'core/contracts/workflow-routing-map.json',
    toolCatalog: 'core/contracts/tool-contracts/catalog.json',
    providerCapabilities: 'core/contracts/provider-capabilities.json'
  };
  for (const [key, expectedPath] of Object.entries(expectedCanonicalContracts)) {
    if (committedRegistry.core?.canonicalContracts?.[key] !== expectedPath) {
      issues.push(`core.canonicalContracts.${key} must be ${expectedPath}.`);
    }
  }
  if (!Array.isArray(committedRegistry.skills) || committedRegistry.skills.length !== skillNames.size) {
    issues.push(`Registry skill count must match the current skill manifests; found ${Array.isArray(committedRegistry.skills) ? committedRegistry.skills.length : 'invalid'} vs ${skillNames.size}.`);
  }
  if (!Array.isArray(committedRegistry.tools) || committedRegistry.tools.length === 0) {
    issues.push('Registry tools must be a non-empty array.');
  }
  if (!Array.isArray(committedRegistry.workflows) || committedRegistry.workflows.length === 0) {
    issues.push('Registry workflows must be a non-empty array.');
  }

  const secretBoundaryResult = validateSecretBoundaries(root);
  if (!secretBoundaryResult.ok) {
    issues.push(...secretBoundaryResult.issues.map((issue) => `secret-boundary: ${issue}`));
  }

  issues.push(...validateQwenBoundaryHygiene(root));

  const outputContractCatalog = fs.existsSync(outputContractsPath) ? readJson(outputContractsPath) : { contracts: [] };
  issues.push(...validateWorkflowRunSummaryContract(outputContractCatalog));
  const outputContractIds = new Set((outputContractCatalog.contracts || []).map((entry) => entry.contract_id));

  for (const skill of committedRegistry.skills || []) {
    for (const field of ['skillId', 'skillPath', 'manifestPath', 'category', 'mcpPosture', 'maturityLabel', 'toolUsagePosture']) {
      if (skill[field] == null || skill[field] === '') {
        issues.push(`Skill ${skill.name || '<unnamed>'} must declare ${field}.`);
      }
    }
    if (skill.mcpPosture && !allowedMcpPostures.has(skill.mcpPosture)) {
      issues.push(`Skill ${skill.name} has invalid mcpPosture ${skill.mcpPosture}.`);
    }
    if (skill.maturityLabel && !allowedMaturityLabels.has(skill.maturityLabel)) {
      issues.push(`Skill ${skill.name} has invalid maturityLabel ${skill.maturityLabel}.`);
    }
    if (typeof skill.sourcePath !== 'string' || skill.sourcePath.trim() === '') {
      issues.push(`Skill ${skill.name || '<unnamed>'} must declare sourcePath.`);
      continue;
    }
    if (skill.outputContractId && !outputContractIds.has(skill.outputContractId)) {
      issues.push(`Skill ${skill.name} references unknown outputContractId ${skill.outputContractId}.`);
    }
    if (skill.outputContractId && skill.outputContractPath !== 'core/contracts/output-contracts.json') {
      issues.push(`Skill ${skill.name} must point outputContractPath to core/contracts/output-contracts.json when outputContractId is set.`);
    }
    if (!skill.workflowSupport || typeof skill.workflowSupport !== 'object') {
      issues.push(`Skill ${skill.name || '<unnamed>'} must declare workflowSupport.`);
    } else {
      const workflowSupport = skill.workflowSupport;
      if (!['mapped', 'standalone'].includes(workflowSupport.status)) {
        issues.push(`Skill ${skill.name} workflowSupport.status must be mapped or standalone; found ${workflowSupport.status || '<missing>'}.`);
      }
      for (const field of ['workflowClasses', 'requiredValidationGates', 'expectedOutputContracts', 'requiredEvidenceArtifacts', 'recommendedTemplates', 'exampleArtifacts']) {
        if (!Array.isArray(workflowSupport[field])) {
          issues.push(`Skill ${skill.name} workflowSupport.${field} must be an array.`);
        }
      }
      if (workflowSupport.status === 'mapped' && (!Array.isArray(workflowSupport.workflowClasses) || workflowSupport.workflowClasses.length === 0)) {
        issues.push(`Skill ${skill.name} workflowSupport.status is mapped but workflowClasses is empty.`);
      }
    }
    if (!fs.existsSync(path.join(root, skill.sourcePath))) {
      issues.push(`Skill sourcePath does not exist: ${skill.sourcePath}`);
      continue;
    }
    const outputHeadings = readSkillOutputHeadings(path.join(root, skill.sourcePath));
    if (!Array.isArray(skill.outputHeadings) || skill.outputHeadings.length === 0) {
      issues.push(`Skill ${skill.name} must declare outputHeadings.`);
    } else if (JSON.stringify(skill.outputHeadings) !== JSON.stringify(outputHeadings)) {
      issues.push(`Skill ${skill.name} outputHeadings do not match the SKILL.md output contract.`);
    }
  }

  for (const tool of committedRegistry.tools || []) {
    if (typeof tool.tool_name !== 'string' || tool.tool_name.trim() === '') {
      issues.push('Tool entry must declare tool_name.');
      continue;
    }
    if (!Array.isArray(tool.providers) || tool.providers.length === 0) {
      issues.push(`Tool ${tool.tool_name} must declare providers.`);
    }
    if (!Array.isArray(tool.routing_hints) || tool.routing_hints.length === 0) {
      issues.push(`Tool ${tool.tool_name} must declare routing_hints.`);
    }
    for (const field of ['requires_secret', 'secret_classes', 'credential_binding', 'raw_secret_exposure', 'model_visible', 'secret_scope', 'environment_scope', 'access_level', 'short_lived_preferred', 'fallback_context_policy', 'trace_redaction', 'memory_persistence']) {
      if (tool[field] == null) {
        issues.push(`Tool ${tool.tool_name} must declare secret-boundary field ${field}.`);
      }
    }
    if (tool.sourcePath && !fs.existsSync(path.join(root, tool.sourcePath))) {
      issues.push(`Tool ${tool.tool_name} sourcePath does not exist: ${tool.sourcePath}`);
    }
  }

  for (const provider of committedRegistry.providers || []) {
    if (typeof provider.name !== 'string' || provider.name.trim() === '') {
      issues.push('Provider entry must declare a name.');
      continue;
    }
    if (!provider.aliases || !Array.isArray(provider.aliases)) {
      issues.push(`Provider ${provider.name} must declare aliases as an array.`);
    }
    if (!provider.packaging) {
      issues.push(`Provider ${provider.name} must declare packaging.`);
    }
    if (!provider.security || typeof provider.security !== 'object') {
      issues.push(`Provider ${provider.name} must declare security metadata.`);
    }
  }

  if (fs.existsSync(workflowRoutingPath)) {
    const workflowRouting = readJson(workflowRoutingPath);
    if (workflowRouting.canonicalOwner !== 'core/contracts/workflow-routing-map.json') {
      issues.push(`workflow routing canonicalOwner must be core/contracts/workflow-routing-map.json; found ${workflowRouting.canonicalOwner || '<missing>'}.`);
    }
    if (!Array.isArray(workflowRouting.workflowClasses) || workflowRouting.workflowClasses.length === 0) {
      issues.push('core/contracts/workflow-routing-map.json must declare a non-empty workflowClasses array.');
    }
    if (workflowRouting.templateRoot !== 'templates/codex-workflow') {
      issues.push(`workflow routing templateRoot must be templates/codex-workflow; found ${workflowRouting.templateRoot || '<missing>'}.`);
    } else if (!fs.existsSync(path.join(root, workflowRouting.templateRoot))) {
      issues.push(`workflow routing templateRoot does not exist: ${workflowRouting.templateRoot}`);
    }
    if (workflowRouting.exampleRoot !== 'examples/codex-workflow') {
      issues.push(`workflow routing exampleRoot must be examples/codex-workflow; found ${workflowRouting.exampleRoot || '<missing>'}.`);
    } else if (!fs.existsSync(path.join(root, workflowRouting.exampleRoot))) {
      issues.push(`workflow routing exampleRoot does not exist: ${workflowRouting.exampleRoot}`);
    }
    if (!sameJson(sortWorkflows(workflowRouting.workflowClasses || []), sortWorkflows(committedRegistry.workflows || []))) {
      issues.push('Registry workflows do not match core/contracts/workflow-routing-map.json workflowClasses.');
    }

    const toolNames = new Set((committedRegistry.tools || []).map((entry) => entry.tool_name));
    const toolIntents = new Set((committedRegistry.tools || []).map((entry) => entry.intent_class));
    const skillNameSet = new Set((committedRegistry.skills || []).map((entry) => entry.name));

    for (const workflow of workflowRouting.workflowClasses || []) {
      if (!workflow || typeof workflow !== 'object') {
        issues.push('workflowClasses entries must be objects.');
        continue;
      }
      for (const field of ['workflowClass', 'category', 'supportingSkills', 'controlPlaneSkills', 'allowedToolIntents', 'allowedTools', 'mcpPosture', 'validationPosture', 'expectedOutputContracts', 'requiredEvidenceArtifacts', 'completionPosture', 'recommendedTemplates', 'exampleArtifacts', 'workflowClassCoverage', 'workflowClassCoverageNotes', 'maturityLabel']) {
        if (workflow[field] == null) {
          issues.push(`Workflow entry ${workflow.workflowClass || '<unnamed>'} is missing ${field}.`);
        }
      }
      if (!allowedMcpPostures.has(workflow.mcpPosture)) {
        issues.push(`Workflow ${workflow.workflowClass} has invalid mcpPosture ${workflow.mcpPosture}.`);
      }
      if (!allowedMaturityLabels.has(workflow.maturityLabel)) {
        issues.push(`Workflow ${workflow.workflowClass} has invalid maturityLabel ${workflow.maturityLabel}.`);
      }
      if (!workflow.validationPosture || !Array.isArray(workflow.validationPosture.requiredGates)) {
        issues.push(`Workflow ${workflow.workflowClass} must declare validationPosture.requiredGates.`);
      } else {
        for (const gate of workflow.validationPosture.requiredGates) {
          if (!toolNames.has(gate)) {
            issues.push(`Workflow ${workflow.workflowClass} references unknown validation gate tool ${gate}.`);
          }
        }
      }
      if (!allowedMaturityLabels.has(workflow.validationPosture?.maturityLabel)) {
        issues.push(`Workflow ${workflow.workflowClass} has invalid validationPosture.maturityLabel ${workflow.validationPosture?.maturityLabel || '<missing>'}.`);
      }
      if (!allowedBlockingGatePolicies.has(workflow.completionPosture?.blockingGatePolicy)) {
        issues.push(`Workflow ${workflow.workflowClass} has invalid completionPosture.blockingGatePolicy ${workflow.completionPosture?.blockingGatePolicy || '<missing>'}.`);
      }
      if (!allowedAdvisoryGatePolicies.has(workflow.completionPosture?.advisoryGatePolicy)) {
        issues.push(`Workflow ${workflow.workflowClass} has invalid completionPosture.advisoryGatePolicy ${workflow.completionPosture?.advisoryGatePolicy || '<missing>'}.`);
      }
      if (!allowedEvidencePolicies.has(workflow.completionPosture?.requiredEvidencePolicy)) {
        issues.push(`Workflow ${workflow.workflowClass} has invalid completionPosture.requiredEvidencePolicy ${workflow.completionPosture?.requiredEvidencePolicy || '<missing>'}.`);
      }
      for (const skillName of workflow.supportingSkills || []) {
        if (!skillNameSet.has(skillName)) {
          issues.push(`Workflow ${workflow.workflowClass} references unknown supporting skill ${skillName}.`);
        }
      }
      for (const controlSkill of workflow.controlPlaneSkills || []) {
        const controlSkillPath = path.join(root, '.agents', 'skills', controlSkill, 'SKILL.md');
        if (!fs.existsSync(controlSkillPath)) {
          issues.push(`Workflow ${workflow.workflowClass} references missing control-plane skill ${controlSkill}.`);
        }
      }
      for (const toolIntent of workflow.allowedToolIntents || []) {
        if (!toolIntents.has(toolIntent)) {
          issues.push(`Workflow ${workflow.workflowClass} references unknown tool intent ${toolIntent}.`);
        }
      }
      for (const toolName of workflow.allowedTools || []) {
        if (!toolNames.has(toolName)) {
          issues.push(`Workflow ${workflow.workflowClass} references unknown tool ${toolName}.`);
        }
      }
      for (const contractId of workflow.expectedOutputContracts || []) {
        if (!outputContractIds.has(contractId)) {
          issues.push(`Workflow ${workflow.workflowClass} references unknown output contract ${contractId}.`);
        }
      }
      for (const contractId of workflow.requiredEvidenceArtifacts || []) {
        if (!outputContractIds.has(contractId)) {
          issues.push(`Workflow ${workflow.workflowClass} references unknown required evidence contract ${contractId}.`);
        }
        if (!Array.isArray(workflow.expectedOutputContracts) || !workflow.expectedOutputContracts.includes(contractId)) {
          issues.push(`Workflow ${workflow.workflowClass} requiredEvidenceArtifacts must be a subset of expectedOutputContracts; missing ${contractId}.`);
        }
      }
      if (!Array.isArray(workflow.recommendedTemplates) || workflow.recommendedTemplates.length === 0) {
        issues.push(`Workflow ${workflow.workflowClass} must declare non-empty recommendedTemplates.`);
      } else {
        for (const templatePath of workflow.recommendedTemplates) {
          if (typeof templatePath !== 'string' || templatePath.trim() === '') {
            issues.push(`Workflow ${workflow.workflowClass} has an invalid template path entry.`);
            continue;
          }
          if (!templatePath.startsWith('templates/codex-workflow/')) {
            issues.push(`Workflow ${workflow.workflowClass} template ${templatePath} must be under templates/codex-workflow/.`);
          }
          if (!fs.existsSync(path.join(root, templatePath))) {
            issues.push(`Workflow ${workflow.workflowClass} references missing template ${templatePath}.`);
          }
        }
      }
      if (!Array.isArray(workflow.exampleArtifacts)) {
        issues.push(`Workflow ${workflow.workflowClass} must declare exampleArtifacts as an array.`);
      } else {
        for (const examplePath of workflow.exampleArtifacts) {
          if (typeof examplePath !== 'string' || examplePath.trim() === '') {
            issues.push(`Workflow ${workflow.workflowClass} has an invalid example path entry.`);
            continue;
          }
          if (!examplePath.startsWith('examples/codex-workflow/')) {
            issues.push(`Workflow ${workflow.workflowClass} example ${examplePath} must be under examples/codex-workflow/.`);
          }
          if (!fs.existsSync(path.join(root, examplePath))) {
            issues.push(`Workflow ${workflow.workflowClass} references missing example ${examplePath}.`);
          } else {
            issues.push(...validateWorkflowExampleArtifact(root, examplePath, workflow.workflowClass));
          }
        }
      }
      if (!allowedWorkflowCoverageLabels.has(workflow.workflowClassCoverage)) {
        issues.push(`Workflow ${workflow.workflowClass} has invalid workflowClassCoverage ${workflow.workflowClassCoverage || '<missing>'}.`);
      }
      if (typeof workflow.workflowClassCoverageNotes !== 'string' || workflow.workflowClassCoverageNotes.trim() === '') {
        issues.push(`Workflow ${workflow.workflowClass} must declare non-empty workflowClassCoverageNotes.`);
      }
      if (workflow.workflowClassCoverage === 'covered' && (!Array.isArray(workflow.exampleArtifacts) || workflow.exampleArtifacts.length === 0)) {
        issues.push(`Workflow ${workflow.workflowClass} declares covered workflowClassCoverage but has no exampleArtifacts.`);
      }
    }
  }

  const workflowByClass = new Map((committedRegistry.workflows || []).map((entry) => [entry.workflowClass, entry]));
  for (const skill of committedRegistry.skills || []) {
    const support = skill.workflowSupport;
    if (!support || typeof support !== 'object' || !Array.isArray(support.workflowClasses)) {
      continue;
    }
    for (const workflowClass of support.workflowClasses) {
      const workflow = workflowByClass.get(workflowClass);
      if (!workflow) {
        issues.push(`Skill ${skill.name} workflowSupport references unknown workflow class ${workflowClass}.`);
        continue;
      }
      if (!Array.isArray(workflow.supportingSkills) || !workflow.supportingSkills.includes(skill.name)) {
        issues.push(`Skill ${skill.name} workflowSupport includes ${workflowClass} but workflow mapping does not include the skill.`);
      }
    }
  }

  issues.push(...validateWorkflowTemplateContractCoverage(outputContractCatalog));
  for (const contract of outputContractCatalog.contracts || []) {
    if (!Array.isArray(contract.recommended_templates) || contract.recommended_templates.length === 0) {
      continue;
    }
    for (const templatePath of contract.recommended_templates) {
      if (typeof templatePath !== 'string' || templatePath.trim() === '') {
        issues.push(`Output contract ${contract.contract_id || '<unknown>'} has invalid recommended_templates entry.`);
        continue;
      }
      if (!templatePath.startsWith('templates/codex-workflow/')) {
        issues.push(`Output contract ${contract.contract_id || '<unknown>'} template ${templatePath} must be under templates/codex-workflow/.`);
      }
      if (!fs.existsSync(path.join(root, templatePath))) {
        issues.push(`Output contract ${contract.contract_id || '<unknown>'} references missing template ${templatePath}.`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    root: normalize(root),
    issueCount: issues.length,
    issues
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = validateProviderNeutralCore();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { validateProviderNeutralCore };
