// MAWS vNext routing tests (MAWS-VN-600..604).
// Covers: routing core precedence, verified-only scoring, bounded
// exploration, policy-bounded composition, typed disagreement — including
// schema validation of every produced decision against the canonical
// contracts via the repo validator.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FailClosedError } from '../../runtime/vnext/util.mjs';
import { buildRoutingRequest, route } from '../../runtime/routing/routing-engine.mjs';
import { scoreCandidates } from '../../runtime/routing/scoring.mjs';
import { decideExploration } from '../../runtime/routing/exploration.mjs';
import { buildComposition } from '../../runtime/routing/composition.mjs';
import { classifyDisagreement, resolveDisagreement } from '../../runtime/routing/disagreement.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTING_REQUEST_CONTRACT = 'core/contracts/routing-request.schema.json';
const ROUTING_DECISION_CONTRACT = 'core/contracts/routing-decision.schema.json';
const COMPOSITION_DECISION_CONTRACT = 'core/contracts/composition-decision.schema.json';
const DISAGREEMENT_DECISION_CONTRACT = 'core/contracts/disagreement-decision.schema.json';

function assertContractValid(instance, contract) {
  const issues = validateInstanceAgainstContract(instance, contract, repoRoot);
  assert.deepEqual(issues, [], `${contract} must validate without issues`);
}

function eligibleEntries(...executorIds) {
  return executorIds.map((executorId) => ({ executor_id: executorId, qualification_ref: `qual_${executorId.slice('exec_'.length)}` }));
}

function buildRequest(overrides = {}) {
  return buildRoutingRequest({
    work_unit_id: 'wu_demo_work_unit',
    capability_requirements: ['cap_codegen'],
    eligible: overrides.eligible ?? eligibleEntries('exec_alpha', 'exec_beta'),
    policy_context_ref: 'policy/routing/default',
    workload_safety_class: overrides.workload_safety_class ?? 'safe',
    session_model_preference: overrides.session_model_preference ?? null
  });
}

function assertFailClosedCode(fn, code) {
  assert.throws(fn, (error) => error instanceof FailClosedError && error.code === code);
}

// ---------------------------------------------------------------------------
// buildRoutingRequest
// ---------------------------------------------------------------------------

test('buildRoutingRequest produces a contract-shaped RoutingRequest', () => {
  const request = buildRequest({ session_model_preference: 'model/jev-1.13.0' });
  const { eligible, ...projection } = request;
  assert.ok(Array.isArray(eligible) && eligible.length === 2);
  assert.deepEqual(request.eligible_executor_ids, ['exec_alpha', 'exec_beta']);
  // The contract projection (without the runtime qualification enrichment)
  // must validate against the canonical RoutingRequest contract.
  assertContractValid(projection, ROUTING_REQUEST_CONTRACT);
});

test('buildRoutingRequest rejects malformed inputs fail-closed', () => {
  assertFailClosedCode(() => buildRoutingRequest({ ...validRequestArgs(), work_unit_id: 'work-unit-1' }), 'ROUTING_REQUEST_INVALID');
  assertFailClosedCode(() => buildRoutingRequest({ ...validRequestArgs(), capability_requirements: [] }), 'ROUTING_REQUEST_INVALID');
  assertFailClosedCode(
    () => buildRoutingRequest({ ...validRequestArgs(), eligible: [{ executor_id: 'exec_alpha' }] }),
    'ROUTING_REQUEST_INVALID'
  );
  assertFailClosedCode(() => buildRoutingRequest({ ...validRequestArgs(), workload_safety_class: 'wild_west' }), 'ROUTING_REQUEST_INVALID');
});

function validRequestArgs() {
  return {
    work_unit_id: 'wu_demo_work_unit',
    capability_requirements: ['cap_codegen'],
    eligible: eligibleEntries('exec_alpha', 'exec_beta'),
    policy_context_ref: 'policy/routing/default',
    workload_safety_class: 'safe'
  };
}

// ---------------------------------------------------------------------------
// Jev preference (OD-18)
// ---------------------------------------------------------------------------

test('jev preference inside the eligible set binds as NORMAL_SELECTION with receipt ref', () => {
  const decision = route({
    routing_request: buildRequest(),
    jev_answer: { preferred_executor_id: 'exec_beta', receipt_ref: 'jev_receipt_001', threshold_met: true },
    scores: null,
    exploration_policy: null,
    executions_count: null,
    fallback_chain: null,
    decided_at: '2026-09-25T10:00:00.000Z'
  });

  assert.equal(decision.selected_executor_id, 'exec_beta');
  assert.equal(decision.selection_mode, 'NORMAL_SELECTION');
  assert.equal(decision.jev_receipt_ref, 'jev_receipt_001');
  assert.equal(decision.exploration, null);
  assert.equal(decision.fallback_of, null);
  assert.equal(decision.qualification_ref, 'qual_beta');
  assert.equal(decision.workload_safety_class, 'safe');
  assert.deepEqual(decision.scoring_evidence, []);
  assertContractValid(decision, ROUTING_DECISION_CONTRACT);
});

test('jev preference outside the eligible set is ignored and never binds', () => {
  const scores = scoreCandidates({
    candidates: [
      { executor_id: 'exec_alpha', signals: { verified_success: { value: 2, evidence_ref: 'verif_alpha_run_1' } } },
      { executor_id: 'exec_beta', signals: { verified_success: { value: 5, evidence_ref: 'verif_beta_run_1' } } },
      { executor_id: 'exec_gamma', signals: { verified_success: { value: 99, evidence_ref: 'verif_gamma_run_1' } } }
    ],
    weights: { verified_success: 1 }
  });

  const decision = route({
    routing_request: buildRequest(), // eligible: exec_alpha, exec_beta only
    jev_answer: { preferred_executor_id: 'exec_gamma', receipt_ref: 'jev_receipt_002', threshold_met: true },
    scores,
    decided_at: '2026-09-25T10:01:00.000Z'
  });

  assert.equal(decision.selected_executor_id, 'exec_beta'); // gamma filtered from scores too
  assert.equal(decision.selection_mode, 'NORMAL_SELECTION');
  assert.equal(decision.jev_receipt_ref, null);
  assertContractValid(decision, ROUTING_DECISION_CONTRACT);
});

test('jev answer below threshold is ignored', () => {
  const decision = route({
    routing_request: buildRequest({ eligible: eligibleEntries('exec_alpha') }),
    jev_answer: { preferred_executor_id: 'exec_alpha', receipt_ref: 'jev_receipt_003', threshold_met: false },
    decided_at: '2026-09-25T10:02:00.000Z'
  });
  // Falls through to the single-eligible rule; the unthresholded jev answer
  // never records a receipt.
  assert.equal(decision.selected_executor_id, 'exec_alpha');
  assert.equal(decision.selection_mode, 'NORMAL_SELECTION');
  assert.equal(decision.jev_receipt_ref, null);
});

// ---------------------------------------------------------------------------
// Verified-only scoring (MAWS-VN-601, OD-13)
// ---------------------------------------------------------------------------

test('unverified and self-scored signals are rejected and cannot win', () => {
  const scores = scoreCandidates({
    candidates: [
      { executor_id: 'exec_alpha', signals: { verified_success: { value: 1000, evidence_ref: 'self:exec_alpha' } } },
      { executor_id: 'exec_beta', signals: { verified_success: { value: 3, evidence_ref: 'verif_beta_run_1' } } },
      { executor_id: 'exec_delta', signals: { vibes_quality: { value: 500, evidence_ref: 'verif_delta_run_1' } } },
      { executor_id: 'exec_eps', signals: { verified_success: { value: 7 } } }
    ],
    weights: { verified_success: 1, vibes_quality: 1 }
  });

  const byId = Object.fromEntries(scores.map((entry) => [entry.executor_id, entry]));
  assert.equal(byId.exec_alpha.score, 0); // self-score
  assert.deepEqual(byId.exec_alpha.flags, ['UNVERIFIED_SIGNAL_REJECTED']);
  assert.equal(byId.exec_delta.score, 0); // signal outside allowed enum
  assert.deepEqual(byId.exec_delta.flags, ['UNVERIFIED_SIGNAL_REJECTED']);
  assert.equal(byId.exec_eps.score, 0); // missing evidence_ref
  assert.deepEqual(byId.exec_eps.flags, ['UNVERIFIED_SIGNAL_REJECTED']);
  assert.equal(byId.exec_beta.score, 3);
  assert.deepEqual(byId.exec_beta.flags, []);
  assert.deepEqual(byId.exec_beta.contributing_signals, [{ signal: 'verified_success', evidence_ref: 'verif_beta_run_1' }]);

  const decision = route({
    routing_request: buildRequest({ eligible: eligibleEntries('exec_alpha', 'exec_beta', 'exec_delta', 'exec_eps') }),
    scores,
    decided_at: '2026-09-25T10:03:00.000Z'
  });
  assert.equal(decision.selected_executor_id, 'exec_beta');
  assert.deepEqual(decision.scoring_evidence, [{ signal: 'verified_success', evidence_ref: 'verif_beta_run_1' }]);
  assertContractValid(decision, ROUTING_DECISION_CONTRACT);

  // A flagged candidate cannot win even through a zero-score tie: the
  // self-scored exec_alpha (0) loses against an evidence-free but unflagged
  // exec_zeta (0).
  const tieScores = scoreCandidates({
    candidates: [
      { executor_id: 'exec_alpha', signals: { verified_success: { value: 1000, evidence_ref: 'self:exec_alpha' } } },
      { executor_id: 'exec_zeta', signals: {} }
    ],
    weights: { verified_success: 1 }
  });
  const tieDecision = route({
    routing_request: buildRequest({ eligible: eligibleEntries('exec_alpha', 'exec_zeta') }),
    scores: tieScores,
    decided_at: '2026-09-25T10:04:00.000Z'
  });
  assert.equal(tieDecision.selected_executor_id, 'exec_zeta');
});

test('score ties break deterministically on the lexicographically smallest executor id', () => {
  const scores = scoreCandidates({
    candidates: [
      { executor_id: 'exec_beta', signals: { verified_success: { value: 5, evidence_ref: 'verif_beta_run_1' } } },
      { executor_id: 'exec_alpha', signals: { verified_success: { value: 5, evidence_ref: 'verif_alpha_run_1' } } },
      { executor_id: 'exec_gamma', signals: { verified_success: { value: 1, evidence_ref: 'verif_gamma_run_1' } } }
    ],
    weights: { verified_success: 1 }
  });
  const input = {
    routing_request: buildRequest({ eligible: eligibleEntries('exec_alpha', 'exec_beta', 'exec_gamma') }),
    scores,
    decided_at: '2026-09-25T10:05:00.000Z'
  };
  assert.equal(route(input).selected_executor_id, 'exec_alpha');
  assert.equal(route({ ...input, scores: scoreCandidates({ candidates: inputScores(), weights: { verified_success: 1 } }) }).selected_executor_id, 'exec_alpha');
  function inputScores() {
    return [
      { executor_id: 'exec_beta', signals: { verified_success: { value: 5, evidence_ref: 'verif_beta_run_1' } } },
      { executor_id: 'exec_alpha', signals: { verified_success: { value: 5, evidence_ref: 'verif_alpha_run_1' } } }
    ];
  }
});

test('missing signals contribute zero and scoring is deterministic across calls', () => {
  const args = {
    candidates: [
      { executor_id: 'exec_alpha', signals: { latency: { value: 120, evidence_ref: 'verif_alpha_lat' }, cost: { value: 3, evidence_ref: 'verif_alpha_cost' } } },
      { executor_id: 'exec_beta', signals: { latency: { value: 90, evidence_ref: 'verif_beta_lat' } } }
    ],
    weights: { latency: -1, cost: -1 }
  };
  const first = scoreCandidates(args);
  const second = scoreCandidates(args);
  assert.deepEqual(first, second);
  // alpha: -1*120 + -1*3 = -123; beta: -1*90 = -90 (missing cost contributes 0)
  assert.equal(first.find((entry) => entry.executor_id === 'exec_alpha').score, -123);
  assert.equal(first.find((entry) => entry.executor_id === 'exec_beta').score, -90);
});

// ---------------------------------------------------------------------------
// Bounded exploration (MAWS-VN-602, OD-14)
// ---------------------------------------------------------------------------

test('decideExploration allows bounded exploration only inside policy limits', () => {
  const policy = { policy_ref: 'explore/main', max_traffic_share: 0.2, allowed_safety_classes: ['safe', 'reversible_only'] };
  assert.deepEqual(decideExploration({ explorationPolicy: policy, workloadSafetyClass: 'safe', candidateCount: 3 }), {
    allowed: true,
    reason: 'EXPLORATION_ALLOWED',
    traffic_share: 0.2
  });
  assert.equal(decideExploration({ explorationPolicy: policy, workloadSafetyClass: 'safe', candidateCount: 1 }).allowed, false);
  assert.equal(decideExploration({ explorationPolicy: policy, workloadSafetyClass: 'reversible_only', candidateCount: 2 }).allowed, true);
  assert.equal(decideExploration({ explorationPolicy: policy, workloadSafetyClass: 'high_risk', candidateCount: 2 }).allowed, false);
  // Even a policy that (malformed) lists dangerous classes cannot enable
  // exploration for them; and a share above the absolute bound is rejected.
  const roguePolicy = { policy_ref: 'explore/rogue', max_traffic_share: 1.5, allowed_safety_classes: ['high_risk'] };
  assert.equal(decideExploration({ explorationPolicy: roguePolicy, workloadSafetyClass: 'high_risk', candidateCount: 2 }).allowed, false);
  const overShare = { policy_ref: 'explore/overshare', max_traffic_share: 1.2, allowed_safety_classes: ['safe'] };
  assert.deepEqual(decideExploration({ explorationPolicy: overShare, workloadSafetyClass: 'safe', candidateCount: 2 }), {
    allowed: false,
    reason: 'TRAFFIC_SHARE_OUT_OF_BOUNDS',
    traffic_share: 0
  });
});

test('EXPLORATION on a safe workload records mode, policy ref, and traffic share', () => {
  const decision = route({
    routing_request: buildRequest(), // safe, exec_alpha + exec_beta
    exploration_policy: { policy_ref: 'explore/main', max_traffic_share: 0.25, allowed_safety_classes: ['safe'] },
    executions_count: { exec_alpha: 9, exec_beta: 2 },
    decided_at: '2026-09-25T10:06:00.000Z'
  });

  assert.equal(decision.selection_mode, 'EXPLORATION');
  assert.equal(decision.selected_executor_id, 'exec_beta'); // fewest executions
  assert.deepEqual(decision.exploration, { policy_ref: 'explore/main', traffic_share: 0.25 });
  assert.equal(decision.jev_receipt_ref, null);
  assert.equal(decision.fallback_of, null);
  assertContractValid(decision, ROUTING_DECISION_CONTRACT);
});

test('exploration ties on execution count pick the lexicographically smallest candidate', () => {
  const decision = route({
    routing_request: buildRequest(),
    exploration_policy: { policy_ref: 'explore/main', max_traffic_share: 0.1, allowed_safety_classes: ['safe'] },
    executions_count: null, // all default to 0
    decided_at: '2026-09-25T10:07:00.000Z'
  });
  assert.equal(decision.selection_mode, 'EXPLORATION');
  assert.equal(decision.selected_executor_id, 'exec_alpha');
});

test('EXPLORATION is rejected on high_risk workloads and deterministic NORMAL_SELECTION applies instead', () => {
  const explorationPolicy = { policy_ref: 'explore/main', max_traffic_share: 0.2, allowed_safety_classes: ['safe', 'high_risk'] };
  const gate = decideExploration({ explorationPolicy, workloadSafetyClass: 'high_risk', candidateCount: 2 });
  assert.equal(gate.allowed, false); // forbidden class, even though the policy lists it

  const scores = scoreCandidates({
    candidates: [
      { executor_id: 'exec_alpha', signals: { verified_success: { value: 1, evidence_ref: 'verif_alpha_run_1' } } },
      { executor_id: 'exec_beta', signals: { verified_success: { value: 4, evidence_ref: 'verif_beta_run_1' } } }
    ],
    weights: { verified_success: 1 }
  });
  const decision = route({
    routing_request: buildRequest({ workload_safety_class: 'high_risk' }),
    exploration_policy: explorationPolicy,
    scores,
    decided_at: '2026-09-25T10:08:00.000Z'
  });

  assert.equal(decision.selection_mode, 'NORMAL_SELECTION');
  assert.equal(decision.selected_executor_id, 'exec_beta');
  assert.equal(decision.exploration, null);
  assert.equal(decision.workload_safety_class, 'high_risk');
  assertContractValid(decision, ROUTING_DECISION_CONTRACT);
});

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

test('fallback chain selects the first available eligible member and records fallback_of', () => {
  const decision = route({
    routing_request: buildRequest({ eligible: eligibleEntries('exec_alpha', 'exec_beta', 'exec_gamma') }),
    fallback_chain: ['exec_alpha', 'exec_beta', 'exec_gamma'],
    failed_primary: 'exec_alpha',
    decided_at: '2026-09-25T10:09:00.000Z'
  });

  assert.equal(decision.selection_mode, 'FALLBACK');
  assert.equal(decision.selected_executor_id, 'exec_beta'); // failed primary skipped
  assert.equal(decision.fallback_of, 'exec_alpha');
  assertContractValid(decision, ROUTING_DECISION_CONTRACT);
});

// ---------------------------------------------------------------------------
// Fail-closed routing
// ---------------------------------------------------------------------------

test('missing qualification reference fails closed', () => {
  const request = buildRequest({ eligible: eligibleEntries('exec_alpha') });
  const withoutQualifications = { ...request, eligible: [] }; // no proof for the selected executor
  assertFailClosedCode(
    () => route({ routing_request: withoutQualifications, decided_at: '2026-09-25T10:10:00.000Z' }),
    'QUALIFICATION_MISSING'
  );
});

test('indeterminate routing fails closed instead of guessing', () => {
  assertFailClosedCode(
    () =>
      route({
        routing_request: buildRequest(), // two eligible, no binding rule applies
        decided_at: '2026-09-25T10:11:00.000Z'
      }),
    'ROUTING_INDETERMINATE'
  );
});

// ---------------------------------------------------------------------------
// Composition (MAWS-VN-603, OD-15)
// ---------------------------------------------------------------------------

function compositionPolicy(overrides = {}) {
  return {
    policy_id: 'comp_demo_policy',
    allowed_modes: ['independent_parallel', 'producer_verifier'],
    max_executors: 3,
    max_parallelism: 2,
    workload_safety_classes_allowed: ['safe', 'reversible_only'],
    ...overrides
  };
}

function participants(...executorIds) {
  return executorIds.map((executorId) => ({ executor_id: executorId, routing_decision_ref: `rd_ref_${executorId.slice('exec_'.length)}` }));
}

test('buildComposition produces a schema-valid decision inside policy bounds', () => {
  const decision = buildComposition({
    composition_policy: compositionPolicy(),
    mode: 'independent_parallel',
    participants: participants('exec_alpha', 'exec_beta'),
    authority_ceiling_ref: 'ceiling/wu_demo_work_unit',
    created_at: '2026-09-25T10:12:00.000Z'
  });

  assert.equal(decision.policy_ref, 'comp_demo_policy');
  assert.equal(decision.mode, 'independent_parallel');
  assert.equal(decision.authority_aggregation, 'none'); // composition never aggregates authority
  assert.equal(decision.participants.length, 2);
  assertContractValid(decision, COMPOSITION_DECISION_CONTRACT);
});

test('composition rejects disallowed mode, participant overflow, and duplicate executors', () => {
  const base = { composition_policy: compositionPolicy(), authority_ceiling_ref: 'ceiling/wu_demo_work_unit' };

  // Mode not in the policy's allowed_modes.
  assertFailClosedCode(
    () => buildComposition({ ...base, mode: 'specialist_synthesis', participants: participants('exec_alpha') }),
    'COMPOSITION_POLICY_VIOLATION'
  );
  // More participants than max_executors (3).
  assertFailClosedCode(
    () =>
      buildComposition({
        ...base,
        mode: 'independent_parallel',
        participants: participants('exec_alpha', 'exec_beta', 'exec_gamma', 'exec_delta')
      }),
    'COMPOSITION_POLICY_VIOLATION'
  );
  // Duplicate executor ids.
  assertFailClosedCode(
    () => buildComposition({ ...base, mode: 'independent_parallel', participants: participants('exec_alpha', 'exec_alpha') }),
    'COMPOSITION_POLICY_VIOLATION'
  );
});

// ---------------------------------------------------------------------------
// Typed disagreement (MAWS-VN-604, OD-16)
// ---------------------------------------------------------------------------

function disagreementPolicy(overrides = {}) {
  return {
    policy_id: 'dis_demo_policy',
    disagreement_class: 'factual_conflict',
    required_actions: { independent_verification: true, evidence_review: false, human_gate: false },
    synthesizer_authority: 'none',
    fail_closed: false,
    ...overrides
  };
}

test('classifyDisagreement validates the typed class enum', () => {
  for (const disagreementClass of [
    'factual_conflict',
    'implementation_conflict',
    'verification_conflict',
    'evidence_conflict',
    'policy_conflict',
    'authority_conflict'
  ]) {
    assert.equal(classifyDisagreement({ conflict_kind_hint: disagreementClass }), disagreementClass);
  }
  assertFailClosedCode(() => classifyDisagreement({ conflict_kind_hint: 'vibes_conflict' }), 'DISAGREEMENT_CLASS_UNKNOWN');
  assertFailClosedCode(() => classifyDisagreement({}), 'DISAGREEMENT_CLASS_UNKNOWN');
});

test('factual conflicts resolve only via independent verification or a human decision', () => {
  const resolved = resolveDisagreement({
    disagreement_class: 'factual_conflict',
    policy: disagreementPolicy(),
    evidence: { independent_verification_result: true, evidence_review_result: false },
    human_decision: null,
    decided_at: '2026-09-25T10:13:00.000Z'
  });
  assert.equal(resolved.outcome, 'RESOLVED');
  assert.equal(resolved.resolved_by, 'independent_verification');
  assert.equal(resolved.synthesizer_independent_authority, false);
  assertContractValid(resolved, DISAGREEMENT_DECISION_CONTRACT);

  const humanResolved = resolveDisagreement({
    disagreement_class: 'factual_conflict',
    policy: disagreementPolicy(),
    evidence: { independent_verification_result: false, evidence_review_result: true },
    human_decision: true,
    decided_at: '2026-09-25T10:14:00.000Z'
  });
  assert.equal(humanResolved.outcome, 'RESOLVED');
  assert.equal(humanResolved.resolved_by, 'human_gate');

  // Evidence review alone can never resolve a factual conflict.
  const escalated = resolveDisagreement({
    disagreement_class: 'factual_conflict',
    policy: disagreementPolicy(),
    evidence: { independent_verification_result: false, evidence_review_result: true },
    human_decision: null,
    decided_at: '2026-09-25T10:15:00.000Z'
  });
  assert.equal(escalated.outcome, 'ESCALATED');
  assertContractValid(escalated, DISAGREEMENT_DECISION_CONTRACT);

  const blocked = resolveDisagreement({
    disagreement_class: 'factual_conflict',
    policy: disagreementPolicy({ fail_closed: true }),
    evidence: { independent_verification_result: false, evidence_review_result: false },
    human_decision: null,
    decided_at: '2026-09-25T10:16:00.000Z'
  });
  assert.equal(blocked.outcome, 'BLOCKED');
  assertContractValid(blocked, DISAGREEMENT_DECISION_CONTRACT);
});

test('non-factual classes resolve only when policy-required actions are satisfied', () => {
  const policy = disagreementPolicy({
    disagreement_class: 'implementation_conflict',
    required_actions: { independent_verification: false, evidence_review: true, human_gate: false }
  });
  const satisfied = resolveDisagreement({
    disagreement_class: 'implementation_conflict',
    policy,
    evidence: { independent_verification_result: false, evidence_review_result: true },
    human_decision: null,
    decided_at: '2026-09-25T10:17:00.000Z'
  });
  assert.equal(satisfied.outcome, 'RESOLVED');
  assert.equal(satisfied.resolved_by, 'evidence_review');
  assertContractValid(satisfied, DISAGREEMENT_DECISION_CONTRACT);

  const unmet = resolveDisagreement({
    disagreement_class: 'implementation_conflict',
    policy,
    evidence: { independent_verification_result: false, evidence_review_result: false },
    human_decision: null,
    decided_at: '2026-09-25T10:18:00.000Z'
  });
  assert.equal(unmet.outcome, 'ESCALATED');

  const unmetFailClosed = resolveDisagreement({
    disagreement_class: 'implementation_conflict',
    policy: disagreementPolicy({
      disagreement_class: 'implementation_conflict',
      required_actions: { independent_verification: false, evidence_review: true, human_gate: false },
      fail_closed: true
    }),
    evidence: { independent_verification_result: false, evidence_review_result: false },
    human_decision: null,
    decided_at: '2026-09-25T10:19:00.000Z'
  });
  assert.equal(unmetFailClosed.outcome, 'BLOCKED');
  assertContractValid(unmetFailClosed, DISAGREEMENT_DECISION_CONTRACT);
});

test('authority conflicts are never RESOLVED by the runtime', () => {
  const policy = disagreementPolicy({
    disagreement_class: 'authority_conflict',
    required_actions: { independent_verification: false, evidence_review: false, human_gate: true },
    fail_closed: true
  });

  // Even with every evidence result true, an authority conflict with a human
  // decision escalates to the human gate — it is never resolved here.
  const escalated = resolveDisagreement({
    disagreement_class: 'authority_conflict',
    policy,
    evidence: { independent_verification_result: true, evidence_review_result: true },
    human_decision: true,
    decided_at: '2026-09-25T10:20:00.000Z'
  });
  assert.equal(escalated.outcome, 'ESCALATED');
  assert.notEqual(escalated.outcome, 'RESOLVED');
  assert.equal(escalated.resolved_by, 'human_gate');
  assert.equal(escalated.synthesizer_independent_authority, false);
  assertContractValid(escalated, DISAGREEMENT_DECISION_CONTRACT);

  const blocked = resolveDisagreement({
    disagreement_class: 'authority_conflict',
    policy,
    evidence: { independent_verification_result: true, evidence_review_result: true },
    human_decision: null,
    decided_at: '2026-09-25T10:21:00.000Z'
  });
  assert.equal(blocked.outcome, 'BLOCKED');
  assert.notEqual(blocked.outcome, 'RESOLVED');
  assertContractValid(blocked, DISAGREEMENT_DECISION_CONTRACT);
});

test('disagreement policies must match the class and stay synthesizer-authority-free', () => {
  assertFailClosedCode(
    () =>
      resolveDisagreement({
        disagreement_class: 'policy_conflict',
        policy: disagreementPolicy({ disagreement_class: 'factual_conflict' }),
        evidence: { independent_verification_result: true, evidence_review_result: true },
        human_decision: true
      }),
    'DISAGREEMENT_POLICY_MISMATCH'
  );
  assertFailClosedCode(
    () =>
      resolveDisagreement({
        disagreement_class: 'factual_conflict',
        policy: disagreementPolicy({ synthesizer_authority: 'sovereign' }),
        evidence: { independent_verification_result: true, evidence_review_result: false },
        human_decision: null
      }),
    'SYNTHESIZER_AUTHORITY_FORBIDDEN'
  );
});
