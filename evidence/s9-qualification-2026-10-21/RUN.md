# MAWS — S9 Qualification Run (independent verification of the merged evidence-admission lane)

Date: 2026-10-21. This run QUALIFIES the published state of the S9 lane — the
trusted evidence admission (an extension of slice S8; the specification's own
S9 slice "Regression and Rollback" is NOT touched) — as merged on
`origin/main`. It is an independent verification pass, not a new capability:
S5/S8 remain closed and are not re-opened, no contract changes, no provider
calls, no activation, no authority grant. Admission != Authority is unchanged.

---

## 1. Published state readback

| Surface | State at readback |
|---|---|
| Feature merge | PR #64 `e12d0f8fd1d63df1d1913fca677d6eba79a048ed` (branch head `494390289dc3cb5cb33a082095f94c292e2b23c3`, base `d15c96565379d081800f1ca3c0646c968235fe0e`, merged_at `2026-10-21T08:05:00Z`) |
| Rebind merge | PR #65 `5ed7216` (commits `81407c3` disposition → UPDATED, `f074041` publication state) = `origin/main` head at readback |
| Registry record | `MAWS_EVIDENCE_ADMISSION_2026_10_21_001.yaml`: `change_status: COMPLETE`, binds head `4943902` / merge `e12d0f8` / base `d15c965`, all three `*_on_default_branch: true`, via PR #254 `b1d240c` + completion PR #256 `def8012` |
| Registry contract record | `MAWS_EVIDENCE_ADMISSION_CONTRACT_2026_10_21_001.yaml`: `state: MERGED`, binds head `4943902` |
| Atlas claim | `C-MAWS-S9-EVIDENCE-ADMISSION-2026-10-21`, `source.commit_sha: e12d0f8…`, `pin_semantics: EVENT_COMMIT_PIN`, observed `2026-10-21T08:40:00+00:00` (mapped via PR #193 `6f645c9`, corrected by PR #195 `70b1d87`) |
| Owner disposition | `evidence/evidence-admission-2026-10-21/registry-disposition.json`: `status: UPDATED`, `registry_commit_sha: def8012f78b72c95583a22203452faf39aec12ad` — coherent with the rebind chain |

Ancestry: `e12d0f8`, `5ed7216`, `4943902`, `41bb624` (the disposition's
implementation commit) are all ancestors of `origin/main` = `5ed7216`
(`git merge-base --is-ancestor`). Structural validators at the same day's
heads (`registry 7e7d891`, `atlas 68f06ea`): `validate_registry.py` PASS,
`validate_atlas.py` PASS, pin reachability on a freshly provisioned 17/17
mirror farm REACHABLE for the lane's claims.

## 2. Gates

- Full hosted-workflow replication at `5ed7216` under Node v24.19.0 (the
  workflow's pinned major): 21/21 steps exit 0, `test:vnext` 734 pass / 0
  fail, including the 24 `tests/vnext/evidence-admission.test.mjs` tests;
  `validate-registry-disposition.mjs` accepts the lane's published
  disposition. This is a LOCAL replication; hosted GitHub Actions remains
  blocked account-wide (billing lock) and is NOT claimed.
- Re-run in this run's worktree after the header repair: 24 pass / 0 fail.

## 3. Independent qualification probes (4/4 bound)

Each probe neutered exactly one guard in the worktree and was reverted
afterwards; the tracked tree at the probe time was pristine.

| Probe | Neutered guard | Result |
|---|---|---|
| P1 | A3 content binding (`EVIDENCE_ADMISSION_CONTENT_MISMATCH` check) | 2 designed tests fail: "an admission for another content is refused" AND the end-to-end chain test "the full promotion chain … refuses an admission for other content" (22 pass / 2 fail) |
| P2 | the versioned-tree downgrade guard (weaker `content` kind refused when `git` context exists) | exactly "the weaker content kind is not admitted in a versioned tree …" fails (23/1) |
| P3 | the admission byte-compare against its publishing commit | exactly "an admission that was changed after it was committed is refused" fails (23/1) |
| P4 | the published-history ancestry check (`merge-base --is-ancestor`) | exactly "a commit outside the published history is refused" fails (23/1) |

The suite is demonstrably sensitive to every neutered guard class; no guard
was found unbound by this probe set. (The `!published` not-committed check is
redundant by design: killing it alone does NOT release the class, because the
not-carried check on the looked-up commit refuses independently — a deliberate
defense in depth, recorded here.)

## 4. Finding and repair in this change

- **F-Q1** the module header claimed the shared confinement primitive is used
  "for every file it reads". The code reads the corpus files and the on-disk
  admission copy with plain reads, guarded by the byte-for-byte comparison
  against the named content commit (and the corpus file-set comparison). The
  prose outran the code. **Repaired in this change**: the header now states
  exactly which reads go through the primitive (admission artifact, eval
  record, baseline record) and which are guarded by the committed-content
  comparison, and why that comparison refuses everything a confinement proof
  would refuse for those reads. No behavior change (comment-only); suite
  re-run green.

## 5. Registration surfaces

- This change (evidence record + header precision, no behavior change):
  `registry-disposition.v1` classification NO_CHANGE, `affected_records`
  empty — the qualification mutates no registered object.
- Registry: the qualification is registered as its own change record
  (`MAWS_S9_QUALIFICATION_2026_10_21_001.yaml`) in `unitera-registry-main`,
  bound to the published commits of this run.
- Atlas: the qualification is represented as its own claim with
  `EVENT_COMMIT_PIN` in `unitera_atlas`, after the Registry merge.

## 6. Limits — what this run does NOT claim

- No hosted CI result (Actions remain account-locked); everything above is a
  local replication under the pinned Node major.
- No Mimosa/security-scanner coverage: the deep scanner's analysed set
  contains no `.mjs` material (measured the same day), so no security-scan
  PASS is derived here.
- No authority, approval, promotion, activation or runtime state is inferred.
  The lane's own limits (F1: the content binding is a declared, reviewed
  binding, not a proof that the corpus measured that content) stand unchanged.
- The confinement residuals R1–R4 are inherited as documented; working them
  is a separate lane and is not part of this qualification.
