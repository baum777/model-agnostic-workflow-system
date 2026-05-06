const BOUND_ACTIONS = new Map([
  ['service:preflight', new Set(['local-user', 'ci', 'agent'])],
  ['service:run', new Set(['local-user', 'ci', 'agent'])],
  ['service:status', new Set(['local-user', 'ci', 'agent'])],
  ['service:replay', new Set(['local-user', 'ci', 'agent'])],
  ['service:cancel', new Set(['local-user', 'ci', 'agent'])]
]);

function bindingKey(claim = {}) {
  return `${claim.scope}:${claim.action}`;
}

function validateClaimBinding({ identity, claim } = {}) {
  const issues = [];
  if (!identity?.id) {
    issues.push('claim binding requires an identity.');
  }
  if (identity?.trust !== 'controlled-local') {
    issues.push('claim binding rejects implicit trust source.');
  }
  if (!claim?.scope || !claim?.action || !claim?.target) {
    issues.push('claim binding requires scope, action, and target.');
  }

  const key = bindingKey(claim);
  const allowedIdentities = BOUND_ACTIONS.get(key);
  if (!allowedIdentities) {
    issues.push(`unbound action: ${key}.`);
  } else if (identity?.id && !allowedIdentities.has(identity.id)) {
    issues.push(`identity ${identity.id} is not bound to action ${key}.`);
  }

  return {
    ok: issues.length === 0,
    binding: issues.length === 0
      ? {
          identityId: identity.id,
          scope: claim.scope,
          action: claim.action,
          target: claim.target
        }
      : null,
    issues
  };
}

export { BOUND_ACTIONS, validateClaimBinding };
