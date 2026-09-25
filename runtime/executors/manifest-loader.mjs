// MAWS vNext — Executor manifest loader (MAWS-VN-400).
//
// Loads an ExecutorRegistry JSON document, validates it against
// core/contracts/executor-registry.schema.json and every contained manifest
// against core/contracts/executor-manifest.schema.json, and rejects duplicate
// executor_ids. Fail closed on any problem: a registry that cannot be
// proven valid is not loadable (OD-09: DECLARED != QUALIFIED — loading a
// declaration never implies qualification or authority).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { FailClosedError } from '../vnext/util.mjs';

const REGISTRY_CONTRACT = 'core/contracts/executor-registry.schema.json';
const MANIFEST_CONTRACT = 'core/contracts/executor-manifest.schema.json';

function defaultRepoRoot() {
  // <root>/runtime/executors/manifest-loader.mjs -> <root> (worktree root)
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function defaultRegistryPath() {
  return path.join(defaultRepoRoot(), 'runtime', 'executors', 'registry.default.json');
}

function schemaIssuesToText(issues) {
  return issues.length > 0 ? `: ${issues.join('; ')}` : '';
}

/**
 * Load and validate an executor registry file.
 *
 * @param {string} [filePath] - registry JSON path (default: runtime/executors/registry.default.json)
 * @param {string} [root]     - worktree root used to resolve core/contracts (default: this repo root)
 * @returns {{ registry_id: string, version?: string, executors: object[] }}
 * @throws {FailClosedError} EXECUTOR_REGISTRY_UNREADABLE | EXECUTOR_REGISTRY_INVALID |
 *                           EXECUTOR_REGISTRY_SCHEMA_INVALID | EXECUTOR_DUPLICATE
 */
export function loadExecutorRegistry(filePath = defaultRegistryPath(), root = defaultRepoRoot()) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new FailClosedError('EXECUTOR_REGISTRY_UNREADABLE', `cannot read executor registry ${filePath}: ${error.message}`);
  }

  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (error) {
    throw new FailClosedError('EXECUTOR_REGISTRY_INVALID', `executor registry ${filePath} is not valid JSON: ${error.message}`);
  }

  const registryIssues = validateInstanceAgainstContract(registry, REGISTRY_CONTRACT, root);
  if (registryIssues.length > 0) {
    throw new FailClosedError(
      'EXECUTOR_REGISTRY_SCHEMA_INVALID',
      `executor registry ${filePath} violates ${REGISTRY_CONTRACT}${schemaIssuesToText(registryIssues)}`
    );
  }

  const seenExecutorIds = new Set();
  for (const [index, manifest] of registry.executors.entries()) {
    const manifestIssues = validateInstanceAgainstContract(manifest, MANIFEST_CONTRACT, root);
    if (manifestIssues.length > 0) {
      throw new FailClosedError(
        'EXECUTOR_REGISTRY_SCHEMA_INVALID',
        `executor manifest [${index}] ${manifest.executor_id ?? '<unknown>'} violates ${MANIFEST_CONTRACT}${schemaIssuesToText(manifestIssues)}`
      );
    }
    if (seenExecutorIds.has(manifest.executor_id)) {
      throw new FailClosedError(
        'EXECUTOR_DUPLICATE',
        `executor registry ${filePath} declares duplicate executor_id ${manifest.executor_id}`
      );
    }
    seenExecutorIds.add(manifest.executor_id);
  }

  return registry;
}
