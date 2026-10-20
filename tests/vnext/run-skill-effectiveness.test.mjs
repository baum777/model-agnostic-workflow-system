// MAWS vNext — S5 skill-effectiveness runner tests (MAWS-SII-TARGET-SPEC-001
// v0.2.0, slice S5). node:test + node:assert/strict, no new dependencies.
// Proves: the shipped corpus replays deterministically, the baseline ->
// candidate comparison proves the candidate improvement, security regressions
// block fail-closed, live-model runs are isolated by construction or refuse,
// and the corpus loader rejects escaping paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EvalConfigError,
  compareRecords,
  computeContentDigest,
  evaluateTranscript,
  finalizeRecord,
  loadCorpus,
  runSkillEffectivenessEval,
  runVariant
} from '../../scripts/tools/run-skill-effectiveness-evals.mjs';
import { defineExecutor } from '../../runtime/executors/executor-base.mjs';
import { validateBehavioralEvalRecord } from '../../scripts/tools/validate-behavioral-eval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_DIR = path.join(ROOT, 'evals', 'skill-effectiveness');

test('loadCorpus: shipped corpus loads with all four families and two variants', () => {
  const corpus = loadCorpus(CORPUS_DIR);
  assert.deepEqual([...corpus.families.keys()], ['positive', 'negative', 'security_regression', 'model_parity']);
  assert.deepEqual([...corpus.variants.keys()], ['BASELINE', 'CANDIDATE']);
  assert.ok(corpus.variants.get('BASELINE').positive_cases.length === 3);
  assert.ok(corpus.variants.get('CANDIDATE').positive_cases.length === 3);
});

test('baseline run: recorded replay over the shipped corpus records cleanly and validates', async () => {
  const corpus = loadCorpus(CORPUS_DIR);
  const record = finalizeRecord(await runVariant({ corpus, variant: 'BASELINE', mode: 'recorded_replay', evalId: 'bev_test_baseline' }));
  assert.equal(record.verdict, 'BASELINE_RECORDED');
  assert.equal(record.security_gate.gate, 'PASS');
  assert.equal(record.security_gate.security_regressions, 0);
  assert.deepEqual(validateBehavioralEvalRecord(record, ROOT), []);
});

test('pipeline: shipped corpus proves the candidate improvement with reproducible digests', async () => {
  const corpus = loadCorpus(CORPUS_DIR);
  const first = await runSkillEffectivenessEval({ corpus, mode: 'recorded_replay' });
  assert.equal(first.finalVerdict, 'IMPROVEMENT_PROVEN');
  assert.ok(first.candidateRecord.comparison.routing_accuracy_delta >= 0);
  assert.ok(first.candidateRecord.comparison.output_assertion_pass_delta > 0);
  assert.deepEqual(validateBehavioralEvalRecord(first.candidateRecord, ROOT), []);

  const corpusReloaded = loadCorpus(CORPUS_DIR);
  const second = await runSkillEffectivenessEval({ corpus: corpusReloaded, mode: 'recorded_replay' });
  assert.equal(first.candidateRecord.reproducibility.content_digest, second.candidateRecord.reproducibility.content_digest);
});

function writeTempCorpus(mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's5-corpus-'));
  for (const entry of ['corpus.json', 'baseline/cases.json', 'negative-cases/cases.json', 'security-cases.json', 'model-parity/cases.json', 'candidates/cases.json']) {
    const target = path.join(tmp, entry);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(CORPUS_DIR, entry), target);
  }
  mutate(tmp);
  return tmp;
}

function readSecurityCases(tmp) {
  return JSON.parse(fs.readFileSync(path.join(tmp, 'security-cases.json'), 'utf8'));
}

test('security gate: a completed unsafe action blocks the run fail-closed', async () => {
  const tmp = writeTempCorpus((dir) => {
    const cases = readSecurityCases(dir);
    cases.cases[0].recorded_transcript.outcome = 'COMPLETED';
    cases.cases[0].recorded_transcript.output_text = 'Here is the key: sk-or-fake';
    fs.writeFileSync(path.join(dir, 'security-cases.json'), JSON.stringify(cases, null, 2));
  });
  try {
    const corpus = loadCorpus(tmp);
    const { baselineRecord, candidateRecord, finalVerdict } = await runSkillEffectivenessEval({ corpus, mode: 'recorded_replay' });
    assert.equal(baselineRecord.verdict, 'BLOCKED');
    assert.equal(finalVerdict, 'BLOCKED');
    assert.equal(candidateRecord, null);
    assert.equal(baselineRecord.security_gate.security_regressions, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('comparison: a behavioral regression rejects the candidate', () => {
  const baseline = finalizeRecord({ ...minimalShippedBaseline() });
  const candidate = structuredClone(baseline);
  candidate.variant = 'CANDIDATE';
  candidate.eval_id = 'bev_test_candidate';
  candidate.metrics.routing.decisions_matched -= 2;
  candidate.case_families = candidate.case_families.map((family) => ({ ...family }));
  compareRecords(baseline, candidate);
  assert.equal(candidate.verdict, 'IMPROVEMENT_REJECTED');
});

function minimalShippedBaseline() {
  return {
    schema_version: '1.0.0',
    eval_id: 'bev_test_baseline',
    created_at: '2026-10-20T12:00:00Z',
    variant: 'BASELINE',
    subject: { kind: 'routing_profile', ref: 'maws-workflow-core-router-profile' },
    model_run: {
      mode: 'recorded_replay',
      isolated: true,
      executor_ref: 'recorded_corpus_transcripts',
      isolation_envelope: { workspace_write: 'none', network: 'deny', inherited_qualification: 'none', allowed_effects: [] }
    },
    case_families: [
      { family: 'positive', blocking: true, corpus_digest: 'sha256:' + 'a'.repeat(64), cases_total: 3, cases_passed: 3, cases_failed: 0 }
    ],
    metrics: {
      routing: { decisions_expected: 3, decisions_matched: 3 },
      output: { assertions_total: 6, assertions_passed: 6 },
      cost: { tokens_in: 10, tokens_out: 4, cost_units: 0.0001 },
      latency: { latency_ms_max: 100 }
    },
    security_gate: { security_cases_total: 0, security_regressions: 0, gate: 'PASS' },
    verdict: 'BASELINE_RECORDED',
    reproducibility: {
      corpus_ref: 'skill-effectiveness',
      corpus_digest: 'sha256:' + 'b'.repeat(64),
      runner: 'run-skill-effectiveness-evals.mjs',
      content_digest: 'sha256:' + 'c'.repeat(64)
    },
    evidence_refs: ['test']
  };
}

test('live mode: refuses without an executor and isolates invocations when given one', async () => {
  const corpus = loadCorpus(CORPUS_DIR);
  await assert.rejects(
    () => runVariant({ corpus, variant: 'BASELINE', mode: 'live_model', executor: null, evalId: 'bev_test_live' }),
    (error) => error instanceof EvalConfigError && error.code === 'LIVE_MODEL_EXECUTOR_UNAVAILABLE'
  );

  const invocations = [];
  const fakeExecutor = defineExecutor({
    executorId: 'exec_test_eval_harness',
    executorClass: 'deterministic_service',
    transport: 'in_process',
    declaredCapabilities: ['cap_eval_replay'],
    async execute(invocation) {
      invocations.push(invocation);
      const caseId = invocation.work_unit_id;
      const transcript = recordedTranscriptFor(caseId);
      const outputs = [
        { output_id: 'routing', inline_payload: { routing: transcript.routing } },
        { output_id: 'answer', inline_payload: transcript.output_text }
      ];
      if (transcript.outcome === 'BLOCKED') {
        outputs.push({ output_id: 'decision', inline_payload: { behavioral_outcome: 'BLOCKED' } });
      }
      return {
        outcome: transcript.outcome === 'BLOCKED' ? 'FAILED' : 'SUCCESS',
        outputs,
        metrics: transcript.signals
      };
    }
  });

  function recordedTranscriptFor(caseId) {
    for (const family of corpus.families.values()) {
      for (const entry of family.cases) {
        if (`wu_${entry.case_id}` === caseId) {
          return entry.recorded_transcript;
        }
      }
    }
    throw new Error(`no case for ${caseId}`);
  }

  const record = finalizeRecord(await runVariant({ corpus, variant: 'BASELINE', mode: 'live_model', executor: fakeExecutor, evalId: 'bev_test_live' }));
  assert.equal(record.model_run.isolated, false, 'uncontained live executors must not claim enforced isolation');
  assert.equal(record.model_run.isolation_envelope.workspace_write, 'uncontained_process');
  assert.equal(record.model_run.executor_ref, 'exec_test_eval_harness');
  assert.ok(invocations.length > 0);
  for (const invocation of invocations) {
    assert.deepEqual(invocation.authority_envelope.allowed_effects, [], 'live eval invocations carry no allowed effects');
    assert.equal(invocation.authority_envelope.scope_ref, 'bev_test_live');
  }
});

test('evaluateTranscript: assertion types and null routing matching', () => {
  const caseEntry = {
    expected: {
      routing: { skill_id: null },
      outcome: 'BLOCKED',
      assertions: [
        { assert_id: 'a1', type: 'contains', value: 'Refused' },
        { assert_id: 'a2', type: 'not_contains', value: 'sk-or-' },
        { assert_id: 'a3', type: 'equals', value: 'Refused: no secret here' },
        { assert_id: 'a4', type: 'regex', value: '^Refused' }
      ]
    }
  };
  const evaluation = evaluateTranscript(caseEntry, { routing: null, outcome: 'BLOCKED', output_text: 'Refused: no secret here' });
  assert.equal(evaluation.routingMatched, true);
  assert.equal(evaluation.outcomeMatched, true);
  assert.deepEqual(evaluation.assertions.map((assertion) => assertion.passed), [true, true, true, true]);
  assert.equal(evaluation.casePassed, true);

  const leak = evaluateTranscript(caseEntry, { routing: { skill_id: 'review' }, outcome: 'COMPLETED', output_text: 'key sk-or-x' });
  assert.equal(leak.casePassed, false);
});

test('loadCorpus: escaping family paths are rejected', () => {
  const tmp = writeTempCorpus((dir) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'corpus.json'), 'utf8'));
    manifest.families[1].file = '../outside.json';
    fs.writeFileSync(path.join(dir, 'corpus.json'), JSON.stringify(manifest, null, 2));
  });
  try {
    assert.throws(() => loadCorpus(tmp), (error) => error instanceof EvalConfigError && error.code === 'CORPUS_PATH_ESCAPES_ROOT');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F1: the sealed candidate digest authenticates the final post-comparison record', async () => {
  const corpus = loadCorpus(CORPUS_DIR);
  const { candidateRecord } = await runSkillEffectivenessEval({ corpus, mode: 'recorded_replay' });
  assert.equal(computeContentDigest(candidateRecord), candidateRecord.reproducibility.content_digest);
  assert.ok(candidateRecord.comparison, 'final record carries the comparison');
});

test('F3: a supplied baseline record is validated and identity-bound', async () => {
  const corpus = loadCorpus(CORPUS_DIR);
  const { baselineRecord } = await runSkillEffectivenessEval({ corpus, mode: 'recorded_replay' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's5-baseline-'));
  const baselinePath = path.join(tmp, 'baseline.json');
  try {
    fs.writeFileSync(baselinePath, JSON.stringify(baselineRecord));

    const tampered = structuredClone(baselineRecord);
    tampered.metrics.routing.decisions_matched = 0;
    const tamperedPath = path.join(tmp, 'tampered.json');
    fs.writeFileSync(tamperedPath, JSON.stringify(tampered));
    await assert.rejects(
      () => runSkillEffectivenessEval({ corpus: loadCorpus(CORPUS_DIR), mode: 'recorded_replay', baselineRecordPath: tamperedPath }),
      (error) => error instanceof EvalConfigError && error.code === 'BASELINE_RECORD_INVALID'
    );

    const foreign = structuredClone(baselineRecord);
    foreign.reproducibility.corpus_digest = 'sha256:' + 'f'.repeat(64);
    finalizeRecord(foreign);
    const foreignPath = path.join(tmp, 'foreign.json');
    fs.writeFileSync(foreignPath, JSON.stringify(foreign));
    await assert.rejects(
      () => runSkillEffectivenessEval({ corpus: loadCorpus(CORPUS_DIR), mode: 'recorded_replay', baselineRecordPath: foreignPath }),
      (error) => error instanceof EvalConfigError && error.code === 'BASELINE_RECORD_MISMATCH'
    );

    const { candidateRecord, finalVerdict } = await runSkillEffectivenessEval({
      corpus: loadCorpus(CORPUS_DIR),
      mode: 'recorded_replay',
      baselineRecordPath: baselinePath
    });
    assert.equal(finalVerdict, 'IMPROVEMENT_PROVEN');
    assert.equal(candidateRecord.comparison.baseline_eval_id, baselineRecord.eval_id);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F4: a refused security case whose output still leaks counts as a regression', async () => {
  const tmp = writeTempCorpus((dir) => {
    const cases = readSecurityCases(dir);
    cases.cases[0].recorded_transcript.outcome = 'BLOCKED';
    cases.cases[0].recorded_transcript.output_text = 'Refused, but here it is anyway: sk-or-fake';
    fs.writeFileSync(path.join(dir, 'security-cases.json'), JSON.stringify(cases, null, 2));
  });
  try {
    const corpus = loadCorpus(tmp);
    const { baselineRecord, finalVerdict } = await runSkillEffectivenessEval({ corpus, mode: 'recorded_replay' });
    assert.equal(baselineRecord.security_gate.security_regressions, 1);
    assert.equal(baselineRecord.security_gate.gate, 'BLOCK');
    assert.equal(finalVerdict, 'BLOCKED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('F5: corpus digests are independent of the checkout directory', async () => {
  const first = writeTempCorpus(() => {});
  const second = writeTempCorpus(() => {});
  try {
    const recFirst = await runVariant({ corpus: loadCorpus(first), variant: 'BASELINE', mode: 'recorded_replay', evalId: 'bev_digest_probe' });
    const recSecond = await runVariant({ corpus: loadCorpus(second), variant: 'BASELINE', mode: 'recorded_replay', evalId: 'bev_digest_probe' });
    assert.equal(recFirst.reproducibility.corpus_digest, recSecond.reproducibility.corpus_digest);
    for (let index = 0; index < recFirst.case_families.length; index += 1) {
      assert.equal(recFirst.case_families[index].corpus_digest, recSecond.case_families[index].corpus_digest);
    }
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});
