// MAWS vNext — S9 controlled rollback (MAWS-SII-TARGET-SPEC-001 v0.2.0, slice
// S9 "Regression and Rollback").
//
// THE DOOD THIS IMPLEMENTS
// "Fehlgeschlagene Verbesserungen können ohne Verlust der Ausführungshistorie
// zurückgenommen werden" — a failed improvement can be taken back without
// losing the execution history. Both halves of that sentence are load
// bearing, and this module is built so that neither can be skipped.
//
// WHAT THIS MODULE PRODUCES: A PLAN, NOT AN EXECUTION
// The module computes the controlled rollback PLAN of a failed candidate: the
// restore target, the proof that the restored state is the qualified state,
// and the proof that the execution history is intact. It performs no
// restoration and writes nothing. Its verdict is therefore ROLLBACK_PLANNED,
// never ROLLED_BACK: a plan is not an apply (repository AGENTS.md), and a
// record that claimed a rollback had happened while nothing was restored
// would be a false execution claim. The restoration itself belongs to the
// owner-governed promotion path, and a record of a PERFORMED restore with its
// post-write readback is a separate contract, not this one.
//
// WHY THE ROLLBACK IS CONTROLLED
// The restore target is DERIVED, not chosen. The module plans the restore of
// the LAST QUALIFIED revision of the subject — the newest revision whose
// qualification is QUALIFIED and carries its own evidence. A caller that
// asks for an older, unqualified or arbitrary revision is refused, because
// "roll back to something else" is not a rollback of a failed improvement, it
// is an ungoverned change wearing a rollback's name.
//
// THE FOUR REFUSALS THAT MATTER
//   1. The restored state must be the qualified state. After the restore the
//      materiality of the inherited qualification is re-derived: a restore
//      that does not actually restore the qualified state is MATERIAL or
//      UNKNOWN, and the qualification may then not be inherited silently
//      (spec section 11.3). The plan fails closed instead.
//   2. The execution history must be intact. The evidence inventory is
//      hashed and compared with a digest that was taken BEFORE the rollback.
//      That digest is supplied by the caller and is never derived from the
//      state it is used to check: a digest computed from the state under
//      examination would make the check tautological and would prove
//      nothing. A missing digest is a refusal, not a default.
//   3. A rollback goes back. Restoring the same or a newer revision is not a
//      rollback of a failed improvement.
//   4. The plan grants nothing. It adopts nothing, promotes nothing and
//      qualifies nothing (`authority_granted` and `adoption_authorized` are
//      const false).
//
// The module is pure: it reads its arguments, computes a record and writes
// nothing.
import { FailClosedError, canonicalJson, sha256Hex, nowIso } from '../vnext/util.mjs';
import { classifyMateriality } from '../qualification/materiality.mjs';

export const ROLLBACK_RECORD_SCHEMA_VERSION = '1.0.0';
export const ROLLBACK_RECORD_CONTRACT = 'core/contracts/rollback-record.schema.json';

const ZERO_DIGEST = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

// A version is compared as a semantic version. A version that does not parse
// is not comparable, and an incomparable pair cannot prove a direction.
function parseVersion(version) {
  if (typeof version !== 'string') return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function isQualifiable(entry) {
  return entry
    && entry.qualification_state === 'QUALIFIED'
    && Array.isArray(entry.qualification_evidence_refs)
    && entry.qualification_evidence_refs.length > 0;
}

function requireObject(value, role) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new FailClosedError('ROLLBACK_INPUT_INVALID', `${role} must be an object`);
  }
  return value;
}

function requireArray(value, role) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new FailClosedError('ROLLBACK_INPUT_INVALID', `${role} must be a non-empty array`);
  }
  return value;
}

// The history inventory is hashed over its entries, so an entry that was
// edited after the digest was taken changes the hash.
export function historyInventoryDigest(entries) {
  return `sha256:${sha256Hex(canonicalJson(entries))}`;
}

// planRollback({
//   subject: { kind, ref },
//   current: { version, digest },
//   versions: [ { version, digest, qualification_id, qualification_state,
//                 qualification_evidence_refs, fingerprint } ],
//   history: { entries: [ { ref, digest } ], digest_before },
//   requested_target_version: string | null,
//   now
// })
//
// The returned object is a RollbackRecord (contract
// core/contracts/rollback-record.schema.json).
export function planRollback({
  subject,
  current,
  versions,
  history,
  requestedTargetVersion = null,
  evidenceRefs = [],
  now
} = {}) {
  requireObject(subject, 'subject');
  requireObject(current, 'current');
  requireArray(versions, 'versions');
  requireObject(history, 'history');

  const entries = requireArray(history.entries, 'history.entries');
  const createdAt = nowIso(typeof now === 'function' ? now : undefined);
  const rollbackId = `rbk_${sha256Hex(canonicalJson({
    subject: subject.ref ?? null,
    current: current.version ?? null,
    versions: versions.map((entry) => entry.version),
    history: historyInventoryDigest(entries)
  })).slice(0, 16)}`;

  const base = {
    schema_version: ROLLBACK_RECORD_SCHEMA_VERSION,
    rollback_id: rollbackId,
    created_at: createdAt,
    subject: {
      kind: subject.kind ?? 'harness',
      ref: subject.ref ?? 'unknown'
    },
    rolled_back_from: {
      version: typeof current.version === 'string' ? current.version : 'unknown',
      digest: typeof current.digest === 'string' ? current.digest : ZERO_DIGEST
    },
    restored_to: {
      version: 'none',
      digest: ZERO_DIGEST,
      qualification_id: 'qual_unknown',
      qualification_state: 'NOT_QUALIFIED',
      fingerprint_id: 'fp_unknown'
    },
    materiality_after_rollback: {
      decision_id: 'mat_unknown',
      overall_class: 'UNKNOWN',
      deltas: []
    },
    history: {
      inventory_digest: typeof history.digest_before === 'string' ? history.digest_before : ZERO_DIGEST,
      entries: entries.map((entry) => ({
        ref: entry.ref,
        digest: entry.digest
      })),
      digest_before: typeof history.digest_before === 'string' ? history.digest_before : null,
      digest_after: null,
      unchanged: false
    },
    verdict: 'BLOCKED',
    refusal_code: null,
    refusal_detail: null,
    adoption_authorized: false,
    authority_granted: false,
    evidence_refs: evidenceRefs.length > 0 ? [...evidenceRefs] : [`subject:${subject.ref ?? 'unknown'}`]
  };

  const refuse = (code, detail, patch = {}) => ({
    ...base,
    ...patch,
    verdict: 'BLOCKED',
    refusal_code: code,
    refusal_detail: detail
  });

  // 0. The pre-rollback digest of the evidence inventory is INDEPENDENT
  //    evidence. It is the digest that was taken BEFORE the rollback, and it
  //    is never derived from the state it is used to check: a digest computed
  //    from the state under examination makes the comparison tautological
  //    and proves nothing. A caller that does not supply it has no evidence
  //    of the history at all, and that is a refusal, not a default.
  if (typeof history.digest_before !== 'string' || history.digest_before.length < 1) {
    return refuse(
      'HISTORY_DIGEST_MISSING',
      'the caller supplied no digest of the evidence inventory as it stood BEFORE the rollback, so there is nothing to compare the current inventory against; the history of the failed improvement cannot be proven intact'
    );
  }

  // 1. The restore target is the last QUALIFIED revision, derived from the
  //    version chain. A revision without its own evidence is not qualified.
  const qualified = versions
    .filter(isQualifiable)
    .sort((left, right) => (compareVersions(right.version, left.version) ?? 0));
  if (qualified.length === 0) {
    return refuse(
      'ROLLBACK_TARGET_NOT_QUALIFIED',
      'no revision of this subject carries a QUALIFIED qualification with its own evidence, so there is nothing to restore'
    );
  }
  const target = qualified[0];

  if (requestedTargetVersion !== null && requestedTargetVersion !== target.version) {
    return refuse(
      'ROLLBACK_TARGET_NOT_LAST_QUALIFIED',
      `the requested restore target ${requestedTargetVersion} is not the last qualified revision; the controlled target is ${target.version}`,
      {
        restored_to: {
          version: target.version,
          digest: target.digest ?? ZERO_DIGEST,
          qualification_id: target.qualification_id ?? 'qual_unknown',
          qualification_state: target.qualification_state ?? 'NOT_QUALIFIED',
          fingerprint_id: target.restored_fingerprint?.fingerprint_id ?? 'fp_unknown'
        }
      }
    );
  }

  if (Array.isArray(target.qualification_evidence_refs) && target.qualification_evidence_refs.length === 0) {
    return refuse(
      'QUALIFICATION_EVIDENCE_MISSING',
      `the qualification of revision ${target.version} carries no evidence, so it cannot be restored as a qualified state`
    );
  }

  // 2. A rollback goes back. A restore to the same or a newer revision is
  //    not a rollback of a failed improvement.
  const direction = compareVersions(current.version, target.version);
  if (direction === null) {
    return refuse(
      'ROLLBACK_NOT_A_ROLLBACK',
      `the current version ${current.version} and the restore target ${target.version} are not comparable semantic versions, so the direction of the rollback cannot be established`
    );
  }
  if (direction <= 0) {
    return refuse(
      'ROLLBACK_NOT_A_ROLLBACK',
      `the current version ${current.version} is not newer than the restore target ${target.version}; nothing is rolled back`
    );
  }

  // 3. The restored state must be the qualified state. The comparison is
  //    between the fingerprint the qualification was EARNED under and the
  //    fingerprint of the state the restore produces. Comparing a fingerprint
  //    with itself would prove nothing, so the two are kept apart: a restore
  //    that produces a different state than the qualified one is MATERIAL or
  //    UNKNOWN, and the qualification may then not be inherited silently
  //    (spec section 11.3).
  if (!target.qualified_fingerprint || typeof target.qualified_fingerprint !== 'object'
    || !target.restored_fingerprint || typeof target.restored_fingerprint !== 'object') {
    return refuse(
      'FINGERPRINT_MISSING',
      `the qualification of revision ${target.version} does not carry both the fingerprint it was earned under and the fingerprint of the restored state, so the restored state cannot be compared with the qualification it would inherit`,
      {
        restored_to: {
          version: target.version,
          digest: target.digest ?? ZERO_DIGEST,
          qualification_id: target.qualification_id ?? 'qual_unknown',
          qualification_state: target.qualification_state ?? 'NOT_QUALIFIED',
          fingerprint_id: 'fp_unknown'
        }
      }
    );
  }

  const decision = classifyMateriality(
    target.qualified_fingerprint,
    target.restored_fingerprint,
    createdAt
  );
  const restoredTo = {
    version: target.version,
    digest: target.digest ?? ZERO_DIGEST,
    qualification_id: target.qualification_id ?? 'qual_unknown',
    qualification_state: target.qualification_state ?? 'NOT_QUALIFIED',
    fingerprint_id: target.restored_fingerprint.fingerprint_id ?? 'fp_unknown'
  };
  if (decision.overall_class !== 'NON_MATERIAL') {
    return refuse(
      'MATERIALITY_NOT_NON_MATERIAL',
      `the restored state is ${decision.overall_class} against the qualification it would inherit, so the qualification may not be inherited after the rollback`,
      {
        restored_to: restoredTo,
        materiality_after_rollback: {
          decision_id: decision.decision_id,
          overall_class: decision.overall_class,
          deltas: decision.deltas
        }
      }
    );
  }

  // 4. The execution history is carried through unchanged. The digest of the
  //    inventory as it stands now is compared with the digest that was taken
  //    BEFORE the rollback — independent evidence, supplied by the caller.
  const digestAfter = historyInventoryDigest(entries);
  const digestBefore = history.digest_before;
  if (digestBefore !== digestAfter) {
    return refuse(
      'HISTORY_NOT_PRESERVED',
      `the evidence inventory changed across the rollback (before ${digestBefore}, after ${digestAfter}); the history of the failed improvement must survive the rollback`,
      {
        restored_to: restoredTo,
        materiality_after_rollback: {
          decision_id: decision.decision_id,
          overall_class: decision.overall_class,
          deltas: decision.deltas
        },
        history: {
          inventory_digest: digestBefore,
          entries: entries.map((entry) => ({ ref: entry.ref, digest: entry.digest })),
          digest_before: digestBefore,
          digest_after: digestAfter,
          unchanged: false
        }
      }
    );
  }

  return {
    ...base,
    restored_to: restoredTo,
    materiality_after_rollback: {
      decision_id: decision.decision_id,
      overall_class: decision.overall_class,
      deltas: decision.deltas
    },
    history: {
      inventory_digest: digestBefore,
      entries: entries.map((entry) => ({ ref: entry.ref, digest: entry.digest })),
      digest_before: digestBefore,
      digest_after: digestAfter,
      unchanged: true
    },
    verdict: 'ROLLBACK_PLANNED',
    refusal_code: null,
    refusal_detail: null
  };
}
