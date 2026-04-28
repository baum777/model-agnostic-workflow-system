#!/usr/bin/env node
import fs from 'node:fs';
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

const DEFAULT_BREAKPOINTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 }
];

function parseArgs(argv) {
  const args = {
    input: null,
    mode: 'certification',
    outputDir: path.join('artifacts', 'render-snapshots'),
    repeat: null,
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
    } else if (value === '--output-dir' && argv[index + 1]) {
      args.outputDir = argv[index + 1];
      index += 1;
    } else if (value === '--repeat' && argv[index + 1]) {
      args.repeat = Number(argv[index + 1]);
      index += 1;
    } else if (value === '--json') {
      args.json = true;
    }
  }

  return args;
}

function sanitizeSegment(value) {
  return String(value || 'case').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function normalizePayload(baseRoot, args) {
  if (!args.input) {
    throw new Error('Missing --input <render-layout-cases.json>.');
  }

  const absolutePath = path.resolve(baseRoot, args.input);
  const payload = readJsonFile(absolutePath);
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  if (cases.length === 0) {
    throw new Error('Input payload must include a non-empty cases array.');
  }

  const breakpoints = Array.isArray(payload.breakpoints) && payload.breakpoints.length > 0
    ? payload.breakpoints
    : DEFAULT_BREAKPOINTS;

  return {
    source: normalizePath(absolutePath),
    breakpoints,
    repeat: Number.isFinite(args.repeat) && args.repeat > 0
      ? Math.floor(args.repeat)
      : (payload.repeatCount && Number.isFinite(payload.repeatCount) ? Math.floor(payload.repeatCount) : null),
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
    return {
      targetType: 'url',
      source: url,
      navigateTo: url
    };
  }

  if (typeof caseEntry.page.file === 'string' && caseEntry.page.file.trim() !== '') {
    const absoluteFile = path.resolve(baseRoot, caseEntry.page.file);
    if (!fs.existsSync(absoluteFile)) {
      throw new Error(`Case ${caseEntry.id} file does not exist: ${caseEntry.page.file}`);
    }
    return {
      targetType: 'file',
      source: normalizePath(absoluteFile),
      navigateTo: toFileUrl(absoluteFile)
    };
  }

  throw new Error(`Case ${caseEntry.id || '<missing-id>'} must include page.file or page.url.`);
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const headingNodes = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    let headingLevelSkips = 0;
    let lastLevel = null;
    for (const heading of headingNodes) {
      const level = Number(heading.tagName.slice(1));
      if (lastLevel != null && level - lastLevel > 1) {
        headingLevelSkips += 1;
      }
      lastLevel = level;
    }

    const overflowElements = [...document.querySelectorAll('*')].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      return node.scrollWidth - node.clientWidth > 1;
    });

    const paragraphs = [...document.querySelectorAll('p')]
      .map((node) => node.textContent || '')
      .map((text) => text.trim())
      .filter(Boolean);

    const paragraphWordCounts = paragraphs.map((text) => text.split(/\s+/).filter(Boolean).length);
    const maxParagraphWords = paragraphWordCounts.length > 0 ? Math.max(...paragraphWordCounts) : 0;
    const averageParagraphWords = paragraphWordCounts.length > 0
      ? Number((paragraphWordCounts.reduce((sum, value) => sum + value, 0) / paragraphWordCounts.length).toFixed(2))
      : 0;

    const mainLandmarkCount = document.querySelectorAll('main, [role="main"]').length;
    const landmarkCount = document.querySelectorAll('main, nav, header, footer, aside, [role="banner"], [role="navigation"], [role="contentinfo"], [role="complementary"]').length;
    const sectionLikeCount = document.querySelectorAll('section, article, aside, nav').length;
    const bodyText = (document.body?.innerText || '').trim();
    const textWordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

    const unlabeledInputs = [...document.querySelectorAll('input, select, textarea')].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const id = node.getAttribute('id');
      const hasLabelFor = Boolean(id && document.querySelector(`label[for="${id}"]`));
      const hasAriaLabel = Boolean(node.getAttribute('aria-label') || node.getAttribute('aria-labelledby'));
      return !hasLabelFor && !hasAriaLabel;
    }).length;

    const imagesWithoutAlt = [...document.querySelectorAll('img')].filter((img) => !img.hasAttribute('alt')).length;

    return {
      bodyScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.documentElement.clientWidth,
      overflowCount: overflowElements.length,
      headingCount: headingNodes.length,
      headingLevelSkips,
      mainLandmarkCount,
      landmarkCount,
      sectionLikeCount,
      paragraphCount: paragraphs.length,
      maxParagraphWords,
      averageParagraphWords,
      textWordCount,
      unlabeledInputs,
      imagesWithoutAlt
    };
  });
}

function metricsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addMetricFindings(findings, caseId, breakpoint, metrics) {
  const pathRef = `${caseId}.${breakpoint}`;
  if (metrics.overflowCount > 0) {
    findings.push({
      status: classifyIssueStatus({ severity: 'error', confidence: 'high' }),
      severity: 'error',
      code: 'render.overflow_detected',
      message: `Overflow detected (${metrics.overflowCount}) at ${breakpoint}.`,
      path: pathRef,
      suggestedFix: 'Reduce fixed widths and ensure responsive wrapping for small viewports.'
    });
  }
  if (metrics.mainLandmarkCount === 0) {
    findings.push({
      status: classifyIssueStatus({ severity: 'error', confidence: 'high' }),
      severity: 'error',
      code: 'structure.missing_main_landmark',
      message: `No main landmark detected at ${breakpoint}.`,
      path: pathRef,
      suggestedFix: 'Add a main element or role="main" around primary content.'
    });
  }
  if (metrics.headingLevelSkips > 0) {
    findings.push({
      status: classifyIssueStatus({ severity: 'warning', confidence: 'high' }),
      severity: 'warning',
      code: 'structure.heading_level_skip',
      message: `Heading level skips detected (${metrics.headingLevelSkips}) at ${breakpoint}.`,
      path: pathRef,
      suggestedFix: 'Use sequential heading levels to preserve hierarchy readability.'
    });
  }
}

export async function renderPageSnapshots(payload, options = {}) {
  const baseRoot = options.baseRoot || process.cwd();
  const mode = ensureMode(options.mode || payload.mode || 'certification');
  const runtime = await checkRenderA11yRuntime({ mode, baseRoot, includeChromeLauncher: false });
  if (!runtime.ok) {
    return buildEnvelope({
      ok: false,
      tool: 'render-page-snapshots',
      mode,
      input: { source: payload.source || null },
      runtime: runtime.runtime,
      evidence: { snapshots: [] },
      findings: runtime.findings,
      nonClaims: [
        'Snapshot capture cannot proceed when required runtime dependencies are unavailable.'
      ]
    });
  }

  const repeatCount = Number.isFinite(options.repeatCount) && options.repeatCount > 0
    ? Math.floor(options.repeatCount)
    : (Number.isFinite(payload.repeat) && payload.repeat > 0 ? payload.repeat : (mode === 'certification' ? 2 : 1));

  const outputDir = normalizePath(path.resolve(baseRoot, options.outputDir || payload.outputDir || path.join('artifacts', 'render-snapshots')));
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch(buildRenderA11yChromiumLaunchOptions(chromium, {
    baseRoot,
    scope: 'render-page-snapshots'
  }));
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const findings = [];
  const snapshots = [];

  try {
    for (const caseEntry of payload.cases) {
      if (typeof caseEntry.id !== 'string' || caseEntry.id.trim() === '') {
        throw new Error('Every case must declare a non-empty id.');
      }
      const resolved = resolveCaseTarget(baseRoot, mode, caseEntry);
      const caseDirectory = path.join(outputDir, sanitizeSegment(caseEntry.id));
      fs.mkdirSync(caseDirectory, { recursive: true });

      for (const breakpoint of payload.breakpoints) {
        const width = Number(breakpoint.width);
        const height = Number(breakpoint.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          throw new Error(`Invalid breakpoint dimensions for ${breakpoint.name || '<unnamed>'}.`);
        }

        const runMetrics = [];
        let screenshotPath = null;

        for (let run = 0; run < repeatCount; run += 1) {
          const page = await context.newPage();
          await page.setViewportSize({ width, height });
          await page.addStyleTag({ content: '*{animation:none !important;transition:none !important;}' });
          await page.goto(resolved.navigateTo, { waitUntil: 'domcontentloaded' });

          const metrics = await collectMetrics(page);
          runMetrics.push(metrics);
          if (run === 0) {
            const screenshotName = `${sanitizeSegment(breakpoint.name || `${width}x${height}`)}.png`;
            const absoluteScreenshotPath = path.join(caseDirectory, screenshotName);
            await page.screenshot({ path: absoluteScreenshotPath, fullPage: true });
            screenshotPath = normalizePath(absoluteScreenshotPath);
          }

          await page.close();
        }

        const reproducible = runMetrics.every((entry) => metricsEqual(entry, runMetrics[0]));
        if (!reproducible) {
          findings.push({
            status: classifyIssueStatus({ severity: 'error', confidence: 'high' }),
            severity: 'error',
            code: 'render.nondeterministic_metrics',
            message: `Metrics are not reproducible for case ${caseEntry.id} at breakpoint ${breakpoint.name}.`,
            path: `${caseEntry.id}.${breakpoint.name}`,
            suggestedFix: 'Remove runtime randomness and unstable async content for certification fixtures.'
          });
        }

        addMetricFindings(findings, caseEntry.id, breakpoint.name || `${width}x${height}`, runMetrics[0]);

        snapshots.push({
          caseId: caseEntry.id,
          caseClass: caseEntry.class || null,
          breakpoint: {
            name: breakpoint.name || `${width}x${height}`,
            width,
            height
          },
          target: {
            type: resolved.targetType,
            source: resolved.source
          },
          metrics: runMetrics[0],
          reproducible,
          repeatCount,
          screenshotPath
        });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const ok = findings.every((entry) => entry.severity !== 'error');
  return buildEnvelope({
    ok,
    tool: 'render-page-snapshots',
    mode,
    input: {
      source: payload.source || null,
      caseCount: payload.cases.length,
      breakpoints: payload.breakpoints,
      repeatCount,
      outputDir
    },
    runtime: runtime.runtime,
    evidence: {
      snapshots,
      deterministicRenderingEstablished: snapshots.every((entry) => entry.reproducible)
    },
    findings,
    nonClaims: [
      'Screenshots are artifacts and evidence only; blocking decisions must rely on deterministic DOM/computed/layout metrics.',
      'This tool does not provide pixel-perfect screenshot equality gating.',
      'This tool does not certify legal WCAG compliance.'
    ]
  });
}

function printHuman(report) {
  console.log('# Render Page Snapshots');
  console.log('');
  console.log(`- mode: ${report.mode}`);
  console.log(`- ok: ${report.ok}`);
  console.log(`- snapshots: ${report.evidence.snapshots.length}`);
  console.log(`- findings: ${report.findings.length}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = normalizePayload(process.cwd(), args);
    const report = await renderPageSnapshots(payload, {
      baseRoot: process.cwd(),
      mode: args.mode,
      outputDir: args.outputDir,
      repeatCount: payload.repeat
    });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, tool: 'render-page-snapshots', error: error.message }, null, 2));
    process.exit(1);
  }
}
