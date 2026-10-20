# SII Target Specification v0.2.0 — Revision (2026-10-20)

Revision of `docs/proposals/skill-intelligence-target-spec.md` from v0.1.0 to v0.2.0
under the bounded owner run instruction
`OWNER-DIRECTED-HARNESS-TRANSFORMATION-RECONCILIATION-2026-10-20` (reconciliation and
registration of a harness-transformation proposal; integration into this specification;
registration in Registry and Atlas; no canonical adoption).

- Revision base: MAWS `origin/main` = `ee7f094b2676963b20161f093ed5a9a01e0c018b`
- Implementation commit: `cedeeeff67ac616bf597020f38a01d704c9127d6`
- Registry baseline at classification time: `5afc852a8e98c3b3ea4d7bf7bd58a645cad72d86`

## Scope

Docs-only proposal revision. No contract, runtime, qualification, permission or
authority surface is created or changed. `docs/proposals/README.md` classes this
directory as non-canonical review material; per Section 21 of the specification itself,
canonical adoption, implementation and runtime activation each require their own gated
steps and none of them is performed by this revision.

## What changed

The v0.1.0 body is preserved unchanged. v0.2.0 adds three areas and two clarifications.

| Area | Section | Slice | Content |
|---|---|---|---|
| Separate harness contexts | § 4.3 (+ O7) | S11 | Development Harness and UNITERA Product Harness as separately authorized execution contexts; a development-harness permission never implies product-runtime authority; a context change is a bound plan revision; executor bindings carry their context; product effects stay bound to execution-control decisions regardless of context |
| Model-adaptive executor profiles | § 11.5 | S12 | Versioned presentation/interaction layer above the unchanged `core/contracts/execution-profile.schema.json` qualification dimensions; task scope, authority, tool rights, security controls, completion criteria and evidence requirements stay identical across models; profile change triggers behavioral requalification, not automatic contract rewording |
| Comparative benchmark harness | § 10.6 (+ O8) | S13 | Single-executor baseline against a policy-bounded multi-executor alternative; measures tokens, cost, latency, intervention count, verification success and artifact quality; checks context isolation and inherited authority/budget boundaries; records routing/composition selection criteria and counterproductive cases; a benchmark result is a comparison basis, never an authorization or qualification |
| Context ownership | § 3.4, § 7.5 | — | MAWS introduces no second context compiler and no second canonical context manifest; the coreos-owned Context Compiler (`coreos/src/context/`) stays the owner of source proofs, data classification, egress and context budget; MAWS owns instruction classes, skill selection, bundle assembly, executor binding and routing; an instruction bundle references the context binding instead of duplicating it |
| Audit coverage boundary | § 6.6 | — | The closed § 6.2 taxonomy is the target set; absence of findings in a class declared not statically analyzable is a declared limitation, never a clean bill; semantic classes require owner-reviewed analysis and never block alone |

## Reconciliation decision

A separate, broader harness-transformation specification was **not** created. Its three
substantive extensions are integrated into this revision. The remaining general target
description coincides with the existing v0.1.0 body and is not duplicated. This follows
the owner's explicit direction that the transformation is integrated into
MAWS-SII-TARGET-SPEC-001 and that no second parallel specification exists.

## Not declared complete

The slices S0–S3 and the S4 wave A instruction reduction are merged at their owner
surfaces. This revision **neither restarts them nor retroactively declares them
complete**. Their actual repository state is to be proven at the respective
implementation site. Outstanding evidence obligations — in particular the still-open
Registry `CONTRACT_RECORD` write for S1 (`core/contracts/skill-feedback.schema.json`,
disposition `REQUIRED_BUT_BLOCKED`) — remain open and are to be closed at their
respective place.

## Validation

Executed on this worktree at implementation commit `cedeeef`:

- `npm run validate` — PASS, 0 issues (includes the neutral and secret sub-results).
- `npm run validate-neutral` — PASS, 0 issues.
- `npm run validate-maws-vnext` — PASS, 0 issues.
- `npm run test:vnext` — 314/314 pass, 0 fail.
- `npm run eval:maws-vnext` — PASS, 0 issues, blocking gate passed.
- `npm run scan-secrets` — 0 findings.
- `npm run eval:secret-boundary` — PASS, 0 issues.
- `node scripts/tools/validate-registry-disposition.mjs evidence/sii-target-spec-v0-2-0-2026-10-20/registry-disposition.json` — PASS.

The proposed § 14 paths for S11–S13 were collision-checked against
`origin/main` = `ee7f094`: `core/contracts/harness-context.schema.json`,
`core/contracts/executor-model-profile.schema.json`,
`core/contracts/benchmark-result.schema.json`, `runtime/harness-context/`,
`runtime/profiles/model-adaptive/`, `evals/benchmark-harness/`,
`scripts/tools/run-comparative-benchmark.mjs` — all free at that revision.

## Registration

- Registry disposition (owner side): `registry-disposition.json` in this directory —
  `NO_CHANGE`, proposal staging only, no registry-relevant class changed. The change
  registration itself is a separate record in the Registry repository
  (`baum777/unitera-registry`); it is not an object mutation of this revision.
  The contract field `registry_commit_sha` stays `null`: `registry-disposition.v1`
  invariant 4 forbids a non-null value unless the status is `UPDATED`, and invariant 2
  requires `UPDATED` to carry a non-empty `affected_records` list — which this change
  does not have, because no registry-relevant class changed. The published registration
  SHA is carried as publication evidence instead, and only after the publication
  succeeded.
- **Published Registry change registration:**
  `registry/MAWS_SII_TARGET_SPEC_V0_2_0_2026_10_20_001.yaml` in `baum777/unitera-registry`,
  merged as `03cf866183e878a88f5b0e5c02b00f56152893c7` (pull request 215), with
  `registry_object_mutation: NONE_IDENTIFIED` and the owner-side `NO_CHANGE`
  classification reproduced in the determination text.
- Atlas representation: a navigation-only claim supplement in `baum777/unitera_atlas`,
  pinned to the merge event of this publication and to the Registry publication.
