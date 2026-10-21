// MAWS vNext — canonical owner authority (spec MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S8, spec sections 12.3/13.1/13.4).
//
// An owner approval is only an approval when a TRUSTED authority vouches for
// it. A self-declared "canonical_owner" string and a free decision reference
// are caller input: they authorise nothing. The approval artifact is
// therefore read from the canonical decision surface, verified against the
// canonical owner trust anchor (a published public key), and bound to the
// exact candidate content and skill it approves.
//
// Rules enforced here (all fail closed):
//   A1  the trust anchor is a governed surface; it is read from the pinned
//       canonical location and validated against its contract;
//   A2  an anchor without a published key authorises nothing — the state
//       PENDING_PUBLICATION refuses every approval;
//   A3  the signing key must be published, active and hold the
//       canonical_owner role;
//   A4  the signature must verify over the canonical body of the approval;
//       the body binds the skill, the decision, the time and the candidate
//       content digest;
//   A5  the approval must name the candidate content that is promoted;
//   A6  the approval artifact must live in the canonical decision surface
//       of the target tree.
//
// Approval != Grant: a verified approval is one required gate of the
// promotion chain. It grants no capability, no permission and no execution
// authorisation.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '../vnext/util.mjs';
import { assertCanonicalTarget, CanonicalPathError } from './canonical-path.mjs';

export const OWNER_AUTHORITY_CONTRACT = 'core/contracts/owner-authority.schema.json';
export const OWNER_APPROVAL_CONTRACT = 'core/contracts/owner-approval.schema.json';
// The canonical trust anchor location inside the governed repository.
export const CANONICAL_OWNER_AUTHORITY_PATH = 'core/contracts/owner-authority.json';
// The canonical decision surface inside the target tree.
export const OWNER_APPROVAL_DIRECTORY = 'core/authority/approvals';
// Clock skew allowance for an approval timestamp (minutes).
export const APPROVAL_CLOCK_SKEW_MINUTES = 5;
// An approval is a decision, not a permanent licence: an approval older
// than this bound cannot authorize a promotion (mirrors the behavioral
// evidence age bound).
export const DEFAULT_MAX_APPROVAL_AGE_DAYS = 90;

const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const DECISION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/;

export class OwnerAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OwnerAuthorityError';
    this.code = code;
  }
}

function authorityError(code, message) {
  throw new OwnerAuthorityError(code, message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length >= 1;
}

// resolveNowMs(clock) -> the current time in milliseconds. The clock may be
// a function, a Date or an ISO string; an unusable clock fails closed.
function resolveNowMs(clock) {
  if (typeof clock === 'function') return resolveNowMs(clock());
  if (clock instanceof Date) return clock.getTime();
  return Date.parse(String(clock));
}

// sha256Prefixed(content) -> the canonical digest form used across MAWS.
export function sha256Prefixed(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

// approvalPayload(approval) -> the exact bytes the signature covers: the
// canonical JSON of every approval field except the signature envelope. An
// approval that binds the frontdoor admission (frontdoor_admission_digest)
// signs over that binding too, so the owner decision covers exactly the
// screened admission the promotion consumes — a fabricated or substituted
// admission cannot match a signature that binds another one.
export function approvalPayload(approval) {
  return canonicalJson({
    schema_version: approval.schema_version,
    approver: approval.approver,
    skill_id: approval.skill_id,
    decision_ref: approval.decision_ref,
    approved_at: approval.approved_at,
    candidate_digest: approval.candidate_digest,
    ...(approval.frontdoor_admission_digest !== undefined
      ? { frontdoor_admission_digest: approval.frontdoor_admission_digest }
      : {})
  });
}

// loadOwnerAuthority({ authorityPath, root, validate }) -> the trust anchor.
// The anchor is validated against its canonical contract when the contract is
// resolvable in the governed root; the code rules below are the runtime gate.
export function loadOwnerAuthority({ authorityPath, root, validate = null }) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  } catch (error) {
    authorityError('OWNER_AUTHORITY_MISSING', `the canonical owner authority is not readable at ${authorityPath}: ${error.message}`);
  }
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    authorityError('OWNER_AUTHORITY_INVALID', 'the canonical owner authority must be an object');
  }
  if (record.schema_version !== '1.0.0') {
    authorityError('OWNER_AUTHORITY_INVALID', `unsupported owner authority schema_version "${String(record.schema_version)}"`);
  }
  if (record.authority_id !== 'canonical_owner') {
    authorityError('OWNER_AUTHORITY_INVALID', `the owner authority must hold the canonical_owner identity, got "${String(record.authority_id)}"`);
  }
  if (!Array.isArray(record.keys)) {
    authorityError('OWNER_AUTHORITY_INVALID', 'the owner authority must carry a keys array');
  }
  if (!TIMESTAMP_PATTERN.test(String(record.updated_at))) {
    authorityError('OWNER_AUTHORITY_INVALID', 'the owner authority must carry an updated_at timestamp');
  }
  for (const key of record.keys) {
    if (key === null || typeof key !== 'object' || Array.isArray(key)) {
      authorityError('OWNER_AUTHORITY_INVALID', 'every owner authority key must be an object');
    }
    if (!KEY_ID_PATTERN.test(String(key.key_id))) {
      authorityError('OWNER_AUTHORITY_INVALID', `the owner authority key id "${String(key.key_id)}" is malformed`);
    }
    if (key.algorithm !== 'ed25519') {
      authorityError('OWNER_AUTHORITY_INVALID', `the owner authority key "${key.key_id}" declares an unsupported algorithm`);
    }
    if (key.role !== 'canonical_owner') {
      authorityError('OWNER_AUTHORITY_INVALID', `the owner authority key "${key.key_id}" does not hold the canonical_owner role`);
    }
    if (key.status !== 'active' && key.status !== 'revoked') {
      authorityError('OWNER_AUTHORITY_INVALID', `the owner authority key "${key.key_id}" carries an unknown status`);
    }
    if (!isNonEmptyString(key.public_key_pem)) {
      authorityError('OWNER_AUTHORITY_INVALID', `the owner authority key "${key.key_id}" carries no public key`);
    }
  }
  if (validate) {
    const issues = validate(record);
    if (issues.length > 0) {
      authorityError('OWNER_AUTHORITY_INVALID', `the canonical owner authority violates its contract: ${issues.join('; ')}`);
    }
  }
  return record;
}

// resolveApprovalPath({ canonicalRoot, approvalRef }) -> the absolute path of
// the approval artifact. The artifact must live in the canonical decision
// surface of the target tree (A6).
export function resolveApprovalPath({ canonicalRoot, approvalRef }) {
  if (!isNonEmptyString(approvalRef)) {
    authorityError('OWNER_APPROVAL_MISSING', 'the promotion requires a canonical owner approval artifact');
  }
  const relative = path.posix.normalize(String(approvalRef).replace(/\\/g, '/'));
  if (relative.startsWith('../') || relative === '..' || path.isAbsolute(relative)) {
    authorityError('OWNER_APPROVAL_PATH_ESCAPE', `the owner approval reference "${approvalRef}" escapes the canonical tree`);
  }
  if (!relative.startsWith(`${OWNER_APPROVAL_DIRECTORY}/`)) {
    authorityError('OWNER_APPROVAL_PATH_ESCAPE', `the owner approval must live in the canonical decision surface ${OWNER_APPROVAL_DIRECTORY}/, got "${relative}"`);
  }
  const root = path.resolve(canonicalRoot);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    authorityError('OWNER_APPROVAL_PATH_ESCAPE', `the owner approval reference "${approvalRef}" escapes the canonical tree`);
  }
  return { absolute, relative };
}

// readOwnerApproval({ approvalRef, canonicalRoot }) -> { record, digest,
// relative }. The approval artifact is read from the canonical decision
// surface and its content digest is bound into the adoption record.
export function readOwnerApproval({ approvalRef, canonicalRoot }) {
  const { absolute, relative } = resolveApprovalPath({ canonicalRoot, approvalRef });
  // The approval is read like every other governed artifact: through the
  // canonical containment proof, so a symlinked file or a symlinked parent
  // directory cannot move the read out of the tree.
  try {
    assertCanonicalTarget({ root: path.resolve(canonicalRoot), absolutePath: absolute, label: 'owner approval' });
  } catch (error) {
    if (error instanceof CanonicalPathError) {
      authorityError('OWNER_APPROVAL_PATH_ESCAPE', `the owner approval ${relative} is not a contained regular file of the canonical tree: ${error.message}`);
    }
    throw error;
  }
  let content;
  try {
    content = fs.readFileSync(absolute, 'utf8');
  } catch (error) {
    authorityError('OWNER_APPROVAL_MISSING', `the owner approval artifact ${relative} is not readable: ${error.message}`);
  }
  let record;
  try {
    record = JSON.parse(content);
  } catch (error) {
    authorityError('OWNER_APPROVAL_INVALID', `the owner approval artifact ${relative} is not readable JSON: ${error.message}`);
  }
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    authorityError('OWNER_APPROVAL_INVALID', 'the owner approval artifact must be an object');
  }
  return { record, digest: sha256Prefixed(canonicalJson(record)), relative, absolute };
}

// verifyOwnerApproval({ approval, authority, candidateDigest, skillId, now,
// frontdoorAdmissionDigest, maxApprovalAgeDays })
//   -> the verified approval summary. Every check fails closed (A2..A5).
// frontdoorAdmissionDigest: when given (the promotion always gives it), the
// approval must bind the frontdoor admission and bind EXACTLY it — the
// signature covers the binding, so a substituted admission fails the
// signature itself.
export function verifyOwnerApproval({ approval, authority, candidateDigest, skillId = null, now = new Date(), frontdoorAdmissionDigest = null, maxApprovalAgeDays = DEFAULT_MAX_APPROVAL_AGE_DAYS }) {
  const nowMs = resolveNowMs(now);
  if (authority.authority_status !== 'PUBLISHED' || authority.keys.length === 0) {
    authorityError(
      'OWNER_AUTHORITY_NOT_PUBLISHED',
      `the canonical owner authority is ${authority.authority_status} and publishes no owner key, so no approval can authorize a promotion (the owner must publish the canonical owner public key in ${CANONICAL_OWNER_AUTHORITY_PATH})`
    );
  }
  if (approval.schema_version !== '1.0.0') {
    authorityError('OWNER_APPROVAL_INVALID', `unsupported owner approval schema_version "${String(approval.schema_version)}"`);
  }
  if (approval.approver !== authority.authority_id) {
    authorityError('OWNER_APPROVAL_APPROVER_MISMATCH', `the approval names approver "${String(approval.approver)}", the trust anchor holds "${authority.authority_id}"`);
  }
  if (!KEY_ID_PATTERN.test(String(approval.skill_id))) {
    authorityError('OWNER_APPROVAL_INVALID', `the approval names a malformed skill id "${String(approval.skill_id)}"`);
  }
  if (skillId !== null && approval.skill_id !== skillId) {
    authorityError('OWNER_APPROVAL_SKILL_MISMATCH', `the approval approves skill "${approval.skill_id}", the promotion promotes "${skillId}"`);
  }
  if (!isNonEmptyString(approval.decision_ref) || !DECISION_REF_PATTERN.test(approval.decision_ref)) {
    authorityError('OWNER_APPROVAL_INVALID', 'the approval carries no usable decision reference');
  }
  if (!TIMESTAMP_PATTERN.test(String(approval.approved_at)) || Number.isNaN(Date.parse(approval.approved_at))) {
    authorityError('OWNER_APPROVAL_INVALID', `approved_at "${String(approval.approved_at)}" is not a timestamp`);
  }
  const approvedAt = Date.parse(approval.approved_at);
  if (Number.isNaN(nowMs)) {
    authorityError('OWNER_APPROVAL_INVALID', 'the approval could not be compared against a valid clock');
  }
  if (approvedAt > nowMs + APPROVAL_CLOCK_SKEW_MINUTES * 60000) {
    authorityError('OWNER_APPROVAL_FUTURE', `the approval is dated in the future (${approval.approved_at})`);
  }
  // A decision expires: an approval that is older than the bound cannot
  // authorize a promotion any more.
  const ageDays = (nowMs - approvedAt) / 86400000;
  if (ageDays > maxApprovalAgeDays) {
    authorityError('OWNER_APPROVAL_STALE', `the approval is ${ageDays.toFixed(1)} days old, the bound is ${maxApprovalAgeDays} days`);
  }
  if (!DIGEST_PATTERN.test(String(approval.candidate_digest))) {
    authorityError('OWNER_APPROVAL_INVALID', 'the approval carries no canonical candidate digest');
  }
  if (approval.candidate_digest !== candidateDigest) {
    authorityError('OWNER_APPROVAL_CANDIDATE_MISMATCH', `the owner approval binds candidate digest ${approval.candidate_digest}, the promoted content digests to ${candidateDigest}`);
  }
  // The owner decision covers the screened frontdoor admission: a promotion
  // that requires the binding cannot be authorized by an approval that does
  // not carry it, and an approval that binds a DIFFERENT admission fails the
  // equality here (and would fail the signature against a payload that
  // carries this field).
  if (frontdoorAdmissionDigest !== null) {
    if (!isNonEmptyString(approval.frontdoor_admission_digest)) {
      authorityError('OWNER_APPROVAL_ADMISSION_UNBOUND', 'the approval does not bind the frontdoor admission it authorizes; the promotion requires the owner decision to cover the screened admission');
    }
    if (!DIGEST_PATTERN.test(String(approval.frontdoor_admission_digest))) {
      authorityError('OWNER_APPROVAL_INVALID', 'the approval carries a malformed frontdoor admission digest');
    }
    if (approval.frontdoor_admission_digest !== frontdoorAdmissionDigest) {
      authorityError('OWNER_APPROVAL_ADMISSION_MISMATCH', `the owner approval binds frontdoor admission ${approval.frontdoor_admission_digest}, the promotion consumes admission ${frontdoorAdmissionDigest}`);
    }
  }
  const signature = approval.signature;
  if (signature === null || typeof signature !== 'object' || Array.isArray(signature)) {
    authorityError('OWNER_APPROVAL_SIGNATURE_INVALID', 'the owner approval carries no signature');
  }
  if (signature.algorithm !== 'ed25519') {
    authorityError('OWNER_APPROVAL_SIGNATURE_INVALID', `unsupported approval signature algorithm "${String(signature.algorithm)}"`);
  }
  const key = authority.keys.find((entry) => entry.key_id === signature.key_id);
  if (!key) {
    authorityError('OWNER_AUTHORITY_KEY_UNKNOWN', `the approval is signed by key "${String(signature.key_id)}", which the canonical owner authority does not publish`);
  }
  if (key.status !== 'active') {
    authorityError('OWNER_AUTHORITY_KEY_REVOKED', `the approval is signed by revoked key "${key.key_id}"`);
  }
  if (!isNonEmptyString(signature.value)) {
    authorityError('OWNER_APPROVAL_SIGNATURE_INVALID', 'the owner approval carries an empty signature');
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(key.public_key_pem);
  } catch (error) {
    authorityError('OWNER_AUTHORITY_INVALID', `the published key "${key.key_id}" is not a readable public key: ${error.message}`);
  }
  let verified = false;
  try {
    verified = crypto.verify(
      null,
      Buffer.from(approvalPayload(approval), 'utf8'),
      publicKey,
      Buffer.from(signature.value, 'base64')
    );
  } catch (error) {
    verified = false;
  }
  if (!verified) {
    authorityError('OWNER_APPROVAL_SIGNATURE_INVALID', 'the owner approval signature does not verify against the published canonical owner key');
  }
  return {
    approver: approval.approver,
    skill_id: approval.skill_id,
    decision_ref: approval.decision_ref,
    approved_at: approval.approved_at,
    candidate_digest: approval.candidate_digest,
    ...(approval.frontdoor_admission_digest !== undefined
      ? { frontdoor_admission_digest: approval.frontdoor_admission_digest }
      : {}),
    authority_id: authority.authority_id,
    authority_digest: sha256Prefixed(canonicalJson(authority)),
    key_id: key.key_id,
    signature_verified: true
  };
}
