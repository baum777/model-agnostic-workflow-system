// Typed Jev question registry (MAWS-VN-202, OD-18).
//
// Every Jev question declares a closed enum answer space. Jev may only answer
// inside that space; MAWS enforces the bounds deterministically. Candidate
// answers outside a space are rejected fail-closed and can never widen the
// allowed state space (JevDecisionSpace subset DeterministicallyAllowedStateSpace).
//
// Static questions carry fixed values. The preferred_executor question is
// DYNAMIC: its values are constructed at runtime only from the deterministic
// eligible executor id list handed in by the routing plane.
import { FailClosedError } from '../../../vnext/util.mjs';

// Mirrors $defs.executorId in core/contracts/maws-vnext-common.schema.json.
const EXECUTOR_ID_PATTERN = /^exec_[a-z0-9_]+$/;

function freezeQuestion(question) {
  return Object.freeze({
    question_id: question.question_id,
    description: question.description,
    answer_space: Object.freeze({
      type: question.answer_space.type,
      values: Object.freeze([...question.answer_space.values])
    })
  });
}

const STATIC_QUESTIONS = new Map([
  ['work_class', freezeQuestion({
    question_id: 'work_class',
    description: 'Class of work a WorkUnit represents for planning and routing.',
    answer_space: { type: 'enum', values: ['analysis', 'implementation', 'verification', 'decision'] }
  })],
  ['decomposition_needed', freezeQuestion({
    question_id: 'decomposition_needed',
    description: 'Whether the WorkUnit must be decomposed before executor binding (OD-03/OD-04).',
    answer_space: { type: 'enum', values: ['yes', 'no'] }
  })],
  ['risk_class', freezeQuestion({
    question_id: 'risk_class',
    description: 'Risk classification driving policy gates, exploration limits, and verification requirements.',
    answer_space: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }
  })],
  ['composition_mode', freezeQuestion({
    question_id: 'composition_mode',
    description: 'Multi-executor composition mode for a planning step (OD-15); "none" forbids composition.',
    answer_space: { type: 'enum', values: ['independent_parallel', 'producer_verifier', 'specialist_synthesis', 'none'] }
  })],
  ['independent_verification_required', freezeQuestion({
    question_id: 'independent_verification_required',
    description: 'Whether independent verification is required before completion (OD-17).',
    answer_space: { type: 'enum', values: ['yes', 'no'] }
  })],
  ['revision_type', freezeQuestion({
    question_id: 'revision_type',
    description: 'Declared plan revision request type; only typed requests may mutate a graph version (OD-06).',
    answer_space: { type: 'enum', values: ['add_node', 'remove_node', 'rebind_executor', 'change_dependencies', 'cancel_work_unit', 'update_context', 'update_budget'] }
  })],
  ['disagreement_type', freezeQuestion({
    question_id: 'disagreement_type',
    description: 'Disagreement class that must be resolved through its DisagreementPolicy before continuation (OD-16).',
    answer_space: { type: 'enum', values: ['factual_conflict', 'implementation_conflict', 'verification_conflict', 'evidence_conflict', 'policy_conflict', 'authority_conflict'] }
  })],
  ['evidence_sufficiency', freezeQuestion({
    question_id: 'evidence_sufficiency',
    description: 'Whether the available evidence satisfies the completion contract evidence gate.',
    answer_space: { type: 'enum', values: ['sufficient', 'insufficient', 'unknown'] }
  })]
]);

export function getQuestion(questionId) {
  if (typeof questionId !== 'string' || questionId === '') {
    throw new FailClosedError('UNKNOWN_QUESTION', 'question id must be a non-empty string');
  }
  const question = STATIC_QUESTIONS.get(questionId);
  if (!question) {
    if (questionId === 'preferred_executor') {
      throw new FailClosedError(
        'UNKNOWN_QUESTION',
        'question "preferred_executor" is dynamic; build it at runtime with buildPreferredExecutorQuestion(eligibleExecutorIds)'
      );
    }
    throw new FailClosedError('UNKNOWN_QUESTION', `unknown question "${questionId}"`);
  }
  return question;
}

// DYNAMIC question: values exist only at runtime and are constructed only
// from the deterministic eligible executor id list. No synthetic or
// model-invented executor ids can enter the answer space.
export function buildPreferredExecutorQuestion(eligibleExecutorIds) {
  const invalid = (detail) => new FailClosedError('INVALID_EXECUTOR_ID', `preferred_executor question rejected: ${detail}`);
  if (!Array.isArray(eligibleExecutorIds) || eligibleExecutorIds.length === 0) {
    throw invalid('eligibleExecutorIds must be a non-empty array of deterministic eligible executor ids');
  }
  const seen = new Set();
  for (const executorId of eligibleExecutorIds) {
    if (typeof executorId !== 'string' || !EXECUTOR_ID_PATTERN.test(executorId)) {
      throw invalid(`executor id ${JSON.stringify(executorId)} must match ${EXECUTOR_ID_PATTERN}`);
    }
    if (seen.has(executorId)) {
      throw invalid(`duplicate executor id "${executorId}"`);
    }
    seen.add(executorId);
  }
  return freezeQuestion({
    question_id: 'preferred_executor',
    description: 'Preferred executor among the deterministic eligible executor set; values are constructed at runtime only from that set.',
    answer_space: { type: 'enum', values: [...eligibleExecutorIds] }
  });
}

export function assertAnswerInSpace(question, answer) {
  if (!question || typeof question !== 'object' || typeof question.question_id !== 'string' || question.question_id === '') {
    throw new FailClosedError('INVALID_QUESTION', 'assertAnswerInSpace requires a question with a non-empty question_id');
  }
  const space = question.answer_space;
  if (
    !space || typeof space !== 'object' ||
    space.type !== 'enum' ||
    !Array.isArray(space.values) || space.values.length === 0 ||
    space.values.some((value) => typeof value !== 'string')
  ) {
    throw new FailClosedError('INVALID_QUESTION', `question "${question.question_id}" has no valid enum answer space`);
  }
  if (!space.values.includes(answer)) {
    throw new FailClosedError(
      'ANSWER_OUTSIDE_ALLOWED_SPACE',
      `answer ${JSON.stringify(answer)} is outside the allowed space of question "${question.question_id}" [${space.values.join(', ')}]`
    );
  }
  return true;
}
