# S5 Path Confinement — Implementation Run Record

- Run: S5-PATH-CONFINEMENT-2026-10-21
- Scope: the S5 skill-effectiveness corpus loader (`scripts/tools/run-skill-effectiveness-evals.mjs`) and its CLI corpus-directory check. A bounded closure of the path-confinement finding that the HO-01 lane's independent review raised and deliberately did not repair.
- Repository: `baum777/model-agnostic-workflow-system` (MAWS), branch `fix/s5-path-confinement-20261021`, base `origin/main` at `2f94f8c5eab6ae3216b9dd0551a03624a88fd55c`.
- Authority: the owner ticket "S5 Path-Confinement Closure" of 2026-10-21, bounded to this slice. The target specification MAWS-SII-TARGET-SPEC-001 v0.2.0 remains PROPOSED; this run materializes no part of it and adopts nothing.
- Inherits the S5 slice: MAWS-SII-TARGET-SPEC-001 v0.2.0 slice S5 (Behavioral Evaluation), first published in pull request 35 and repaired in pull request 37.

## 1. The defect this closes

The S5 corpus loader resolved every corpus-declared path lexically:

```js
function resolveInside(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  if (!resolved.startsWith(path.resolve(rootDir) + path.sep)) {
    throw new EvalConfigError('CORPUS_PATH_ESCAPES_ROOT', relativePath);
  }
  return resolved;
}
```

A lexical comparison answers "does the *string* start with the base". It does not answer "does the *material* live in the base". Three concrete escapes follow:

| # | Escape | Consequence |
| --- | --- | --- |
| E1 | a family file that is a symbolic link to a file outside the corpus directory | the loader measures material the corpus does not contain |
| E2 | a family file reached through a symlinked *parent* directory inside the corpus | the declared path is lexically inside; the material is not |
| E3 | a corpus directory that is itself a symbolic link out of the repository (CLI `--corpus`) | the run evaluates a corpus that is not this repository's corpus |

The same finding was reached independently by the HO-01 lane's independent review, which confirmed the escape by reproducing it against the shared module, and was recorded in the HO-01 disposition as *"the second review confirmed that a second, purely lexical `resolveInside` lives in the shared S5 evaluation module (`scripts/tools/run-skill-effectiveness-evals.mjs:79`) and that `loadCorpus` there follows a symlink out of the corpus directory, so the S5 skill-effectiveness lane can measure material outside the repository."* That lane named the finding and deliberately left the module untouched, because the module is the S5 lane's surface. This run is that lane.

## 2. What changed

| Surface | Change |
| --- | --- |
| `scripts/tools/path-confinement.mjs` | **New.** The shared path-confinement primitive. Proves containment twice (lexically and in real terms) and binds every read to a verified file descriptor. |
| `scripts/tools/run-skill-effectiveness-evals.mjs` | The corpus loader now confines every declared path — the manifest, each family file, each variant case file — to the corpus directory in real terms, and reads each through a verified descriptor. The CLI additionally requires the corpus directory to *resolve* inside the repository. |
| `tests/vnext/s5-path-confinement.test.mjs` | **New.** 14 negative and regression tests. |
| `evidence/s5-path-confinement-2026-10-21/` | This run record and the registry disposition. |
| `CHANGELOG.md` | One entry under `Unreleased`. |

`tests/vnext/run-skill-effectiveness.test.mjs` is **byte-identical** to its state on `origin/main` — the existing S5 regression suite was not edited, only re-run.

## 3. The containment rule

`scripts/tools/path-confinement.mjs` exports `confineFileToBase` (the check) and `readConfinedFile` (the read). A path is accepted only if all four hold:

| | Check | What it defeats |
| --- | --- | --- |
| **C1** | the declared path is relative and stays lexically inside the base | an absolute path, or a path that climbs out with `..` |
| **C2** | the **real** path of the target stays inside the **real** path of the base | a symlink inside the base that points outside it, and a symlinked parent directory that carries the target out |
| **C3** | the content is read through a descriptor opened with `O_NOFOLLOW` on the verified real path, and the descriptor's identity (device + inode) is compared with the identity observed during the check | a target replaced between the check and the read |
| **C4** | the target must be a regular file | a directory, a FIFO or a device read as material (a FIFO would block the reader forever) |

C2 is the check a lexical comparison cannot make: the link may point anywhere. C3 is the check a path comparison cannot make: the file may be swapped between the check and the read, and the swap is detected by the descriptor's identity rather than by the path.

C3 compares three identities: the opened descriptor against the file observed during the check, and the parent directory against the parent directory observed during the check.

### Error vocabulary

The primitive raises typed `PathConfinementError`s; the corpus loader maps them into its own vocabulary, so the loader's contract with its callers does not change shape:

| Primitive code | Corpus code | Meaning |
| --- | --- | --- |
| `PATH_ABSOLUTE_NOT_ALLOWED`, `PATH_ESCAPES_BASE`, `PATH_INVALID` | `CORPUS_PATH_ESCAPES_ROOT` | the declared path leaves the corpus (unchanged from before) |
| `PATH_ESCAPES_BASE_THROUGH_SYMLINK`, `PATH_IS_A_SYMLINK` | `CORPUS_PATH_SYMLINK_ESCAPE` | the path resolves outside the corpus through a symbolic link (**new**) |
| `PATH_NOT_A_FILE` | `CORPUS_PATH_NOT_A_FILE` | the target is not a regular file (**new**) |
| `PATH_CHANGED_DURING_RESOLUTION` | `CORPUS_PATH_CHANGED` | the target was replaced between the check and the read (**new**) |
| `PATH_BASE_UNRESOLVABLE` | `CORPUS_DIR_INVALID` | the corpus directory itself could not be resolved (**new**) |
| `PATH_NOT_FOUND`, `PATH_NOT_READABLE` | `CORPUS_FILE_INVALID` | the file could not be read (unchanged from before) |

The CLI check is separate and lives at the corpus-directory level: `assertCorpusInsideRepository` raises `CORPUS_DIR_ESCAPES_REPO` when the corpus directory resolves outside the repository.

## 4. TOCTOU — what is limited and what is not

**Technically limited.** C1–C4 close the static escape (the symlink and the parent-directory symlink) and the *detectable* swap: a target replaced between the check and the read is refused, because the descriptor's device and inode no longer match the identity that was checked, and because the parent directory's identity is re-verified.

**Residual, documented, not eliminated.** C1–C4 do **not** close a race in which a concurrent writer replaces the *parent directory* of the target between the containment check and the open, and the replacement carries a file with the same device and inode identity. Closing that requires `openat(2)` with `O_NOFOLLOW` relative to a trusted directory descriptor, which Node's public API does not expose. The threat requires a concurrent writer with write access to the working tree that already holds the corpus. This residual follows the precedent already recorded in this repository for the same class of path handling (`evidence/maws-security-repair-2026-10-20/RUN.md`: *"Path handling remains subject to ordinary local filesystem race residuals; no adversarial parallel symlink swap penetration test is claimed."*).

**What is claimed and what is not.** The *detector* is bound by a test: the target is replaced between the confinement and the read and the read is refused. An adversarial *parallel* symlink swap is **not** claimed as tested, and no penetration test was run against a live concurrent swap.

## 5. Verification (executed)

### 5.1 The S5 lane's own gates

| Gate | Result |
| --- | --- |
| `node --test tests/vnext/run-skill-effectiveness.test.mjs` | **12/12 pass, 0 fail** — the existing suite, byte-identical to `origin/main` |
| `node --test tests/vnext/s5-path-confinement.test.mjs` | **14/14 pass, 0 fail** (new) |
| `npm run test:vnext` | **667/667 pass, 0 fail** (`origin/main` alone: 653/653 — the 14 new tests are the only difference) |
| `npm run eval:skill-effectiveness` | exit 0, final verdict `IMPROVEMENT_PROVEN` |
| `npm run validate-behavioral-eval` | PASS |
| `npm run eval:maws-vnext` | PASS |
| `npm run validate` / `validate-neutral` / `validate-maws-vnext` / `validate-secrets` / `scan-secrets` | PASS (all five) |
| `git diff --check` | clean |

### 5.2 The change is digest-neutral (measured against pristine `origin/main`)

A detached worktree at `origin/main` (`2f94f8c`) was used as the reference. The S5 evaluation output is **identical** before and after the change:

| Digest | `origin/main` | this branch |
| --- | --- | --- |
| baseline `corpus_digest` | `sha256:937478a9…42fc9` | `sha256:937478a9…42fc9` |
| candidate `corpus_digest` | `sha256:3e5116fe…fb54` | `sha256:3e5116fe…fb54` |
| baseline `content_digest` | `sha256:e370dca9…a13dd` | `sha256:e370dca9…a13dd` |
| candidate `content_digest` | `sha256:08724a06…4d0` | `sha256:08724a06…4d0` |
| all four family digests (both arms) | — | identical |

The HO-01 comparison chain (which imports `loadCorpus` from this module) was re-run on both trees: the produced comparison records are **identical** apart from `created_at`. The `HO-01` decision (`REGRESSION`), the metrics (`output_assertion_pass_delta −0.1875`, `routing_accuracy_delta 0`, `security_regressions 0`), the run-evidence digests, the analysis-output digests and both behavioral-eval record digests are unchanged.

### 5.3 The new tests

| Test | What it binds |
| --- | --- |
| a case file that is a symlink out of the corpus is refused | E1 → `CORPUS_PATH_SYMLINK_ESCAPE` |
| a variant case file that is a symlink out of the corpus is refused | E1 on the variant path |
| a case file reached through a symlinked parent directory is refused | E2 → `CORPUS_PATH_SYMLINK_ESCAPE` |
| a symlink that stays inside the corpus is accepted and hashes identically | the confinement is not a blanket ban on links; the digest still binds the logical path |
| an absolute case file path is refused | C1 |
| a case file path that climbs out of the corpus is refused | C1 (the pre-existing behaviour, re-bound) |
| a case file that is a directory is refused instead of being read | C4 |
| a case file that is a FIFO is refused instead of blocking the reader | C4, and the loader cannot hang |
| a target replaced between the containment check and the read is detected | C3 |
| the corpus error vocabulary maps the read-time refusal to a corpus code | the S5 code path for the read-time refusal |
| a corpus directory outside the repository is refused | the CLI check, at the function boundary |
| a corpus directory that resolves out of the repository is refused at the CLI | E3, end to end (exit code 3) |
| the shipped corpus still loads and still proves the candidate improvement | the positive control |
| the committed S5 eval records still validate against the current runner | the committed evidence stays contract-valid |

### 5.4 Security scan — disclosed, not claimed

A Mimosa deep static scan of the changed files was run: scan `scan-2026-10-21T02-55-05.384Z-47f1c429a877`, seal `sha256:1d7576ee1de5d6fb3b3f32fb81f86ed6111c017fc8522dd70296255be4b2fde8`, **0 findings**, 198 packages scanned, 2 packages matching 2 advisories in the offline dependency snapshot (context only, not adjudicated). The scan's own coverage artifact records `completeness: partial`, `runStatus: inconclusive` and a gap ("the call graph is partly incomplete: some calls are dynamically dispatched or beyond the analysis scale, so cross-file reachability may be incomplete"), 34 files selected and parsed. **No security claim is derived from this scan.** It is static-only and executes no runtime.

Separately, the repository's Mimosa **pre-commit hook** did not produce a complete scan conclusion for the implementation commit (`scanner_enobufs`); the commit was made under the compatibility policy, and **no security claim is derived from the hook either**.

## 6. Pre-existing drifts found, named, and deliberately not repaired here

Both were measured on the pristine `origin/main` worktree and are **not** caused by this run. Both are reported rather than silently repaired, because repairing them would absorb another lane's drift into this bounded slice and would change digest-bound evidence that the Registry and the Atlas already reference.

**D1 — the HO-01 committed comparison record no longer validates on `origin/main`.**
`npm run validate-experiment-comparison` fails on the untouched `origin/main` with `E13`: the record references definition digest `sha256:a17bd3f2…9ac9dc`, the recomputed digest is `sha256:5315fa3d…0ba71f`. Cause: the S7/S8 residual lane re-pinned the HO-01 experiment's frozen run-spec digest in commit `a55c8a1` ("re-pin the cross-lane inputs this run legitimately changes") without re-deriving the HO-01 comparison record that binds it. The re-derived record differs from the committed one in exactly three fields (`definition_digest`, `runs.baseline.spec_digest`, `runs.candidate.spec_digest`); the evidence digests, the analysis-output digests, the metrics and the decision are unchanged. **Owner: the HO-01 lane (or the S8 lane that caused the re-pin).** Not repaired here: the HO-01 evidence and its Registry/Atlas representations are a separate, already-closed chain, and the HO-01 ticket's own scope forbids an unannounced expansion into it.

**D2 — the committed S5 eval records no longer match the current corpus.**
The committed `evidence/skill-effectiveness-evals-2026-10-20/eval-record-bev-skill-effectiveness-baseline.json` carries `corpus_digest` `sha256:7c3a7a80…5c7ad1`; the current corpus produces `sha256:937478a9…42fc9`. The difference is the `negative` family only (`sha256:d4b80eb1…0d5ac` committed vs `sha256:e87e4a58…8ce580` current). Cause: the S7 slice changed `evals/skill-effectiveness/negative-cases/cases.json` in commit `4d99c27` without regenerating the S5 evidence. The records remain contract-valid and their own content seals hold; they describe a corpus state that the tree has since left. **Remediation (owner decision):** re-run `npm run eval:skill-effectiveness` with `--out` into the evidence directory and refresh the two records. Not done here, because this run must not rewrite the evidence of a prior run whose record is referenced by the closed Registry and Atlas chains.

**Neither D1 nor D2 is a consequence of this change.** Section 5.2 measures that directly: on the same corpora, the pristine tree and this branch produce identical digests.

## 7. Independent review

See section 9 — the review outcome is appended after the review round; this record is not the review.

## 8. Registry disposition

`registry-disposition.json` in this directory: `status: NO_CHANGE`, `material_change: true`, `registry_relevant_change: false`, `affected_records: []`, `registry_commit_sha: null`.

The reason is the consumer binding in this repository's `AGENTS.md`: MAWS has adopted only the relevance classes `CONTRACT_RECORD`, `PROVENANCE` and `SUPERSESSION`, and this run changes none of them. The canonical contract `core/contracts/behavioral-eval.schema.json` is untouched, the behavioral-eval validator is untouched, the corpus content is untouched, the record format is untouched, the digests are unchanged (§5.2), and nothing is superseded. The runner is a tool surface, not a registered contract.

The change itself is still registered, as the Unitera project routing layer requires for **every** change: a run change registration in the Unitera Registry and a representation in the Unitera Atlas. Those are published after the source merge, and this record names them in the closure addendum (§9).

## 9. Closure addendum

*Filled after the review, the source merge, the Registry publication and the Atlas publication.*
