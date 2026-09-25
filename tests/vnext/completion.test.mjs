// Phase 7 vNext tests (MAWS-VN-700..702): observability event extension,
// verification receipts, and the contract-driven completion engine (OD-17).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildVnextEvent, correlationKey, VNEXT_EVENT_FAMILIES } from '../../runtime/observability/vnext-events.mjs';
import { evaluateCompletion } from '../../runtime/completion/completion-engine.mjs';
import { buildVerificationReceipt, evaluateVerificationReceipts } from '../../runtime/completion/verification.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const WORK_UNIT_ID = 'wu_phase7_full';
const ALL_CLAUSE_KEYS = [
  'execution_success',
  'required_outputs',
  'required_evidence',
  'verification',
  'dependency_closure',
  'child_closure',
  'disagreement_closure',
  'graph_conditions'
];

function fullContract() {
  return {
    contract_id: 'cc_phase7_full',
    work_unit_id: WORK_UNIT_ID,
    clauses: {
      execution_success: { required: true },
      required_outputs: [{ output_id: 'out_report', artifact_ref: 'artifacts/report.md' }],
      required_evidence: ['evid_exec_1', 'evid_ver_1'],
      verification: { required: true, independent: true },
      dependency_closure: { required: true },
      child_closure: { required: true },
      disagreement_closure: ['factual_conflict'],
      graph_conditions: [
        { condition: 'all_nodes_completed', expected: true },
        { condition: 'active_graph_version_matches', expected: true }
      ]
    }
  };
}

function passingReceipt() {
  return buildVerificationReceipt({
    work_unit_id: WORK_UNIT_ID,
    verifier_executor_id: 'exec_indep_verifier',
    independent: true,
    outcome: 'PASS',
    evidence_refs: ['evid_ver_1'],
    checks: ['artifact_checksum_match']
  });
}

function fullInput(overrides = {}) {
  return {
    completion_contract: fullContract(),
    execution_results: [
      { execution_attempt_id: 'ea_phase7_1', work_unit_id: WORK_UNIT_ID, outcome: 'SUCCESS' }
    ],
    verification_receipts: [passingReceipt()],
    dependency_states: [{ work_unit_id: 'wu_phase7_dep', completed: true }],
    child_states: [{ work_unit_id: 'wu_phase7_child', completed: true }],
    disagreement_decisions: [
      { disagreement_class: 'factual_conflict', outcome: 'ESCALATED' },
      { disagreement_class: 'factual_conflict', outcome: 'RESOLVED' }
    ],
    graph_state: { all_nodes_completed: true, active_graph_version: 3, expected_graph_version: 3 },
    outputs_present: ['out_report'],
    evidence_present: ['evid_exec_1', 'evid_ver_1'],
    decided_at: '2026-09-25T12:00:00.000Z',
    ...overrides
  };
}

test('full-satisfied input evaluates to COMPLETED and validates against the completion-decision contract', () => {
  const decision = evaluateCompletion(fullInput());

  assert.equal(decision.result, 'COMPLETED');
  assert.equal(decision.execution_succeeded, true);
  assert.equal(decision.verification_satisfied, true);
  assert.equal(decision.work_unit_id, WORK_UNIT_ID);
  assert.equal(decision.contract_ref, 'cc_phase7_full');
  assert.deepEqual(decision.satisfied_clauses, ALL_CLAUSE_KEYS);
  assert.deepEqual(decision.unsatisfied_clauses, []);
  assert.deepEqual(decision.blocking_reasons, []);
  assert.ok(decision.evidence_refs.includes('ea_phase7_1'));
  assert.ok(decision.evidence_refs.some((ref) => ref.startsWith('vr_')));
  assert.ok(decision.evidence_refs.includes('evid_ver_1'));

  const issues = validateInstanceAgainstContract(decision, 'core/contracts/completion-decision.schema.json', root);
  assert.deepEqual(issues, []);
});

test('executor SUCCESS alone does not complete: unsatisfied clauses and blocking reasons', () => {
  const contract = {
    contract_id: 'cc_phase7_success_only',
    work_unit_id: WORK_UNIT_ID,
    clauses: {
      execution_success: { required: true },
      required_outputs: [{ output_id: 'out_report', artifact_ref: 'artifacts/report.md' }],
      required_evidence: ['evid_exec_1'],
      verification: { required: true, independent: false },
      dependency_closure: { required: false },
      child_closure: { required: false },
      disagreement_closure: [],
      graph_conditions: []
    }
  };

  const decision = evaluateCompletion({
    completion_contract: contract,
    execution_results: [{ execution_attempt_id: 'ea_phase7_1', work_unit_id: WORK_UNIT_ID, outcome: 'SUCCESS' }],
    verification_receipts: [],
    outputs_present: [],
    evidence_present: [],
    decided_at: '2026-09-25T12:00:00.000Z'
  });

  assert.equal(decision.result, 'NOT_COMPLETED');
  assert.equal(decision.execution_succeeded, true);
  assert.deepEqual(decision.satisfied_clauses, ['execution_success']);
  assert.deepEqual(decision.unsatisfied_clauses, ['required_outputs', 'required_evidence', 'verification']);
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('out_report')));
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('evid_exec_1')));
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('PASS receipt')));

  const issues = validateInstanceAgainstContract(decision, 'core/contracts/completion-decision.schema.json', root);
  assert.deepEqual(issues, []);
});

test('missing required evidence blocks completion', () => {
  const decision = evaluateCompletion(fullInput({ evidence_present: ['evid_exec_1'] }));

  assert.equal(decision.result, 'NOT_COMPLETED');
  assert.ok(decision.unsatisfied_clauses.includes('required_evidence'));
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('evid_ver_1')));
});

test('incomplete dependency blocks completion', () => {
  const decision = evaluateCompletion(fullInput({
    dependency_states: [{ work_unit_id: 'wu_phase7_dep', completed: false }]
  }));

  assert.equal(decision.result, 'NOT_COMPLETED');
  assert.ok(decision.unsatisfied_clauses.includes('dependency_closure'));
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('wu_phase7_dep')));
});

test('FAIL verification receipt blocks completion and is blocking evidence', () => {
  const failReceipt = buildVerificationReceipt({
    work_unit_id: WORK_UNIT_ID,
    verifier_executor_id: 'exec_indep_verifier',
    independent: true,
    outcome: 'FAIL',
    evidence_refs: ['evid_ver_1'],
    checks: ['artifact_checksum_match']
  });

  const direct = evaluateVerificationReceipts([failReceipt]);
  assert.equal(direct.satisfied, false);
  assert.ok(direct.blocking.some((reason) => reason.includes('FAIL')));

  const decision = evaluateCompletion(fullInput({ verification_receipts: [failReceipt] }));
  assert.equal(decision.result, 'NOT_COMPLETED');
  assert.equal(decision.verification_satisfied, false);
  assert.ok(decision.unsatisfied_clauses.includes('verification'));
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('FAIL')));
});

test('graph version mismatch blocks completion', () => {
  const decision = evaluateCompletion(fullInput({
    graph_state: { all_nodes_completed: true, active_graph_version: 3, expected_graph_version: 4 }
  }));

  assert.equal(decision.result, 'NOT_COMPLETED');
  assert.ok(decision.unsatisfied_clauses.includes('graph_conditions'));
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('expected graph version 4')));
});

test('unresolved disagreement blocks completion and the latest decision governs closure', () => {
  // No decision recorded for the required class (only for another class).
  const unresolved = evaluateCompletion(fullInput({
    disagreement_decisions: [{ disagreement_class: 'implementation_conflict', outcome: 'RESOLVED' }]
  }));
  assert.equal(unresolved.result, 'NOT_COMPLETED');
  assert.ok(unresolved.unsatisfied_clauses.includes('disagreement_closure'));
  assert.ok(unresolved.blocking_reasons.some((reason) => reason.includes('factual_conflict')));

  // ESCALATED recorded after RESOLVED -> latest outcome governs, still unresolved.
  const reopened = evaluateCompletion(fullInput({
    disagreement_decisions: [
      { disagreement_class: 'factual_conflict', outcome: 'RESOLVED' },
      { disagreement_class: 'factual_conflict', outcome: 'ESCALATED' }
    ]
  }));
  assert.equal(reopened.result, 'NOT_COMPLETED');
  assert.ok(reopened.blocking_reasons.some((reason) => reason.includes('latest outcome ESCALATED')));

  // RESOLVED recorded after ESCALATED -> closed (full input default fixture).
  const closed = evaluateCompletion(fullInput());
  assert.equal(closed.result, 'COMPLETED');
});

test('independent verification requirement demands an independent PASS receipt', () => {
  const selfVerified = buildVerificationReceipt({
    work_unit_id: WORK_UNIT_ID,
    verifier_executor_id: 'exec_producer',
    independent: false,
    outcome: 'PASS',
    evidence_refs: ['evid_ver_1'],
    checks: ['self_check']
  });

  const direct = evaluateVerificationReceipts([selfVerified], { independentRequired: true });
  assert.equal(direct.satisfied, false);
  assert.ok(direct.blocking.some((reason) => reason.includes('independent')));

  const decision = evaluateCompletion(fullInput({ verification_receipts: [selfVerified] }));
  assert.equal(decision.result, 'NOT_COMPLETED');
  assert.equal(decision.verification_satisfied, false);
  assert.ok(decision.blocking_reasons.some((reason) => reason.includes('independent')));
});

test('unknown completion-contract clause shape fails closed with COMPLETION_CONTRACT_INVALID', () => {
  const unknownClause = fullContract();
  unknownClause.clauses.mystery_clause = { required: true };
  assert.throws(
    () => evaluateCompletion(fullInput({ completion_contract: unknownClause })),
    (error) => error.name === 'FailClosedError' && error.code === 'COMPLETION_CONTRACT_INVALID'
  );

  const malformedVerification = fullContract();
  malformedVerification.clauses.verification = { required: true };
  assert.throws(
    () => evaluateCompletion(fullInput({ completion_contract: malformedVerification })),
    (error) => error.name === 'FailClosedError' && error.code === 'COMPLETION_CONTRACT_INVALID'
  );
});

test('vnext events: all 12 families build and carry every present correlation id', () => {
  assert.equal(VNEXT_EVENT_FAMILIES.length, 12);

  for (const family of VNEXT_EVENT_FAMILIES) {
    const event = buildVnextEvent({
      family,
      type: `${family}.sample`,
      run_id: 'run_phase7_evt',
      work_unit_id: 'wu_evt_1',
      graph_version: 2,
      executor_id: 'exec_evt_1',
      qualification_ref: 'qual_evt_1',
      routing_decision_ref: 'rd_evt_1',
      execution_attempt_id: 'ea_evt_1',
      outcome: 'SUCCESS',
      details: { note: 'phase 7 sample' },
      provenance: 'observed',
      occurred_at: '2026-09-25T12:00:00.000Z'
    });

    assert.equal(event.event_family, family, `family ${family}`);
    assert.equal(event.event_name, `${family}.sample`);
    assert.equal(event.workflow.run_id, 'run_phase7_evt');
    assert.equal(event.correlation.trace_id, 'run_phase7_evt');
    assert.equal(event.attributes['work_unit.id'], 'wu_evt_1');
    assert.equal(event.attributes['graph.version'], 2);
    assert.equal(event.attributes['executor.id'], 'exec_evt_1');
    assert.equal(event.attributes['qualification.ref'], 'qual_evt_1');
    assert.equal(event.attributes['routing.decision_ref'], 'rd_evt_1');
    assert.equal(event.attributes['execution.attempt_id'], 'ea_evt_1');
  }
});

test('vnext events: correlationKey is stable, complete, and sensitive to correlation ids', () => {
  const sharedIds = {
    run_id: 'run_keycheck',
    work_unit_id: 'wu_keycheck',
    graph_version: 5,
    executor_id: 'exec_keycheck',
    qualification_ref: 'qual_keycheck',
    routing_decision_ref: 'rd_keycheck',
    execution_attempt_id: 'ea_keycheck',
    provenance: 'observed',
    occurred_at: '2026-09-25T12:00:00.000Z'
  };

  const first = buildVnextEvent({ ...sharedIds, family: 'execution', type: 'execution.finished', outcome: 'SUCCESS' });
  const second = buildVnextEvent({ ...sharedIds, family: 'routing', type: 'routing.selected', outcome: 'BLOCKED' });

  const keyFirst = correlationKey(first);
  const keySecond = correlationKey(second);
  assert.equal(keyFirst, keySecond);

  for (const expected of [
    'run_id=run_keycheck',
    'work_unit_id=wu_keycheck',
    'graph_version=5',
    'executor_id=exec_keycheck',
    'qualification_ref=qual_keycheck',
    'routing_decision_ref=rd_keycheck',
    'execution_attempt_id=ea_keycheck'
  ]) {
    assert.ok(keyFirst.includes(expected), `key missing ${expected}: ${keyFirst}`);
  }

  const otherUnit = buildVnextEvent({
    ...sharedIds,
    family: 'execution',
    type: 'execution.finished',
    work_unit_id: 'wu_other',
    outcome: 'SUCCESS'
  });
  assert.notEqual(correlationKey(otherUnit), keyFirst);

  // Raw snake_case input objects yield the same key as built events.
  assert.equal(correlationKey({ ...sharedIds }), keyFirst);
});

test('vnext events: built events satisfy the observability spine envelope requirements', () => {
  const spine = JSON.parse(fs.readFileSync(path.join(root, 'core', 'contracts', 'observability-spine.json'), 'utf8'));
  const attributeKeyPattern = new RegExp(Object.keys(spine.properties.attributes.patternProperties)[0]);

  // vNext families are an additive extension; they must not collide with the
  // frozen spine families (the spine file itself stays untouched).
  const spineFamilies = spine.properties.event_family.enum;
  for (const family of VNEXT_EVENT_FAMILIES) {
    assert.ok(!spineFamilies.includes(family), `vNext family ${family} must stay additive to the frozen spine enum`);
  }

  for (const outcome of ['SUCCESS', 'BLOCKED']) {
    const event = buildVnextEvent({
      family: 'verification',
      type: 'verification.recorded',
      run_id: 'run_spinecheck',
      work_unit_id: 'wu_spinecheck',
      graph_version: 1,
      outcome,
      details: { check: 'checksum_match' },
      provenance: 'inferred',
      occurred_at: '2026-09-25T12:00:00.000Z'
    });

    for (const requiredField of spine.required) {
      assert.ok(requiredField in event, `missing spine envelope field ${requiredField}`);
    }
    for (const field of spine.properties.workflow.required) {
      assert.ok(typeof event.workflow[field] === 'string' && event.workflow[field].length > 0);
    }
    for (const field of spine.properties.actor.required) {
      assert.ok(field in event.actor);
    }
    for (const field of spine.properties.correlation.required) {
      assert.ok(typeof event.correlation[field] === 'string' && event.correlation[field].length > 0);
    }
    assert.ok(spine.properties.provenance.properties.claim_state.enum.includes(event.provenance.claim_state));
    for (const field of spine.properties.provenance.required) {
      assert.ok(field in event.provenance);
    }
    for (const field of spine.properties.provenance.properties.source.required) {
      assert.ok(field in event.provenance.source);
    }
    assert.ok(spine.properties.outcome.properties.status.enum.includes(event.outcome.status));
    assert.ok(typeof event.timestamp === 'string' && event.timestamp.length > 0);
    assert.ok(event.event_id.length > 0);

    for (const [key, value] of Object.entries(event.attributes)) {
      assert.match(key, attributeKeyPattern);
      assert.ok(['string', 'number', 'boolean'].includes(typeof value) || value === null);
    }

    if (outcome === 'BLOCKED') {
      assert.ok(Array.isArray(event.outcome.blocking_reasons) && event.outcome.blocking_reasons.length > 0);
      const allowedReasons = spine.properties.outcome.properties.blocking_reasons.items.enum;
      for (const reason of event.outcome.blocking_reasons) {
        assert.ok(allowedReasons.includes(reason));
      }
    }
  }
});

test('vnext events: unknown families, unclassified provenance, bad outcomes, and secret-shaped details fail closed', () => {
  assert.throws(
    () => buildVnextEvent({ family: 'not.a.vnext.family', type: 'x', run_id: 'run_x', provenance: 'observed' }),
    (error) => error.code === 'VNEXT_EVENT_FAMILY_UNKNOWN'
  );
  assert.throws(
    () => buildVnextEvent({ family: 'routing', type: 'routing.selected', run_id: 'run_x' }),
    (error) => error.code === 'VNEXT_EVENT_PROVENANCE_INVALID'
  );
  assert.throws(
    () => buildVnextEvent({ family: 'routing', type: 'routing.selected', run_id: 'run_x', provenance: 'observed', outcome: 'WEIRD' }),
    (error) => error.code === 'VNEXT_EVENT_OUTCOME_INVALID'
  );
  assert.throws(
    () => buildVnextEvent({
      family: 'execution',
      type: 'execution.started',
      run_id: 'run_x',
      provenance: 'observed',
      details: { api_key: 'super-secret-value' }
    }),
    (error) => error.code === 'VNEXT_EVENT_SECRET_SUSPECTED'
  );
});
