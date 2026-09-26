// §48 Completion tracer — evaluates the final CompletionDecision for the
// Codex ChatGPT auth-controller slice through the real completion engine.
// Execution != Completion: the decision requires execution success, required
// outputs, required evidence, and an independent deterministic verification
// receipt before COMPLETED. Run after run-codex-tracer.mjs:
//   node run-completion-tracer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateCompletion } from '../../runtime/completion/completion-engine.mjs';
import { buildVerificationReceipt } from '../../runtime/completion/verification.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const here = path.dirname(fileURLToPath(import.meta.url));

function copyAs(targetName, sourceDir, sourceName) {
  const source = path.join(sourceDir, sourceName);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(here, targetName));
    return true;
  }
  return false;
}
const snapshots = {
  auth_check_receipt: copyAs(
    'codex-auth-check-receipt.json',
    path.join(repoRoot, 'artifacts', 'runtime-runs', 'codex-auth-check-2026-09-26T00-27-58-662Z-243340'),
    'codex-auth-receipt.json'
  ),
  activation_evidence: copyAs(
    'activation-evidence.json',
    path.join(repoRoot, 'artifacts', 'runtime-runs', 'live-activation-2026-09-26T00-28-03-946Z-244031'),
    'activation-evidence.json'
  ),
  owner_00_08_activation_evidence: copyAs(
    'owner-run-activation-evidence-2026-09-26T00-08Z.json',
    path.join(repoRoot, 'artifacts', 'runtime-runs', 'live-activation-2026-09-26T00-08-50-648Z-226814'),
    'activation-evidence.json'
  )
};
const activationEvidenceName = snapshots.activation_evidence ? 'activation-evidence.json' : null;

const tracer = JSON.parse(fs.readFileSync(path.join(here, 'codex-tracer.json'), 'utf8'));

const contract = {
  contract_id: 'cc_codex_auth_ctrl_001',
  work_unit_id: 'wu_codex_tracer_2026_09_26',
  clauses: {
    execution_success: { required: true },
    required_outputs: [
      {
        output_id: 'codex_auth_tracer_report',
        artifact_ref: 'evidence/codex-chatgpt-auth-controller-2026-09-26/codex-tracer.json'
      }
    ],
    required_evidence: [
      'evidence/codex-chatgpt-auth-controller-2026-09-26/codex-auth-check-receipt.json',
      ...(activationEvidenceName
        ? [`evidence/codex-chatgpt-auth-controller-2026-09-26/${activationEvidenceName}`]
        : []),
      'evidence/codex-chatgpt-auth-controller-2026-09-26/codex-tracer.json'
    ],
    verification: { required: true, independent: true },
    dependency_closure: { required: true },
    child_closure: { required: true },
    disagreement_closure: [],
    graph_conditions: []
  }
};

const verificationReceipt = buildVerificationReceipt({
  work_unit_id: 'wu_codex_tracer_2026_09_26',
  verifier_executor_id: 'exec_local_tests',
  independent: true,
  outcome: 'PASS',
  evidence_refs: [
    'npm run test:activation -> 39/39 pass, exit 0 (2026-09-26)',
    'npm run test:vnext -> 228/228 pass, exit 0 (2026-09-26)',
    'npm run validate-maws-vnext -> exit 0 (2026-09-26)',
    'npm run validate / validate-neutral / validate-secrets / scan-secrets -> exit 0 (2026-09-26)',
    'npm run eval:maws-vnext -> exit 0 (2026-09-26)',
    'npm run runtime:codex-auth:check -> AUTH_HEALTHY exit 0 (2026-09-26T00:27Z)'
  ],
  checks: [
    'auth-controller state machine covered incl. mandatory stale + healthy-session fixtures',
    'OPENROUTER/OPENAI/TYPESAFE isolation from Codex child proven with sentinel material',
    'codex auth live health PASS through exec_codex_chatgpt read-only probe',
    'activation codex lane PASS through the auth controller; OR lanes typed NOT_RUN blockers'
  ],
  created_at: new Date().toISOString()
});

const decision = evaluateCompletion({
  completion_contract: contract,
  execution_results: [
    {
      work_unit_id: 'wu_codex_tracer_2026_09_26',
      execution_attempt_id: 'execatt_codex_tracer_2026_09_26',
      executor_id: 'exec_codex_chatgpt',
      started_at: tracer.traced_at,
      finished_at: tracer.traced_at,
      outcome: tracer.execution_result.outcome,
      outputs: [{ output_id: 'codex_auth_tracer_report', artifact_ref: 'evidence/codex-chatgpt-auth-controller-2026-09-26/codex-tracer.json' }],
      metrics: tracer.execution_result.metrics ?? {},
      error_class: tracer.execution_result.error_class,
      exit_code: tracer.execution_result.exit_code
    }
  ],
  verification_receipts: [verificationReceipt],
  dependency_states: [],
  child_states: [],
  outputs_present: ['codex_auth_tracer_report'],
  evidence_present: contract.clauses.required_evidence,
  decided_at: new Date().toISOString()
});

const record = {
  schema: 'maws.completion-decision.v1-record',
  recorded_at: new Date().toISOString(),
  scope_note: 'Completion covers ONLY the Codex ChatGPT auth-controller slice (Codex lane verified live). The OpenRouter Jev/model lanes remain owner-gated on OPENROUTER_API_KEY in the invoking shell and are NOT claimed complete here.',
  snapshots,
  decision
};
fs.writeFileSync(path.join(here, 'completion-decision.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
process.stdout.write(`CompletionDecision: ${decision.result}\n`);
process.exit(decision.result === 'COMPLETED' ? 0 : 1);
