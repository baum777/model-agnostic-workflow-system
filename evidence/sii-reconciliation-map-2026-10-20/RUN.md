# SII Program Reconciliation Map (2026-10-20)

Materializes the reconciliation map for the Skill Intelligence & Instruction Integrity
program under the bounded owner run instruction
`MAWS-SII-REGISTRATION-AND-BASELINE-CLOSURE-2026-10-20` (reconstruct the real S0–S4
status; drop already-closed S1/S3 obligations; close the open S0/S2 change registrations
and the S4 residual cases; fast-forward only safely fast-forwardable local checkouts and
dispose of the undeclared Registry copy separately; re-check the instruction findings
against the current `origin/main`; fix the S5–S8 ↔ S11–S13 dependencies before any new
implementation slice; finish with a cross-surface readback and set CLOSED only for the
demonstrably complete scope).

## Scope

Docs-only. One new proposal document plus its evidence bundle. No contract, runtime,
qualification, permission or authority surface is created or changed.
`docs/proposals/README.md` classes this directory as non-canonical review material; per
Section 21 of the specification, canonical adoption, implementation and runtime
activation each require their own gated steps and none is performed here.

## What the map establishes

1. **Reconstructed S0–S4 status** from owner heads, repo-local dispositions, Registry
   records and Atlas claims — the three surfaces, not one of them.
2. **Closed obligations dropped from the open list:** S1 and S3 (Registry PR #216,
   `e22eb335`; MAWS PR #31 rebinding both dispositions to `UPDATED`; Atlas PR #163).
   The earlier statement that both still carried open `CONTRACT_RECORD` obligations came
   from a stale snapshot of MAWS `main` and is superseded.
3. **Open obligations named, not masked:** the coreos S4 leg (blocked by the Mimosa L3
   pre-push gate, 13 pre-existing HIGH findings, repair prepared but unpublished), the
   Registry/Atlas `NO_CHANGE` governance contradiction, and the instruction-integrity
   hardening from MAWS PR #32 that landed during this run.
4. **Dependency matrix** fixing the order S11 and S5 → S12/S6 → S7 → S8, with S13
   blocked on S5 and S11, so that no new implementation slice starts before its
   dependencies hold on all three surfaces.
5. **Instruction findings re-verified against the remote default branches.** Two earlier
   findings were corrected: the workspace-root-sync duplication is partly fixed
   upstream, and the 27 "duplicated skills" are not an upstream defect at all but
   untracked local directories (upstream intersection: 0).
6. **Baseline reconciliation:** five checkouts fast-forwarded after a dirty/divergence
   proof, five explicitly left untouched with reasons, and the undeclared second
   Registry clone disposed of separately after proving it held no unique content.

## What this run does not do

- It does not advance the SII transformation; S5–S8 and S11–S13 remain unimplemented.
- It does not repair the open instruction findings. The highest-value ones (F1
  governance contradiction, F5 provider adapter in the universal slot, F4 unowned
  `.cursorrules`, F16 missing `risk_level`, F6 dead shared-core prefixes) require either
  an owner decision or a change in an owner repository outside this run's bounded scope.
- It does not close the coreos S4 leg. The security gate was not bypassed, no
  alternative transport was used, and no force push was attempted.
- It does not claim any independent review.

## Registry and Atlas

The change registration for this map and for the previously unregistered S0, S2 wave 1
and S2 wave 2 changes is published in the Registry repository as separate change
registrations; the Atlas representation is a navigation-only claim supplement. The
owner-side `registry_commit_sha` stays `null` in the disposition: `registry-disposition.v1`
invariant 4 forbids a non-null value unless the status is `UPDATED`, and invariant 2
requires `UPDATED` to carry a non-empty `affected_records` list, which this change does
not have. The published registration SHA is carried as publication evidence instead, and
only after the publication succeeded.
