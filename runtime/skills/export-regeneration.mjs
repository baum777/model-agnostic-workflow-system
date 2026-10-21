// MAWS vNext — canonical export regeneration (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S8, spec section 13.4 and the S8 slice item "Registry-/
// Provider-Exports regenerieren").
//
// A canonical adoption changes the canonical tree. The registry and the
// provider exports are PROJECTIONS of that tree, so an adoption that does
// not regenerate them leaves the canonical tree inconsistent: the adopted
// skill is in the tree and absent from every export.
//
// Rules enforced here (all fail closed):
//   E1  the registry and every provider export are regenerated from the
//       canonical tree itself (the canonical generators, no second
//       implementation);
//   E2  every written export is read back and its digest compared with the
//       digest of the content that was written (a receipt is not a
//       verification);
//   E3  the regenerated registry must actually contain the adopted skill —
//       an export that does not reflect the adoption is an incomplete
//       regeneration;
//   E4  the regeneration is bound to the adoption: the record names the
//       adoption digest, the generator version and the digest of every
//       written export.
//
// The regeneration grants nothing and activates nothing: it rewrites
// projections of a tree that was already changed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { buildNeutralCoreRegistry } from '../../scripts/tools/build-neutral-core-registry.mjs';
import { buildProviderExports } from '../../scripts/tools/build-provider-exports.mjs';
import { assertCanonicalTarget, CanonicalPathError } from './canonical-path.mjs';

export const EXPORT_REGENERATION_VERSION = 'canonical-export-regeneration 1.0.0';
export const REGISTRY_EXPORT_TARGETS = [
  'core/contracts/core-registry.json',
  'contracts/core-registry.json'
];

export class ExportRegenerationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExportRegenerationError';
    this.code = code;
  }
}

function exportError(code, message) {
  throw new ExportRegenerationError(code, message);
}

function digestOf(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

// exportPlan({ canonicalRoot }) -> [{ ref, content }] — the exact bytes that
// every export surface must carry after the regeneration. The plan is
// computed before anything is written, so a failing generator leaves the
// tree untouched.
export function exportPlan({ canonicalRoot }) {
  let registry;
  try {
    registry = buildNeutralCoreRegistry(canonicalRoot);
  } catch (error) {
    exportError('EXPORT_REGENERATION_FAILED', `the neutral core registry could not be built from the canonical tree: ${error.message}`);
  }
  const plan = [];
  const registryContent = `${JSON.stringify(registry, null, 2)}\n`;
  for (const target of REGISTRY_EXPORT_TARGETS) {
    plan.push({ ref: target, content: registryContent, kind: 'registry' });
  }

  let providerExports;
  try {
    providerExports = buildProviderExports(canonicalRoot, { allProviders: true });
  } catch (error) {
    exportError('EXPORT_REGENERATION_FAILED', `the provider exports could not be built from the canonical tree: ${error.message}`);
  }
  for (const providerExport of providerExports) {
    const content = `${JSON.stringify(providerExport.export, null, 2)}\n`;
    for (const target of providerExport.writeTargets) {
      plan.push({ ref: target, content, kind: 'provider_export', provider: providerExport.provider });
    }
  }
  if (plan.length === 0) {
    exportError('EXPORT_REGENERATION_INCOMPLETE', 'the canonical export regeneration produced no export surface at all');
  }
  return { plan, registry };
}

// snapshotExports({ canonicalRoot, plan }) -> the prior state of every export
// surface, so a failed regeneration leaves no mutation behind. The state is
// read with lstat: a symlinked surface is restored AS the symlink it was,
// never silently replaced by the file it pointed at.
export function snapshotExports({ canonicalRoot, plan }) {
  const snapshot = new Map();
  for (const entry of plan) {
    const absolute = path.join(canonicalRoot, entry.ref);
    let state = null;
    try {
      const stats = fs.lstatSync(absolute);
      if (stats.isSymbolicLink()) {
        state = { kind: 'symlink', target: fs.readlinkSync(absolute) };
      } else if (stats.isDirectory()) {
        state = { kind: 'directory' };
      } else {
        state = { kind: 'file', content: fs.readFileSync(absolute, 'utf8') };
      }
    } catch {
      state = null;
    }
    snapshot.set(entry.ref, state);
  }
  return snapshot;
}

// restoreExports({ canonicalRoot, snapshot }) -> string[] of the surfaces
// that could NOT be restored. Every surface is restored independently and a
// failing restore never aborts the remaining restores: a failed rollback is
// reported, never silently swallowed.
export function restoreExports({ canonicalRoot, snapshot }) {
  const failures = [];
  for (const [ref, state] of snapshot.entries()) {
    const absolute = path.join(canonicalRoot, ref);
    try {
      // The restore is a write path too: it may only touch surfaces inside
      // the canonical tree. A surface that WAS a symlink is recreated as the
      // symlink it was (the link is never written through).
      const recreatesLink = state === null || state.kind === 'symlink';
      try {
        assertCanonicalTarget({
          root: canonicalRoot,
          absolutePath: absolute,
          label: `export surface ${ref}`,
          allowSymlinkTarget: recreatesLink
        });
      } catch (error) {
        if (error instanceof CanonicalPathError) {
          // The path is not inside the canonical tree, so the regeneration
          // never wrote it and there is nothing to restore there. This is
          // NOT a failed rollback: the refusal is the correct behaviour.
          continue;
        }
        throw error;
      }
      if (state === null) {
        fs.rmSync(absolute, { force: true });
        continue;
      }
      if (state.kind === 'directory') {
        // The surface was a directory before the promotion: the
        // regeneration never wrote it, so the rollback leaves it alone.
        continue;
      }
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      if (state.kind === 'symlink') {
        fs.rmSync(absolute, { force: true });
        fs.symlinkSync(state.target, absolute);
        continue;
      }
      fs.writeFileSync(absolute, state.content);
    } catch (error) {
      failures.push(`the export surface ${ref} could not be restored: ${error.message}`);
    }
  }
  return failures;
}

// assertRegistryReflectsAdoption({ registry, adoptedSkillId }) -> void.
// The regenerated registry must carry the adopted skill; an export that does
// not reflect the adoption is an incomplete regeneration (E3).
export function assertRegistryReflectsAdoption({ registry, adoptedSkillId }) {
  const expectedSourcePath = `skills/${adoptedSkillId}/SKILL.md`;
  const present = (registry?.skills || []).some((skill) => skill?.sourcePath === expectedSourcePath);
  if (!present) {
    exportError(
      'EXPORT_REGENERATION_INCOMPLETE',
      `the regenerated registry does not contain the adopted skill (${expectedSourcePath}); the export regeneration is incomplete`
    );
  }
}

// regenerateCanonicalExports({ canonicalRoot, adoptedSkillId, adoptionDigest,
// now }) -> the export regeneration state that goes into the adoption record.
// Every written surface is read back and its digest compared with the digest
// of the content that was written.
export function regenerateCanonicalExports({ canonicalRoot, adoptedSkillId = null, adoptionDigest = null, now = () => new Date().toISOString(), planned = null, onWritten = null }) {
  const { plan, registry } = planned ?? exportPlan({ canonicalRoot });
  if (adoptedSkillId) {
    assertRegistryReflectsAdoption({ registry, adoptedSkillId });
  }
  const written = [];
  for (const entry of plan) {
    const absolute = path.join(canonicalRoot, entry.ref);
    // An export surface is a regular file INSIDE the canonical tree: no
    // symlinked file, no symlinked parent directory. Writing through either
    // would mutate a file outside the canonical root, and the rollback could
    // not restore it.
    try {
      assertCanonicalTarget({ root: canonicalRoot, absolutePath: absolute, label: `export surface ${entry.ref}` });
    } catch (error) {
      if (error instanceof CanonicalPathError) {
        exportError('EXPORT_SURFACE_NOT_A_FILE', error.message);
      }
      throw error;
    }
    try {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, entry.content);
    } catch (error) {
      exportError('EXPORT_REGENERATION_FAILED', `the export surface ${entry.ref} could not be written: ${error.message}`);
    }
    written.push({ ref: entry.ref, kind: entry.kind, provider: entry.provider ?? null, expected_digest: digestOf(entry.content) });
  }
  // The readback is the verification of the write. `onWritten` is a
  // documented test seam invoked between the write and the readback: the
  // readback failure path has to be bound by a test, not by the assumption
  // that a written file stays as it was written.
  if (typeof onWritten === 'function') {
    onWritten({ written: written.map((entry) => ({ ...entry })) });
  }
  // E2: read back every written surface and compare the digest.
  for (const entry of written) {
    const absolute = path.join(canonicalRoot, entry.ref);
    let content;
    try {
      content = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      exportError('EXPORT_REGENERATION_INCOMPLETE', `the regenerated export ${entry.ref} is not readable after the write: ${error.message}`);
    }
    const actual = digestOf(content);
    if (actual !== entry.expected_digest) {
      exportError('EXPORT_REGENERATION_INCOMPLETE', `the regenerated export ${entry.ref} digests to ${actual}, the written content digests to ${entry.expected_digest}`);
    }
    entry.digest = actual;
    entry.bytes = Buffer.byteLength(content, 'utf8');
  }
  return {
    performed: true,
    generator_version: EXPORT_REGENERATION_VERSION,
    registry_version: registry?.schemaVersion ?? null,
    adoption_digest: adoptionDigest,
    export_digests: written.map((entry) => ({ ref: entry.ref, digest: entry.digest, bytes: entry.bytes })),
    regenerated_at: now(),
    readback_verified: true
  };
}
