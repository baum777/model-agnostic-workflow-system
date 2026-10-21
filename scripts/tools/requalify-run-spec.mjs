#!/usr/bin/env node
// Re-qualification binding for a runtime run spec (spec
// MAWS-SII-TARGET-SPEC-001 v0.2.0, slice S7).
//
// A qualification is earned against ONE instruction state. When the
// instruction surface changes materially, the qualification snapshots of a run
// spec no longer describe the state in effect and the run is blocked with a
// material fingerprint drift. This tool re-binds the snapshots of a spec to
// the instruction state currently in effect.
//
// It is a CALCULATOR, not an authority: it grants no capability, qualifies no
// model or executor, changes no permission and activates nothing. The
// qualification decision itself stays with the qualification authority; this
// tool only recomputes the instruction-digest binding of the qualification
// snapshots and the fingerprint digests that follow from it. The result is a
// reviewed change, like every other change to a committed spec.
//
// Usage:
//   node scripts/tools/requalify-run-spec.mjs --spec <run-spec.json>            dry run
//   node scripts/tools/requalify-run-spec.mjs --spec <run-spec.json> --write    apply
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { deriveInstructionBinding } from '../../runtime/qualification/instruction-binding.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function fingerprintDigest(components) {
  return crypto.createHash('sha256').update(canonicalJson(components)).digest('hex');
}

export function requalifySpec(spec) {
  const binding = spec?.instruction_binding;
  if (binding === undefined || binding === null) {
    throw new Error('the run spec carries no instruction_binding; there is no instruction state to re-bind');
  }
  const derived = deriveInstructionBinding({
    root: REPO_ROOT,
    bundleId: binding.bundle_id,
    taskRef: binding.task_ref,
    workflowClass: binding.workflow_class,
    selection: binding.selection || {},
    contextBindingRefs: binding.context_binding_refs || [],
    requiredContextDigests: binding.required_context_digests || [],
    executorProfileRef: binding.executor_profile_ref,
    assemblyPolicyRef: binding.assembly_policy_ref
  });

  const changed = [];
  const next = JSON.parse(JSON.stringify(spec));
  for (const [collectionName, collection] of [['fingerprints', next.fingerprints], ['qualified_fingerprints', next.qualified_fingerprints]]) {
    for (const [key, fingerprint] of Object.entries(collection || {})) {
      const previous = fingerprint?.components?.effective_instruction_digest;
      fingerprint.components.effective_instruction_digest = derived.digest;
      fingerprint.digest = fingerprintDigest(fingerprint.components);
      changed.push({ collection: collectionName, key, previous_digest: previous ?? null, derived_digest: derived.digest });
    }
  }
  return { spec: next, derived, changed };
}

export function runCli(args) {
  const specIndex = args.indexOf('--spec');
  if (specIndex === -1 || !args[specIndex + 1]) {
    console.error('usage: requalify-run-spec.mjs --spec <run-spec.json> [--write]');
    return { ok: false, issues: ['no --spec given'] };
  }
  const specPath = path.resolve(args[specIndex + 1]);
  const write = args.includes('--write');
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (error) {
    return { ok: false, issues: [`the run spec is not readable JSON: ${error.message}`] };
  }
  let result;
  try {
    result = requalifySpec(spec);
  } catch (error) {
    return { ok: false, issues: [`${error?.code || 'REQUALIFICATION_FAILED'}: ${error.message}`] };
  }
  if (write) {
    fs.writeFileSync(specPath, `${JSON.stringify(result.spec, null, 2)}\n`);
  }
  return {
    ok: true,
    written: write,
    spec: specPath,
    derived_effective_instruction_digest: result.derived.digest,
    source_revision: result.derived.revision,
    bindings: result.changed
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
