#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATUSES = new Set(['NO_CHANGE', 'UPDATED', 'REQUIRED_BUT_BLOCKED']);
const RELEVANCE_CLASSES = new Set([
  'SOURCE_RECORD', 'CONTRACT_RECORD', 'AUTHORITY_MAPPING', 'DEPENDENCY_BINDING',
  'LIFECYCLE_BINDING', 'SUPERSESSION', 'PROVENANCE', 'REGISTERED_IMPLEMENTATION_BINDING'
]);
const REQUIRED_FIELDS = [
  'status', 'material_change', 'registry_relevant_change', 'reason',
  'registry_baseline_sha', 'affected_records', 'authority_refs', 'source_refs',
  'supersession_refs', 'provenance_refs', 'evidence_refs',
  'implementation_commit_sha', 'registry_commit_sha', 'validation',
  'contract_version', 'classification_evidence_refs'
];
const ARRAY_FIELDS = [
  'affected_records', 'authority_refs', 'source_refs', 'supersession_refs',
  'provenance_refs', 'evidence_refs', 'validation', 'classification_evidence_refs'
];

function validateStringRefs(value, field, issues) {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array.`);
    return;
  }
  if (value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    issues.push(`${field} entries must be non-empty strings.`);
  }
  if (new Set(value).size !== value.length) issues.push(`${field} entries must be unique.`);
}

function validateAffectedRecords(value, issues) {
  validateStringRefs(value, 'affected_records', issues);
  if (!Array.isArray(value)) return;
  for (const record of value) {
    if (typeof record !== 'string') continue;
    const separator = record.indexOf(':');
    const relevanceClass = separator < 0 ? record : record.slice(0, separator);
    const recordRef = separator < 0 ? '' : record.slice(separator + 1);
    if (!RELEVANCE_CLASSES.has(relevanceClass) || recordRef.trim() === '' || /\s/.test(recordRef)) {
      issues.push(`affected_records entry must use a closed relevance class and non-empty record ref: ${record}.`);
    }
  }
}

function validateRegistryDisposition(envelope) {
  const issues = [];
  if (envelope == null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { passed: false, issues: ['Input must be an object.'] };
  }
  const unknownEnvelopeFields = Object.keys(envelope).filter((key) => key !== 'registry_disposition');
  if (unknownEnvelopeFields.length > 0) issues.push(`Unknown envelope fields: ${unknownEnvelopeFields.join(', ')}.`);
  const disposition = envelope.registry_disposition;
  if (disposition == null || typeof disposition !== 'object' || Array.isArray(disposition)) {
    return { passed: false, issues: ['registry_disposition must be an object.'] };
  }

  const unknown = Object.keys(disposition).filter((key) => !REQUIRED_FIELDS.includes(key));
  if (unknown.length > 0) issues.push(`Unknown fields: ${unknown.join(', ')}.`);
  for (const field of REQUIRED_FIELDS) {
    if (!(field in disposition)) issues.push(`Missing required field: ${field}.`);
  }
  if (!STATUSES.has(disposition.status)) issues.push('status must be NO_CHANGE, UPDATED, or REQUIRED_BUT_BLOCKED.');
  if (typeof disposition.material_change !== 'boolean') issues.push('material_change must be boolean.');
  if (typeof disposition.registry_relevant_change !== 'boolean') issues.push('registry_relevant_change must be boolean.');
  for (const field of ['reason', 'registry_baseline_sha', 'implementation_commit_sha']) {
    if (typeof disposition[field] !== 'string') issues.push(`${field} must be a string.`);
  }
  for (const field of ARRAY_FIELDS) {
    if (field === 'affected_records') validateAffectedRecords(disposition[field], issues);
    else validateStringRefs(disposition[field], field, issues);
  }
  if (disposition.contract_version !== 'registry-disposition.v1') issues.push('contract_version must be registry-disposition.v1.');
  if (disposition.registry_commit_sha !== null && (typeof disposition.registry_commit_sha !== 'string' || disposition.registry_commit_sha.length === 0)) {
    issues.push('registry_commit_sha must be null or a non-empty string.');
  }

  if (disposition.registry_relevant_change === true && disposition.status === 'NO_CHANGE') {
    issues.push('RD-V01: registry_relevant_change true is incompatible with NO_CHANGE.');
  }
  if (disposition.registry_relevant_change === true) {
    if (!Array.isArray(disposition.affected_records) || disposition.affected_records.length === 0) issues.push('RD-V06: registry relevance requires a classified affected_record.');
    if (!Array.isArray(disposition.classification_evidence_refs) || disposition.classification_evidence_refs.length === 0) issues.push('RD-V06: registry relevance requires classification_evidence_refs.');
  } else if (Array.isArray(disposition.affected_records) && disposition.affected_records.length > 0) {
    issues.push('RD-V06: non-relevant changes must not declare affected_records.');
  }
  if (disposition.status === 'UPDATED') {
    if (disposition.registry_relevant_change !== true) issues.push('RD-V02: UPDATED requires registry_relevant_change true.');
    if (typeof disposition.registry_commit_sha !== 'string' || disposition.registry_commit_sha.length === 0) issues.push('RD-V02: UPDATED requires registry_commit_sha.');
    if (!Array.isArray(disposition.affected_records) || disposition.affected_records.length === 0) issues.push('RD-V02: UPDATED requires affected_records.');
  }
  if (disposition.status === 'REQUIRED_BUT_BLOCKED') {
    if (disposition.registry_relevant_change !== true) issues.push('RD-V03: REQUIRED_BUT_BLOCKED requires registry_relevant_change true.');
    if (typeof disposition.reason !== 'string' || disposition.reason.trim() === '') issues.push('RD-V03: REQUIRED_BUT_BLOCKED requires reason.');
    if (!Array.isArray(disposition.evidence_refs) || disposition.evidence_refs.length === 0) issues.push('RD-V03: REQUIRED_BUT_BLOCKED requires evidence_refs.');
    if (disposition.registry_commit_sha !== null) issues.push('RD-V03: REQUIRED_BUT_BLOCKED requires registry_commit_sha null.');
  }
  if (disposition.registry_commit_sha !== null && disposition.status !== 'UPDATED') {
    issues.push('RD-V04: registry_commit_sha is allowed only for UPDATED.');
  }
  if (disposition.material_change === false && disposition.registry_relevant_change === true) {
    issues.push('RD-V05: registry relevance requires material_change true in v1.');
  }

  return { passed: issues.length === 0, issues };
}

function validateFixture(fixture) {
  const issues = [];
  const results = [];
  if (!Array.isArray(fixture?.cases) || fixture.cases.length === 0) {
    return { passed: false, issues: ['Fixture must contain cases.'], casesChecked: 0, results };
  }
  for (const entry of fixture.cases) {
    const result = validateRegistryDisposition(entry.input);
    const passed = result.passed === entry.expectedPass;
    results.push({ id: entry.id, passed, validationPassed: result.passed, issues: result.issues });
    if (!passed) issues.push(`${entry.id}: expected validation ${entry.expectedPass ? 'pass' : 'fail'}.`);
  }
  return { passed: issues.length === 0, issues, casesChecked: results.length, results };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const fixtureFlag = process.argv.indexOf('--fixture');
    const inputPath = fixtureFlag >= 0 ? process.argv[fixtureFlag + 1] : process.argv[2];
    if (!inputPath) throw new Error('Usage: validate-registry-disposition.mjs [--fixture] <json-file>');
    const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
    const result = fixtureFlag >= 0 ? validateFixture(payload) : validateRegistryDisposition(payload);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ passed: false, issues: [error.message] }, null, 2));
    process.exit(1);
  }
}

export { validateFixture, validateRegistryDisposition };
