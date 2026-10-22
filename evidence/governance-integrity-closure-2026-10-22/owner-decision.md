# PREPARED Owner Decision — the merge-audit disposition baseline

**Status: PREPARED, NOT DECIDED, NOT IMPLEMENTED.** This document prepares
an explicit owner decision. Nothing in this run implements any option; the
baseline, the audit tool and every contract remain exactly as published.

## What is decided

1. Whether the merge-audit disposition baseline — the mechanism landed by
   MAWS pull request 98 (merge 0fd89d9, 2026-10-22T16:18:16Z) in
   `core/authority/merge-audit-baseline.json` together with the status
   semantics of `scripts/tools/verify-merge-attestations.mjs`
   (`status = undispoded findings only`) — is RATIFIED as the authorized
   policy disposition for historical audit findings, or rejected.
2. If ratified: whether the mechanism carries an ADOPTION ANCHOR — a
   commit date before which a finding must have landed to be recordable.
3. The fate of the two currently recorded entries: `b902130` (pull
   request 90, S9 disposition rebind, landed 15:16:54Z — BEFORE the
   mechanism) and `71655312` (pull request 107, S10 disposition rebind,
   landed 16:55:54Z — AFTER the mechanism existed).

## Why the owner must decide

- The semantic change redefines what the audit's single PASS/FAIL bit
  means. It was implemented by a lane within its own scope, but no
  explicit owner decision authorized the new meaning of the bit — the
  prior run of this session documented the finding as permanent precisely
  because no exemption mechanism existed.
- The mechanism has a demonstrated laundering vector: the S10 chain
  merged uncovered 37 minutes AFTER the mechanism existed and then
  recorded its own violation (pull request 108). Without an anchor, the
  bit can be kept green by self-recording future violations through
  governance acts, which are exempt from lane coverage by design.
- The run's invariant "historical FAIL must never be represented as PASS"
  is currently satisfied only in the mechanism's own terms (findings stay
  visible; the bit no longer expresses them). Whether that is acceptable
  is a policy judgment, not an engineering one.

## Options

**Option A — ratify as-is.** Both entries stand; the mechanism carries no
anchor. The bit measures undisposed findings; visibility and staleness
guards remain. Risk: the laundering vector stays open and is already
demonstrated in practice.

**Option B — ratify with an adoption anchor (RECOMMENDED).** The mechanism
is legitimate only for findings whose landing PREDATES the mechanism's own
landing commit `0fd89d99fac3cf027880dfe2b13b0140a2a0b4fd`
(2026-10-22T16:18:16Z). Consequences: the `b902130` entry qualifies and
stands as the authorized disposition of the S9 rebind; the `71655312`
entry does NOT qualify — the S10 rebind becomes a live gate finding again
(`status: FAIL`) and the S10 lane owner faces the same permanent-finding
situation the S9 rebind was disposed of with. Future violations can never
be recorded; the bit regains its force exactly where it matters. The
DIRECT_PUSH strengthening stays in all cases.

**Option B′ — anchor plus one explicit exception.** As B, plus the owner
explicitly grants the S10 entry as a one-time, named, post-anchor
exception (documented owner acceptance of that landing). This keeps the
bit green while making the acceptance the OWNER's act instead of the
lane's own.

**Option C — reject the mechanism.** Revert to the single-bit semantics
(any finding fails). Both findings fail the bit again; global governance
remains DEGRADED indefinitely. The direct-push class may be kept or
reverted with it (it is independent and strictly strengthening — keeping
it under C is recommended either way).

## Recommendation

Option B, with the S10 exception question (B′) answered explicitly by the
owner rather than left implicit. Rationale: the mechanism is well-built
(visible findings, staleness guard, strengthening landing class) and
answers the real need — a current-admission signal that a permanent
historical finding cannot silence — but without an anchor it converts a
policy disposition into a self-service tool, and the S10 chain has
already used it that way once.

## What approval would look like

An owner decision record (this document countersigned or superseded by the
owner's own record), followed by the implementing change under the lane
protocol: the baseline contract gains the anchor field/semantics, the two
entries are reconciled per the chosen option, and the audit tests grow the
anchor's negative controls. Until then, this run reports the audit as it
is: `status: PASS` with BOTH findings recorded and visible — and global
governance as `DEGRADED`, because the policy disposition is not yet
authorized.
