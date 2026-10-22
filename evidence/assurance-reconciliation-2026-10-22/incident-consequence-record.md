# Incident Consequence Record — /tmp Deletion of 2026-10-21

Reconciliation artifact (P1b) of the assurance reconciliation run
2026-10-22. This record separates two things that must not be reported as
one: the TECHNICAL FIX, which is closed, and the CONSEQUENCE ACCOUNTING of
the incident, which is incomplete and, in one part, not completable.

## The incident

During the assurance closure run on 2026-10-21, a cleanup step removed a
temporary directory's PARENT instead of the temporary directory itself. The
parent of a temporary directory under `/tmp` is `/tmp`: the recursive
removal deleted the system temporary directory and everything other
processes and sessions had placed there. The full account of the incident
and the boundary rules that followed from it live in
[`docs/harness/cleanup-boundary-and-the-tmp-incident.md`](../../docs/harness/cleanup-boundary-and-the-tmp-incident.md).

## Part 1 — Technical fix: CLOSED, merged, guard-enforced

| Claim | Evidence |
| --- | --- |
| Boundary primitive exists and fails closed | `scripts/tools/safe-remove.mjs`, merged at `381bc44` |
| Every refusal has a negative test (13 tests, first one IS the incident shape) | `tests/tools/safe-remove.test.mjs` |
| The harness surface (scripts/tools, tests/tools) contains no direct recursive removal | guard test in the same file; inventory tool re-derives it (`removal-call-inventory.json`) |
| 9 mutation probes neutered exactly one guard each and the designed test failed | `evidence/operational-safety-closure-2026-10-22/mutation-probes.json` |
| Run closed over the full triad | MAWS `381bc44`, Registry `ca3ad76`, Atlas `548517d` |

The technical fix prevents RECURRENCE. It restores nothing. Part 2 is why.

## Part 2 — Consequence accounting: INCOMPLETE, and one part NOT COMPLETABLE

What the deletion destroyed, as far as it is knowable today:

1. **Own state — reconstructed.** The run's own capture worktree under
   `/tmp` and four then-uncommitted files were destroyed. They were
   reconstructed from the session context; the assurance run record of
   2026-10-21 was completed and sealed against the reconstructed commit
   (`777fd7d`). The loss was recoverable only because the session that
   created the state was still alive and remembered it.
2. **Foreign state — lost without an inventory.** Other sessions and other
   processes held state under `/tmp` at the moment of the deletion. No
   pre-incident inventory of `/tmp` exists anywhere, the removal was
   immediate and unrecoverable, and no log recorded what was there. WHICH
   foreign state was destroyed is therefore not merely unreported — it is
   NOT COMPLETABLE: the information needed for a complete accounting does
   not exist anymore.

Status per the evidence rule: the consequence accounting is
`UNVOLLSTÄNDIG BELEGT` (partially evidenced). It must not be reported as
closed, and it must not be reported as a gap the technical fix could close:
no boundary primitive restores deleted foreign state.

## What is and is not claimed

- Claimed: recurrence is structurally prevented on the harness surface and
  the prevention is probe-tested and CI-guarded.
- Claimed: the boundaries of that prevention are inventoried
  (`removal-call-inventory.json`): 64 direct recursive removal calls remain
  in 7 closed-lane vnext test files outside the guarded surface.
- Not claimed: that the foreign losses are known, enumerated, or restored.
- Not claimed: that a complete consequence accounting will ever be
  possible. It will not; the record above is the complete knowable account.
