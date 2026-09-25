// MAWS vNext completion engine (MAWS-VN-702, OD-17).
// Execution success is not completion. A WorkUnit reaches COMPLETED only
// when its CompletionContract is satisfied: execution success, required
// outputs, required evidence, verification, dependency/child closure,
// disagreement closure, and graph conditions.
//
// Posture:
// - Pure function: callers persist the returned CompletionDecision
//   (validates against core/contracts/completion-decision.schema.json).
// - Unknown or malformed completion-contract clause shapes fail closed
//   with FailClosedError('COMPLETION_CONTRACT_INVALID').
// - Malformed runtime input entries fail closed with
//   FailClosedError('COMPLETION_INPUT_INVALID'); merely missing state
//   (no receipts, incomplete dependencies, absent graph state) yields
//   NOT_COMPLETED with blocking reasons, not a crash.
// - Only active clauses (required=true or non-empty requirement lists)
//   appear in satisfied_clauses/unsatisfied_clauses; waived or empty
//   clauses impose nothing.
// - The decision schema makes verification_satisfied=true a hard
//   precondition of COMPLETED, so even a contract that waives the
//   verification clause cannot complete without receipt evaluation
//   (OD-17: Receipt != Verification, Execution != Completion).
// - disagreement_decisions array order is chronological; per class the
//   latest decision determines closure (RESOLVED closes, anything else
//   does not). authority_conflict can never be RESOLVED (OD-16); a
//   decision claiming so fails closed.
// - Secrets never enter decisions; evidence refs are references only.
import { FailClosedError, newId, nowIso } from '../vnext/util.mjs';
import { evaluateVerificationReceipts } from './verification.mjs';

const CONTRACT_INVALID = 'COMPLETION_CONTRACT_INVALID';
const INPUT_INVALID = 'COMPLETION_INPUT_INVALID';

const WORK_UNIT_ID_PATTERN = /^wu_[a-z0-9_]+$/;
const CONTRACT_ID_PATTERN = /^cc_[a-z0-9_]+$/;
const DISAGREEMENT_CLASSES = [
  'factual_conflict',
  'implementation_conflict',
  'verification_conflict',
  'evidence_conflict',
  'policy_conflict',
  'authority_conflict'
];
const DISAGREEMENT_OUTCOMES = ['RESOLVED', 'ESCALATED', 'BLOCKED'];
const GRAPH_CONDITIONS = ['all_nodes_completed', 'active_graph_version_matches'];
const CLAUSE_KEYS = [
  'execution_success',
  'required_outputs',
  'required_evidence',
  'verification',
  'dependency_closure',
  'child_closure',
  'disagreement_closure',
  'graph_conditions'
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function contractInvalid(message) {
  return new FailClosedError(CONTRACT_INVALID, message);
}

function inputInvalid(message) {
  return new FailClosedError(INPUT_INVALID, message);
}

function assertExactKeys(object, allowedKeys, where) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) {
      throw contractInvalid(`${where} has unknown key "${key}"`);
    }
  }
}

function validateBooleanClause(clause, clauseName) {
  if (!isPlainObject(clause)) {
    throw contractInvalid(`clauses.${clauseName} must be an object with a required boolean`);
  }
  assertExactKeys(clause, ['required'], `clauses.${clauseName}`);
  if (typeof clause.required !== 'boolean') {
    throw contractInvalid(`clauses.${clauseName}.required must be a boolean`);
  }
  return clause;
}

// Strict structural validation of a CompletionContract
// (mirrors core/contracts/completion-contract.schema.json; unknown
// clause shapes fail closed).
function validateCompletionContract(contract) {
  if (!isPlainObject(contract)) {
    throw contractInvalid('completion_contract must be an object');
  }
  assertExactKeys(contract, ['contract_id', 'work_unit_id', 'clauses'], 'completion_contract');
  if (!isNonEmptyString(contract.contract_id) || !CONTRACT_ID_PATTERN.test(contract.contract_id)) {
    throw contractInvalid(`completion_contract.contract_id must match ${CONTRACT_ID_PATTERN.source}`);
  }
  if (!isNonEmptyString(contract.work_unit_id) || !WORK_UNIT_ID_PATTERN.test(contract.work_unit_id)) {
    throw contractInvalid(`completion_contract.work_unit_id must match ${WORK_UNIT_ID_PATTERN.source}`);
  }

  const clauses = contract.clauses;
  if (!isPlainObject(clauses)) {
    throw contractInvalid('completion_contract.clauses must be an object');
  }
  for (const key of CLAUSE_KEYS) {
    if (!(key in clauses)) {
      throw contractInvalid(`completion_contract.clauses is missing required clause "${key}"`);
    }
  }
  assertExactKeys(clauses, CLAUSE_KEYS, 'completion_contract.clauses');

  validateBooleanClause(clauses.execution_success, 'execution_success');
  validateBooleanClause(clauses.dependency_closure, 'dependency_closure');
  validateBooleanClause(clauses.child_closure, 'child_closure');

  if (!isPlainObject(clauses.verification)) {
    throw contractInvalid('clauses.verification must be an object with required and independent booleans');
  }
  assertExactKeys(clauses.verification, ['required', 'independent'], 'clauses.verification');
  if (typeof clauses.verification.required !== 'boolean' || typeof clauses.verification.independent !== 'boolean') {
    throw contractInvalid('clauses.verification.required and clauses.verification.independent must be booleans');
  }

  if (!Array.isArray(clauses.required_outputs)) {
    throw contractInvalid('clauses.required_outputs must be an array of { output_id, artifact_ref }');
  }
  clauses.required_outputs.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw contractInvalid(`clauses.required_outputs[${index}] must be an object`);
    }
    assertExactKeys(entry, ['output_id', 'artifact_ref'], `clauses.required_outputs[${index}]`);
    if (!isNonEmptyString(entry.output_id) || !isNonEmptyString(entry.artifact_ref)) {
      throw contractInvalid(`clauses.required_outputs[${index}] requires non-empty output_id and artifact_ref`);
    }
  });

  if (!Array.isArray(clauses.required_evidence)) {
    throw contractInvalid('clauses.required_evidence must be an array of non-empty strings');
  }
  const seenEvidence = new Set();
  for (const ref of clauses.required_evidence) {
    if (!isNonEmptyString(ref)) {
      throw contractInvalid('clauses.required_evidence entries must be non-empty strings');
    }
    if (seenEvidence.has(ref)) {
      throw contractInvalid(`clauses.required_evidence contains duplicate ref "${ref}"`);
    }
    seenEvidence.add(ref);
  }

  if (!Array.isArray(clauses.disagreement_closure)) {
    throw contractInvalid('clauses.disagreement_closure must be an array of disagreement classes');
  }
  const seenClasses = new Set();
  for (const className of clauses.disagreement_closure) {
    if (!DISAGREEMENT_CLASSES.includes(className)) {
      throw contractInvalid(`clauses.disagreement_closure contains unknown disagreement class ${JSON.stringify(className)}`);
    }
    if (seenClasses.has(className)) {
      throw contractInvalid(`clauses.disagreement_closure contains duplicate class "${className}"`);
    }
    seenClasses.add(className);
  }

  if (!Array.isArray(clauses.graph_conditions)) {
    throw contractInvalid('clauses.graph_conditions must be an array of { condition, expected }');
  }
  clauses.graph_conditions.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw contractInvalid(`clauses.graph_conditions[${index}] must be an object`);
    }
    assertExactKeys(entry, ['condition', 'expected'], `clauses.graph_conditions[${index}]`);
    if (!GRAPH_CONDITIONS.includes(entry.condition)) {
      throw contractInvalid(`clauses.graph_conditions[${index}].condition must be one of ${GRAPH_CONDITIONS.join(', ')}`);
    }
    if (entry.expected !== true) {
      throw contractInvalid(`clauses.graph_conditions[${index}].expected must be true`);
    }
  });

  return contract;
}

function readStateArray(input, field) {
  const value = input[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw inputInvalid(`${field} must be an array`);
  }
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw inputInvalid(`${field}[${index}] must be an object`);
    }
    if (!isNonEmptyString(entry.work_unit_id)) {
      throw inputInvalid(`${field}[${index}].work_unit_id must be a non-empty string`);
    }
    if (typeof entry.completed !== 'boolean') {
      throw inputInvalid(`${field}[${index}].completed must be a boolean`);
    }
  });
  return value;
}

function readStringArray(input, field) {
  const value = input[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw inputInvalid(`${field} must be an array of non-empty strings`);
  }
  for (const entry of value) {
    if (!isNonEmptyString(entry)) {
      throw inputInvalid(`${field} entries must be non-empty strings`);
    }
  }
  return value;
}

function readExecutionResults(input) {
  const value = input.execution_results;
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw inputInvalid('execution_results must be an array');
  }
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw inputInvalid(`execution_results[${index}] must be an object`);
    }
    if (!isNonEmptyString(entry.execution_attempt_id)) {
      throw inputInvalid(`execution_results[${index}].execution_attempt_id must be a non-empty string`);
    }
    if (!isNonEmptyString(entry.work_unit_id)) {
      throw inputInvalid(`execution_results[${index}].work_unit_id must be a non-empty string`);
    }
    if (!isNonEmptyString(entry.outcome)) {
      throw inputInvalid(`execution_results[${index}].outcome must be a non-empty string`);
    }
  });
  return value;
}

function readDisagreementDecisions(input) {
  const value = input.disagreement_decisions;
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw inputInvalid('disagreement_decisions must be an array');
  }
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw inputInvalid(`disagreement_decisions[${index}] must be an object`);
    }
    if (!DISAGREEMENT_CLASSES.includes(entry.disagreement_class)) {
      throw inputInvalid(
        `disagreement_decisions[${index}].disagreement_class must be one of ${DISAGREEMENT_CLASSES.join(', ')}`
      );
    }
    if (!DISAGREEMENT_OUTCOMES.includes(entry.outcome)) {
      throw inputInvalid(
        `disagreement_decisions[${index}].outcome must be one of ${DISAGREEMENT_OUTCOMES.join(', ')}`
      );
    }
    if (entry.disagreement_class === 'authority_conflict' && entry.outcome === 'RESOLVED') {
      throw new FailClosedError(
        'DISAGREEMENT_DECISION_INVALID',
        `disagreement_decisions[${index}]: authority_conflict can never be RESOLVED (OD-16)`
      );
    }
  });
  return value;
}

function readGraphState(input) {
  const value = input.graph_state;
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw inputInvalid('graph_state must be an object');
  }
  for (const field of ['all_nodes_completed', 'active_graph_version', 'expected_graph_version']) {
    if (value[field] === undefined) {
      continue;
    }
    if (field === 'all_nodes_completed' && typeof value[field] !== 'boolean') {
      throw inputInvalid('graph_state.all_nodes_completed must be a boolean when present');
    }
    if (field !== 'all_nodes_completed' && !(Number.isInteger(value[field]) && value[field] >= 1)) {
      throw inputInvalid(`graph_state.${field} must be a positive integer when present`);
    }
  }
  return value;
}

function evaluateClosureStates(states, label, clauseActive) {
  if (!clauseActive) {
    return { satisfied: true, blocking: [] };
  }
  const blocking = [];
  for (const state of states) {
    if (state.completed !== true) {
      blocking.push(`${label} ${state.work_unit_id} is not completed`);
    }
  }
  return { satisfied: blocking.length === 0, blocking };
}

// Deterministic CompletionDecision evaluation (OD-17).
function evaluateCompletion(input) {
  if (!isPlainObject(input)) {
    throw inputInvalid('evaluateCompletion requires an input object');
  }
  const contract = validateCompletionContract(input.completion_contract);
  const clauses = contract.clauses;
  const workUnitId = contract.work_unit_id;

  if (input.decided_at !== undefined && !isNonEmptyString(input.decided_at)) {
    throw inputInvalid('decided_at must be a non-empty timestamp string when present');
  }

  const executionResults = readExecutionResults(input);
  const verificationReceipts = input.verification_receipts === undefined ? [] : input.verification_receipts;
  if (!Array.isArray(verificationReceipts)) {
    throw inputInvalid('verification_receipts must be an array when present');
  }
  const dependencyStates = readStateArray(input, 'dependency_states');
  const childStates = readStateArray(input, 'child_states');
  const disagreementDecisions = readDisagreementDecisions(input);
  const graphState = readGraphState(input);
  const outputsPresent = new Set(readStringArray(input, 'outputs_present'));
  const evidencePresent = new Set(readStringArray(input, 'evidence_present'));

  const satisfiedClauses = [];
  const unsatisfiedClauses = [];
  const blockingReasons = [];

  // --- execution_success -------------------------------------------------
  const unitResults = executionResults.filter((result) => result.work_unit_id === workUnitId);
  const executionSucceeded = unitResults.some((result) => result.outcome === 'SUCCESS');
  const executionClauseActive = clauses.execution_success.required === true;
  if (!executionSucceeded) {
    blockingReasons.push(`no SUCCESS execution result is present for work unit ${workUnitId}`);
  }
  if (executionClauseActive) {
    if (executionSucceeded) {
      satisfiedClauses.push('execution_success');
    } else {
      unsatisfiedClauses.push('execution_success');
    }
  }

  // --- required_outputs ----------------------------------------------------
  const requiredOutputs = clauses.required_outputs;
  if (requiredOutputs.length > 0) {
    const missingOutputs = requiredOutputs.filter((entry) => !outputsPresent.has(entry.output_id));
    if (missingOutputs.length === 0) {
      satisfiedClauses.push('required_outputs');
    } else {
      unsatisfiedClauses.push('required_outputs');
      for (const entry of missingOutputs) {
        blockingReasons.push(`required output ${entry.output_id} is not present`);
      }
    }
  }

  // --- required_evidence ---------------------------------------------------
  const requiredEvidence = clauses.required_evidence;
  if (requiredEvidence.length > 0) {
    const missingEvidence = requiredEvidence.filter((ref) => !evidencePresent.has(ref));
    if (missingEvidence.length === 0) {
      satisfiedClauses.push('required_evidence');
    } else {
      unsatisfiedClauses.push('required_evidence');
      for (const ref of missingEvidence) {
        blockingReasons.push(`required evidence ${ref} is not present`);
      }
    }
  }

  // --- verification --------------------------------------------------------
  // Strict attribution: only receipts carrying this work unit's id count.
  // Unattributed receipts cannot prove anything about this unit (fail closed).
  const scopedReceipts = verificationReceipts.filter((receipt) => receipt.work_unit_id === workUnitId);
  const verificationEvaluation = evaluateVerificationReceipts(scopedReceipts, {
    independentRequired: clauses.verification.independent === true
  });
  const verificationSatisfied = verificationEvaluation.satisfied;
  if (!verificationSatisfied) {
    blockingReasons.push(...verificationEvaluation.blocking);
  }
  if (clauses.verification.required === true) {
    if (verificationSatisfied) {
      satisfiedClauses.push('verification');
    } else {
      unsatisfiedClauses.push('verification');
    }
  }

  // --- dependency_closure / child_closure ---------------------------------
  for (const [clauseName, states, label] of [
    ['dependency_closure', dependencyStates, 'dependency'],
    ['child_closure', childStates, 'child work unit']
  ]) {
    const active = clauses[clauseName].required === true;
    const evaluation = evaluateClosureStates(states, label, active);
    if (!active) {
      continue;
    }
    if (evaluation.satisfied) {
      satisfiedClauses.push(clauseName);
    } else {
      unsatisfiedClauses.push(clauseName);
      blockingReasons.push(...evaluation.blocking);
    }
  }

  // --- disagreement_closure -------------------------------------------------
  const requiredClasses = clauses.disagreement_closure;
  if (requiredClasses.length > 0) {
    let allClosed = true;
    for (const className of requiredClasses) {
      const classDecisions = disagreementDecisions.filter((decision) => decision.disagreement_class === className);
      if (classDecisions.length === 0) {
        allClosed = false;
        blockingReasons.push(`disagreement class ${className} has no recorded decision`);
        continue;
      }
      const latest = classDecisions[classDecisions.length - 1];
      if (latest.outcome !== 'RESOLVED') {
        allClosed = false;
        blockingReasons.push(`disagreement class ${className} is unresolved (latest outcome ${latest.outcome})`);
      }
    }
    if (allClosed) {
      satisfiedClauses.push('disagreement_closure');
    } else {
      unsatisfiedClauses.push('disagreement_closure');
    }
  }

  // --- graph_conditions -------------------------------------------------------
  if (clauses.graph_conditions.length > 0) {
    let allConditionsHold = true;
    for (const { condition } of clauses.graph_conditions) {
      if (condition === 'all_nodes_completed') {
        if (graphState?.all_nodes_completed === true) {
          continue;
        }
        allConditionsHold = false;
        if (graphState === undefined || graphState.all_nodes_completed === undefined) {
          blockingReasons.push('graph condition all_nodes_completed cannot be evaluated: graph state is missing');
        } else {
          blockingReasons.push('graph condition all_nodes_completed is not met');
        }
        continue;
      }
      if (condition === 'active_graph_version_matches') {
        if (graphState?.active_graph_version !== undefined && graphState.active_graph_version === graphState.expected_graph_version) {
          continue;
        }
        allConditionsHold = false;
        if (graphState?.active_graph_version === undefined || graphState?.expected_graph_version === undefined) {
          blockingReasons.push('graph condition active_graph_version_matches cannot be evaluated: graph versions are missing');
        } else {
          blockingReasons.push(
            `active graph version ${graphState.active_graph_version} does not match expected graph version ${graphState.expected_graph_version}`
          );
        }
      }
    }
    if (allConditionsHold) {
      satisfiedClauses.push('graph_conditions');
    } else {
      unsatisfiedClauses.push('graph_conditions');
    }
  }

  // --- decision ---------------------------------------------------------------
  const result =
    executionSucceeded &&
    verificationSatisfied &&
    unsatisfiedClauses.length === 0 &&
    blockingReasons.length === 0
      ? 'COMPLETED'
      : 'NOT_COMPLETED';

  const evidenceRefs = [];
  const seenRefs = new Set();
  function addRef(ref) {
    if (isNonEmptyString(ref) && !seenRefs.has(ref)) {
      seenRefs.add(ref);
      evidenceRefs.push(ref);
    }
  }
  for (const executionResult of unitResults) {
    addRef(executionResult.execution_attempt_id);
  }
  for (const receipt of scopedReceipts) {
    addRef(receipt.verification_receipt_id);
    for (const ref of Array.isArray(receipt.evidence_refs) ? receipt.evidence_refs : []) {
      addRef(ref);
    }
  }

  return {
    decision_id: newId('cdec'),
    work_unit_id: workUnitId,
    contract_ref: contract.contract_id,
    result,
    execution_succeeded: executionSucceeded,
    verification_satisfied: verificationSatisfied,
    satisfied_clauses: satisfiedClauses,
    unsatisfied_clauses: unsatisfiedClauses,
    blocking_reasons: blockingReasons,
    evidence_refs: evidenceRefs,
    decided_at: input.decided_at !== undefined ? input.decided_at : nowIso()
  };
}

export { evaluateCompletion, DISAGREEMENT_CLASSES };
