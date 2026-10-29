# PR-Stack Consolidation — 2026-10-29 (round 9)

Class: evidence (stack reconciliation record). Repo: model-agnostic-workflow-system.
Use rule: merge-order and provenance documentation only; merging remains an owner adoption act.

## Situation found

The owner advanced the wave-3 PR #117 head from `6df7163` to `aa43f09`
(57ba7ea "fix(skills): qualify research routing and independent DR-002 cases",
aa43f09 "docs(registry): bind research closure to signed implementation") after
branches #118–#122 had been pushed. The owner delta touches shared behavior
surfaces (`check-behavior.mjs`, `behavior/README.md`, `results.json`), the pinned
run-spec (`runtime/cli/specs/reference-audit-v1.json`), profile fingerprints, and
all regenerated registry surfaces. Additionally, the round-8 provenance-fix
commits (`4d210ef` on #119, `1fae897` on #120) were not in the ancestry of
#121/#122, and #120's fix was not in #121's ancestry — the stack had forked.

## Actions taken (per branch, in order; owner work preserved, never overwritten)

| PR | branch | old tip | new tip | rebase --onto | consolidation commit |
|---|---|---|---|---|---|
| #118 | session/skill-complement-wave4-20261028 | 7f2a2ea | b65983a | aa43f09 | b65983a |
| #119 | session/skill-complement-wave5-20261029 | 4d210ef | 6cbb794 | b65983a | 0c2977e + 6cbb794 (README dedup) |
| #120 | session/skill-complement-wave6-20261029 | 1fae897 | 58402b6 | 6cbb794 | 58402b6 |
| #121 | session/skill-complement-wave7-20261029 | acad349 | a8a7a63 | 58402b6 | a8a7a63 |
| #122 | session/skill-complement-wave8-20261029 | 1f22115 | 3b40475 | a8a7a63 | 3b40475 |

Implementation commits were rewritten by the rebases (dispositions re-bound in
their `registry-disposition.json`; old→new mapping: d8584c8→9a3417b, ae8e3c5→ed0e4d1,
8950f78→6d713da, eab858c→19bbb98, 4bbf6df→c4c7fa6). The two owner commits on #117
are intact and are the direct base of #118. A regen helper transiently committed
by the rebases is removed in each consolidation commit (net absent from every PR diff).

## Conflict resolution rule

Generated surfaces (skill-selection fixture, provider exports, core registries,
results.json) were resolved take-theirs and then **regenerated from source**, not
hand-merged. Shared text (`check-behavior.mjs`, behavior README) was **union-merged**:
the owner's two DR-002 cases and closure section are present in every branch, and
the checker auto-merge was verified (24→27→30→33→36 cases). One artifact of stack
history — a duplicated README provenance section — was deduplicated byte-identically
on #119 and #120 so downstream merges stay clean.

## Regenerated + re-verified state (per branch)

- Fixture snapshots: 7f2a952e (43 skills, #118) → 3faba369 (44, #119) → 60e7cf6e (45, #120)
  → f958f626 (46, #121) → bbc4d035 (47, #122); the two runtime-reproduced records
  re-derived at the contractual `now` values (12:00:00Z happy, 12:05:00Z tie-break).
- Checker: 24/24 → 27/27 → 30/30 → 33/33 → 36/36, coverage closure 1:1 each.
- Re-pin chain re-verified no-op against the owner's re-pinned spec:
  requalify-run-spec dry-run 6/6 digests identical, `written: false` (verified on #118;
  later waves add no bundled skills).
- Battery re-run per branch: `test:vnext` **847/847** (844 + 3 owner research tests),
  `test:skill-frontdoor` 6/6, `validate`/`validate-neutral`/`validate-maws-vnext` 0 issues,
  `validate-skill-selection` 26 cases / 0 unexpected. #118 additionally: overlap 0
  findings, lint 0 errors, `eval:maws-vnext` 27/27, `baum:ci-gate` PASS.

## Provenance precision (round 9 standard, applied across the stack)

- Hash semantics stated in every execution record and the behavior README: hash
  equality proves identical stored bytes; a green checker run proves only that the
  checker's assertions are fulfilled by the stored bytes. Neither is evidence that a
  model produced the bytes — the execution claim rests on recorded invocation
  metadata plus the session transcript.
- `VERBATIM_NEVER_EDITED` is claimed only where a recording of the original output
  exists: single-version git history from the initial commit, or a verbatim-committed
  re-execution. Every verbatim claim is bounded (executing-agent attestation +
  transcript corroboration; none independently witnessed). Where no recording
  exists: EDITED_AFTER_EXECUTION (with the loss documented) or
  NOT_INDEPENDENTLY_VERIFIED.
- Wave 4 (which predates the execution-record convention) was retrofitted:
  `execution-record.json` added, fresh verbatim re-executions under
  `behavior/reexec/wave4/`, integrity hashes over originals + re-executions.

## Valid merge order

Strictly sequential, each PR merged before the next is rebased/merged:

```text
#115 (f5c5fbf) → #116 (d4e5f9f) → #117 (aa43f09, owner head) →
#118 (b65983a) → #119 (6cbb794) → #120 (58402b6) → #121 (a8a7a63) → #122 (3b40475)
```

Each branch's tip is a direct descendant of its predecessor's tip; GitHub reports
all eight PRs MERGEABLE. After any early merge in this order, the remaining stack
needs no rebase (descendants already contain the merged content).

## Scanner status (explicitly open)

Mimosa could not produce a complete scan verdict on the MAWS commits
(library_source/library_source_limit_exceeded, callgraph partial). Commits were
made under the documented compatibility pass — **no project-safety claim is made**,
and a full re-scan remains an open item, separate from the checks above which all
passed.
