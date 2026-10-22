# MAWS — the merge executor hardening and the enforcement of the merge path

Date: 2026-10-21 (published 2026-10-22Z). This run hardens the merge path
that the cross-lane merge incident closure of 2026-10-21 introduced, and it
adds the enforcement that the closure record named as open. It establishes no
new capability, no authority and no permission.

---

## 1. The scope of this run

The closure record of 2026-10-21 named four open items. This run takes
exactly those four and nothing else:

1. **The reviewed head was operator-declared** — a technical defect of the
   first generation, named in the closure record's limits: "The reviewed
   head sha is operator-declared for a merge. The lane authorization can
   only pin an *ancestry* commit, because a commit cannot contain its own
   digest."
2. **A local gate could attest to content that was not the merged content**
   — a technical defect found in this run: the first generation's published
   claim that a local gate "verifies the content that is about to be merged"
   was stronger than the implementation, which checked only that `HEAD` was
   the reviewed head. A dirty working tree passed that check, and the gate
   then measured something else.
3. **The lifecycle of the lane authorization** — the closure record named
   it: a lane record stayed valid forever and could be re-pointed silently.
4. **The mandatory enforcement of the merge path** — the closure record
   named it: "The executor is a merge path, not an enforced gate."

No other MAWS function was touched. The change is confined to the merge
executor, its contract, the lane surface it reads, one new audit tool, their
tests, the CI wiring and this evidence.

## 2. What was repaired

### 2.1 The lane binds the reviewed head (defect 1)

The contract `core/contracts/merge-lane-authorization.schema.json` is
extended to **1.1.0**. A lifecycle-aware lane carries the EXACT reviewed
head it authorizes (`authorized_head_sha`), and the merge path refuses
everything else:

| Situation | Refusal |
|---|---|
| a lane that binds no head | `MERGE_HEAD_NOT_BOUND` |
| a lane of the first generation (1.0.0), with or without a binding | `MERGE_LANE_AUTHORIZATION_OBSOLETE` |
| a lane whose binding is not the live head of the pull request | `MERGE_HEAD_SHA_MISMATCH` |

The published record of the first generation
(`core/authority/merge-authorizations/merge-incident-closure-20261021.json`)
stays valid as history and can never authorize a merge again. It is not
rewritten: the history of the surface is part of the surface.

The chicken-and-egg of the binding is real and it is solved by the
lifecycle, not by an exception: a commit cannot contain its own digest, so a
lane is bound **after** its head exists and **before** the merge — the
binding is a separate, explicit act on the default branch.

### 2.2 The local gate attests the merged content (defect 2)

`runLocalGates` now refuses a working tree that carries an uncommitted
change (`MERGE_WORKTREE_DIRTY`) before it runs a gate. The HEAD check alone
was not enough: a tree whose HEAD is the reviewed head but whose files on
disk differ from it passes the HEAD check and still makes the gate attest to
something other than the merged content. The receipt carries the
attestation (`worktree_clean`).

### 2.3 The lane has a lifecycle

Contract 1.1.0 adds three fields and the executor enforces them:

| Field | Meaning | Refusal |
|---|---|---|
| `state` | `active` or `closed` | a closed lane: `MERGE_LANE_CLOSED` |
| `supersedes` | the lane this lane replaces | a superseded lane: `MERGE_LANE_SUPERSEDED` |
| `closed_by` | the merge the lane was closed by | a closed lane without it is a malformed record |

The surface of lane authorizations is read from the **base commit's tree**
(`readLaneSurface`), never from the working tree: a pull request cannot
introduce the lane that supersedes it, because the branch it merges into
does not carry it yet. A lane of the first generation may not carry a
lifecycle field at all — the contract forbids it and the executor refuses
it — so a record of two generations cannot exist.

### 2.4 The merge path is enforced

`scripts/tools/verify-merge-attestations.mjs` (npm `merge:audit`, CI step
"Merge path attestation audit") is the **detective** counterpart of the
executor's **preventive** path. It reads the default branch's own merge
history and fails closed on a merge that no lane authorization covered. A
merge that no lane bound is the exact shape of the incident of 2026-10-21.

The audit needs no epoch file, no baseline list and no hidden exemption
table:

- **In scope**: a merge whose *base* tree already carries the
  lifecycle-aware contract. A merge whose base branch did not yet know the
  contract is a **historical observation** — it cannot be judged by a rule
  that did not exist when it landed.
- **Governance act**: a merge whose changed paths are confined to
  `core/authority/` lands a lane authorization and nothing else. It cannot
  carry content, so it is exempt — otherwise the lane that authorizes a
  merge could never be landed by a merge.
- **Covered**: every other merge must be covered by an active lane in the
  base tree that binds exactly the merge's second parent, names the
  canonical merge authority and the audited branch, and whose ancestry pin
  the merged head descends from.

Three findings make the audit fail: `MERGE_NOT_COVERED`,
`MERGE_LANE_AMBIGUOUS` (two lanes bind one head), `MERGE_LANE_REUSED` (one
lane covers two merges) and `MERGE_LANE_RECORD_MALFORMED`.

## 3. Verification (all LOCAL)

| Gate | Result on the published head |
|---|---|
| `npm run test:merge-executor` | **89 of 89** pass |
| `npm run test:merge-attestation` | **15 of 15** pass |
| `npm run test:merge-lane-contract` | **21 of 21** pass |
| `npm run test:vnext` | **787 of 787** pass |
| `node scripts/tools/scan-source-security.mjs` | **PASS** — 244 files analysed, required coverage 4 of 4, zero unbaselined, zero stale |
| `npm run validate`, `validate-neutral`, `validate-maws-vnext`, `validate:assurance-run -- --all`, `eval:maws-vnext`, `eval:secret-boundary`, `eval:provider-export-alignment`, `baum:ci-gate` | all ok, zero issues |
| `npm run merge:audit` | **PASS** on the merged default branch: 75 merges examined, all of them historical observations (the enforcement entered the default branch with the merge of pull request 79) |
| **15 reverted mutation probes** | **15 of 15 BOUND** — each probe neuters exactly one guard and is caught by the designed test; the source files were verified **byte-identical** after the run |

The probes cover: the legacy-generation refusal, the unbound-lane refusal,
the closed-lane refusal, the supersession refusal, the dirty-tree refusal,
the bound-head equality, the malformed 1.1.0 record, the first-generation
record that claims a lifecycle field, the closed lane without its
consumption record, the audit's binding check, the audit's base-tree read,
the governance-act exemption, the lane-reuse check, the scope rule and the
audit's closed-lane exclusion.

**Two probes of the first attempt were NOT bound, and that was a finding,
not a nuisance.** The audit's version check on a lane record could not be
distinguished from the state rule: a first-generation record cannot carry an
active state (the contract forbids the field and the reader refuses it), so
the version rule was enforced one layer earlier and the audit's own copy of
it was redundant. The redundancy was removed instead of being documented
away. The same review exposed a real inconsistency: the executor accepted a
first-generation lane that carried a head binding, while the audit counted
only lifecycle-aware lanes as covering a merge — the two surfaces could
therefore have contradicted each other. The executor now refuses the first
generation outright (`MERGE_LANE_AUTHORIZATION_OBSOLETE`), and both surfaces
apply the same rule.

## 4. The bootstrap: this merge is an owner act

Pull request 79 (the implementation) was merged as
`37a9f75b0abc770afda63780d5f1d6b8205503e3` at 2026-10-22T03:56:08Z, with
the parents `381bc44f83e428aead915d55bb56d24d00a90694` (the default branch
before) and `b912981146bd17c10aa9803b9252c78a5e1291b7` (the pull request's
own head).

**That merge was an owner act, and it had to be.** The enforcement cannot
cover its own introduction: the first lifecycle-aware lane cannot be landed
by the tool it introduces, because the branch it merges into does not carry
it yet. The same holds for the merge that introduces the contract itself —
its base tree does not know the contract, so it is a historical observation
by the audit's own rule. This is a structural property, not an oversight of
this run, and it is the reason the audit's scope rule reads the base tree
rather than a date.

Every merge after that one is expected to be lane-covered, and the audit is
expected to say so. The live proof — the closure pull request merged **by
the hardened executor** under a lane whose binding names its exact head —
is published with the rebind pull request, which carries this pull request's
merge commit and the Registry commit.

## 5. The registration surfaces

- Owner-side classification: `registry-disposition.v1` in
  `evidence/merge-executor-hardening-2026-10-21/registry-disposition.json`.
  The change is a `CONTRACT_RECORD` (the lane authorization contract moves
  from 1.0.0 to 1.1.0) and a `PROVENANCE` (the run record), so it is
  registry-relevant.
- The Registry change registration and the contract record are published in
  the Unitera Registry with the merge of this pull request; the disposition
  is rebound from `REQUIRED_BUT_BLOCKED` to `UPDATED` with the Registry
  commit sha in the rebind pull request.
- The Atlas representation is the claim of the same run, pinned to the merge
  event of the publication and of the rebind.

## 6. Limits — what this run does NOT claim

- **The executor is still a merge path, not an enforced gate.** The
  repository carries no branch protection: GitHub reports `Branch not
  protected` for `main` and the repository has no ruleset (`[]`). The
  enforcement this run adds is therefore **detective, not preventive**: the
  audit makes an unbound merge visible in the repository's own history, it
  does not prevent it at the platform. A platform-level ruleset cannot
  express "this merge came from the lane-bound executor" either — GitHub
  knows pull requests, branches and checks, not work lanes.
- **A direct push to the default branch is outside the audit's mandate.**
  The audit examines merge commits; a commit that was pushed to `main`
  without a pull request is not a merge and is not judged. The published
  history of this repository contains such commits. That bypass class is
  named here as an open item, not closed by this run.
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
- **The authority matrix is deliberately not updated.**
  `docs/authority-matrix.md` is a canonical instruction source
  (`runtime/instructions/instruction-inventory.mjs`, `FIXED_SOURCES`);
  changing it invalidates the effective instruction digest and forces a
  re-pin of the executor profile chain, the run spec and the HO-01
  comparison artifacts. That re-pin is a deliberate, separate act.
- **The governance-act exemption is a deliberate hole.** A merge whose
  changes are confined to `core/authority/` is exempt from the coverage
  rule. It cannot carry content, but it can carry a lane that authorizes a
  later merge — which is the point of the surface and also its risk. The
  exemption is narrow by path, and the lanes it lands are schema-checked.
- **This run does not repair the S5 lane's F4** (the unkeyed freshness seal
  of the S8 lane). It stays open with its owner.
