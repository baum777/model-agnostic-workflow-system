import { RuntimeBlockedError } from './runtime-errors.mjs';

// CLG P3-B generic external authority boundary.
//
// The generic runtime NEVER decides whether a domain capability is authorized.
// Authorization arrives exclusively through an AuthorityPort binding whose
// evaluate() returns an AuthorityDecision. Everything domain-specific — grants,
// tenancy, admission, trust tiers, policies — stays behind the port and is
// transported only as opaque references. The runtime defines none of it.

const AUTHORITY_PORT_METHODS = Object.freeze(['evaluate']);
const AUTHORITY_DECISIONS = Object.freeze(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'UNAVAILABLE']);

const ACTION_PROPOSAL_REQUIRED = Object.freeze([
  'proposal_id',
  'task_ref',
  'subject_ref',
  'action_ref',
  'resource_ref'
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// ActionProposal: a request to produce an external effect. Proposing is not
// authority; every field is an opaque reference.
function validateActionProposal(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, issues: ['ActionProposal must be an object.'] };
  }
  for (const field of ACTION_PROPOSAL_REQUIRED) {
    if (!isNonEmptyString(candidate[field])) {
      issues.push(`ActionProposal.${field} must be a non-empty string.`);
    }
  }
  if (candidate.policy_ref !== undefined && !isNonEmptyString(candidate.policy_ref)) {
    issues.push('ActionProposal.policy_ref must be a non-empty string when present.');
  }
  if (candidate.context_ref !== undefined && !isNonEmptyString(candidate.context_ref)) {
    issues.push('ActionProposal.context_ref must be a non-empty string when present.');
  }
  return { ok: issues.length === 0, issues };
}

// Fail-closed port definition, same house pattern as ContextEnginePort: a
// binding that does not provide the port surface must never be accepted.
function createAuthorityPort(binding) {
  const issues = [];
  if (!binding || typeof binding !== 'object') {
    issues.push('AuthorityPort binding must be an object.');
  } else {
    for (const method of AUTHORITY_PORT_METHODS) {
      if (typeof binding[method] !== 'function') {
        issues.push(`AuthorityPort binding is missing required method: ${method}().`);
      }
    }
    if (binding.authority_ref !== undefined && !isNonEmptyString(binding.authority_ref)) {
      issues.push('AuthorityPort binding.authority_ref must be a non-empty string when present.');
    }
  }
  if (issues.length > 0) {
    throw new RuntimeBlockedError('AuthorityPort binding rejected (fail-closed).', issues);
  }

  return Object.freeze({
    port: 'AuthorityPort',
    methods: Object.freeze([...AUTHORITY_PORT_METHODS]),
    authorityRef: binding.authority_ref ?? 'unspecified',
    decisions: AUTHORITY_DECISIONS,
    evaluate: binding.evaluate
  });
}

// Normalizes a raw port answer into a fail-closed AuthorityDecision. Anything
// that is not a verbatim, unexpired, subject/action-bound ALLOW is not ALLOW:
// invalid enum values, missing decision refs, expired authority and
// subject/action mismatches all degrade to DENY with an explicit reason.
function normalizeAuthorityDecision({ raw, actionProposal }) {
  const deny = (reason) => ({
    decision: 'DENY',
    decision_ref: isNonEmptyString(raw?.decision_ref) ? raw.decision_ref : 'unspecified',
    subject_ref: actionProposal.subject_ref,
    action_ref: actionProposal.action_ref,
    reason,
    evidence_refs: Array.isArray(raw?.evidence_refs) ? Object.freeze([...raw.evidence_refs]) : []
  });

  if (!raw || typeof raw !== 'object') {
    return deny('AuthorityPort returned no decision object.');
  }
  if (!AUTHORITY_DECISIONS.includes(raw.decision)) {
    return deny(`AuthorityPort returned an invalid decision: ${String(raw.decision)}.`);
  }
  if (!isNonEmptyString(raw.decision_ref)) {
    return deny('AuthorityDecision.decision_ref must be a non-empty string.');
  }
  if (raw.subject_ref !== actionProposal.subject_ref || raw.action_ref !== actionProposal.action_ref) {
    return deny('Authority subject/action mismatch: the decision does not bind to this proposal.');
  }
  if (raw.expires_at !== undefined) {
    const expiry = new Date(raw.expires_at);
    if (Number.isNaN(expiry.getTime())) {
      return deny('AuthorityDecision.expires_at is not a parsable timestamp.');
    }
    if (expiry.getTime() <= Date.now()) {
      return deny('Authority expired.');
    }
  }
  return {
    decision: raw.decision,
    decision_ref: raw.decision_ref,
    subject_ref: raw.subject_ref,
    action_ref: raw.action_ref,
    reason: isNonEmptyString(raw.reason) ? raw.reason : null,
    evidence_refs: Array.isArray(raw.evidence_refs) ? Object.freeze([...raw.evidence_refs]) : []
  };
}

// Full authority check for one proposal. Missing ports and port failures are
// evaluated denials (no side effect), never fake success.
function evaluateAction({ authorityPort, actionProposal }) {
  const proposalCheck = validateActionProposal(actionProposal);
  if (!proposalCheck.ok) {
    return { decision: 'DENY', decision_ref: 'unspecified', subject_ref: actionProposal?.subject_ref ?? 'unspecified', action_ref: actionProposal?.action_ref ?? 'unspecified', reason: 'Invalid ActionProposal.', issues: proposalCheck.issues, portCalled: false };
  }
  if (!authorityPort || authorityPort.port !== 'AuthorityPort' || typeof authorityPort.evaluate !== 'function') {
    return { decision: 'UNAVAILABLE', decision_ref: 'unspecified', subject_ref: actionProposal.subject_ref, action_ref: actionProposal.action_ref, reason: 'EXTERNAL_PORT_REQUIRED: no AuthorityPort binding.', issues: [], portCalled: false };
  }
  let raw;
  try {
    raw = authorityPort.evaluate({ actionProposal });
  } catch (error) {
    return { decision: 'UNAVAILABLE', decision_ref: 'unspecified', subject_ref: actionProposal.subject_ref, action_ref: actionProposal.action_ref, reason: `AuthorityPort failed (no silent continue): ${error.message}`, issues: [], portCalled: true };
  }
  return { ...normalizeAuthorityDecision({ raw, actionProposal }), issues: [], portCalled: true };
}

export {
  ACTION_PROPOSAL_REQUIRED,
  AUTHORITY_DECISIONS,
  AUTHORITY_PORT_METHODS,
  createAuthorityPort,
  evaluateAction,
  normalizeAuthorityDecision,
  validateActionProposal
};
