# RUN — runtime:run P1 hardening (S2b wave 0)

Run: OWNER-DIRECTED-CONSOLIDATION-RUN-2026-10-19 — step S2b, wave 0 (opening repair).
Worktree: `.worktrees/s2b-p1-hardening-20261020` off origin/main `6d399d62357952f8b0550211dacc35896e042e47`.
Implementation commits: round 1 `3eec595c8eaa0874b2e5ea3480b026fd1c23a272`,
round 2 `913662ad3e9fe29395b75a0b4e7f1baee30e5a9f` (bound in registry-disposition.json).

## Change

Repairs the three chatgpt-codex-connector P1 review findings left open at the
merge of PR #12 (recorded in registry record `MAWS_RUNTIME_RUN_CLI_2026_10_20_001.yaml`
and atlas claim `C-MAWS-RUNTIME-RUN-2026-10-19`), each verified against the merged
code before repair:

1. **Manufactured verifier attestations** (`runtime-run.mjs` L198–199 at merge
   `6d399d62`): the runner upgraded a silent verifier spec into
   `independent: true` / `outcome: 'PASS'` / empty `evidence_refs`. Now
   `verifier.verifier_executor_id`, `verifier.outcome` (PASS or FAIL),
   `verifier.independent` (explicit boolean) and `verifier.evidence_refs`
   (non-empty array; at least one ref for PASS) are required, failing closed
   with `SPEC_VERIFIER_INVALID`; the receipt builder receives the declared
   values verbatim (`buildVerificationReceipt` itself was already fail-closed).
2. **Fingerprint self-comparison** (L182–183): `currentFingerprints` and
   `qualifiedFingerprints` aliased the same spec object, manufacturing a
   no-drift determination for eligibility (eligibility treats a missing
   qualified fingerprint as UNKNOWN fail-closed — the aliasing bypassed that).
   `qualified_fingerprints` is now a separate required spec part, validated
   against the same canonical fingerprint contract; the runner passes the two
   parts independently.
3. **Run-directory reuse** (L147–148 + `appendFileSync`): a non-empty run
   directory was silently reused, interleaving two runs' event streams. Now
   fails closed with `RUN_DIR_EXISTS` (exit code 2 class); empty directories
   remain usable.

Files: `runtime/cli/runtime-run.mjs`, `runtime/cli/specs/reference-audit-v1.json`
(declares `qualified_fingerprints` explicitly as the fixture lane's no-drift
statement), `tests/vnext/runtime-run-cli.test.mjs` (+3 tests), `docs/runtime.md`,
`CHANGELOG.md`.

## Safety posture (unchanged in kind)

Fixture transports only; live transports still fail closed
(`RUN_SPEC_TRANSPORT_UNSUPPORTED`); availability/policy/budget still
deny-by-default; completion honesty (derived outputs/evidence registries)
untouched; no contract in `core/contracts/` changed.

## Verification

- `node --test tests/vnext/runtime-run-cli.test.mjs` — 10/10 pass (7 carried
  over + 3 new: SPEC_VERIFIER_INVALID cases, missing `qualified_fingerprints`,
  RUN_DIR_EXISTS on reuse).
- `npm run test:vnext` — 264/264 pass.
- `npm run validate` — PASS, no issues.
- `npm run validate-maws-vnext` — PASS, no issues.
- Registry disposition: `registry-disposition.json` in this directory —
  NO_CHANGE, validator PASS (`node scripts/tools/validate-registry-disposition.mjs`).

## Round 2 — Codex P1 review on round 1 (same PR #13)

Three further P1 findings on the round-1 head, each verified and repaired:

4. **Non-atomic run-directory claim** (concurrent same-spec runs): the
   existsSync pre-check plus recursive `mkdirSync` let two processes pass
   before either writes. The run directory is now claimed exclusively via
   non-recursive atomic creation — any pre-existing directory (empty,
   non-empty, or just claimed by a concurrent winner) fails closed with
   `RUN_DIR_EXISTS`.
5. **Unbound qualified snapshots**: a schema-valid
   `qualified_fingerprints` entry whose `fingerprint_id` did not match the
   applicable qualification's `fingerprint_ref` was accepted, so an unrelated
   snapshot could satisfy the drift check. Every QUALIFIED qualification must
   now name its matching snapshot (identity, capability and profile) or the
   spec fails closed with `SPEC_FINGERPRINT_INVALID`.
6. **Verifier identity not bound to the executed node**: a declared
   `verifier_executor_id` that routing never bound to the verification node
   still produced a PASS receipt under that identity. The verifier callback
   now requires the verification node's actual executor binding to equal the
   declared id (`SPEC_VERIFIER_MISMATCH` otherwise); the attestation always
   belongs to the verifier that really ran.

Round-2 verification: `node --test tests/vnext/runtime-run-cli.test.mjs` —
13/13 pass (three new tests: exclusive claim on empty existing dir,
unbound snapshot, verifier mismatch); `npm run test:vnext`,
`npm run validate`, `npm run validate-maws-vnext` re-run PASS (see PR checks).

## Not claimed

- No live transport admission, no Unitera runtime integration (that is the S2b
  intake binding wave proper, following this repair).
- No change to canonical contracts; the runtime:run spec surface is CLI-local.
- Registry/Atlas projection for this repair happens after owner merge, as its
  own registered change.
