#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from 'playwright';
import {
  buildRenderA11yChromiumLaunchOptions,
  buildEnvelope,
  ensureMode,
  isHttpUrl,
  normalizePath,
  readJsonFile,
  resolveRenderA11yUserDataDir,
  startStaticServer
} from './_render_a11y_shared.mjs';
import { checkRenderA11yRuntime } from './check-render-a11y-runtime.mjs';

const LIGHTHOUSE_CATEGORIES = ['accessibility', 'best-practices', 'performance', 'seo'];

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
    return { targetType: 'url', absoluteFile: null, source: url };
  }

  if (typeof caseEntry.page.file === 'string' && caseEntry.page.file.trim() !== '') {
    const absoluteFile = path.resolve(baseRoot, caseEntry.page.file);
    const relativePath = path.relative(baseRoot, absoluteFile);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Case ${caseEntry.id} file escapes repository root.`);
    }
    return {
      targetType: 'file',
      absoluteFile,
      relativePath: relativePath.replace(/\\/g, '/'),
      source: normalizePath(absoluteFile)
    };
  }

  throw new Error(`Case ${caseEntry.id || '<missing-id>'} must include page.file or page.url.`);
}

function classifyScore(score) {
  if (score == null) return 'not-assessed';
  if (score < 0.75) return 'confirmed-issue';
  if (score < 0.9) return 'likely-issue';
  return 'not-assessed';
}

function categoriesFromLhr(lhr) {
  const categories = {};
  for (const key of LIGHTHOUSE_CATEGORIES) {
    const category = lhr.categories?.[key];
    categories[key] = {
      score: category?.score ?? null,
      title: category?.title || null
    };
  }
  return categories;
}

function compactAudits(lhr) {
  const importantAuditIds = [
    'color-contrast',
    'image-alt',
    'label',
    'button-name',
    'aria-allowed-attr',
    'heading-order'
  ];
  const audits = [];
  for (const id of importantAuditIds) {
    const audit = lhr.audits?.[id];
    if (!audit) continue;
    audits.push({
      id,
      title: audit.title,
      score: audit.score,
      scoreDisplayMode: audit.scoreDisplayMode
    });
  }
  return audits;
}

export async function runLighthousePageAudit(payload, options = {}) {
  const baseRoot = options.baseRoot || process.cwd();
  const mode = ensureMode(options.mode || payload.mode || 'certification');
  const runtime = await checkRenderA11yRuntime({ mode, baseRoot });
  if (!runtime.ok) {
    return buildEnvelope({
      ok: false,
      tool: 'run-lighthouse-page-audit',
      mode,
      input: { source: payload.source || null },
      runtime: runtime.runtime,
      evidence: { caseReports: [] },
      findings: runtime.findings,
      nonClaims: [
        'Lighthouse execution requires browser runtime dependencies and cannot be skipped in certification mode.'
      ]
    });
  }

  let staticServer = null;
  let chrome = null;
  const caseReports = [];
  const findings = [];

  try {
    if (payload.cases.some((entry) => entry?.page?.file)) {
      staticServer = await startStaticServer(baseRoot);
    }

    const launchOptions = buildRenderA11yChromiumLaunchOptions(chromium, { baseRoot, scope: 'lighthouse-audit' });
    const chromePath = launchOptions.executablePath || chromium.executablePath();
    const userDataDir = resolveRenderA11yUserDataDir({ baseRoot, scope: 'lighthouse-chrome-launcher' });
    chrome = await launch({
      chromePath,
      userDataDir,
      logLevel: 'silent',
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
    });

    for (const caseEntry of payload.cases) {
      if (typeof caseEntry.id !== 'string' || caseEntry.id.trim() === '') {
        throw new Error('Each case must declare a non-empty id.');
      }
      const target = resolveCaseTarget(baseRoot, mode, caseEntry);
      const auditUrl = target.targetType === 'file'
        ? `${staticServer.baseUrl}/${target.relativePath}`
        : target.source;

      const runnerResult = await lighthouse(auditUrl, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        disableStorageReset: true,
        onlyCategories: LIGHTHOUSE_CATEGORIES
      });

      const lhr = runnerResult.lhr;
      const categories = categoriesFromLhr(lhr);
      const audits = compactAudits(lhr);
      const accessibilityStatus = classifyScore(categories.accessibility.score);

      if (accessibilityStatus !== 'not-assessed') {
        findings.push({
          status: accessibilityStatus,
          severity: accessibilityStatus === 'confirmed-issue' ? 'error' : 'warning',
          code: 'lighthouse.accessibility_score',
          message: `Accessibility score for ${caseEntry.id} is ${categories.accessibility.score}.`,
          path: caseEntry.id,
          suggestedFix: 'Address failed accessibility audits (labels, contrast, semantics) and rerun.'
        });
      }

      caseReports.push({
        caseId: caseEntry.id,
        caseClass: caseEntry.class || null,
        target: target.source,
        auditedUrl: auditUrl,
        categories,
        audits
      });
    }
  } finally {
    if (chrome) {
      await chrome.kill();
    }
    if (staticServer) {
      await staticServer.close();
    }
  }

  const ok = findings.every((entry) => entry.status !== 'confirmed-issue');
  return buildEnvelope({
    ok,
    tool: 'run-lighthouse-page-audit',
    mode,
    input: {
      source: payload.source || null,
      caseCount: payload.cases.length,
      categories: LIGHTHOUSE_CATEGORIES
    },
    runtime: runtime.runtime,
    evidence: {
      caseReports,
      summary: {
        totalCases: caseReports.length,
        avgAccessibility: Number((caseReports.reduce((sum, entry) => sum + (entry.categories.accessibility.score ?? 0), 0) / caseReports.length).toFixed(3))
      }
    },
    findings,
    nonClaims: [
      'Lighthouse scores are automated evidence and can vary by runtime environment.',
      'Lighthouse output is not complete legal or full WCAG certification evidence.'
    ]
  });
}

function printHuman(report) {
  console.log('# Lighthouse Page Audit');
  console.log('');
  console.log(`- mode: ${report.mode}`);
  console.log(`- ok: ${report.ok}`);
  console.log(`- totalCases: ${report.evidence.summary.totalCases}`);
  console.log(`- avgAccessibility: ${report.evidence.summary.avgAccessibility}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = normalizePayload(process.cwd(), args);
    const report = await runLighthousePageAudit(payload, {
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
    console.error(JSON.stringify({ ok: false, tool: 'run-lighthouse-page-audit', error: error.message }, null, 2));
    process.exit(1);
  }
}
