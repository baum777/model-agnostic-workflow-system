// MAWS vNext — S11 harness context separation (spec
// MAWS-SII-TARGET-SPEC-001 v0.2.0, section 4.3). The harness context
// (development_harness | unitera_product) is a routing and binding dimension,
// never an authority source. Pure, fail closed on ambiguity: a run whose
// context binding is missing or contradictory binds no executor, and no
// default-context fallback exists.
//
// Rules enforced here:
//   R1  closed vocabulary; authority_grant is none by construction.
//   R2  a development-harness run derives no product-runtime authority
//       (no authority surface on dev records; product-authority surface
//       references under a dev context fail closed).
//   R3  a context switch is a bound plan change with its own evidence
//       (graph supersession context_change carries evidence_ref).
//   R4  qualification-vs-context coupling at the binding-scope comparison
//       level: a qualification fingerprint whose runtime_harness declares a
//       different (or no) harness context is not usable under the bound
//       context. The fingerprint component amendment itself is S7.
//   R5  product records reference the unitera-os authority surface
//       (reference-only versioned pin); they never substitute execution
//       control, and this module never caches or mints authority.
//   R6  missing/contradictory context binding -> typed FailClosedError,
//       never a fallback.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FailClosedError, nowIso } from '../vnext/util.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const HARNESS_CONTEXT_CONTRACT = 'core/contracts/harness-context.schema.json';

// Closed vocabulary (R1). Adding a value is a contract version change, not a
// runtime option.
export const HARNESS_CONTEXT_VALUES = Object.freeze(['development_harness', 'unitera_product']);

// Reference namespace that identifies product-runtime authority surfaces
// (R2). Authority source refs under this prefix are product authority
// claims; they are illegal in a development-harness-bound run.
export const PRODUCT_AUTHORITY_REF_PREFIX = 'unitera-os/';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

function failClosed(code, message) {
  throw new FailClosedError(code, message);
}

// validateHarnessContextRecord(record, root) -> the record, after schema
// validation plus the semantic invariants the schema engine cannot express
// on its own here (defense in depth: vocabulary, authority_grant, and the
// context/authority_surface coupling are also encoded in the schema; this
// function is the runtime-side fail-closed gate).
export function validateHarnessContextRecord(record, root) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    failClosed('CONTEXT_BINDING_MISSING', 'harness context record must be an object');
  }
  // Semantic invariants first so each rule keeps its precise fail-closed
  // code; the schema validation below remains the structural gate.
  if (!HARNESS_CONTEXT_VALUES.includes(record.context)) {
    failClosed('CONTEXT_VOCABULARY_UNKNOWN', `unknown harness context "${record.context}"; allowed: ${HARNESS_CONTEXT_VALUES.join(', ')}`);
  }
  if (record.authority_grant !== 'none') {
    failClosed('CONTEXT_BINDING_CONFLICT', 'harness context records never grant authority (authority_grant must be "none")');
  }
  if (record.context === 'development_harness' && record.authority_surface !== undefined) {
    failClosed(
      'PRODUCT_AUTHORITY_FROM_DEV_CONTEXT',
      'a development-harness context record must not carry a product authority surface'
    );
  }
  if (record.context === 'unitera_product' && !record.authority_surface) {
    failClosed('CONTEXT_BINDING_CONFLICT', 'a unitera_product context record must reference the unitera-os authority surface');
  }
  const issues = validateInstanceAgainstContract(record, HARNESS_CONTEXT_CONTRACT, root);
  if (issues.length > 0) {
    failClosed('CONTEXT_BINDING_CONFLICT', `harness context record violates contract: ${issues.join('; ')}`);
  }
  return record;
}

// resolveHarnessContext({ contextRef, records, root }) -> the validated
// record for contextRef. `records` is an array of records or a map keyed by
// context_id. Missing references fail closed (R6).
export function resolveHarnessContext({ contextRef, records, root }) {
  if (!isNonEmptyString(contextRef)) {
    failClosed('CONTEXT_BINDING_MISSING', 'context reference is missing');
  }
  let match = null;
  if (Array.isArray(records)) {
    match = records.find((record) => record && record.context_id === contextRef) || null;
  } else if (records !== null && typeof records === 'object') {
    const entry = records[contextRef];
    // A map entry only resolves the requested reference when it IS that
    // record: a key containing a different context_id does not resolve.
    match = entry !== null && typeof entry === 'object' && entry.context_id === contextRef ? entry : null;
  } else {
    failClosed('CONTEXT_BINDING_MISSING', 'no harness context records available for resolution');
  }
  if (!match) {
    failClosed('CONTEXT_BINDING_MISSING', `no harness context record resolves "${contextRef}"`);
  }
  return validateHarnessContextRecord(match, root);
}

// contextOfRuntimeHarness(runtimeHarness) -> the harness context declared by
// a qualification fingerprint's runtime_harness component, or null when the
// value declares no context (R4 convention: "<context>[/<detail>]"). Pure
// string inspection, no authority semantics.
export function contextOfRuntimeHarness(runtimeHarness) {
  if (!isNonEmptyString(runtimeHarness)) {
    return null;
  }
  for (const context of HARNESS_CONTEXT_VALUES) {
    if (runtimeHarness === context || runtimeHarness.startsWith(`${context}/`)) {
      return context;
    }
  }
  return null;
}

// assertQualificationContextBinding({ runtimeHarness, context }) -> R4 at
// the binding-scope comparison level. A qualification earned under one
// context is not automatically valid in the other; a fingerprint that
// declares no context is ambiguous and therefore unroutable under S11.
export function assertQualificationContextBinding({ runtimeHarness, context }) {
  if (!HARNESS_CONTEXT_VALUES.includes(context)) {
    failClosed('CONTEXT_VOCABULARY_UNKNOWN', `unknown harness context "${String(context)}"`);
  }
  const declared = contextOfRuntimeHarness(runtimeHarness);
  if (declared === null) {
    failClosed(
      'CONTEXT_BINDING_CONFLICT',
      `qualification fingerprint runtime_harness "${String(runtimeHarness)}" declares no harness context; requalification under "${context}" is required before binding`
    );
  }
  if (declared !== context) {
    failClosed(
      'CONTEXT_BINDING_CONFLICT',
      `qualification was earned under "${declared}" and is not valid under bound context "${context}"; requalification is required (no cross-context qualification transfer)`
    );
  }
}

// assertWorkUnitContextBinding({ workUnit, context }) -> the WorkUnit's
// harness_context_ref must exist and identify the bound record (R6; the
// strict "all new WorkUnits" form of the S11 decision: the binding gate is
// the single fail-closed choke point for created WorkUnits).
export function assertWorkUnitContextBinding({ workUnit, context }) {
  if (!workUnit || typeof workUnit !== 'object') {
    failClosed('CONTEXT_BINDING_MISSING', 'work unit is required for context binding');
  }
  if (!isNonEmptyString(workUnit.harness_context_ref)) {
    failClosed('CONTEXT_BINDING_MISSING', `work unit ${workUnit.work_unit_id} carries no harness_context_ref; it cannot bind an executor`);
  }
  if (workUnit.harness_context_ref !== context.context_id) {
    failClosed(
      'CONTEXT_BINDING_CONFLICT',
      `work unit ${workUnit.work_unit_id} references context "${workUnit.harness_context_ref}" but the run is bound to "${context.context_id}"`
    );
  }
}

// assertNoProductAuthorityFromDevContext({ context, authoritySourceRefs })
// -> R2: a development-harness-bound run must not present product-runtime
// authority claims. Product authority surface references (refs under
// PRODUCT_AUTHORITY_REF_PREFIX) fail closed.
export function assertNoProductAuthorityFromDevContext({ context, authoritySourceRefs }) {
  if (context.context !== 'development_harness') {
    return;
  }
  const refs = Array.isArray(authoritySourceRefs) ? authoritySourceRefs : [];
  for (const ref of refs) {
    if (isNonEmptyString(ref) && ref.startsWith(PRODUCT_AUTHORITY_REF_PREFIX)) {
      failClosed(
        'PRODUCT_AUTHORITY_FROM_DEV_CONTEXT',
        `development-harness run claims product-runtime authority via "${ref}"; development runs derive no product authority`
      );
    }
  }
}

// developmentProbeHarnessContext({ runRef, contextId? }) -> the canonical
// development-harness record for in-process MAWS probes (auth health check,
// live activation, recorded eval transcripts). Development probes never
// carry a product authority surface (R2) and never grant authority (R1).
export function developmentProbeHarnessContext({ runRef, contextId = 'hctx_dev_probe_0001' }) {
  return {
    context_id: contextId,
    context: 'development_harness',
    run_ref: isNonEmptyString(runRef) ? runRef : 'maws_dev_probe',
    authority_grant: 'none',
    created_at: nowIso()
  };
}

// Repository root for full-record schema validation at the executor gate
// (the gate must guarantee a CANONICAL record, not a semantic subset).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// assertInvocationHarnessContext(record) -> the executor-side invocation
// gate (R1/R2/R6). Runs the FULL record validation (schema + semantic), so a
// partial or unpinned record never reaches an executor. Executor-base
// refuses any invocation whose context binding is absent or contradictory;
// there is no fallback context.
export function assertInvocationHarnessContext(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    failClosed('CONTEXT_BINDING_MISSING', 'invocation carries no harness context; an unbound context never reaches an executor');
  }
  return validateHarnessContextRecord(record, REPO_ROOT);
}

// assertSupersessionContextChange({ previousPair, nextPair, contextChange })
// -> R3 at PAIR level (context value + context record reference). A
// transition across graph versions -- a context value change OR a
// reference-only re-anchoring -- is legal only as an explicit,
// evidence-backed context_change record; anything else fails closed.
// previousPair/nextPair are "context|ref" strings; contextChange is the
// supersession context_change record (or null/undefined).
export function assertSupersessionContextChange({ previousPair, nextPair, contextChange }) {
  const [previousContext] = String(previousPair).split('|');
  const [nextContext] = String(nextPair).split('|');
  if (!HARNESS_CONTEXT_VALUES.includes(previousContext) || !HARNESS_CONTEXT_VALUES.includes(nextContext)) {
    failClosed('CONTEXT_VOCABULARY_UNKNOWN', 'supersession comparison requires declared harness contexts on both graph versions');
  }
  if (String(previousPair) === String(nextPair)) {
    if (contextChange !== undefined && contextChange !== null) {
      failClosed('CONTEXT_BINDING_CONFLICT', 'supersession declares a context change but both graph versions bind the identical context pair');
    }
    return;
  }
  if (!contextChange || typeof contextChange !== 'object') {
    failClosed(
      'CONTEXT_SWITCH_UNEVIDENCED',
      `context binding changed from "${previousPair}" to "${nextPair}" without a supersession context_change record; a context switch is a bound plan change with its own evidence, not an implicit fallback`
    );
  }
  if (contextChange.from_context !== previousContext || contextChange.to_context !== nextContext) {
    failClosed('CONTEXT_BINDING_CONFLICT', 'supersession context_change endpoints do not match the actual context transition');
  }
  if (!isNonEmptyString(contextChange.evidence_ref)) {
    failClosed('CONTEXT_SWITCH_UNEVIDENCED', 'supersession context_change carries no evidence_ref');
  }
}
