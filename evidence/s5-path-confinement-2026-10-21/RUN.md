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

The same finding was reached independently by the HO-01 lane's independent review. It is recorded in the HO-01 **disposition** (`evidence/local-optimization-comparison-2026-10-21/registry-disposition.json`, the `reason` field) as: *"the second review confirmed that a second, purely lexical resolveInside lives in the shared S5 evaluation module (`scripts/tools/run-skill-effectiveness-evals.mjs:79`) and that loadCorpus there follows a symlink out of the corpus directory, so the S5 skill-effectiveness lane can measure material outside the repository."* That lane named the finding and deliberately left the module untouched, because the module is the S5 lane's surface. This run is that lane.

## 2. What changed

| Surface | Change |
| --- | --- |
| `scripts/tools/path-confinement.mjs` | **New.** The shared path-confinement primitive. Proves containment twice, binds the read to a verified file descriptor, and refuses a material that carries more than one link. |
| `scripts/tools/run-skill-effectiveness-evals.mjs` | The corpus loader now confines every declared path — the manifest, each family file, each variant case file — to the corpus directory in real terms, and reads each through a verified descriptor. The manifest is validated instead of crashing on a malformed one, the CLI additionally requires the corpus directory to *resolve* inside the repository, and the corpus root is re-anchored after the load. |
| `tests/vnext/s5-path-confinement.test.mjs` | **New.** 22 negative and regression tests. |
| `evidence/s5-path-confinement-2026-10-21/` | This run record and the registry disposition. |
| `CHANGELOG.md` | One entry under `Unreleased`. |

`tests/vnext/run-skill-effectiveness.test.mjs` is **byte-identical** to its state on `origin/main` — the existing S5 regression suite was not edited, only re-run.

## 3. The containment rule

`scripts/tools/path-confinement.mjs` exports `confineFileToBase` (the check) and `readConfinedFile` (the read). A path is accepted only if all five hold:

| | Check | What it defeats |
| --- | --- | --- |
| **C1** | the declared path is relative and stays lexically inside the base | an absolute path, or a path that climbs out with `..` |
| **C2** | the **real** path of the target stays inside the **real** path of the base | a symlink inside the base that points out, and a symlinked parent directory that carries the target out |
| **C3** | the read goes through a descriptor opened with `O_NOFOLLOW` and `O_NONBLOCK` on the verified real path, and the descriptor's device+inode identity — and the parent directory's identity — are compared with the identities observed during the check | a target **replaced** in the window; a FIFO that would otherwise block the open forever |
| **C4** | the target must be a regular file | a directory, a FIFO or a device read as material |
| **C5** | the target must carry exactly **one** link | a hardlink, which shares its inode with another name and whose real path is its own path, so that C2 cannot see that the material also exists outside the base |

C2 is the check a lexical comparison cannot make: the link may point anywhere. C3 is the check a path comparison cannot make: the file may be swapped between the check and the read, and the swap is detected by the descriptor's identity rather than by the path. C5 exists because a hardlink has no second path: `realpath` of a hardlink is the hardlink's own path, so only the link count reveals the second name.

### Error vocabulary

The primitive raises typed `PathConfinementError`s; the corpus loader maps them into its own vocabulary, so the loader's contract with its callers does not change shape:

| Primitive code | Corpus code | Meaning |
| --- | --- | --- |
| `PATH_ABSOLUTE_NOT_ALLOWED`, `PATH_ESCAPES_BASE`, `PATH_INVALID` | `CORPUS_PATH_ESCAPES_ROOT` | the declared path leaves the corpus (unchanged from before) |
| `PATH_ESCAPES_BASE_THROUGH_SYMLINK`, `PATH_IS_A_SYMLINK` | `CORPUS_PATH_SYMLINK_ESCAPE` | the path resolves outside the corpus through a symbolic link (**new**) |
| `PATH_NOT_A_FILE` | `CORPUS_PATH_NOT_A_FILE` | the target is not a regular file (**new**) |
| `PATH_MULTIPLE_LINKS` | `CORPUS_PATH_MULTIPLE_LINKS` | the target has more than one link (**new**) |
| `PATH_CHANGED_DURING_RESOLUTION` | `CORPUS_PATH_CHANGED` | the target was replaced between the containment check and the read (**new**) |
| `PATH_BASE_UNRESOLVABLE` | `CORPUS_DIR_INVALID` | the corpus directory itself could not be resolved (**new**) |
| `PATH_NOT_FOUND`, `PATH_NOT_READABLE` | `CORPUS_FILE_INVALID` | the file could not be read (unchanged from before) |

The corpus loader adds its own manifest codes: `CORPUS_VARIANTS_INVALID` (the manifest declares no usable variants), `CORPUS_FAMILY_EMPTY` (a blocking family would contribute no case and could therefore never block) and `CORPUS_FAMILY_INVALID` (an unknown `via`, or a family other than `positive` declared `via: variant`). The CLI check is separate and lives at the corpus-directory level: `assertCorpusInsideRepository` raises `CORPUS_DIR_ESCAPES_REPO` when the corpus directory resolves outside the repository, and `assertCorpusUnchanged` raises `CORPUS_DIR_CHANGED` when the corpus root was replaced between the anchor and the load.

### Surfaces that are deliberately NOT confined

`--baseline-record`, `--out` and `--executor-module` are **operator** surfaces: they act with the invoking operator's own authority. `--out` writes the record wherever the operator named and creates the directories above it; `--baseline-record` reads the file the operator named; `--executor-module` imports the module the operator named, which is code execution by design. The trust boundary that actually gates a verdict is not those paths but the supplied baseline record, which is validated against its own content seal and bound to this corpus, this mode and this subject before it is compared (`BASELINE_RECORD_INVALID` / `BASELINE_RECORD_MISMATCH`). This is now stated in the runner's header.

## 4. TOCTOU — what is limited and what is not

**Technically limited.** C1–C5 close the static escape (the symlink, the symlinked parent directory, the hardlink) and the *detectable* swap: a target replaced between the check and the read is refused, because the descriptor's device and inode no longer match the identity that was checked, and because the parent directory's identity is re-verified. A FIFO that appears in the window cannot block the reader: the open carries `O_NONBLOCK`, the descriptor is produced at once, and C4 refuses it.

**Residual, documented, not eliminated.** Four residuals remain, and none of them is claimed as closed:

| | Residual |
| --- | --- |
| **R1** | C3 detects the **replacement** of a target, not an in-place rewrite of the same inode. A writer that truncates and rewrites the file between the check and the read keeps the device and inode identity, so the mutation is not detected here. Such a writer holds write access to the material and could equally have written the corpus before the run; the mutation is visible in the corpus digest that the record carries. |
| **R2** | C1–C5 do not close a race in which a concurrent writer replaces the **parent directory** of the target between the containment check and the open, and the replacement carries a file with the same device and inode identity. Closing that would require `openat(2)` with `O_NOFOLLOW` relative to a trusted directory descriptor, which Node's public API does not expose. |
| **R3** | A filesystem that has itself stopped responding can still block in the kernel. `O_NONBLOCK` keeps a FIFO from blocking the *open*, and the regular-file guard then refuses it, but no user-space flag prevents a hung mount from blocking a read. |
| **R4** | A bind mount inside the base is not detected: the real path of a bind-mounted file is its own path inside the base. Creating one requires privileges that already exceed the read. |

The corpus root is anchored before the load and re-anchored after it, so a corpus directory that was replaced while it was being read is refused before any record is produced. A replacement that is undone before the second anchor is not caught; that is R2 with a different subject.

The threat behind R1, R2 and R4 requires a concurrent writer with write access to the working tree that already holds the material. This follows the precedent already recorded in this repository for the same class of path handling (`evidence/maws-security-repair-2026-10-20/RUN.md`: *"Path handling remains subject to ordinary local filesystem race residuals; no adversarial parallel symlink swap penetration test is claimed."*).

**What is claimed and what is not.** The *detector* is bound by a test: the target is replaced between the confinement and the read and the read is refused, and the parent-directory branch of that detector has its own test. An adversarial *parallel* symlink swap is **not** claimed as tested, and no penetration test was run against a live concurrent swap.

## 5. Verification (executed)

### 5.1 The S5 lane's own gates

| Gate | Result |
| --- | --- |
| `node --test tests/vnext/run-skill-effectiveness.test.mjs` | **12/12 pass, 0 fail** — the existing suite, byte-identical to `origin/main` |
| `node --test tests/vnext/s5-path-confinement.test.mjs` | **22/22 pass, 0 fail** (new) |
| `npm run test:vnext` | **675/675 pass, 0 fail** (`origin/main` alone: 653/653 — the 22 new tests are the only difference) |
| `npm run eval:skill-effectiveness` | exit 0, final verdict `IMPROVEMENT_PROVEN` |
| `npm run validate-behavioral-eval` | PASS |
| `npm run eval:maws-vnext` | PASS |
| `npm run validate` / `validate-neutral` / `validate-maws-vnext` / `validate-secrets` / `scan-secrets` | PASS (all five) |
| `git diff --check` | clean |

### 5.2 The change is digest-neutral (measured against pristine `origin/main`)

A detached worktree at `origin/main` (`2f94f8c`) is the reference. The S5 evaluation output is **identical** before and after the change:

| Digest | `origin/main` | this branch |
| --- | --- | --- |
| baseline `corpus_digest` | `sha256:937478a9…42fc9` | `sha256:937478a9…42fc9` |
| candidate `corpus_digest` | `sha256:3e5116fe…7b54` | `sha256:3e5116fe…7b54` |
| baseline `content_digest` | `sha256:e370dca9…a13dd` | `sha256:e370dca9…a13dd` |
| candidate `content_digest` | `sha256:08724a06…64d0` | `sha256:08724a06…64d0` |
| negative family `corpus_digest` (both arms) | `sha256:e87e4a58…9de48d` | `sha256:e87e4a58…9de48d` |

The HO-01 comparison chain (which imports `loadCorpus` from this module) was re-run on both trees: the produced comparison records are **identical** apart from `created_at`. The `HO-01` decision (`REGRESSION`), the metrics (`output_assertion_pass_delta −0.1875`, `routing_accuracy_delta 0`, `security_regressions 0`), the run-evidence digests, the analysis-output digests and both behavioral-eval record digests are unchanged.

The full `npm run eval` certification suite fails in this environment at the render and accessibility kinds with `spawn /home/baum/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome ENOENT` (the local cache holds `chromium-1234`). The identical failure was reproduced on the untouched `origin/main` tree in the same environment, so it is a pre-existing environment limitation and not a regression of this change. Those kinds are not claimed as verified.

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
| a case file that is a FIFO is refused instead of blocking the reader | C4, and the loader cannot hang on a FIFO present at check time |
| a target replaced between the containment check and the read is detected | C3, target branch |
| a FIFO swapped in after the check cannot block the read | C3 + `O_NONBLOCK`: the open must not wait for a writer |
| a case file that is a hardlink to a file outside the corpus is refused | C5 → `CORPUS_PATH_MULTIPLE_LINKS` |
| a parent directory replaced after the check is detected | C3, parent branch (the file inode is unchanged; only the parent differs) |
| the corpus error vocabulary maps the read-time refusal to a corpus code | the S5 code path for the read-time refusals |
| a manifest without variants is refused with a corpus code | `CORPUS_VARIANTS_INVALID` instead of a raw `TypeError` |
| a family that declares an unknown `via` is refused | `CORPUS_FAMILY_INVALID` |
| a blocking family that would contribute no case is refused | the ghost `via: variant` family cannot silently drop a family from the measurement |
| a corpus directory outside the repository is refused | the repository boundary, at the function boundary |
| a corpus directory that resolves out of the repository is refused | the real-path branch, against a fake repository root in a temp directory |
| a corpus path that leaves the repository is refused at the CLI | the CLI wiring, without a write into the repository |
| a corpus directory that resolves out of the repository is refused at the CLI | the CLI wiring, end to end; the link lives under `artifacts/`, the repository's ignored output directory |
| the shipped corpus still loads and still proves the candidate improvement | the positive control |
| the committed S5 eval records still validate against the current runner | the committed evidence stays contract-valid |

### 5.4 Security scan — disclosed, not claimed

A Mimosa deep static scan of the changed files was run: scan `scan-2026-10-21T02-55-05.384Z-47f1c429a877`, seal `sha256:1d7576ee1de5d6fb3b3f32fb81f86ed6111c017fc8522dd70296255be4b2fde8`, **0 findings**, 198 packages scanned, 2 packages matching 2 advisories in the offline dependency snapshot (context only, not adjudicated). The scan's own coverage artifact records `completeness: partial`, `runStatus: inconclusive` and a gap ("the call graph is partly incomplete: some calls are dynamically dispatched or beyond the analysis scale, so cross-file reachability may be incomplete"), 34 files selected and parsed. **No security claim is derived from this scan.** It is static-only and executes no runtime.

The commit hook that reported on the commits of this change is a **session-level plugin hook of the authoring environment**, not a repository-level hook: the repository itself has no `core.hooksPath`, no hook directory other than the untouched `*.sample` files, and no husky or other hook configuration. The hook reported that it could not produce a complete scan conclusion, and the commit proceeded under that environment's compatibility behaviour. **No security claim is derived from the hook either** — the phrase is not a repository document and is not cited as one.

## 6. Independent review

An independent review was executed on a model **different** from the one that wrote the slice, with one independent confirmer per finding: three review lenses (a) *gaps in the new confinement*, (b) *regression and behavioural neutrality*, (c) *evidence integrity and the depth of the claims*, each in its own fresh context, and every finding of every lens was re-reproduced by a separate confirmer from its evidence alone. The reviewers worked read-only in the repository and used `/tmp` for their own probes.

**Outcome: 13 findings confirmed, 1 refuted.** Every confirmed finding was repaired in the same change, and the repairs are listed in §7.

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| F1 | P2 | A FIFO swapped in for the target between the check and the open blocks `fs.openSync` forever, so the C4 guard never runs and the loader hangs — falsifying the claim "the loader cannot hang". | **Repaired.** The open now carries `O_NONBLOCK`, so the descriptor is produced at once and C4 refuses the FIFO. Bound by a new test. |
| F2 | P3 | C3 detects the replacement of a target, not an in-place rewrite of the same inode; such a rewrite is returned unrefused. | **Documented as residual R1**, and the claim wording was corrected ("replaced", not "changed"). |
| F3 | P3 | A hardlink inside the corpus to a file outside it passes the confinement and the outside content is read. | **Repaired.** C5 refuses a target with more than one link (`CORPUS_PATH_MULTIPLE_LINKS`). Bound by a new test. |
| F4 | P3 | The repository boundary is anchored once and never re-anchored; a corpus-root swap between the anchor and the load re-points the entire confinement. | **Repaired.** The corpus root is re-anchored after the load and a changed root is refused (`CORPUS_DIR_CHANGED`). |
| F5 | P3 | The manifest surfaces around `variants` and `via` are unclassified: a manifest without `variants` throws a raw `TypeError`; a family declared `via: variant` other than `positive` is never confined and never read, so a blocking family contributes no case and the security gate can pass with zero security cases measured. | **Repaired.** `CORPUS_VARIANTS_INVALID`, `CORPUS_FAMILY_EMPTY` and a `via` validation; a blocking family that would contribute no case is refused. |
| F6 | P3 | The three operator surfaces (`--baseline-record`, `--out`, `--executor-module`) are outside the new confinement, undocumented. | **Documented** in the runner's header: they act with the operator's own authority, and the trust boundary that gates a verdict is the sealed, identity-bound baseline record. |
| F7 | P3 | The CLI end-to-end test created its temporary symlink holder inside the repository root, so a hard crash leaves residue in the repository. | **Repaired.** The real-path branch is now covered against a fake repository root in a temp directory, the CLI is covered by a path that leaves the repository (no write at all), and the remaining end-to-end link lives under `artifacts/`, the repository's ignored output directory. |
| F8 | P3 | The parent-directory re-check branch of C3 had no committed test. | **Repaired.** A new test replaces the parent directory while carrying the same file inode, and asserts the parent branch of the refusal. |
| F9 | P3 | This record quoted the candidate `corpus_digest` with the suffix `…fb54`; the digest ends `…7b54`. | **Repaired** — the citation is corrected above and the full value stands in the disposition. |
| F10 | P3 | This record quoted the current `negative` family digest with the suffix `…8ce580`; the digest ends `…9de48d` (`8ce580` is a fragment of the unrelated `security_regression` digest). | **Repaired** — the citation is corrected above. |
| F11 | P3 | D1 claimed the re-derived HO-01 record differs from the committed one "in exactly three fields"; it differs in four — `created_at` differs as well. | **Repaired** — the wording is corrected in §6.2 and in the disposition. |
| F12 | P3 | The disposition claimed the review "is recorded in the run record", while §7 pointed at an unfilled placeholder. | **Repaired** — this section and §9 are filled in, and the disposition no longer claims more than the record carries. |
| F13 | P3 | The pre-commit-hook disclosure cited facts that are not verifiable: there is no repository-level hook, no trace of the reported error code in any scan store, and no document called a "compatibility policy". | **Repaired** — §5.4 now states what actually happened, names the hook as an environment-level plugin hook, and drops the unverifiable reference. |
| F14 | P3 | The HO-01 quotation in §1 was claimed to be non-verbatim. | **Refuted by the confirmer**: the sentence is verbatim in the HO-01 *disposition* — which is what this record names — and the reviewer had looked in the HO-01 run record instead. The citation is now made more precise anyway. |

**What the review did not cover:** the full `npm run test:vnext` was not repeated by the reviewers (it was run by the calling agent); the Registry and Atlas entries were not reviewed (the review covered the MAWS source slice only); the render and accessibility kinds of `npm run eval` remain unverified for the environment reason in §5.2; and no adversarial parallel symlink swap was executed as a live exploit.

## 7. Pre-existing drifts found, named, and deliberately not repaired here

Both were measured on the pristine `origin/main` worktree and are **not** caused by this run. Both are reported rather than silently repaired, because repairing them would absorb another lane's drift into this bounded slice and would change digest-bound evidence that the Registry and the Atlas already reference.

**D1 — the HO-01 committed comparison record no longer validates on `origin/main`.**
`npm run validate-experiment-comparison` fails on the untouched `origin/main` with `E13`: the record references definition digest `sha256:a17bd3f2…9ac9dc`, the recomputed digest is `sha256:5315fa3d…0ba71f`. Cause: the S7/S8 residual lane re-pinned the HO-01 experiment's frozen run-spec digest in commit `a55c8a1` ("re-pin the cross-lane inputs this run legitimately changes") without re-deriving the HO-01 comparison record that binds it. The re-derived record differs from the committed one in **four** fields: `created_at` (the per-run wall-clock value) and the three binding digests `definition_digest`, `runs.baseline.spec_digest` and `runs.candidate.spec_digest`. The evidence digests, the analysis-output digests, the metrics and the decision are unchanged. **Owner: the HO-01 lane (or the S8 lane that caused the re-pin).** Not repaired here: the HO-01 evidence and its Registry/Atlas representations are a separate, already-closed chain, and the HO-01 ticket's own scope forbids an unannounced expansion into it.

**D2 — the committed S5 eval records no longer match the current corpus.**
The committed `evidence/skill-effectiveness-evals-2026-10-20/eval-record-bev-skill-effectiveness-baseline.json` carries `corpus_digest` `sha256:7c3a7a80…5c7ad1`; the current corpus produces `sha256:937478a9…42fc9`. The difference is the `negative` family only (`sha256:d4b80eb1…0d5ac` committed vs `sha256:e87e4a58…9de48d` current); the `positive`, `security_regression` and `model_parity` families are unchanged. Cause: the S7 slice changed `evals/skill-effectiveness/negative-cases/cases.json` in commit `4d99c27` without regenerating the S5 evidence. The records remain contract-valid and their own content seals hold; they describe a corpus state that the tree has since left. **Remediation (owner decision):** re-run `npm run eval:skill-effectiveness` with `--out` into the evidence directory and refresh the two records. Not done here, because this run must not rewrite the evidence of a prior run whose record is referenced by the closed Registry and Atlas chains.

**Neither D1 nor D2 is a consequence of this change.** §5.2 measures that directly: on the same corpora, the pristine tree and this branch produce identical digests, before and after the repair round.

## 8. Registry disposition

`registry-disposition.json` in this directory: `status: NO_CHANGE`, `material_change: true`, `registry_relevant_change: false`, `affected_records: []`, `registry_commit_sha: null`.

The reason is the consumer binding in this repository's `AGENTS.md`: MAWS has adopted only the relevance classes `CONTRACT_RECORD`, `PROVENANCE` and `SUPERSESSION`, and this run changes none of them. The canonical contract `core/contracts/behavioral-eval.schema.json` is untouched, the behavioral-eval validator is untouched, the corpus content is untouched, the record format is untouched, the digests are unchanged (§5.2), and nothing is superseded. The runner is a tool surface, not a registered contract.

The change itself is still registered, as the Unitera project routing layer requires for **every** change: a run change registration in the Unitera Registry and a representation in the Unitera Atlas. Those are published after the source merge, and §9 names them.

## 9. Closure addendum

*Filled after the source merge, the Registry publication and the Atlas publication.*
