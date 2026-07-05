# Failure Pattern Card

Use for: Self-Harness Evolution Lab weakness reports
Primary contract: `schemas/failure-pattern.schema.json`
Producer contract: `skills/harness/weakness-mining.skill.yaml`
Status class: `proposed` — does NOT promote Self-Harness Evolution Lab from aspirational to active.

A Failure Pattern Card is a YAML artefact that names a recurring weakness,
anchors it to concrete evidence, and lists mitigations with explicit safety
gates. Cards are `proposal_allowed=false` and `promotion_allowed=false` by
default. They are *evidence*, not authority: nothing in the card is allowed to
trigger a write without an owner-approved slice.

## pattern_id

`fp-<slug>` — lowercase, dash-or-underscore separator, ≤ 80 chars.
Unique across the cards directory. Uniqueness-check runs at index build time.

## name

One-sentence human title. No trailing punctuation. ≤ 160 chars.

## discovered_at

ISO 8601 date of first observation (`YYYY-MM-DD`).

## severity

`low` | `medium` | `high` | `critical`

`low` = cosmetic, only housekeeping.
`medium` = workflow friction, slowed work.
`high` = correctness, audit, hygiene risk.
`critical` = safety, data-loss, secret boundary crossed.

## confidence

`observed` | `inferred` | `consensus`

`observed` = directly reproduced by an anchor.
`inferred` = reasoned from evidence, no live reproduction.
`consensus` = multiple independent anchors + observers agree.

## evidence_anchors

Ordered list. Minimum one anchor. Each anchor:

```yaml
- kind: commit          # commit | file | run | chat | observation | doc
  ref: 186fc84          # sha / path / sandbox/runs/<ts> / room/timestamp
  note: "shazam pre-commit auto-staged foreign dirty tree; --no-verify workaround"
```

Anchors are the load-bearing walls. No anchor, no card.

## affected_surfaces

Repo paths or surface names the pattern touches.
Use exact paths when the surface is files; use surface names (e.g.
`harness.weakness_mining`) when the surface is a skill or contract.

## trigger_conditions

Concrete state, command, or sequence that reproduces the pattern.
Not "sometimes happens" — "when X runs in Y state, Z happens".

## observed_symptoms

What an observer actually sees. Logs, dirty tree, missing file, wrong status.

## root_cause_hypothesis

Best-current explanation. Mark `confidence=inferred` if not proven.

## recommended_mitigations

Ordered cheapest-safest-first. Each item:

```yaml
- kind: policy          # policy | validator | doc | code | config | process
  description: "..."   # what to change, in one or two sentences
  owner_action_required: false
```

`owner_action_required: true` means the mitigation cannot run without a
human owner approval step.

## status

`proposed` | `accepted` | `mitigated` | `rejected` | `superseded`

`proposed` = draft under review.
`accepted` = owner-approved for tracking and reuse, not yet fixed.
`mitigated` = owner-signed fix verified by evidence.
`rejected` = owner-declined; rationale lives in a sibling doc.
`superseded` = replaced by another `pattern_id`; set `superseded_by`.

## supersedes / superseded_by

Cross-card pointers. Only `superseded_by` is required when
`status=superseded`.

## last_reviewed_at

ISO 8601 date of last owner/curator review. Stale cards are flagged at
index-build time if older than the schema-defined stale threshold.

## proposal_allowed / promotion_allowed

Twin safety gates. Default `false` for both. Promotion to `true` requires
an owner-approved slice; no skill may flip these locally.

## NON-GOALS

- Cards do not auto-execute.
- Cards do not promote to canonical contracts.
- Cards do not replace skill/policy/schema changes.
- Cards do not bypass the vault bridge or any writing skill.

## HANDOFF NOTES

Source of derivation: a weakness-mining run (`sandbox/runs/<ts>/`) or a manual
review of an evidence bundle. The card carries:
- one or more anchor refs,
- a status reflecting owner state,
- both safety gates set.

If a card needs to *trigger* a change, file a follow-up skill that consumes
the card by reference and emits a bounded proposal — never auto-applies.
