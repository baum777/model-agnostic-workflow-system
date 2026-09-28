#!/usr/bin/env node
// MAWS vNext — governed Jev decision frontdoor (JEV-RUNTIME-FRONTDOOR-01, OD-19).
//
//   npm run runtime:jev-decide -- --question <id> --mode <fixture|live|openrouter|zen>
//        [--state <file>] [--case <caseId>] [--model <id>] [--json]
//
// Thin frontdoor ONLY: it validates arguments, asks the canonical MAWS Jev
// client with a registry question and that question's full declared answer
// space, and prints the canonical decision result as JSON on stdout (output
// is always machine-readable; --json is accepted for explicitness). No
// decision logic lives here: question registry, threshold policy, eligibility,
// qualification, and authority stay exclusively in MAWS. The dynamic
// `preferred_executor` question is intentionally unreachable — constructing
// it requires the routing plane's deterministic eligible executor set, and
// this CLI never mints eligibility. There is no fallback between transports,
// no batching, and no inference of missing candidates.
//
// Exit codes:
//   0  valid decision produced — the verdict (including HUMAN_GATE) lives in
//      the JSON payload (`verdict`), never in the process exit code
//   2  invalid invocation/input (unknown question/mode, unreadable or invalid
//      state file, oversized state, bad fixture case)
//   3  transport/runtime failure (timeout, rate limit, unavailability,
//      missing provider credential)
//   4  contract violation (threshold policy failure, answer-space violation,
//      malformed provider response)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson, FailClosedError } from '../vnext/util.mjs';
import { createJevClient } from '../decision-engine/jev/client.mjs';
import { loadThresholdPolicy } from '../decision-engine/jev/threshold-policy.mjs';
import { getQuestion } from '../decision-engine/jev/questions/registry.mjs';

const MODES = ['fixture', 'live', 'openrouter', 'zen'];
const VALUE_FLAGS = new Map([
  ['--question', 'question'],
  ['--mode', 'mode'],
  ['--state', 'statePath'],
  ['--case', 'caseId'],
  ['--model', 'model']
]);
const BOOLEAN_FLAGS = new Set(['--json', '--help']);

const EXIT_OK = 0;
const EXIT_INPUT = 2;
const EXIT_RUNTIME = 3;
const EXIT_CONTRACT = 4;

// Client failure outcomes that mean the transport/runtime layer failed.
const RUNTIME_FAILURE_CLASSES = new Set([
  'JEV_TIMEOUT',
  'JEV_RATE_LIMITED',
  'JEV_UNAVAILABLE',
  'JEV_API_KEY_MISSING'
]);
// Client failure outcomes that mean the caller's own input was invalid.
const INPUT_FAILURE_CLASSES = new Set([
  'STATE_OVERSIZED',
  'ASK_CONFIG_INVALID'
]);
// Thrown FailClosedError classes that mean the caller's input was invalid
// (everything else thrown is a contract violation).
const THROWN_INPUT_CLASSES = new Set([
  'FIXTURE_CASE_INVALID',
  'FIXTURE_NOT_FOUND',
  'FIXTURE_INVALID'
]);

export const JEV_DECIDE_USAGE = [
  'usage: runtime-jev-decide.mjs --question <id> --mode <fixture|live|openrouter|zen>',
  '                [--state <file>] [--case <caseId>] [--model <id>] [--json]',
  '',
  'questions: canonical MAWS question registry ids only (e.g. work_class,',
  '           risk_class, evidence_sufficiency, decomposition_needed,',
  '           composition_mode, independent_verification_required,',
  '           revision_type, disagreement_type).',
  'exit codes: 0 valid decision (verdict in JSON) | 2 invalid invocation/input',
  '            | 3 transport/runtime failure | 4 contract violation'
].join('\n');

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function inputFailure(errorClass, message) {
  return { exitCode: EXIT_INPUT, usage: false, payload: { ok: false, disposition: 'BLOCKED', error_class: errorClass, message, exit_code: EXIT_INPUT } };
}

function runtimeFailure(errorClass, message) {
  return { exitCode: EXIT_RUNTIME, usage: false, payload: { ok: false, disposition: 'ESCALATE', error_class: errorClass, message, exit_code: EXIT_RUNTIME } };
}

function contractFailure(errorClass, message) {
  return { exitCode: EXIT_CONTRACT, usage: false, payload: { ok: false, disposition: 'BLOCKED', error_class: errorClass, message, exit_code: EXIT_CONTRACT } };
}

export async function runJevDecide(argv, options = {}) {
  const args = { question: null, mode: null, statePath: null, caseId: null, model: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (VALUE_FLAGS.has(flag)) {
      const value = argv[index + 1];
      if (value === undefined) {
        return { ...inputFailure('INVOCATION_INVALID', `flag ${flag} requires a value`), usage: true };
      }
      args[VALUE_FLAGS.get(flag)] = value;
      index += 1;
      continue;
    }
    if (BOOLEAN_FLAGS.has(flag)) {
      if (flag === '--help') args.help = true;
      continue;
    }
    return { ...inputFailure('INVOCATION_INVALID', `unknown argument ${JSON.stringify(flag)}`), usage: true };
  }
  if (args.help) {
    return { exitCode: EXIT_OK, help: true, payload: null };
  }
  if (typeof args.question !== 'string' || args.question === '') {
    return { ...inputFailure('INVOCATION_INVALID', 'missing required --question <id>'), usage: true };
  }
  if (typeof args.mode !== 'string' || args.mode === '') {
    return { ...inputFailure('INVOCATION_INVALID', 'missing required --mode <fixture|live|openrouter|zen>'), usage: true };
  }
  if (!MODES.includes(args.mode)) {
    return { ...inputFailure('INVOCATION_INVALID', `mode must be one of ${MODES.join(', ')}`), usage: true };
  }
  if (args.mode === 'fixture' && (typeof args.caseId !== 'string' || args.caseId === '')) {
    return inputFailure('INVOCATION_INVALID', 'mode "fixture" requires --case <caseId>');
  }

  // Question vocabulary comes exclusively from the canonical registry. The
  // CLI never defines questions, never narrows answer spaces beyond the
  // registry (choices ARE the declared space), and never mints eligibility:
  // the dynamic preferred_executor question throws here by design.
  let question;
  try {
    question = getQuestion(args.question);
  } catch (error) {
    if (error instanceof FailClosedError && error.code === 'UNKNOWN_QUESTION') {
      return inputFailure('UNKNOWN_QUESTION', error.message);
    }
    throw error;
  }
  const choices = [...question.answer_space.values];

  let state = {};
  if (args.statePath !== null) {
    let text;
    try {
      text = fs.readFileSync(args.statePath, 'utf8');
    } catch (error) {
      return inputFailure('STATE_FILE_UNREADABLE', `cannot read --state file: ${error.message}`);
    }
    try {
      state = JSON.parse(text);
    } catch (error) {
      return inputFailure('STATE_FILE_INVALID_JSON', `--state file is not valid JSON: ${error.message}`);
    }
    try {
      canonicalJson(state);
    } catch {
      return inputFailure('STATE_NOT_CANONICAL', '--state file content is not canonical-JSON serializable');
    }
  }

  const root = options.root ?? repoRoot();
  let thresholdPolicy;
  try {
    thresholdPolicy = await loadThresholdPolicy(options.policyPath ?? path.join(root, 'policies', 'decision-thresholds.yaml'));
  } catch (error) {
    if (error instanceof FailClosedError) {
      return contractFailure(error.code, error.message);
    }
    throw error;
  }

  let client;
  try {
    client = createJevClient({
      mode: args.mode,
      thresholdPolicy,
      ...(args.model !== null ? { requestedModel: args.model } : {}),
      env: options.env ?? process.env,
      ...(typeof options.fetchImpl === 'function' ? { fetchImpl: options.fetchImpl } : {})
    });
  } catch (error) {
    if (error instanceof FailClosedError) {
      return contractFailure(error.code, error.message);
    }
    throw error;
  }

  let result;
  try {
    result = await client.ask({
      question,
      choices,
      state,
      ...(args.mode === 'fixture' ? { caseId: args.caseId } : {})
    });
  } catch (error) {
    if (error instanceof FailClosedError) {
      if (THROWN_INPUT_CLASSES.has(error.code) || error.code === 'ASK_CONFIG_INVALID') {
        return inputFailure(error.code, error.message);
      }
      return contractFailure(error.code, error.message);
    }
    throw error;
  }

  if (result.ok !== true) {
    if (RUNTIME_FAILURE_CLASSES.has(result.error_class)) {
      return runtimeFailure(result.error_class, result.message);
    }
    if (INPUT_FAILURE_CLASSES.has(result.error_class)) {
      return inputFailure(result.error_class, result.message);
    }
    return contractFailure(result.error_class, result.message);
  }

  // Canonical client result verbatim, plus one convenience projection of the
  // deterministic verdict. No decision semantics are added here.
  return {
    exitCode: EXIT_OK,
    usage: false,
    payload: { ...result, verdict: result.threshold.action }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = await runJevDecide(process.argv.slice(2));
  if (outcome.help === true) {
    process.stdout.write(`${JEV_DECIDE_USAGE}\n`);
  } else {
    if (outcome.usage === true) {
      process.stderr.write(`${JEV_DECIDE_USAGE}\n`);
    }
    process.stdout.write(`${JSON.stringify(outcome.payload, null, 2)}\n`);
  }
  process.exit(outcome.exitCode);
}
