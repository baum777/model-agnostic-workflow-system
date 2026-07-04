#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exists, isInsideRoot, repoRoot as workspaceRoot, writeText } from './_shared.mjs';

const ALLOWED_INSTALL_TYPES = new Set(['skill', 'extension', 'theme', 'mcp', 'package', 'plugin', 'other']);
const DEFAULT_REPORT_FILENAME = 'skillspector-report.json';
const DEFAULT_DECISION_FILENAME = 'install-risk-decision.md';

function formatTimestamp(now = new Date()) {
  const iso = now.toISOString();
  const [datePart, timePart] = iso.split('T');
  const compactDate = datePart.replace(/-/g, '');
  const compactTime = timePart.replace(/:\d{3}Z$/, 'Z').replace(/:/g, '');
  return `${compactDate}T${compactTime}`;
}

function normalizeType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('Install type is required.');
  }
  if (!ALLOWED_INSTALL_TYPES.has(normalized)) {
    throw new Error(`Unsupported install type: ${type}`);
  }
  return normalized;
}

function isRemoteTarget(target) {
  return /^(https?|git|ssh|file):\/\//i.test(target) || target.startsWith('git@');
}

function resolveTarget(target, repoRoot) {
  const rawTarget = String(target || '').trim();
  if (!rawTarget) {
    throw new Error('Target is required.');
  }

  if (isRemoteTarget(rawTarget)) {
    return rawTarget;
  }

  const expandedTarget = rawTarget.startsWith('~/')
    ? path.join(process.env.HOME || '', rawTarget.slice(2))
    : rawTarget;
  const resolvedTarget = path.isAbsolute(expandedTarget)
    ? path.normalize(expandedTarget)
    : path.resolve(repoRoot, expandedTarget);

  if (!exists(resolvedTarget)) {
    throw new Error(`Target path does not exist: ${resolvedTarget}`);
  }

  return resolvedTarget;
}

function createInstallRiskContext({ repoRoot = workspaceRoot(), now = new Date() } = {}) {
  const root = path.resolve(repoRoot);
  const timestamp = formatTimestamp(now);
  const runDir = path.join(root, 'sandbox', 'runs', timestamp);
  const reportPath = path.join(runDir, DEFAULT_REPORT_FILENAME);
  const decisionPath = path.join(runDir, DEFAULT_DECISION_FILENAME);
  return { repoRoot: root, timestamp, runDir, reportPath, decisionPath };
}

function buildSkillSpectorScanCommand({ target, reportPath }) {
  const resolvedTarget = String(target || '').trim();
  const resolvedReportPath = String(reportPath || '').trim();
  if (!resolvedTarget) {
    throw new Error('Target is required.');
  }
  if (!resolvedReportPath) {
    throw new Error('Report path is required.');
  }

  return [
    'skillspector',
    'scan',
    resolvedTarget,
    '--no-llm',
    '--format',
    'json',
    '--output',
    resolvedReportPath
  ];
}

function defaultExecutor({ command, args, cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8'
  });

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null
  };
}

function summarizeFindings(findings) {
  const counts = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    unknown: 0
  };

  for (const finding of findings) {
    const severity = String(finding?.severity ?? finding?.level ?? finding?.risk ?? '').trim().toLowerCase();
    if (severity in counts) {
      counts[severity] += 1;
    } else {
      counts.unknown += 1;
    }
  }

  return counts;
}

function collectFindings(report) {
  if (Array.isArray(report?.findings)) {
    return report.findings;
  }
  if (Array.isArray(report?.issues)) {
    return report.issues;
  }
  if (Array.isArray(report?.results)) {
    return report.results;
  }
  return [];
}

function extractReportStatus(report) {
  return String(report?.status ?? report?.result ?? report?.verdict ?? '').trim().toLowerCase();
}

function classifyReport(report) {
  const findings = collectFindings(report);
  const status = extractReportStatus(report);
  const hasFindingsArray = Array.isArray(report?.findings) || Array.isArray(report?.issues) || Array.isArray(report?.results);
  const counts = summarizeFindings(findings);
  const blockingFinding = findings.find((finding) => {
    const severity = String(finding?.severity ?? finding?.level ?? finding?.risk ?? '').trim().toLowerCase();
    return severity === 'high' || severity === 'critical';
  });

  if (status === 'blocked' || status === 'fail' || status === 'failed' || status === 'error') {
    return {
      ok: false,
      reason: `scanner reported ${status}`,
      findings,
      counts
    };
  }

  if (blockingFinding) {
    return {
      ok: false,
      reason: 'blocking findings present',
      findings,
      counts
    };
  }

  if (status === 'pass' || status === 'ok' || status === 'allow' || status === 'allowed' || status === 'clean') {
    return {
      ok: true,
      reason: 'scanner passed',
      findings,
      counts
    };
  }

  if (hasFindingsArray) {
    return {
      ok: true,
      reason: 'scanner findings contained no blocking severity',
      findings,
      counts
    };
  }

  return {
    ok: false,
    reason: 'report schema not understood',
    findings,
    counts
  };
}

function renderDecisionMarkdown({
  evidencePath,
  target,
  type,
  scanCommand,
  reportPath,
  findingsSummary,
  blockReason,
  classificationReason,
  ownerDecision,
  acceptedRisk,
  scopeLimit,
  rollbackPath,
  createdAt
}) {
  const classificationLine = classificationReason ? `- Classification reason: ${classificationReason}\n` : '';
  return `# Install Risk Decision

- Evidence path: ${evidencePath}
- Target: ${target}
- Type: ${type}
- Scan command: ${scanCommand}
- Report path: ${reportPath}
- Findings summary: ${findingsSummary}
- Block reason: ${blockReason}
${classificationLine}- Owner decision: ${ownerDecision}
- Accepted risk: ${acceptedRisk}
- Scope limit: ${scopeLimit}
- Rollback path: ${rollbackPath}
- Date: ${createdAt}
`;
}

function runPreinstallSkillRiskCheck({
  repoRoot = workspaceRoot(),
  target,
  type,
  executor = defaultExecutor,
  now = new Date(),
  runDir: requestedRunDir,
  reportPath: requestedReportPath
} = {}) {
  const context = createInstallRiskContext({ repoRoot, now });
  const runDir = requestedRunDir ? path.resolve(requestedRunDir) : context.runDir;
  const reportPath = requestedReportPath ? path.resolve(requestedReportPath) : context.reportPath;
  const decisionPath = path.join(runDir, DEFAULT_DECISION_FILENAME);

  if (!isInsideRoot(path.join(context.repoRoot, 'sandbox', 'runs'), runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
    writeText(
      decisionPath,
      renderDecisionMarkdown({
        evidencePath: `${runDir.replace(/\\/g, '/')}/`,
        target: String(target || '<missing>'),
        type: String(type || '<missing>'),
        scanCommand: 'not run',
        reportPath,
        findingsSummary: 'no parsed report',
        blockReason: `Run directory must live under sandbox/runs: ${runDir}`,
        ownerDecision: 'blocked',
        acceptedRisk: 'none',
        scopeLimit: 'exact target only; no transitive install scope',
        rollbackPath: 'rerun the gate and let it create the default sandbox/runs timestamped directory',
        createdAt: now.toISOString()
      })
    );
    return {
      ok: false,
      blocked: true,
      blockReason: `Run directory must live under sandbox/runs: ${runDir}`,
      runDir,
      reportPath,
      decisionPath,
      target: String(target || ''),
      type: String(type || ''),
      scanCommand: 'not run',
      findingsSummary: 'no parsed report',
      execResult: { status: 1, stdout: '', stderr: '', error: null },
      report: null
    };
  }

  fs.mkdirSync(runDir, { recursive: true });

  let installType;
  let resolvedTarget;
  try {
    installType = normalizeType(type);
    resolvedTarget = resolveTarget(target, context.repoRoot);
  } catch (error) {
    writeText(
      decisionPath,
      renderDecisionMarkdown({
        evidencePath: `${runDir.replace(/\\/g, '/')}/`,
        target: String(target || '<missing>'),
        type: String(type || '<missing>'),
        scanCommand: 'not run',
        reportPath,
        findingsSummary: 'no parsed report',
        blockReason: error.message,
        ownerDecision: 'blocked',
        acceptedRisk: 'none',
        scopeLimit: 'exact target only; no transitive install scope',
        rollbackPath: 'rerun the gate with an explicit exact target and install type',
        createdAt: now.toISOString()
      })
    );
    return {
      ok: false,
      blocked: true,
      blockReason: error.message,
      runDir,
      reportPath,
      decisionPath,
      target: String(target || ''),
      type: String(type || ''),
      scanCommand: 'not run',
      findingsSummary: 'no parsed report',
      execResult: { status: 1, stdout: '', stderr: '', error: null },
      report: null
    };
  }

  if (!isInsideRoot(runDir, reportPath)) {
    writeText(
      decisionPath,
      renderDecisionMarkdown({
        evidencePath: `${runDir.replace(/\\/g, '/')}/`,
        target: resolvedTarget,
        type: installType === 'mcp' ? 'MCP' : installType,
        scanCommand: 'not run',
        reportPath,
        findingsSummary: 'no parsed report',
        blockReason: `Report path must stay inside the run directory: ${reportPath}`,
        ownerDecision: 'blocked',
        acceptedRisk: 'none',
        scopeLimit: 'exact target only; no transitive install scope',
        rollbackPath: 'rerun the gate with a report path inside the generated run directory',
        createdAt: now.toISOString()
      })
    );
    return {
      ok: false,
      blocked: true,
      blockReason: `Report path must stay inside the run directory: ${reportPath}`,
      runDir,
      reportPath,
      decisionPath,
      target: resolvedTarget,
      type: installType,
      scanCommand: 'not run',
      findingsSummary: 'no parsed report',
      execResult: { status: 1, stdout: '', stderr: '', error: null },
      report: null
    };
  }

  const command = buildSkillSpectorScanCommand({
    target: resolvedTarget,
    reportPath
  });
  const [bin, ...args] = command;
  const execResult = executor({
    command: bin,
    args,
    cwd: context.repoRoot,
    reportPath,
    runDir
  });

  const scanCommand = command.map((part) => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ');
  let report = null;
  let reportReadError = null;
  if (fs.existsSync(reportPath)) {
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (error) {
      reportReadError = error;
    }
  }

  const reportClassification = report ? classifyReport(report) : null;
  const scanFailed = execResult.error || execResult.status !== 0;
  const reportMissing = !fs.existsSync(reportPath);
  const reportUnreadable = Boolean(reportReadError);
  const scanBlocked = Boolean(
    scanFailed ||
    reportMissing ||
    reportUnreadable ||
    (reportClassification && !reportClassification.ok) ||
    (!reportClassification && !reportMissing)
  );

  let blockReason = 'none';
  if (execResult.error) {
    blockReason = `skillspector invocation failed: ${execResult.error.code || execResult.error.message}`;
  } else if (execResult.status !== 0) {
    blockReason = `skillspector exited with status ${execResult.status}`;
  } else if (reportMissing) {
    blockReason = 'skillspector report missing';
  } else if (reportUnreadable) {
    blockReason = 'skillspector report unreadable';
  } else if (reportClassification && !reportClassification.ok) {
    blockReason = reportClassification.reason;
  } else if (!reportClassification) {
    blockReason = 'report schema not understood';
  }

  const ownerDecision = scanBlocked ? 'blocked' : 'install allowed';
  const acceptedRisk = scanBlocked ? 'none' : 'none';
  const scopeLimit = 'exact target only; no transitive install scope';
  const rollbackPath = 'revert the exact install, remove the added artifact, and rerun the gate before retrying';
  const findingsSummary = reportClassification
    ? `low=${reportClassification.counts.low}, medium=${reportClassification.counts.medium}, high=${reportClassification.counts.high}, critical=${reportClassification.counts.critical}, unknown=${reportClassification.counts.unknown}`
    : 'no parsed report';

  const classificationReason = reportClassification?.reason ?? null;

  writeText(
    decisionPath,
    renderDecisionMarkdown({
      evidencePath: `${runDir.replace(/\\/g, '/')}/`,
      target: resolvedTarget,
      type: installType === 'mcp' ? 'MCP' : installType,
      scanCommand,
      reportPath,
      findingsSummary,
      blockReason,
      classificationReason,
      ownerDecision,
      acceptedRisk,
      scopeLimit,
      rollbackPath,
      createdAt: now.toISOString()
    })
  );

  return {
    ok: !scanBlocked,
    blocked: scanBlocked,
    blockReason,
    runDir,
    reportPath,
    decisionPath,
    target: resolvedTarget,
    type: installType,
    scanCommand,
    findingsSummary,
    execResult,
    report
  };
}

function parseArgs(argv) {
  const args = {
    target: '',
    type: '',
    repoRoot: workspaceRoot(),
    runDir: '',
    reportPath: ''
  };

  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === '--target') {
      args.target = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (entry === '--type') {
      args.type = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (entry === '--repo-root') {
      args.repoRoot = argv[index + 1] || args.repoRoot;
      index += 1;
      continue;
    }
    if (entry === '--run-dir') {
      args.runDir = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (entry === '--report-path') {
      args.reportPath = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (entry === '--help' || entry === '-h') {
      args.help = true;
      continue;
    }
    if (entry.startsWith('--')) {
      continue;
    }
    positional.push(entry);
  }

  if (!args.target && positional.length > 0) {
    args.target = positional[0];
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/tools/preinstall-skill-risk-check.mjs --type <skill|extension|theme|mcp|package|plugin|other> --target <exact-target> [--repo-root <path>] [--run-dir <path>] [--report-path <path>]

The helper runs the static SkillSpector scan only:
  skillspector scan <target> --no-llm --format json --output <report-path>
`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      printUsage();
      process.exit(0);
    }

    const result = runPreinstallSkillRiskCheck({
      repoRoot: parsed.repoRoot,
      target: parsed.target,
      type: parsed.type,
      runDir: parsed.runDir || undefined,
      reportPath: parsed.reportPath || undefined
    });

    console.log(JSON.stringify({
      ok: result.ok,
      blocked: result.blocked,
      blockReason: result.blockReason,
      runDir: result.runDir.replace(/\\/g, '/'),
      reportPath: result.reportPath.replace(/\\/g, '/'),
      decisionPath: result.decisionPath.replace(/\\/g, '/'),
      target: result.target,
      type: result.type,
      scanCommand: result.scanCommand
    }, null, 2));

    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      blocked: true,
      blockReason: error.message
    }, null, 2));
    process.exit(1);
  }
}

export {
  buildSkillSpectorScanCommand,
  classifyReport,
  createInstallRiskContext,
  renderDecisionMarkdown,
  resolveTarget,
  runPreinstallSkillRiskCheck
};
