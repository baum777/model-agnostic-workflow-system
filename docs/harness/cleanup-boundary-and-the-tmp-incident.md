# Cleanup boundary and the /tmp incident of 2026-10-21

Class: canonical (harness operation).
Use rule: read before removing any directory in a run, a test, or a tool
that this repository owns.

---

## 1. What happened

On 2026-10-21, during the bounded assurance closure run, a cleanup step in
the run's own scratch script executed:

```js
fs.rmSync(path.dirname(outDir), { recursive: true, force: true });
```

`outDir` was a temporary directory created directly under the system
temporary directory, so `path.dirname(outDir)` was the system temporary
directory itself. The call removed `/tmp`.

What survived in that directory, and what did not:

- The run's own git worktree and four new source files were destroyed. They
  were reconstructed from the conversation context and re-verified; every
  test that covers them is green again.
- Other sessions' temporary state was destroyed with it. That part is not
  reversible and was not reconstructed.
- The system temporary directory itself survived, because the removal
  aborted partway. A later removal could have succeeded where this one
  did not.

The call was not exotic. It was `fs.rmSync` on a path computed from
something the script had been handed. That is the shape almost every
cleanup in the repository has.

## 2. Why it was not caught

Three things were true at the same time, and each of them is common:

1. **The cleanup was in a scratch script, not in the repository.** A guard
   that only covers committed code cannot see it. The repository now owns
   the mechanism, but a script written outside the repository can still
   bypass it — and the discipline it replaces is "derive the path, then
   remove it".
2. **The path was derived, not named.** The author believed the value was
   the temporary directory. It was its parent. Nothing in the call said
   which directory was being removed, so nothing could have checked it.
3. **There was no boundary to check against.** A removal without a limit
   is not a removal of a specific thing; it is a removal of whatever the
   computed path happens to be.

The test that would have caught it did not exist, because a test cannot
assert on a call that was never made in a committed file.

## 3. The rule

**A removal names what it removes, and the boundary it is checked against.**

Concretely, four rules:

1. **The boundary is explicit.** There is no default boundary. A caller
   must name what it owns.
2. **The target must be inside the boundary.** A target outside it, or the
   boundary itself, is refused.
3. **The target must not contain the boundary.** This is the incident
   exactly: removing a directory that *contains* the boundary would take
   the boundary and everything above it.
4. **Ownership is marked.** Scratch state carries a marker, and only
   marked state is removable. A mistyped path cannot remove state that
   belongs to someone else.

And two that are about the call rather than the path:

5. **Removing a tree is opt-in.** `recursive` is a separate decision from
   "remove this", so the two cannot be confused.
6. **The primitive fails closed.** When a rule cannot be decided, the
   removal is refused. It never removes anything as a side effect of a
   decision it could not make.

## 4. Where the mechanism lives

`scripts/tools/safe-remove.mjs`:

- `safeRemove({ target, boundary, recursive, marker, dryRun })` — the
  primitive. Every refusal has a named code.
- `createScratchRoot({ prefix, parent })` — scratch state in ONE shape: a
  marked root with the working directory inside it. The marker sits in the
  root, never in the working directory, because a test that asserts an
  empty directory must see an empty directory.
- `removeScratchRoot({ root, marker, parent })` — the matching removal.

The command line is the same boundary, for use from a shell:

```bash
node scripts/tools/safe-remove.mjs --boundary <dir> --target <path> [--recursive] [--marker <name>] [--dry-run]
```

It answers `0` on a removal, `1` on a refusal and `2` on a usage error,
and prints the refusal code.

## 5. What the repository does now

The **harness surface** — the tools under `scripts/tools/` and their tests
under `tests/tools/` — removes no tree without a boundary check. A test
(`tests/tools/safe-remove.test.mjs`) enforces that, and the first case in
it is the incident itself: a target that contains the boundary is refused.

The rest of the repository is **reported, not hidden**: the product feature
tests and the closed S5/S8/S9 lane tests still remove their own scratch
trees directly. This bounded run does not re-open those lanes, so their
state is named in the guard's own output and the surface can be widened
deliberately in a later run. The count is the number to watch.

## 6. What this does not claim

- **It does not make a wrong path impossible.** It makes a wrong path
  fail closed against a boundary the caller declared. A caller that
  declares the wrong boundary is still wrong.
- **It does not cover scripts that live outside the repository.** The
  incident happened in one. The mechanism is available to such a script,
  but nothing forces it to be used.
- **It does not replace reading the path.** The boundary is a check, not
  an understanding. A removal whose target was miscomputed inside a
  correctly declared boundary still removes the wrong thing.
- **It does not re-open the closed lanes.** The S5, S8 and S9 lane tests
  are untouched by this run and keep their own scratch handling.

## 7. Bounded scope, inventoried (reconciliation 2026-10-22)

The deletion protection is a claim about the **harness surface** —
`scripts/tools/` and `tests/tools/` — and only about it. That scope
boundary is now a durable artifact instead of a printed count:
`scripts/tools/inventory-removal-calls.mjs` re-derives the inventory with
the same per-call semantics as the guard, and the result is committed as
[`evidence/assurance-reconciliation-2026-10-22/removal-call-inventory.json`](../../evidence/assurance-reconciliation-2026-10-22/removal-call-inventory.json).

The inventory is a LIVING artifact. At the reconciliation commit it held:
harness surface clean; **64 direct recursive removal calls in 7
closed-lane vnext test files**. The first regeneration became necessary
the same day, when the S9 lane landed `tests/vnext/regression-eval.test.mjs`
with one direct recursive removal: the committed inventory now holds the
harness surface clean with **65 direct recursive removal calls in 8 vnext
test files** (instruction-auditor 6, instruction-bundle 7,
instruction-inventory 3, instruction-resolver 5,
instruction-semantic-signals 1, regression-eval 1,
run-skill-effectiveness 6, s5-path-confinement 36). These files belong to
closed or foreign lanes; widening the surface to them is a later run's
decision, made against this inventory rather than against a guess. The
anti-rot test `tests/tools/assurance-reconciliation.test.mjs` fails
whenever the live inventory drifts from the committed artifact — the
first regeneration exists precisely because it did — so the boundary can
only change deliberately.

The separation between the closed technical fix and the incomplete
consequence accounting of the incident itself is recorded in
[`evidence/assurance-reconciliation-2026-10-22/incident-consequence-record.md`](../../evidence/assurance-reconciliation-2026-10-22/incident-consequence-record.md).
