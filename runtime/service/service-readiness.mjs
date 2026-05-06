const SERVICE_READINESS_VERSION = '1.0.0';
const SERVICE_TRANSPORTS = new Set(['http', 'mcp', 'remote']);

function normalizeTransports(requestedTransports = []) {
  return [...new Set(requestedTransports.map((transport) => String(transport).toLowerCase()))];
}

function validateServiceModeRequest({
  explicitServiceFlag = false,
  requestedTransports = [],
  localAuthModelReady = false,
  permissionModelReady = false
} = {}) {
  const issues = [];
  const normalizedTransports = normalizeTransports(requestedTransports);
  const deferredTransports = normalizedTransports.filter((transport) => SERVICE_TRANSPORTS.has(transport));
  const unknownTransports = normalizedTransports.filter((transport) => !SERVICE_TRANSPORTS.has(transport));

  if (!explicitServiceFlag) {
    issues.push('service start requires an explicit --enable-service-mode flag.');
  }

  if (unknownTransports.length > 0) {
    issues.push(`unknown service transport requested: ${unknownTransports.join(', ')}.`);
  }

  if (deferredTransports.some((transport) => transport === 'http' || transport === 'mcp') && (!localAuthModelReady || !permissionModelReady)) {
    issues.push('HTTP/MCP service transports are deferred until a local auth/permission model is implemented and validated.');
  }

  if (deferredTransports.includes('remote') && (!localAuthModelReady || !permissionModelReady)) {
    issues.push('remote transport remains blocked before local auth/permission model readiness.');
  }

  if (deferredTransports.length > 0) {
    issues.push('service transports remain gated in Phase 7; no service listener, MCP server, or remote transport is started.');
  }

  return {
    ok: false,
    serviceReadinessVersion: SERVICE_READINESS_VERSION,
    serviceStartAllowed: false,
    explicitServiceFlag,
    requestedTransports: normalizedTransports,
    deferredTransports,
    localAuthModelReady,
    permissionModelReady,
    issues: issues.length > 0 ? issues : ['service mode is readiness-spec only in Phase 7.']
  };
}

export { SERVICE_READINESS_VERSION, validateServiceModeRequest };
