# Cross-Repo Governance Integrity Run 2026-10-22

An owner-instructed, narrowly scoped governance integrity run. It
reconstructs the uncovered disposition merge of pull request 90, evaluates
the authorization binding that merge required, corrects the two foreign
Atlas claims, completes the dangling S9 lane lifecycle, and re-runs the
three cross-repo audits. It re-opens no implementation lane: S5/S8/S9
implementation surfaces and the closed operational safety lanes are
untouched; every act here is owner-side governance.

## 1. Reconstruction of pull request 90

| Fact | Value |
| --- | --- |
| Merge commit | `b902130701bc5d784506a4044cb2880e0a86320a` |
| Parents | base `10de67a0` (main at the time), head `5813a26f` |
| Pull request | #90, branch `docs/s9-disposition-rebind`, base `main` |
| Author / merged by | baum777, at 2026-10-22T15:16:55Z |
| Changed paths | exactly one: `evidence/s9-regression-rollback-2026-10-22/registry-disposition.json` |
| Merge path | direct merge (no lane authorization on the base, no executor) |
| Findings against it | `merge:audit` on main: `MERGE_NOT_COVERED` |

The change itself is the S9 lane's disposition rebind — the same content
step the merge-executor-hardening lane performed as pull request 83 (its
disposition bound to the completed Registry write). The content is not in
question; the PATH it took is.

## 2. The required authorization binding (evaluation)

The lane authorization contract at 1.1.0 (`core/contracts/
merge-lane-authorization.schema.json`), enforced preventively by
`scripts/tools/merge-pr-executor.mjs` and detectively by
`scripts/tools/verify-merge-attestations.mjs`, required for this merge:

- an ACTIVE lane authorization on the base branch BEFORE the merge,
  binding exactly `5813a26f` as the reviewed head (a rebind/disposition
  lane, exactly as `merge-executor-hardening-rebind-20261021.json` bound
  `8e262d92` for pull request 83);
- landed as its own governance act confined to `core/authority/`;
- the merge then executed by the lane-bound executor with the declared
  head, and the lane closed after exactly that one merge.

None of this existed: the only S9 lane (`s9-regression-rollback-20261022`)
had already consumed its one merge (pull request 78, head `fff00e20`,
merged as `2965a3bd`) and its lifecycle was never completed. The merge of
#90 was therefore a protocol gap, not a judgment call the contract allows.

## 3. Why the audit finding cannot be legitimately repaired to green

`verify-merge-attestations.mjs` derives its verdict solely from published
history: a merge is covered only by a lane authorization that existed in
the BASE commit's tree (`git show <base>:core/authority/...`). The base
tree of `b902130` is frozen. The tool has — by its own design statement —
"no epoch file, no baseline list and no hidden exemption table". The two
only paths to a green audit for this merge are:

1. rewriting published history (never), or
2. revising the audit contract to add a resolution/exemption mechanism —
   a governance CONTRACT change to a closed lane's enforcement surface,
   which is not a targeted owner correction and is not done here.

The finding therefore stands permanently. This record is its disposition.

## 4. Disposition

- The `MERGE_NOT_COVERED` finding for `b902130` is ACCEPTED AS PERMANENT
  history. It is documented here, not excused, not repaired, not absorbed.
- Consequence, per the owner's own rule: **no global MAWS governance
  closure may be claimed while `merge:audit` reports this finding.** The
  audit's status on main is FAIL with exactly this one finding.
- The dangling lane lifecycle IS repairable and is repaired: the S9 lane
  is closed with the one merge it authorized (pull request 94, a
  governance act naming pull request 78 / `2965a3bd` / `fff00e20`).
- The two foreign Atlas claims are corrected (see §5) — navigation-only
  fixes that make the pinned references true again.

## 5. The two Atlas claim corrections

1. `C-MAWS-S9-REGRESSION-ROLLBACK-2026-10-22`: the claim pinned the
   implementation commit `5b5319e8`, but its referenced path
   (`evidence/s9-regression-rollback-2026-10-22/RUN.md`) exists only from
   the published head `fff00e20` — the implementation commit carries code,
   not evidence. Correction: the event pin moves to the merge commit
   `2965a3bd` (the publication event; the path exists there), with the
   implementation commit named in the note.
2. `C-PERSONAL-PILOT-LAUNCH-ACCEPTANCE-2026-10-21`: the claim referenced
   `apps/api/src/governed-execution/personal-negative-gate-coverage.spec.ts`,
   a file that was DELETED in `cfdee750` (the governed execution spine
   restructure) BEFORE the pinned merge `f6114eba`. The pinned tree carries
   the same artifact under its renamed path
   `apps/api/src/governed-execution/governed-execution.negative-gates.spec.ts`.
   Correction: the referenced path moves to the renamed file, existence
   verified at the unchanged pin.

## 6. Re-audit results (this run's own readback)

Recorded after the corrections, distinctly:

- `merge:audit` on main: **FAIL — exactly one finding, the permanent,
  now-dispositioned `MERGE_NOT_COVERED` for `b902130`.** All other merges
  examined: covered, governance acts, or historical observations; every
  lane closed or consumed, none reused.
- Registry validation and reachability: see the run's Registry record.
- Atlas structural validation and pin reachability: see the run's Atlas
  representation.

## 7. What this run does not claim

- No global MAWS governance closure (blocked by the standing audit finding).
- No history rewrite, no audit-contract revision, no new enforcement tool.
- No re-opening of S5/S8/S9 implementation surfaces or the closed
  operational safety lanes; the one-file content of #90 is untouched.
- No hosted CI result, no human approval, no runtime activation.
