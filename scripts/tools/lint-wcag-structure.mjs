#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  buildRenderA11yChromiumLaunchOptions,
  buildEnvelope,
  classifyIssueStatus,
  ensureMode,
  isHttpUrl,
  normalizePath,
  readJsonFile,
  toFileUrl
} from './_render_a11y_shared.mjs';
import { checkRenderA11yRuntime } from './check-render-a11y-runtime.mjs';

function parseArgs(argv) {
  const args = { input: null, mode: 'certification', json: false };
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
    return { source: url, navigateTo: url };
  }

  if (typeof caseEntry.page.file === 'string' && caseEntry.page.file.trim() !== '') {
    const absolutePath = path.resolve(baseRoot, caseEntry.page.file);
    return { source: normalizePath(absolutePath), navigateTo: toFileUrl(absolutePath) };
  }

  throw new Error(`Case ${caseEntry.id || '<missing-id>'} must include page.file or page.url.`);
}

async function collectStructureSignals(page) {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((node) => node.tagName.toLowerCase());
    const landmarkMain = document.querySelectorAll('main, [role="main"]').length;

    const unlabeledControls = [...document.querySelectorAll('input, select, textarea')]
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const id = node.getAttribute('id');
        const labelFor = Boolean(id && document.querySelector(`label[for="${id}"]`));
        const aria = Boolean(node.getAttribute('aria-label') || node.getAttribute('aria-labelledby'));
        return !labelFor && !aria;
      })
      .map((node) => node.tagName.toLowerCase());

    const unnamedButtons = [...document.querySelectorAll('button, [role="button"]')]
      .filter((node) => {
        const text = (node.textContent || '').trim();
        const aria = node.getAttribute('aria-label') || node.getAttribute('aria-labelledby');
        return !text && !aria;
      }).length;

    const emptyLinks = [...document.querySelectorAll('a')]
      .filter((node) => {
        const text = (node.textContent || '').trim();
        const aria = node.getAttribute('aria-label') || node.getAttribute('aria-labelledby');
        return !text && !aria;
      }).length;

    const imagesWithoutAlt = [...document.querySelectorAll('img')]
      .filter((node) => !node.hasAttribute('alt')).length;

    return {
      lang: document.documentElement.getAttribute('lang') || null,
      headingCount: headings.length,
      h1Count: headings.filter((value) => value === 'h1').length,
      headings,
      landmarkMain,
      unlabeledControlCount: unlabeledControls.length,
      unnamedButtons,
      emptyLinks,
      imagesWithoutAlt
    };
  });
}

function pushFinding(findings, caseId, status, severity, code, message, suggestedFix) {
  findings.push({
    status,
    severity,
    code,
    message,
    path: caseId,
    suggestedFix
  });
}

export async function lintWcagStructure(payload, options = {}) {
  const baseRoot = options.baseRoot || process.cwd();
  const mode = ensureMode(options.mode || payload.mode || 'certification');
  const runtime = await checkRenderA11yRuntime({ mode, baseRoot, includeChromeLauncher: false });
  if (!runtime.ok) {
    return buildEnvelope({
      ok: false,
      tool: 'lint-wcag-structure',
      mode,
      input: { source: payload.source || null },
      runtime: runtime.runtime,
      evidence: { caseReports: [] },
      findings: runtime.findings,
      nonClaims: [
        'WCAG structure lint requires runtime/browser dependencies; missing runtime fails closed in certification mode.'
      ]
    });
  }

  const browser = await chromium.launch(buildRenderA11yChromiumLaunchOptions(chromium, {
    baseRoot,
    scope: 'wcag-structure-lint'
  }));
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const findings = [];
  const caseReports = [];

  try {
    for (const caseEntry of payload.cases) {
      if (typeof caseEntry.id !== 'string' || caseEntry.id.trim() === '') {
        throw new Error('Each case must declare a non-empty id.');
      }

      const target = resolveCaseTarget(baseRoot, mode, caseEntry);
      const page = await context.newPage();
      await page.goto(target.navigateTo, { waitUntil: 'domcontentloaded' });
      const signals = await collectStructureSignals(page);
      await page.close();

      if (!signals.lang) {
        pushFinding(
          findings,
          caseEntry.id,
          'likely-issue',
          'warning',
          'wcag-structure.missing_lang',
          `Case ${caseEntry.id} is missing html lang attribute.`,
          'Set <html lang="..."> to match page language.'
        );
      }
      if (signals.landmarkMain === 0) {
        pushFinding(
          findings,
          caseEntry.id,
          classifyIssueStatus({ severity: 'error', confidence: 'high' }),
          'error',
          'wcag-structure.missing_main',
          `Case ${caseEntry.id} has no main landmark.`,
          'Add a main element or role="main".'
        );
      }
      if (signals.unlabeledControlCount > 0) {
        pushFinding(
          findings,
          caseEntry.id,
          classifyIssueStatus({ severity: 'error', confidence: 'high' }),
          'error',
          'wcag-structure.unlabeled_form_control',
          `Case ${caseEntry.id} has ${signals.unlabeledControlCount} unlabeled form controls.`,
          'Provide label[for], aria-label, or aria-labelledby for each control.'
        );
      }
      if (signals.unnamedButtons > 0) {
        pushFinding(
          findings,
          caseEntry.id,
          classifyIssueStatus({ severity: 'error', confidence: 'high' }),
          'error',
          'wcag-structure.unnamed_button',
          `Case ${caseEntry.id} has ${signals.unnamedButtons} unnamed buttons.`,
          'Add visible text or aria labels for all buttons.'
        );
      }
      if (signals.emptyLinks > 0) {
        pushFinding(
          findings,
          caseEntry.id,
          'manual-review-area',
          'info',
          'wcag-structure.empty_link',
          `Case ${caseEntry.id} has ${signals.emptyLinks} links without accessible names.`,
          'Ensure links have visible text or aria labels.'
        );
      }
      if (signals.imagesWithoutAlt > 0) {
        pushFinding(
          findings,
          caseEntry.id,
          'likely-issue',
          'warning',
          'wcag-structure.image_missing_alt',
          `Case ${caseEntry.id} has ${signals.imagesWithoutAlt} images without alt text.`,
          'Provide meaningful alt text or alt="" for decorative images.'
        );
      }

      caseReports.push({
        caseId: caseEntry.id,
        caseClass: caseEntry.class || null,
        target: target.source,
        signals
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const ok = findings.every((entry) => entry.status !== 'confirmed-issue');
  return buildEnvelope({
    ok,
    tool: 'lint-wcag-structure',
    mode,
    input: {
      source: payload.source || null,
      caseCount: payload.cases.length
    },
    runtime: runtime.runtime,
    evidence: {
      caseReports
    },
    findings,
    nonClaims: [
      'This structural lint is bounded and complements, but does not replace, automated scanners and manual accessibility validation.',
      'No legal or complete WCAG certification is claimed.'
    ]
  });
}

function printHuman(report) {
  console.log('# WCAG Structure Lint');
  console.log('');
  console.log(`- mode: ${report.mode}`);
  console.log(`- ok: ${report.ok}`);
  console.log(`- cases: ${report.evidence.caseReports.length}`);
  console.log(`- findings: ${report.findings.length}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = normalizePayload(process.cwd(), args);
    const report = await lintWcagStructure(payload, {
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
    console.error(JSON.stringify({ ok: false, tool: 'lint-wcag-structure', error: error.message }, null, 2));
    process.exit(1);
  }
}
