# MAWS — operational safety closure run (2026-10-22)

Date: 2026-10-22. A small, isolated run with three focuses: **the /tmp
incident**, **safe cleanup boundaries**, and **content inspection of the
persisted evidence**.

It adds no capability. It does not re-open the closed S5, S8 or S9 lanes:
their lane test files are not touched, and their closures stay pinned to
their published commits. The source of authority is the owner ticket of
2026-10-22; it authorizes no adoption, no activation, no authority change
and no promotion.

---

## 1. The incident

On 2026-10-21, during the bounded assurance closure run, a cleanup step in
the run's own scratch script executed:

```js
fs.rmSync(path.dirname(outDir), { recursive: true, force: true });
```

`outDir` was a temporary directory created directly under the system
temporary directory, so `path.dirname(outDir)` **was** the system temporary
directory. The call removed `/tmp` — the run's own worktree and four new
source files, which were reconstructed from the conversation context and
re-verified, and the temporary state of other sessions, which was not
reversible.

The call was ordinary. It was `fs.rmSync` on a path computed from something
the script had been handed. The mistake was not the call; it was that
nothing in the call said which directory was being removed, so nothing
could have checked it.

The full account is in
[`docs/harness/cleanup-boundary-and-the-tmp-incident.md`](../../docs/harness/cleanup-boundary-and-the-tmp-incident.md).

## 2. The cleanup boundary

`scripts/tools/safe-remove.mjs` makes that shape fail closed. Six rules,
each with a named refusal code:

| Rule | The refusal |
|---|---|
| The boundary is **explicit**; there is no default | `SAFE_REMOVE_BOUNDARY_MISSING` |
| The target must be **inside** the boundary | `SAFE_REMOVE_OUTSIDE_BOUNDARY` |
| The target must not **contain** the boundary — the incident exactly | `SAFE_REMOVE_IS_ANCESTOR_OF_BOUNDARY` |
| The boundary itself is never removed | `SAFE_REMOVE_IS_BOUNDARY` |
| A symbolic link that points outside the boundary is refused, not followed | `SAFE_REMOVE_SYMLINK_ESCAPE` |
| Removing a **tree** is opt-in: a non-empty directory is refused unless the removal of its content is asked for | `SAFE_REMOVE_NOT_EMPTY` |
| Only **marked** state is removable | `SAFE_REMOVE_MARKER_MISSING` |

The primitive fails closed: when a rule cannot be decided, nothing is
removed. `createScratchRoot` and `removeScratchRoot` make the scratch
lifecycle one shape — a marked root with the working directory inside it.
The marker sits in the root and never in the working directory, because a
test that asserts an empty directory must see an empty directory.

**What the repository does now.** The *harness surface* — the tools under
`scripts/tools/` and their tests under `tests/tools/` — removes no tree
without a boundary check, and a test enforces that. The first case in that
test **is** the incident.

**What it does not cover, named.** The product feature tests and the closed
S5/S8/S9 lane tests still remove their own scratch trees directly. This
bounded run does not re-open those lanes, so they are **reported by the
guard** rather than silently ignored, and the surface can be widened
deliberately in a later run. The count the guard prints is the number to
watch. The production surface — `runtime/` and `scripts/tools/` — was
already clean: no module outside the new primitive removes a tree
recursively.

## 3. The content inspection of the persisted evidence

A run record proves **bytes**: it names every gate output by digest, so an
output that was edited after the capture is detected. That is the
strongest guarantee a digest gives, and it is still not the guarantee a
reader means by "the evidence says the tests passed". A digest proves that
a file has not changed. It does not say what the file contains.

`scripts/tools/validate-evidence-content.mjs` checks the content against a
manifest. Two properties make it worth having:

1. **Completeness.** Every file in the evidence directory must be
   **declared** by the manifest. A file that nobody declared is a file
   nobody looked at, and it fails the check rather than waiting for a
   reader to notice it.
2. **The prose is checked against the machine.** The narrative states
   numbers; the manifest states the same numbers as field values; the
   check compares them. A narrative that drifts from the record it
   describes fails.

The manifest for the assurance closure run of 2026-10-21
(`assurance-evidence-content.json`) checks, among others: the run record's
own totals (`15 / 15` gates, `802` tests, `0` failed), its environment
claim (`LOCAL_REPLICATION`, `hosted_ci_executed: false`), the verdict lines
in the gates' own output (`pass 781`, `source security scan: PASS`,
`PASS CI Gate`), that every one of the fifteen `.exit` files says `0`,
that every probe in the probe record is load-bearing, and that the
narrative's own numbers match the record.

**The manifest found four real mismatches when it was written** — the two
syntax gates produce no output on success, the probe record's array sits at
the document root, and the qualification record does not use the word the
manifest had assumed. Each was corrected in the manifest, not in the
evidence: the check is about what the evidence says, and it was wrong about
what it said.

The check runs in the hosted workflow.

## 4. The capture gate list drifted, and that was fixed too

The assurance capture's gate list had fallen behind the hosted workflow: the
workflow had grown the assurance-run-record check, the evidence content
check, the merge-executor lane binding and two registry disposition
validations, and its security step now runs five test files. A capture
that does not run what the workflow runs is not a replication of it — and
the run record would have claimed a coverage the workflow does not have.
The gate list now mirrors the workflow's steps, and the capture runs **20
gates**.

## 5. Measurement

| | |
|---|---|
| Gates | **20 / 20 passed**, 0 failed |
| Tests | **910 passed, 0 failed** (787 in the vNext suite, 52 in the tools suite, 64 in the merge-executor lane, 6 in the skill frontdoor, 1 in the provider adapter import) |
| Probes | **9 reverted mutation probes, all load-bearing** |
| Runtime | Node v24.19.0 (the workflow's pinned major), linux x64 |
| Parity | `LOCAL_REPLICATION` — `hosted_ci_executed: false` |
| Record | `evidence/operational-safety-closure-2026-10-22/run-record.json`, bound to commit `dde7db268472e3feae72864690bb309ffdbbe3a0` |
| Validator | `passed: true`, no issue |

The probes: the five boundary refusals of the removal primitive, the
harness-surface guard (proved by planting a direct removal in a tool file
and watching the guard catch it), and the three refusals of the content
check. Two of them cascade — neutering a shared guard breaks the tests that
share it — and the cascade is recorded in
`evidence/operational-safety-closure-2026-10-22/mutation-probes.json`.

## 6. What this run does NOT claim

- **No hosted CI result.** The account's Actions admission is closed by a
  billing lock. The wired steps are **published** and have **not run
  there**. Every measurement is a local run under the workflow's pinned
  Node major; the run record says so, and the validator refuses a record
  that says otherwise.
- **No independent human approval.** The verification is tool-based.
- **The cleanup boundary is not a proof that no wrong path can be removed.**
  It proves that a wrong path fails closed against a boundary the caller
  declared. A caller that declares the wrong boundary is still wrong, and
  the boundary does not cover scripts that live outside this repository.
- **The harness surface is not the whole repository.** The product feature
  tests and the closed lane tests still remove their own scratch trees
  directly. They are named, not hidden.
- **The content check is not a re-verification of the gates.** It checks
  what the evidence says. It does not re-run the gates, and it is not a
  semantic analysis of the evidence.
- **No re-opening of S5, S8 or S9**, and no new capability of any kind.

## 7. How to re-check this run

```bash
node scripts/tools/validate-assurance-run-record.mjs \
  evidence/operational-safety-closure-2026-10-22/run-record.json --current
node scripts/tools/validate-evidence-content.mjs --root . \
  evidence/operational-safety-closure-2026-10-22/assurance-evidence-content.json
node --test tests/tools/safe-remove.test.mjs
node --test tests/tools/evidence-content-validation.test.mjs
```

The raw output of every gate is in `gates/`, the digests and the exit codes
are in the record, and the validator re-derives all of it from the
committed material.
