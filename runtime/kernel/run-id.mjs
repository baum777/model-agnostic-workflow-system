import crypto from 'node:crypto';

function createRunId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const suffix = crypto.randomBytes(4).toString('hex');
  return `run_${timestamp}_${suffix}`;
}

export { createRunId };
