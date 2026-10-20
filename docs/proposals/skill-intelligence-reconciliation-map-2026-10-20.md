# MAWS vNext — Skill Intelligence & Instruction Integrity: Reconciliation Map (2026-10-20)

**Class:** proposal target / docs-only / non-canonical docs staging (per `docs/proposals/README.md`)
**Run:** `MAWS-SII-REGISTRATION-AND-BASELINE-CLOSURE-2026-10-20`
**Owner:** model-agnostic-workflow-system
**Authority:** none. This document is review material. It creates no authority, qualification, permission or runtime activation, and it does not perform a canonical adoption of `MAWS-SII-TARGET-SPEC-001`.

## 0. Baselines this map was computed against

| Surface | Remote default branch | Revision |
|---|---|---|
| model-agnostic-workflow-system | `main` | `1d466511691156082a428d0f180a9d7cd51c4767` |
| unitera-registry | `main` | `0bba9e09f1e6010288548a329c585ebf63af6f9f` |
| unitera_atlas | `main` | `058331d14643168ce5023446ab2d53133a4e3f11` |
| Unitera_Systems | `main` | `11a27cd74d25f4774662554c404d4b57563ae924` |
| unitera-os | `main` | `9a06a6862eb951d5e4e0244f956c185863dd7330` |
| coreos | `main` | `b653bd967b4be61f5ba4b3e572608a41f4c1043c` |

The v0.2.0 specification revision is the state of record for the target architecture:
`docs/proposals/skill-intelligence-target-spec.md` (MAWS-SII-TARGET-SPEC-001 v0.2.0, **PROPOSED**).

## 1. Reconstructed status of the implemented slices S0–S4

Status is derived from three independent surfaces: the owner repository (merge state and
repo-local disposition), the Registry (change registration and contract projection) and
the Atlas (navigation claim). A slice counts as **CLOSED** only where all three carry the
change and the evidence agrees.

| Slice | Owner change | Owner disposition | Registry | Atlas | Status |
|---|---|---|---|---|---|
| **S0** — specification materialization + current-state map | MAWS PR #21, merge `982bc548e8b43c3ce1b09474d118740e1c6df372` (doc commit `e17f01cf4916c34c4d39069452ab0434c94c4d9a`) | `NO_CHANGE`, no registration | **none** | **none** | **OPEN — registered by this run** |
| **S1** — skill-feedback contract | MAWS PR #22, merge `739b9c80a394c40639cb3d9043db757aca6df5d4`; repair PR #27, merge `ee7f094b2676963b20161f093ed5a9a01e0c018b` | `UPDATED`, `registry_commit_sha e22eb3351b6a1d810272ac9c605f9d212bfd0d88` | `MAWS_SKILL_FEEDBACK_2026_10_20_001.yaml` + `MAWS_SKILL_FEEDBACK_CONTRACT_2026_10_20_001.yaml` (PR #216, merge `e22eb3351b6a1d810272ac9c605f9d212bfd0d88`) | `C-MAWS-SKILL-FEEDBACK-CONTRACT-2026-10-20` | **CLOSED** |
| **S2 wave 1** — instruction inventory | MAWS PR #24, merge `87a86d54971ee43ff967c2c336a81d2bf1f38812` (commit `6730a00928c55d46091c6675fd12ea97186f1627`) | `NO_CHANGE`, no registration | **none** | **none** | **OPEN — registered by this run** |
| **S2 wave 2** — instruction reference graph | MAWS PR #25, merge `2eff613f924c7a8e20cdc3a946971bed919d23d6` (commit `70be5292df6dd63621293a1121010ec42f3ec2b0`) | `NO_CHANGE`, no registration | **none** | **none** | **OPEN — registered by this run** |
| **S3** — instruction auditor | MAWS PR #26, merge `6df22a8f205c27a6ede42cfc350dce6f927a3115` (commit `866ab49ef6056aa2cc929744c5ed6b4c5a83d63e`); repair PR #30, merge `36354cba0c870adafc58e17cb91d9c18780a6ba7` (commit `82a638a268af…`) | `UPDATED`, `registry_commit_sha e22eb3351b6a1d810272ac9c605f9d212bfd0d88` | `MAWS_INSTRUCTION_AUDIT_FINDING_2026_10_20_001.yaml` + `MAWS_INSTRUCTION_AUDIT_FINDING_CONTRACT_2026_10_20_001.yaml` | `C-MAWS-INSTRUCTION-AUDIT-FINDING-CONTRACT-2026-10-20` | **CLOSED** |
| **S4 wave A** — instruction reduction, four repos | MAWS PR #23, merge `1bce44401b878032729d865d164a1d7f18fcd81e` · Unitera_Systems PR #232, merge `44a68f24b67f1cdb9e94ca6a0957a6c72f9f826b` + PR #233, merge `11a27cd74d25f4774662554c404d4b57563ae924` · unitera-os PR #31 + PR #32, merge `9a06a6862eb951d5e4e0244f956c185863dd7330` · coreos PR #20 **open**, head `e52dde2b6a212ec2f84412b677a38dd03da9aefd` | `NO_CHANGE` in all four repos | `S4_INSTRUCTION_REDUCTION_{MAWS,SYSTEMS,UOS,COREOS}_2026_10_20_001.yaml` (PR #217, merge `0bba9e09f1e6010288548a329c585ebf63af6f9f`) | `C-MAWS-…`, `C-SYSTEMS-…`, `C-SYSTEMS-…-REPAIR-…`, `C-UOS-…`, `C-COREOS-…` | **PARTIAL — 3 legs merged and registered, coreos leg blocked (see §2.2)** |

### 1.1 Obligations removed from the open list

The S1 and S3 obligations are **closed** and are no longer open items. Both were closed by
the parallel wave during this run, and the owner-side dispositions were rebound
accordingly:

- Registry PR #216 (`e22eb3351b6a1d810272ac9c605f9d212bfd0d88`) published the change
  registration and the `CONTRACT_RECORD` projection for
  `core/contracts/skill-feedback.schema.json` and
  `core/contracts/instruction-audit-finding.schema.json`.
- MAWS PR #31 (`9fc2ae80604aad33a4acbb1308523e9c35c5b2ff`) rebound both repo-local
  dispositions from `REQUIRED_BUT_BLOCKED` to `UPDATED` with
  `registry_commit_sha e22eb3351b6a1d810272ac9c605f9d212bfd0d88`.
- Atlas PR #163 (`058331d14643168ce5023446ab2d53133a4e3f11`) represented both contract
  registrations.

The earlier statement — that S1 and S3 still carried open `CONTRACT_RECORD` obligations —
was based on a stale snapshot of MAWS `main` and is superseded by this map.

## 2. Open obligations after this reconciliation

### 2.1 Closed by this run

| Obligation | Closure |
|---|---|
| S0 change registration | Registry change registration + Atlas claim, published by this run |
| S2 wave 1 change registration | Registry change registration + Atlas claim, published by this run |
| S2 wave 2 change registration | Registry change registration + Atlas claim, published by this run |
| S4 Systems repair leg | PR #233 merged as `11a27cd74d25f4774662554c404d4b57563ae924` (approving review by `t-wim` at the exact head `179f43fb340c12dc95e5cae95eedcc18971afc45`); Registry record and Atlas claim updated by this run |
| Undeclared second Registry clone | Disposed of by this run (see §5.2) |

### 2.2 Not closed — and explicitly not masked

**coreos S4 wave A leg — BLOCKED by a security gate.**
Pull request #20 is open at head `e52dde2b6a212ec2f84412b677a38dd03da9aefd`. Two Codex
P2 findings on that pull request were repaired in the local commit
`f9962147dda08554fe13ba1ece72bd45db95544a` (restoring the shared-core path prefixes on
the schema and validator pointers; correcting the provider-adapter misclassification in
the repo-local disposition reason — disposition validator PASS). **That commit could not
be published:** the Mimosa L3 pre-push gate reports 13 HIGH findings in `coreos` sources
(path-traversal patterns in `src/validator/consistency.ts`, `src/prime/generator.ts`,
`src/memory/validator.ts`, `src/gates/validator.ts`, `src/foundation/v0_1_0/derive.ts`,
`src/commands/foundation-v0_1_0.ts`, `scripts/validate-governance.ts` and two test files,
plus one hardcoded test credential in `tests/context/compiler.contract.test.ts`). All are
pre-existing and none was introduced by this documentation-only change. The gate was not
bypassed, no alternative transport was used, and no force push was attempted. The leg
therefore remains open, and its Registry record and Atlas claim state that.

**Instruction governance contradiction — open, needs an owner decision.**
`projects/Unitera/AGENTS.md` (project layer) requires Registry **and** Atlas registration
for *every* change and states that there is no `NOT_APPLICABLE` exemption, while the
shared-core `registry-disposition.v1` contract defines `NO_CHANGE` and four consumer
bindings rely on it. The project layer also requires an Atlas representation for every
change, but the Atlas has **no** native equivalent of `NO_CHANGE`: `data/claims.yaml`
carries `authority: navigation_only` and `default_uncited_detail_status`, but no
disposition vocabulary. Until this is resolved, the "register everything" obligation is a
policy accident rather than a decision. This is a governance decision, not an engineering
change, and it is not taken here.

**S3 instruction-integrity hardening (MAWS PR #32) — registered in the parallel wave.**
Merge `1d466511691156082a428d0f180a9d7cd51c4767` landed during this run with its own
`NO_CHANGE` disposition
(`evidence/instruction-integrity-hardening-2026-10-20/registry-disposition.json`). When this
map was written the change had no Registry change registration; that gap was closed in the
same window by the parallel hardening registration
(`registry/MAWS_INSTRUCTION_INTEGRITY_HARDENING_2026_10_20_001.yaml`, Registry pull request
#219) and represented in the Atlas. The statement below that it was unregistered was written
before that publication and is superseded by it.

## 3. Slice dependencies: S5–S8 against S11–S13

The v0.2.0 specification adds S11–S13. No new implementation slice may start before its
dependencies below are satisfied. A dependency is satisfied only when the referenced
artifact is merged on the owner default branch **and** its Registry representation and
Atlas claim exist — a merged commit alone is not a satisfied dependency.

| Slice | Depends on | Rationale | Current state |
|---|---|---|---|
| **S5** — Behavioral Evaluation | S2 wave 1 + wave 2 (reconstructible instruction set), S3 (auditor findings as analysis input) | An evaluation corpus needs a reproducible instruction inventory and a classified finding surface; without both, "instruction quality" is not measurable | S2 and S3 are closed → **S5 is unblocked** |
| **S6** — Adaptive Context Assembly | S5 (baseline/candidate comparison), the coreos context compiler (`coreos/src/context/`, merged `b653bd96`, registered) | Context reduction is only provable against a measured baseline, and the context semantics are owned by coreos — MAWS must bind, not re-implement | S5 not started; coreos side available → **blocked on S5** |
| **S7** — Qualification Integration | S6 (Effective Instruction Bundle digest), S11 (harness-context binding) | The qualification fingerprint must bind the bundle digest, and the harness context must be part of the bound scope before a digest is meaningful | not started → **blocked on S6 and S11** |
| **S8** — Governance Promotion | S5 (eval evidence), S7 (qualification + materiality), S11–S13 (binding, profiles, benchmark) | Promotion requires eval-backed evidence, valid qualification and the full binding surface | not started → **blocked on S5, S7, S11–S13** |
| **S11** — Harness Context Separation | S2 wave 1 + wave 2 (authority-class-aware instruction set), the tenant/assignment authority in `unitera-os` | The context binding must distinguish authority classes, which the inventory already carries, and must bind to the real assignment authority | S2 closed → **S11 is unblocked** |
| **S12** — Model-Adaptive Executor Profiles | S5 (behavioral baseline per profile), S7 (materiality and requalification rules) | A profile is only admissible with measured behavior and a requalification rule | S5 not started → **blocked on S5** |
| **S13** — Comparative Benchmark Harness | S5 (eval families and acceptance criteria), S11 (context isolation between workers) | A benchmark needs eval families and must be able to isolate workers by harness context | S5 not started → **blocked on S5 and S11** |

**Ordering conclusion.** S11 and S5 are the two unblocked entries; everything else
transitively depends on them. S11 before S12, S5 before S6, S6 before S7, and S5+S7+S11–S13
before S8. The benchmark harness (S13) must not be started before a measured baseline
exists, because without one "multi-executor is better" is an assumption, not a result.

## 4. Instruction findings re-checked against the current `origin/main`

Twenty findings from the earlier instruction audit were re-verified against the **remote
default branches**, not the local working trees — the earlier audit read local trees and
therefore produced two false positives. Verdicts:

| Verdict | Findings | Consequence |
|---|---|---|
| **Already fixed upstream** | F7 (2 of 6 workspace-root-sync blocks and 1 of 3 stale path copies removed by `7ffe8a3` in agent_routing and `577cf93` in portfolio-my; 4 sync blocks and 2 stale path copies remain), F8 (`Unitera_Systems/CLAUDE.md` reduced 215 → 149 lines by `df24ec5d`; ~30 lines still restate `AGENTS.md`), F20 (**not an upstream defect at all**: the 27 same-named skills exist only as untracked local directories in the MAWS working tree; the `origin/main` intersection with `~/.agents/skills` is 0) | removed from the open list; the residual parts of F7/F8 stay open as reduced findings |
| **Still open** | F1 governance contradiction, F2 no Atlas mention in the root `AGENTS.md` (0 hits), F3 five non-existent repos in the root inventory, F4 unowned superseded `.cursorrules`, F5 provider adapter in coreos' universal `AGENTS.md` slot, F6 dead shared-core path prefixes in four repos, F9 three broken canonical-source rows in `Unitera_Systems/CLAUDE.md`, F10 phantom skill in `skills/index.md`, F11 non-existent `browser-check.cjs`, F12 ellipsis-prefixed template paths, F13 six Windows-era `Chats/*/AGENTS.md` files, F14 undefined `L2+` risk scale at the root, F15 unconditional root obligations in `CLAUDE.md`, F16 `current_session.md` without the mandatory `risk_level`, F17 the `registry-disposition.v1` contract still defines the closed vocabulary (verified present, invariants 1–5), F18 Atlas has no `NO_CHANGE` representation, F19 undeclared second Registry clone | remain open; F1, F5, F4, F16 and F6 are the highest-value subset. F4, F5, F6 and F19 are also mirrored by the open items in §2.2 and §5.2 |

The two Codex P2 findings raised on the coreos S4 pull request #20 correspond to F5 and F6
and are repaired in the local commit `f9962147dda08554fe13ba1ece72bd45db95544a`, which
is unpublished for the reason stated in §2.2.

## 5. Baseline reconciliation (local against remote)

### 5.1 Checkouts fast-forwarded

Fast-forward was applied only where the tracked tree was clean, the checkout had no
commits of its own, and no locally modified file was also changed upstream.

| Checkout | Before | After | State |
|---|---|---|---|
| `agentic_workflow/agent_routing` | `1254279` | `b1afb03` | clean, 0 ahead / 0 behind |
| `projects/Unitera/unitera-registry-main` | `cdbc860` (detached) | `0bba9e0` (on `main`) | clean, 0 ahead / 0 behind |
| `projects/Unitera/unitera_atlas` | `3ba02297` (detached) | `058331d` (on `main`) | clean, 0 ahead / 0 behind |
| `projects/Unitera/unitera_identity` | `3664ae5` | `1cd342f` | clean, 0 ahead / 0 behind |
| `projects/Unitera/unitera-graph-ir` | `876a892` | `d9fc5e2` | clean, 0 ahead / 0 behind |

### 5.2 Checkouts deliberately not fast-forwarded

| Checkout | Reason |
|---|---|
| `baum-os` (workspace root) | 230 tracked files modified (submodule pointers and deleted paths), 11 behind. A fast-forward would overwrite local state; not safe. |
| `model-agnostic-workflow-system` | `CHANGELOG.md` is locally modified **and** changed upstream — overlap, so a fast-forward would conflict. The SII work of this run was therefore executed in a dedicated worktree at `origin/main`. |
| `Unitera_Systems` | `pnpm-lock.yaml` is locally modified and changed upstream — overlap. |
| `coreos` | On branch `s4a/instruction-reduction-20261020` with 3 own commits; not behind. Not touched. |
| `unitera-os` | On feature branch `codex/qml-cognition-routing-policy-01`; not the default branch. Not touched. |
| `unitera_companion`, `unitera_control_plane`, `unitera_public_docs`, `proof.uniterasystems` | Already at `origin/main`. |

### 5.3 Undeclared second Registry clone — disposed of separately

`projects/Unitera/unitera-registry` was a second clone of the Registry authority
repository, undeclared in every instruction file and untracked in `baum-os`. Before
disposal it was verified to hold **no unique content**: clean tracked tree, 0 untracked
files, 0 stashes, 0 commits unique to `origin/main`, and both local branches
(`registry/custody-check-reporting-20261012`, `registry/custody-record-repair-20261012`)
fully contained in `origin/main`. It was moved, not deleted, to
`/home/baum/workspace/.quarantine/unitera-registry-duplicate-20261020` together with a
disposition record, and the canonical `unitera-registry-main` was fast-forwarded
separately. Reversal is a single `mv`.

## 6. Explicit non-closure statements

- The overarching SII transformation remains **PARTIAL**. This run closed registration
  obligations and one blocked leg; it did not advance the transformation itself.
- **S5–S8, S11–S13 are not started.** The dependency matrix in §3 fixes their order; no
  implementation slice is claimed.
- The **coreos S4 leg is blocked** by a security gate and is reported as blocked, not as
  closed. The two P2 repairs are prepared but unpublished.
- The **instruction findings of §4 remain open**; this run re-verified and de-duplicated
  them, it did not repair them. The highest-value open findings (F1, F5, F4, F16, F6)
  require either a governance decision or a change in an owner repository outside the
  bounded scope of this run.
- **No independent review is claimed** for the changes published in this run. The merges
  rest on green CI plus the bounded owner run instruction.
- The Atlas remains a **navigation projection** and the Registry a **reference-only
  projection**; neither creates authority.

## 7. Verification performed for this map

- Owner heads, dispositions, Registry records and Atlas claims were read from the remote
  default branches of all eight participating repositories.
- `node scripts/tools/validate-registry-disposition.mjs` — PASS on every disposition
  touched by this run.
- `npm run validate`, `validate-neutral`, `validate-maws-vnext` — PASS, 0 issues.
- `npm run test:vnext` — PASS, 0 failures.
- `python3 scripts/validate_registry.py` — PASS; `--reachability` PASS with 378 verified
  current claims and 0 mismatch.
- `python3 scripts/validate_atlas.py` — PASS, 0 errors.
- Fast-forward preconditions were proven per checkout before every merge, and every
  unmerged or diverged checkout is listed in §5.2 rather than silently skipped.


## 8. Post-merge status of this reconciliation run

Recorded after the publications of this run, so the map states the closed scope and the
residual scope separately.

**Published and closed by this run**

| Item | Publication |
|---|---|
| This map | MAWS pull request 33, merge `87c58609ae8138122b81762f35757192006bdffb` |
| S0 change registration | `registry/MAWS_SII_MATERIALIZATION_2026_10_20_001.yaml` (Registry pull request 220, merge `15ef3f3315d927150e05b4349ef4d2e59c29a88a`) |
| S2 wave 1 change registration | `registry/MAWS_INSTRUCTION_INVENTORY_2026_10_20_001.yaml` (same Registry pull request) |
| S2 wave 2 change registration | `registry/MAWS_INSTRUCTION_REFERENCE_GRAPH_2026_10_20_001.yaml` (same Registry pull request) |
| Atlas representation of all four | `data/claims-post-sii-reconciliation-2026-10-20.yaml` (Atlas pull request 167, merge `851a6911cea051418cdd9dccf6f9afd535ec5799`) |
| Unitera_Systems S4 repair leg | merged as `11a27cd74d25f4774662554c404d4b57563ae924` after the approving review by `t-wim` at the exact head |

**Still open after this run**

- The **coreos S4 wave A leg** — published on the branch, open as pull request 20, blocked
  by the Mimosa L3 pre-push gate; the two Codex P2 repairs are prepared in the local commit
  `f996214` and unpublished.
- The **Registry/Atlas `NO_CHANGE` governance contradiction** (§ 2.2) — an owner decision.
- The **open instruction findings** (§ 4) — reported, not repaired.
- The **SII transformation itself** — S5–S8 and S11–S13 are not started; the program remains
  **PARTIAL**.
