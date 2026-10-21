// MAWS vNext — DSI dynamic skill selection tests.
//
// node:test + node:assert/strict, no new dependencies. Fixture truth:
// evals/fixtures/maws-vnext/skill-selection.contracts.json, validated with
// the same draft-2020-12-subset engine that backs the vNext contract spine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';
import {
  buildSkillRegistrySnapshot,
  capabilityIdFor,
  compareScopeVocabularies,
  loadSkill,
  requireSkill,
  SKILL_DENIAL_CODES
} from '../../runtime/skills/skill-registry-loader.mjs';
import {
  computeRequestDigest,
  deriveScopeCandidates,
  selectSkill,
  ORDERING_RULE,
  REFUSAL_CODES
} from '../../runtime/skills/skill-selector.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_PATH = 'core/contracts/skill-selection.schema.json';
const FIXTURE_PATH = path.join(ROOT, 'evals', 'fixtures', 'maws-vnext', 'skill-selection.contracts.json');

const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMA_PATH), 'utf8'));

const NOW = '2026-10-20T12:00:00Z';
// The revision the canonical fixture was recorded against: the baseline commit
// this slice was branched from. The snapshot digest in the fixture is the
// digest of the registry snapshot at this revision, so the fixture is
// reproducible rather than hand-written.
const REVISION = 'c66cad6e8eedee982cf5d83d84e082aef51e3dbb';

const SNAPSHOT = buildSkillRegistrySnapshot({ root: ROOT, revision: REVISION });

const ALL_CAPABILITIES = [...new Set(
  SNAPSHOT.skills.flatMap((skill) => skill.requires_capabilities)
)].sort();

const CONTEXT_ALL = { available_capabilities: ALL_CAPABILITIES };

function request(overrides = {}) {
  return {
    request_id: 'req_intake_001',
    intent_fingerprint: 'a'.repeat(64),
    scope: 'intake-and-truth-mapping',
    required_capabilities: ['cap_repo_audit'],
    ...overrides
  };
}

function skill(skillId) {
  const found = SNAPSHOT.skills.find((entry) => entry.skill_id === skillId);
  assert.ok(found, `the registry snapshot must contain ${skillId}`);
  return found;
}

function caseById(caseId) {
  const entry = FIXTURE.cases.find((caseEntry) => caseEntry.case_id === caseId);
  assert.ok(entry, `fixture case ${caseId} must exist`);
  return entry;
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

test('fixture covers both directions with unique case ids', () => {
  assert.ok(FIXTURE.cases.length >= 16, 'fixture must carry a meaningful case matrix');
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

test('the validator CLI reports zero issues on the canonical fixture', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'tools', 'validate-skill-selection.mjs')],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert.match(output, /skill-selection fixture: \d+ cases checked, 0 unexpected results/);
});

test('the selection record keeps the closed, authority-free posture', () => {
  assert.equal(SCHEMA.additionalProperties, false);
  assert.equal(SCHEMA.properties.authority_granted.const, false);
  assert.equal(SCHEMA.properties.request.additionalProperties, false);
  assert.equal(SCHEMA.properties.registry_snapshot.additionalProperties, false);
  assert.equal(SCHEMA.properties.ordering_key.additionalProperties, false);
  assert.equal(SCHEMA.properties.refusal.additionalProperties, false);
  assert.equal(SCHEMA.properties.selection.additionalProperties, false);
  assert.equal(SCHEMA.properties.ordering_key.properties.rule.const, ORDERING_RULE);
  assert.deepEqual(SCHEMA.properties.outcome.enum, ['SELECTED', 'REFUSED']);
  assert.deepEqual(SCHEMA.properties.refusal.properties.code.enum, REFUSAL_CODES);
});

test('the scope vocabulary of the contract is the canonical workflow-class vocabulary', () => {
  const routingMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'core', 'contracts', 'workflow-routing-map.json'), 'utf8'));
  const canonical = routingMap.workflowClasses.map((entry) => entry.workflowClass).sort();
  const declared = [...SCHEMA.properties.request.properties.scope.enum].sort();
  assert.deepEqual(declared, canonical);
});

test('the capability ids of the record use the canonical capability id shape', () => {
  const capabilityRef = SCHEMA.properties.request.properties.required_capabilities.items.$ref;
  assert.equal(capabilityRef, 'maws-vnext-common.schema.json#/$defs/capabilityId');
  assert.equal(capabilityIdFor('repo-audit'), 'cap_repo_audit');
  assert.equal(capabilityIdFor('repo-structure-scanner'), 'cap_repo_structure_scanner');
});

// ---------------------------------------------------------------------------
// Registry snapshot
// ---------------------------------------------------------------------------

test('the registry snapshot is deterministic and digest bound', () => {
  const again = buildSkillRegistrySnapshot({ root: ROOT, revision: REVISION });
  assert.equal(again.snapshot_digest, SNAPSHOT.snapshot_digest);
  assert.deepEqual(again.skills, SNAPSHOT.skills);
  const ids = SNAPSHOT.skills.map((entry) => entry.skill_id);
  assert.deepEqual(ids, [...ids].sort(), 'the snapshot must be sorted by skill id, never by filesystem order');
});

test('the snapshot binds every skill to its instruction digest and its scope states', () => {
  for (const entry of SNAPSHOT.skills) {
    assert.match(entry.digest, /^[0-9a-f]{64}$/);
    assert.ok(entry.skill_path.length > 0);
    for (const state of Object.values(entry.scope_states)) {
      assert.ok(['ACTIVE', 'SUSPENDED'].includes(state));
    }
  }
  const repoAudit = skill('core.repo-audit');
  assert.equal(repoAudit.scope_states['intake-and-truth-mapping'], 'ACTIVE');
  assert.equal(repoAudit.scope_states.implementation, undefined, 'a scope the skill is not registered for must be absent, never ACTIVE');
});

test('the scope vocabulary drift between contract and routing map fails closed', () => {
  const contractScopes = SCHEMA.properties.request.properties.scope.enum;
  const routingMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'core', 'contracts', 'workflow-routing-map.json'), 'utf8'));
  const routingScopes = routingMap.workflowClasses.map((entry) => entry.workflowClass);

  // The aligned case passes and returns the contract vocabulary.
  assert.deepEqual(compareScopeVocabularies(contractScopes, routingScopes), contractScopes);

  // A workflow class that exists only in the routing map fails closed.
  assert.throws(
    () => compareScopeVocabularies(contractScopes, [...routingScopes, 'product-support']),
    (error) => error.code === 'SKILL_SCOPE_VOCABULARY_DRIFT'
  );

  // A scope that exists only in the contract fails closed as well.
  assert.throws(
    () => compareScopeVocabularies([...contractScopes, 'retirement-planning'], routingScopes),
    (error) => error.code === 'SKILL_SCOPE_VOCABULARY_DRIFT'
  );
});

// ---------------------------------------------------------------------------
// Loader: typed fail-closed denials
// ---------------------------------------------------------------------------

test('the loader denies an absent skill with SKILL_NOT_FOUND', () => {
  const result = loadSkill({ snapshot: SNAPSHOT, skill_id: 'core.does-not-exist', scope: 'intake-and-truth-mapping', context: CONTEXT_ALL });
  assert.equal(result.outcome, 'DENIED');
  assert.equal(result.denial.code, 'SKILL_NOT_FOUND');
  assert.ok(SKILL_DENIAL_CODES.includes(result.denial.code));
});

test('the loader denies a digest mismatch with SKILL_DIGEST_MISMATCH', () => {
  const repoAudit = skill('core.repo-audit');
  const result = loadSkill({
    snapshot: SNAPSHOT,
    skill_id: 'core.repo-audit',
    expected_digest: '0'.repeat(64),
    scope: 'intake-and-truth-mapping',
    context: CONTEXT_ALL
  });
  assert.equal(result.outcome, 'DENIED');
  assert.equal(result.denial.code, 'SKILL_DIGEST_MISMATCH');
  assert.equal(result.denial.snapshot_digest, repoAudit.digest);
});

test('the loader accepts a matching digest', () => {
  const repoAudit = skill('core.repo-audit');
  const result = loadSkill({
    snapshot: SNAPSHOT,
    skill_id: 'core.repo-audit',
    expected_digest: repoAudit.digest,
    scope: 'intake-and-truth-mapping',
    context: CONTEXT_ALL
  });
  assert.equal(result.outcome, 'LOADED');
  assert.equal(result.skill.digest, repoAudit.digest);
});

test('the loader denies a skill outside an allowed state for the caller scope', () => {
  const repoAudit = skill('core.repo-audit');
  const result = loadSkill({
    snapshot: SNAPSHOT,
    skill_id: 'core.repo-audit',
    scope: 'verification-and-review',
    context: CONTEXT_ALL
  });
  assert.equal(result.outcome, 'DENIED');
  assert.equal(result.denial.code, 'SKILL_STATE_NOT_ALLOWED');
  assert.equal(result.denial.state_reason, 'SCOPE_NOT_DECLARED');
  assert.equal(repoAudit.scope_states['intake-and-truth-mapping'], 'ACTIVE');
});

test('the loader denies a suspended skill in the scope it is registered for', () => {
  const result = loadSkill({
    snapshot: SNAPSHOT,
    skill_id: 'compat.test-matrix-builder',
    scope: 'implementation-planning',
    context: CONTEXT_ALL
  });
  assert.equal(result.outcome, 'DENIED');
  assert.equal(result.denial.code, 'SKILL_STATE_NOT_ALLOWED');
  assert.equal(result.denial.state_reason, 'STATE_NOT_ACTIVE');
});

test('the loader denies a skill whose own required capability is missing from the context', () => {
  const result = loadSkill({
    snapshot: SNAPSHOT,
    skill_id: 'core.repo-audit',
    scope: 'intake-and-truth-mapping',
    context: { available_capabilities: ['cap_repo_structure_scanner'] }
  });
  assert.equal(result.outcome, 'DENIED');
  assert.equal(result.denial.code, 'SKILL_CAPABILITY_MISSING');
  assert.ok(result.denial.missing_capabilities.includes('cap_validate_repo_surface'));
});

test('requireSkill throws the same typed denial code', () => {
  assert.throws(
    () => requireSkill({ snapshot: SNAPSHOT, skill_id: 'core.does-not-exist', scope: 'intake-and-truth-mapping', context: CONTEXT_ALL }),
    (error) => error.code === 'SKILL_NOT_FOUND'
  );
  const loaded = requireSkill({ snapshot: SNAPSHOT, skill_id: 'core.repo-audit', scope: 'intake-and-truth-mapping', context: CONTEXT_ALL });
  assert.equal(loaded.skill_id, 'core.repo-audit');
});

// ---------------------------------------------------------------------------
// Selector: happy path
// ---------------------------------------------------------------------------

test('the happy path selects the only eligible candidate and records the evidence', () => {
  const record = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, context: CONTEXT_ALL, now: NOW });
  assert.equal(record.outcome, 'SELECTED');
  assert.equal(record.selection.skill_id, 'core.repo-audit');
  assert.equal(record.selection.rank, 1);
  assert.equal(record.selection.digest, skill('core.repo-audit').digest);
  assert.equal(record.refusal, null);
  assert.equal(record.authority_granted, false);
  assert.equal(record.request.request_digest, computeRequestDigest(request()));
  assert.equal(record.registry_snapshot.snapshot_digest, SNAPSHOT.snapshot_digest);
  assert.deepEqual(record.ordering_key.ordered_candidate_ids, ['core.repo-audit']);
  assert.match(record.evidence_digest, /^[0-9a-f]{64}$/);
  assert.match(record.selection_id, /^sel_[0-9a-f]{16}$/);
});

test('the produced selection record satisfies the canonical contract', () => {
  const record = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, context: CONTEXT_ALL, now: NOW });
  const issues = validateInstanceAgainstContract(record, SCHEMA_PATH, ROOT);
  assert.deepEqual(issues, [], `the runtime record must satisfy the contract: ${issues.join('; ')}`);
});

test('the runtime reproduces the canonical fixture records exactly', () => {
  const happy = caseById('skill-selection-valid-selected-happy-path');
  const record = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, context: CONTEXT_ALL, now: NOW });
  assert.deepEqual(record, happy.instance, 'the fixture record must be the runtime output, not a hand-written variant');

  const tie = caseById('skill-selection-valid-selected-tie-break-order');
  const tieRecord = selectSkill({
    request: request({ request_id: 'req_impl_tie_001', intent_fingerprint: 'b'.repeat(64), scope: 'implementation', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    context: CONTEXT_ALL,
    now: '2026-10-20T12:05:00Z'
  });
  assert.deepEqual(tieRecord, tie.instance, 'the fixture record must be the runtime output, not a hand-written variant');
});

test('the selected skill is the first entry of the ordering key', () => {
  const record = selectSkill({
    request: request({ scope: 'implementation', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    context: CONTEXT_ALL,
    now: NOW
  });
  assert.equal(record.selection.skill_id, record.ordering_key.ordered_candidate_ids[0]);
  assert.equal(record.selection.rank, 1);
});

test('the evidence digest binds the decision to the registry snapshot', () => {
  const record = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, context: CONTEXT_ALL, now: NOW });
  const drifted = { ...SNAPSHOT, snapshot_digest: 'f'.repeat(64) };
  const other = selectSkill({ request: request(), registry_snapshot: drifted, context: CONTEXT_ALL, now: NOW });
  assert.notEqual(other.evidence_digest, record.evidence_digest);
  assert.notEqual(other.selection_id, record.selection_id);
});

// ---------------------------------------------------------------------------
// Selector: determinism
// ---------------------------------------------------------------------------

test('the selection is deterministic across many repeats', () => {
  const first = selectSkill({
    request: request({ scope: 'implementation', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    context: CONTEXT_ALL,
    now: NOW
  });
  for (let index = 0; index < 200; index += 1) {
    const repeat = selectSkill({
      request: request({ scope: 'implementation', required_capabilities: [] }),
      registry_snapshot: SNAPSHOT,
      context: CONTEXT_ALL,
      now: NOW
    });
    assert.deepEqual(repeat, first, 'the same inputs must always yield the same record');
  }
});

test('the wall clock is evidence, never an input: only created_at may change', () => {
  const first = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, context: CONTEXT_ALL, now: '2026-10-20T12:00:00Z' });
  const later = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, context: CONTEXT_ALL, now: '2026-11-02T03:17:45Z' });
  assert.notEqual(first.created_at, later.created_at);
  assert.equal(first.selection_id, later.selection_id);
  assert.deepEqual(first.ordering_key, later.ordering_key);
  assert.equal(first.evidence_digest, later.evidence_digest);
  assert.deepEqual(first.selection, later.selection);
  assert.deepEqual(first.eligibility, later.eligibility);
});

test('the ordering does not depend on the order in which candidates are offered', () => {
  const forward = selectSkill({
    request: request({ scope: 'implementation', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    candidates: ['core.architecture-depth-review', 'core.behavior-first-tdd', 'core.diagnostic-feedback-loop'],
    context: CONTEXT_ALL,
    now: NOW
  });
  const reversed = selectSkill({
    request: request({ scope: 'implementation', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    candidates: ['core.diagnostic-feedback-loop', 'core.behavior-first-tdd', 'core.architecture-depth-review'],
    context: CONTEXT_ALL,
    now: NOW
  });
  assert.deepEqual(reversed.ordering_key, forward.ordering_key);
  assert.deepEqual(reversed.selection, forward.selection);
  assert.equal(reversed.evidence_digest, forward.evidence_digest);
});

test('the derived candidate set is scope bound and sorted', () => {
  const candidates = deriveScopeCandidates({ snapshot: SNAPSHOT, scope: 'implementation' });
  const ids = candidates.map((candidate) => candidate.skill_id);
  assert.deepEqual(ids, [...ids].sort());
  assert.ok(ids.includes('core.architecture-depth-review'));
  assert.ok(!ids.includes('core.repo-audit'), 'a skill of another scope must never enter the candidate set');
  assert.ok(!ids.includes('compat.test-matrix-builder'), 'a suspended skill must never enter the candidate set');
});

// ---------------------------------------------------------------------------
// Selector: tie-breaking
// ---------------------------------------------------------------------------

test('ties are broken by the explicit documented rule: ascending skill id', () => {
  const record = selectSkill({
    request: request({ scope: 'implementation', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    context: CONTEXT_ALL,
    now: NOW
  });
  const eligible = record.eligibility.filter((entry) => entry.verdict === 'ELIGIBLE').map((entry) => entry.skill_id);
  assert.ok(eligible.length >= 3, 'the tie case needs at least three equally eligible candidates');
  const footprints = new Set(eligible.map((entry) => skill(entry).requires_capabilities.length));
  assert.equal(footprints.size, 1, 'the tie case must really be a tie on the primary key');
  assert.deepEqual(record.ordering_key.ordered_candidate_ids, [...eligible].sort());
  assert.equal(record.selection.skill_id, [...eligible].sort()[0]);
  assert.equal(record.ordering_key.rule, 'CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC');
});

test('the primary ordering key prefers the smaller context footprint', () => {
  // The two candidates of this scope have different footprints: repo-audit
  // demands four context capabilities, source-conflict-resolver demands three.
  const record = selectSkill({
    request: request({ scope: 'intake-and-truth-mapping', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    context: CONTEXT_ALL,
    now: NOW
  });
  const footprints = record.ordering_key.ordered_candidate_ids.map((id) => skill(id).requires_capabilities.length);
  const sorted = [...footprints].sort((left, right) => left - right);
  assert.deepEqual(footprints, sorted, 'the footprint must be non-decreasing along the ordering key');
  assert.equal(footprints.length, 2, 'the primary key needs two candidates with different footprints');
  assert.notEqual(footprints[0], footprints[1], 'the primary key must actually decide here');
  assert.equal(record.selection.skill_id, 'core.source-conflict-resolver');
});

// ---------------------------------------------------------------------------
// Selector: scope isolation
// ---------------------------------------------------------------------------

test('a skill eligible for one scope is never selected for another scope', () => {
  const inScope = selectSkill({
    request: request({ scope: 'intake-and-truth-mapping', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    context: CONTEXT_ALL,
    now: NOW
  });
  // The scope-only request is decided by the footprint rule: source-conflict-resolver
  // demands three context capabilities, repo-audit demands four.
  assert.equal(inScope.selection.skill_id, 'core.source-conflict-resolver');
  assert.ok(
    skill('core.source-conflict-resolver').requires_capabilities.length
      < skill('core.repo-audit').requires_capabilities.length
  );

  const outOfScope = selectSkill({
    request: request({ scope: 'verification-and-review', required_capabilities: [] }),
    registry_snapshot: SNAPSHOT,
    candidates: ['core.repo-audit'],
    context: CONTEXT_ALL,
    now: NOW
  });
  assert.equal(outOfScope.outcome, 'REFUSED');
  assert.equal(outOfScope.selection, null);
  assert.equal(
    outOfScope.eligibility.find((entry) => entry.skill_id === 'core.repo-audit').reason,
    'SKILL_STATE_NOT_ALLOWED'
  );
});

test('the scope isolation holds for the whole registry, not only for one skill', () => {
  for (const entry of SNAPSHOT.skills) {
    for (const scope of Object.keys(entry.scope_states)) {
      const result = loadSkill({ snapshot: SNAPSHOT, skill_id: entry.skill_id, scope, context: CONTEXT_ALL });
      if (entry.scope_states[scope] === 'ACTIVE') {
        assert.equal(result.outcome, 'LOADED', `${entry.skill_id} must be loadable in ${scope}`);
      } else {
        assert.equal(result.outcome, 'DENIED');
        assert.equal(result.denial.code, 'SKILL_STATE_NOT_ALLOWED');
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Selector: refusal, never a silent fallback
// ---------------------------------------------------------------------------

test('an empty candidate set is refused with a typed refusal code', () => {
  const record = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, candidates: [], context: CONTEXT_ALL, now: NOW });
  assert.equal(record.outcome, 'REFUSED');
  assert.equal(record.refusal.code, 'EMPTY_CANDIDATE_SET');
  assert.equal(record.selection, null);
  assert.deepEqual(record.ordering_key.ordered_candidate_ids, []);
  assert.deepEqual(record.eligibility, []);
});

test('a request that no eligible candidate satisfies is refused, never answered with a fallback', () => {
  const record = selectSkill({
    request: request({ required_capabilities: ['cap_secret_boundary_audit'] }),
    registry_snapshot: SNAPSHOT,
    candidates: ['core.repo-audit', 'core.source-conflict-resolver'],
    context: CONTEXT_ALL,
    now: NOW
  });
  assert.equal(record.outcome, 'REFUSED');
  assert.equal(record.refusal.code, 'NO_ELIGIBLE_CANDIDATE');
  assert.equal(record.selection, null, 'a refusal must never carry a fallback selection');
  assert.deepEqual(record.ordering_key.ordered_candidate_ids, []);
  for (const entry of record.eligibility) {
    assert.equal(entry.verdict, 'INELIGIBLE');
    assert.equal(entry.reason, 'REQUIRED_CAPABILITY_NOT_PROVIDED');
  }
});

test('every refusal code is a member of the closed refusal vocabulary', () => {
  assert.deepEqual(REFUSAL_CODES, ['EMPTY_CANDIDATE_SET', 'NO_ELIGIBLE_CANDIDATE']);
  for (const code of REFUSAL_CODES) {
    assert.ok(SCHEMA.properties.refusal.properties.code.enum.includes(code));
  }
});

test('a digest mismatch refuses the request instead of selecting the drifted skill', () => {
  const record = selectSkill({
    request: request(),
    registry_snapshot: SNAPSHOT,
    candidates: [{ skill_id: 'core.repo-audit', expected_digest: '1'.repeat(64) }],
    context: CONTEXT_ALL,
    now: NOW
  });
  assert.equal(record.outcome, 'REFUSED');
  assert.equal(record.refusal.code, 'NO_ELIGIBLE_CANDIDATE');
  assert.equal(record.eligibility[0].reason, 'SKILL_DIGEST_MISMATCH');
  assert.equal(record.selection, null);
});

test('a missing required capability refuses the request instead of selecting the skill', () => {
  const record = selectSkill({
    request: request(),
    registry_snapshot: SNAPSHOT,
    context: { available_capabilities: [] },
    now: NOW
  });
  assert.equal(record.outcome, 'REFUSED');
  assert.equal(record.refusal.code, 'NO_ELIGIBLE_CANDIDATE');
  for (const entry of record.eligibility) {
    assert.equal(entry.reason, 'SKILL_CAPABILITY_MISSING');
  }
});

test('a refused record still satisfies the canonical contract', () => {
  const record = selectSkill({ request: request(), registry_snapshot: SNAPSHOT, candidates: [], context: CONTEXT_ALL, now: NOW });
  const issues = validateInstanceAgainstContract(record, SCHEMA_PATH, ROOT);
  assert.deepEqual(issues, [], `the refusal record must satisfy the contract: ${issues.join('; ')}`);
});
