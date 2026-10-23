# The two dangling foreign lane lifecycles — examined, untouched

Both lanes are FOREIGN work (the boundary-closure chain of PRs #98/#101
and the S10 chain of PRs #100/#105/#106/#107). This run examines and
reports them; it modifies neither. Closing a lane is its owner's act.

## boundary-closure-20261022

* record: `core/authority/merge-authorizations/boundary-closure-20261022.json`
* state: `active`, bound head `f39739a14787aa940b146897304e74d7ef10a64a`
* `consumed: true` — the bound head was landed by a merge the audit classifies COVERED
* missing: `closed_by` — the lifecycle was never closed after its merge

## s10-cross-model-optimization-20261022

* record: `core/authority/merge-authorizations/s10-cross-model-optimization-20261022.json`
* state: `active`, bound head `61609ccfe5a46dd5e30163c7b27c3f2cb485a4c4`
* `consumed: true` — the bound head was landed by a merge the audit classifies COVERED
* missing: `closed_by` — the lifecycle was never closed after its merge

## Why they matter for the owner decision

1. Neither lane is a live risk under the current admission regime (both
   bound heads are already consumed; an active-but-consumed lane covers no
   NEW merge because `coveringLanes` demands an exact head match and the
   executor derives the target from the lane).
2. Their openness is lifecycle debt of the foreign chains, not a gate
   finding: the audit reports lane state, it does not fail on it.
3. If the owner adopts the anchor policy, closing these two lifecycles is
   a natural companion act of the SAME owner decision round (one
   governance-act merge each, or one combined act), because the S10 lane's
   fate is semantically tied to the S10 finding `71655312` the adoption
   leaves live.

This run's own lane (`governance-policy-followup-20261023`) is authorized
by a separate governance act after this evidence commit, demands its five
local gates and is closed by its binding merge; this paragraph is a plan,
not a claim about a lane record that already exists.
