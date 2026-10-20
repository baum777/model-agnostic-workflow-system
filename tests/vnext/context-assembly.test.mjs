// MAWS vNext — S6 context-assembly eval tests (MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S6). Proves the eval's structural properties P1-P4 over this
// repository's real instruction tree and its corpus scenarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateContextAssembly } from '../../scripts/tools/run-context-assembly-evals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('context-assembly eval: reduction, retention, eligibility and determinism proven over the real tree', () => {
  const { failures, assembled } = evaluateContextAssembly();
  assert.deepEqual(failures, [], `eval failures: ${failures.join('; ')}`);

  const baseline = assembled.get('ca_full_context_baseline');
  const candidate = assembled.get('ca_reduced_candidate');
  const blocked = assembled.get('ca_missing_required_context');

  assert.ok(baseline.bundle.eligible_for_execution);
  assert.ok(candidate.bundle.eligible_for_execution);
  assert.ok(
    candidate.selected_source_count < baseline.selected_source_count,
    `candidate ${candidate.selected_source_count} must be smaller than baseline ${baseline.selected_source_count}`
  );
  assert.equal(candidate.bundle.conflicts.length, 0);
  assert.equal(blocked.bundle.eligible_for_execution, false);
  assert.equal(blocked.bundle.conflicts[0].kind, 'missing_required_context');
});
