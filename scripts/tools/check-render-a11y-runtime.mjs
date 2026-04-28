#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEnvelope,
  buildRenderA11yChromiumLaunchOptions,
  classifyIssueStatus,
  ensureMode,
  formatRuntimeLaunchFailure,
  resolveRenderA11yUserDataDir
} from './_render_a11y_shared.mjs';

function parseArgs(argv) {
  const args = { mode: 'certification', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--mode' && argv[index + 1]) {
      args.mode = argv[index + 1];
      index += 1;
    } else if (value === '--json') {
      args.json = true;
    }
  }
  return args;
}

function pass(name, details = null) {
  return { name, ok: true, details };
}

function fail(name, error) {
  return { name, ok: false, details: error?.message || String(error) };
}

export async function checkRenderA11yRuntime(options = {}) {
  const mode = ensureMode(options.mode || 'certification');
  const baseRoot = options.baseRoot || process.cwd();
  const includeChromeLauncher = options.includeChromeLauncher !== false;
  const checks = [];
  const findings = [];

  let playwrightModule = null;
  let chromiumPath = null;
  let chromeUserDataDir = null;

  try {
    playwrightModule = await import('playwright');
    const chromium = playwrightModule.chromium;
    const launchOptions = buildRenderA11yChromiumLaunchOptions(chromium, { baseRoot, scope: 'runtime-preflight' });
    chromiumPath = launchOptions.executablePath || chromium.executablePath();
    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><main>runtime-check</main></body></html>');
    await page.textContent('main');
    await browser.close();
    checks.push(pass('playwright.chromium.launch', { executablePath: chromiumPath }));
  } catch (error) {
    checks.push(fail('playwright.chromium.launch', formatRuntimeLaunchFailure(error, { executablePath: chromiumPath })));
  }

  try {
    const axeModule = await import('@axe-core/playwright');
    const AxeBuilder = axeModule.default;
    if (typeof AxeBuilder !== 'function') {
      throw new Error('AxeBuilder default export is not a function.');
    }
    checks.push(pass('axe-core.playwright.import'));
  } catch (error) {
    checks.push(fail('axe-core.playwright.import', error));
  }

  try {
    const lighthouseModule = await import('lighthouse');
    const lighthouseFn = lighthouseModule.default || lighthouseModule.lighthouse;
    if (typeof lighthouseFn !== 'function') {
      throw new Error('Lighthouse export is not callable.');
    }
    checks.push(pass('lighthouse.import'));
  } catch (error) {
    checks.push(fail('lighthouse.import', error));
  }

  if (includeChromeLauncher) {
    try {
      const chromeLauncherModule = await import('chrome-launcher');
      const launchFn = chromeLauncherModule.launch || chromeLauncherModule.default?.launch;
      if (typeof launchFn !== 'function') {
        throw new Error('chrome-launcher launch export not found.');
      }

      let launcher = null;
      try {
        chromeUserDataDir = resolveRenderA11yUserDataDir({ baseRoot, scope: 'runtime-preflight-chrome-launcher' });
        launcher = await launchFn({
          chromePath: chromiumPath || undefined,
          userDataDir: chromeUserDataDir,
          logLevel: 'silent',
          chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
        });
        checks.push(pass('chrome-launcher.launch', { port: launcher.port, usedChromePath: chromiumPath || null, userDataDir: chromeUserDataDir }));
      } finally {
        if (launcher) {
          await launcher.kill();
        }
      }
    } catch (error) {
      checks.push(fail('chrome-launcher.launch', formatRuntimeLaunchFailure(error, { executablePath: chromiumPath, userDataDir: chromeUserDataDir })));
    }
  }

  const ok = checks.every((entry) => entry.ok);
  if (!ok) {
    for (const entry of checks.filter((value) => !value.ok)) {
      findings.push({
        status: classifyIssueStatus({ severity: 'error', confidence: 'high' }),
        severity: 'error',
        code: 'runtime.unavailable',
        message: `${entry.name} failed: ${entry.details}`,
        suggestedFix: 'Install/pin required browser and audit dependencies, then rerun runtime preflight.'
      });
    }
  }

  return buildEnvelope({
    ok,
    tool: 'check-render-a11y-runtime',
    mode,
    input: { mode },
    runtime: {
      checks,
      includeChromeLauncher,
      strictCertification: mode === 'certification'
    },
    evidence: {
      passedChecks: checks.filter((entry) => entry.ok).length,
      failedChecks: checks.filter((entry) => !entry.ok).length
    },
    findings,
    nonClaims: [
      'Runtime preflight only verifies dependency/runtime readiness; it does not verify UI semantics or WCAG conformance.',
      'Passing runtime checks does not imply deterministic fixture behavior unless eval fixtures also pass.'
    ]
  });
}

function printHuman(report) {
  console.log('# Render/A11y Runtime Check');
  console.log('');
  for (const entry of report.runtime.checks) {
    console.log(`- ${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}`);
    if (entry.details) {
      console.log(`  ${typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details)}`);
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await checkRenderA11yRuntime({ mode: args.mode });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, tool: 'check-render-a11y-runtime', error: error.message }, null, 2));
    process.exit(1);
  }
}
