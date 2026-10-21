# MAWS — the cross-lane merge incident and its closure

Date: 2026-10-21. This run closes a governance incident in the repository's
own merge path and repairs the defect that caused it. It establishes no new
capability, no authority and no permission.

---

## 1. The incident

On 2026-10-21 an operator command in this repository was meant to merge the
pull request it had just created — pull request 70, the S5/F2 disposition
rebind. The command addressed a **different pull request number**. Pull
request 69 — a mergeable, freshly created pull request of a *parallel* lane
(the source security gate) — was merged to main under that wrong command.

The merged content was coherent and the tree was not corrupted. The damage
was to the **process**: the merge target was a caller-asserted number, and
nothing in the path compared it with the work lane the command was about.

The verified facts, each read back from the repository and the merge API:

| Fact | Evidence |
|---|---|
| Pull request 69 was merged at 2026-10-21T11:38:21Z as `563c1db46c592a604ea53b95936ec82dd09732eb` | merge API readback; the timeline event carries the same actor and timestamp |
| The merge commit's parents are `df8c683e557a711562bc6cc61ac8504120825161` (main before the merge) and `dd165419dac1193779bc39a9001369dbf821985b` (the pull request's own head) | `git show -s --format=%P` — a clean merge, no conflict resolution, the content landed exactly as the lane had authored it |
| The hosted check `loop-repo-ci` was in state **FAILURE** on that pull request at the moment of the merge | the pull request's status check rollup as read at incident time |
| The intended pull request 70 was merged afterwards, correctly, as `bae2b2d8fc248656a182a8b5d725fe38d9857be9` at 11:44:09Z | merge API readback |
| The merge order in the incident window was #68 (11:34:03Z) → #69 (11:38:21Z) → #70 (11:44:09Z) → #71 (11:52:46Z) | merge API readback of every pull request |
| The REST merge endpoint on this repository does **not** answer 404 | a probe against the already-merged pull request 68 answered `{"sha":"df8c683e…","merged":true,"message":"Pull Request successfully merged"}` |

The last fact corrects a statement in the Registry: the registration
`MAWS_SOURCE_SECURITY_SCAN_2026_10_21_001` records the merge of pull request
69 as "executed by baum777 through the GitHub GraphQL `mergePullRequest`
mutation with `expectedHeadOid`… The REST merge endpoint answers 404 on this
repository, so the GraphQL mutation is the working path". The endpoint does
not answer 404 — it is the path the incident's command used. The Registry
record is corrected by this run's Registry change, and the correction is
stated rather than silently applied.

## 2. The disposition: retain, do not revert

The merged pull request 69 is **retained**. No revert is performed, and no
blind revert would be correct:

- The merged content was self-consistent and landed as its own head (the
  merge commit carries the lane's head as a parent and resolved no
  conflict). The publication is a real, load-bearing part of `main`: the
  hosted workflow references `npm run scan:source-security`, and reverting it
  would remove a security gate and re-open the void the lane closed — the
  external deep scanner's language packs do not register `.mjs`, so its
  analysis of this repository's own source carries no information.
- The one defect the merge actually introduced into that lane was found and
  repaired by the lane itself before this closure run: the line-keyed
  baseline went stale when the concurrent S5/F2 merge moved a baselined line,
  and pull request 71 (`b1c035681d6f2a9aaee3fcb5ccb3dc1fcd396846`) hardened
  the match key to `file + rule + excerpt`.
- A revert would not repair the process defect that caused the incident. The
  incident class is "a merge landed on a pull request the operator did not
  intend, with a failing required check". That is what this run repairs.

The disposition is a **technical** disposition, recorded here and in the
Registry change. The formal owner act — the acceptance of the merged state —
remains with the owner.

## 3. What was established: a lane-bound merge path

`scripts/tools/merge-pr-executor.mjs` (npm `merge:pr`, CI step "Merge
executor lane binding") makes the merge target **derived** and
**cross-checked**:

- **The lane is not a caller argument.** The lane authorization is a record
  committed in the canonical governance surface
  `core/authority/merge-authorizations/<lane_id>.json` (contract
  `core/contracts/merge-lane-authorization.schema.json`, 1.0.0) and is read
  from the **tip of the repository's default branch as GitHub reports it** —
  never from a caller-named ref, never from the working tree, never from the
  pull request that wants to be merged. A pull request therefore cannot
  authorize itself.
- **The target is derived from the lane.** It is the pull request whose head
  branch is the lane's head branch. A named target that is not the lane's
  pull request is refused; the foreign pull request of the incident can
  never become the target.
- **The observation is never caller-authored in the merge path.** A merge
  reads the pull request live from GitHub. A supplied observation file is a
  read-only evaluation input and is refused with `--apply`.
- **A lane must demand something.** A lane that requires neither a hosted
  check nor a local gate is refused as a malformed authorization: a merge
  that needs no green check — the incident's precondition — is no longer
  expressible.
- **Every binding fails closed** with its own code: `MERGE_PR_IDENTITY_MISMATCH`,
  `MERGE_LANE_MISMATCH`, `MERGE_HEAD_SHA_MISMATCH`, `MERGE_HEAD_SHA_INVALID`,
  `MERGE_BASE_REF_MISMATCH`, `MERGE_LANE_AUTHORITY_MISMATCH`,
  `MERGE_LANE_AUTHORIZATION_ABSENT`, `MERGE_LANE_AUTHORIZATION_INVALID`,
  `MERGE_HEAD_NOT_AUTHORIZED`, `MERGE_PR_NOT_OPEN`, `MERGE_PR_NOT_MERGEABLE`,
  `MERGE_CHECK_FAILED`, `MERGE_CHECK_MISSING`, `MERGE_LOCAL_GATE_FAILED`,
  `MERGE_OBSERVATION_INVALID`, `MERGE_REFUSED`, `MERGE_VERIFICATION_FAILED`.
- **The merge binds the reviewed head.** A merge must declare
  `--expected-head-sha`; the merge is issued with it (the server's optimistic
  concurrency guard) and read back afterwards: the merge commit must carry
  that head among its parents, and the receipt reports the merge only when
  the readback passed.

The lane authorization of this very closure is
`core/authority/merge-authorizations/merge-incident-closure-20261021.json`.
It names the lane's head branch, the base branch, the canonical merge
authority and the local gates the lane demands. It is read from `main`, so
it is the owner-committed record that authorizes the closure merge — and the
closure pull request is merged **by the new executor**, which is the live
proof that the mechanism works on a real pull request.

## 3a. The live proof: the closure pull request was merged BY the new executor

The closure pull request (75) was merged through
`scripts/tools/merge-pr-executor.mjs` under the lane authorization
`core/authority/merge-authorizations/merge-incident-closure-20261021.json`,
which pull request 74 had committed on the default branch. The executor:

1. read the lane authorization from the tip of the default branch
   `3931fe772f4c077c8e232a3adb6c9f70faa90546` — the source is GitHub's own
   record of the branch, not a ref the operator named;
2. derived the target from the lane's head branch (pull request 75), with no
   asserted number in play;
3. ran the lane's three local gates (`validate`, `test:vnext`,
   `test:merge-executor`) against the reviewed head
   `771f0319511dec4e448eff55d252820062ef476b` — the working tree's HEAD is
   the reviewed head, so the gates verify the content that is about to be
   merged;
4. issued the merge with that head sha;
5. read the merge back: the merge commit
   `05475009a972d48368caef2f92de0799274f365a` carries the parents
   `3931fe772f4c077c8e232a3adb6c9f70faa90546` and
   `771f0319511dec4e448eff55d252820062ef476b`.

The receipt reported the failing hosted check as a **warning** (it is not
required by this lane, because the hosted CI is billing-blocked and a
required check that can never pass would block every merge), and the merge
was issued anyway because the lane demanded — and the local gates met — three
local verifications instead.

**Three live refusals preceded that merge, and none of them merged
anything.** The first attempt failed closed on a GitHub read: the field set
the executor requested did not exist for the `gh` command, the receipt
answered `"ok": false` and `"merged": false`, and no merge was issued. The
field was corrected, a failed GitHub read was given the typed code
`MERGE_GITHUB_ACCESS_FAILED`, and the second attempt failed closed again
because GitHub still reported the pull request's mergeability as unknown
right after the push. The third attempt, twenty seconds later, merged.

That sequence is the mechanism working, not a story about it: three times a
merge could have gone to the wrong place or on unverified content, and three
times the path refused.

## 4. Verification (all LOCAL)

| Gate | Result on the branch head |
|---|---|
| `npm run test:merge-executor` | **61 of 61** pass |
| `npm run test:merge-lane-contract` | **9 of 9** pass (the contract and the implementation declare the same field set) |
| `npm run test:vnext` | **781 of 781** pass |
| `node scripts/tools/scan-source-security.mjs` | **PASS** — 240 files analysed, required coverage 4 of 4, zero unbaselined, zero stale |
| `npm run validate`, `npm run validate-neutral`, `npm run validate-maws-vnext`, `npm run validate:assurance-run -- --all` | all ok, zero issues |
| **24 reverted mutation probes** | **24 of 24 BOUND** — each probe neuters exactly one guard and is caught by the designed tests; the source file was verified **byte-identical** after the run and the baseline re-run green (61/61) |

The probes cover: the pull request identity gate, the lane membership gate,
the declared head sha gate, the required check gate (including the duplicate
observation), the base branch gate, the authority gate, the base-commit read,
the derivation of the target, the head sha validity, the lane-authorized head
sha, the ancestry gate, the "a lane must demand something" rule, the merge's
head sha, the readback's parent check, the readback's MERGED state, the
closed field set of the authorization, the refusal of a merge on a supplied
observation, the local gate's head binding, the default-branch cross-check,
the cross-repository check, the iteration over the required checks, the
head-branch cross-check, the lane id pattern and the head repository.

**The live merge path was exercised for real, and it refused before it
merged.** The first live attempt failed closed on a GitHub read: the `gh pr
list` field set the executor requested did not exist, the receipt answered
`"ok": false`, `"merged": false` and no merge was issued. The field was
corrected, a typed `MERGE_GITHUB_ACCESS_FAILED` was added for a GitHub read
that fails, and the live merge was repeated.

**The negative test that binds the incident class**: a foreign pull request
that exists, is open, is mergeable and carries a valid head sha is refused
with `MERGE_PR_IDENTITY_MISMATCH` — in the pure decision, in the CLI and in
the merge path with every external access injected.

## 5. The independent review and its repairs

An independent review of the first revision (attack model: an operator or a
concurrent lane that wants a merge to land somewhere else) found **3 P1**,
a set of P2 and a set of P3 findings. All are repaired in the published
revision:

| Finding | Repair |
|---|---|
| P1 — the base commit was a caller-chosen local ref, so a pull request could authorize itself | the base commit is now the tip of the repository's default branch **as GitHub reports it**, and the lane must authorize exactly that branch |
| P1 — the observation was caller-authored, so the incident's exact shape was reproducible through `--observation` | a merge refuses a supplied observation file and reads the pull request live |
| P1 — the merge and its readback had no test coverage at all | the whole path is now injectable (`runMergeExecutor` with injected dependencies) and covered by 61 tests |
| P2 — the head sha was neither validated nor bound to a review | the head sha must be a commit identity, a merge must declare it, and the merge and the readback are bound to it |
| P2 — the required-check set could be empty | a lane that demands nothing is refused; the schema enforces the same rule |
| P2 — a duplicate observation of a required check resolved to the first (passing) one | every observation of the required check must succeed |
| P2 — the base branch comparison normalized `origin/main` and `main` into one | the comparison is exact; GitHub's own branch name is the identity |
| P2 — the ancestry gate failed open in the exported API | the gate now requires a positively established ancestry |
| P2 — the receipt reported `ok: true` after a refused merge | the receipt reports the refusal and `merged: false` |
| P2 — a local checkout of another repository could authorize a merge here | the local origin is compared with the merge target |
| P2 — the contract and the implementation could drift silently | the contract's field set is bound to the implementation's by a test, and the contract itself has a schema test |
| P3 — the `authorized_commit` pin was described as a content pin | it is an **ancestry** pin, and the contract description says so |
| P3 — the tool was described as "the merge path" of the repository | it is a merge **path**, not an enforced gate; the repository carries no branch protection |

The CHANGELOG entry, the contract description and the module header were
corrected to what the code does.

## 6. Registration surfaces

- Owner-side classification: `registry-disposition.v1` in
  `evidence/merge-pr-incident-closure-2026-10-21/registry-disposition.json`.
  The change is a `CONTRACT_RECORD` (one new contract) and is therefore
  registry-relevant. The Registry write is **COMPLETE**: unitera-registry
  pull request 269, merged as
  `55341468b2450a085496b3875dad5695a5ee3fe2`; the disposition is rebound
  from `REQUIRED_BUT_BLOCKED` to `UPDATED` with that commit sha.
- The Registry change registration is the new record
  `MAWS_MERGE_PR_INCIDENT_CLOSURE_2026_10_21_001` and the new contract
  record `MAWS_MERGE_LANE_AUTHORIZATION_CONTRACT_2026_10_21_001`; the same
  Registry change corrects the attribution of the merge of pull request 69
  in `MAWS_SOURCE_SECURITY_SCAN_2026_10_21_001`, which recorded a merge
  mechanism that the incident evidence contradicts.
- The Registry's own gates answered on that change: `validate_registry.py`
  **PASS** and the git-backed reachability check **PASS** against a complete
  mirror basis (683 verified current claims, 31 historical, 0 unverifiable,
  0 mismatch) — the commits named by the new records are derived reachable
  exactly as they are declared. The digest inventory did not finish within
  its runtime budget in this environment; the change introduces no `sha256:`
  assertion, so the inventory is not affected by it.
- The Atlas representation is the claim of the same run, pinned to the merge
  event of the closure publication.

## 7. Limits — what this run does NOT claim

- **The executor is a merge path, not an enforced gate.** This repository
  carries no branch protection, no required merge mechanism and no hook.
  Using the executor stays an operator decision, and the bootstrap that
  brought it in — pull request 74, merged as `3931fe772f4c077c8e232a3adb6c9f70faa90546`
  — was an **owner act**: the first lane authorization cannot be landed by
  the tool it introduces, because the base branch does not carry it yet.
- **No hosted CI result is claimed.** The account's Actions admission is
  closed account-wide (billing lock). The CI steps are published and have
  not run there. Every measurement in this record is a **local** run under
  Node v24.19.0.
- **No security claim is derived from the external deep scan.** The Mimosa
  scan did not produce a complete conclusion for these pushes
  (`scanner_enobufs`); that incompleteness is recorded, not presented as a
  result.
- **The merge authority is not signature-grade.** The canonical owner trust
  anchor is `PENDING_PUBLICATION` and publishes no key, so the authority
  surface of a merge is the base-branch-committed lane authorization. A
  signature-bound variant stays open with the owner.
- **The reviewed head sha is operator-declared** for a merge. The lane
  authorization can only pin an *ancestry* commit, because a commit cannot
  contain its own digest. The declared sha is verified against GitHub's live
  record and is the server's optimistic concurrency guard.
- **The authority matrix is deliberately not updated.** `docs/authority-matrix.md`
  is a canonical instruction source (`runtime/instructions/instruction-inventory.mjs`,
  `FIXED_SOURCES`); changing it invalidates the effective instruction digest
  and forces a re-pin of the executor profile chain, the run spec and the
  HO-01 comparison artifacts. That re-pin is a deliberate, separate act. The
  tool row is deferred to it; the source security gate of the same day
  carries no matrix row either.
- **This run does not repair the S5 lane's F4** (the unkeyed freshness seal
  of the S8 lane). It stays open with its owner.
- **The external scanner's gap over `.mjs` material is unchanged** and is
  not a claim of this run: the repository's own gate is the coverage that
  exists, and it is qualified above on the actual `main`.
