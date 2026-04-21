#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './_shared.mjs';

const VOLATILITY_VALUES = new Set(['stable', 'periodic', 'request-time', 'user-specific']);
const INTERACTION_VALUES = new Set(['none', 'light', 'high']);
const FRESHNESS_VALUES = new Set(['build-time', 'periodic', 'near-real-time', 'request-time']);
const POSTURE_VALUES = new Set(['static', 'server-rendered-dynamic', 'hydrated-interactive']);

function parseArgs(argv) {
  const args = {
    fixture: path.join('evals', 'fixtures', 'static-vs-dynamic-rendering-advisor.json')
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--fixture' && argv[index + 1]) {
      args.fixture = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function classifyRegion(region) {
  const issues = [];
  const volatility = region?.volatility;
  const interaction = region?.interaction;
  const freshness = region?.freshness;

  if (!volatility) issues.push('missing-volatility');
  if (!interaction) issues.push('missing-interaction');
  if (!freshness) issues.push('missing-freshness');
  if (issues.length > 0) {
    return {
      blocked: true,
      blockerCode: issues[0],
      posture: null,
      tradeoffTags: []
    };
  }

  if (!VOLATILITY_VALUES.has(volatility)) {
    return { blocked: true, blockerCode: 'unsupported-volatility', posture: null, tradeoffTags: [] };
  }
  if (!INTERACTION_VALUES.has(interaction)) {
    return { blocked: true, blockerCode: 'unsupported-interaction', posture: null, tradeoffTags: [] };
  }
  if (!FRESHNESS_VALUES.has(freshness)) {
    return { blocked: true, blockerCode: 'unsupported-freshness', posture: null, tradeoffTags: [] };
  }

  if (interaction === 'high') {
    return {
      blocked: false,
      blockerCode: null,
      posture: 'hydrated-interactive',
      tradeoffTags: ['performance:variable', 'maintainability:lower', 'freshness:high']
    };
  }

  if (volatility === 'request-time' || volatility === 'user-specific' || freshness === 'request-time' || freshness === 'near-real-time') {
    return {
      blocked: false,
      blockerCode: null,
      posture: 'server-rendered-dynamic',
      tradeoffTags: ['performance:moderate', 'maintainability:moderate', 'freshness:high']
    };
  }

  return {
    blocked: false,
    blockerCode: null,
    posture: 'static',
    tradeoffTags: ['performance:high', 'maintainability:high', 'freshness:limited']
  };
}

function evaluateCase(caseEntry) {
  const issues = [];
  if (!caseEntry || typeof caseEntry !== 'object') {
    return { passed: false, issues: ['Case entry must be an object.'] };
  }
  if (typeof caseEntry.id !== 'string' || caseEntry.id.trim() === '') {
    issues.push('Case id must be a non-empty string.');
  }
  if (!caseEntry.input || typeof caseEntry.input !== 'object') {
    issues.push(`Case ${caseEntry.id || '<missing-id>'} input must be an object.`);
  }
  if (!caseEntry.expected || typeof caseEntry.expected !== 'object') {
    issues.push(`Case ${caseEntry.id || '<missing-id>'} expected must be an object.`);
  }
  if (issues.length > 0) {
    return { passed: false, issues };
  }

  const observed = classifyRegion(caseEntry.input);
  const expected = caseEntry.expected;

  if (expected.blocked === true) {
    if (!observed.blocked) {
      issues.push(`Case ${caseEntry.id} expected blocked result but observed posture ${observed.posture}.`);
    }
    if (expected.blockerCode && expected.blockerCode !== observed.blockerCode) {
      issues.push(`Case ${caseEntry.id} expected blockerCode ${expected.blockerCode} but observed ${observed.blockerCode}.`);
    }
  } else {
    if (observed.blocked) {
      issues.push(`Case ${caseEntry.id} unexpectedly blocked with ${observed.blockerCode}.`);
    }
    if (!POSTURE_VALUES.has(expected.posture)) {
      issues.push(`Case ${caseEntry.id} expected posture ${expected.posture || '<missing>'} is not supported.`);
    } else if (expected.posture !== observed.posture) {
      issues.push(`Case ${caseEntry.id} expected posture ${expected.posture} but observed ${observed.posture}.`);
    }

    const expectedTradeoffTags = Array.isArray(expected.tradeoffTags) ? expected.tradeoffTags : [];
    for (const tag of expectedTradeoffTags) {
      if (!observed.tradeoffTags.includes(tag)) {
        issues.push(`Case ${caseEntry.id} missing expected tradeoff tag ${tag}.`);
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    observed
  };
}

function evaluateStaticVsDynamicRenderingAdvisorFixture(fixture) {
  const issues = [];
  const cases = Array.isArray(fixture?.cases) ? fixture.cases : [];

  if (!fixture || typeof fixture !== 'object') {
    return {
      passed: false,
      issues: ['Fixture must be an object.'],
      casesChecked: 0,
      caseResults: []
    };
  }

  if (fixture.kind !== 'rendering-posture') {
    issues.push(`Fixture kind must be rendering-posture, found ${fixture.kind || '<missing>'}.`);
  }
  if (cases.length === 0) {
    issues.push('Fixture must include at least one case.');
  }

  const seenIds = new Set();
  const coverage = {
    static: 0,
    'server-rendered-dynamic': 0,
    'hydrated-interactive': 0,
    blocked: 0
  };

  const caseResults = [];
  for (const caseEntry of cases) {
    const caseResult = evaluateCase(caseEntry);
    const caseId = caseEntry?.id || '<missing-id>';
    if (seenIds.has(caseId)) {
      caseResult.passed = false;
      caseResult.issues.push(`Duplicate case id ${caseId}.`);
    }
    seenIds.add(caseId);

    if (caseResult.observed?.blocked) {
      coverage.blocked += 1;
    } else if (caseResult.observed?.posture && coverage[caseResult.observed.posture] != null) {
      coverage[caseResult.observed.posture] += 1;
    }

    caseResults.push({
      id: caseId,
      passed: caseResult.passed,
      issues: caseResult.issues,
      observed: caseResult.observed
    });
  }

  for (const result of caseResults) {
    if (!result.passed) {
      issues.push(...result.issues);
    }
  }

  if (coverage.static === 0) {
    issues.push('Fixture must cover at least one static decision case.');
  }
  if (coverage['server-rendered-dynamic'] === 0) {
    issues.push('Fixture must cover at least one server-rendered-dynamic decision case.');
  }
  if (coverage['hydrated-interactive'] === 0) {
    issues.push('Fixture must cover at least one hydrated-interactive decision case.');
  }
  if (coverage.blocked === 0) {
    issues.push('Fixture must cover at least one fail-closed blocked case.');
  }

  return {
    passed: issues.length === 0,
    issues,
    casesChecked: caseResults.length,
    caseResults,
    coverage
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const fixturePath = path.resolve(repoRoot(), args.fixture);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const result = evaluateStaticVsDynamicRenderingAdvisorFixture(fixture);
    console.log(JSON.stringify({ fixturePath: fixturePath.replace(/\\/g, '/'), ...result }, null, 2));
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  }
}

export { evaluateStaticVsDynamicRenderingAdvisorFixture };
