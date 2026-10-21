# RUN — Dynamic Skill Selection 2026-10-20 (DSI implementation slice)

**Run ID:** dsi-skill-selection-2026-10-20
**Date:** 2026-10-20 (the second rebase and the full local re-verification were recorded 2026-10-21, UTC instants in the mutation records below)
**Baseline:** `origin/main` = `bfa56ec17306ab709be3d492f02ac27150b4661a` ("Merge pull request #53 from baum777/chore/sii-rebind-20261021"). The slice was executed in the dedicated worktree `.worktrees/dsi-skill-selection-20261020` on branch `feat/dsi-skill-selection-20261020`, rebased onto that commit. The previous baseline was `27b17b62800d5d37e14bfe48ecd210603c4e1cb6` ("Merge pull request #47 from baum777/s7/qualification-integration-20261020b").
**History of the baseline.** The slice was originally authored on top of the S4 branch `feat/s4-skill-improvement-analyzer-20261020` (`c66cad6e8eedee982cf5d83d84e082aef51e3dbb`), was then rebased onto `origin/main` (`27b17b6…`), and is now rebased onto the current `origin/main` (`bfa56ec…`, which carries the S8 governance-promotion slice, the S4 skill-improvement-analyzer slice and the SII rebind). The rebase makes the branch independently mergeable: the DSI slice is the only change it carries, and **no S4 change comes along** — S4 is now merged in `origin/main` (pull request #50, `bc1d3e2`), so it is part of the BASE of this branch and of no other slice's diff. The rebinds are documented in §11; the conflict resolutions are listed there file by file.
**Predecessor slice:** none in this branch. S4 (`evidence/skill-improvement-analyzer-2026-10-20/`) is merged in `origin/main` and is therefore part of the BASE, not of this branch's diff: `git diff --name-only bfa56ec….HEAD` lists only DSI files, and no S4 file (`runtime/skills/feedback-analyzer.mjs`, `runtime/skills/improvement-classifier.mjs`, `core/contracts/skill-improvement-proposal.schema.json`, `scripts/tools/validate-skill-improvement-proposal.mjs`, `evals/fixtures/maws-vnext/skill-improvement-proposal.contracts.json`, `tests/vnext/skill-improvement.test.mjs`, `evidence/skill-improvement-analyzer-2026-10-20/`) appears in the diff. DSI extends the same `runtime/skills/` surface and the same contract conventions; it changes no S4 file.
**Authority posture:** a selection decision is a decision record, never authority. `authority_granted` is `false` by construction: a selection grants no permission, promotes no skill, activates no runtime path and changes no qualification state. The activation decision stays with the caller and its own governance, and the skill frontdoor admission gate stays the precondition for a skill to be usable at all.

## 1. The Gap This Slice Closes

**Observed on the baseline tree:** skill usage in MAWS was static. `runtime/skills/` contained `frontdoor.mjs` (admission gate), `feedback-analyzer.mjs` (S4 Stage 2) and `improvement-classifier.mjs` (S4 Stage 3) — none of which chooses a skill. `core/contracts/core-registry.json` is the validator-backed neutral registry snapshot and `core/contracts/portable-skill-manifest.json` is the registration state, but no runtime surface ever *read* them in order to pick a skill: every skill reference in a workflow was hard-wired by a human. The S1 feedback contract even carries the error class `SKILL_SELECTION_ERROR` (responsible area `routing`), and the S4 contract maps it to `routing` — but nothing in the repository implemented a selection decision, so nothing could produce, evidence or refute that error class.

**Consequence:** the runtime could not *choose* a skill from the registry, and could not record *why* it chose one. A skill that was not hard-wired into a workflow was unreachable; a skill that was hard-wired was used whether or not it fit.

**What this slice adds:** the decision surface. A loader that resolves a skill against the registry snapshot and fails closed with typed denial codes, a selector that produces a deterministic ordered candidate list and one selection (or one typed refusal), and a canonical contract that makes the decision machine-readable and reconstructable.

## 2. Scope

1. New canonical contract `core/contracts/skill-selection.schema.json` (schema_version `1.0.0`).
2. New runtime module `runtime/skills/skill-registry-loader.mjs` — the registry snapshot builder and the fail-closed loader.
3. New runtime module `runtime/skills/skill-selector.mjs` — the deterministic selector.
4. Validator CLI `scripts/tools/validate-skill-selection.mjs` + npm script `validate-skill-selection`.
5. Fixture `evals/fixtures/maws-vnext/skill-selection.contracts.json` (26 cases, 11 positive / 15 negative), registered in `evals/catalog.json` (covered by `eval:maws-vnext` and `validate-maws-vnext`). The positive cases are the **runtime output at revision `c66cad6e8eedee982cf5d83d84e082aef51e3dbb`**, not hand-written variants: the test "the runtime reproduces the canonical fixture records exactly" asserts that the selector output equals the recorded fixture instance field for field. The recorded revision label stays `c66cad6e…` after the rebind because the four registry-snapshot inputs the snapshot digest is computed over (`core/contracts/core-registry.json`, `core/contracts/portable-skill-manifest.json`, `core/contracts/workflow-routing-map.json` and the skill instruction files the S2 instruction inventory digests) are byte-identical between `c66cad6e…` and the new base `bfa56ec…` — `git diff --name-only c66cad6e8eedee982cf5d83d84e082aef51e3dbb bfa56ec17306ab709be3d492f02ac27150b4661a` touches none of them — so the snapshot digest `e7bed984823f0e9d026ec4edb461e6299a02c86711a47fb801d39b278bc6785b` and every recorded fixture record are unchanged by the rebind. Re-observed after the rebind: the runtime still produces that exact digest at the new base (§8).
6. Tests `tests/vnext/skill-selection.test.mjs` (35 tests, picked up by `test:vnext`).
7. `core/contracts/README.md`, `evals/README.md`, `CHANGELOG.md`, `evals/catalog.json`, `package.json`, this run record and the registry disposition.

**Out of scope (deliberately):** `core/contracts/core-registry.json` and the provider export artifacts (they are generated and carry a checked distribution — changing them is an owner decision); `core/contracts/portable-skill-manifest.json` (its `activationPolicy.expectedDistribution` is a checked contract); `evals/fixtures/maws-vnext-baseline.json` and `docs/authority-matrix.md` (the newer SII slices S4/S5/S6/S11 did not extend the baseline surface list either, so DSI follows that precedent and does not claim a new `maws-vnext:` authority row); the skill frontdoor admission contract (unchanged — DSI does not weaken it); every S4 file (unchanged).

## 3. The Skill Registry Snapshot And Where It Comes From

**Decision (as directed):** the DSI slice extends the existing registry conventions instead of inventing a parallel universe. The *skill registry snapshot* is a runtime value built by the loader from canonical repository inputs only:

| Input | What it contributes |
|---|---|
| `core/contracts/core-registry.json` | the neutral registry snapshot: skill identity (`skillId`, `name`, `skillPath`) and the declared required tools |
| `core/contracts/portable-skill-manifest.json` | the registration state: which skills are registered portable skills |
| `core/contracts/workflow-routing-map.json` | the closed scope vocabulary and the canonical skill↔scope assignment (`supportingSkills` per workflow class) |
| the S2 instruction inventory (`runtime/instructions/instruction-inventory.mjs`) | the sha256 content digest of every skill instruction file — the same digest the instruction audit and the inventory use |

**Observed on the baseline tree:** the neutral registry snapshot carries 36 skills; 18 of them are registered in the portable skill manifest; every registry skill has a readable instruction file; every scope value the registry projects is one of the 7 canonical workflow classes. All 36 skills are therefore resolvable and digest-bound.

**Skill state per scope.** A skill is `ACTIVE` in a scope when the routing map lists it as a supporting skill of that scope **and** it is registered in the portable skill manifest. A skill that the routing map lists but that is not registered in the manifest is `SUSPENDED` in that scope. This is the S4 manifest gap handled explicitly rather than silently: such a skill stays visible, it can never be selected, and it never disappears unnoticed. A scope the skill is not listed for is simply absent from its scope map — it is never `ACTIVE` there.

**Scope vocabulary drift is a hard failure.** The contract declares the closed scope vocabulary, the routing map declares the canonical one, and the runtime compares them on every snapshot build (`compareScopeVocabularies` → `SKILL_SCOPE_VOCABULARY_DRIFT`). A workflow class that exists in one and not the other would silently widen or narrow what is selectable, so it fails closed instead.

**DSI capability derivation (slice-local, owner-decidable — see §7).** A skill **provides** its own domain capability `cap_<skill_name>` plus one `cap_<workflow_class>` for every scope it is `ACTIVE` in; it **requires** one `cap_<tool_name>` for every tool the neutral registry snapshot declares as required for it. The ids use the canonical `cap_[a-z0-9_]+` shape of `maws-vnext-common.schema.json#/$defs/capabilityId`, so a skill capability and an executor capability live in one vocabulary.

## 4. The Contract Shape And Why

`core/contracts/skill-selection.schema.json` is closed (`additionalProperties: false` at every level) and required-field-complete:

| Field | Shape | Why |
|---|---|---|
| `schema_version` | `const "1.0.0"` | the contract version. |
| `selection_id` | `sel_[0-9a-f]{16}` | a deterministic function of the request digest, the snapshot digest, the ordering key and the outcome. The wall clock is deliberately **not** part of it: the same decision must not change identity because it was taken later. |
| `created_at` | UTC instant | evidence, never an input. |
| `request` | `{request_id, intent_fingerprint, scope, required_capabilities, request_digest}` | the selection inputs. `intent_fingerprint` is the caller's digest of the intent; `request_digest` is recomputed by the selector over the other four fields, so a decision can never be attributed to a request it was not made for. |
| `registry_snapshot` | `{snapshot_ref, snapshot_digest, skill_count}` | the registry state the decision was made against. The digest binds the decision to one exact registry state, so a later registry change cannot silently re-interpret an old decision. |
| `candidates` | `[{skill_id, skill_path, digest}]` | the candidate set that was considered, each with the content digest of its instruction file, so a reviewer sees exactly which bytes were on the table. |
| `eligibility` | `[{skill_id, verdict, reason}]` | one verdict per evaluated candidate. A rejection is recorded with its reason, so an ineligible candidate is visible instead of invisible. |
| `outcome` | `SELECTED` \| `REFUSED` | the closed decision vocabulary. There is no third state. |
| `selection` | `{skill_id, skill_path, digest, rank}` | the chosen skill. `rank` is `const 1` — the selected skill is always the first entry of the ordering key. |
| `refusal` | `{code, reason}` | the typed refusal. `code` is closed to `EMPTY_CANDIDATE_SET` and `NO_ELIGIBLE_CANDIDATE`. |
| `ordering_key` | `{rule, ordered_candidate_ids, key}` | the deterministic ordering key: the named comparison, the resulting total order, and the digest over both. |
| `evidence_digest` | 64 hex | binds request digest, snapshot digest, ordering key, outcome and selected skill id (or refusal code) into one digest. |
| `authority_granted` | `const false` | a selection is not authority. |

### Fail-closed rules encoded in the contract

1. `outcome: SELECTED` ⇒ a `selection` is present, a `refusal` is `null`, and the ordering key is non-empty.
2. `outcome: REFUSED` ⇒ a `refusal` is present, a `selection` is `null`, the ordering key is empty, and **no** eligibility verdict may be `ELIGIBLE`.
3. An eligible verdict must carry the reason `ELIGIBLE`; an ineligible verdict must carry one of the five denial reasons. The two can never be mixed.
4. `refusal.code: EMPTY_CANDIDATE_SET` ⇒ the record carries neither a candidate nor a verdict.
5. `refusal.code: NO_ELIGIBLE_CANDIDATE` ⇒ the record carries at least one verdict, so what was considered and rejected is visible.
6. The scope vocabulary is closed to the 7 canonical workflow classes; the ordering rule is closed to `CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC`; the outcome, refusal and eligibility vocabularies are closed.

### Cross-field invariants the minimal schema engine cannot express

The following are produced by construction in `runtime/skills/skill-selector.mjs` and asserted in `tests/vnext/skill-selection.test.mjs` (the S6 `semanticBundleIssues` precedent, but enforced in the runtime that produces the record rather than in a second validator):

- the selected skill is the first id of `ordering_key.ordered_candidate_ids`;
- every candidate that resolved against the snapshot appears in both `candidates` and `eligibility`, in the same order (a candidate that could not be resolved appears in `eligibility` only, with the reason `SKILL_NOT_FOUND`, because an absent skill has no digest to record);
- a selection exists only when at least one verdict is `ELIGIBLE`;
- `request.request_digest` equals the digest recomputed over the request fields.

## 5. The Loader — Fail Closed With Typed Denial Codes

`runtime/skills/skill-registry-loader.mjs`:

- `buildSkillRegistrySnapshot({root, revision})` → `{schema_version, revision, snapshot_digest, skills[]}`. Deterministic: the same repository state and revision always produce the same snapshot and the same digest. Every list is sorted by a stable key before it is hashed, so no filesystem order enters the digest. The revision is required — a snapshot without a revision binding could not be reconstructed later.
- `loadSkill({snapshot, skill_id, expected_digest, scope, context})` → `{outcome: 'LOADED', skill}` or `{outcome: 'DENIED', denial: {code, reason, skill_id, ...}}`. The denial vocabulary is closed to four codes and there is no silent path:

| Denial code | When |
|---|---|
| `SKILL_NOT_FOUND` | the skill is not part of the registry snapshot. |
| `SKILL_DIGEST_MISMATCH` | the expected digest does not match the digest recorded in the snapshot (content drift between the plan and the registry state). |
| `SKILL_STATE_NOT_ALLOWED` | the skill is not registered for the caller's scope (`state_reason: SCOPE_NOT_DECLARED`) or is registered but not `ACTIVE` there (`state_reason: STATE_NOT_ACTIVE`). |
| `SKILL_CAPABILITY_MISSING` | a capability the skill itself requires is not present in the current context (the denial lists the missing capabilities). |

- `requireSkill(args)` throws the same typed code as a `FailClosedError` for call sites that want an exception instead of a denial record.
- A denial is **data**, not an exception: the selector consumes the denial and records it as a per-candidate eligibility verdict, so a rejection is visible instead of invisible.

## 6. The Selector — Deterministic By Construction

`runtime/skills/skill-selector.mjs`:

- `selectSkill({request, registry_snapshot, candidates, context, now})` → the selection record. `candidates` is optional; when absent, the candidate set is derived from the request scope (`deriveScopeCandidates`), and when present it is the evaluated candidate set (a string id, or `{skill_id, expected_digest}`).
- **The ordering rule** (one rule, named in the contract): `CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC`.
  1. *Context footprint ascending* — among the candidates that fully satisfy the request, the skill that demands the least from the caller wins (the number of capabilities the skill itself requires).
  2. *Skill id ascending* — the explicit, documented tie-break. It is a total order over distinct candidate identities, so a tie is impossible and the selection is unique.
- **Determinism.** No wall clock enters the comparison (the timestamp is injected and is not part of the ordering or of the `selection_id`), no randomness enters it, and no filesystem order enters it (the snapshot and the derived candidate set are sorted by skill id). The comparison itself is a total order, so the same inputs always yield the same order and the same selection.
- **Eligibility.** A candidate is eligible only if the loader loads it *and* it provides every capability the request requires. A candidate that does not provide them is rejected with `REQUIRED_CAPABILITY_NOT_PROVIDED`.
- **Refusal, never a fallback.** When the candidate set is empty the outcome is `REFUSED` with `EMPTY_CANDIDATE_SET`; when candidates exist but none is eligible the outcome is `REFUSED` with `NO_ELIGIBLE_CANDIDATE`. A refusal never carries a selection, and the selector never picks a candidate "because something is better than nothing".
- **Scope awareness.** The scope check lives in the loader and applies to every candidate, so a skill registered for one work class is never eligible in another.

## 7. Owner Decisions Named By This Slice

These are decisions the slice made and that the owner may overrule. Each is implemented in the conservative direction.

1. **The DSI capability derivation.** A skill provides its own domain capability plus one capability per scope it is `ACTIVE` in, and requires one capability per declared required tool (§3). The repo has no canonical skill→capability mapping, so the slice derived one from the canonical registry projection instead of inventing a parallel capability catalog. The alternative — a hand-maintained skill capability catalog — is a larger surface and is not created here. *Owner action:* confirm the derivation, or declare a canonical skill capability catalog to replace it.
2. **The ordering rule.** `CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC` prefers the least demanding skill among the ones that fully satisfy the request, with the ascending skill id as the total-order tie-break. The alternative — a declared priority field on the registry skill entries — would require changing the generated neutral registry snapshot, which is out of scope here. *Owner action:* confirm the rule, or introduce a declared priority and extend the rule.
3. **The recorded candidate set excludes unresolvable candidates.** A candidate that is not in the snapshot appears in `eligibility` with `SKILL_NOT_FOUND` but not in `candidates`, because an absent skill has no digest to record. The alternative — nullable `skill_path`/`digest` in the candidate set — would weaken "every candidate carries a digest". *Owner action:* confirm the split, or require nullable candidate fields.
4. **The scope vocabulary is the workflow-class vocabulary.** The selection scope is the 7 canonical workflow classes of `core/contracts/workflow-routing-map.json`, not a new skill-scoped taxonomy. The runtime fails closed on drift between the two declarations. *Owner action:* confirm that workflow class is the right scope dimension for skill selection.
5. **The S4 slice is untouched.** DSI does not extend the S4 proposal contract, the feedback contract or the portable skill manifest. *Owner action:* none required; noted so the boundary is explicit.
6. **Baseline drift during the run — now closed.** The slice was branched from `origin/feat/s4-skill-improvement-analyzer-20261020` (`c66cad6`) rather than from `origin/main`, because the S4 template slice was the most recent comparable implementation and the task named its files as the template. `origin/main` then advanced twice: first to `27b17b6…` (merges #47 "S7 qualification integration" and #48 "S13 benchmark comparison"), then on to `bfa56ec…` (merge #53 "SII rebind", which carries the S8 governance-promotion slice and the S4 skill-improvement-analyzer slice). The branch was rebased onto `27b17b6…` and then onto `bfa56ec…`; the S4 commit was dropped from the branch and the five files that both slices edited were resolved by keeping `origin/main`'s content AND re-applying DSI's own additions, so both sides are kept in every conflict (§11). The branch is now independently mergeable against `origin/main` and its diff carries no S4 change.

## 8. Verification Performed

All commands were run from the worktree root (`.worktrees/dsi-skill-selection-20261020`).

**Re-verification on the rebased base.** The table below is the result of the re-run performed after the second rebase onto `origin/main` = `bfa56ec17306ab709be3d492f02ac27150b4661a` (2026-10-21T00:18Z; the first re-verification, onto `27b17b6…`, was recorded at 2026-10-20T23:47Z). The totals differ from the earlier run because the new base carries the merged S7, S8, S13 and S4 slices (and their tests) — the DSI slice itself contributes the same 35 tests, the same 26 fixture cases and the same 1 catalog entry as before.

| Command | Result |
|---|---|
| `npm run test:vnext` | **512 tests, 512 pass, 0 fail** (the DSI file alone: 35 tests, 35 pass, 0 fail; the same tree without the DSI test file: 477 tests, 477 pass, 0 fail; on the previous `27b17b6…` base: 461 tests, 461 pass, 0 fail; before the first rebind, on the S4-based branch: 450 tests, 450 pass, 0 fail) |
| `npm run validate-skill-selection` | PASS — `skill-selection fixture: 26 cases checked, 0 unexpected results` |
| `npm run eval:maws-vnext` | PASS — `ok: true`, `total: 19`, `passed: 19`, `failed: 0`, `blockingFailures: 0` (the DSI fixture is registered and passes as `maws-vnext-skill-selection-contracts`) |
| `npm run validate-maws-vnext` | PASS — `ok: true`, 20 fixture files, 222 cases, 0 issues |
| `npm run validate` | PASS — `ok: true`, `issueCount: 0` |
| `npm run validate-neutral` | PASS — `ok: true`, `issueCount: 0` |
| `npm run test:skill-frontdoor` | PASS — 6 tests, 6 pass, 0 fail |
| `node scripts/tools/ci-gate.mjs` | PASS — `PASS CI Gate` (the gate writes a local `evidence/loop-runs/<run>/` orientation record; it is a generated artifact and was deliberately **not** committed, matching the S4 precedent) |
| `node --check runtime/skills/skill-registry-loader.mjs runtime/skills/skill-selector.mjs scripts/tools/validate-skill-selection.mjs tests/vnext/skill-selection.test.mjs` | PASS (all four) |
| `node scripts/tools/validate-registry-disposition.mjs evidence/dsi-skill-selection-2026-10-20/registry-disposition.json` | PASS — `{"passed": true, "issues": []}` |
| hosted GitHub Actions (`loop-repo-ci`) | **NOT RUN** — the account is locked for a billing issue, so no hosted job started for this branch. Every step of the workflow was replicated locally on the rebased tree (the table above) and passes; the absence of a hosted CI run is disclosed here rather than presented as a green gate. |

**Note on the npm wrapper of the disposition validator.** `npm run validate-registry-disposition` hard-codes `--fixture evals/fixtures/registry-disposition-contract.json` in the script, so an appended file argument is shadowed by that flag and the npm form validates the canonical *contract fixture* (13 cases, `{"passed": true, "issues": []}`, exit 0) rather than the DSI artifact. The DSI artifact itself is validated by the direct invocation in the last table row, which returns `{"passed": true, "issues": []}`. This is pre-existing wrapper behaviour, unchanged by this slice.

### Exact command lines

```
node --test tests/vnext/skill-selection.test.mjs
npm run test:vnext
npm run validate-skill-selection
npm run eval:maws-vnext
npm run validate-maws-vnext
npm run validate
npm run validate-neutral
npm run test:skill-frontdoor
node scripts/tools/ci-gate.mjs
node --check runtime/skills/skill-registry-loader.mjs
node --check runtime/skills/skill-selector.mjs
node --check scripts/tools/validate-skill-selection.mjs
node --check tests/vnext/skill-selection.test.mjs
node scripts/tools/validate-registry-disposition.mjs evidence/dsi-skill-selection-2026-10-20/registry-disposition.json
```

## 9. Mutation Evidence (guards proven to bite)

Each mutation was applied with the Edit tool, the failure was observed, and the guard was restored afterwards. The restored state was re-verified: `node --test tests/vnext/skill-selection.test.mjs` → 35/35 pass, `npm run validate-skill-selection` → 26 cases checked, 0 unexpected results, `npm run test:vnext` → 450/450.

**Re-run after the rebase (2026-10-20T23:47Z).** All nine mutations were re-applied and re-observed on the rebased tree (base `27b17b6…`), because the base changed even though none of the three mutated files changed: `runtime/skills/skill-registry-loader.mjs`, `runtime/skills/skill-selector.mjs` and `core/contracts/skill-selection.schema.json` are byte-identical to the pre-rebase versions (verified by byte comparison against the pre-rebase commit), while the surrounding tree — the registry snapshot inputs, the test harness and the contract spine — is not. Every mutation reproduced its pre-rebase symptom exactly, with identical digests and identical failing test names (§9.1 below records the re-run outcome; the per-mutation outputs in §9 are the re-run outputs). After the last restore, the three mutated files were compared byte for byte against their pre-rebase content: identical. The full suite was re-run on the restored tree: `node --test tests/vnext/skill-selection.test.mjs` → 35/35 pass, `npm run validate-skill-selection` → 26 cases checked, 0 unexpected results, `npm run test:vnext` → 461/461 pass. No mutation marker remains in the tree.

**Re-run after the second rebase (2026-10-21T00:18Z).** All nine mutations were re-applied and re-observed once more, on the tree rebased onto `bfa56ec17306ab709be3d492f02ac27150b4661a`. The re-run reproduced the recorded symptom of every mutation exactly, with the same failing test names and the same counts: M1 2 of 35 fail, M2 4 of 35, M3 2 of 35, M4 1 of 35, M5 1 of 35, M6 2 of 35, M7 1 of 35, M8 12 fixture results flip and 5 of 35 fail, M9 2 of 35. The reason is structural rather than coincidental: the three mutated files (`runtime/skills/skill-registry-loader.mjs`, `runtime/skills/skill-selector.mjs`, `core/contracts/skill-selection.schema.json`) are byte-identical to their pre-rebase versions, and so are the four registry-snapshot inputs the snapshot digest is computed over (`core/contracts/core-registry.json`, `core/contracts/portable-skill-manifest.json`, `core/contracts/workflow-routing-map.json` and the S2 instruction inventory) — `git diff --name-only 27b17b62800d5d37e14bfe48ecd210603c4e1cb6 bfa56ec17306ab709be3d492f02ac27150b4661a -- core/contracts/core-registry.json core/contracts/portable-skill-manifest.json core/contracts/workflow-routing-map.json runtime/instructions/instruction-inventory.mjs` is empty. After the last restore, the three mutated files were compared byte for byte against their committed content: identical; the suite was re-run on the restored tree (`node --test tests/vnext/skill-selection.test.mjs` → 35/35 pass, `npm run validate-skill-selection` → 26 cases checked, 0 unexpected results) and no mutation marker remains in the tree.

The test output below was captured with:

```
node --test tests/vnext/skill-selection.test.mjs 2>&1 \
  | grep -E "^(✖|ℹ tests|ℹ pass|ℹ fail)|AssertionError|^\s+[+-] '|actual:|expected:" \
  | grep -v "^test at"
```

**Mutation 1 — loader: drop the digest comparison** (`runtime/skills/skill-registry-loader.mjs`, `expected_digest !== skill.digest` removed from the denial condition):

```
✖ the loader denies a digest mismatch with SKILL_DIGEST_MISMATCH (1.66265ms)
✖ a digest mismatch refuses the request instead of selecting the drifted skill (0.640977ms)
ℹ tests 35
ℹ pass 33
ℹ fail 2
✖ failing tests:
✖ the loader denies a digest mismatch with SKILL_DIGEST_MISMATCH (1.66265ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: 'LOADED',
    expected: 'DENIED',
✖ a digest mismatch refuses the request instead of selecting the drifted skill (0.640977ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + 'SELECTED'
  - 'REFUSED'
    actual: 'SELECTED',
    expected: 'REFUSED',
```

**Mutation 2 — loader: drop the scope-state check** (`runtime/skills/skill-registry-loader.mjs`, the scope branch disabled):

```
✖ the loader denies a skill outside an allowed state for the caller scope (1.646253ms)
✖ the loader denies a suspended skill in the scope it is registered for (0.369775ms)
✖ a skill eligible for one scope is never selected for another scope (0.696246ms)
✖ the scope isolation holds for the whole registry, not only for one skill (0.441759ms)
ℹ tests 35
ℹ pass 31
ℹ fail 4
✖ failing tests:
✖ the loader denies a skill outside an allowed state for the caller scope (1.646253ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: 'LOADED',
    expected: 'DENIED',
✖ the loader denies a suspended skill in the scope it is registered for (0.369775ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: 'LOADED',
    expected: 'DENIED',
✖ a skill eligible for one scope is never selected for another scope (0.696246ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + 'SELECTED'
  - 'REFUSED'
    actual: 'SELECTED',
    expected: 'REFUSED',
✖ the scope isolation holds for the whole registry, not only for one skill (0.441759ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: 'LOADED',
    expected: 'DENIED',
```

**Mutation 3 — loader: drop the required-capability check** (`runtime/skills/skill-registry-loader.mjs`, the missing-capability filter neutralised):

```
✖ the loader denies a skill whose own required capability is missing from the context (1.311117ms)
✖ a missing required capability refuses the request instead of selecting the skill (0.495087ms)
ℹ tests 35
ℹ pass 33
ℹ fail 2
✖ failing tests:
✖ the loader denies a skill whose own required capability is missing from the context (1.311117ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: 'LOADED',
    expected: 'DENIED',
✖ a missing required capability refuses the request instead of selecting the skill (0.495087ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + 'SELECTED'
  - 'REFUSED'
    actual: 'SELECTED',
    expected: 'REFUSED',
```

**Mutation 4 — selector: drop the skill-id tie-break** (`runtime/skills/skill-selector.mjs`, `compareEligible` returns 0 on equal footprint):

```
✖ the ordering does not depend on the order in which candidates are offered (2.11799ms)
ℹ tests 35
ℹ pass 34
ℹ fail 1
✖ failing tests:
✖ the ordering does not depend on the order in which candidates are offered (2.11799ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  +   key: 'f39deddb44fbf3e29b509fa10b9a15f0bcd7ce9df7d1f61d4556d40857721be7',
  -   key: 'c01ea6e4437993744aab414aeb36a1cca1b878de2ebd935d0bfa9ffc9b9b4dfb',
  +     'core.diagnostic-feedback-loop',
  +     'core.behavior-first-tdd',
  -     'core.behavior-first-tdd',
  -     'core.diagnostic-feedback-loop'
    actual: { rule: 'CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC', ordered_candidate_ids: [ 'core.diagnostic-feedback-loop', 'core.behavior-first-tdd', 'core.architecture-depth-review' ], key: 'f39deddb44fbf3e29b509fa10b9a15f0bcd7ce9df7d1f61d4556d40857721be7' },
    expected: { rule: 'CONTEXT_FOOTPRINT_ASC_THEN_SKILL_ID_ASC', ordered_candidate_ids: [ 'core.architecture-depth-review', 'core.behavior-first-tdd', 'core.diagnostic-feedback-loop' ], key: 'c01ea6e4437993744aab414aeb36a1cca1b878de2ebd935d0bfa9ffc9b9b4dfb' },
```

**Mutation 5 — selector: let a refusal fall back to the first candidate** (`runtime/skills/skill-selector.mjs`, a selection is filled in on the `NO_ELIGIBLE_CANDIDATE` path):

```
✖ a request that no eligible candidate satisfies is refused, never answered with a fallback (2.71359ms)
ℹ tests 35
ℹ pass 34
ℹ fail 1
✖ failing tests:
✖ a request that no eligible candidate satisfies is refused, never answered with a fallback (2.71359ms)
  AssertionError [ERR_ASSERTION]: a refusal must never carry a fallback selection
  +   digest: '2cb8352ddd04f004dec6860c5d2d73fe373eb33d1fb59c5900b5c63df93cd4b2',
  +   rank: 1,
  +   skill_id: 'core.repo-audit',
  +   skill_path: 'core/skills/repo-audit/SKILL.md'
    actual: { skill_id: 'core.repo-audit', skill_path: 'core/skills/repo-audit/SKILL.md', digest: '2cb8352ddd04f004dec6860c5d2d73fe373eb33d1fb59c5900b5c63df93cd4b2', rank: 1 },
    expected: null,
```

**Mutation 6 — selector: let the wall clock leak into the selection identity** (`runtime/skills/skill-selector.mjs`, `created_at` added to the `selection_id` digest):

```
✖ the runtime reproduces the canonical fixture records exactly (4.179997ms)
✖ the wall clock is evidence, never an input: only created_at may change (1.199625ms)
ℹ tests 35
ℹ pass 33
ℹ fail 2
✖ failing tests:
✖ the wall clock is evidence, never an input: only created_at may change (1.199625ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + 'sel_826456a759953107'
  - 'sel_5e609a58a64b5628'
    actual: 'sel_826456a759953107',
    expected: 'sel_5e609a58a64b5628',
```

**Mutation 7 — loader: drop the scope-vocabulary drift guard** (`runtime/skills/skill-registry-loader.mjs`, the drift condition in `compareScopeVocabularies` disabled):

```
✖ the scope vocabulary drift between contract and routing map fails closed (1.982742ms)
ℹ tests 35
ℹ pass 34
ℹ fail 1
✖ failing tests:
✖ the scope vocabulary drift between contract and routing map fails closed (1.982742ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
    actual: undefined,
```

**Mutation 8 — contract: drop the authority-free posture** (`core/contracts/skill-selection.schema.json`, `authority_granted` `const` flipped to `true`):

```
case skill-selection-valid-denial-capability-not-provided: expected pass but observed failure: $.authority_granted: expected const true, got false
case skill-selection-valid-scope-only-request: expected pass but observed failure: $.authority_granted: expected const true, got false
case skill-selection-invalid-authority-granted: expected failure but observed pass: (no issues)
skill-selection fixture: 26 cases checked, 12 unexpected results
validator exit=1
✖ every fixture case validates exactly as declared (3.915534ms)
✖ the validator CLI reports zero issues on the canonical fixture (93.999253ms)
✖ the selection record keeps the closed, authority-free posture (0.851343ms)
✖ the produced selection record satisfies the canonical contract (1.869068ms)
✖ a refused record still satisfies the canonical contract (1.436433ms)
ℹ tests 35
ℹ pass 30
ℹ fail 5
```

**Mutation 9 — selector: invert the primary ordering key** (`runtime/skills/skill-selector.mjs`, the footprint comparison reversed):

```
✖ the primary ordering key prefers the smaller context footprint (3.89538ms)
✖ a skill eligible for one scope is never selected for another scope (1.584888ms)
ℹ tests 35
ℹ pass 33
ℹ fail 2
✖ failing tests:
✖ the primary ordering key prefers the smaller context footprint (3.89538ms)
  AssertionError [ERR_ASSERTION]: the footprint must be non-decreasing along the ordering key
  + actual - expected
  +   4,
  -   4
    actual: [ 4, 3 ],
    expected: [ 3, 4 ],
✖ a skill eligible for one scope is never selected for another scope (1.584888ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'core.repo-audit'
  - 'core.source-conflict-resolver'
    actual: 'core.repo-audit',
    expected: 'core.source-conflict-resolver',
```

### What the required properties map onto

| Required property | Proven by |
|---|---|
| the determinism invariant | mutation 4 (tie-break removed → the order follows the input order) and mutation 6 (the wall clock leaks into the identity); the unmutated tests additionally assert 200 identical repeats, an unchanged selection under a different `now`, and an unchanged order under a reversed candidate list. |
| the scope isolation | mutation 2 (the scope-state check removed → 4 tests go red, including the whole-registry isolation check). |
| the digest check | mutation 1 (the digest comparison removed → the loader loads a drifted skill and the selector selects it). |
| refusal-not-fallback | mutation 5 (a refusal carries a fallback selection) and mutation 8 (the contract's closed refusal rules). |
| the closed, authority-free posture | mutation 8 (the contract's `authority_granted` rule) — 12 fixture results flip and 5 tests go red. |
| the scope-vocabulary drift guard | mutation 7. |
| the primary ordering key | mutation 9. |
| the fixture is the runtime's own output, not a hand-written variant | mutation 6 (the runtime no longer reproduces the recorded fixture record). |

### 9.1 Re-run of the nine mutations on the rebased base (2026-10-20T23:47Z, repeated 2026-10-21T00:18Z on `bfa56ec…`)

The nine mutations were re-applied one by one on the rebased tree. Every one reproduced its pre-rebase symptom exactly — the same failing test names, the same pass/fail counts and the same digests — which also re-proves that the skill registry snapshot is unchanged by the move of the base (the snapshot digest `e7bed984823f0e9d026ec4edb461e6299a02c86711a47fb801d39b278bc6785b` and the ordering key `c01ea6e4437993744aab414aeb36a1cca1b878de2ebd935d0bfa9ffc9b9b4dfb` / `f39deddb44fbf3e29b509fa10b9a15f0bcd7ce9df7d1f61d4556d40857721be7` are the same values as before the rebase).

| # | Weakened guard | File | Observed red on the rebased base |
|---|---|---|---|
| 1 | digest comparison removed from the denial condition | `runtime/skills/skill-registry-loader.mjs` | 2 of 35 fail — "the loader denies a digest mismatch with SKILL_DIGEST_MISMATCH" (`LOADED` vs `DENIED`), "a digest mismatch refuses the request instead of selecting the drifted skill" (`SELECTED` vs `REFUSED`) |
| 2 | scope-state check dropped | `runtime/skills/skill-registry-loader.mjs` | 4 of 35 fail — the two scope-state loader denials, the scope isolation of a single skill and the whole-registry scope isolation |
| 3 | required-capability check neutralised | `runtime/skills/skill-registry-loader.mjs` | 2 of 35 fail — "the loader denies a skill whose own required capability is missing from the context" and "a missing required capability refuses the request instead of selecting the skill" |
| 4 | skill-id tie-break removed from `compareEligible` | `runtime/skills/skill-selector.mjs` | 1 of 35 fail — "the ordering does not depend on the order in which candidates are offered" (order follows the input order) |
| 5 | refusal falls back to the first candidate | `runtime/skills/skill-selector.mjs` | 1 of 35 fail — "a request that no eligible candidate satisfies is refused, never answered with a fallback" (`core.repo-audit` carried by a refused record) |
| 6 | wall clock leaks into the selection identity | `runtime/skills/skill-selector.mjs` | 2 of 35 fail — "the runtime reproduces the canonical fixture records exactly" and "the wall clock is evidence, never an input: only created_at may change" (`sel_826456a759953107` vs `sel_5e609a58a64b5628`) |
| 7 | scope-vocabulary drift guard disabled | `runtime/skills/skill-registry-loader.mjs` | 1 of 35 fail — "the scope vocabulary drift between contract and routing map fails closed" (missing expected exception) |
| 8 | `authority_granted` `const` flipped to `true` | `core/contracts/skill-selection.schema.json` | 12 fixture results flip, 5 of 35 fail — every fixture case validates against the mutated contract and the CLI reports `26 cases checked, 12 unexpected results` |
| 9 | primary ordering key inverted (footprint descending) | `runtime/skills/skill-selector.mjs` | 2 of 35 fail — "the primary ordering key prefers the smaller context footprint" (`[4, 3]` vs `[3, 4]`) and the scope-isolation selection (`core.repo-audit` vs `core.source-conflict-resolver`) |

After the last restore, the three mutated files were compared byte for byte against their pre-rebase content: identical in all three cases. No mutation marker remains in the tree.

## 10. Results And Open Items

- The runtime can now choose a skill from the registry snapshot by a deterministic, recorded rule instead of having a human hard-wire it: a request fingerprint plus the registry snapshot in, one selection (or one typed refusal) with the candidate set, the per-candidate eligibility verdicts, the ordering key and the digest-bound evidence out.
- Fail-closed everywhere: the loader has exactly four denial codes, the selector refuses with exactly two refusal codes, and neither has a silent path.
- Scope-aware: a skill registered for one work class is never eligible in another, verified across the whole registry rather than for one example.
- The canonical fixture is reproducible: its positive cases are the selector's output at the recorded revision, and a test asserts that equality field for field.
- The branch is independently mergeable against `origin/main`: it carries the DSI slice and nothing else, and it is rebased onto `bfa56ec…` (see §11).
- Registry consequence: one new canonical contract ⇒ `CONTRACT_RECORD` class change ⇒ `registry_relevant_change: true`, `status: REQUIRED_BUT_BLOCKED` (the Unitera-registry write is its own registered change and is not performed by this slice). See `registry-disposition.json` in this directory. The determination is stated explicitly in the disposition; `affected_records` is non-empty **because** the change is registry relevant, not as a default.
- Open items:
  - Unitera-registry `CONTRACT_RECORD` write for `core/contracts/skill-selection.schema.json`, then a rebind of this disposition to `UPDATED` with the registry `registry_commit_sha` (own gated change, two-phase pattern as in S1 and S4).
  - Owner decisions 1–4 in §7 (the capability derivation, the ordering rule, the recorded candidate set, the scope dimension) are open for the owner.
  - The slice registers no runtime activation path: nothing in the repository calls `selectSkill` yet. Wiring the selector into a workflow runner is a separate, owner-gated step.

## 11. The Rebind Onto `origin/main`

**Why.** The slice was authored on top of the S4 branch `feat/s4-skill-improvement-analyzer-20261020` (`c66cad6e…`), which was a separate, still-open pull request (#50). `origin/main` advanced to `27b17b62800d5d37e14bfe48ecd210603c4e1cb6` (merges #47 "S7 qualification integration" and #48 "S13 benchmark comparison"). As long as the branch carried the S4 commit, it could not be merged independently of #50, and the DSI branch would have dragged the whole S4 slice along. `origin/main` has since advanced further, to `bfa56ec17306ab709be3d492f02ac27150b4661a` — which carries the S8 governance-promotion slice, the S4 skill-improvement-analyzer slice (pull request #50, `bc1d3e2`) and the SII rebind. The second rebind onto that commit is recorded in §11.1.

**What was done.** `git rebase --onto origin/main c66cad6e8eedee982cf5d83d84e082aef51e3dbb` on `feat/dsi-skill-selection-20261020` in `.worktrees/dsi-skill-selection-20261020`. The two DSI commits (`8e3153d…` implementation, `da63d66…` disposition rebind) were replayed onto `origin/main`; the S4 commit was left behind.

**Conflicts.** Five files conflicted — exactly the files that both S4 and DSI edited. Each was resolved by taking `origin/main`'s content and re-applying only DSI's own addition. The added and removed lines of the resolved files are byte-identical to the DSI commit's own amendments (verified by diffing the resolution against the original DSI commit):

| File | Resolution | Net effect against `origin/main` |
|---|---|---|
| `CHANGELOG.md` | keep `origin/main`'s `## Unreleased` block (S7, the disposition-artifact gate, S13, the registration-closure and the reconciliation-map entries) and re-apply DSI's single changelog line as the first entry of the block | +1 line, −0 lines |
| `core/contracts/README.md` | keep `origin/main`'s canonical-file list and every contract paragraph (including S7's, S11's, S13's and S6's); re-apply DSI's list entry after `skill-feedback.schema.json` and DSI's contract paragraph after the S1 feedback paragraph | +3 lines, −0 lines |
| `evals/README.md` | keep `origin/main`'s check list (including the S13 benchmark bullet) and gate-rule block; re-apply DSI's check bullet and DSI's gate-rule line | +2 lines, −0 lines |
| `evals/catalog.json` | keep `origin/main`'s 18 fixture entries; re-apply DSI's `fixtures/maws-vnext/skill-selection.contracts.json` entry after `skill-feedback.contracts.json` | +1 line, −0 lines |
| `package.json` | keep `origin/main`'s script set; re-apply DSI's `validate-skill-selection` script after `validate-skill-feedback` | +1 line, −0 lines |

No S4 content was carried over into the resolution: the S4 changelog line, the S4 contract entry and paragraph, the S4 eval bullet and gate line, the S4 catalog entry and the S4 npm script are all absent from the rebased tree, and `origin/main`'s own entries are all present. The S7 amendment in `core/contracts/materiality-decision.schema.json` was not touched by the rebind at all — it is `origin/main`'s version, with `effective_instruction_digest` occurring exactly once in the `components` enum.

**Files carried over unchanged.** The eight DSI-owned files (`core/contracts/skill-selection.schema.json`, `runtime/skills/skill-registry-loader.mjs`, `runtime/skills/skill-selector.mjs`, `scripts/tools/validate-skill-selection.mjs`, `evals/fixtures/maws-vnext/skill-selection.contracts.json`, `tests/vnext/skill-selection.test.mjs` and the two evidence files) are byte-identical to their pre-rebase versions; only the evidence files were edited, to record the new base and the re-verified totals.

**Resulting diff.** `git diff --name-only 27b17b62800d5d37e14bfe48ecd210603c4e1cb6..HEAD` lists exactly: `CHANGELOG.md`, `core/contracts/README.md`, `core/contracts/skill-selection.schema.json`, `evals/README.md`, `evals/catalog.json`, `evals/fixtures/maws-vnext/skill-selection.contracts.json`, `evidence/dsi-skill-selection-2026-10-20/RUN.md`, `evidence/dsi-skill-selection-2026-10-20/registry-disposition.json`, `package.json`, `runtime/skills/skill-registry-loader.mjs`, `runtime/skills/skill-selector.mjs`, `scripts/tools/validate-skill-selection.mjs`, `tests/vnext/skill-selection.test.mjs`. No S4 file is in it.

## 11.1 The Second Rebind Onto `bfa56ec…`

**Why.** `origin/main` advanced after the first rebind: `bfa56ec17306ab709be3d492f02ac27150b4661a` (merge #53) carries the S8 governance-promotion slice, the S4 skill-improvement-analyzer slice (pull request #50, merged as `bc1d3e2`) and the SII rebind. The branch had to move onto the same base so that the two branches stay comparable and the diff a reviewer sees is against the current canonical tree.

**What was done.** `git rebase origin/main` on `feat/dsi-skill-selection-20261020` in `.worktrees/dsi-skill-selection-20261020`, from the previous landing commit `027900d3da80340e38f278202d8a7b5ad56a5ec9`. The two DSI commits (`9e472a9…` implementation, `027900d…` disposition rebind) were replayed onto `bfa56ec…`; the rebase produced `62bbb16…` (implementation) and `6a43f4d…` (disposition rebind). The same base SHA is used for both rebased branches (S12 and DSI), so the two slices stay consistent with each other.

**Conflicts.** The same five shared files conflicted as in the first rebind: `CHANGELOG.md`, `core/contracts/README.md`, `evals/README.md`, `evals/catalog.json`, `package.json`. This time the resolution rule is **keep BOTH sides** — the base's entry and DSI's own entry — because the base had moved on and now carries the S8 and S4 entries that the first rebind had to drop. Nothing of the base's content was dropped and nothing of DSI's content was dropped:

| File | Base side kept | DSI side kept | Net effect against `bfa56ec…` |
|---|---|---|---|
| `CHANGELOG.md` | the "SII closure run publication" entry and the "S8 - governance promotion" entry (both new in `bfa56ec…`) | the "DSI — dynamic skill selection" entry | +1 line, −0 lines |
| `core/contracts/README.md` | the canonical-file list entry `core/contracts/skill-improvement-proposal.schema.json` | the canonical-file list entry `core/contracts/skill-selection.schema.json` | +1 line, −0 lines |
| `evals/README.md` | the "skill promotion chain" (S8) and "skill-improvement proposal contract checks" (S4) check bullets, and the S4 gate-rule line | the "skill-selection contract checks" check bullet and the DSI gate-rule line | +2 lines, −0 lines |
| `evals/catalog.json` | the `skill-improvement-proposal.contracts.json` entry (and the base's 48 entries as a whole) | the `skill-selection.contracts.json` entry | +1 line, −0 lines |
| `package.json` | the `validate-skill-improvement-proposal` script (and the base's script set as a whole) | the `validate-skill-selection` script | +1 line, −0 lines |

Each resolution was checked mechanically: every line of the base's file and every line of the branch's own file is present in the resolved file, and the resolved file adds exactly the DSI line(s) on top of the base's content. In `evals/catalog.json` the base's `skill-improvement-proposal.contracts.json` entry keeps its trailing comma (the base's own JSON shape) and the DSI entry is added next to it; the fixture set is the exact union of base (48) and DSI (49 entries in total).

**Files carried over unchanged.** The six DSI-owned non-evidence files (`core/contracts/skill-selection.schema.json`, `runtime/skills/skill-registry-loader.mjs`, `runtime/skills/skill-selector.mjs`, `scripts/tools/validate-skill-selection.mjs`, `evals/fixtures/maws-vnext/skill-selection.contracts.json`, `tests/vnext/skill-selection.test.mjs`) are byte-identical to their pre-rebase versions. Only the two evidence files were edited, to record the new base, the re-verified totals and the rebound `implementation_commit_sha`.

**Resulting diff.** `git diff --name-only bfa56ec17306ab709be3d492f02ac27150b4661a..HEAD` lists exactly: `CHANGELOG.md`, `core/contracts/README.md`, `core/contracts/skill-selection.schema.json`, `evals/README.md`, `evals/catalog.json`, `evals/fixtures/maws-vnext/skill-selection.contracts.json`, `evidence/dsi-skill-selection-2026-10-20/RUN.md`, `evidence/dsi-skill-selection-2026-10-20/registry-disposition.json`, `package.json`, `runtime/skills/skill-registry-loader.mjs`, `runtime/skills/skill-selector.mjs`, `scripts/tools/validate-skill-selection.mjs`, `tests/vnext/skill-selection.test.mjs`. No S4 file, no S8 file and no S12 file is in it — those slices are part of the base, not of this branch's diff.

**Verification after the second rebind.** The full local verification was re-run on the rebased tree (§8): `npm run test:vnext` 512/512, `npm run validate`, `validate-neutral`, `validate-maws-vnext` (20 fixture files, 222 cases) and `eval:maws-vnext` (19/19) exit 0, `npm run validate-skill-selection` 26 cases checked / 0 unexpected results, `npm run test:skill-frontdoor` 6/6, `node scripts/tools/ci-gate.mjs` → `PASS CI Gate`, and the direct disposition validation → `{"passed": true, "issues": []}`. The nine mutations were re-applied and re-observed on this tree with identical symptoms (§9). The hosted GitHub Actions job could not run for this branch — the account is locked for a billing issue — so the local reproduction of the workflow is the verification of record and the absence of a hosted run is disclosed rather than presented as a green gate.
