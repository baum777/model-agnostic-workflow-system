import fs from 'node:fs';
import path from 'node:path';
import {
  SERVICE_CAPABLE_ACTIONS,
  expectedClaimForAction,
  simulateServiceAction,
  validateServiceActionPermissionCoverage
} from './service-actions.mjs';

const SERVICE_ACTION_RECEIPT_VERSION = '1.0.0';

function createServiceActionReceipts({ context, identity } = {}) {
  const coverage = validateServiceActionPermissionCoverage({ identity });
  const receipts = SERVICE_CAPABLE_ACTIONS.map((action) => {
    const simulated = simulateServiceAction({
      identity,
      action,
      claim: expectedClaimForAction(action)
    });

    return {
      receiptVersion: SERVICE_ACTION_RECEIPT_VERSION,
      runId: context.runId,
      createdAt: new Date().toISOString(),
      action,
      identity: {
        id: identity.id,
        source: identity.source,
        trust: identity.trust
      },
      claim: expectedClaimForAction(action),
      claimBinding: {
        result: simulated.ok ? 'pass' : 'blocked',
        binding: simulated.binding ?? null,
        issues: simulated.issues
      },
      execution: {
        simulated: simulated.executionSimulated,
        transport: simulated.transport,
        listenerStarted: false,
        httpMcpStarted: false,
        remoteTransportStarted: false,
        daemonStarted: false,
        serviceStartAllowed: false
      }
    };
  });

  return {
    serviceActionReceiptVersion: SERVICE_ACTION_RECEIPT_VERSION,
    runId: context.runId,
    createdAt: new Date().toISOString(),
    coverage: {
      coverageComplete: coverage.coverageComplete,
      expectedActions: coverage.expectedActions,
      coveredActions: coverage.coveredActions,
      issues: coverage.issues
    },
    receipts
  };
}

function writeServiceActionReceipts({ context, identity } = {}) {
  const issues = [];
  if (!context?.runId || !context?.runDir) {
    issues.push('service action receipts require an active runtime context.');
  }
  if (!identity?.id) {
    issues.push('service action receipts require identity.');
  }
  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      receipts: [],
      coverage: {
        coverageComplete: false,
        expectedActions: SERVICE_CAPABLE_ACTIONS,
        coveredActions: []
      }
    };
  }

  const artifact = createServiceActionReceipts({ context, identity });
  const artifactPath = path.join(context.runDir, 'service-actions.json');
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
  SERVICE_ACTION_RECEIPT_VERSION,
  createServiceActionReceipts,
  writeServiceActionReceipts
};
