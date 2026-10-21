# S3 wave 2 — advisory signal layer for the eight semantic audit classes — 2026-10-21

Run: owner instruction of 2026-10-21, which takes up the standing owner
dispositions OA-04 (target specification adoption) and OA-05 (instruction
audit capability implementation) together with the resumption of the MAWS-SII
development.

## Spec binding

`docs/proposals/skill-intelligence-target-spec.md` (`MAWS-SII-TARGET-SPEC-001`
v0.2.0), section 6.2 (closed taxonomy), section 6.4 (finding contract),
section 6.5 (audit safety), section 6.6 (coverage boundaries) and the new
section 6.7 (wave 2). The specification is adopted as the Shared-Core
development target by OD-20 in `docs/maws-vnext-owner-decisions.md`; the
disposition is carried in the specification's own status block.

## Change

- `runtime/instructions/instruction-semantic-signals.mjs` (new): one
  deterministic signal per semantic class of the section 6.2 taxonomy —
  `RULE_CONFLICT` (the same dotted key bound to different values in different
  sources), `PRECEDENCE_CONFLICT` (the same subject governed in opposite
  directions by sources of different authority class), `OVERCONSTRAINT` (a
  prohibition that quantifies over everything and names no scope it stops at),
  `REDUNDANT_INSTRUCTION` (the same normalized instruction in more than one
  source), `CONTEXT_OVERLOAD` (every instruction of a source already stated by
  a source of higher authority), `AUTHORITY_LEAK` (a source below the
  canonical authority classes claims a permission), `MODEL_DRIFT` (an
  instruction asserts a model behaviour or a model property),
  `SKILL_ROUTING_AMBIGUITY` (two skill descriptions claim the same ground).
- `runtime/instructions/instruction-auditor.mjs`: the signals become findings
  with `determinism: semantic_advisory` and `requires_owner_review: true`; the
  taxonomy carries the signal per class; the coverage reports the candidate
  count per class next to the unchanged declaration that the class is not
  statically analyzable.
- `tests/vnext/instruction-semantic-signals.test.mjs` (new): eight planted
  fixtures (one candidate per class), a clean tree that yields nothing,
  determinism, contract validity of every produced finding, the coverage
  shape, and the read-only boundary.
- `docs/proposals/skill-intelligence-target-spec.md`: section 6.7 and the
  status block (target status, canonical adoption, implementation status, next
  gate).
- `docs/maws-vnext-owner-decisions.md`: OD-20.
- `CHANGELOG.md`: Unreleased entry.

## Safety posture (deliberate)

- The signal does not decide the class. A candidate is evidence; the
  classification is the owner's judgement.
- Every advisory finding carries `requires_owner_review: true` and never
  `risk_level: blocker`, so it cannot gate. The auditor stays read-only: no
  file is mutated, no process is spawned, no approval decision is replaced.
- The eight classes stay declared as not statically analyzable. The absence
  of candidates stays a declared limitation, never a clean bill.
- The finding contract is unchanged. `core/contracts/instruction-audit-finding.schema.json`
  already carried `semantic_advisory`, the `requires_owner_review` rule for
  `AUTHORITY_LEAK` and the rule that a semantic advisory finding may never
  carry blocker risk.

## Calibration (measured, not assumed)

The first working version of the layer produced 107 raw candidates on the
current corpus: 100 from `SKILL_ROUTING_AMBIGUITY`, 5 from `MODEL_DRIFT`, 2
from `OVERCONSTRAINT`. Inspection showed three imprecise signals:

- the skill-routing signal fired on two generic shared words, so it named
  nearly every pair of skills in the repository;
- the model-drift signal matched the *mention* of a model or a client, not an
  assumption about model behaviour — it flagged the portability statement
  that explicitly binds to no model;
- the over-constraint signal read the whole line instead of the clause that
  carries the prohibition, so a quantified noun in a neighbouring clause was
  read as the scope of the rule.

The three signals were narrowed (coverage of the shorter description, model
behaviour instead of model mention, clause scope instead of line scope), and
the same corpus then yields **0 candidates**. The detector was not weakened
to reach that number: each of the eight classes still fires on its planted
fixture.

## Verification (at the implementation commit)

- `node --test tests/vnext/instruction-semantic-signals.test.mjs`: 6/6 PASS.
- `node --test tests/vnext/instruction-auditor.test.mjs`: 10/10 PASS.
- `npm run test:vnext`: 787/787 PASS at the published head (762/762 at the
  implementation commit `7c5b25b`; the rebased head carries the concurrent
  assurance lane's additional tests).
- `npm run validate`: PASS (no issues).
- `npm run validate-maws-vnext`: PASS (no issues).
- `npm run validate-instruction-integrity`: 21 fixture cases checked, 0
  unexpected results.
- Live audit at `main` (`b1c0356`): 0 deterministic findings, 0 advisory
  candidates, 8 classes declared with their signal and candidate count 0.

## Not claimed

- No authority, adoption, qualification, activation or runtime capability is
  created. The adoption of the specification is a development-target decision
  (OD-20) and grants no runtime activation.
- The document surface of the specification is not promoted into the canonical
  docs surface. It keeps its path because eighteen evidence records of
  2026-10-20/21 reference it; that promotion is a separate slice and stays
  the next gate of the document placement.
- The owner review of the advisory candidates stays open as owner work. This
  run implements the detector; it does not discharge the review.
- No hosted CI result is claimed. The account's GitHub Actions admission is
  closed (registry finding F-09, owner-gated); every result above is a local
  measurement at the stated commit.
