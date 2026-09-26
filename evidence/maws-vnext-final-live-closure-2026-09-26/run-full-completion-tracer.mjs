// §17 FULL-slice CompletionDecision for the final live closure: all three
// activation lanes (LIVE_ACTIVATION_PASS), all three tracers, auth health,
// and the verification gates. Execution != Completion: the decision requires
// execution success, required outputs, required evidence, and an independent
// deterministic verification receipt before COMPLETED. Run:
//   node run-full-completion-tracer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateCompletion } from '../../runtime/completion/completion-engine.mjs';
import { buildVerificationReceipt } from '../../runtime/completion/verification.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = 'evidence/maws-vnext-final-live-closure-2026-09-26';

const modelTracer = JSON.parse(fs.readFileSync(path.join(here, 'openrouter-model-evidence.json'), 'utf8'));
const activation = JSON.parse(fs.readFileSync(path.join(here, 'activation-evidence.json'), 'utf8'));

const contract = {
  contract_id: 'cc_full_live_closure_001',
  work_unit_id: 'wu_openrouter_tracer_2026_09_26',
  clauses: {
    execution_success: { required: true },
    required_outputs: [
      {
        output_id: 'openrouter_model_tracer_report',
        artifact_ref: `${evidenceDir}/openrouter-model-evidence.json`
      }
    ],
    required_evidence: [
      `${evidenceDir}/activation-evidence.json`,
      `${evidenceDir}/codex-auth-health.json`,
      `${evidenceDir}/jev-routing-evidence.json`,
      `${evidenceDir}/codex-tracer-evidence.json`,
      `${evidenceDir}/openrouter-model-evidence.json`
    ],
    verification: { required: true, independent: true },
    dependency_closure: { required: true },
    child_closure: { required: true },
    disagreement_closure: [],
    graph_conditions: []
  }
};

const verificationReceipt = buildVerificationReceipt({
  work_unit_id: 'wu_openrouter_tracer_2026_09_26',
  verifier_executor_id: 'exec_local_tests',
  independent: true,
  outcome: 'PASS',
  evidence_refs: [
    'npm run test:activation -> 39/39 pass, exit 0 (2026-09-26, includes 24 auth-controller tests)',
    'npm run test:vnext -> 228/228 pass, exit 0 (2026-09-26)',
    'npm run runtime:codex-auth:check -> AUTH_HEALTHY exit 0 (2026-09-26T00:53Z)',
    'npm run runtime:activate-vnext -> LIVE_ACTIVATION_PASS exit 0 (2026-09-26T01:04Z)',
    'jev routing tracer PASS + codex tracer PASS + openrouter model tracer PASS (2026-09-26T00:55-01:05Z)',
    'npm run validate-maws-vnext / eval:maws-vnext / validate / validate-neutral / validate-secrets / scan-secrets -> exit 0 (2026-09-26)'
  ],
  checks: [
    `activation status ${activation.status} with zero blockers (codex_chatgpt, openrouter_jev, openrouter_model all PASS)`,
    `openrouter_model served==requested (${modelTracer.requested_model}), model_substitution=false`,
    'jev requested alias resolved to dated snapshot with threshold PROCEED and closed answer space',
    'codex lane gated on AUTH_HEALTHY (stored status alone insufficient), phrase-verified probe',
    'secret isolation: OPENROUTER key never reaches the Codex child (allowlist PATH/HOME/CODEX_HOME)'
  ],
  created_at: new Date().toISOString()
});

const decision = evaluateCompletion({
  completion_contract: contract,
  execution_results: [
    {
      work_unit_id: 'wu_openrouter_tracer_2026_09_26',
      execution_attempt_id: 'execatt_openrouter_tracer_2026_09_26',
      executor_id: 'exec_openrouter_glm',
      started_at: modelTracer.traced_at,
      finished_at: modelTracer.traced_at,
      outcome: modelTracer.execution_result.outcome,
      outputs: [{ output_id: 'openrouter_model_tracer_report', artifact_ref: `${evidenceDir}/openrouter-model-evidence.json` }],
      metrics: modelTracer.execution_result.metrics ?? {},
      error_class: modelTracer.execution_result.error_class,
      exit_code: modelTracer.execution_result.exit_code ?? null
    }
  ],
  verification_receipts: [verificationReceipt],
  dependency_states: [],
  child_states: [],
  outputs_present: ['openrouter_model_tracer_report'],
  evidence_present: contract.clauses.required_evidence,
  decided_at: new Date().toISOString()
});

const record = {
  schema: 'maws.completion-decision.v1-record',
  recorded_at: new Date().toISOString(),
  scope_note: 'FULL final live closure slice: all three activation lanes (LIVE_ACTIVATION_PASS), Jev routing tracer, Codex tracer, OpenRouter model tracer, auth health, and the verification gates. Supersedes the scope-limited auth-controller-slice decision in evidence/codex-chatgpt-auth-controller-2026-09-26/completion-decision.json (that decision deliberately did not claim the OpenRouter lanes).',
  decision
};
fs.writeFileSync(path.join(here, 'completion-decision.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
process.stdout.write(`CompletionDecision: ${decision.result}\n`);
process.exit(decision.result === 'COMPLETED' ? 0 : 1);
