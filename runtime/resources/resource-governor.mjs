import fs from 'node:fs';
import path from 'node:path';

function result(ok, check, details = {}) {
  return {
    ok,
    check,
    result: ok ? 'pass' : 'blocked',
    ...details
  };
}

function createResourceGovernor({
  context,
  timeoutMs = 5000,
  budgetCap = 10,
  cancellationMarker = path.join(context.runDir, 'CANCEL')
}) {
  function checkTimeout({ startedAtMs = Date.now(), nowMs = Date.now() } = {}) {
    const elapsedMs = nowMs - startedAtMs;
    return result(elapsedMs <= timeoutMs, 'timeout', { elapsedMs, timeoutMs });
  }

  function checkBudget({ plannedActions = 0 } = {}) {
    return result(plannedActions <= budgetCap, 'budget', { plannedActions, budgetCap });
  }

  function checkCancellation() {
    const cancelled = fs.existsSync(cancellationMarker);
    return result(!cancelled, 'cancellation', { cancellationMarker });
  }

  function evaluate({ startedAtMs = Date.now(), nowMs = Date.now(), plannedActions = 0 } = {}) {
    const checks = [
      checkTimeout({ startedAtMs, nowMs }),
      checkBudget({ plannedActions }),
      checkCancellation()
    ];
    return {
      result: checks.every((check) => check.ok) ? 'pass' : 'blocked',
      checks
    };
  }

  function writeReport(input = {}) {
    const report = {
      runId: context.runId,
      generatedAt: new Date().toISOString(),
      ...evaluate(input)
    };
    const resourcesPath = path.join(context.runDir, 'resources.json');
    fs.mkdirSync(path.dirname(resourcesPath), { recursive: true });
    fs.writeFileSync(resourcesPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return { ok: report.result === 'pass', report, resourcesPath };
  }

  return {
    checkTimeout,
    checkBudget,
    checkCancellation,
    evaluate,
    writeReport
  };
}

export { createResourceGovernor };
