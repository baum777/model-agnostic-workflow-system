// §46 OpenRouter model tracer — direct OpenRouter model executor with
// requested-vs-served verification, no hidden fallback. Fails closed when
// OPENROUTER_API_KEY or MAWS_OPENROUTER_MODEL is absent (records NOT_RUN
// with the typed blocker). Run: OPENROUTER_API_KEY=...
// MAWS_OPENROUTER_MODEL=z-ai/glm-4.7 node run-openrouter-model-tracer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOpenRouterExecutor } from '../../runtime/executors/openrouter-executor.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const here = path.dirname(fileURLToPath(import.meta.url));

function write(record) {
  fs.writeFileSync(path.join(here, 'openrouter-model-tracer.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

const keyPresent = typeof process.env.OPENROUTER_API_KEY === 'string' && process.env.OPENROUTER_API_KEY.length > 0;
const modelId = process.env.MAWS_OPENROUTER_MODEL ?? null;
if (!keyPresent || !modelId) {
  write({
    schema: 'maws.openrouter-model-tracer.v1',
    traced_at: new Date().toISOString(),
    status: 'NOT_RUN',
    blockers: [
      ...(keyPresent ? [] : ['OPENROUTER_API_KEY_MISSING']),
      ...(modelId ? [] : ['MAWS_OPENROUTER_MODEL_MISSING'])
    ],
    note: [
      'Owner re-run: export OPENROUTER_API_KEY and MAWS_OPENROUTER_MODEL in the invoking shell.',
      'Catalogue-verified 2026-09-26: the live OpenRouter /api/v1/models catalogue lists',
      "'z-ai/glm-4.7' (z-ai, hyphenated) and does NOT contain 'zai/glm-4.7'; the owner's",
      '2026-09-26T00:08Z activation run used zai/glm-4.7 and the model lane answered',
      'HTTP 400 OR_BAD_RESPONSE — consistent with an unknown-model slug, not a MAWS regression.'
    ].join(' ')
  });
  process.stdout.write('NOT_RUN (credential/model env missing in agent shell)\n');
  process.exit(0);
}

const executor = createOpenRouterExecutor({ modelId, env: process.env });
const result = await executor.execute({
  work_unit_id: 'wu_openrouter_tracer_2026_09_26',
  node_id: 'node_openrouter_tracer',
  context_package: {
    objective: 'Read-only MAWS model-executor tracer. Return a one-sentence acknowledgement. Do not request tools, secrets, writes, or broader scope.',
    bounded_payload: { tracer: 'openrouter_model_readonly', mutation_allowed: false },
    provenance_refs: ['MAWS_VNEXT_OPENROUTER_TRACER_2026_09_26']
  },
  authority_envelope: { scope_ref: 'scope_openrouter_tracer_readonly', allowed_effects: ['ephemeral'] },
  timeout_ms: 30000
});

const substitution = result.flags?.model_substitution === true;
const record = {
  schema: 'maws.openrouter-model-tracer.v1',
  traced_at: new Date().toISOString(),
  status: result.outcome === 'SUCCESS' && !substitution ? 'PASS' : 'BLOCKED',
  requested_model: modelId,
  served_model: result.flags?.served_model ?? modelId,
  model_substitution: substitution,
  execution_result: {
    outcome: result.outcome,
    error_class: result.error_class ?? null,
    metrics: result.metrics,
    flags: result.flags ?? null
  }
};
write(record);
process.stdout.write(`${record.status}: ${result.outcome} served=${record.served_model}\n`);
process.exit(record.status === 'PASS' ? 0 : 1);
