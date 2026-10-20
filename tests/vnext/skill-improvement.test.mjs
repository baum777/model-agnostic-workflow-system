// MAWS vNext — S4 Skill Improvement Analyzer tests (MAWS-SII-TARGET-SPEC-001).
// node:test + node:assert/strict, no new dependencies. Fixture truth:
// evals/fixtures/maws-vnext/skill-improvement-proposal.contracts.json, validated
// with the same draft-2020-12-subset engine that backs the vNext contract
// spine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import { analyzeFeedback, deriveDiagnosis } from '../../runtime/skills/feedback-analyzer.mjs';
import { buildSkillUniverse, classifyImprovement, RESPONSIBLE_AREA_BY_ERROR_CLASS } from '../../runtime/skills/improvement-classifier.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/skill-improvement-proposal.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'skill-improvement-proposal.contracts.json');

const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMA_PATH), 'utf8'));
const FEEDBACK_SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'core', 'contracts', 'skill-feedback.schema.json'), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'core', 'contracts', 'portable-skill-manifest.json'), 'utf8'));

const NOW = '2026-10-20T12:00:00Z';
const DIAGNOSIS_SKILL = 'core/skills/diagnostic-feedback-loop/SKILL.md';
const DIAGNOSIS_SKILL_UNREGISTERED = 'skills/test-matrix-builder/SKILL.md';

function caseById(caseId) {
  const entry = FIXTURE.cases.find((caseEntry) => caseEntry.case_id === caseId);
  assert.ok(entry, `fixture case ${caseId} must exist`);
  return entry;
}

function feedbackRecord(overrides = {}) {
  return {
    schema_version: '1.0.0',
    feedback_id: 'fb_operator_extend_diag_loop_001',
    created_at: '2026-10-20T09:00:00Z',
    source: {
      category: 'operator_correction',
      ref: 'owner session 2026-10-20 correction on diagnostic-feedback-loop usage'
    },
    subject: {
      task_ref: 'baum-os work order 2026-10-20 diagnosis lane',
      skill_ref: DIAGNOSIS_SKILL
    },
    error_class: 'SKILL_INSTRUCTION_ERROR',
    observed_problem: 'Skill activation guidance did not require minimizing the reproduction before hypothesizing.',
    evidence_refs: [
      'sandbox:runs/20261019T154500Z/next-gate.md',
      'file:core/skills/diagnostic-feedback-loop/SKILL.md'
    ],
    risk_class: 'MEDIUM',
    confidence: 'high',
    requires_owner_review: true,
    provenance: {
      captured_at: '2026-10-20T09:05:00Z',
      captured_by: 'operator:baum',
      source_revision: '982bc548e8b43c3ce1b09474d118740e1c6df372'
    },
    ...overrides
  };
}

const UNIVERSE = buildSkillUniverse({ root: ROOT });

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

test('fixture covers both directions with unique case ids', () => {
  assert.ok(FIXTURE.cases.length >= 10, 'fixture must carry a meaningful case matrix');
  const ids = FIXTURE.cases.map((caseEntry) => caseEntry.case_id);
  assert.equal(new Set(ids).size, ids.length, 'case ids must be unique');
  assert.ok(FIXTURE.cases.some((caseEntry) => caseEntry.valid), 'fixture must contain positive cases');
  assert.ok(FIXTURE.cases.some((caseEntry) => !caseEntry.valid), 'fixture must contain negative cases');
  for (const caseEntry of FIXTURE.cases) {
    assert.equal(caseEntry.schema, SCHEMA_PATH);
  }
});

test('every fixture case validates exactly as declared', () => {
  for (const caseEntry of FIXTURE.cases) {
    const issues = validateInstanceAgainstContract(caseEntry.instance, SCHEMA_PATH, ROOT);
    if (caseEntry.valid) {
      assert.deepEqual(issues, [], `${caseEntry.case_id} must pass but failed: ${issues.join('; ')}`);
    } else {
      assert.ok(issues.length > 0, `${caseEntry.case_id} must fail but passed`);
    }
  }
});

test('the proposal record keeps the closed, authority-free posture', () => {
  assert.equal(SCHEMA.additionalProperties, false);
  assert.equal(SCHEMA.properties.authority_granted.const, false);
  assert.equal(SCHEMA.properties.feedback_ref.additionalProperties, false);
  assert.equal(SCHEMA.properties.candidate_evaluation.additionalProperties, false);
  assert.equal(SCHEMA.properties.change_scope.additionalProperties, false);
  assert.deepEqual(SCHEMA.properties.evidence_refs.minItems, 1);
  const proposalIds = FIXTURE.cases.map((caseEntry) => caseEntry.instance.proposal_id);
  assert.equal(new Set(proposalIds).size, proposalIds.length, 'proposal ids must be unique');
});

test('the error class vocabulary is shared with the S1 feedback contract', () => {
  assert.equal(
    JSON.stringify(SCHEMA.properties.error_class.$ref),
    JSON.stringify('skill-feedback.schema.json#/properties/error_class'),
    'the carried-forward error class must reference the S1 taxonomy so the two cannot drift'
  );
  const mappingRule = SCHEMA.allOf.find((rule) => Array.isArray(rule.anyOf));
  assert.ok(mappingRule, 'the error-class to responsible-area mapping must exist in the canonical schema');
  const schemaMapping = new Map(
    mappingRule.anyOf.map((branch) => [
      branch.properties.error_class.const,
      branch.properties.responsible_area.const
    ])
  );
  assert.deepEqual(
    [...schemaMapping.keys()].sort(),
    [...FEEDBACK_SCHEMA.properties.error_class.enum].sort(),
    'the mapping must cover the closed S1 error-class taxonomy exactly'
  );
  for (const [errorClass, area] of Object.entries(RESPONSIBLE_AREA_BY_ERROR_CLASS)) {
    assert.equal(schemaMapping.get(errorClass), area, `runtime and contract disagree on the area of ${errorClass}`);
  }
  const mismatched = caseById('skill-improvement-invalid-area-class-mismatch');
  assert.equal(mismatched.instance.error_class, 'TOOL_CONTRACT_ERROR');
  assert.equal(mismatched.instance.responsible_area, 'skill');
  assert.ok(
    validateInstanceAgainstContract(mismatched.instance, SCHEMA_PATH, ROOT).length > 0,
    'an error class and a disagreeing responsible area must fail closed'
  );
});

test('CREATE_SKILL always forces owner review (spec 8.4 gate)', () => {
  const rejected = caseById('skill-improvement-invalid-create-skill-without-owner-review');
  assert.equal(rejected.instance.decision, 'CREATE_SKILL');
  assert.equal(rejected.instance.requires_owner_review, false);
  assert.ok(validateInstanceAgainstContract(rejected.instance, SCHEMA_PATH, ROOT).length > 0);
});

test('a tool-contract cause can never carry a skill-changing decision (P2 repair)', () => {
  const rejected = caseById('skill-improvement-invalid-tool-contract-skill-change-forbidden');
  assert.equal(rejected.instance.error_class, 'TOOL_CONTRACT_ERROR');
  assert.equal(rejected.instance.decision, 'EXTEND_SKILL');
  assert.ok(validateInstanceAgainstContract(rejected.instance, SCHEMA_PATH, ROOT).length > 0);
  const accepted = caseById('skill-improvement-valid-tool-contract-no-change');
  assert.equal(accepted.instance.decision, 'NO_CHANGE');
  assert.deepEqual(validateInstanceAgainstContract(accepted.instance, SCHEMA_PATH, ROOT), []);
  const narrowing = SCHEMA.allOf.find(
    (rule) => rule.if && rule.if.properties && rule.if.properties.error_class
      && rule.if.properties.error_class.const === 'TOOL_CONTRACT_ERROR'
  );
  assert.ok(narrowing, 'the tool-contract narrowing rule must exist in the canonical schema');
  assert.ok(
    !narrowing.then.properties.decision.enum.includes('EXTEND_SKILL')
      && !narrowing.then.properties.decision.enum.includes('CREATE_SKILL'),
    'the tool-contract narrowing must exclude every skill-changing decision'
  );
});

test('a skill target exists only for the decisions that act on a skill', () => {
  const withoutTarget = caseById('skill-improvement-invalid-extend-without-target');
  assert.equal(withoutTarget.instance.decision, 'EXTEND_SKILL');
  assert.equal(withoutTarget.instance.target_skill_ref, undefined);
  assert.ok(validateInstanceAgainstContract(withoutTarget.instance, SCHEMA_PATH, ROOT).length > 0);
  const withTarget = caseById('skill-improvement-invalid-no-change-with-target');
  assert.equal(withTarget.instance.decision, 'NO_CHANGE');
  assert.ok(validateInstanceAgainstContract(withTarget.instance, SCHEMA_PATH, ROOT).length > 0);
});

test('promotion is never a proposal decision (closed vocabulary)', () => {
  const rejected = caseById('skill-improvement-invalid-unknown-decision-value');
  assert.equal(rejected.instance.decision, 'PROMOTE');
  assert.ok(validateInstanceAgainstContract(rejected.instance, SCHEMA_PATH, ROOT).length > 0);
  const decisions = SCHEMA.properties.decision.enum;
  assert.deepEqual(
    [...decisions].sort(),
    ['CREATE_SKILL', 'EXTEND_SKILL', 'NEEDS_MORE_EVIDENCE', 'NO_CHANGE', 'REUSE']
  );
  assert.ok(!decisions.includes('PROMOTE'));
  assert.ok(!decisions.includes('APPLY'));
});

test('a proposal never grants authority and never carries an unschemed evidence ref', () => {
  const granted = caseById('skill-improvement-invalid-authority-granted');
  assert.equal(granted.instance.authority_granted, true);
  assert.ok(validateInstanceAgainstContract(granted.instance, SCHEMA_PATH, ROOT).length > 0);
  const withoutEvidence = caseById('skill-improvement-invalid-missing-evidence-refs');
  assert.ok(validateInstanceAgainstContract(withoutEvidence.instance, SCHEMA_PATH, ROOT).length > 0);
  const schemePattern = SCHEMA.properties.evidence_refs.items.pattern;
  assert.ok(!/self/i.test(schemePattern), 'no self-report scheme may exist');
});

// ---------------------------------------------------------------------------
// Stage 2 — diagnose
// ---------------------------------------------------------------------------

test('the analyzer emits the primary error class from the proven cause location', () => {
  const feedback = feedbackRecord({
    error_class: 'SKILL_INSTRUCTION_ERROR'
  });
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: {
      skill_active: true,
      instruction_loaded: false,
      context_present: true,
      reproducible: true,
      attribution: 'skill'
    },
    now: NOW
  });
  assert.equal(diagnosis.error_class, 'SKILL_INSTRUCTION_ERROR');
  assert.equal(diagnosis.responsible_area_undefined, undefined);
  assert.equal(diagnosis.confidence, 'high');
  assert.equal(diagnosis.requires_owner_review, false);
  assert.ok(diagnosis.inferred_cause);
  assert.equal(diagnosis.authority_granted, false);
  assert.equal(diagnosis.checks.cause_attribution, 'skill');
});

test('the analyzer refuses an unattributed cause instead of guessing one', () => {
  const feedback = feedbackRecord({
    error_class: 'UNKNOWN_ROOT_CAUSE',
    requires_owner_review: true
  });
  const diagnosis = analyzeFeedback({ feedback, root: ROOT, evidence: {}, now: NOW });
  assert.equal(diagnosis.error_class, 'UNKNOWN_ROOT_CAUSE');
  assert.equal(diagnosis.inferred_cause, null, 'an unattributed cause must not carry a guessed cause statement');
  assert.equal(diagnosis.requires_owner_review, true);
  assert.equal(diagnosis.confidence, 'low');
});

test('a proven tool-contract cause outranks the captured class', () => {
  const feedback = feedbackRecord({ error_class: 'SKILL_INSTRUCTION_ERROR' });
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'tool', reproducible: true },
    now: NOW
  });
  assert.equal(diagnosis.error_class, 'TOOL_CONTRACT_ERROR');
  assert.ok(diagnosis.inferred_cause.includes('tool contract'));
});

test('a missing evidence ref fails closed', () => {
  const feedback = feedbackRecord({ evidence_refs: [] });
  assert.throws(
    () => analyzeFeedback({ feedback, root: ROOT, evidence: {}, now: NOW }),
    (error) => error.code === 'FEEDBACK_CONTRACT_INVALID',
    'a record without evidence must not reach a diagnosis'
  );
  assert.throws(
    () => deriveDiagnosis({ feedback, evidence: {}, now: NOW }),
    (error) => error.code === 'FEEDBACK_EVIDENCE_MISSING'
  );
});

test('a malformed feedback record fails closed', () => {
  const feedback = feedbackRecord({ error_class: 'SKILL_SKILL_ERROR' });
  assert.throws(
    () => analyzeFeedback({ feedback, root: ROOT, evidence: {}, now: NOW }),
    (error) => error.code === 'FEEDBACK_CONTRACT_INVALID'
  );
});

// ---------------------------------------------------------------------------
// Stage 3 — propose
// ---------------------------------------------------------------------------

test('the skill universe covers all three declared instruction trees', () => {
  const trees = new Set(UNIVERSE.skills.map((skill) => skill.tree));
  assert.ok(trees.has('core/skills'));
  assert.ok(trees.has('skills'));
  assert.ok(trees.has('.agents/skills'));
  const manifestNames = new Set(MANIFEST.skills.map((skill) => skill.name));
  const registered = UNIVERSE.skills.filter((skill) => skill.manifest_registered);
  assert.equal(registered.length, manifestNames.size, 'every manifest skill must be resolvable in the universe');
  assert.ok(
    UNIVERSE.skills.length > registered.length,
    'the instruction universe is larger than the portable manifest; the gap must be visible, not hidden'
  );
  assert.match(UNIVERSE.universe_digest, /^[0-9a-f]{64}$/);
});

test('a candidate outside the portable skill manifest is rejected with the recorded manifest gap', () => {
  const feedback = feedbackRecord();
  const diagnosis = deriveDiagnosis({
    feedback,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const proposal = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    coverage_evidence: [
      {
        skill_ref: DIAGNOSIS_SKILL_UNREGISTERED,
        relation: 'covers',
        evidence_refs: ['run:run_20261020_candidate_01']
      }
    ],
    now: NOW
  });
  const rejection = proposal.candidate_evaluation.rejected_candidates.find(
    (entry) => entry.candidate_ref === DIAGNOSIS_SKILL_UNREGISTERED
  );
  assert.ok(rejection, 'an unregistered candidate must be recorded, not silently ignored');
  assert.equal(rejection.reason, 'NOT_IN_PORTABLE_SKILL_MANIFEST');
  assert.ok(proposal.candidate_evaluation.candidates_considered.includes(DIAGNOSIS_SKILL_UNREGISTERED));
  assert.notEqual(proposal.target_skill_ref, DIAGNOSIS_SKILL_UNREGISTERED);
  assert.notEqual(proposal.decision, 'REUSE');
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});

test('the P2 repair scenario: a tool-contract cause never changes the skill surface', () => {
  const feedback = feedbackRecord({ error_class: 'TOOL_CONTRACT_ERROR', requires_owner_review: false });
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'tool', reproducible: true },
    now: NOW
  });
  assert.equal(diagnosis.error_class, 'TOOL_CONTRACT_ERROR');
  const proposal = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    // A skill candidate is available on purpose: the tool contract is the
    // proven cause, so the skill surface must still not be touched.
    coverage_evidence: [
      { skill_ref: DIAGNOSIS_SKILL, relation: 'extendable', evidence_refs: ['run:run_20261020_toolcontract_01'] }
    ],
    now: NOW
  });
  assert.equal(proposal.decision, 'NO_CHANGE');
  assert.equal(proposal.target_skill_ref, undefined, 'a tool-contract cause must not name a skill target');
  assert.equal(proposal.responsible_area, 'tool_contract');
  assert.equal(proposal.change_scope.surface, 'none');
  assert.deepEqual(proposal.change_scope.paths, []);
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});

test('the runtime cause never changes the skill surface either', () => {
  const feedback = feedbackRecord({ error_class: 'EXECUTOR_BEHAVIOR_ERROR' });
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'harness', reproducible: true },
    now: NOW
  });
  const proposal = classifyImprovement({ diagnosis, feedback, skill_universe: UNIVERSE, now: NOW });
  assert.equal(proposal.responsible_area, 'runtime');
  assert.equal(proposal.decision, 'NO_CHANGE');
  assert.equal(proposal.target_skill_ref, undefined);
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});

test('an existing covering skill yields REUSE and changes nothing', () => {
  const feedback = feedbackRecord({ error_class: 'SKILL_SELECTION_ERROR' });
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { skill_active: false, reproducible: true },
    now: NOW
  });
  const proposal = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    coverage_evidence: [
      { skill_ref: DIAGNOSIS_SKILL, relation: 'covers', evidence_refs: ['eval:eval:skill-routing 2026-10-20'] }
    ],
    now: NOW
  });
  assert.equal(proposal.decision, 'REUSE');
  assert.equal(proposal.target_skill_ref, DIAGNOSIS_SKILL);
  assert.equal(proposal.responsible_area, 'routing');
  assert.equal(proposal.change_scope.surface, 'none');
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});

test('an extendable skill yields EXTEND_SKILL and forces owner review', () => {
  const feedback = feedbackRecord();
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const proposal = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    coverage_evidence: [
      { skill_ref: DIAGNOSIS_SKILL, relation: 'extendable', evidence_refs: ['run:run_20261020_extend_01'] }
    ],
    now: NOW
  });
  assert.equal(proposal.decision, 'EXTEND_SKILL');
  assert.equal(proposal.target_skill_ref, DIAGNOSIS_SKILL);
  assert.equal(proposal.requires_owner_review, true);
  assert.equal(proposal.change_scope.surface, 'skill_instruction_file');
  assert.deepEqual(proposal.change_scope.paths, [DIAGNOSIS_SKILL]);
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});

test('reuse wins over extend and extend wins over create (spec 8.4 gate order)', () => {
  const feedback = feedbackRecord();
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const both = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    coverage_evidence: [
      { skill_ref: DIAGNOSIS_SKILL, relation: 'extendable', evidence_refs: ['run:run_20261020_extend_02'] },
      { skill_ref: 'core/skills/behavior-first-tdd/SKILL.md', relation: 'covers', evidence_refs: ['run:run_20261020_cover_02'] }
    ],
    now: NOW
  });
  assert.equal(both.decision, 'REUSE');
  assert.equal(both.target_skill_ref, 'core/skills/behavior-first-tdd/SKILL.md');
});

test('a proven recurring pattern yields CREATE_SKILL and forces owner review', () => {
  const feedback = feedbackRecord({
    source: { category: 'recurring_manual_rework', ref: 'owner session notes 2026-10-20' },
    error_class: 'SKILL_INSTRUCTION_ERROR'
  });
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const proposal = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    pattern_evidence: {
      recurrence_count: 3,
      evidence_refs: ['run:run_20261020_rework_01', 'run:run_20261020_rework_02']
    },
    new_skill_ref: 'drafts/skills/regression-evidence-preserver/SKILL.md',
    now: NOW
  });
  assert.equal(proposal.decision, 'CREATE_SKILL');
  assert.equal(proposal.requires_owner_review, true);
  assert.equal(proposal.target_skill_ref, undefined);
  assert.equal(proposal.change_scope.surface, 'skill_instruction_file');
  assert.deepEqual(proposal.change_scope.paths, ['drafts/skills/regression-evidence-preserver/SKILL.md']);
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});

test('a one-off correction never justifies a new skill', () => {
  const feedback = feedbackRecord();
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const proposal = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    pattern_evidence: { recurrence_count: 1, evidence_refs: ['run:run_20261020_rework_01'] },
    new_skill_ref: 'drafts/skills/regression-evidence-preserver/SKILL.md',
    now: NOW
  });
  assert.equal(proposal.decision, 'NO_CHANGE');
  assert.equal(proposal.target_skill_ref, undefined);
});

test('insufficient evidence stops at NEEDS_MORE_EVIDENCE and never guesses a cause', () => {
  const feedback = feedbackRecord({ error_class: 'UNKNOWN_ROOT_CAUSE', requires_owner_review: true });
  const diagnosis = analyzeFeedback({ feedback, root: ROOT, evidence: {}, now: NOW });
  assert.equal(diagnosis.inferred_cause, null);
  const proposal = classifyImprovement({ diagnosis, feedback, skill_universe: UNIVERSE, now: NOW });
  assert.equal(proposal.decision, 'NEEDS_MORE_EVIDENCE');
  assert.equal(proposal.inferred_cause, null, 'the proposal must not carry a guessed cause');
  assert.equal(proposal.target_skill_ref, undefined);
  assert.equal(proposal.responsible_area, null, 'an unattributed cause must not name a guessed owner');
  assert.equal(proposal.requires_owner_review, true);
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});

test('a diagnosis without evidence fails closed in the classifier', () => {
  const feedback = feedbackRecord();
  const diagnosis = deriveDiagnosis({ feedback, evidence: {}, now: NOW });
  diagnosis.evidence_refs = [];
  assert.throws(
    () => classifyImprovement({ diagnosis, feedback, skill_universe: UNIVERSE, now: NOW }),
    (error) => error.code === 'DIAGNOSIS_EVIDENCE_MISSING'
  );
});

test('the classifier is pure and deterministic', () => {
  const feedback = feedbackRecord();
  const diagnosis = deriveDiagnosis({
    feedback,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const input = {
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    coverage_evidence: [
      { skill_ref: DIAGNOSIS_SKILL, relation: 'extendable', evidence_refs: ['run:run_20261020_extend_03'] }
    ],
    now: NOW
  };
  const first = classifyImprovement(input);
  const second = classifyImprovement(input);
  assert.deepEqual(first, second);
  assert.equal(first.proposal_id, second.proposal_id);
  assert.match(first.proposal_id, /^sip_[a-z0-9_]+$/);
});

test('the proposal binds the feedback record it was derived from', () => {
  const feedback = feedbackRecord();
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const proposal = classifyImprovement({ diagnosis, feedback, skill_universe: UNIVERSE, now: NOW });
  assert.equal(proposal.feedback_ref.feedback_id, feedback.feedback_id);
  assert.equal(proposal.feedback_ref.feedback_schema_version, '1.0.0');
  assert.equal(proposal.diagnosis_ref.diagnosis_id, diagnosis.diagnosis_id);
  assert.equal(proposal.authority_granted, false);
  assert.ok(proposal.evidence_refs.length > 0);
  for (const ref of proposal.evidence_refs) {
    assert.match(ref, /^(artifact|edge|eval|file|graph|operator|path|review|run|sandbox|session|ticket|url):\S/);
  }
});

test('an unbounded candidate set fails closed instead of being truncated', () => {
  const feedback = feedbackRecord();
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  const coverage_evidence = Array.from({ length: 33 }, (unused, index) => ({
    skill_ref: `core/skills/diagnostic-feedback-loop/SKILL.md`,
    relation: 'covers',
    evidence_refs: [`run:run_20261020_bulk_${index}`]
  }));
  assert.throws(
    () => classifyImprovement({ diagnosis, feedback, skill_universe: UNIVERSE, coverage_evidence, now: NOW }),
    (error) => error.code === 'COVERAGE_EVIDENCE_TOO_MANY'
  );
});

test('the change scope stays inside the contract bound for a long cause statement', () => {
  const feedback = feedbackRecord();
  const diagnosis = analyzeFeedback({
    feedback,
    root: ROOT,
    evidence: { attribution: 'skill', skill_active: true, instruction_loaded: false, reproducible: true },
    now: NOW
  });
  diagnosis.inferred_cause = 'x'.repeat(500);
  const proposal = classifyImprovement({
    diagnosis,
    feedback,
    skill_universe: UNIVERSE,
    pattern_evidence: { recurrence_count: 4, evidence_refs: ['run:run_20261020_rework_03'] },
    new_skill_ref: 'drafts/skills/regression-evidence-preserver/SKILL.md',
    now: NOW
  });
  assert.equal(proposal.decision, 'CREATE_SKILL');
  assert.ok(proposal.change_scope.summary.length <= 500, 'the scope summary must stay inside the contract bound');
  assert.deepEqual(validateInstanceAgainstContract(proposal, SCHEMA_PATH, ROOT), []);
});
