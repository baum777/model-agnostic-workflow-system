// MAWS vNext — S7 runtime instruction binding (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S7, spec sections 11.2/11.3; closes the OPEN obligation
// "Runtime bundle->fingerprint derivation" of the S7 run record).
//
// The effective instruction digest is DERIVED at runtime from the effective
// instruction bundle the run actually gets: the S6 assembler rebuilds the
// bundle from the live instruction tree, and the digest is recomputed from
// that bundle's own content and order. A caller-asserted digest never
// legitimizes a qualification — the declared value is recorded for
// traceability and is never used for a decision.
//
// Rules enforced here (all fail closed):
//   D1  the assembly inputs are mandatory; a run without an instruction
//       binding has no effective instruction state and binds no executor;
//   D2  the assembled bundle must be internally consistent: its declared
//       digest must equal the digest recomputed from its own fields;
//   D3  every selected source must still hash to the digest the bundle
//       binds — the derived digest describes the live tree, not a claim
//       about it (a receipt is not a verification);
//   D4  a qualification fingerprint must carry the component; the runtime
//       binds the DERIVED digest and recomputes the fingerprint digest, so
//       the fingerprint the eligibility gate consumes is derived, never
//       asserted.
//
// The binding grants nothing: it changes no qualification state, no
// permission, no authority and no approval. It only decides whether a
// qualification earned under one instruction state may be reused under
// another one.
import fs from 'node:fs';
import path from 'node:path';

import { FailClosedError, canonicalJson, sha256Hex } from '../vnext/util.mjs';
import { assembleInstructionBundle, computeEffectiveInstructionDigest } from '../context/instruction-bundle-assembler.mjs';
import { buildInstructionInventory } from '../instructions/instruction-inventory.mjs';

// The canonical form of the instruction-bundle digest (the S6 form).
export const INSTRUCTION_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function requireInputs(inputs) {
  if (inputs === null || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw new FailClosedError('INSTRUCTION_BINDING_MISSING', 'the instruction binding inputs must be an object');
  }
  for (const name of ['bundleId', 'taskRef', 'workflowClass', 'executorProfileRef', 'assemblyPolicyRef']) {
    if (!isNonEmptyString(inputs[name])) {
      throw new FailClosedError('INSTRUCTION_BINDING_MISSING', `the instruction binding requires ${name}; a run without assembly inputs has no effective instruction state`);
    }
  }
}

// contentRevision(root) -> a content-addressed source snapshot label.
//
// The S2 inventory binds a revision string to the source snapshot. A
// VCS revision cannot be derived inside the runtime without shelling out, and
// a caller-supplied label would be an unverifiable claim. The label is
// therefore derived from the CONTENT of the declared source set: it is
// reproducible from the tree alone and changes exactly when the instruction
// surface changes.
export function contentRevision(root) {
  const inventory = buildInstructionInventory({ root, revision: 'content-addressed' });
  const contentDigest = sha256Hex(canonicalJson(
    inventory.sources.map(({ path: sourcePath, role, authority_class, sha256 }) => ({ path: sourcePath, role, authority_class, sha256 }))
  ));
  return `content:${contentDigest}`;
}

// verifyBundleSourcesAgainstTree({ bundle, root }) -> the number of verified
// sources. Every selected source is re-read from the tree and compared to the
// digest the bundle binds. A source that no longer hashes to the bound
// digest means the bundle does not describe the live tree; the derived
// digest would then be a claim about a state that does not exist.
export function verifyBundleSourcesAgainstTree({ bundle, root }) {
  const resolvedRoot = path.resolve(root);
  let verified = 0;
  for (const source of bundle.selected_sources) {
    const absolute = path.resolve(resolvedRoot, source.ref);
    if (!absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new FailClosedError('INSTRUCTION_SOURCE_ESCAPES_ROOT', `the selected instruction source "${source.ref}" escapes the repository root`);
    }
    let content;
    try {
      content = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      throw new FailClosedError('INSTRUCTION_SOURCE_MISSING', `the selected instruction source "${source.ref}" is not readable in the live tree: ${error.message}`);
    }
    const digest = `sha256:${sha256Hex(content)}`;
    if (digest !== source.source_digest) {
      throw new FailClosedError(
        'INSTRUCTION_SOURCE_DIGEST_MISMATCH',
        `the selected instruction source "${source.ref}" digests to ${digest}, the bundle binds ${source.source_digest}`
      );
    }
    verified += 1;
  }
  return verified;
}

// deriveInstructionBinding({ root, bundleId, taskRef, workflowClass,
// selection, contextBindingRefs, requiredContextDigests, executorProfileRef,
// assemblyPolicyRef, revision? })
//   -> { digest, bundle, revision, inventory_digest, verified_source_count }.
//
// The bundle is assembled from the live tree by the S6 assembler; the digest
// is recomputed from the assembled bundle (D2) and every selected source is
// re-verified against the tree (D3). The returned digest is the only value
// that may enter a qualification fingerprint.
export function deriveInstructionBinding({
  root,
  bundleId,
  taskRef,
  workflowClass,
  selection = {},
  contextBindingRefs = [],
  requiredContextDigests = [],
  executorProfileRef,
  assemblyPolicyRef,
  revision = null
}) {
  requireInputs({ bundleId, taskRef, workflowClass, executorProfileRef, assemblyPolicyRef });
  const resolvedRoot = path.resolve(root);
  const resolvedRevision = isNonEmptyString(revision) ? revision : contentRevision(resolvedRoot);
  const assembled = assembleInstructionBundle({
    root: resolvedRoot,
    revision: resolvedRevision,
    taskRef,
    workflowClass,
    selection,
    contextBindingRefs,
    requiredContextDigests,
    executorProfileRef,
    assemblyPolicyRef,
    bundleId
  });
  const bundle = assembled.bundle;
  if (bundle.conflicts.length > 0) {
    throw new FailClosedError(
      'INSTRUCTION_BUNDLE_CONFLICT',
      `the effective instruction bundle carries ${bundle.conflicts.length} conflict(s): ${bundle.conflicts.map((conflict) => `${conflict.kind}:${conflict.ref}`).join(', ')}`
    );
  }
  const derived = computeEffectiveInstructionDigest(bundle);
  if (bundle.effective_instruction_digest !== derived) {
    throw new FailClosedError(
      'INSTRUCTION_BUNDLE_DIGEST_INCONSISTENT',
      'the assembled bundle declares a digest that does not match the digest recomputed from its own content and order'
    );
  }
  const verifiedSourceCount = verifyBundleSourcesAgainstTree({ bundle, root: resolvedRoot });
  return {
    digest: derived,
    bundle,
    revision: resolvedRevision,
    inventory_digest: assembled.inventory.digest,
    verified_source_count: verifiedSourceCount
  };
}

// bindFingerprintToInstructionDigest({ fingerprint, derivedDigest })
//   -> { fingerprint, declared_digest, derived_digest, digest_matches }.
//
// The returned fingerprint carries the DERIVED digest and a digest recomputed
// from its components. The caller's declared digest is returned for the
// traceability record only — it never enters the fingerprint and never
// influences a decision (D4).
export function bindFingerprintToInstructionDigest({ fingerprint, derivedDigest }) {
  if (fingerprint === null || typeof fingerprint !== 'object' || Array.isArray(fingerprint)) {
    throw new FailClosedError('FINGERPRINT_INVALID', 'a qualification fingerprint must be an object');
  }
  const components = fingerprint.components;
  if (components === null || typeof components !== 'object' || Array.isArray(components)) {
    throw new FailClosedError('FINGERPRINT_INVALID', 'a qualification fingerprint must carry a components object');
  }
  const declaredDigest = components.effective_instruction_digest;
  if (declaredDigest === undefined || declaredDigest === null) {
    throw new FailClosedError(
      'INSTRUCTION_DIGEST_MISSING',
      'the qualification fingerprint carries no effective_instruction_digest; a fingerprint without the instruction binding cannot be qualified'
    );
  }
  if (!INSTRUCTION_DIGEST_PATTERN.test(declaredDigest)) {
    throw new FailClosedError(
      'INSTRUCTION_DIGEST_INVALID',
      'the declared effective_instruction_digest is not a sha256:-prefixed 64-character lowercase hex digest'
    );
  }
  if (!INSTRUCTION_DIGEST_PATTERN.test(String(derivedDigest))) {
    throw new FailClosedError('INSTRUCTION_DIGEST_INVALID', 'the derived effective instruction digest is malformed');
  }
  const boundComponents = { ...components, effective_instruction_digest: derivedDigest };
  return {
    fingerprint: {
      ...fingerprint,
      components: boundComponents,
      digest: sha256Hex(canonicalJson(boundComponents))
    },
    declared_digest: declaredDigest,
    derived_digest: derivedDigest,
    digest_matches: declaredDigest === derivedDigest
  };
}

// bindFingerprintsToInstructionDigest({ fingerprints, derivedDigest })
//   -> { fingerprints, bindings }. Every fingerprint of the collection is
//   bound; a fingerprint that cannot be bound blocks the whole collection
//   (no partial qualification state).
export function bindFingerprintsToInstructionDigest({ fingerprints, derivedDigest }) {
  if (fingerprints === null || typeof fingerprints !== 'object' || Array.isArray(fingerprints)) {
    throw new FailClosedError('FINGERPRINT_INVALID', 'the fingerprint collection must be an object');
  }
  const bound = {};
  const bindings = {};
  for (const [executorId, fingerprint] of Object.entries(fingerprints)) {
    const binding = bindFingerprintToInstructionDigest({ fingerprint, derivedDigest });
    bound[executorId] = binding.fingerprint;
    bindings[executorId] = {
      declared_digest: binding.declared_digest,
      derived_digest: binding.derived_digest,
      digest_matches: binding.digest_matches
    };
  }
  return { fingerprints: bound, bindings };
}
