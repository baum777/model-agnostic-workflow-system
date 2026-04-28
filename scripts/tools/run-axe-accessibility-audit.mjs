#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {
  buildRenderA11yChromiumLaunchOptions,
  buildEnvelope,
  ensureMode,
  isHttpUrl,
  normalizePath,
  readJsonFile,
  toFileUrl
} from './_render_a11y_shared.mjs';
import { checkRenderA11yRuntime } from './check-render-a11y-runtime.mjs';

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

function parseArgs(argv) {
  const args = {
    input: null,
    mode: 'certification',
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input' && argv[index + 1]) {
      args.input = argv[index + 1];
      index += 1;
    } else if (value === '--mode' && argv[index + 1]) {
      args.mode = argv[index + 1];
      index += 1;
    } else if (value === '--json') {
      args.json = true;
    }
  }

  return args;
}

function normalizePayload(baseRoot, args) {
  if (!args.input) {
    throw new Error('Missing --input <wcag-a11y-cases.json>.');
  }

  const absolutePath = path.resolve(baseRoot, args.input);
  const payload = readJsonFile(absolutePath);
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  if (cases.length === 0) {
    throw new Error('Input payload must include non-empty cases array.');
  }

  return {
    source: normalizePath(absolutePath),
    tags: Array.isArray(payload.axeTags) && payload.axeTags.length > 0 ? payload.axeTags : DEFAULT_TAGS,
    cases
  };
}

function resolveCaseTarget(baseRoot, mode, caseEntry) {
  if (!caseEntry.page || typeof caseEntry.page !== 'object') {
    throw new Error(`Case ${caseEntry.id || '<missing-id>'} must include page object.`);
  }

  if (typeof caseEntry.page.url === 'string' && caseEntry.page.url.trim() !== '') {
    const url = caseEntry.page.url.trim();
    if (mode === 'certification' && isHttpUrl(url)) {
      throw new Error(`Case ${caseEntry.id} uses external URL in certification mode.`);
    }
    return { source: url, navigateTo: url };
  }

  if (typeof caseEntry.page.file === 'string' && caseEntry.page.file.trim() !== '') {
    const absolute = path.resolve(baseRoot, caseEntry.page.file);
    return { source: normalizePath(absolute), navigateTo: toFileUrl(absolute) };
  }

  throw new Error(`Case ${caseEntry.id || '<missing-id>'} must include page.file or page.url.`);
}

function mapImpact(impact) {
  if (impact === 'critical' || impact === 'serious') return 'confirmed-issue';
  if (impact === 'moderate') return 'likely-issue';
  if (impact === 'minor') return 'manual-review-area';
  return 'not-assessed';
}

function flattenViolations(caseId, violations) {
  const findings = [];
  for (const violation of violations) {
    findings.push({
      status: mapImpact(violation.impact),
      severity: violation.impact || 'unknown',
      code: `axe.${violation.id}`,
      message: `${violation.help} (${violation.id})`,
      path: caseId,
      suggestedFix: violation.helpUrl || 'Review affected nodes and apply WCAG-aligned structure/label corrections.',
      nodes: (violation.nodes || []).slice(0, 5).map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary
      }))
    });
  }
  return findings;
}

export async function runAxeAccessibilityAudit(payload, options = {}) {
  const baseRoot = options.baseRoot || process.cwd();
  const mode = ensureMode(options.mode || payload.mode || 'certification');
  const runtime = await checkRenderA11yRuntime({ mode, baseRoot, includeChromeLauncher: false });
  if (!runtime.ok) {
    return buildEnvelope({
      ok: false,
      tool: 'run-axe-accessibility-audit',
      mode,
      input: { source: payload.source || null },
      runtime: runtime.runtime,
      evidence: { cases: [] },
      findings: runtime.findings,
      nonClaims: [
        'Axe scanning cannot run until runtime/browser dependencies are available.'
      ]
    });
  }

  const browser = await chromium.launch(buildRenderA11yChromiumLaunchOptions(chromium, {
    baseRoot,
    scope: 'axe-a11y-audit'
  }));
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const caseReports = [];
  const findings = [];

  try {
    for (const caseEntry of payload.cases) {
      if (typeof caseEntry.id !== 'string' || caseEntry.id.trim() === '') {
        throw new Error('Each case must declare a non-empty id.');
      }
      const resolved = resolveCaseTarget(baseRoot, mode, caseEntry);
      const page = await context.newPage();
      await page.goto(resolved.navigateTo, { waitUntil: 'domcontentloaded' });

      const result = await new AxeBuilder({ page }).withTags(payload.tags).analyze();
      await page.close();

      const caseFindings = flattenViolations(caseEntry.id, result.violations || []);
      findings.push(...caseFindings);

      caseReports.push({
        caseId: caseEntry.id,
        caseClass: caseEntry.class || null,
        target: resolved.source,
        summary: {
          violations: result.violations?.length || 0,
          incomplete: result.incomplete?.length || 0,
          passes: result.passes?.length || 0
        },
        violations: (result.violations || []).map((entry) => ({
          id: entry.id,
          impact: entry.impact,
          description: entry.description,
          help: entry.help,
          helpUrl: entry.helpUrl,
          tags: entry.tags,
          nodeCount: entry.nodes?.length || 0
        }))
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const ok = findings.every((entry) => entry.status !== 'confirmed-issue');
  return buildEnvelope({
    ok,
    tool: 'run-axe-accessibility-audit',
    mode,
    input: {
      source: payload.source || null,
      caseCount: payload.cases.length,
      tags: payload.tags
    },
    runtime: runtime.runtime,
    evidence: {
      caseReports,
      summary: {
        totalCases: caseReports.length,
        totalViolations: caseReports.reduce((sum, entry) => sum + entry.summary.violations, 0),
        totalIncomplete: caseReports.reduce((sum, entry) => sum + entry.summary.incomplete, 0)
      }
    },
    findings,
    nonClaims: [
      'Automated Axe scans provide bounded evidence, not complete legal or regulatory WCAG certification.',
      'Axe output does not replace manual assistive-technology testing.'
    ]
  });
}

function printHuman(report) {
  console.log('# Axe Accessibility Audit');
  console.log('');
  console.log(`- mode: ${report.mode}`);
  console.log(`- ok: ${report.ok}`);
  console.log(`- totalCases: ${report.evidence.summary.totalCases}`);
  console.log(`- totalViolations: ${report.evidence.summary.totalViolations}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = normalizePayload(process.cwd(), args);
    const report = await runAxeAccessibilityAudit(payload, {
      baseRoot: process.cwd(),
      mode: args.mode
    });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, tool: 'run-axe-accessibility-audit', error: error.message }, null, 2));
    process.exit(1);
  }
}
