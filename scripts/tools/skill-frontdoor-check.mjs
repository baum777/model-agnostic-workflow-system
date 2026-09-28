#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { repoRoot as workspaceRoot, writeText } from './_shared.mjs';
import {
  classifyReport,
  createInstallRiskContext,
  runPreinstallSkillRiskCheck
} from './preinstall-skill-risk-check.mjs';
import {
  assertSkillImplementationFrontdoor,
  deriveSkillFrontdoorDisposition
} from '../../runtime/skills/frontdoor.mjs';
import { validateInstanceAgainstContract } from './validate-maws-vnext-contracts.mjs';

const CONTRACT = 'core/contracts/skill-frontdoor-admission.schema.json';
const ACTIONS = new Set(['implement', 'install', 'activate', 'import', 'bind', 'publish']);
const MAX_CANDIDATE_BYTES = 100 * 1024 * 1024;
const MAX_CANDIDATE_FILES = 10_000;

function isRemoteTarget(target) {
  return /^(https?|git|ssh|file):\/\//i.test(target) || target.startsWith('git@');
}

function normalizeLocalTarget(rawTarget, root) {
  const value = String(rawTarget || '').trim();
  if (!value) throw new Error('Target is required.');
  if (isRemoteTarget(value)) {
    throw new Error(
      'Remote skill candidates must be resolved to an immutable revision and staged locally before MAWS frontdoor evaluation.'
    );
  }
  const expanded = value.startsWith('~/')
    ? path.join(os.homedir(), value.slice(2))
    : value;
  const resolved = path.isAbsolute(expanded)
    ? path.normalize(expanded)
    : path.resolve(root, expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error('Target path does not exist: ' + resolved);
  }

  const canonical = fs.realpathSync(resolved);
  const stat = fs.lstatSync(canonical);
  if (!stat.isDirectory()) {
    throw new Error(
      'MAWS skill frontdoor requires a staged skill directory so SKILL.md and all supporting files share one scan boundary.'
    );
  }

  const skillFile = path.join(canonical, 'SKILL.md');
  if (!fs.existsSync(skillFile) || !fs.lstatSync(skillFile).isFile()) {
    throw new Error('Staged skill directory must contain a regular root SKILL.md file: ' + canonical);
  }

  return canonical;
}

function hashLocalTarget(target) {
  const hash = createHash('sha256');
  let fileCount = 0;
  let totalBytes = 0;

  function visit(absPath, relPath) {
    const stat = fs.lstatSync(absPath);
    if (stat.isSymbolicLink()) {
      throw new Error('Symlinks are not admitted in frontdoor candidate hashing: ' + absPath);
    }
    const mode = (stat.mode & 0o777).toString(8);
    if (stat.isDirectory()) {
      hash.update('D\0' + relPath + '\0' + mode + '\0');
      for (const name of fs.readdirSync(absPath).sort()) {
        visit(path.join(absPath, name), relPath ? relPath + '/' + name : name);
      }
      return;
    }
    if (!stat.isFile()) {
      throw new Error('Unsupported candidate filesystem entry: ' + absPath);
    }

    fileCount += 1;
    totalBytes += stat.size;
    if (fileCount > MAX_CANDIDATE_FILES) {
      throw new Error(
        'Skill candidate exceeds the MAWS frontdoor file-count limit of ' + MAX_CANDIDATE_FILES + '.'
      );
    }
    if (totalBytes > MAX_CANDIDATE_BYTES) {
      throw new Error(
        'Skill candidate exceeds the MAWS frontdoor byte limit of ' + MAX_CANDIDATE_BYTES + '.'
      );
    }

    hash.update('F\0' + relPath + '\0' + mode + '\0' + String(stat.size) + '\0');
    hash.update(fs.readFileSync(absPath));
    hash.update('\0');
  }

  visit(target, '');
  return {
    digest: hash.digest('hex'),
    fileCount,
    totalBytes
  };
}

function targetKind(target) {
  const stat = fs.lstatSync(target);
  if (stat.isDirectory()) return 'local-directory';
  const lower = target.toLowerCase();
  if (lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) {
    return 'archive';
  }
  return 'local-file';
}

function commandVersion(command) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unknown';
  const value = String(result.stdout || result.stderr || '').trim().split(/\r?\n/)[0];
  return value || 'unknown';
}

function normalizeSeverityCounts(input = {}) {
  return {
    critical: Number.isInteger(input.critical) ? input.critical : 0,
    high: Number.isInteger(input.high) ? input.high : 0,
    medium: Number.isInteger(input.medium) ? input.medium : 0,
    low: Number.isInteger(input.low) ? input.low : 0
  };
}

function deriveSecuritySeverity(report, classification) {
  const explicit = String(report?.severity || report?.risk_level || '').trim().toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'none'].includes(explicit)) return explicit;
  const counts = classification?.counts || {};
  if ((counts.critical || 0) > 0) return 'critical';
  if ((counts.high || 0) > 0) return 'high';
  if ((counts.medium || 0) > 0) return 'medium';
  if ((counts.low || 0) > 0) return 'low';
  if (classification?.ok === true) return 'none';
  return 'unknown';
}

function toRepoRelative(root, filePath) {
  const relative = path.relative(root, filePath).replace(/\\/g, '/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('Evidence path escaped repository root: ' + filePath);
  }
  return relative;
}

function newestJsonFile(dir) {
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const fullPath = path.join(dir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.fullPath.localeCompare(b.fullPath));
  return candidates[0]?.fullPath || null;
}

function runSkillEvaluator({ target, outputDir, root }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const args = [
    'validate',
    target,
    '--external',
    '--tiers',
    '1',
    '-r',
    'json',
    '-o',
    outputDir,
    '--min-score',
    '70'
  ];
  const result = spawnSync('skillevaluator', args, {
    cwd: root,
    encoding: 'utf8'
  });
  const reportPath = newestJsonFile(outputDir);
  let report = null;
  let reportError = null;
  if (reportPath) {
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (error) {
      reportError = error;
    }
  }
  return {
    command: ['skillevaluator', ...args],
    result: {
      status: Number.isInteger(result.status) ? result.status : 3,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error || null
    },
    reportPath,
    report,
    reportError
  };
}

function classifySkillEvaluator(run, version) {
  const report = run.report;
  const exitCode = run.result.status;
  const overallStatus = String(report?.overall_status || 'not-run').toLowerCase();
  const overallPassed = report?.overall_passed === true;
  let status = 'INCOMPLETE';

  if (
    version !== 'unknown' &&
    run.reportPath &&
    !run.reportError &&
    exitCode === 0 &&
    overallStatus === 'passed' &&
    overallPassed
  ) {
    status = 'PASS';
  } else if (
    run.reportPath &&
    !run.reportError &&
    (overallStatus === 'failed' || (report?.overall_passed === false && overallStatus !== 'incomplete'))
  ) {
    status = 'BLOCKED';
  }

  return {
    analyzer: 'NVIDIA/SkillEvaluator',
    version,
    profile: 'external',
    tier_scope: '1',
    exit_code: exitCode,
    report_path: run.reportPath,
    status,
    overall_status: ['passed', 'failed', 'incomplete'].includes(overallStatus) ? overallStatus : 'not-run',
    overall_passed: overallPassed,
    severity_counts: normalizeSeverityCounts(report?.severity_counts)
  };
}

function renderDecision(record, commands) {
  const blockerText = record.blockers.length ? record.blockers.join(', ') : 'none';
  return [
    '# MAWS Skill Frontdoor Decision',
    '',
    '- Admission ID: ' + record.admission_id,
    '- Skill ID: ' + record.candidate.skill_id,
    '- Target: ' + record.candidate.target,
    '- Source revision: ' + record.candidate.source_revision,
    '- Requested action: ' + record.requested_action,
    '- SkillSpector command: ' + commands.skillspector,
    '- SkillEvaluator command: ' + commands.skillevaluator,
    '- Analysis disposition: ' + record.analysis_disposition,
    '- Implementation disposition: ' + record.implementation_disposition,
    '- Authority granted: false',
    '- Blockers: ' + blockerText,
    '- Decided at: ' + record.decided_at,
    '',
    'PASS != authority. A clean frontdoor record only permits downstream MAWS governance to continue.',
    ''
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    skillId: '',
    target: '',
    action: 'implement',
    sourceRevision: '',
    repoRoot: workspaceRoot()
  };
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === '--skill-id') {
      parsed.skillId = argv[++index] || '';
    } else if (entry === '--target') {
      parsed.target = argv[++index] || '';
    } else if (entry === '--action') {
      parsed.action = argv[++index] || '';
    } else if (entry === '--source-revision') {
      parsed.sourceRevision = argv[++index] || '';
    } else if (entry === '--repo-root') {
      parsed.repoRoot = argv[++index] || parsed.repoRoot;
    } else if (entry === '--help' || entry === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/tools/skill-frontdoor-check.mjs --skill-id <id> --target <staged-local-skill> [--action implement] [--source-revision <immutable-ref>]',
    '',
    'Mandatory analyzers:',
    '  SkillSpector static --no-llm',
    '  SkillEvaluator validate --external --tiers 1 --min-score 70',
    '',
    'Remote URLs must be resolved to an immutable revision and staged locally before this command.'
  ].join('\n');
}

export function runSkillFrontdoor({
  skillId,
  target,
  action = 'implement',
  sourceRevision = '',
  repoRoot = workspaceRoot(),
  now = new Date()
} = {}) {
  const root = path.resolve(repoRoot);
  if (!String(skillId || '').trim()) throw new Error('Stable --skill-id is required.');
  if (!ACTIONS.has(action)) throw new Error('Unsupported action: ' + action);

  const resolvedTarget = normalizeLocalTarget(target, root);
  const candidateHash = hashLocalTarget(resolvedTarget);
  const digest = candidateHash.digest;
  const context = createInstallRiskContext({ repoRoot: root, now });
  fs.mkdirSync(context.runDir, { recursive: true });

  const skillspectorVersion = commandVersion('skillspector');
  const securityRun = runPreinstallSkillRiskCheck({
    repoRoot: root,
    target: resolvedTarget,
    type: 'skill',
    now,
    runDir: context.runDir,
    reportPath: context.reportPath
  });
  const securityClassification = securityRun.report ? classifyReport(securityRun.report) : null;
  const securitySeverity = deriveSecuritySeverity(securityRun.report, securityClassification);
  let securityStatus = 'INCOMPLETE';
  if (
    skillspectorVersion !== 'unknown' &&
    securityRun.execResult.status === 0 &&
    securityClassification?.ok === true
  ) {
    securityStatus = 'PASS';
  } else if (securityRun.report && securityClassification?.ok === false) {
    securityStatus = 'BLOCKED';
  }

  const evaluatorDir = path.join(context.runDir, 'skillevaluator');
  const evaluatorVersion = commandVersion('skillevaluator');
  const evaluatorRun = runSkillEvaluator({
    target: resolvedTarget,
    outputDir: evaluatorDir,
    root
  });
  const evaluatorEvidence = classifySkillEvaluator(evaluatorRun, evaluatorVersion);

  if (!evaluatorEvidence.report_path) {
    const stubPath = path.join(evaluatorDir, 'skillevaluator-incomplete.json');
    writeText(
      stubPath,
      JSON.stringify({
        status: 'incomplete',
        reason: evaluatorRun.result.error?.message || evaluatorRun.result.stderr || 'no report produced'
      }, null, 2) + '\n'
    );
    evaluatorEvidence.report_path = stubPath;
  }

  const securityCounts = normalizeSeverityCounts(securityClassification?.counts);
  const decidedAt = now.toISOString();
  const record = {
    schema_version: '1.0.0',
    admission_id: 'sfa_' + digest.slice(0, 12) + '_' + context.timestamp,
    candidate: {
      skill_id: String(skillId).trim(),
      target: resolvedTarget,
      target_kind: targetKind(resolvedTarget),
      source_revision: sourceRevision
        ? String(sourceRevision).trim() + ';sha256:' + digest
        : 'sha256:' + digest
    },
    requested_action: action,
    evidence: {
      skillspector: {
        analyzer: 'NVIDIA/SkillSpector',
        version: skillspectorVersion,
        scan_mode: 'static-no-llm',
        exit_code: Number.isInteger(securityRun.execResult.status) ? securityRun.execResult.status : 1,
        report_path: toRepoRelative(root, context.reportPath),
        status: securityStatus,
        severity: securitySeverity,
        ...(Number.isInteger(securityRun.report?.risk_score)
          ? { risk_score: securityRun.report.risk_score }
          : {}),
        severity_counts: securityCounts
      },
      skillevaluator_tier1: {
        ...evaluatorEvidence,
        report_path: toRepoRelative(root, evaluatorEvidence.report_path)
      }
    },
    analysis_disposition: 'INCOMPLETE',
    implementation_disposition: 'BLOCKED',
    authority_granted: false,
    blockers: [],
    decided_at: decidedAt
  };

  const derived = deriveSkillFrontdoorDisposition(record, { now: decidedAt });
  record.analysis_disposition = derived.analysis_disposition;
  record.implementation_disposition = derived.implementation_disposition;
  record.blockers = derived.blockers;

  const receiptPath = path.join(context.runDir, 'skill-frontdoor-admission.json');
  const decisionPath = path.join(context.runDir, 'skill-frontdoor-decision.md');
  writeText(receiptPath, JSON.stringify(record, null, 2) + '\n');
  writeText(
    decisionPath,
    renderDecision(record, {
      skillspector: securityRun.scanCommand,
      skillevaluator: evaluatorRun.command.join(' ')
    })
  );

  const schemaIssues = validateInstanceAgainstContract(record, CONTRACT, root);
  let assertion = null;
  let assertionError = null;
  if (schemaIssues.length === 0) {
    try {
      assertion = assertSkillImplementationFrontdoor(record, { root, now: decidedAt });
    } catch (error) {
      assertionError = error;
    }
  }

  return {
    ok: schemaIssues.length === 0 && !assertionError && assertion?.frontdoor_passed === true,
    record,
    receiptPath,
    decisionPath,
    schemaIssues,
    assertion,
    assertionError,
    commands: {
      skillspector: securityRun.scanCommand,
      skillevaluator: evaluatorRun.command.join(' ')
    }
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    const result = runSkillFrontdoor({
      skillId: args.skillId,
      target: args.target,
      action: args.action,
      sourceRevision: args.sourceRevision,
      repoRoot: args.repoRoot
    });
    console.log(JSON.stringify({
      ok: result.ok,
      admission_id: result.record.admission_id,
      analysis_disposition: result.record.analysis_disposition,
      implementation_disposition: result.record.implementation_disposition,
      authority_granted: false,
      blockers: result.record.blockers,
      receipt_path: result.receiptPath.replace(/\\/g, '/'),
      decision_path: result.decisionPath.replace(/\\/g, '/'),
      schema_issues: result.schemaIssues,
      error_code: result.assertionError?.code || null,
      error_message: result.assertionError?.message || null
    }, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      analysis_disposition: 'INCOMPLETE',
      implementation_disposition: 'BLOCKED',
      authority_granted: false,
      error: error.message
    }, null, 2));
    process.exit(1);
  }
}
