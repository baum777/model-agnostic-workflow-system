# S9 — Regression and Rollback — 2026-10-22

Run: the owner instruction of 2026-10-22, which opens the MAWS-SII
development lane's slice S9 (Regression and Rollback) and asks for the
implementation of the controlled evaluation, adoption and rollback of
instruction, skill and harness changes. The lane continues under the adopted
development target (OD-20).

## Spec binding

`docs/proposals/skill-intelligence-target-spec.md`
(`MAWS-SII-TARGET-SPEC-001` v0.2.0), section 15 slice S9 (regression cases
permanently in the evals, the candidate/previous-version switch, the rollback
paths, the materiality re-check after the rollback, the immutable run
evidence), section 10.3 (the evaluation protocol), section 10.5 (the promotion
criteria: no automatic adoption on an improved score metric), section 11.3
(materiality), section 13.4 (the promotion boundary) and section 6.5/6.6 (the
audit safety and coverage boundaries that keep the S3 wave 2 candidates
advisory).

## Change

- `core/contracts/regression-comparison.schema.json` (new): one versioned
  comparison of a baseline revision and a candidate revision. Both sides
  carry their version, their content digest, their corpus digest, their
  subject kind and their subject reference. The criteria (skill routing
  accuracy, output assertion pass rate, security regression count, advisory
  instruction-integrity candidate count) and the admissibility invariants
  (evidence complete, one corpus, the same subject, two distinct revisions,
  no adoption) are separate fields. `adoption_authorized` and
  `authority_granted` are const false.
- `core/contracts/rollback-record.schema.json` (new): one controlled rollback
  PLAN of a failed candidate to the last qualified revision, with the restore
  target, the materiality decision re-derived for the restored state, the
  independent pre-rollback digest of the evidence inventory next to the
  recomputed digest, and a typed refusal code for every refusal.
  `adoption_authorized` and `authority_granted` are const false.
- `runtime/regression/regression-gate.mjs` (new): the comparison.
- `runtime/regression/rollback.mjs` (new): the controlled rollback plan.
- `runtime/regression/signal-evaluation.mjs` (new): the measurement of the
  eight advisory semantic signals of the S3 wave 2 layer against an
  independent case corpus, with the false positives, the false negatives and
  the coverage gaps reported separately per class.
- `evals/s9-regression/corpus.json` (new): the independent case corpus.
- `scripts/tools/validate-regression-comparison.mjs` (new): the contract
  validation plus the fail-closed semantic invariants C1–C9 (comparison) and
  K1–K6 (rollback) that the minimal JSON schema engine cannot express.
- `scripts/tools/run-regression-eval.mjs` (new): the evaluation runner.
- `evals/fixtures/maws-vnext/regression-comparison.contracts.json` and
  `evals/fixtures/maws-vnext/rollback-record.contracts.json` (new): the
  schema-decidable contract cases.
- `tests/vnext/regression-eval.test.mjs` (new): 38 tests.
- `.github/workflows/loop-repo-ci.yml`: the S9 gates are wired into the
  hosted workflow.
- `scripts/tools/capture-assurance-run.mjs`: the S9 gate joins the local
  replication of the workflow, and the S9 material joins the pinned
  artifacts.
- `docs/proposals/skill-intelligence-target-spec.md`: the S9 implementation
  section and the status block.
- `evals/README.md`, `evals/catalog.json`, `package.json`, `CHANGELOG.md`.

## The two decisions, and what they refuse

**The comparison decides whether the candidate regressed.** The blocking
criteria say how the candidate compares, as a matter of degree; the
admissibility invariants say whether the comparison can be adjudicated at
all. The security criterion is ABSOLUTE: a candidate that carries any
security regression regresses the criterion, however it compares with a
baseline that carried more, so a relative improvement cannot launder an
unresolved regression. The advisory instruction-integrity candidate count is
not blocking: it is carried as an observation, because an advisory candidate
is a hint whose classification the owner makes. Missing evidence, a corpus
mismatch, a comparison of two different subjects, a comparison of a revision
with itself and an unmeasured blocking criterion produce `BLOCKED` — never
`NO_REGRESSION`.

**The rollback plan restores the last qualified revision, and refuses
anything else.** The restore target is derived, not chosen: the newest
revision whose qualification is `QUALIFIED` and carries its own evidence. A
request for an older or an unqualified revision is refused with a typed
refusal code. For the restored state, the materiality against the
qualification it would inherit is re-derived; a restore that does not restore
the qualified state is `MATERIAL` or `UNKNOWN` and fails closed. The
execution history is checked against an INDEPENDENT digest that was taken
before the rollback — never against a digest derived from the state under
examination — and a missing digest is a refusal, not a default. The record is
a PLAN: the verdict is `ROLLBACK_PLANNED`, never `ROLLED_BACK`, because a
plan is not an apply.

## Safety posture (deliberate)

- The comparison authorizes nothing. `adoption_authorized` and
  `authority_granted` are const false in both contracts, and the S8
  promotion path stays the only route to an adoption.
- The rollback plan adopts nothing, qualifies nothing and executes nothing.
  It computes a record; the restoration itself belongs to the owner-governed
  promotion path, and a record of a PERFORMED restore with its post-write
  readback is a separate contract that this slice does not claim.
- The eight advisory candidates stay advisory. The slice does not decide a
  semantic class and does not discharge the owner review of the candidates.
- The runtime modules are pure: they read their arguments and write nothing.
  The runner proves it by hashing the candidate tree before and after a
  rejected comparison.
- Every removal of scratch state goes through the repository's safe
  primitive with an explicit boundary (see the second finding below).

## Measurement (measured, not asserted)

The corpus fixes the answer of every case before the detector runs: one case
per semantic class in which the class holds and one in which it does not.
The answer of a case is a property of the case, not of the detector.

| Measurement | Result |
|---|---|
| Signal cases | 16 over 8/8 classes |
| True positives / false positives / false negatives | 8 / 0 / 0 |
| Coverage gaps (classes without an independent case) | 0 |
| Comparison cases | 8, every expected verdict reached |
| Rollback cases | 7, every expected verdict and refusal code reached |
| Candidate tree after a rejected comparison | byte-identical (8/8) |

The labels are **constructed**: this is a self-measurement of the detectors
against cases whose answer was fixed when the case was written, not an owner
review. The eight classes remain not statically analyzable, the candidates
remain advisory, and the absence of candidates in the live corpus remains the
declared limitation of wave 2 — it is not extended by this measurement.

## A finding of this run: the authority matrix is a pinned instruction source

The first attempt registered the S9 surface as a family in
`evals/fixtures/maws-vnext-baseline.json`, which requires a row in
`docs/authority-matrix.md`. That row changes the effective instruction
digest, and the digest is pinned: the reference run spec
(`runtime/cli/specs/reference-audit-v1.json`) and the frozen HO-01 experiment
specs carry it. With the row in place, `tests/vnext/runtime-run-intake.test.mjs`
(11 cases) and `tests/vnext/experiment-comparison.test.mjs` fail closed with
`BLOCKED` / `NO_ELIGIBLE_EXECUTOR` — the designed behaviour, because a
qualification may not silently inherit a changed instruction state.

The change was reverted and the registration is deferred to the lane that
owns the instruction-digest re-pin (the repository's own rebind precedent).
This is consistent with the earlier slices: S3, S5, S11, S12 and S13 are
registered in the Registry and the Atlas without a family row in that table.
The deferral is recorded in the run record, in the Registry registration and
in the Atlas representation.

## A second finding of this run: the cleanup path of the slice

The concurrent operational-safety lane added a gate that binds the harness
surface: no module under `scripts/tools/` or `tests/tools/` removes a tree
recursively without the repository's safe primitive. The S9 runner removed
the fixture trees it had created with a direct `fs.rmSync`, and the gate
named the file:

```text
the harness surface removes no tree without a boundary check
scripts/tools/run-regression-eval.mjs
```

The finding is correct, and the shape is the shape of the /tmp incident of
2026-10-21: a removal that computes its target from something it was handed.
The repair routes every removal of this slice through
`scripts/tools/safe-remove.mjs`: one marked scratch root per run, the case
trees inside it under names the runner chooses (a case id is data and never
becomes a path), every case tree removed with `safeRemove` against that
boundary, and the scratch root removed with `removeScratchRoot`, which
refuses a directory that does not carry the ownership marker. The runtime
module that measures the eight signals does the same. The gate that found the
defect passes after the repair, and the evaluation is unchanged.

## A third finding of this run: the independent review of the first revision

The review connector reviewed the first revision of this slice and found five
defects. All five were real, and all five are repaired in the bound commit;
each repair is bound by a corpus case and a unit test.

1. **A blocked security gate passed the comparison.** The security criterion
   was judged by the relative comparison alone, so a candidate that halved the
   security regressions of the baseline and still carried one was reported as
   `IMPROVED` and the comparison answered `NO_REGRESSION`. The security
   verdict is now absolute (the S5 rule R1: any security regression forces
   the blocked outcome).
2. **A rollback plan claimed an execution.** `planRollback` restores nothing,
   yet it answered `ROLLED_BACK` and the caller persisted that record as if a
   rollback had happened. The verdict vocabulary is now `ROLLBACK_PLANNED |
   BLOCKED`; a record of a performed restore with its post-write readback is
   a separate contract.
3. **The history check was tautological.** Without a supplied pre-rollback
   digest the module derived one from the state it was checking, so the
   preservation check could never fail. The pre-rollback digest is now
   independent evidence, and its absence is the typed refusal
   `HISTORY_DIGEST_MISSING`.
4. **The validator trusted the stated criterion verdicts.** It checked the
   delta arithmetic but not whether `IMPROVED`/`EQUAL`/`REGRESSED` agreed
   with the measured values. The verdict is now derived and re-computed
   (rule C8).
5. **A comparison of two subjects passed.** The admissibility checks never
   compared the subjects, so two different skills measured over one corpus
   were reported as a baseline and a candidate. `SAME_SUBJECT` is now an
   invariant, the record carries the subject kind next to the subject
   reference, and the validator binds the invariant to what the two sides
   actually say (rule C9).

A second review round of the repaired revision found three more, and they are
repaired with it:

6. **A corpus file key could escape the case directory.** A key with a `../`
   component resolved outside the scratch root, and the file was written
   there. Every corpus file key is now confined to its fixture tree before
   anything is created (`CORPUS_PATH_OUTSIDE_CASE`), in the runtime module
   and in the runner.
7. **The rollback validator trusted the stated history digests.** It compared
   the two digest strings without hashing the recorded inventory, so an
   edited entry with untouched digests passed. The validator now recomputes
   the inventory digest and refuses a record whose inventory does not match
   its own digest.
8. **The SAME_CORPUS invariant was trusted.** The validator never compared
   the two revision digests, so an explicit record could claim one corpus
   while naming two. The corpus equality is now derived from the revision
   fields and the invariant is bound to it (rule C9).

## Verification

The machine-readable evidence of this run is
`evidence/s9-regression-rollback-2026-10-22/run-record.json`: every gate's
raw stdout and stderr are committed next to their exit code, every test count
is re-derived from that raw log by the validator, and every artifact digest
is recomputed from the blob at the bound commit `5b5319e`. The capture ran in
a clean clone of the bound commit, so no gate observed a dirty tree. The
record is a `LOCAL_REPLICATION` of the hosted workflow's steps under the
workflow's pinned Node major: **21/21 gates PASS, 973 tests passed, 0 failed**.

## Not claimed

- No hosted CI result is claimed. The account's GitHub Actions admission is
  closed (registry finding F-09, owner-gated): the workflow runs exist as job
  objects with an empty step list. Every result above is a local measurement
  at the stated commit.
- No authority, adoption, qualification, permission or runtime activation is
  created. The slice implements a comparison and a rollback PLAN; it decides
  nothing, activates nothing, and it does not claim that a rollback was
  performed.
- No security claim is derived from the external deep scan: the session's
  pre-commit scan returned an inconclusive result (`scanner_enobufs`). The
  repository-owned `.mjs` static gate is a bounded rule scan over the
  governed roots, not a vulnerability analysis.
- The correctness of a semantic classification is not claimed. The eight
  classes stay not statically analyzable and the owner review of the advisory
  candidates stays open.
- The authority-matrix family row for the S9 surface is not claimed; it is
  deferred to the instruction-digest re-pin lane, with the reason recorded
  above.
- No independent human review is claimed. The verification is tool-based; the
  review of the first revision was made by the review connector.
