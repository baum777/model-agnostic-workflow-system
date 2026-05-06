import { createServiceRequestEnvelope } from './service-request-envelope.mjs';

const SERVICE_REQUEST_VALIDATION_VERSION = '1.0.0';

function validateServiceRequest({
  method,
  path,
  cliIdentity = null,
  env = process.env,
  fixtureIdentity = null,
  claimOverride = null,
  requestedTransports = [],
  daemonRequested = false
} = {}) {
  const issues = [];
  const normalizedTransports = [...new Set(requestedTransports.map((transport) => String(transport).toLowerCase()))];
  const envelope = createServiceRequestEnvelope({ method, path, cliIdentity, env, fixtureIdentity, claimOverride });
  if (!envelope.ok) {
    issues.push(...envelope.issues);
  }
  if (normalizedTransports.some((transport) => transport === 'http' || transport === 'mcp')) {
    issues.push('HTTP/MCP transports remain blocked during service request validation.');
  }
  if (normalizedTransports.includes('remote')) {
    issues.push('remote transport remains blocked during service request validation.');
  }
  if (daemonRequested) {
    issues.push('daemon mode remains blocked during service request validation.');
  }

  const requestValidated = issues.length === 0;
  return {
    ok: requestValidated,
    serviceRequestValidationVersion: SERVICE_REQUEST_VALIDATION_VERSION,
    requestValidated,
    envelope: envelope.envelope,
    listenerStarted: false,
    httpMcpStarted: false,
    remoteTransportStarted: false,
    daemonStarted: false,
    serviceStartAllowed: false,
    transport: 'local-only',
    issues
  };
}

export { SERVICE_REQUEST_VALIDATION_VERSION, validateServiceRequest };
