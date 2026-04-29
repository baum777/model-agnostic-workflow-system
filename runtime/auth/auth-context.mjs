const ALLOWED_IDENTITIES = new Set(['local-user', 'ci', 'agent']);
const CONTROLLED_SOURCES = new Set(['cli', 'env', 'fixture']);

function hasString(value) {
  return typeof value === 'string' && value.length > 0;
}

function resolveAuthContext({ cliIdentity = null, env = process.env, fixtureIdentity = null } = {}) {
  const issues = [];
  let identityId = null;
  let source = null;

  if (hasString(cliIdentity)) {
    identityId = cliIdentity;
    source = 'cli';
  } else if (hasString(fixtureIdentity)) {
    identityId = fixtureIdentity;
    source = 'fixture';
  } else if (hasString(env.RUNTIME_IDENTITY)) {
    identityId = env.RUNTIME_IDENTITY;
    source = 'env';
  }

  if (!hasString(identityId)) {
    issues.push('identity is required for service auth preflight.');
  } else if (!ALLOWED_IDENTITIES.has(identityId)) {
    issues.push(`unknown identity: ${identityId}.`);
  }

  if (source && !CONTROLLED_SOURCES.has(source)) {
    issues.push(`identity source ${source} is not controlled.`);
  }

  if (issues.length > 0) {
    return {
      ok: false,
      identity: null,
      issues
    };
  }

  return {
    ok: true,
    identity: {
      id: identityId,
      source,
      trust: 'controlled-local'
    },
    issues: []
  };
}

export { ALLOWED_IDENTITIES, CONTROLLED_SOURCES, resolveAuthContext };
