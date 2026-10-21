# S5 Path-Confinement — Follow-up run (2026-10-21)

The slice `evidence/s5-path-confinement-2026-10-21/` was closed and merged on 2026-10-21
(source pull request 59 merged as `d44002cf`, closure pull request 62 merged as `d15c965`).
This record covers the bounded follow-up run over the **merged** result. It does not reopen
the slice: the slice's own contract, corpus, record format and digests are untouched, and the
S5 evaluation functionality is unchanged.

Owner ticket: the four-item follow-up checklist of 2026-10-21.

1. **C5:** the hardlink count is checked again on the opened descriptor, and a race test is added.
2. **An independent delta review** of the final MAWS merge state, including the S8 integration.
3. **Hosted CI and sufficient security-scan coverage** after the restoration of the infrastructure.
4. **The foreign Registry/Atlas drifts** are attributed to the lane that owns them and reconciled.

---

## 1. C5 — the link count on the opened descriptor

### 1.1 The defect

C5 refused a corpus file that carries more than one link. The count was read **only on the
path**, during the containment check (`scripts/tools/path-confinement.mjs`, `confineFileToBase`).
A hardlink created in the window between that check and the open was therefore not seen:

* the real path of a hardlink **is** its own path, so no path-based check (C1, C2) can observe
  that the same inode also exists under a second name;
* the device and inode identity does not change when a second name for an inode appears, so the
  replacement guard (C3) cannot observe it either.

Only the link count reveals the second name, and it was no longer read at the moment the material
was actually read.

### 1.2 The change

`scripts/tools/path-confinement.mjs`:

* the confinement record now carries the observed `nlink`;
* `readConfinedFile` reads the link count **again on the opened descriptor** and compares it with
  the observed count. Any difference is refused with `PATH_MULTIPLE_LINKS`; a count that cannot be
  compared at all is refused as well, because a check must not depend on a measurement it could
  not take;
* the **parent-directory re-check now runs before the link-count check**. A replaced parent
  directory that carries the same file over as a hardlink would otherwise be reported as a
  link-count defect and would hide the parent check behind it. Both branches stay independently
  provable, and the existing test for the parent branch keeps its meaning.

`tests/vnext/s5-path-confinement.test.mjs` gains one test: a hardlink is created between the
containment check and the read, and the read is refused with `PATH_MULTIPLE_LINKS`.

### 1.3 The residual, stated honestly

The module header's residual **R1** is extended: a link created **after** the descriptor was
opened reaches the content exactly as an in-place rewrite does, and is not detected. C5 closes
the window between the check and the open, not the window after the open. The residual list is
otherwise unchanged (R1–R4), and none of the four is claimed as eliminated.

---

## 2. The gates on the final state

All gates were executed on the merged state (`d15c965`) plus this follow-up under **Node
v20.20.2**, the version the hosted workflow pins (`actions/setup-node` with `node-version: '20'`).

| Gate | Result |
| --- | --- |
| `node --test tests/vnext/s5-path-confinement.test.mjs` | 26/26 pass, 0 fail |
| `npm run test:vnext` | 709/709 pass, 0 fail |
| `npm run eval:skill-effectiveness` | exit 0, final verdict `IMPROVEMENT_PROVEN`, `security_gate` PASS with 3 security cases and 0 security regressions |
| `npm run validate-behavioral-eval` | 7 cases checked, 0 unexpected results |
| `npm run validate-maws-vnext` | PASS, `issues: []` |
| `npm run test:skill-frontdoor` | 6/6 pass |
| `node scripts/tools/ci-gate.mjs` | `PASS CI Gate`, exit 0 |

The digests are unchanged against the values the slice recorded: baseline corpus
`sha256:937478a9903ceb6a439e7e77a459a8d3a86b52f06a98a4467aea1bf97af42fc9`, candidate corpus
`sha256:3e5116fed728b3902002dddd790092ff10d5098d578a70076e1d5e4559dd7b54`, baseline content
`sha256:e370dca97aebb1526b4e4f23f7713053e14726e6689a08b8710ffc83022a13dd`, candidate content
`sha256:08724a06a5844413296ecead215688747b87d2e5aefc2df200795bee569064d0`, negative family
`sha256:e87e4a58c20547de229b98218a5e636a909a1ce7bca59413b53bff012a9de48d`, security-regression
family `sha256:c548d38ec5d55350d8bc1d6795b22e8ce580289f52407b9e56ed97487f744f5c`.

The existing S5 regression suite `tests/vnext/run-skill-effectiveness.test.mjs` is byte-identical
to `origin/main` and was not edited by this run.

---

## 3. Hosted CI — the infrastructure is not restored

### 3.1 The state of the hosted runner

The account's GitHub Actions admission is still closed. The run that belongs to the S5 merge
commit itself, `39550245291`, carries the annotation:

> The job was not started because your account is locked due to a billing issue.

The lock is account-wide, not repository-specific: the Unitera Registry's own run for the S5
registration (`39549887013`) and the Unitera Systems runs (`39532057727`) end in
`startup_failure` after 0 seconds, with no job and no step. The follow-up pull request 63
carries the same annotation on its own run (`39561925248`).

**No hosted CI result is claimed for this slice, and none is possible while the lock stands.**
The condition of the checklist — "after the restoration of the infrastructure" — is **not met**;
that is a fact of the environment, stated here rather than worked around.

### 3.2 What was done instead: the complete job, replicated locally

The hosted job (`.github/workflows/loop-repo-ci.yml`) has four steps. All four were executed
locally on the final state under the same Node version:

| Hosted step | Local replication under Node v20.20.2 | Result |
| --- | --- | --- |
| `actions/checkout@v4` | the worktree at the merged state | — |
| `actions/setup-node@v4` (node 20) | `~/.nvm/versions/node/v20.20.2/bin` | v20.20.2 |
| Syntax check of 5 files | `node --check` on the same 5 files | 5/5 OK |
| `npm run validate-maws-vnext` | same command | PASS, `issues: []` |
| `npm run test:skill-frontdoor` | same command | 6/6 pass |
| `node scripts/tools/ci-gate.mjs` | same command | `PASS CI Gate`, exit 0 |

A local gate run is a local gate run. It is reported as such and not as a hosted CI result.

---

## 4. Security scan — the coverage gap, measured

### 4.1 The scan on the final state

Mimosa deep static scan `scan-2026-10-21T07-07-57.089Z-fc7d563aaa6f`, seal
`sha256:3c8da16e423408db2e22727536fbafbf3a3ed3d67b581870ff6d30bb4a4e4000`: 0 findings, 198
packages scanned, 2 packages matching 2 advisories in the offline dependency snapshot. The scan's
own coverage artifact records `completeness: partial`, `runStatus: inconclusive`, 34 files
selected and parsed, 104 functions and 140 call edges, and one gap: the call graph is partly
incomplete because some calls are dynamically dispatched.

### 4.2 The scan does not cover the material of this slice

That label alone would be a disclosure. The measurement below is stronger, and it changes the
meaning of the "0 findings":

1. A copy of the repository **with the four changed files removed** and an otherwise identical
   tree produces the **same** analysed set: 34 files selected, 34 parsed, 104 functions, 140 call
   edges, the same gap, the same 0 findings. Reproduced on two independent project identifiers,
   so it is not a cached result. The four changed files are therefore **not** in the analysed set.
2. A copy of the repository **without `scripts/`, `tests/`, `core/`, `runtime/` and `evals/`**
   still yields the **same 104 functions and 140 call edges** — and even reports
   `completeness: complete`, `runStatus: completed`, no gaps. The whole analysed set lies
   outside `scripts/` and `tests/`, which is where the S5 loader, the shared primitive, the S8
   module and the new tests live.
3. A copy narrowed to the changed material and their local imports selects **0 files**, analyses
   **0 functions** and reports `complete`/`completed`. Such a verdict is **vacuous** and is
   deliberately **not** presented as better coverage.

**Consequence.** The "0 findings" of every Mimosa scan of this repository carries **no information
about the S5 path-confinement material**. The requirement "sufficient security-scan coverage" is
therefore **not satisfiable with this scanner on this repository**, and no security claim is made
anywhere in this run. The assurance for this slice rests on the 26 negative and regression tests
(including the link-count race test), on the independent review of section 5, and on the
replicated gate set of section 2 — not on the scan.

This is a statement about the scanner's coverage of this repository, not a defect in the S5 code.
The scan remains useful for what it does analyse, and its result is disclosed as it stands.

---

## 5. The independent delta review of the merged state

The slice was reviewed three times before the merge — the first round, the re-review of the
repaired state, and a third round plus a codex connector. What was never reviewed is the state
that actually ships: the rebased branch, the two merge commits, the cross-lane adaptation of the
S8 evidence-provenance module, and the Registry/Atlas records written against the pre-rebase
commits.

A fourth review was run over exactly that, with three lenses — *the merged state and the S8
integration*, *the C5 follow-up* and *the Registry and Atlas representation of the merged state* —
each in its own fresh context on a model different from the one that wrote the code, with one
independent confirmer per finding, reproducing every finding from its evidence alone.

The result is published in the run report of that review and is summarised in section 6. Every
confirmed finding is repaired in the same change, or — when it belongs to another lane — is
attributed to that lane in section 6 and in the Registry and the Atlas.

---

## 6. The registration surfaces

### 6.1 Defects found in this lane's own records, repaired in this run

The ticket requires that the Registry and Atlas references mirror the exact new source evidence.
Measured against the merged source, three defects were found in this lane's own records:

* **the Atlas claim names the pre-rebase commits.** `C-MAWS-S5-PATH-CONFINEMENT-2026-10-21` names
  the "final published head" as `5541ccdf179e01236fe0c278dcc4b92423bcfcda`, the "implementation
  commit" as `95c6ed43f88d9c00045900ff5ef0fc2bc695834e` and "main before merge" as
  `2f94f8c5eab6ae3216b9dd0551a03624a88fd55c`. None of the three is what was published: the branch
  was rebased onto `808bfb09` before publication, so the published head is
  `1dbac8ce52d3c6ffac49ca005e239c6d61131c11` and the implementation commit is
  `f9b1dbb3e041d87e7ff0b0d61596b33f9151e566`. The two named commits are **not** ancestors of
  `origin/main` — they were orphaned by the rebase.
* **neither the Registry record nor the Atlas claim mentions the hardlink guard.** Both enumerate
  the checks C1 to C4 and the corpus codes `CORPUS_PATH_SYMLINK_ESCAPE`,
  `CORPUS_PATH_NOT_A_FILE` and `CORPUS_PATH_CHANGED`; the shipped code also carries **C5** and
  the code `CORPUS_PATH_MULTIPLE_LINKS`, which neither record mentions.
* **the Registry record contradicts itself about the base.** `change_status_scope` says "main
  before merge `2f94f8c5`", while the structured field `source_publication.main_commit_before_merge`
  says `808bfb09`. The structured field is the correct one.

All three are repaired in this run, in the Registry and in the Atlas.

### 6.2 The foreign drift: attributed, not silently repaired

Both reachability gates were executed against a **freshly provisioned mirror farm** of all 17
owner repositories (`scripts/ci_clone_owner_repos.py --into <dir>`, 17/17 cloned), which is the
CI-faithful method.

* **Unitera Registry**, `registry_reachability.py --require-verifiable`: 613 verified current
  claims, 31 historical, 31 separate current observations, 8 record-gap diagnostics, **1
  mismatch**.
* **Unitera Atlas**, `validate_atlas.py`: PASS, 0 errors. `validate_pin_reachability.py`: **1
  failure**.

Both remaining items belong to **one** lane — the personal-pilot launch acceptance lane:

| Surface | Item | Root cause |
| --- | --- | --- |
| Registry `PERSONAL_PILOT_LAUNCH_ACCEPTANCE_2026_10_21_001.yaml` | `source_publication.head_commit_on_default_branch[head_commit] = 7db4619e` declared `False`, derived `True` | The record was written at `observed_at 2026-10-21T00:04:00Z`, while baum-os pull request 65 was still open (`merge_commit: null`, `merged_at: null`, `change_status: PARTIAL`). The pull request merged afterwards and the record was never updated. |
| Atlas `C-PERSONAL-PILOT-LAUNCH-ACCEPTANCE-2026-10-21` | the referenced path `apps/api/src/governed-execution/personal-negative-gate-coverage.spec.ts` does not exist at the pinned commit `f6114ebae0bfca75843fe4d08385781190d883cf` | The file was introduced later, in `76ccb430`; the locator points at a path that the claim's own pin does not contain. |

Both are **named, attributed and registered** in this run; neither is silently repaired, because
the repair of a registered object of another lane — including the decision whether the merged
content still matches that lane's observation, and which commit the locator should name — belongs
to the lane that owns it. The required repairs are stated in the Registry and the Atlas entries.

### 6.3 A false drift class that the gates produced, and its cause

Running the same gates against a **stale local mirror** produces two further findings that are
**not** drifts:

* the Registry gate reports `3 mismatch` and `1 unverifiable` instead of `1 mismatch` and
  `0 unverifiable`, because the two `baum-os` commits it cannot see are present in the object
  store but the mirror's `refs/remotes/origin/main` is older, so the ancestry check runs against
  a commit the local object store does not contain;
* the Atlas gate reports `baum-os: registered pin is not an ancestor of the observed head
  (advance would not be a fast-forward)` instead of `REMOTE_ADVANCED`, for the same reason.

Both disappear after the mirror is refreshed, and both are reproduced on the fresh farm. **The
gate verdict depends on the freshness of the local mirror**: a stale mirror produces false
mismatches, which are indistinguishable in the output from a real drift. The CI-faithful
invocation — a freshly provisioned mirror farm — is the method whose result can be relied on,
and it is the method used above.

---

## 7. What this run does not claim

* **No hosted CI result.** The account's Actions admission is closed; the job was replicated
  locally under the same Node version, which is not the same thing.
* **No security claim.** The scan's own verdict is `partial`/`inconclusive`, and the measurement
  in section 4.2 shows that the analysed set does not contain this slice's material.
* **No independent human approval.** The review is tool-based, on a model different from the one
  that wrote the code, with one independent confirmer per finding. A GitHub reviewer could not be
  requested for the pull request: the API answers HTTP 422 because the named reviewer holds read,
  not collaborator, permission on that repository.
* **No repair of another lane's registered object.** The foreign drift of section 6.2 is
  attributed and registered, not silently corrected.
* **No change to the slice's contract, corpus, record format or digests**, and no change to the
  qualification of the HO-01 lane.
