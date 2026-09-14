import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createRunContext } from '../../runtime/kernel/runtime-context.mjs';
import { createResourceLedger } from '../../runtime/resources/resource-ledger.mjs';
import {
  runAuthorityPortConformance,
  runContextEnginePortConformance,
  runCrossPortCompositionConformance,
  runEffectPortConformance,
  runUsageSourceConformance
} from '../../runtime/contracts/adapter-conformance.mjs';

// CLG P11: the reusable conformance harness must accept conforming adapters
// and prove that the runtime gates reject every adversarial adapter behavior.
// A conformance PASS is evidence about GENERIC contract conformity — never
// trust, production authorization, or deployment approval (P11-A8).

test('ContextEnginePort suite: conforming adapter passes all cases', () => {
  const result = runContextEnginePortConformance({ implementationRef: 'conf-context-adapter' });
  assert.equal(result.passed, true, JSON.stringify(result.failed_cases));
  assert.equal(result.port, 'ContextEnginePort');
  assert.equal(result.passed_cases, result.cases.length);
});

test('ContextEnginePort suite: authority-like fields stay inert (cannot expand authority)', () => {
  const result = runContextEnginePortConformance({});
  const inert = result.cases.find((entry) => entry.case_id === 'authority_like_fields_are_inert');
  assert.equal(inert.ok, true);
});

test('ContextEnginePort suite: foreign-task manifest is rejected by the runtime gate', () => {
  const result = runContextEnginePortConformance({});
  const binding = result.cases.find((entry) => entry.case_id === 'wrong_task_binding_rejected');
  assert.equal(binding.ok, true);
});

test('AuthorityPort suite: conforming adapter passes; every misbehavior is denied', () => {
  const result = runAuthorityPortConformance({ implementationRef: 'conf-authority-adapter' });
  assert.equal(result.passed, true, JSON.stringify(result.failed_cases));
  for (const caseId of ['wrong_subject_denied', 'wrong_action_denied', 'expired_allow_denied', 'malformed_result_denied', 'throwing_adapter_fail_closed', 'missing_adapter_fail_closed']) {
    const entry = result.cases.find((candidate) => candidate.case_id === caseId);
    assert.equal(entry.ok, true, caseId);
  }
});

test('EffectPort suite: conforming adapter passes; self-verification and self-completion are inert', () => {
  const result = runEffectPortConformance({ implementationRef: 'conf-effect-adapter' });
  assert.equal(result.passed, true, JSON.stringify(result.failed_cases));
  const verified = result.cases.find((entry) => entry.case_id === 'verified_claim_inert');
  assert.equal(verified.ok, true);
  const completed = result.cases.find((entry) => entry.case_id === 'completion_claim_inert');
  assert.equal(completed.ok, true);
  const identity = result.cases.find((entry) => entry.case_id === 'receipt_identity_runtime_owned');
  assert.equal(identity.ok, true);
});

test('UsageSource suite: measured usage accepted; invented cost and tokens refused', () => {
  const result = runUsageSourceConformance({ implementationRef: 'conf-usage-adapter' });
  assert.equal(result.passed, true, JSON.stringify(result.failed_cases));
  const cost = result.cases.find((entry) => entry.case_id === 'invented_cost_denied');
  assert.equal(cost.ok, true);
  const tokens = result.cases.find((entry) => entry.case_id === 'fabricated_tokens_denied');
  assert.equal(tokens.ok, true);
});

test('Cross-port composition suite: all composition boundaries hold', () => {
  const result = runCrossPortCompositionConformance({ implementationRef: 'conf-composition' });
  assert.equal(result.passed, true, JSON.stringify(result.failed_cases));
});

test('P11-A8: conformance results carry no trust or authorization semantics', () => {
  for (const result of [
    runContextEnginePortConformance({}),
    runAuthorityPortConformance({}),
    runEffectPortConformance({}),
    runUsageSourceConformance({}),
    runCrossPortCompositionConformance({})
  ]) {
    assert.equal(result.trust_level, null);
    assert.equal(result.authorization, null);
    assert.ok(!('production_authorized' in result));
    assert.ok(!('deployment_approved' in result));
    assert.equal(result.contract, 'generic-runtime-port-contract');
  }
});

test('harness produces objective FAIL evidence for a non-conforming usage store', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clg-conf-fail-'));
  try {
    const context = createRunContext({ repoRoot: root });
    const ledger = createResourceLedger({
      repoRoot: root,
      runRef: context.runId,
      taskRef: 'task-1',
      budget: { budget_id: 'b', limits: { max_effects: 5 } }
    });
    ledger.appendUsage({ resourceType: 'effects', amount: 1, sourceRef: 'rcp_ok' });
    const ledgerPath = ledger.ledgerPath;
    const raw = JSON.parse(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')[0]);
    raw.amount = 999; // digest now mismatched
    fs.writeFileSync(ledgerPath, `${JSON.stringify(raw)}\n`);

    const result = runUsageSourceConformance({ ledger, implementationRef: 'broken-usage-adapter' });
    assert.equal(result.passed, false);
    assert.ok(result.failed_cases.length > 0);
    assert.equal(result.failed_cases[0].case_id, 'measured_usage_accepted');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
