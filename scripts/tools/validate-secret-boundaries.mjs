#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSimpleYaml, readJson, repoRoot } from './_shared.mjs';

const REQUIRED_POLICY_FILES = [
  'docs/secret-handling.md',
  'policies/secret-classes.yaml',
  'policies/tool-capabilities.yaml'
];

function normalize(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function loadPolicyYaml(root, relativePath) {
  return parseSimpleYaml(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function validateSecretTool(tool, policy, allowedSecretClasses, issues) {
  const name = tool.tool_name || tool.name || '<unnamed>';
  const requiredFields = Array.isArray(policy.required_fields) ? policy.required_fields : [];
  const defaults = policy.defaults || {};
  const enums = policy.enums || {};

  for (const field of requiredFields) {
    if (!(field in tool)) {
      issues.push(`Tool ${name} is missing required secret-boundary field ${field}.`);
    }
  }

  for (const field of requiredFields) {
    if (!(field in defaults)) {
      continue;
    }
    const defaultValue = defaults[field];
    const value = tool[field];
    if (Array.isArray(defaultValue) && !Array.isArray(value)) {
      issues.push(`Tool ${name} field ${field} must be an array.`);
    }
    if (typeof defaultValue === 'boolean' && typeof value !== 'boolean') {
      issues.push(`Tool ${name} field ${field} must be boolean.`);
    }
  }

  for (const [field, allowedValues] of Object.entries(enums)) {
    if (!(field in tool) || !Array.isArray(allowedValues) || allowedValues.length === 0) {
      continue;
    }
    if (!allowedValues.includes(tool[field])) {
      issues.push(`Tool ${name} field ${field} has invalid value ${tool[field]}.`);
    }
  }

  if (tool.raw_secret_exposure !== 'forbidden') {
    issues.push(`Tool ${name} must set raw_secret_exposure to forbidden.`);
  }
  if (tool.trace_redaction !== 'required') {
    issues.push(`Tool ${name} must require trace redaction.`);
  }
  if (tool.memory_persistence !== 'forbidden') {
    issues.push(`Tool ${name} must forbid memory persistence.`);
  }

  for (const secretClass of tool.secret_classes || []) {
    if (!allowedSecretClasses.has(secretClass)) {
      issues.push(`Tool ${name} uses unknown secret class ${secretClass}.`);
    }
  }

  if (tool.requires_secret === true) {
    if (!Array.isArray(tool.secret_classes) || tool.secret_classes.length === 0) {
      issues.push(`Tool ${name} requires secrets but does not declare secret_classes.`);
    }
    if (tool.credential_binding === 'not-applicable') {
      issues.push(`Tool ${name} requires secrets but uses credential_binding not-applicable.`);
    }
    if (tool.access_level === 'none') {
      issues.push(`Tool ${name} requires secrets but uses access_level none.`);
    }
    if (tool.fallback_context_policy === 'not-applicable') {
      issues.push(`Tool ${name} requires secrets but does not declare fallback_context_policy.`);
    }
    if (tool.model_visible !== false) {
      issues.push(`Tool ${name} requires secrets and must set model_visible to false.`);
    }
    if (!Array.isArray(tool.environment_scope) || tool.environment_scope.length === 0) {
      issues.push(`Tool ${name} requires secrets but does not declare environment_scope.`);
    }
  } else {
    if ((tool.secret_classes || []).length !== 0) {
      issues.push(`Tool ${name} does not require secrets and must keep secret_classes empty.`);
    }
    if ((tool.environment_scope || []).length !== 0) {
      issues.push(`Tool ${name} does not require secrets and must keep environment_scope empty.`);
    }
  }
}

function validateProviderSecurity(provider, issues) {
  const requiredFlags = [
    'raw_secret_prompting_forbidden',
    'server_bound_credentials_required',
    'provider_switch_requires_reminimization',
    'fallback_full_context_reuse_forbidden',
    'trace_redaction_required',
    'memory_secret_persistence_forbidden'
  ];

  if (!provider.security || typeof provider.security !== 'object') {
    issues.push(`Provider ${provider.name || '<unnamed>'} is missing security metadata.`);
    return;
  }

  for (const field of requiredFlags) {
    if (provider.security[field] !== true) {
      issues.push(`Provider ${provider.name || '<unnamed>'} must set security.${field} to true.`);
    }
  }
}

function validateSecretBoundaries(baseRoot = repoRoot()) {
  const root = baseRoot;
  const issues = [];

  for (const relativePath of REQUIRED_POLICY_FILES) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      issues.push(`Missing secret-boundary policy file: ${relativePath}`);
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      root: normalize(root),
      issueCount: issues.length,
      issues
    };
  }

  const secretClasses = loadPolicyYaml(root, 'policies/secret-classes.yaml');
  const toolCapabilities = loadPolicyYaml(root, 'policies/tool-capabilities.yaml');
  const toolCatalog = readJson(path.join(root, 'core', 'contracts', 'tool-contracts', 'catalog.json'));
  const providerCapabilities = readJson(path.join(root, 'core', 'contracts', 'provider-capabilities.json'));
  const allowedSecretClasses = new Set((secretClasses.classes || []).map((entry) => entry.id));

  for (const tool of toolCatalog.tools || []) {
    validateSecretTool(tool, toolCapabilities, allowedSecretClasses, issues);
  }

  for (const provider of providerCapabilities.providers || []) {
    validateProviderSecurity(provider, issues);
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
  const result = validateSecretBoundaries();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { validateSecretBoundaries };
