#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNeutralCoreRegistry } from './build-neutral-core-registry.mjs';
import { readJson, repoRoot } from './_shared.mjs';

function parseArgs(argv) {
  const args = {
    write: false,
    provider: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--write') {
      args.write = true;
      continue;
    }
    if (value === '--provider' && argv[index + 1]) {
      args.provider = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function providerCompatibility(provider) {
  return provider.skillPackaging === 'compatibility-export' ? 'compatibility-export' : 'adapter';
}

function providerMatches(provider, requested) {
  if (!requested) {
    return true;
  }
  if (provider.name === requested) {
    return true;
  }
  if (Array.isArray(provider.aliases) && provider.aliases.includes(requested)) {
    return true;
  }
  if (Array.isArray(provider.legacyExportDirectories) && provider.legacyExportDirectories.includes(requested)) {
    return true;
  }
  return false;
}

function loadProviderCapabilities(root) {
  const candidatePaths = [
    path.join(root, 'core', 'contracts', 'provider-capabilities.json'),
    path.join(root, 'contracts', 'provider-capabilities.json')
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return readJson(candidate);
    }
  }

  return { providers: [] };
}

function createProviderExport(root, registry, provider) {
  const exportMode = providerCompatibility(provider);
  const exportRoot = `providers/${provider.name}/export.json`;
  const sourceContracts = registry.core?.canonicalContracts || {
    skillManifest: 'core/contracts/portable-skill-manifest.json',
    outputContracts: 'core/contracts/output-contracts.json',
    workflowRoutingMap: 'core/contracts/workflow-routing-map.json',
    toolCatalog: 'core/contracts/tool-contracts/catalog.json',
    providerCapabilities: 'core/contracts/provider-capabilities.json'
  };
  return {
    schemaVersion: '1.0.0',
    provider: provider.name,
    canonicalProvider: provider.name,
    aliases: provider.aliases || [],
    legacyExportDirectories: provider.legacyExportDirectories || [],
    sourceRegistry: 'core/contracts/core-registry.json',
    sourceContracts,
    sourcePackage: registry.core.sourcePackage,
    capabilityProfile: provider,
    packaging: {
      mode: provider.skillPackaging,
      transport: provider.packaging,
      status: exportMode
    },
    skills: registry.skills.map((skill) => ({
      skillId: skill.skillId,
      name: skill.name,
      sourcePath: skill.sourcePath,
      skillPath: skill.skillPath,
      manifestPath: skill.manifestPath,
      classification: skill.classification,
      category: skill.category,
      status: skill.status,
      maturityLabel: skill.maturityLabel,
      mcpPosture: skill.mcpPosture,
      toolUsagePosture: skill.toolUsagePosture,
      exportMode,
      outputHeadings: skill.outputHeadings,
      requiresRepoInputs: skill.requiresRepoInputs,
      safeToAutoRun: skill.safeToAutoRun,
      approvalMode: skill.approvalMode,
      subagentPolicy: skill.subagentPolicy,
      requiredTools: skill.requiredTools,
      optionalTools: skill.optionalTools,
      outputContractId: skill.outputContractId || null,
      outputContractPath: skill.outputContractPath || null,
      toolContractCatalogPath: skill.toolContractCatalogPath || null,
      workflowSupport: skill.workflowSupport || null,
      providerCompatibility: skill.providerCompatibility,
      providerProjections: skill.providerProjections || null
    })),
    tools: registry.tools.map((tool) => ({
      name: tool.tool_name,
      tool_name: tool.tool_name,
      intent_class: tool.intent_class,
      schema: tool.schema,
      side_effects: tool.side_effects,
      approval_required: tool.approval_required,
      mcp_compatible: tool.mcp_compatible,
      requires_secret: tool.requires_secret,
      secret_classes: tool.secret_classes,
      credential_binding: tool.credential_binding,
      raw_secret_exposure: tool.raw_secret_exposure,
      model_visible: tool.model_visible,
      secret_scope: tool.secret_scope,
      environment_scope: tool.environment_scope,
      access_level: tool.access_level,
      short_lived_preferred: tool.short_lived_preferred,
      fallback_context_policy: tool.fallback_context_policy,
      trace_redaction: tool.trace_redaction,
      memory_persistence: tool.memory_persistence,
      exportMode,
      providerCompatibility: tool.providerCompatibility,
      routing_hints: tool.routing_hints
    })),
    workflows: (registry.workflows || []).map((workflow) => ({
      ...workflow,
      exportMode
    })),
    certification: {
      completionModel: 'artifact-and-gate-based',
      blockingSource: 'workflow.validationPosture.requiredGates',
      requiredEvidenceSource: 'workflow.requiredEvidenceArtifacts'
    },
    compatibility: {
      pluginManifest: provider.name === 'openai-codex' || (provider.legacyExportDirectories || []).includes('codex') ? '.codex-plugin/plugin.json' : null,
      exportRoot,
      legacyExportRoots: (provider.legacyExportDirectories || []).map((legacy) => `providers/${legacy}/export.json`)
    }
  };
}

function buildProviderExports(baseRoot = repoRoot(), options = {}) {
  const root = baseRoot;
  const registry = buildNeutralCoreRegistry(root);
  const providerCapabilities = loadProviderCapabilities(root);
  const providers = Array.isArray(providerCapabilities.providers) ? providerCapabilities.providers : [];
  const args = options.provider ? { provider: options.provider } : parseArgs(process.argv.slice(2));
  const selectedProviders = providers.filter((provider) => providerMatches(provider, args.provider));

  return selectedProviders.map((provider) => ({
    provider: provider.name,
    export: createProviderExport(root, registry, provider),
    writeTargets: [
      `providers/${provider.name}/export.json`,
      ...(provider.legacyExportDirectories || []).map((legacy) => `providers/${legacy}/export.json`)
    ]
  }));
}

function writeExports(root, exports) {
  const receipts = [];
  for (const { writeTargets, export: providerExport } of exports) {
    for (const target of writeTargets) {
      const outPath = path.join(root, target);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(providerExport, null, 2)}\n`, 'utf8');
      receipts.push(normalize(outPath));
    }
  }
  return receipts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const exports = buildProviderExports(repoRoot(), args);
  if (args.write) {
    const receipts = writeExports(repoRoot(), exports);
    console.log(JSON.stringify({ ok: true, written: receipts }, null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify(exports, null, 2));
}

export { buildProviderExports };
