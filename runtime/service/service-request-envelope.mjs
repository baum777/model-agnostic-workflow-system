import crypto from 'node:crypto';
import { resolveAuthContext } from '../auth/auth-context.mjs';
import { resolveServiceEndpoint } from './service-api-design.mjs';

const SERVICE_REQUEST_ENVELOPE_VERSION = '1.0.0';

function createRequestId(createdAt = new Date()) {
  const timestamp = createdAt.toISOString().replace(/[:.]/g, '-');
  return `req_${timestamp}_${crypto.randomBytes(4).toString('hex')}`;
}

function createServiceRequestEnvelope({
  method,
  path,
  cliIdentity = null,
  env = process.env,
  fixtureIdentity = null,
  claimOverride = null
} = {}) {
  const issues = [];
  const auth = resolveAuthContext({ cliIdentity, env, fixtureIdentity });
  if (!auth.ok) {
    issues.push(...auth.issues);
  }

  const endpoint = resolveServiceEndpoint({ method, path });
  if (!endpoint.ok) {
    issues.push(...endpoint.issues);
  }

  const claim = claimOverride ?? endpoint.claim;
  if (endpoint.ok && JSON.stringify(claim) !== JSON.stringify(endpoint.claim)) {
    issues.push('claim mismatch for service request endpoint.');
  }

  if (issues.length > 0) {
    return {
      ok: false,
      envelope: null,
      issues
    };
  }

  const createdAt = new Date();
  return {
    ok: true,
    envelope: {
      requestEnvelopeVersion: SERVICE_REQUEST_ENVELOPE_VERSION,
      requestId: createRequestId(createdAt),
      createdAt: createdAt.toISOString(),
      identity: auth.identity,
      endpoint: {
        method: endpoint.endpoint.method,
        path: endpoint.endpoint.path
      },
      action: endpoint.action,
      claim,
      transport: 'local-only',
      listenerStarted: false,
      serviceStartAllowed: false
    },
    issues: []
  };
}

export {
  SERVICE_REQUEST_ENVELOPE_VERSION,
  createRequestId,
  createServiceRequestEnvelope
};
