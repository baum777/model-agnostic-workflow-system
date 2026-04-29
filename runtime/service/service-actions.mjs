import { validateClaimBinding } from '../auth/claim-binding.mjs';

const SERVICE_CAPABLE_ACTIONS = ['run', 'status', 'replay', 'cancel'];

function expectedClaimForAction(action) {
  return {
    scope: 'service',
    action,
    target: `runtime:service/${action}`
  };
}

function validateExplicitClaim({ action, claim } = {}) {
  const issues = [];
  const expected = expectedClaimForAction(action);
  if (!claim) {
    issues.push(`service action ${action || '<missing>'} requires an explicit claim.`);
    return issues;
  }
  if (claim.scope !== expected.scope || claim.action !== expected.action || claim.target !== expected.target) {
    issues.push(`service action ${action || '<missing>'} explicit claim must match ${expected.scope}:${expected.action}:${expected.target}.`);
  }
  return issues;
}

function validateServiceActionRequest({ identity, action, claim } = {}) {
  const issues = [];
  if (!SERVICE_CAPABLE_ACTIONS.includes(action)) {
    issues.push(`unknown service-capable action: ${action || '<missing>'}.`);
  }

  issues.push(...validateExplicitClaim({ action, claim }));

  const binding = claim
    ? validateClaimBinding({ identity, claim })
    : { ok: false, binding: null, issues: [] };
  if (!binding.ok) {
    issues.push(...binding.issues);
  }

  return {
    ok: issues.length === 0,
    action,
    claim,
    binding: binding.binding,
    issues
  };
}

function simulateServiceAction({ identity, action, claim } = {}) {
  const validation = validateServiceActionRequest({ identity, action, claim });
  if (!validation.ok) {
    return {
      ok: false,
      action,
      executionSimulated: false,
      listenerStarted: false,
      httpMcpStarted: false,
      serviceStartAllowed: false,
      transport: 'local-only',
      issues: validation.issues
    };
  }

  return {
    ok: true,
    action,
    executionSimulated: true,
    listenerStarted: false,
    httpMcpStarted: false,
    serviceStartAllowed: false,
    transport: 'local-only',
    identity: validation.binding.identityId,
    claim: validation.claim,
    binding: validation.binding,
    result: {
      status: 'simulated',
      message: `service action ${action} validated locally; no listener started`
    },
    issues: []
  };
}

function validateServiceActionPermissionCoverage({ identity } = {}) {
  const actionResults = SERVICE_CAPABLE_ACTIONS.map((action) => validateServiceActionRequest({
    identity,
    action,
    claim: expectedClaimForAction(action)
  }));
  const coveredActions = actionResults
    .filter((entry) => entry.ok)
    .map((entry) => entry.action);
  const issues = actionResults.flatMap((entry) => entry.issues);

  return {
    ok: issues.length === 0 && coveredActions.length === SERVICE_CAPABLE_ACTIONS.length,
    coverageComplete: issues.length === 0 && coveredActions.length === SERVICE_CAPABLE_ACTIONS.length,
    coveredActions,
    expectedActions: SERVICE_CAPABLE_ACTIONS,
    actionResults,
    issues
  };
}

export {
  SERVICE_CAPABLE_ACTIONS,
  expectedClaimForAction,
  simulateServiceAction,
  validateExplicitClaim,
  validateServiceActionPermissionCoverage,
  validateServiceActionRequest
};
