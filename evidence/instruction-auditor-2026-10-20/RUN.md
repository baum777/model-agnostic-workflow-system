# SII Slice S3 — Instruction Auditor (2026-10-20)

Implements slice S3 of MAWS-SII-TARGET-SPEC-001 (PROPOSED): audit taxonomy,
static reference checking, advisory classification of semantic findings, and
evidence-backed audit reports — on top of the S2 wave 2 reference graph.

## Scope

- `core/contracts/instruction-audit-finding.schema.json` — NEW canonical
  contract: spec §6.4 finding contract with the closed §6.2 taxonomy
  (10 classes), deterministic provenance (source path, revision, 1-based
  line range, authority class), closed risk/confidence vocabularies, and
  fail-closed if/then policy:
  `semantic_advisory` can never carry `blocker` risk; `blocker` risk and the
  `AUTHORITY_LEAK` class always force `requires_owner_review: true`.
- `runtime/instructions/instruction-auditor.mjs` — read-only auditor over
  `buildInstructionGraph`. Wave 1 analyzes the two statically decidable
  classes: `STALE_REFERENCE` (dangling file edges, risk high) and
  `INVALID_COMMAND` (dangling command edges, risk medium). The remaining
  eight classes are declared in `coverage.classes_declared_not_analyzable`
  with explicit limitation reasons — absence of findings for them is a
  declared limitation, never a silent clean bill. `inferred_cause` is `null`
  in wave 1: the auditor does not guess causes.
- `scripts/tools/validate-instruction-integrity.mjs` (spec §14 path, npm
  script `validate-instruction-integrity`) — fixture mode (18 cases: 5
  positive / 13 negative, all matching their labels) and `--revision` mode:
  live audit with per-finding contract round-trip validation, `--output`
  persistence, opt-in `--fail-on-blocker`. Default posture is advisory:
  findings never gate by themselves (spec §6.5 — blocking via findings is a
  gate-policy decision owned elsewhere).
- `evals/fixtures/maws-vnext/instruction-audit-findings.contracts.json`
  registered in `evals/catalog.json` (covered by `eval:maws-vnext`);
  `core/contracts/README.md` canonical files list extended;
  `tests/vnext/instruction-auditor.test.mjs` — 5 tests incl. contract
  round-trip on emitted findings and the byte-identical read-only proof.

## Results on this worktree (main pin 2eff613f924c7a8e20cdc3a946971bed919d23d6, implementation commit 866ab49ef6056aa2cc929744c5ed6b4c5a83d63e)

- `node --test tests/vnext/instruction-auditor.test.mjs` — 5/5 pass.
- `npm run test:vnext` — 312/312 pass, 0 fail.
- `npm run validate` / `validate-neutral` / `validate-maws-vnext` /
  `validate-secrets` / `scan-secrets` — PASS (exit 0 each);
  `npm run eval:maws-vnext` — exit 0 (fixture now included).
- Fixture validator: 18 cases checked, 0 unexpected results.
- Live audit at implementation commit `866ab49`:
  `ia_2366a005f76a00ed` — 10 findings (10 STALE_REFERENCE, 0 blocker),
  0 contract violations, 2 classes analyzed, 8 declared not statically
  analyzable. Full machine-readable report persisted at
  `evidence/audit-report-866ab49.json`. All 10 findings correspond 1:1 to
  the dangling references the S2 wave 2 CLI observed at `87a86d54`; nothing
  was repaired in this slice (silent cross-surface repair is prohibited).

## S3 DoD

Defined instruction problems are detected reproducibly and classified
correctly: re-running the audit on an unchanged tree reproduces audit id,
finding ids, and digest; the closed taxonomy plus the honest coverage
declaration prevent taxonomy drift; semantic findings are advisory by
construction (schema-enforced).

## Posture

A finding is analysis output, never authority (spec §6.5, §21): it mutates
nothing, gates nothing by default, grants no permission, and replaces no
approval decision. The new canonical contract carries the pending registry
obligation — see registry-disposition.json (REQUIRED_BUT_BLOCKED, following
the two-phase intake-binding precedent: source publication first, registry
CONTRACT_RECORD write second, disposition rebind to UPDATED third).

## Repair round (2026-10-20, post-merge codex findings)

The codex review on PR #26 completed at `2603ba3` after the merge with
three findings (`has_unresolved_findings: true` at merge time). All are
repaired before the pending registry CONTRACT_RECORD write:

- **F-26-1 (P1)** — the CLI read the files on disk and stamped whatever
  `--revision` value was supplied into the report, so
  `--revision not-a-real-revision` produced a contract-valid report with
  unreconstructable provenance. Repair: fail-closed revision gate — the
  revision must resolve to a real commit, must be exactly HEAD of the
  audited tree, and the tracked tree must be clean; otherwise the tool
  exits 2 with `AUDIT_REVISION_UNVERIFIED` and writes no report.
- **F-26-2 (P2)** — the finding identity omitted the graph edge kind, so
  the same missing target on one line arriving as both a markdown link and
  an inline path produced two edges but one `finding_id`. Repair: edge kind
  is part of the hashed identity; a regression test plants both edge kinds.
- **F-26-3 (P2)** — the contract defines `line_range` as inclusive
  `[start, end]` with `start <= end`, but the JSON schema engine cannot
  compare array elements, so `[10, 2]` passed contract validation.
  Repair: `semanticFindingIssues` in the auditor module enforces the
  ordering invariant in every validation path (fixture mode and live
  round-trip); the semantic fixture set lives in
  `evals/fixtures/maws-vnext-semantic/` — deliberately outside
  `evals/fixtures/maws-vnext/` because the generic eval runner applies
  schema validation only and would mislabel a schema-passing semantic
  negative case.

### Signing deviation (disclosed, corrected 2026-10-20)

Three commits of this change set are **not GPG-signed**: the repair commit
`82a638a268afccfc612ee184d8e536ab7230241c`, its evidence commit
`bc4b9fb3b07860837cd1db79708c6e5a05e83b2f`, and the later disposition
rebind `3ace7339c1ad37264dd35ac7b0bee80d355e42cf`. `git log --format='%G?'`
reports `N` for each of them. The cause was a local tooling failure, not a
decision: the gpg-agent held no usable passphrase cache and the gnome3
pinentry could not be driven non-interactively
(`PINENTRY_LAUNCHED ... Zeitüberschreitung`), so signing was skipped rather
than blocking the work.

Every commit produced before that failure is validly signed (`G`): the S1
repair `c5f6fbed` and its evidence commit `e3c03aad`, the S3 implementation
`866ab49` and its evidence commit `2603ba3b`, and the S2 wave 2 commits
`70be5292` and `a886d6c1`. The repository merge commits carry a signature
whose key is not present in the local keyring (`E`), which is why they
cannot be verified locally either.

An earlier version of this record stated that every other commit in the
change set was signed. That was wrong for `bc4b9fb` and `3ace733` and is
corrected here rather than left standing.

Scope of the deviation: it is a property of three commits, not a quality
statement about them, and the disclosure does not make them policy-conform.
No contract in this repository (AGENTS.md, WORKFLOW.md, docs/governance/)
makes a Git signature mandatory for MAWS commits, so the deviation is not a
breach of a stated rule; the trusted-custody rules that do exist govern
owner-authentication carriers in Unitera Systems, not MAWS commits. The
deviation is recorded here, in the registry record and in the Atlas
observation. A later signed commit does not sign an earlier commit
retroactively, so the state of these three commits stays as recorded.

### Verification after repair

`npm run validate-instruction-integrity` — 21 cases checked (18 schema +
3 semantic), 0 unexpected results; `npm run test:vnext` — 318/318;
`npm run eval:maws-vnext` — exit 0; `npm run validate` /
`validate-neutral` / `validate-maws-vnext` / `validate-secrets` /
`scan-secrets` — PASS. The S3 disposition is rebound to the repair
commit while staying REQUIRED_BUT_BLOCKED until the registry write.

### Alignment with the v0.2.0 coverage boundary (spec § 6.6)

The parallel lane revised MAWS-SII-TARGET-SPEC-001 to v0.2.0 (PR #28,
`cedeeef`), which adds § 6.6 "Coverage Boundaries". The repaired auditor
satisfies every clause of that section as implemented:

- statically decidable classes are checked deterministically — § 6.6 bullet 1;
- the remaining classes are declared as not statically analyzable — bullet 2;
- the absence of findings in a declared-not-analyzable class is a declared
  limitation, not a clean bill (the coverage block names each class with
  its limitation reason) — bullet 3;
- semantic classes require owner-checked analysis, never block alone, and
  replace no approval decision (`semantic_advisory` findings carry
  `requires_owner_review`, may not carry `blocker` risk, and the CLI exits
  0 by default) — bullet 4;
- extending wave coverage is separate, measurable slice work, not an
  implicit property of the auditor — bullet 5;
- the audit report lists analyzed and explicitly not analyzed classes
  separately (`coverage.classes_analyzed` vs.
  `coverage.classes_declared_not_analyzable`) — bullet 6.

No code change was required for this alignment; the wave 1 design already
matched the clarified boundary.

## Registry write (two-phase closure, 2026-10-20)

The pending CONTRACT_RECORD obligation was discharged by the registry pull
request `projection/sii-contracts-20261020` (pull request 216), which
published `registry/MAWS_INSTRUCTION_AUDIT_FINDING_2026_10_20_001.yaml` (run
change registration) and
`registry/MAWS_INSTRUCTION_AUDIT_FINDING_CONTRACT_2026_10_20_001.yaml`
(CONTRACT_RECORD projection) and merged as
`e22eb3351b6a1d810272ac9c605f9d212bfd0d88`. Both registry CI gates passed at
that merge commit (registry validation offline, cross-repository
reachability). This disposition is rebound from REQUIRED_BUT_BLOCKED to
UPDATED with `registry_commit_sha` equal to that merge commit. The registered
contract state is the repaired one (pull request 30, including the disclosed
signing deviation of commit 82a638a), and both publications are named in the
registry record so the history stays reconstructable.
