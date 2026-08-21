import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFixture, validateRegistryDisposition } from '../../scripts/tools/validate-registry-disposition.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../../evals/fixtures/registry-disposition-contract.json', import.meta.url), 'utf8'));

test('registry disposition vectors enforce all blocking v1 invariants', () => {
  const result = validateFixture(fixture);
  assert.equal(result.passed, true, JSON.stringify(result.issues));
  assert.equal(result.casesChecked, 13);
});

test('canonical JSON Schema encodes closed taxonomy and relevance evidence gates', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../../core/contracts/registry-disposition.schema.json', import.meta.url), 'utf8'));
  const recordPattern = schema.$defs.affectedRecord.pattern;
  for (const relevanceClass of [
    'SOURCE_RECORD', 'CONTRACT_RECORD', 'AUTHORITY_MAPPING', 'DEPENDENCY_BINDING',
    'LIFECYCLE_BINDING', 'SUPERSESSION', 'PROVENANCE', 'REGISTERED_IMPLEMENTATION_BINDING'
  ]) assert.match(`${relevanceClass}:record`, new RegExp(recordPattern));
  assert.doesNotMatch('NOT_A_CLOSED_CLASS:record', new RegExp(recordPattern));
  const relevanceGate = schema.properties.registry_disposition.allOf[0];
  assert.equal(relevanceGate.then.properties.affected_records.minItems, 1);
  assert.equal(relevanceGate.then.properties.classification_evidence_refs.minItems, 1);
  assert.equal(relevanceGate.else.properties.affected_records.maxItems, 0);
});

test('validator rejects unknown fields and duplicate evidence references', () => {
  const input = structuredClone(fixture.cases[0].input);
  input.unowned_envelope_extension = true;
  input.registry_disposition.unowned_extension = true;
  input.registry_disposition.evidence_refs = ['same', 'same'];
  const result = validateRegistryDisposition(input);
  assert.equal(result.passed, false);
  assert.match(result.issues.join('\n'), /Unknown envelope fields/);
  assert.match(result.issues.join('\n'), /Unknown fields/);
  assert.match(result.issues.join('\n'), /evidence_refs entries must be unique/);
});
