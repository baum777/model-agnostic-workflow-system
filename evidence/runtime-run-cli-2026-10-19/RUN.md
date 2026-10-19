# runtime:run operational entry — 2026-10-19

Run: OWNER-DIRECTED-CONSOLIDATION-RUN-2026-10-19, step S2a (audit finding:
MAWS work-unit execution had no operational entry point; `executeWorkRun`
was referenced only by tests).

## Change

- `runtime/cli/runtime-run.mjs`: stub -> spec-driven runner for the governed
  vNext pipeline (drives `executeWorkRun`; wires eligibility, routing,
  fixture Jev + threshold policy, verifier, completion engine; persists the
  evidence bundle and `run-events.jsonl`).
- `runtime/cli/specs/reference-audit-v1.json`: committed reference spec
  (fixture transports, contract-validated parts).
- `tests/vnext/runtime-run-cli.test.mjs`: 7 qualification tests.
- Docs: `docs/runtime.md` (vNext run entry section; runtime:status remains
  fail-closed), `docs/runtime-activation-status.md` (implemented surface
  bullet), `CHANGELOG.md` (Unreleased).

## Safety posture (deliberate)

- Fixture transports only; live transports fail closed
  (`RUN_SPEC_TRANSPORT_UNSUPPORTED`), no fallback. Live lane probes remain
  `runtime:activate-vnext`.
- Availability/policy/budget deny-by-default per executor.
- Spec parts validate against canonical contracts before execution
  (session, template, profiles, qualifications, fingerprints).
- Completion honesty: outputs/evidence derived from produced execution
  results and verification receipts, not declared intent.
- Exit codes: 0 COMPLETED / 1 NOT_COMPLETED / 2 spec+usage / 3 BLOCKED / 4
  unexpected.

## Verification (2026-10-19, worktree s2a-runtime-run-20261019 @ 435bc3d5)

- `node --test tests/vnext/runtime-run-cli.test.mjs`: 7/7 PASS.
- `npm run test:vnext`: 261/261 PASS.
- `npm run validate`: PASS (no issues). `npm run validate-maws-vnext`: PASS.
- Registry disposition: NO_CHANGE (no CONTRACT_RECORD/PROVENANCE/
  SUPERSESSION class affected), validator PASS — see
  `registry-disposition.json` in this directory.

## Not claimed

- No live transport activation, no service mode, no listener, no Unitera
  runtime integration (that is S2b), no authority or contract change.
