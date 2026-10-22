# Assurance Reconciliation Run 2026-10-22

A targeted reconciliation of the four residual findings of the assurance
file. This is deliberately NOT an implementation lane: no closed lane
(S5/S8/S9) and no part of the closed operational safety implementation is
re-opened. Each finding is answered with a committed, machine-checkable
artifact, and one anti-rot test file binds every artifact to the live tree.

## The four dispositions

### P1 — Löschschutz deckt nicht sämtliche Test- und Skriptpfade

Scope documented as bounded, remainder inventoried.

- `scripts/tools/inventory-removal-calls.mjs` re-derives the inventory with
  the exact per-call semantics of the safe-remove guard.
- `removal-call-inventory.json` is a LIVING artifact: the anti-rot tests
  fail whenever the live tree drifts from it, so the inventory is
  regenerated deliberately whenever a change moves a direct removal. At the
  reconciliation commit it held the harness surface clean with **64 calls
  in 7 closed-lane vnext test files**; the first regeneration became
  necessary the same day, when the S9 lane landed
  `tests/vnext/regression-eval.test.mjs` with one direct recursive removal
  — the current artifact holds the harness surface clean with **65 calls
  in 8 files** (instruction-auditor 6, instruction-bundle 7,
  instruction-inventory 3, instruction-resolver 5,
  instruction-semantic-signals 1, regression-eval 1,
  run-skill-effectiveness 6, s5-path-confinement 36).
- `docs/harness/cleanup-boundary-and-the-tmp-incident.md` §7 states the
  scope boundary against this inventory; widening it is a later run's
  decision made against named files, not a count.

### P1 — Fremdverlust durch /tmp-Incident nicht rückgängig

Technical fix and consequence accounting separated.

- `incident-consequence-record.md`: the technical fix is CLOSED (merged,
  probe-tested, guard-enforced); the consequence accounting is INCOMPLETE,
  and its foreign-loss part is NOT COMPLETABLE — no pre-incident inventory
  of `/tmp` exists, so the destroyed foreign state cannot be enumerated.
  No boundary primitive restores deleted state; the two results must never
  be reported as one.

### P2 — Content-Manifest ist kein Secret-/PII-Freiheits-Nachweis

Separate sensitive-content scan evidenced.

- `scripts/tools/scan-sensitive-content.mjs` reuses the owner secret
  patterns from `scan-secrets.mjs` (which does not cover `evidence/` in its
  file patterns — the gap this closes), adds PII heuristics (email, private
  key headers) and well-known token shapes; findings are disclosed via a
  baseline with justifications, reported as sha256, never as plaintext.
- `sensitive-content-scan.json`: **51 files** of
  `evidence/assurance-closure-2026-10-21` (the 45 gate files plus the run's
  own meta files) scanned, **0 findings**, digests recorded per file.
  Negative control in the anti-rot test proves both pattern classes fire.
- A pass is a scan result over the named pattern classes, not a compliance
  claim (stated in the artifact itself).

### P2 — Testzahlen 787 + 147 = 934 statt 910

Counting modes explained machine-checkably.

- `scripts/tools/reconcile-test-counts.mjs` derives the decomposition from
  the committed run record and a checkout at its bound commit
  (`dde7db26`): the record's **910** sum per-gate node --test executions
  (TAP only); the **934** sums one suite gate (787) with the FULL tools
  suite (147). The difference is **24**, and the identity is exact:
  `934 = 910 + 30 ungated tools tests − 6 intra-record overlap`.
- **30 tests in 5 tools files** were executed by no record gate
  (assurance-residual-matrix 6, contract-only-skill-directory 3,
  loop-repo-command-injection 3, registry-disposition 3,
  source-security-scan 15) — including the tests of two live security
  fixes. Forward fix: all five now run in the CI security step.
- **6 overlap**: `tests/vnext/skill-frontdoor.test.mjs` is counted once in
  the vnext suite (787) and once in its own regression gate — proven from
  the committed suite gate log, which contains all 6 of its test names.
- `test-count-reconciliation.json` holds the full derivation;
  `ok: IDENTITY_HOLDS`.

## Distinct results that stay distinct

- **Atlas validation PASS with 0 errors** is one result of the final
  readback.
- **The foreign Personal-Pilot path drift**
  (`C-PERSONAL-PILOT-LAUNCH-ACCEPTANCE` at its pin) is a separate, still
  open finding of a foreign lane. It is not absorbed into, excused by, or
  closed with this run's Atlas result. Both are reported side by side.

## What this run does not claim

- No widening of the deletion protection beyond the harness surface.
- No hosted CI result (account-wide lock stands; local replication only).
- No human approval, no promotion, no provider calls.
- No re-derivation of the closed operational safety run record — it stays
  bound to `dde7db26`; this run only EXPLAINS its counting mode.
