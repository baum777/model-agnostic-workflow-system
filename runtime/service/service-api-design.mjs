import { expectedClaimForAction, SERVICE_CAPABLE_ACTIONS } from './service-actions.mjs';

const SERVICE_API_DESIGN_VERSION = '1.0.0';

const SERVICE_API_ENDPOINTS = [
  {
    method: 'POST',
    path: '/runtime/service/run',
    action: 'run',
    claim: expectedClaimForAction('run'),
    specOnly: true,
    transport: 'none',
    listenerStarted: false
  },
  {
    method: 'GET',
    path: '/runtime/service/status',
    action: 'status',
    claim: expectedClaimForAction('status'),
    specOnly: true,
    transport: 'none',
    listenerStarted: false
  },
  {
    method: 'POST',
    path: '/runtime/service/replay',
    action: 'replay',
    claim: expectedClaimForAction('replay'),
    specOnly: true,
    transport: 'none',
    listenerStarted: false
  },
  {
    method: 'POST',
    path: '/runtime/service/cancel',
    action: 'cancel',
    claim: expectedClaimForAction('cancel'),
    specOnly: true,
    transport: 'none',
    listenerStarted: false
  }
];

function normalizeMethod(method) {
  return String(method ?? '').toUpperCase();
}

function resolveServiceEndpoint({ method, path } = {}) {
  const resolved = SERVICE_API_ENDPOINTS.find((endpoint) => endpoint.method === normalizeMethod(method) && endpoint.path === path);
  if (!resolved) {
    return {
      ok: false,
      endpoint: null,
      claim: null,
      listenerStarted: false,
      httpMcpStarted: false,
      remoteTransportStarted: false,
      issues: [`unbound endpoint: ${normalizeMethod(method) || '<missing>'} ${path || '<missing>'}.`]
    };
  }

  return {
    ok: true,
    endpoint: resolved,
    action: resolved.action,
    claim: resolved.claim,
    listenerStarted: false,
    httpMcpStarted: false,
    remoteTransportStarted: false,
    issues: []
  };
}

function validateServiceApiDesign({ endpoints = SERVICE_API_ENDPOINTS } = {}) {
  const issues = [];
  const coveredActions = [];

  for (const action of SERVICE_CAPABLE_ACTIONS) {
    const endpoint = endpoints.find((candidate) => candidate.action === action);
    if (!endpoint) {
      issues.push(`service API design missing endpoint for action ${action}.`);
      continue;
    }
    if (endpoint.specOnly !== true) {
      issues.push(`service API endpoint for ${action} must be spec-only.`);
    }
    if (endpoint.listenerStarted !== false || endpoint.transport !== 'none') {
      issues.push(`service API endpoint for ${action} must not start a listener or transport.`);
    }
    const expectedClaim = expectedClaimForAction(action);
    if (JSON.stringify(endpoint.claim) !== JSON.stringify(expectedClaim)) {
      issues.push(`service API endpoint for ${action} must map to expected claim.`);
    }
    coveredActions.push(action);
  }

  return {
    ok: issues.length === 0,
    serviceApiDesignVersion: SERVICE_API_DESIGN_VERSION,
    coverageComplete: issues.length === 0 && coveredActions.length === SERVICE_CAPABLE_ACTIONS.length,
    expectedActions: SERVICE_CAPABLE_ACTIONS,
    coveredActions,
    endpoints,
    listenerStarted: false,
    httpMcpStarted: false,
    remoteTransportStarted: false,
    daemonStarted: false,
    issues
  };
}

export {
  SERVICE_API_DESIGN_VERSION,
  SERVICE_API_ENDPOINTS,
  resolveServiceEndpoint,
  validateServiceApiDesign
};
