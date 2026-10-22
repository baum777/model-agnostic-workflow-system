# Governance Separation Examination — 2026-10-22

Question of this examination (run scope item 3): can HISTORICAL COMPLIANCE
and CURRENT MERGE ADMISSION be evaluated independently under EXISTING
contracts? This document states the examination result. It changes
nothing; the decision it prepares is in `owner-decision.md`.

## 1. State at the last verified head (870d7abb, this session's prior run)

- The audit report's DATA already separated the two concerns: every merge
  carried its own classification (COVERED / GOVERNANCE_ACT /
  HISTORICAL_OBSERVATION / UNCOVERED), every finding named its commit, and
  the lane states named consumption. A consumer COULD evaluate current
  admission independently by filtering the report data.
- The audit's VERDICT did not separate them: one `status` bit, computed as
  `findings.length === 0 ? PASS : FAIL`. With the standing UNCOVERED
  finding for `b902130`, the bit was permanently FAIL — correct as
  historical compliance, useless as a current-admission signal.
- No existing contract provided an admission-scoped verdict.

## 2. What changed since (foreign lanes, merged 870d7abb → 9d009cc)

The boundary-closure lane (pull request 98, merged 0fd89d9 at
2026-10-22T16:18:16Z, itself properly lane-covered) changed the audit:

1. **Disposition baseline** (`core/authority/merge-audit-baseline.json`):
   a governance act may RECORD a finding of the published history. A
   recorded finding stays VISIBLE in the report (`findings` and
   `disposed_findings`) but loses its gate-failing force. A baseline entry
   that matches no live finding is STALE and fails the gate — the baseline
   cannot rot into an amnesty list.
2. **Status semantics**: `status = gateFindings.length === 0 ? PASS : FAIL`
   — the bit now measures UNDISPOSITIONED findings only.
3. **DIRECT_PUSH_UNCOVERED class** (strengthening): the audit now walks
   every commit on the first-parent line; a single-parent landing after
   the lifecycle contract is a finding — the squash/rebase/direct-push
   bypass class, judged like an uncovered merge.

The merge executor and the lane authorization contract are UNCHANGED
(git-diff empty over 870d7abb..9d009cc): current merge ADMISSION — the
executor's refusal chain — is exactly as strict as before.

Two UNCOVERED findings are currently recorded: `b902130` (pull request 90,
the S9 disposition rebind, 15:16:54Z) and `71655312` (pull request 107,
the S10 disposition rebind, 16:55:54Z), both with disposition
`RECORDED_AS_REAL_FINDING`.

## 3. Assessment against this run's invariants

- **"No history rewrite, no retroactive authorization, no hidden
  exemptions"** — the baseline is a versioned governance file with
  anti-rot staleness; nothing is rewritten or hidden. BUT baseline entries
  are landable through GOVERNANCE ACTS, and governance acts are exempt
  from lane coverage by the audit's own pre-existing rule. A future lane
  could therefore merge uncovered and then record its own fresh violation.
- **"Historical FAIL must never be represented as PASS"** — the findings
  remain emitted and recorded, but the single status bit now reads PASS
  where the previous semantics read FAIL. Whether that satisfies the
  invariant's letter or violates it is precisely the owner question.
- **THE LAUNDERING VECTOR IS DEMONSTRATED, NOT HYPOTHETICAL**: the S10
  chain merged pull request 107 UNCOVERED at 16:55:54Z — 37 minutes AFTER
  the disposition mechanism existed (16:18:16Z) — and then recorded that
  same finding at 17:20 (pull request 108, "record the S10 rebind merge as
  a real audit finding"). A post-mechanism violation was self-disposed
  through the mechanism. Under any adoption-anchor semantics it would not
  have been recordable.

## 4. Result

Historical compliance and current admission CAN now be evaluated
independently — the mechanism exists as implemented. Its LEGITIMACY (was
the semantic change itself owner-authorized?) and its SCOPE (may findings
that post-date the mechanism ever be recorded?) are UNDECIDED. Both are
owner decisions. They are prepared in `owner-decision.md` and implemented
nowhere.

## 5. Side findings (reported, not touched — foreign lanes)

- Two lane lifecycles dangle ACTIVE with already-consumed heads:
  `boundary-closure-20261022` and `s10-cross-model-optimization-20261022`
  (the same gap this run's predecessor closed for the S9 lane). Per this
  run's invariant, foreign lanes remain untouched.
- Live admission probes (this run, dry-run, nothing merged): a
  nonexistent lane is refused (`MERGE_LANE_AUTHORIZATION_ABSENT`) and the
  S10 lane used against pull request 107 is refused
  (`MERGE_PR_IDENTITY_MISMATCH`) — the exact enforcement that pull
  request 107's author bypassed by merging directly. Receipts in
  `admission-integrity-probes.json`.
