import fs from 'node:fs';
import path from 'node:path';
import { SERVICE_API_ENDPOINTS } from './service-api-design.mjs';
import { validateServiceRequest } from './service-request-validation.mjs';

const SERVICE_REQUEST_RECEIPT_VERSION = '1.0.0';

function endpointKey(endpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

function createServiceRequestReceipts({ context, identity } = {}) {
  const receipts = SERVICE_API_ENDPOINTS.map((endpoint) => {
    const validation = validateServiceRequest({
      method: endpoint.method,
      path: endpoint.path,
      fixtureIdentity: identity.id
    });

    return {
      receiptVersion: SERVICE_REQUEST_RECEIPT_VERSION,
      runId: context.runId,
      createdAt: new Date().toISOString(),
      request: validation.envelope,
      validation: {
        result: validation.ok ? 'pass' : 'blocked',
        requestValidated: validation.requestValidated,
        issues: validation.issues
      },
      execution: {
        transport: validation.transport,
        listenerStarted: false,
        httpMcpStarted: false,
        remoteTransportStarted: false,
        daemonStarted: false,
        serviceStartAllowed: false
      }
    };
  });

  const coveredEndpoints = receipts
    .filter((receipt) => receipt.validation.result === 'pass' && receipt.request?.endpoint)
    .map((receipt) => `${receipt.request.endpoint.method} ${receipt.request.endpoint.path}`);
  const expectedEndpoints = SERVICE_API_ENDPOINTS.map(endpointKey);
  const coverageIssues = expectedEndpoints
    .filter((expected) => !coveredEndpoints.includes(expected))
    .map((expected) => `service request coverage missing ${expected}.`);

  return {
    serviceRequestReceiptVersion: SERVICE_REQUEST_RECEIPT_VERSION,
    runId: context.runId,
    createdAt: new Date().toISOString(),
    coverage: {
      coverageComplete: coverageIssues.length === 0,
      expectedEndpoints,
      coveredEndpoints,
      issues: coverageIssues
    },
    receipts
  };
}

function writeServiceRequestReceipts({ context, identity } = {}) {
  const issues = [];
  if (!context?.runId || !context?.runDir) {
    issues.push('service request receipts require an active runtime context.');
  }
  if (!identity?.id) {
    issues.push('service request receipts require identity.');
  }
  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      receipts: [],
      coverage: {
        coverageComplete: false,
        expectedEndpoints: SERVICE_API_ENDPOINTS.map(endpointKey),
        coveredEndpoints: []
      }
    };
  }

  const artifact = createServiceRequestReceipts({ context, identity });
  const artifactPath = path.join(context.runDir, 'service-requests.json');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  return {
    ok: artifact.coverage.coverageComplete,
    issues: artifact.coverage.issues,
    artifactPath,
    coverage: artifact.coverage,
    receipts: artifact.receipts,
    artifact
  };
}

export {
  SERVICE_REQUEST_RECEIPT_VERSION,
  createServiceRequestReceipts,
  writeServiceRequestReceipts
};
