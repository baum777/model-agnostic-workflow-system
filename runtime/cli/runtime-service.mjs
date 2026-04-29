#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateServiceModeRequest } from '../service/service-readiness.mjs';
import { runServicePreflight } from '../service/service-preflight.mjs';
import { expectedClaimForAction, simulateServiceAction } from '../service/service-actions.mjs';
import { resolveAuthContext } from '../auth/auth-context.mjs';

function parseServiceArgs(argv = process.argv.slice(2)) {
  const requestedTransports = [];
  let identity = null;
  let simulateAction = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--http') {
      requestedTransports.push('http');
    } else if (arg === '--mcp') {
      requestedTransports.push('mcp');
    } else if (arg === '--remote') {
      requestedTransports.push('remote');
    } else if (arg === '--identity') {
      identity = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--simulate-action') {
      simulateAction = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return {
    explicitServiceFlag: argv.includes('--enable-service-mode'),
    preflight: argv.includes('--preflight'),
    daemonRequested: argv.includes('--daemon'),
    requestedTransports,
    identity,
    simulateAction
  };
}

function runRuntimeService({ argv = process.argv.slice(2) } = {}) {
  const args = parseServiceArgs(argv);
  if (args.simulateAction) {
    const auth = resolveAuthContext({ cliIdentity: args.identity });
    if (!auth.ok) {
      return {
        ok: false,
        action: args.simulateAction,
        executionSimulated: false,
        serviceStartAllowed: false,
        listenerStarted: false,
        issues: auth.issues
      };
    }
    return simulateServiceAction({
      identity: auth.identity,
      action: args.simulateAction,
      claim: expectedClaimForAction(args.simulateAction)
    });
  }
  if (args.preflight) {
    return runServicePreflight({
      cliIdentity: args.identity,
      requestedTransports: args.requestedTransports,
      daemonRequested: args.daemonRequested
    });
  }
  return validateServiceModeRequest(args);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runRuntimeService();
  const output = JSON.stringify(result, null, 2);
  if (result.ok) {
    console.log(output);
    process.exit(0);
  }
  console.error(result.issues.join('\n'));
  console.error(output);
  process.exit(2);
}

export { parseServiceArgs, runRuntimeService };
