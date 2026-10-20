// MAWS vNext — S6 instruction bundle assembler (MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S6, spec sections 7.2-7.5).
//
// Assembles the Effective Instruction Bundle for one run: the ordered,
// digest-bound selection of instructions, skills, and references over the
// slice S2 instruction inventory, plus version-bound REFERENCES to the
// compiled context bindings owned by the coreos context compiler (spec 7.5:
// MAWS introduces no second context compiler and no second canonical context
// manifest — the bundle references the context binding, it never duplicates
// it).
//
// Loading model (spec 7.2) maps to assembly slots in canonical order:
//   core -> workflow_contract -> overlay -> skills -> references -> evidence
// Loading rules (spec 7.3): binding sources (canonical authority classes)
// are always included; overlays, skills, references, and evidence are
// selected by the caller's assembly policy; raw evidence stays addressable
// (references, never inlined).
//
// Conflicts are visible in the bundle and never silently resolved; a bundle
// with conflicts is not eligible for execution. The bundle is context and
// behavior input, never a permission token.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

import { buildInstructionInventory } from '../instructions/instruction-inventory.mjs';
import { FailClosedError } from '../vnext/util.mjs';

const ASSEMBLER_VERSION = 'instruction-bundle-assembler 1.0.0';
export const BUNDLE_SCHEMA_VERSION = '1.0.0';
const SLOT_ORDER = ['core', 'workflow_contract', 'overlay', 'skills', 'references', 'evidence'];
const SLOT_BY_ROLE = {
  root_governance: 'core',
  workflow_contract: 'workflow_contract',
  authority_hierarchy: 'core',
  authority_matrix: 'core',
  core_prompt_architecture: 'core'
};
const SLOT_BY_AUTHORITY_CLASS = {
  canonical: 'core',
  canonical_contract: 'workflow_contract'
};
const CONTEXT_COMPILER_CONTRACT_VERSION = '1.0.0';

export class AssemblyError extends FailClosedError {}

function sha256Hex(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveInside(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new AssemblyError('BUNDLE_REF_ESCAPES_ROOT', relativePath);
  }
  return resolved;
}

function assertContextBindingRef(ref, index) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
    throw new AssemblyError('CONTEXT_BINDING_INVALID', `context binding ref ${index} must be an object`);
  }
  if (ref.compiler !== 'coreos-context-compiler') {
    throw new AssemblyError('CONTEXT_BINDING_INVALID', `context binding ref ${index}: compiler must be coreos-context-compiler (no second compiler exists)`);
  }
  if (ref.contract_version !== CONTEXT_COMPILER_CONTRACT_VERSION) {
    throw new AssemblyError('CONTEXT_BINDING_INVALID', `context binding ref ${index}: unsupported contract_version ${ref.contract_version}`);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(ref.compilation_digest))) {
    throw new AssemblyError('CONTEXT_BINDING_INVALID', `context binding ref ${index}: compilation_digest must be a sha256 digest`);
  }
}

/**
 * Assemble one instruction bundle.
 *
 * @param {object} options
 * @param {string} options.root - repository root whose instruction tree is assembled
 * @param {string} options.revision - revision binding for the source snapshot
 * @param {string} options.taskRef
 * @param {string} options.workflowClass
 * @param {object} [options.selection] - policy-driven selective resolution
 * @param {string[]} [options.selection.overlayRefs]
 * @param {string[]} [options.selection.skillRefs]
 * @param {string[]} [options.selection.referenceRefs]
 * @param {string[]} [options.selection.evidenceRefs]
 * @param {object[]} [options.contextBindingRefs] - references to coreos context compilations
 * @param {string[]} [options.requiredContextDigests] - compilation digests the task requires; a missing one blocks
 * @param {string} options.executorProfileRef
 * @param {string} options.assemblyPolicyRef
 * @param {string} options.bundleId
 * @returns {{bundle: object, excluded_source_count: number, selected_source_count: number, inventory: object}}
 */
export function assembleInstructionBundle(options) {
  const {
    root,
    revision,
    taskRef,
    workflowClass,
    selection = {},
    contextBindingRefs = [],
    requiredContextDigests = [],
    executorProfileRef,
    assemblyPolicyRef,
    bundleId
  } = options;
  if (!/^bundle_[a-z0-9_]+$/.test(String(bundleId))) {
    throw new AssemblyError('BUNDLE_ID_INVALID', 'bundleId must match bundle_*');
  }
  for (const [name, value] of [['taskRef', taskRef], ['workflowClass', workflowClass], ['executorProfileRef', executorProfileRef], ['assemblyPolicyRef', assemblyPolicyRef]]) {
    if (typeof value !== 'string' || value.length < 1) {
      throw new AssemblyError('ASSEMBLY_INPUT_INVALID', `${name} is required`);
    }
  }
  const inventory = buildInstructionInventory({ root, revision });

  const conflicts = [];
  let conflictSeq = 0;
  const conflict = (kind, ref, message) => {
    conflictSeq += 1;
    conflicts.push({ conflict_id: `conflict_${String(conflictSeq).padStart(3, '0')}`, kind, ref, message });
  };

  // Always-on binding core: every inventory source with a canonical authority
  // class is part of every bundle (loading rules 1 and 7 - context reduction
  // never removes binding rules).
  const selected = new Map();
  for (const source of inventory.sources) {
    const slot = SLOT_BY_AUTHORITY_CLASS[source.authority_class] || SLOT_BY_ROLE[source.role];
    if (!slot) {
      continue;
    }
    selected.set(source.path, {
      ref: source.path,
      binding_class: source.authority_class,
      assembly_slot: slot,
      source_digest: `sha256:${source.sha256}`
    });
  }

  const selectOptional = (slot, refs) => {
    for (const ref of refs || []) {
      if (selected.has(ref)) {
        continue;
      }
      const abs = resolveInside(root, ref);
      let content;
      try {
        content = fs.readFileSync(abs, 'utf8');
      } catch {
        conflict('missing_source', ref, 'selected source is not readable under the repository root');
        continue;
      }
      selected.set(ref, {
        ref,
        binding_class: 'workspace_selected',
        assembly_slot: slot,
        source_digest: sha256Hex(content)
      });
    }
  };
  selectOptional('overlay', selection.overlayRefs);
  selectOptional('skills', selection.skillRefs);
  selectOptional('references', selection.referenceRefs);
  selectOptional('evidence', selection.evidenceRefs);

  // Context bindings are references, never payloads (spec 7.5).
  const contextRefs = contextBindingRefs.map((ref, index) => {
    assertContextBindingRef(ref, index);
    return { ...ref };
  });
  const presentDigests = new Set(contextRefs.map((ref) => ref.compilation_digest));
  for (const required of requiredContextDigests) {
    if (!presentDigests.has(required)) {
      conflict('missing_required_context', required, 'the task requires this compiled context source; the execution blocks instead of proceeding with a narrower bundle');
    }
  }

  // Canonical order: slot order per spec 7.2, then ref.
  const orderedSources = [...selected.values()].sort((a, b) => {
    const slotDelta = SLOT_ORDER.indexOf(a.assembly_slot) - SLOT_ORDER.indexOf(b.assembly_slot);
    return slotDelta !== 0 ? slotDelta : a.ref.localeCompare(b.ref);
  });

  const instructionClasses = {};
  for (const slot of SLOT_ORDER) {
    instructionClasses[slot] = 0;
  }
  for (const source of orderedSources) {
    instructionClasses[source.assembly_slot] += 1;
  }

  const effectiveInstructionDigest = sha256Hex(
    canonicalJson({
      task_ref: taskRef,
      workflow_class: workflowClass,
      selected_sources: orderedSources.map(({ ref, binding_class, assembly_slot, source_digest }) => ({ ref, binding_class, assembly_slot, source_digest })),
      context_binding_refs: contextRefs,
      executor_profile_ref: executorProfileRef,
      assembly_policy_ref: assemblyPolicyRef
    })
  );

  const bundle = {
    schema_version: BUNDLE_SCHEMA_VERSION,
    bundle_id: bundleId,
    created_at: new Date().toISOString(),
    task_ref: taskRef,
    workflow_class: workflowClass,
    instruction_classes: instructionClasses,
    selected_sources: orderedSources,
    context_binding_refs: contextRefs,
    executor_profile_ref: executorProfileRef,
    assembly_policy_ref: assemblyPolicyRef,
    conflicts,
    eligible_for_execution: conflicts.length === 0,
    effective_instruction_digest: effectiveInstructionDigest,
    provenance: {
      assembled_at: new Date().toISOString(),
      assembler_version: ASSEMBLER_VERSION,
      source_snapshot_ref: `instruction-inventory ${inventory.digest} at revision ${revision}`
    }
  };

  return {
    bundle,
    excluded_source_count: inventory.source_count - selected.size,
    selected_source_count: orderedSources.length,
    inventory
  };
}

/**
 * Recompute the effective instruction digest from a bundle's own fields.
 * The digest binds the used contents (via their digests) and the defined
 * order, so any edit to content, selection, or order changes it.
 */
export function computeEffectiveInstructionDigest(bundle) {
  return sha256Hex(
    canonicalJson({
      task_ref: bundle.task_ref,
      workflow_class: bundle.workflow_class,
      selected_sources: bundle.selected_sources,
      context_binding_refs: bundle.context_binding_refs,
      executor_profile_ref: bundle.executor_profile_ref,
      assembly_policy_ref: bundle.assembly_policy_ref
    })
  );
}
