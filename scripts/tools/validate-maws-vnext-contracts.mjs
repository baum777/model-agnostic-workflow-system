#!/usr/bin/env node
// MAWS vNext contract validator (MAWS-VN-107 / MAWS-VN-000 / MAWS-VN-001).
// Validates the vNext contract spine against fixtures (positive + negative),
// enforces OD-01..OD-17 negative-fixture coverage, protects the frozen owner
// decision record, and prevents docs from claiming higher maturity than
// repository evidence supports (maturity drift fixture).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// Minimal JSON Schema engine (draft 2020-12 subset used by the vNext schemas):
// type, enum, const, required, properties, additionalProperties, items,
// uniqueItems, minItems, maxItems, minLength, pattern, minimum, maximum,
// allOf, anyOf, oneOf, not, if/then/else, $ref (local + sibling file).
// ---------------------------------------------------------------------------

class SchemaResolver {
  constructor(contractsDir) {
    this.contractsDir = contractsDir;
    this.cache = new Map();
  }

  loadFile(fileName) {
    if (!this.cache.has(fileName)) {
      this.cache.set(fileName, readJson(path.join(this.contractsDir, fileName)));
    }
    return this.cache.get(fileName);
  }

  resolveRef(ref, currentFile) {
    const hashIndex = ref.indexOf('#');
    const filePart = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? '' : ref.slice(hashIndex + 1);
    const fileName = filePart === '' ? currentFile : filePart;
    let schema = this.loadFile(fileName);
    if (fragment.startsWith('/')) {
      for (const segment of fragment.split('/').slice(1)) {
        const key = decodeURIComponent(segment.replace(/~1/g, '/').replace(/~0/g, '~'));
        schema = schema[key];
        if (schema === undefined) {
          throw new Error(`Unresolvable $ref ${ref} (from ${currentFile})`);
        }
      }
    }
    return { schema, fileName };
  }
}

function jsonTypeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const typeofValue = typeof value;
  if (typeofValue === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeofValue === 'string' || typeofValue === 'boolean' || typeofValue === 'object') return typeofValue;
  return typeofValue;
}

function typeMatches(value, type) {
  const actual = jsonTypeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  if (type === 'integer') return actual === 'integer';
  return actual === type;
}

function validateSchema(instance, schema, resolver, currentFile, instancePath, issues) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    issues.push(`${instancePath}: schema forbids any value here`);
    return;
  }

  if (typeof schema.$ref === 'string') {
    const { schema: target, fileName } = resolver.resolveRef(schema.$ref, currentFile);
    const remaining = { ...schema };
    delete remaining.$ref;
    validateSchema(instance, target, resolver, fileName, instancePath, issues);
    if (Object.keys(remaining).length > 0) {
      validateSchema(instance, remaining, resolver, fileName, instancePath, issues);
    }
    return;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(instance, type))) {
      issues.push(`${instancePath}: expected type ${JSON.stringify(schema.type)}, got ${jsonTypeOf(instance)}`);
      return;
    }
  }

  if (schema.enum !== undefined && !schema.enum.some((option) => JSON.stringify(option) === JSON.stringify(instance))) {
    issues.push(`${instancePath}: value ${JSON.stringify(instance)} not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(instance)) {
    issues.push(`${instancePath}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(instance)}`);
  }

  if (typeof instance === 'string') {
    if (schema.minLength !== undefined && instance.length < schema.minLength) {
      issues.push(`${instancePath}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && instance.length > schema.maxLength) {
      issues.push(`${instancePath}: longer than maxLength ${schema.maxLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(instance)) {
      issues.push(`${instancePath}: does not match pattern ${schema.pattern}`);
    }
  }

  if (typeof instance === 'number') {
    if (schema.minimum !== undefined && instance < schema.minimum) {
      issues.push(`${instancePath}: below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && instance > schema.maximum) {
      issues.push(`${instancePath}: above maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(instance)) {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      issues.push(`${instancePath}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      issues.push(`${instancePath}: more than maxItems ${schema.maxItems}`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of instance) {
        const serialized = JSON.stringify(item);
        if (seen.has(serialized)) {
          issues.push(`${instancePath}: items are not unique (${serialized})`);
          break;
        }
        seen.add(serialized);
      }
    }
    if (schema.items !== undefined) {
      instance.forEach((item, index) => {
        validateSchema(item, schema.items, resolver, currentFile, `${instancePath}[${index}]`, issues);
      });
    }
  }

  if (instance !== null && typeof instance === 'object' && !Array.isArray(instance)) {
    for (const requiredKey of schema.required || []) {
      if (!(requiredKey in instance)) {
        issues.push(`${instancePath}: missing required property "${requiredKey}"`);
      }
    }
    const propertySchemas = schema.properties || {};
    for (const [key, value] of Object.entries(instance)) {
      if (key in propertySchemas) {
        validateSchema(value, propertySchemas[key], resolver, currentFile, `${instancePath}.${key}`, issues);
      } else if (schema.additionalProperties === false) {
        issues.push(`${instancePath}: unexpected property "${key}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateSchema(value, schema.additionalProperties, resolver, currentFile, `${instancePath}.${key}`, issues);
      }
    }
  }

  for (const subSchema of schema.allOf || []) {
    validateSchema(instance, subSchema, resolver, currentFile, instancePath, issues);
  }
  if (schema.anyOf !== undefined) {
    const anyPassed = schema.anyOf.some((subSchema) => {
      const subIssues = [];
      validateSchema(instance, subSchema, resolver, currentFile, instancePath, subIssues);
      return subIssues.length === 0;
    });
    if (!anyPassed) {
      issues.push(`${instancePath}: does not match anyOf`);
    }
  }
  if (schema.oneOf !== undefined) {
    const matchCount = schema.oneOf.filter((subSchema) => {
      const subIssues = [];
      validateSchema(instance, subSchema, resolver, currentFile, instancePath, subIssues);
      return subIssues.length === 0;
    }).length;
    if (matchCount !== 1) {
      issues.push(`${instancePath}: matches ${matchCount} oneOf branches, expected 1`);
    }
  }
  if (schema.not !== undefined) {
    const subIssues = [];
    validateSchema(instance, schema.not, resolver, currentFile, instancePath, subIssues);
    if (subIssues.length === 0) {
      issues.push(`${instancePath}: must NOT match "not" schema`);
    }
  }
  if (schema.if !== undefined) {
    const conditionIssues = [];
    validateSchema(instance, schema.if, resolver, currentFile, instancePath, conditionIssues);
    const branch = conditionIssues.length === 0 ? schema.then : schema.else;
    if (branch !== undefined) {
      validateSchema(instance, branch, resolver, currentFile, instancePath, issues);
    }
  }
}

export function validateInstanceAgainstContract(instance, contractSchemaPath, root) {
  const contractsDir = path.join(root, 'core', 'contracts');
  const fileName = path.basename(contractSchemaPath);
  const resolver = new SchemaResolver(contractsDir);
  const schema = resolver.loadFile(fileName);
  const issues = [];
  validateSchema(instance, schema, resolver, fileName, '$', issues);
  return issues;
}

// ---------------------------------------------------------------------------
// Semantic cross-checks (invariants that span more than one object).
// ---------------------------------------------------------------------------

const DIMENSION_ORDERS = {
  tools: ['none', 'read', 'write', 'execute'],
  effects: ['none', 'ephemeral', 'workspace', 'external'],
  context: ['none', 'bounded', 'session_full'],
  network: ['none', 'allowlisted', 'open'],
  verification: ['none', 'self_reported', 'verified', 'independently_verified']
};
const DIMENSIONS = ['tools', 'effects', 'context', 'network', 'delegation', 'verification'];

function levelRank(dimension, level) {
  if (dimension === 'delegation') return level;
  const order = DIMENSION_ORDERS[dimension];
  const rank = order.indexOf(level);
  if (rank === -1) {
    throw new Error(`Unknown level ${level} for dimension ${dimension}`);
  }
  return rank;
}

function crossCheckEligibilityVsQualification(payload) {
  const issues = [];
  const { eligibility, qualification } = payload;
  if (eligibility.eligible === true) {
    if (qualification.state !== 'QUALIFIED') {
      issues.push(`eligibility eligible=true requires QUALIFIED qualification, found ${qualification.state}`);
    }
    if (eligibility.qualification_ref !== qualification.qualification_id) {
      issues.push('eligibility.qualification_ref must reference the provided qualification record');
    }
  }
  if (['DECLARED', 'QUALIFICATION_PENDING', 'DISQUALIFIED', 'EXPIRED', 'REVOKED', 'UNKNOWN'].includes(qualification.state) && eligibility.eligible === true) {
    issues.push(`qualification state ${qualification.state} can never produce eligible=true (fail closed)`);
  }
  return issues;
}

function crossCheckSubsumptionVsProfiles(payload) {
  const issues = [];
  const { subsumption, subsuming_profile, subsumed_profile } = payload;
  let allHold = true;
  for (const dimension of DIMENSIONS) {
    const subsumingLevel = subsuming_profile.dimensions[dimension];
    const subsumedLevel = subsumed_profile.dimensions[dimension];
    const holds = levelRank(dimension, subsumingLevel) >= levelRank(dimension, subsumedLevel);
    const declared = subsumption.dimension_comparison[dimension];
    if (declared.holds !== holds) {
      issues.push(`dimension_comparison.${dimension}.holds is ${declared.holds}, but per-level comparison yields ${holds}`);
    }
    allHold = allHold && holds;
  }
  const expectedRelation = allHold ? 'subsumes' : 'not_subsumes';
  if (subsumption.relation !== expectedRelation) {
    issues.push(`relation is ${subsumption.relation}, but dimension comparison yields ${expectedRelation}`);
  }
  if (subsumption.subsuming_profile_ref !== subsuming_profile.profile_id || subsumption.subsumed_profile_ref !== subsumed_profile.profile_id) {
    issues.push('subsumption profile refs must match the provided profiles');
  }
  return issues;
}

function crossCheckCandidateGraphVsTemplate(payload) {
  const issues = [];
  const { candidate, template } = payload;
  const stages = new Set(candidate.nodes.map((node) => node.stage));
  for (const mandatoryStage of template.mandatory_stages) {
    if (!stages.has(mandatoryStage)) {
      issues.push(`candidate graph is missing mandatory stage "${mandatoryStage}" from template ${template.template_id}`);
    }
  }
  if (candidate.template_ref !== template.template_id) {
    issues.push('candidate.template_ref must match the provided template');
  }
  const nodeIds = new Set(candidate.nodes.map((node) => node.node_id));
  for (const node of candidate.nodes) {
    for (const dependency of node.depends_on) {
      if (!nodeIds.has(dependency)) {
        issues.push(`node ${node.node_id} depends on unknown node ${dependency}`);
      }
    }
  }
  return issues;
}

function crossCheckRoutingVsRequest(payload) {
  const issues = [];
  const { routing_decision, routing_request } = payload;
  if (!routing_request.eligible_executor_ids.includes(routing_decision.selected_executor_id)) {
    issues.push(`selected executor ${routing_decision.selected_executor_id} is not in the deterministic eligible set`);
  }
  if (routing_decision.request_ref !== routing_request.request_id) {
    issues.push('routing_decision.request_ref must reference the provided routing request');
  }
  if (routing_decision.workload_safety_class !== routing_request.workload_safety_class) {
    issues.push('routing_decision.workload_safety_class must match the routing request');
  }
  return issues;
}

function crossCheckCompositionVsPolicy(payload) {
  const issues = [];
  const { composition_decision, composition_policy } = payload;
  if (!composition_policy.allowed_modes.includes(composition_decision.mode)) {
    issues.push(`composition mode ${composition_decision.mode} is not allowed by policy ${composition_policy.policy_id}`);
  }
  if (composition_decision.participants.length > composition_policy.max_executors) {
    issues.push(`composition has ${composition_decision.participants.length} participants, policy allows ${composition_policy.max_executors}`);
  }
  if (composition_decision.policy_ref !== composition_policy.policy_id) {
    issues.push('composition_decision.policy_ref must match the provided policy');
  }
  return issues;
}

function crossCheckSupersessionMonotonic(payload) {
  const issues = [];
  if (payload.superseded_by_graph_version <= payload.superseded_graph_version) {
    issues.push('superseded_by_graph_version must be greater than superseded_graph_version');
  }
  return issues;
}

function crossCheckRevisionStale(payload) {
  const issues = [];
  const { revision_decision } = payload;
  if (revision_decision.base_graph_version !== revision_decision.active_graph_version) {
    if (revision_decision.outcome === 'ACCEPTED') {
      issues.push('stale request (base != active) can never be ACCEPTED; explicit revalidation required');
    }
    if (revision_decision.revalidation === 'STILL_VALID') {
      issues.push('base != active must yield an explicit non-STILL_VALID revalidation result');
    }
  }
  if (revision_decision.outcome === 'ACCEPTED' && !(revision_decision.new_graph_version > revision_decision.active_graph_version)) {
    issues.push('ACCEPTED revision must create a new graph version greater than the active version');
  }
  return issues;
}

function crossCheckRegistryUniqueIds(payload) {
  const issues = [];
  const seen = new Set();
  for (const manifest of payload.registry.executors) {
    if (seen.has(manifest.executor_id)) {
      issues.push(`duplicate executor_id ${manifest.executor_id}; aliases cannot shadow canonical IDs`);
    }
    seen.add(manifest.executor_id);
  }
  return issues;
}

function crossCheckReceiptAnswerInChoices(payload) {
  const issues = [];
  const { receipt } = payload;
  if (!Array.isArray(receipt.choices) || receipt.choices.length === 0) {
    issues.push('receipt.choices must be a non-empty array');
  } else if (!receipt.choices.includes(receipt.answer)) {
    issues.push(`receipt answer "${receipt.answer}" is outside the deterministic choice set`);
  }
  return issues;
}

const CROSS_CHECKS = {
  eligibility_vs_qualification: crossCheckEligibilityVsQualification,
  subsumption_vs_profiles: crossCheckSubsumptionVsProfiles,
  candidate_graph_vs_template: crossCheckCandidateGraphVsTemplate,
  routing_vs_request: crossCheckRoutingVsRequest,
  composition_vs_policy: crossCheckCompositionVsPolicy,
  supersession_monotonic: crossCheckSupersessionMonotonic,
  revision_stale: crossCheckRevisionStale,
  registry_unique_ids: crossCheckRegistryUniqueIds,
  receipt_answer_in_choices: crossCheckReceiptAnswerInChoices
};

// ---------------------------------------------------------------------------
// Fixture evaluation
// ---------------------------------------------------------------------------

export function evaluateVnextContractFixture(fixture, root) {
  const result = {
    id: fixture.id,
    kind: fixture.kind,
    blocking: fixture.blocking !== false,
    passed: true,
    issues: []
  };

  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  if (cases.length === 0) {
    result.passed = false;
    result.issues.push('vNext fixture must contain cases.');
    return result;
  }

  for (const caseEntry of cases) {
    if (caseEntry.cross_check) {
      const checker = CROSS_CHECKS[caseEntry.cross_check];
      if (!checker) {
        result.passed = false;
        result.issues.push(`case ${caseEntry.case_id}: unknown cross_check ${caseEntry.cross_check}`);
        continue;
      }
      const issues = checker(caseEntry.payload || {});
      const failed = issues.length > 0;
      if (failed !== !caseEntry.valid) {
        result.passed = false;
        result.issues.push(
          `case ${caseEntry.case_id}: expected ${caseEntry.valid ? 'pass' : 'failure'} but observed ${failed ? 'failure' : 'pass'}: ${issues.join('; ') || '(no issues)'}`
        );
      }
      continue;
    }

    const schemaPath = caseEntry.schema;
    if (!schemaPath) {
      result.passed = false;
      result.issues.push(`case ${caseEntry.case_id}: missing schema path`);
      continue;
    }
    let issues;
    try {
      issues = validateInstanceAgainstContract(caseEntry.instance, schemaPath, root);
    } catch (error) {
      issues = [`${caseEntry.case_id}: validator error: ${error.message}`];
    }
    const failed = issues.length > 0;
    if (failed !== !caseEntry.valid) {
      result.passed = false;
      result.issues.push(
        `case ${caseEntry.case_id}: expected ${caseEntry.valid ? 'valid' : 'invalid'} but observed ${failed ? 'invalid' : 'valid'}: ${issues.slice(0, 3).join('; ') || '(no issues)'}`
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// OD protection (MAWS-VN-000) and maturity drift (MAWS-VN-001)
// ---------------------------------------------------------------------------

const OD_INVARIANT_SNIPPETS = [
  'JevDecisionSpace',
  'DeterministicallyAllowedStateSpace',
  'InteractionSessionModel != WorkUnitExecutor',
  'DECLARED != QUALIFIED',
  'Execution success is not completion'
];

export function checkOwnerDecisionProtection(root) {
  const issues = [];
  const odPath = path.join(root, 'docs', 'maws-vnext-owner-decisions.md');
  if (!fs.existsSync(odPath)) {
    return [`missing owner decision record: docs/maws-vnext-owner-decisions.md`];
  }
  const text = fs.readFileSync(odPath, 'utf8');
  for (let index = 1; index <= 18; index += 1) {
    const odId = `OD-${String(index).padStart(2, '0')}`;
    const occurrences = text.split(`### ${odId}`).length - 1;
    if (occurrences !== 1) {
      issues.push(`owner decision record must contain exactly one heading for ${odId}, found ${occurrences}`);
    }
  }
  for (const snippet of OD_INVARIANT_SNIPPETS) {
    if (!text.includes(snippet)) {
      issues.push(`owner decision record lost frozen invariant snippet: ${snippet}`);
    }
  }
  if (!text.includes('owner-approved design input')) {
    issues.push('owner decision record must stay marked as design input, not runtime activation');
  }
  return issues;
}

const MATURITY_ORDER = ['ABSENT', 'CONTRACT_ONLY', 'VALIDATOR_BACKED', 'RUNTIME_IMPLEMENTED'];
const DOC_CLAIM_TO_MATURITY = {
  planned: 'ABSENT',
  'contract-only': 'CONTRACT_ONLY',
  'contract-backed': 'CONTRACT_ONLY',
  'validator-backed': 'VALIDATOR_BACKED',
  'runtime-implemented': 'RUNTIME_IMPLEMENTED',
  implemented: 'RUNTIME_IMPLEMENTED'
};

export function computeVnextMaturity(root, baseline) {
  const families = [];
  for (const surface of baseline.vnext_surfaces) {
    const contractList = surface.contracts || [];
    const contractExists = contractList.length > 0 && contractList.every((contractPath) => fs.existsSync(path.join(root, contractPath)));
    const runtimeExists = (surface.runtime || []).length > 0 && (surface.runtime || []).every((runtimePath) => fs.existsSync(path.join(root, runtimePath)));
    let maturity = 'ABSENT';
    if (contractList.length === 0) {
      // Contractless families (pure runtime surfaces): implemented iff all
      // declared runtime paths (including their test file) exist.
      if (runtimeExists) {
        maturity = 'RUNTIME_IMPLEMENTED';
      }
    } else {
      const validatorBacked = contractExists && Boolean(surface.fixture_covered);
      const runtimeImplemented = validatorBacked && runtimeExists;
      if (contractExists) maturity = 'CONTRACT_ONLY';
      if (validatorBacked) maturity = 'VALIDATOR_BACKED';
      if (runtimeImplemented) maturity = 'RUNTIME_IMPLEMENTED';
    }
    families.push({ family: surface.family, maturity, expected_claim: surface.expected_claim });
  }
  return families;
}

export function checkMaturityDrift(root) {
  const issues = [];
  const baselinePath = path.join(root, 'evals', 'fixtures', 'maws-vnext-baseline.json');
  if (!fs.existsSync(baselinePath)) {
    return ['missing baseline drift fixture: evals/fixtures/maws-vnext-baseline.json'];
  }
  const baseline = readJson(baselinePath);

  for (const [index, surface] of (baseline.vnext_surfaces || []).entries()) {
    for (const requiredField of ['family', 'contracts', 'runtime', 'fixture_covered']) {
      if (!(requiredField in surface)) {
        issues.push(`baseline fixture surface[${index}] missing field ${requiredField}`);
      }
    }
  }
  if (issues.length > 0) {
    return issues;
  }

  const families = computeVnextMaturity(root, baseline);

  const authorityPath = path.join(root, 'docs', 'authority-matrix.md');
  if (!fs.existsSync(authorityPath)) {
    return ['missing docs/authority-matrix.md'];
  }
  const authorityText = fs.readFileSync(authorityPath, 'utf8');
  const claimMap = new Map();
  const claimPattern = /^\|\s*([^|]*)\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|/gm;
  let match = claimPattern.exec(authorityText);
  while (match !== null) {
    const surfaceName = match[1].trim().replace(/^`+|`+$/g, '');
    const claim = match[2].trim();
    if (surfaceName.startsWith('maws-vnext:')) {
      claimMap.set(surfaceName.replace(/^maws-vnext:/, '').trim(), claim);
    }
    match = claimPattern.exec(authorityText);
  }

  for (const family of families) {
    const claim = claimMap.get(family.family);
    if (claim === undefined) {
      issues.push(`authority matrix is missing a maws-vnext:${family.family} row`);
      continue;
    }
    const claimedMaturity = DOC_CLAIM_TO_MATURITY[claim];
    if (claimedMaturity === undefined) {
      issues.push(`authority matrix row maws-vnext:${family.family} uses unmapped claim "${claim}"`);
      continue;
    }
    if (MATURITY_ORDER.indexOf(claimedMaturity) > MATURITY_ORDER.indexOf(family.maturity)) {
      issues.push(
        `authority matrix overclaims maws-vnext:${family.family}: doc says ${claim} (${claimedMaturity}), repository evidence supports ${family.maturity}`
      );
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function loadVnextFixtureFiles(root) {
  const fixtureDir = path.join(root, 'evals', 'fixtures', 'maws-vnext');
  if (!fs.existsSync(fixtureDir)) {
    return [];
  }
  return fs.readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.json') && name !== 'maws-vnext-baseline.json')
    .sort()
    .map((name) => ({ name, fixture: readJson(path.join(fixtureDir, name)) }));
}

export function runMawsVnextContractValidation(root = repoRoot()) {
  const sections = [];
  const fixtureFiles = loadVnextFixtureFiles(root);
  const allIssues = [];
  const odCoverage = new Map();
  let totalCases = 0;

  for (const { name, fixture } of fixtureFiles) {
    const evaluation = evaluateVnextContractFixture(fixture, root);
    totalCases += Array.isArray(fixture.cases) ? fixture.cases.length : 0;
    for (const caseEntry of fixture.cases || []) {
      for (const guard of caseEntry.guards || []) {
        if (!odCoverage.has(guard)) {
          odCoverage.set(guard, []);
        }
        odCoverage.get(guard).push(`${name}:${caseEntry.case_id}`);
      }
    }
    if (!evaluation.passed) {
      allIssues.push(...evaluation.issues.map((issue) => `${name}: ${issue}`));
    }
  }
  sections.push({ section: 'contract-fixtures', fixtures: fixtureFiles.length, cases: totalCases, issues: allIssues.slice() });

  for (let index = 1; index <= 17; index += 1) {
    const odId = `OD-${String(index).padStart(2, '0')}`;
    const coverage = odCoverage.get(odId) || [];
    if (coverage.length === 0) {
      allIssues.push(`OD coverage: ${odId} has no fixture guard`);
    }
  }
  sections.push({ section: 'od-coverage', covered: [...odCoverage.keys()].sort(), issues: [] });

  const protectionIssues = checkOwnerDecisionProtection(root);
  allIssues.push(...protectionIssues.map((issue) => `od-protection: ${issue}`));
  sections.push({ section: 'od-protection', issues: protectionIssues });

  const driftIssues = checkMaturityDrift(root);
  allIssues.push(...driftIssues.map((issue) => `maturity-drift: ${issue}`));
  sections.push({ section: 'maturity-drift', issues: driftIssues });

  return {
    ok: allIssues.length === 0,
    root: path.resolve(root),
    sections,
    issues: allIssues
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = runMawsVnextContractValidation();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
