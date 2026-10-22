# MAWS — the evidence and reconciliation boundary closure

Date: 2026-10-22. This run closes the remaining evidence and reconciliation
boundaries of the merge-path enforcement and then activates the platform
protection. It does **not** functionally expand the merge executor:
`scripts/tools/merge-pr-executor.mjs` is untouched. The three boundaries and
the platform protection are:

1. **The direct-push boundary.** The attestation audit judged merge commits
   only; a commit pushed straight to the default branch — no pull request,
   no merge commit, no second parent — was invisible to it.
2. **The authority-matrix boundary.** The three tools of the merge-path
   family (`scan-source-security.mjs`, `merge-pr-executor.mjs`,
   `verify-merge-attestations.mjs`) had no row in
   `docs/authority-matrix.md`, whose edit forces the deliberate
   instruction-digest re-pin chain that two runs had deferred.
3. **The Registry reconciliation boundary.** Three Registry records still
   carried the sentence "The REST merge endpoint answers 404 on this
   repository, so the GraphQL mutation is the working path", which the
   incident evidence of 2026-10-21 disproved; the incident-closure run
   corrected one record and left the sweep as a residual for the Registry
   maintainer.
4. **The platform protection** (a separate pull request, after this one):
   a repository ruleset on `main` — pull requests required, force pushes
   and deletions blocked — which is the preventive counterpart of the
   audit's detective verdicts.

---

## 1. The direct-push class (boundary 1)

`scripts/tools/verify-merge-attestations.mjs` now walks **every** commit on
the first-parent line of the audited branch, not only the merge commits:

- a commit with **no parent** is the root and is not judged;
- a commit with **one parent** landed without a pull request. When the tree
  it landed on already carries the lifecycle-aware contract, it is the
  finding `DIRECT_PUSH_UNCOVERED` — no lane authorization can ever cover a
  landing that carries no merge. Before the contract it is a historical
  observation, exactly as for merges. A squash or a rebase merge has one
  parent too and lands in the same class **by design**: the audit's model
  of an attestable landing is a merge commit that carries the reviewed head
  among its parents;
- a commit with **two or more parents** keeps the merge classification of
  the first generation (scope, governance act, coverage).

The governance-act exemption is **not** extended to direct pushes: a
governance act is a *merge* confined to `core/authority/`; a direct push has
no pull request at all and is a finding even when it changes nothing but
the lane surface. A test binds exactly that.

### 1a. The audit found a real uncovered merge on the published main

Running the extended audit against the default branch produced **one real
finding**: the merge `b902130701bc5d784506a4044cb2880e0a86320a` — pull
request 90, the S9 disposition rebind (head
`5813a26fab045fad0325dc184ceae00ea8cd58ce`, base
`10de67a0bd5d2deb6abe510d2f53ec2d92025f5e`, merged 2026-10-22T15:16:54Z) —
landed **without a lane authorization that bound its head**. The base tree
carried the lane `s9-regression-rollback-20261022`, but that lane binds the
closure head `fff00e20fc2619ab411d28042e4cfa4f303eec15` and was already
consumed by the merge of pull request 78: it could not cover the rebind.
The rebind was executed under the first generation's practice — one lane,
several merges of the same branch — instead of the one-lane-one-merge
lifecycle of contract 1.1.0.

**The finding is real, it stands in the history, and it is not silently
accepted.** A retroactive lane cannot cover it (the audit reads the base
tree, and history is immutable), so the run adds the audit's **disposition
surface**: `core/authority/merge-audit-baseline.json`, landed as a
governance act. A baseline entry names a finding (code and commit), carries
a reason, a disposition and a date; a matching finding stays **visible in
the report** (`disposed_findings`) and only loses its gate-failing force. A
baseline entry that matches no current finding is **STALE** and fails the
gate — the disposition surface can never rot into an amnesty list. The
entry for `b902130` records the facts above and marks the disposition
`RECORDED_AS_REAL_FINDING`; the formal acceptance of that landing belongs
to the owner of the S9 lane, not to this run.

The published main was already red under the *old* audit for the same
merge: the enforcement worked, and this run gives its verdict a place to be
recorded instead of suppressed.

## 2. The authority-matrix rows and the instruction-digest re-pin (boundary 2)

`docs/authority-matrix.md` gains three rows —
`scripts/tools/scan-source-security.mjs` (validator-backed),
`scripts/tools/merge-pr-executor.mjs` (runnable) and
`scripts/tools/verify-merge-attestations.mjs` (validator-backed) — with the
tool-table columns the matrix defines (kind, doc class `n/a`, enforcement
status, enforcement alias, description).

Editing the matrix moves the **effective instruction digest**, because the
matrix is a canonical instruction source. The drift was measured, not
assumed: `npm run test:vnext` dropped from 825 to **17 failures**
(`NO_ELIGIBLE_EXECUTOR` — the qualification fingerprints no longer matched
the instruction state). The deliberate re-pin chain was then executed end
to end:

| Surface | Change |
|---|---|
| `runtime/cli/specs/reference-audit-v1.json` | `scripts/tools/requalify-run-spec.mjs --write` re-bound 12 qualification fingerprint digests to the derived digest `sha256:5bd3d8cd…` |
| `runtime/harness-context/profiles/model-adaptive/profiles/*.json` | the six model-adaptive profiles re-pinned from `sha256:2d68db2a…` to the re-derived digest `sha256:95dd981a…` |
| `tests/vnext/executor-model-profile.test.mjs` | the committed `PINNED_DIGEST` constant re-pinned with them |
| `evals/fixtures/maws-vnext/executor-model-profile.contracts.json` | 29 pinned digest strings updated and **7 fingerprint digests recomputed** through the canonical `computeFingerprint` (sha256 over the canonical JSON of the components) |
| `evals/experiments/ho01-local-optimization/experiment.json` | the frozen input digest of the reference spec re-frozen to the requalified spec's hash |
| `evidence/local-optimization-comparison-2026-10-21/` | the comparison re-executed and re-frozen (the runner refuses silent reuse; the old bundles were removed and regenerated); `validate-experiment-comparison` PASS, verdict unchanged (`IMPROVEMENT_REJECTED`, `output_assertion_pass_delta` −0.1875). The run record `RUN.md` and the `registry-disposition.json` of that evidence are the historical record of the original run and were restored unchanged |

After the re-pin: **825 of 825** pass. The hand-maintained artifacts of the
HO-01 evidence were accidentally removed by the regeneration and restored
from the published history before anything was committed.

## 3. The Registry sweep (boundary 3)

Three Registry records carried the false sentence —
`MAWS_HO01_LOCAL_OPTIMIZATION_COMPARISON_2026_10_21_001`,
`MAWS_SKILL_IMPROVEMENT_PROPOSAL_2026_10_21_001` and
`UNITERA_SYSTEMS_RUNTIME_QUALIFICATION_2026_10_20_001`. The correction is
published as a Registry change in its own right (the sweep, the dated
annotations and the registration of this run ride together): each record
keeps its own mechanism claim — its merge **was** executed through the
GraphQL mutation as recorded — and gains a dated correction of the general
statement about the REST endpoint, which the incident evidence disproved
(a PUT on the already-merged pull request 68 answered
`{"sha":"df8c683e…","merged":true}`). The already-corrected
`MAWS_SOURCE_SECURITY_SCAN_2026_10_21_001` is the pattern; nothing else in
those records is rewritten.

## 4. Verification (all LOCAL)

| Gate | Result |
|---|---|
| `npm run test:vnext` | **825 of 825** pass (before the re-pin: 17 failures — the drift this boundary is about) |
| `npm run test:merge-attestation` | **23 of 23** pass (15 of the first generation + 8 new: the direct-push class, the governance-act refusal for direct pushes, the baseline disposal, the stale and malformed baseline, the exact-match rule) |
| `npm run test:merge-executor` | 89 of 89 pass (the executor is untouched by this run) |
| `npm run test:merge-lane-contract` | 21 of 21 pass |
| `npm run validate`, `validate-neutral`, `validate-maws-vnext`, `validate:assurance-run -- --all`, `eval:maws-vnext`, `eval:secret-boundary`, `eval:provider-export-alignment`, `validate-experiment-comparison`, `validate-executor-model-profile`, `baum:ci-gate` | all PASS, zero issues |
| `node scripts/tools/scan-source-security.mjs` | PASS, 245 files analysed, required coverage 4 of 4 |
| **3 reverted mutation probes** | **3 of 3 BOUND** — the direct-push finding, the baseline disposal and the stale-baseline rule each break their designed test when neutered; the source was verified byte-identical afterwards |
| `npm run merge:audit` | **FAIL on the published main before this change lands — by design**: the S9 finding (§1a) is real, the baseline that records it lands with this change, and the audit passes from the merge of this pull request on |

## 5. The transition lane

The lane of this pull request demands eight local gates — `validate`,
`validate-maws-vnext`, `validate-executor-model-profile`,
`validate-experiment-comparison`, `test:vnext`, `test:merge-executor`,
`test:merge-attestation`, `test:merge-lane-contract` — and deliberately
**not** `merge:audit`: the audit of the published main is red with the
real S9 finding until the baseline lands with this very merge. The next
lane can demand `merge:audit` again, and does.

## 6. Limits — what this run does NOT claim

- **The audit stays detective.** The preventive counterpart is the platform
  protection of the follow-up pull request; until it is active, a direct
  push is still *possible* — it is no longer *invisible*.
- **No hosted CI result is claimed.** The account's Actions admission is
  closed account-wide (billing lock); every measurement above is a local
  run under Node v24.19.0.
- **The disposition of the S9 finding is recorded, not accepted.** The
  baseline entry states the facts; the formal acceptance of that landing
  belongs to the owner of the S9 lane.
- **The external deep scan produced no complete conclusion** for these
  pushes (`scanner_enobufs`); no security claim is derived from it.
- **The merge executor is functionally frozen** in this run, as directed:
  `scripts/tools/merge-pr-executor.mjs` and its contract are untouched.
