# PR #90 and PR #107 — separately classified with exact evidence

Both merges are `MERGE_NOT_COVERED` findings of the published history. The
anchor policy separates their fate exactly: one predates the proposed
adoption anchor, one postdates it. All values below are measured from the
published main (`bcfcdce`), 2026-10-23; every claim is re-derivable with
the listed command.

## PR #90 — the S9 disposition rebind

| field | value |
| --- | --- |
| merge commit | `b902130701bc5d784506a4044cb2880e0a86320a` |
| subject line | `docs(evidence): bind the S9 disposition to the completed Registry write (#90)` |
| parents | base `10de67a0bd5d2deb6abe510d2f53ec2d92025f5e` + head `5813a26fab045fad0325dc184ceae00ea8cd58ce` |
| committer date | 2026-10-22T17:16:54+02:00 |
| changed paths | exactly one file: `evidence/s9-regression-rollback-2026-10-22/registry-disposition.json` (not confined to `core/authority/`, so no governance-act exemption) |
| why uncovered | the base tree carried lane `s9-regression-rollback-20261022`, but that lane binds the closure head `fff00e20…` and was already consumed by the merge of PR #78; nothing bound `5813a26f…` |
| anchor relation | `git merge-base --is-ancestor 0fd89d9… b902130…` FAILS — the anchor landed AFTER this merge |
| **classification** | **pre-anchor — ELIGIBLE for disposition under an adopted anchor** |

## PR #107 — the S10 disposition rebind

| field | value |
| --- | --- |
| merge commit | `71655312a21901972a569406997389293304e4ed` |
| subject line | `Merge pull request #107 from baum777/docs/s10-disposition-rebind-20261022` |
| parents | base `05b0f80ce2ff64c38cd1edc28a40f2de799cfe43` + head `1f68c47ceed80b787bbeb55cd2cfed2f048bb41f` |
| committer date | 2026-10-22T18:55:53+02:00 |
| why uncovered | the base tree carried lane `s10-cross-model-optimization-20261022`, but that lane binds the reviewed merge-commit head `61609ccf…`, already consumed by the merge of PR #100; nothing bound `1f68c47c…` |
| anchor relation | `git merge-base --is-ancestor 0fd89d9… 71655312…` SUCCEEDS — the anchor (the mechanism's own landing, PR #98, 18:18:15+02:00) already existed 37 minutes before this merge landed |
| **classification** | **post-anchor — INELIGIBLE forever; under Option B it is the one live gate finding after adoption** |

## What the separation proves

The two findings are historically identical in shape (first-generation
rebind practice) but sit on opposite sides of the policy boundary. The
anchor policy disposes exactly the one that predates the mechanism and
keeps the one that postdates it blocking — which is the precise inversion
of what the foreign self-recording achieved when it disposed BOTH. No
date arithmetic is used anywhere in the mechanism; both classifications
follow from ancestry in the immutable history.

## Executor cross-check (live, this run)

Asking today's executor to merge PR #107 under the S10 lane:

```
decision: REFUSE
code: MERGE_PR_IDENTITY_MISMATCH
message: the merge target is pull request 107 but the lane
         "s10-cross-model-optimization-20261022" owns pull request 100
```

(`probe-identity.receipt.json`, exit 1, no side effects.) The preventive
control refuses today exactly the landing the detective control found.
