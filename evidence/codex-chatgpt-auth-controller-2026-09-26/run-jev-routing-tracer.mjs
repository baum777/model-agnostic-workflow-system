// §45 Jev routing tracer — a REAL Jev route decision over the closed
// eligible set {exec_codex_chatgpt, exec_openrouter_glm} through the
// OpenRouter Decisions API, then deterministic RoutingDecision + node
// ExecutorBinding. Fails closed when OPENROUTER_API_KEY is absent (records
// NOT_RUN with the typed blocker; it never fabricates a decision).
// Run: OPENROUTER_API_KEY=... node run-jev-routing-tracer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJevClient } from '../../runtime/decision-engine/jev/client.mjs';
import { buildPreferredExecutorQuestion } from '../../runtime/decision-engine/jev/questions/registry.mjs';
import { loadThresholdPolicy } from '../../runtime/decision-engine/jev/threshold-policy.mjs';
import { buildRoutingRequest, route } from '../../runtime/routing/routing-engine.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const here = path.dirname(fileURLToPath(import.meta.url));
const ELIGIBLE = ['exec_codex_chatgpt', 'exec_openrouter_glm'];
const JEVMODEL = process.env.MAWS_JEV_MODEL ?? '~typesafe/jev-latest';

function write(record) {
  fs.writeFileSync(path.join(here, 'jev-routing-tracer.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

const keyPresent = typeof process.env.OPENROUTER_API_KEY === 'string' && process.env.OPENROUTER_API_KEY.length > 0;
if (!keyPresent) {
  write({
    schema: 'maws.jev-routing-tracer.v1',
    traced_at: new Date().toISOString(),
    status: 'NOT_RUN',
    blocker: 'OPENROUTER_API_KEY_MISSING',
    eligible_executor_set: ELIGIBLE,
    requested_jev_model: JEVMODEL,
    note: 'Re-run with OPENROUTER_API_KEY exported in the invoking shell (the owner exported it in their terminal session on 2026-09-26; agent shells do not inherit it).'
  });
  process.stdout.write('NOT_RUN: OPENROUTER_API_KEY_MISSING\n');
  process.exit(0);
}

const thresholdPolicy = await loadThresholdPolicy(path.join(repoRoot, 'policies', 'decision-thresholds.yaml'));
const jevClient = createJevClient({
  mode: 'openrouter',
  thresholdPolicy,
  requestedModel: JEVMODEL,
  env: process.env
});

// Real routing-shaped state: a read-only repository analysis WorkUnit for
// which both executors are qualified; Jev sees ONLY the closed choice set.
const question = buildPreferredExecutorQuestion(ELIGIBLE);
const ask = await jevClient.ask({
  question,
  choices: question.answer_space.values,
  state: {
    work_unit: 'wu_repo_analysis_readonly',
    task: 'Read-only analysis of repository structure and contracts; no file mutation, no secrets, no network beyond the model transport.',
    workload_safety_class: 'safe',
    mutation_allowed: false,
    eligible_capabilities: ['cap_code_implementation', 'cap_repository_analysis']
  }
});

if (!ask.ok) {
  write({
    schema: 'maws.jev-routing-tracer.v1',
    traced_at: new Date().toISOString(),
    status: 'BLOCKED',
    blocker: ask.error_class,
    disposition: ask.disposition,
    requested_jev_model: JEVMODEL,
    eligible_executor_set: ELIGIBLE
  });
  process.stdout.write(`BLOCKED: ${ask.error_class}\n`);
  process.exit(0);
}

const thresholdMet = ask.threshold?.action === 'PROCEED';
const routingRequest = buildRoutingRequest({
  work_unit_id: 'wu_repo_analysis_readonly',
  capability_requirements: ['cap_repository_analysis'],
  eligible: [
    { executor_id: 'exec_codex_chatgpt', qualification_ref: 'qual_exec_codex_chatgpt_2026_09_26' },
    { executor_id: 'exec_openrouter_glm', qualification_ref: 'qual_exec_openrouter_glm_2026_09_26' }
  ],
  policy_context_ref: 'policy_maws_vnext_default',
  workload_safety_class: 'safe',
  session_model_preference: null
});
const routingDecision = route({
  routing_request: routingRequest,
  jev_answer: thresholdMet
    ? { threshold_met: true, preferred_executor_id: ask.answer, receipt_ref: ask.receipt.receipt_id }
    : null
});

const record = {
  schema: 'maws.jev-routing-tracer.v1',
  traced_at: new Date().toISOString(),
  status: thresholdMet ? 'PASS' : 'HUMAN_GATE',
  requested_jev_model: JEVMODEL,
  resolved_snapshot: ask.resolved_model,
  choice: ask.answer,
  confidence: ask.confidence,
  probabilities: ask.receipt?.probabilities ?? null,
  threshold_result: ask.threshold,
  decision_receipt: ask.receipt,
  eligible_executor_set: ELIGIBLE,
  routing_decision: routingDecision,
  executor_binding: {
    node_id: 'node_repo_analysis',
    executor_binding: {
      executor_id: routingDecision.selected_executor_id,
      selection_mode: routingDecision.selection_mode,
      qualification_ref: routingDecision.qualification_ref,
      jev_receipt_ref: routingDecision.jev_receipt_ref,
      decided_at: routingDecision.decided_at
    }
  }
};
write(record);
process.stdout.write(`${record.status}: choice=${ask.answer} confidence=${ask.confidence} snapshot=${ask.resolved_model}\n`);
process.exit(0);
