import { validateClaimBinding } from '../auth/claim-binding.mjs';
import { resolveAuthContext } from '../auth/auth-context.mjs';

const SERVICE_PREFLIGHT_VERSION = '1.0.0';

function runServicePreflight({
  cliIdentity = null,
  env = process.env,
  fixtureIdentity = null,
  requestedTransports = [],
  daemonRequested = false
} = {}) {
  const issues = [];
  const auth = resolveAuthContext({ cliIdentity, env, fixtureIdentity });
  if (!auth.ok) {
    issues.push(...auth.issues);
  }

  const claimBinding = auth.ok
    ? validateClaimBinding({
        identity: auth.identity,
        claim: {
          scope: 'service',
          action: 'preflight',
          target: 'runtime:service'
        }
      })
    : { ok: false, binding: null, issues: [] };
  if (!claimBinding.ok) {
    issues.push(...claimBinding.issues);
  }

  const normalizedTransports = [...new Set(requestedTransports.map((transport) => String(transport).toLowerCase()))];
  if (normalizedTransports.some((transport) => transport === 'http' || transport === 'mcp')) {
    issues.push('HTTP/MCP transports remain blocked during service auth preflight.');
  }
  if (normalizedTransports.includes('remote')) {
    issues.push('remote transport remains blocked during service auth preflight.');
  }
  if (daemonRequested) {
    issues.push('daemon mode remains blocked during service auth preflight.');
  }

  const preflightChecksPassed = issues.length === 0;
  return {
    ok: preflightChecksPassed,
    servicePreflightVersion: SERVICE_PREFLIGHT_VERSION,
    preflightChecksPassed,
    serviceStartAllowed: false,
    reason: 'service mode remains gated',
    identity: auth.identity,
    claimBinding: claimBinding.binding,
    requestedTransports: normalizedTransports,
    issues
  };
}

export { SERVICE_PREFLIGHT_VERSION, runServicePreflight };
