# Behavior Checks — What This Is and Is Not

Twenty-seven targeted cases (8 positive, 19 negative) executed by the reviewing agent against
committed fixture inputs, one per rule the eight complement skills (waves 1–5) are
supposed to enforce.

## Hand-authored vs. agent-executed (provenance, wave 5 onward)

Two artifact classes must not be conflated:

- **Hand-authored:** the skill artifacts themselves and every case *input* under
  `cases/` — planning fixtures, labeled as such in their file headers.
- **Agent-executed:** every case *output* under `outputs/` — produced by the session
  agent applying the skill to the input. From wave 5 on, model, invocation, skill
  digest, input/output paths and per-file status are recorded in the wave's
  `execution-record.json`.

Provenance precision (corrected 2026-10-29):

- **Hashes prove file integrity only** — a sha256 over committed bytes is not, by
  itself, evidence that a model produced those bytes; the execution claim rests on
  the invocation metadata in the execution record plus the session transcript.
- **A green checker run proves only that the assertions encoded in
  `check-behavior.mjs` are fulfilled by the stored bytes** — structural
  conformance evidence, not a model-behavior or output-quality result.
- Outputs are labeled per file: `VERBATIM_NEVER_EDITED` (first-pass bytes are the
  committed bytes) or `EDITED_AFTER_EXECUTION` (final revision; original first-pass
  bytes lost where the file was overwritten in place — each loss is documented
  explicitly in the record, never papered over). `VERBATIM_NEVER_EDITED` is claimed
  only where a recording of the original output exists — single-version git history
  from the initial commit or a verbatim-committed re-execution; where no such
  recording exists, the output is marked NOT_INDEPENDENTLY_VERIFIED instead. Every
  verbatim claim remains bounded by executing-agent attestation plus transcript
  corroboration; none is independently witnessed.
- Fresh re-executions (same model, same skill digest, same input) live under
  `reexec/` and are committed verbatim, never edited — wave 4 under `reexec/wave4/`
  (added 2026-10-29), wave 5 under `reexec/wave5/`.

**Is:** a reproducible structural + marker verification that each committed output
(a) contains every section required by the skill's output contract, (b) names the
expected findings/verdicts and cites the supplied evidence, and (c) contains none of
the forbidden normalization language (acceptance of violations, fabricated analyzer
output such as plan text for a query that was never explained).

**Is not:** an S5 behavioral-eval record (`core/contracts/behavioral-eval.schema.json`
expects a BASELINE/CANDIDATE comparison with model-run metrics — not fabricable here
and not claimed), not SkillEvaluator Tier 3 live evaluation, and not authority of any
kind. The reviewer-executed outputs are evidence of workflow conformance, nothing more.

## Hand-authored vs. agent-executed (provenance)

- **Hand-authored:** the skill artifacts themselves and every case *input* under
  `cases/` — planning fixtures, labeled as such in their file headers.
- **Agent-executed:** every case *output* under `outputs/` — produced by the session
  agent applying the skill to the input in a single execution pass. Wave-4 outputs
  carry the execution header inline; their per-case record, recording basis, and
  fresh verbatim re-executions live in
  `evidence/skill-frontdoor-complements-wave4-20261028/execution-record.json`.

Semantics, stated precisely: hash equality proves identical stored bytes — nothing
more. A green checker run proves only that the assertions encoded in it are
fulfilled by the stored bytes. Neither is evidence that a model produced the bytes;
the execution claim rests on the recorded invocation metadata plus the session
transcript. `VERBATIM_NEVER_EDITED` is claimed only where a recording of the
original output exists (single-version git history or a verbatim-committed
re-execution); where no such recording exists, the output is marked
EDITED_AFTER_EXECUTION or NOT_INDEPENDENTLY_VERIFIED instead.

## Re-run

```bash
node evidence/skill-frontdoor-complements-20261028/behavior/check-behavior.mjs
```

Exit 0 expected; `results.json` is the machine-readable record. The checker was
mutation-probed during review (wave 1, at 10 cases): appending acceptance language to a
negative-case output flips exactly that case to FAIL (`must-not-contain`); restore returns
to all-pass. The coverage-closure block (added during the wave-1 review) exits 2 on any drift
between declared cases, input dirs, and outputs — the count above is enforced, not narrated.

## Case map

| Case | Class | Proves |
|---|---|---|
| api-contract-review.pos-standard | positive | full-section contract review of a realistic OpenAPI delta; rename/tenant-scoping breaks identified; no validation pass claimed |
| api-contract-review.neg-undocumented-write | negative | persistent write inside a declared GET is REJECTED, not normalized |
| api-contract-review.neg-missing-auth-failures | negative | absent tenant/auth failure surfaces yield BLOCKED with gaps, never "covered" |
| authorization-boundary-review.pos-standard | positive | principal/scope/control-point mapping incl. explicit DTO-projection boundary; UNVERIFIED used honestly |
| authorization-boundary-review.neg-token-in-url | negative | DR-019 class flagged with RFC 9700 reference and prescribed remedy |
| authorization-boundary-review.neg-unprojected-user | negative | DR-020 class flagged; absent projection boundary is the defect |
| authorization-boundary-review.neg-unknown-principal | negative | default-deny inversion reported, compatibility rationale not accommodated |
| data-access-performance-review.pos-standard | positive | supplied plan interpreted (filter after index scan); read-only posture explicit |
| data-access-performance-review.neg-missing-explain | negative | missing evidence → BLOCKED + measurement plan; no invented plan text (must-not markers assert absence of EXPLAIN-shaped output) |
| data-access-performance-review.neg-side-effecting-function | negative | side-effecting calls separated and priced; destructive prune identified as the real risk |
| frontend-performance-review.pos-standard | positive | waterfall/bundle evidence read without profiling runs; measurement plan instead of scores |
| frontend-performance-review.neg-no-profiling-evidence | negative | missing profiling evidence → BLOCKED; no invented performance numbers |
| frontend-performance-review.neg-claimed-lighthouse | negative | unverified vendor Lighthouse narrative → BLOCKED as narrative numbers |
| state-consistency-review.pos-standard | positive | ownership map with explicit server authority; onSettled rollback path verified |
| state-consistency-review.neg-optimistic-without-rollback | negative | optimistic update without recovery is a FINDING, not a style choice |
| state-consistency-review.neg-ambiguous-ownership | negative | ambiguous cache ownership flagged; server as authority required before GAPS close |
| research-reproduction-review.pos-standard | positive | stated results vs. reproducible evidence separated; bounded protocol with pre-agreed failure criteria |
| research-reproduction-review.neg-claim-without-method | negative | claim without method → BLOCKED; no invented reproduction score |
| research-reproduction-review.neg-unsafe-runner | negative | runner bypassing sandbox/approvals by default → governance FINDING citing DR-002 |
| search-discoverability-review.pos-standard | positive | dated crawl evidence drives indexability/content findings; actions are crawl-verifiable, never outcome promises |
| search-discoverability-review.neg-guarantee-request | negative | ranking/traffic/AI-answer guarantees refused; no projection table without evidence |
| search-discoverability-review.neg-bulk-publish-paid-api | negative | unscoped paid-API use and bulk auto-publish refused; read-only review posture enforced |
| user-research-plan.pos-standard | positive | observed evidence (with sources) kept distinct from hypotheses H1–H3; neutral questions, recorded consent, P01–P0n pseudonyms, no direct identifiers, decision rules fixed in advance |
| user-research-plan.neg-fabricated-findings | negative | request to draft personas/quotes/'pilot study' findings → BLOCKED; hypotheses never restated as findings; honest deck alternative offered |
| user-research-plan.neg-inferred-consent-pii | negative | inferred consent ('they're our customers'), CRM/per-user-data upload, and LinkedIn enrichment all refused; consent requires explicit recorded opt-in |

## Closure follow-up — 2026-10-28

Current closure candidate: 21 cases, with 1:1 declared/input/output coverage.
The original wave-1 ten-case table above is retained as history. Wave-2 and wave-3
fixtures remain present. Added independent DR-002 cases:

- neg-sandbox-bypass: sandbox disabled, approvals required → blocking sandbox finding.
- neg-approval-bypass: sandbox enabled, approvals bypass → blocking approval finding.

The combined unsafe-runner case is retained. These are reviewer-output/skill-rule
checks; no runner, paper code or artifact is executed and no technical enforcement
claim follows. Canonical selection is checked separately in
`tests/vnext/research-reproduction-selection.test.mjs`.
