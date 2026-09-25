import path from 'node:path';

function isInsidePath(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// MAWS-VN-403 (additive): deny-by-default outbound categories that evaluate
// against explicit per-category allowlisted targets. These mirror the
// categories added to core/contracts/permission-boundary.json. A claim in
// this map is ALLOWED only when its target matches an explicit allowlist
// entry; everything else (including missing targets) stays DENY.
const OUTBOUND_CATEGORY_ALLOWLISTS = {
  'provider.typesafe.ask': ['api.typesafe.ai'],
  'provider.openrouter.completion': ['openrouter.ai'],
  'process.codex.exec': ['codex']
};

function normalizeOutboundTarget(target) {
  if (typeof target !== 'string' || target.length === 0) {
    return null;
  }
  try {
    return new URL(target).hostname.toLowerCase();
  } catch {
    return target.trim().toLowerCase();
  }
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
    } else if (typeof claim === 'string' && Object.prototype.hasOwnProperty.call(OUTBOUND_CATEGORY_ALLOWLISTS, claim)) {
      const allowlist = OUTBOUND_CATEGORY_ALLOWLISTS[claim];
      const normalizedTarget = normalizeOutboundTarget(target);
      if (normalizedTarget !== null && allowlist.includes(normalizedTarget)) {
        decision = 'allow';
        resolvedReason = `${claim} target ${normalizedTarget} is explicitly allowlisted`;
      } else {
        resolvedReason = `${claim} is denied by default; explicit allowlisted target required (${allowlist.join(', ')})`;
      }
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
