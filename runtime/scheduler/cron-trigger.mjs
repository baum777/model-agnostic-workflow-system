const SUPPORTED_LOCAL_TRIGGER_TYPES = new Set(['manual', 'cron']);
const UNSUPPORTED_RUNTIME_TRIGGER_TYPES = new Set([
  'webhook',
  'message-queue',
  'file-change',
  'workflow-completion',
  'threshold'
]);

function hasString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateCronConfig(cronConfig = {}) {
  const issues = [];
  if (!hasString(cronConfig.expression)) {
    issues.push('cron_config.expression must be a non-empty string.');
  } else if (!/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(cronConfig.expression)) {
    issues.push('cron_config.expression must be a valid 5-field cron expression.');
  }

  if (!hasString(cronConfig.timezone)) {
    issues.push('cron_config.timezone must be a non-empty string.');
  }
  if (cronConfig.jitter_seconds !== undefined && (!Number.isInteger(cronConfig.jitter_seconds) || cronConfig.jitter_seconds < 0)) {
    issues.push('cron_config.jitter_seconds must be an integer >= 0.');
  }

  return {
    ok: issues.length === 0,
    issues,
    daemonStarted: false,
    backgroundJobsStarted: false,
    httpMcpStarted: false
  };
}

function validateSchedulerConfig(config = {}) {
  const issues = [];
  if (config.tsc_version !== '1.0.0') {
    issues.push('tsc_version must be 1.0.0.');
  }
  if (!hasString(config.workflow_id)) {
    issues.push('workflow_id must be a non-empty string.');
  }
  if (!hasString(config.trigger_type)) {
    issues.push('trigger_type must be a non-empty string.');
  }
  if (!Number.isInteger(config.max_concurrent_runs) || config.max_concurrent_runs < 1) {
    issues.push('max_concurrent_runs must be an integer >= 1.');
  }

  if (SUPPORTED_LOCAL_TRIGGER_TYPES.has(config.trigger_type)) {
    if (config.trigger_type === 'cron') {
      const cronValidation = validateCronConfig(config.cron_config);
      issues.push(...cronValidation.issues);
    }
  } else if (UNSUPPORTED_RUNTIME_TRIGGER_TYPES.has(config.trigger_type)) {
    issues.push(`${config.trigger_type} triggers are contract declarations only in Phase 6; no HTTP/MCP, queue, watcher, threshold, daemon, or background runtime is started.`);
  } else if (hasString(config.trigger_type)) {
    issues.push(`Unknown trigger_type: ${config.trigger_type}.`);
  }

  return {
    ok: issues.length === 0,
    issues,
    daemonStarted: false,
    backgroundJobsStarted: false,
    httpMcpStarted: false
  };
}

export { validateCronConfig, validateSchedulerConfig };
