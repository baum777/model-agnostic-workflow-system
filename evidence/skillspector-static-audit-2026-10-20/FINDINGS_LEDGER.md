# Findings Ledger — Audit F-01..F-07 vs Repair PR #18 (A2)

**Purpose:** reconcile the seven full-codebase audit findings against the repair
that closed them, and mark each as implemented and CI-verified with the merge
SHA of PR #18. The **original scanner warnings are preserved separately and
unchanged** in `artifacts/skillspector-static-maws-20261020/` (raw SkillSpector
JSON) — this ledger adjudicates the audit's engineering findings and never
overwrites scanner output.

- **Audited source:** `d7c84914ea3ba339a0a96454dd06fa18904527d0`
- **Repair PR:** #18 `fix(security): MAWS F-01–F-07 full-codebase repair and regression gates`
- **Merge commit (authoritative implemented-at SHA):** `f66212514483fc39770e8db4615731d736b379ef` (merged 2026-10-20T01:37:02Z)
- **Repair branch head at merge:** `3aedbd12ca6b16043cb0eed33daaa3a385bab540`

## Reconciliation table

| Finding | Summary | Implementation commits (PR #18) | Primary files | Status |
| --- | --- | --- | --- | --- |
| F-01 | Strict completion/report parsing for NVIDIA SkillSpector 2.12.0; partial, schema-unknown, unqualified-version and caution evidence stays INCOMPLETE and never becomes PASS | `6fb01d174f50696180dfabbfffe6eb6e8659d753` (preserve INCOMPLETE), `7eb60c4eaca921e5e64e1c6a0c60287d4bb8afce` (bind parsed schema to qualified SkillSpector version), tests `f07d8096c4b09bb19c9806d89c51a3d0fb23ae0f`, `335ffcfbd8c9dfbc2b0574ec9ce73b7de4274d3e`, `75cbb5010d6910a05e404fe3e1410668065e7511` | `scripts/tools/preinstall-skill-risk-check.mjs`, `scripts/tools/skill-frontdoor-check.mjs`, `tests/tools/*` | **IMPLEMENTED + CI-VERIFIED @ f6621251** |
| F-02 | Reject out-of-root and symlinked preinstall evidence paths before any write, without side effects | `14d14b6f91b3b9f580f642df979443684e1bdd3c`, `e5a09fc6c92160489ec6c5f3fd1ebbca88e8a70e` | `runtime/observability/run-paths.mjs`, `runtime/cli/runtime-run.mjs` | **IMPLEMENTED + CI-VERIFIED @ f6621251** |
| F-03 | Credential-bearing OpenRouter requests require HTTPS, reject nonstandard ports and URL userinfo; redirects disabled (`redirect: "error"`) | `337d3ed32f975ea218e6c60b54cb0cb0b6a4be19`, test `abefbaaea09f3dc14f05285879833a5fb41d8cc5` | `runtime/executors/openrouter-executor.mjs`, `tests/vnext/executors.test.mjs` | **IMPLEMENTED + CI-VERIFIED @ f6621251** |
| F-04 | Central run-id and symlink-aware artifacts boundary enforced on `runtime:run`, replay and validate | `e5a09fc6c92160489ec6c5f3fd1ebbca88e8a70e`, `14d14b6f91b3b9f580f642df979443684e1bdd3c`, `6e159a61ba5fec37473034571e2bab3d7736b959` (replay), `464d911ea121415fcc4bd7e4b73854048db503a3` (validate) | `runtime/cli/runtime-run.mjs`, `runtime/observability/runtime-replay.mjs`, `runtime/observability/validation-receipt.mjs`, `runtime/observability/run-paths.mjs` | **IMPLEMENTED + CI-VERIFIED @ f6621251** |
| F-05 | MiniMax adapter base import points to canonical runtime adapter | `8e1430477a6daa46ac74c6711c4c5c4cb889579b`, test `45f013f793895fd1f8363aad32bf56f9f2e9727f` | `providers/minimax/adapter.mjs`, `tests/tools/provider-adapter-import.test.mjs` | **IMPLEMENTED + CI-VERIFIED @ f6621251** |
| F-06 | Replace string-interpolated shell commands with literal argv / `shell:false` subprocess dispatch | `eb7a9571005be3a6bdebd4d3426c519c710abcdd`, regression `432bbc98c18187d4208bd921c75e599cd65621a9` | `scripts/tools/ci-gate.mjs`, `tests/tools/security-repair-regressions.test.mjs` | **IMPLEMENTED + CI-VERIFIED @ f6621251** |
| F-07 | Default CI expanded to runtime VNext, per-install security tests, secrets, import and narrowed contract/security evals | `850c2f16a8a946dd6d434242a7eaae3735ab712c` | `.github/workflows/loop-repo-ci.yml` | **IMPLEMENTED + CI-VERIFIED @ f6621251** |

## CI verification evidence

1. **PR-head gate (pre-merge):** `loop-repo-ci` success on head `45f013f793895fd1f8363aad32bf56f9f2e9727f`
   — run https://github.com/baum777/model-agnostic-workflow-system/actions/runs/39351998469
   (security 13/13, VNext 287/287, skill-frontdoor 6/6; recorded in
   `evidence/maws-security-repair-2026-10-20/RUN.md`).
2. **Merge-commit gate (post-merge, the binding one for this ledger):** `loop-repo-ci`
   **success on `f66212514483fc39770e8db4615731d736b379ef`** — run
   https://github.com/baum777/model-agnostic-workflow-system/actions/runs/39354429571
   (check-run `loop-repo-ci`, started 2026-10-20T01:37:08Z; read back via the
   commits check-runs API on 2026-10-20 during this closure run).

Green CI on the merge commit re-runs the F-07 gate set (runtime VNext,
per-install security regressions covering F-01/F-02/F-03/F-06 negative paths,
adapter import for F-05, secrets and evals) against the merged tree, so every
row above is executed-and-verified, not merely code-present.

## Explicitly not claimed

- The repairs were verified by the CI named above only; no live provider
  invocation, no runtime activation, and no production promotion occurred
  (unchanged from the repair run's own limits).
- Findings deliberately left without change in PR #18 (shell-injection
  allegations not reproduced; package-lock drift not present; TS/regex
  refactors judged quality, not security) remain documented in the PR #18
  description and are not re-adjudicated here.
- Scanner-level warnings (7 HIGH non-fixture findings, 2 CRITICAL and 49 HIGH
  inside the intentional risk fixture, MEDIUM set) are adjudicated separately
  in `GATE_VERIFICATION.md`; the raw reports in `artifacts/` stay untouched.
