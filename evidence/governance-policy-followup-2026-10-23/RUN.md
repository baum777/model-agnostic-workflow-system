# Governance Policy Follow-up Run — 2026-10-23

**Disposition: READY_FOR_OWNER_ADOPTION (prepared, not activated).**
Global governance remains **DEGRADED** until the authorized policy
adoption and its subsequent verification. No `GLOBAL_PASS` is claimed
anywhere in this run; the live admission gate reports FAIL by design until
the owner adopts.

## 1. Objective

Prepare the closure of the audit-baseline laundering vulnerability without
retroactive authorization, history rewriting or a weakening of the current
merge enforcement: formalize the adoption-anchor policy at commit
`0fd89d9` as a PENDING owner decision, implement and test the
anti-laundering semantics, separate the immutable historical compliance
verdict from the current admission verdict, re-classify PR #90 and PR #107
with exact evidence, and register the whole change across the triad.

## 2. Fresh baseline (verified 2026-10-23)

| surface | head | state |
| --- | --- | --- |
| MAWS `main` | `bcfcdce34a61a937f28b1a06620025fb67a4bd47` | no foreign activity since the governance integrity closure run; 0 open pull requests |
| Registry `main` | `2c61256d01f4f2736592fdf557ca13cf96cd6d7a` | 0 open pull requests |
| Atlas `main` | `fae54ea5938f7f96fdc078525dc251c7b88b783c` | 0 open pull requests |

* `merge:audit` at `bcfcdce` under the PREVIOUS semantics: `status: PASS`
  with both findings visible and disposed (Run C final readback,
  `evidence/governance-integrity-closure-2026-10-22/merge-audit-full-report.json`).
* `merge:audit` at `bcfcdce` under THIS change's semantics: `baseline
  adoption: pending`, both findings `pending_adoption`, `historical
  compliance: FAIL (2/0/2)`, `admission: FAIL (2)` — see
  `merge-audit-at-baseline.log`.
* Lane lifecycles: 11 lane records; 9 closed+consumed, 2 foreign lanes
  dangling `active`+`consumed` (`boundary-closure-20261022`,
  `s10-cross-model-optimization-20261022`) — examined in
  `dangling-lane-examination.md`, untouched by this run.
* The executor and the lane authorization contract are unchanged by this
  run (change set touches the audit tool, its tests, the changelog and
  this evidence only).

## 3. What this change does

1. **The anchor contract** (`scripts/tools/verify-merge-attestations.mjs`):
   the baseline may carry `adoption_anchor` (40-hex). The audit reads the
   baseline file's own version history; an anchor that resolves nowhere or
   postdates the adoption act is `BASELINE_ANCHOR_INVALID`, every later
   value change is `BASELINE_ANCHOR_MUTATED`.
2. **Fail-closed pending**: without an adopted anchor every recorded
   finding keeps its full gate-failing force (`pending_adoption`).
   Pending approval is not granted authority — this is the state the two
   foreign records are in from the moment this change lands.
3. **Pre-anchor-only eligibility**: an adopted anchor suspends a record's
   force only when the finding's landing predates the anchor (anchor is
   not an ancestor of the finding commit); post-anchor records are
   `ineligible` and block forever.
4. **The dual verdict**: the report separates immutable
   `historical_compliance` (FAIL while ANY violation is recorded) from
   `admission` (the gate, exit-code-driving). A disposition can never turn
   the historical verdict green again.

The live baseline `core/authority/merge-audit-baseline.json` is UNTOUCHED
— no anchor is set by this change.

## 4. Anti-laundering controls (12 new tests, 34/34 green)

`tests/tools/merge-attestation-audit.test.mjs`:

| control | test |
| --- | --- |
| pending is not force | `a recorded finding blocks the gate while the baseline has no adopted anchor` |
| eligible disposal + dual verdict | `an adopted anchor disposes a finding that predates it, and the historical verdict still fails` |
| post-anchor is never disposable | `a finding that postdates the adopted anchor is never disposable` |
| unresolvable anchor | `an anchor that resolves to no commit invalidates the baseline` |
| anchor must lie on the audited line | `an anchor that does not lie on the audited line is not adoptable` |
| **structural cap (review hardening)** | `an anchor may not postdate the disposition surface itself` |
| **cap positive control** | `the disposition surface introduction commit is itself a legal anchor` |
| anchor is immovable | `a moved anchor is a mutation finding and loses all force` |
| removal returns to pending | `a removed anchor returns the baseline to a state without force` |
| removal visibility | `a removed and readopted anchor is reported` (`adoption_removals`) |
| malformed anchor value | `a malformed adoption_anchor value fails the gate` |
| lane-level findings not disposable | `a lane-reuse finding carries no commit and is never disposable` |

One foreign test (`a recorded finding is reported and does not fail the
gate`) was updated to carry an adopted anchor: under the policy this run
implements, its old fixture (a force-bearing unadopted baseline) is
exactly the laundering shape the policy forbids. All other foreign tests
pass unchanged.

### 4.1 Independent review round (before the merge)

An independent reviewer examined the full diff, re-ran the suite and the
live audit, and probed the anchor state machine in scratch repositories.
Findings and dispositions:

* **P2 — anchor latitude (REPAIRED in this change).** The first adoption
  could originally have named an anchor that postdates a pending-window
  violation (on the published main: an anchor at `9d009cc` would have made
  the S10 finding `71655312` retroactively eligible, because `9d009cc` is
  not an ancestor of it). The mechanism now caps the anchor at the
  disposition surface's own introduction commit — an anchor that postdates
  it is `BASELINE_ANCHOR_INVALID`, bound by two tests (negative + the
  introduction-commit-is-legal positive control). The eligibility window
  is structurally capped at the mechanism in every state.
* **P2 — evidence asserted this run's lane as closed before it existed
  (CORRECTED).** The lane record is created by a separate governance act
  after these evidence commits; the wording now says planned, not done.
* **P3 — `isAncestor` fail-open edge in the eligibility check (REPAIRED).**
  Eligibility now runs through `anchorPredates`, which verifies both
  commits resolve before granting force; an unresolvable input is
  ineligible, never disposed.
* **P3 — anchor removal not sticky (SURFACED).** Remove + re-add of the
  same value restores the same eligibility boundary and extends nothing;
  the removal is now visible in the report (`adoption_removals`), bound by
  a test.
* **P3 accepted (documented, not changed).** Matched findings in
  invalid/mutated/removed baselines all carry the label
  `pending_adoption`; the `baseline_adoption` field carries the precise
  state. The pre-existing foreign baseline entry states PR #107's merge
  time one second off (16:55:54Z vs the committer date 16:55:53Z) — the
  foreign file is untouched, and this run's classification table states
  the correct value.

## 5. Regression: PR #90 and PR #107, separately classified

Exact evidence in `classification-pr90-pr107.md` (and machine-checked
ancestry in `baseline-verification.json`):

* **PR #90** — merge `b9021307…` (S9 disposition rebind, head `5813a26f…`,
  base `10de67a0…`, merged 2026-10-22T17:16:54+02:00):
  `MERGE_NOT_COVERED`. PRE-anchor (anchor `0fd89d9…` is not its
  ancestor) → ELIGIBLE for disposition under an adopted anchor.
* **PR #107** — merge `71655312a…` (S10 disposition rebind, head
  `1f68c47c…`, base `05b0f80c…`, merged 2026-10-22T18:55:53+02:00):
  `MERGE_NOT_COVERED`. POST-anchor (anchor `0fd89d9…` IS its ancestor)
  → INELIGIBLE forever; under Option B it is the one live gate finding
  after adoption.

Executor refusal guards re-proved at this head (receipts:
`probe-absent.receipt.json`, `probe-identity.receipt.json`):

* `MERGE_LANE_AUTHORIZATION_ABSENT` — a lane that does not exist on the
  base tip refuses before anything else.
* `MERGE_PR_IDENTITY_MISMATCH` — asking the S10 lane for pull request 107
  refuses: "the merge target is pull request 107 but the lane
  s10-cross-model-optimization-20261022 owns pull request 100". The exact
  merge that landed uncovered is refused by today's executor.

## 6. The expected live state after this change merges

`merge:audit` on main will report, until the owner adopts:

```
baseline adoption: pending
historical compliance: FAIL — 2 violation(s) recorded, 0 disposed, 2 live
admission: FAIL — 2 blocking finding(s)
```

This is the honest representation of a policy that is proposed but not
adopted: the CI step "Merge path attestation audit (the enforcement)" will
be red on main, and every future lane that demands `merge:audit` blocks on
it. That is by design — the laundering vector is closed fail-closed, and
the only way back to a green gate is the owner's own adoption act (plus
the owner's separate decision on the S10 finding, which stays live under
Option B). No lane of this run demands `merge:audit` as a local gate; the
reason is recorded in the lane authorization that authorizes this merge
(created by a separate governance act after these evidence commits).

## 7. Invariants held

* No history rewrite, no retroactive authorization, no hidden exemption:
  the historical verdict cannot be made green by anything this change or
  the baseline can do.
* No self-disposition: the two existing records LOSE their force with this
  change (pending), and the run itself records no baseline entry.
* No weakening: executor, lane contract and admission guards untouched
  and re-proved by live refusal probes; the DIRECT_PUSH class stays.
* Foreign lanes untouched: both dangling lifecycles remain exactly as
  found; S5/S8/S9 implementation scopes untouched.
* Local CI is not hosted CI: hosted CI remains NOT_VERIFIED (billing
  lock); all measurements are LOCAL_REPLICATION.

## 8. Residuals and required owner decisions

1. **Adopt or reject the proposal** in `adoption-proposal.md`
   (adopt anchor `0fd89d9…` / B′ exception contract / reject).
2. **The S10 finding `71655312`** — live under Option B after adoption;
   B′ or remediation is the owner's separate decision.
3. **The two dangling foreign lane lifecycles** (boundary-closure, S10) —
   closing them is a foreign/owner act, not this run's.
4. **Hosted CI account lock** — unchanged; every gate in this run is a
   local replication.

## 9. Registry and Atlas

* Registry: change registration record
  `GOV_POLICY_FOLLOWUP_2026_10_23_001.yaml` (object side NO_CHANGE — the
  audit tool and the baseline are registered in no structured Registry
  catalog, only in historical run records, whose statements remain true of
  their own commits).
* Atlas: representation claim
  `claims-post-maws-governance-policy-followup-2026-10-23.yaml`.
* Both legs are merged and read back after the owner-repository merge;
  their commit shas are bound in the Registry record and the Atlas claim.
