import path from 'node:path';

function isInsidePath(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function createPermissionEngine(context) {
  const decisions = [];

  function decide({ claim, target, reason }) {
    const ts = new Date().toISOString();
    let decision = 'deny';
    let resolvedReason = reason ?? 'Denied by default.';

    if (claim === 'filesystem.write' && typeof target === 'string' && isInsidePath(context.runDir, target)) {
      decision = 'allow';
      resolvedReason = 'runtime artifact path allowed';
    } else if (claim === 'filesystem.write') {
      resolvedReason = 'filesystem.write is limited to the active runtime artifact path';
    } else if (claim === 'external.http') {
      resolvedReason = 'external actions are denied in Phase 1 dry-run';
    } else if (!claim) {
      resolvedReason = 'missing permission claim';
    }

    const result = {
      ts,
      runId: context.runId,
      claim,
      target,
      decision,
      reason: resolvedReason
    };
    decisions.push(result);
    return result;
  }

  return {
    decide,
    decisions
  };
}

export { createPermissionEngine, isInsidePath };
