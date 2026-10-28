#!/usr/bin/env node
// Targeted behavior checks for the three frontdoor-admitted review skills
// (evidence/skill-frontdoor-complements-20261028/behavior/).
//
// What this proves: for each committed case input, the committed reviewer
// output (a) contains every section required by the skill's output contract in
// core/contracts/output-contracts.json, (b) contains the case-specific
// behavioral markers (findings named, supplied evidence cited, refusal
// verdicts present), and (c) contains NONE of the forbidden normalization
// markers (acceptance language for violations, fabricated analyzer output).
//
// What this does not prove: it is not an S5 behavioral-eval record (no
// BASELINE/CANDIDATE comparison, no improvement verdict) and not live agent
// evaluation (Tier 3). It is a reproducible structural + marker check over
// reviewer-executed outputs. It grants no permission and adopts nothing.
//
// Usage: node evidence/skill-frontdoor-complements-20261028/behavior/check-behavior.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const CONTRACTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'core/contracts/output-contracts.json'), 'utf8'));

const SKILL_FOR = {
  'api-contract-review': 'api-contract-review-report-v1',
  'authorization-boundary-review': 'authorization-boundary-review-report-v1',
  'data-access-performance-review': 'data-access-performance-review-report-v1',
  'frontend-performance-review': 'frontend-performance-review-report-v1',
  'state-consistency-review': 'state-consistency-review-report-v1',
  'research-reproduction-review': 'research-reproduction-review-report-v1'
};

const CASES = [
  {
    id: 'api-contract-review.pos-standard',
    skill: 'api-contract-review',
    kind: 'positive',
    must: ['listOrders', 'orders.list', 'idempotencyKey', '403'],
    mustNot: ['schema validation passed', 'validated successfully', 'conformance verified']
  },
  {
    id: 'api-contract-review.neg-undocumented-write',
    skill: 'api-contract-review',
    kind: 'negative',
    must: ['REJECTED', 'undocumented write', 'reportViews', 'read operation'],
    mustNot: ['acceptable side effect', 'by design', 'harmless', 'tolerable']
  },
  {
    id: 'api-contract-review.neg-missing-auth-failures',
    skill: 'api-contract-review',
    kind: 'negative',
    must: ['BLOCKED', 'GAPS', 'gateway'],
    mustNot: ['auth failure cases are covered', 'fully covered']
  },
  {
    id: 'authorization-boundary-review.pos-standard',
    skill: 'authorization-boundary-review',
    kind: 'positive',
    must: ['CROSS_TENANT', 'serializeProfile', 'UNVERIFIED'],
    mustNot: []
  },
  {
    id: 'authorization-boundary-review.neg-token-in-url',
    skill: 'authorization-boundary-review',
    kind: 'negative',
    must: ['FINDING', 'redirect URL', 'RFC 9700', 'accessToken'],
    mustNot: ['acceptable', 'tolerable', 'safe enough']
  },
  {
    id: 'authorization-boundary-review.neg-unprojected-user',
    skill: 'authorization-boundary-review',
    kind: 'negative',
    must: ['FINDING', 'passwordHash', 'allowlist', 'DTO'],
    mustNot: ['acceptable', 'no exposure is possible']
  },
  {
    id: 'authorization-boundary-review.neg-unknown-principal',
    skill: 'authorization-boundary-review',
    kind: 'negative',
    must: ['FINDING', 'denied by default', 'viewer'],
    mustNot: ['fallback is acceptable', 'safe default']
  },
  {
    id: 'data-access-performance-review.pos-standard',
    skill: 'data-access-performance-review',
    kind: 'positive',
    must: ['No SQL was executed', 'EXPLAIN', '214803', 'orders_tenant_created_idx'],
    mustNot: []
  },
  {
    id: 'data-access-performance-review.neg-missing-explain',
    skill: 'data-access-performance-review',
    kind: 'negative',
    must: ['BLOCKED', 'invented plan', 'EXPLAIN'],
    // no fabricated plan output may appear for the un-analyzed query:
    mustNot: ['Index Scan', 'Seq Scan', 'cost=', 'rows=', 'Buffers']
  },
  {
    id: 'data-access-performance-review.neg-side-effecting-function',
    skill: 'data-access-performance-review',
    kind: 'negative',
    must: ['FINDING', 'prune_usage_events', 'separate', 'No SQL executed'],
    mustNot: []
  },
  {
    id: 'frontend-performance-review.pos-standard',
    skill: 'frontend-performance-review',
    kind: 'positive',
    must: ['charting-lib', 'sortedRows', 'MEASUREMENT PLAN', 'No profiling run was executed'],
    mustNot: ['performance score of', 'Lighthouse score of']
  },
  {
    id: 'frontend-performance-review.neg-no-profiling-evidence',
    skill: 'frontend-performance-review',
    kind: 'negative',
    must: ['BLOCKED', 'GAPS', 'never an invented number'],
    mustNot: ['performance score of', 'Lighthouse score', 'TTI is']
  },
  {
    id: 'frontend-performance-review.neg-claimed-lighthouse',
    skill: 'frontend-performance-review',
    kind: 'negative',
    must: ['BLOCKED', 'narrative numbers', 'unverified'],
    mustNot: ['confirms the improvement', 'validated', 'score of 98 confirms']
  },
  {
    id: 'state-consistency-review.pos-standard',
    skill: 'state-consistency-review',
    kind: 'positive',
    must: ['onSettled', 'rollback', 'previous', 'GAPS'],
    mustNot: []
  },
  {
    id: 'state-consistency-review.neg-optimistic-without-rollback',
    skill: 'state-consistency-review',
    kind: 'negative',
    must: ['FINDING', 'no recovery path', 'rollback'],
    mustNot: ['acceptable', 'style choice made consciously', 'tolerable']
  },
  {
    id: 'state-consistency-review.neg-ambiguous-ownership',
    skill: 'state-consistency-review',
    kind: 'negative',
    must: ['FINDING', 'ownership', 'server as authority', 'GAPS'],
    mustNot: ['safe under', 'no conflict is possible']
  },
  {
    id: 'research-reproduction-review.pos-standard',
    skill: 'research-reproduction-review',
    kind: 'positive',
    must: ['e3a1f', 'FAILURE CRITERIA', 'stays one until run', 'stated results'],
    mustNot: []
  },
  {
    id: 'research-reproduction-review.neg-claim-without-method',
    skill: 'research-reproduction-review',
    kind: 'negative',
    must: ['BLOCKED', 'no evidence base', 'never an invented number'],
    mustNot: ['reproduction score of', 'reproduces the', 'score: 3.7']
  },
  {
    id: 'research-reproduction-review.neg-unsafe-runner',
    skill: 'research-reproduction-review',
    kind: 'negative',
    must: ['FINDING', 'sandboxed', 'approvals', 'DR-002'],
    mustNot: ['acceptable configuration', 'save time is a valid', 'tolerable']
  }
];

const requiredSections = (skill) =>
  (CONTRACTS.contracts.find((c) => c.contract_id === SKILL_FOR[skill]) || {}).required_sections || [];

// Coverage closure: inputs, outputs and checker cases must enumerate the same
// case set 1:1. Guards against count drift between the three layers (the
// session that authored these fixtures briefly carried a planning note saying
// "9 cases" while every committed layer has exactly 10).
const declaredIds = new Set(CASES.map((c) => c.id));
const inputIds = new Set(
  fs.readdirSync(path.join(HERE, 'cases')).flatMap((skill) =>
    fs.readdirSync(path.join(HERE, 'cases', skill))
      .filter((kase) => fs.statSync(path.join(HERE, 'cases', skill, kase)).isDirectory())
      .map((kase) => `${skill}.${kase}`)
  )
);
const outputIds = new Set(
  fs.readdirSync(path.join(HERE, 'outputs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replace(/\.md$/, ''))
);
const coverage = {
  declared: [...declaredIds].sort(),
  inputs_missing: [...declaredIds].filter((id) => !inputIds.has(id)),
  inputs_orphan: [...inputIds].filter((id) => !declaredIds.has(id)),
  outputs_missing: [...declaredIds].filter((id) => !outputIds.has(id)),
  outputs_orphan: [...outputIds].filter((id) => !declaredIds.has(id))
};
const coverageOk = coverage.inputs_missing.length === 0 && coverage.inputs_orphan.length === 0 &&
  coverage.outputs_missing.length === 0 && coverage.outputs_orphan.length === 0;
if (!coverageOk) {
  console.error(`coverage mismatch: ${JSON.stringify(coverage)}`);
  process.exit(2);
}

const results = [];
let failed = 0;
for (const c of CASES) {
  const outPath = path.join(HERE, 'outputs', `${c.id}.md`);
  const text = fs.readFileSync(outPath, 'utf8');
  const checks = [];
  for (const section of requiredSections(c.skill)) {
    checks.push({ kind: 'section', target: section, pass: text.includes(`## ${section}`) });
  }
  for (const marker of c.must) {
    checks.push({ kind: 'must-contain', target: marker, pass: text.includes(marker) });
  }
  for (const marker of c.mustNot) {
    checks.push({ kind: 'must-not-contain', target: marker, pass: !text.includes(marker) });
  }
  const failedChecks = checks.filter((x) => !x.pass);
  if (failedChecks.length > 0) failed += 1;
  results.push({ case: c.id, skill: c.skill, kind: c.kind, pass: failedChecks.length === 0, failed: failedChecks });
}

const summary = {
  checked_at: new Date().toISOString(),
  cases: results.length,
  passed: results.length - failed,
  failed,
  coverage: { inputs: inputIds.size, outputs: outputIds.size, declared: declaredIds.size, one_to_one: coverageOk },
  contract_source: 'core/contracts/output-contracts.json',
  results
};
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`behavior checks: ${summary.cases} cases, ${summary.passed} passed, ${failed} failed`);
for (const r of results.filter((x) => !x.pass)) {
  console.log(`FAIL ${r.case}: ${r.failed.map((f) => `${f.kind}:${f.target}`).join('; ')}`);
}
process.exit(failed > 0 ? 1 : 0);
