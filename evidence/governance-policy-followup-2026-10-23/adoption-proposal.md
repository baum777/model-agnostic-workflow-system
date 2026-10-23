# ADOPTION PROPOSAL — the merge-audit disposition baseline under an adoption anchor

**Status: PREPARED, PENDING OWNER APPROVAL, NOT ACTIVATED.**

This document formalizes Option B of the owner decision prepared by the
governance integrity closure run
(`evidence/governance-integrity-closure-2026-10-22/owner-decision.md`).
The mechanism it describes is implemented and tested by this change; the
policy itself is NOT active. No anchor is set, no baseline entry gains
force, and `merge:audit` on main reports `admission: FAIL` with both
recorded findings live until the owner adopts. Pending approval is not
granted authority.

## 1. What is proposed for adoption

One owner act: a governance-act change to
`core/authority/merge-audit-baseline.json` that adds the single field

```json
"adoption_anchor": "0fd89d99fac3cf027880dfe2b13b0140a2a0b4fd"
```

to the baseline object (keeping `known_findings` exactly as published).
That one field activates the policy this change implements:

* **Eligibility.** A recorded finding loses its gate-failing force only
  when its landing PREDATES the anchor — the anchor is not an ancestor of
  the finding's commit. A finding that postdates the anchor is
  `ineligible` and blocks the gate forever. A violation that lands after
  the policy exists can never be recorded away.
* **The structural cap.** The anchor may not postdate the disposition
  surface's own introduction commit: an adoption naming a later anchor is
  refused with `BASELINE_ANCHOR_INVALID` ("postdates the disposition
  surface"). The eligibility window is therefore capped at the mechanism
  itself in ALL cases — no anchor value, and no first-adoption choice, can
  ever extend disposability past the moment the policy's instrument came
  into existence. (This cap was added by this run's independent review
  round: without it, a first adoption could have named a later anchor and
  made the S10 finding retroactively eligible inside the mechanism.)
* **Immovability.** The anchor is adopted once. The audit walks the
  baseline file's own version history: any later change of the value is
  the finding `BASELINE_ANCHOR_MUTATED`; an anchor that resolves nowhere,
  or that postdates the adoption act (is not an ancestor of the first
  commit carrying an anchor), is `BASELINE_ANCHOR_INVALID`. Removing the
  anchor returns every record to the pending, force-less state, and a
  later re-adoption of the SAME value restores exactly the same
  eligibility boundary — it extends nothing, and the removal stays
  visible in the report (`adoption_removals`).
* **Fail-closed pending.** Without an adopted anchor — and for every
  ineligible, stale, malformed or mutated record — every recorded finding
  keeps its full gate-failing force and is reported as `pending_adoption`.
* **The dual verdict.** The report separates `historical_compliance`
  (immutable; FAIL as long as ANY violation is recorded in the audited
  history — a disposition ADMITS a violation, it never converts the
  landing into a compliant merge) from `admission` (the gate; the exit
  code follows it alone).

The anchor value is the merge commit of pull request 98 — the commit that
introduced the disposition mechanism itself (2026-10-22T18:18:15+02:00).
Anchoring there draws the eligibility line exactly at the moment the
policy's own instrument came into existence: everything the mechanism
could have observed before it existed is dispositionable history;
everything after it is subject to the rule it enforces.

## 2. Verified anchor facts (measured 2026-10-23, main at `bcfcdce`)

| fact | value | how verified |
| --- | --- | --- |
| anchor commit | `0fd89d99fac3cf027880dfe2b13b0140a2a0b4fd` | `git rev-parse 0fd89d9^{commit}` |
| anchor identity | Merge pull request #98 from `evidence/boundary-closure-20261022` | `git log -1` |
| anchor committer date | 2026-10-22T18:18:15+02:00 | `git log -1 --format=%cI` |
| PR #90 finding (`b902130…`) | merged 2026-10-22T17:16:54+02:00 — **pre-anchor** | `git merge-base --is-ancestor 0fd89d9 b902130` fails (anchor is NOT an ancestor) |
| PR #107 finding (`71655312…`) | merged 2026-10-22T18:55:53+02:00 — **post-anchor** | `git merge-base --is-ancestor 0fd89d9 71655312` succeeds (anchor IS an ancestor) |

Both ancestry results are re-derivable from the published history; the
proposal depends on no dates, only on topology.

## 3. Expected states (machine-derived semantics, bound by tests)

| state | `b902130` (PR #90, S9 rebind) | `71655312` (PR #107, S10 rebind) | `admission` | `historical_compliance` |
| --- | --- | --- | --- | --- |
| this change landed, no anchor (NOW) | `pending_adoption` — blocking | `pending_adoption` — blocking | FAIL (2) | FAIL (2 recorded / 0 disposed / 2 live) |
| **after adoption of `0fd89d9…` (Option B)** | `disposed` — force suspended | `ineligible` — **live forever** | FAIL (1) | FAIL (2 recorded / 1 disposed / 1 live) |
| Option B′ (exception for S10 — NOT implemented, future contract change) | `disposed` | owner-signed exception | PASS (0) | FAIL (2 recorded / 2 disposed / 0 live) |
| Option C (reject — remove the records) | live | live | FAIL (2) | FAIL (2 / 0 / 2) |

Two properties hold in EVERY row and are bound by the test suite:

1. The historical verdict is FAIL in every state in which a violation is
   recorded. No act, adoption included, ever converts an uncovered landing
   into a compliant merge.
2. Admission can only go green through the owner's own acts (adoption plus,
   for the S10 finding, an explicit future exception decision or its
   remediation). Within the mechanism the eligibility window is
   structurally capped at the disposition surface's introduction commit
   (`0fd89d9…` on the published main): the tool refuses any adoption whose
   anchor postdates it, so no lane, no governance act and no baseline edit
   can make the post-mechanism finding `71655312` eligible — its live
   blocking after adoption is enforced by the tool, not by this document's
   choice of anchor value.

## 4. What adoption does NOT do

* It does not rewrite history, and it does not retroactively authorize the
  uncovered merges. Both remain recorded violations forever; the S9 entry's
  disposition records an ACCEPTANCE of the historical fact, not a
  compliance of the landing.
* It does not weaken current merge admission: the executor, the
  exact-head lane binding, the direct-push class and the fail-closed
  refusal guards are untouched by the proposal (the refusal probes of this
  run re-prove them at this head).
* It does not create an exception path for post-anchor findings, and the
  structural cap closes the indirect one: an anchor value that postdates
  the mechanism is refused by the tool itself, so a late adoption cannot
  smuggle a post-mechanism violation into eligibility. B′ would still
  require a separate, named, owner-signed exception contract and is
  explicitly NOT part of this proposal.

## 5. How the owner adopts (when approved)

A single governance-act merge confined to
`core/authority/merge-audit-baseline.json` under the lane protocol, with
one recorded reason per entry the anchor makes eligible/ineligible. The
adoption lane must NOT demand `merge:audit` as a local gate: the audit of
its own pre-adoption base reports the pending state by design (the gate it
satisfies is the one it switches on). Immediately after the adoption lands,
`merge:audit` is expected to report `admission: FAIL` with exactly ONE
live finding (`71655312`, `ineligible`) — that is the correct, honest
post-admission state under Option B, and the S10 disposition question
(B′ or remediation) remains open for the owner.

## 6. Standing inputs the owner decides together with this adoption

* The fate of the S10 finding `71655312` (Option B leaves it live
  permanently; B′ or remediation are the alternatives).
* The two dangling foreign lane lifecycles, both `active` and `consumed`
  but never closed: `boundary-closure-20261022` (bound head `f39739a1…`)
  and `s10-cross-model-optimization-20261022` (bound head `61609ccf…`) —
  see `dangling-lane-examination.md`. This run leaves both untouched.
* Ratification of the DIRECT_PUSH_UNCOVERED class (kept under every
  option; it is strictly strengthening and independent of the anchor).
