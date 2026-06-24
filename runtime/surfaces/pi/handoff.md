# Pi Handoff Format

> v0.2-pre-runtime · docs-only · no runtime activation

## Purpose

The Pi Handoff is the structured output a Pi run produces for human review.
It bundles the run result, evidence references, validation outcome, and next
gate into a single reviewable artifact.

A handoff is **not** an automatic promotion. Producing a handoff with a
`pass` verdict does not authorize canonical file writes, merges, or any
downstream action. Promotion requires a separate owner-approved slice.

Human Approval is the final release authority for all Pi runs above Tier 0.
No handoff may substitute for or waive the requirement for explicit owner approval.

## Pi Classification

```
Pi is an Execution Surface / CLI-Agent-Runner.
Pi is NOT an LLM provider.
providers/pi/ is permanently forbidden.
```

## Canonical Evidence Path

Every Pi run that produces a handoff must have its evidence under:

```
sandbox/runs/<timestamp>/
```

`<timestamp>` format: `YYYYMMDDTHHMMSSz` (UTC ISO-8601 compact)

This path is the canonical evidence root. Evidence referenced in a handoff
must point to artifacts in this folder. "Evidence path or summary" is not
sufficient — the exact `sandbox/runs/<timestamp>/` path must be named.

Authority: `docs/evidence-path-contract.md`

## Required Evidence Artifacts

The following 8 artifacts are mandatory in every `sandbox/runs/<timestamp>/` folder:

| Artifact | Content |
|----------|---------|
| `intent.md` | What the run was supposed to do; skill contract and scope |
| `commands-run.md` | Commands executed without secrets; exit code |
| `files-read.md` | Files read by Pi, or "none" |
| `files-changed.md` | Files changed or created, or "none" |
| `validation.md` | All verify_steps executed with results; explicit pass/rework/blocked verdict; secret-check block |
| `diff.patch` | Git diff of changed files; or supplement if no diff (new file or identical) |
| `risks.md` | Real open gaps; no vague placeholders |
| `next-gate.md` | One concrete next slice |

A handoff that references an evidence path missing any of these artifacts is incomplete.

Authority: `runtime/surfaces/pi/evidence-contract.md`

## Optional Supplementary Artifacts

The following may be added to a run folder without changing the canonical structure:

| Artifact | Purpose |
|----------|---------|
| `evidence-audit-card.md` | Non-canonical audit card from `pi.tier1.evidence_audit` |
| `evidence-audit-rerun-card.md` | Re-audit card after supplement or fix; must not overwrite prior audit card |
| `evidence-gap-supplement.md` | Explanation of a known evidence gap when reconstruction is not possible |
| Additional review cards | Non-canonical review or assessment cards from governance slices |

No supplementary artifact may modify or overwrite a required artifact.

## Required Handoff Output Format

Every Pi-assisted run must return a handoff in the following format:

```
## Result
pass | rework | blocked

## Host / Scope
Host, repo, surface, task class, risk level

## Skill Contract
Skill ID and file path used for this run

## Tool Contract
Tool ID and command shape used

## Write Mode
read_only | draft_only | approved_write

## Evidence Path
sandbox/runs/<timestamp>/

## Commands
Commands run, without secrets; exit code

## Files Read
Files read during the run, or "none"

## Files Changed
Files changed or created, or "none"

## Validation
All verify_steps with results; explicit pass/rework/blocked verdict

## Boundary Checks
Pi execution: ...
Provider calls: ...
Vault: ...
Secrets: ...
Network: ...
CI / Hook: ...
Runtime: ...
providers/pi/: ...

## Risks / Gaps
Only real open points; no vague placeholders

## Recommended Next Gate
One concrete next slice
```

## Rules

```
No handoff is complete without evidence path and next gate.
No handoff is complete without a boundary check section.
No handoff may name a canonical target as a direct write destination.
A pass verdict in a handoff is not an approval to promote.
Promotion requires a separate owner-approved promotion slice.
```

## Audit / Re-Audit Rule

The `pi.tier1.evidence_audit` skill may be invoked after a run to audit the
evidence folder. The following rules apply:

```
pi.tier1.evidence_audit may:
  - read all files in sandbox/runs/<timestamp>/
  - produce a non-canonical evidence-audit-card.md in the run folder
  - produce a new evidence-audit-rerun-card.md after a supplement or fix
  - issue a verdict: pass | rework | blocked

pi.tier1.evidence_audit must not:
  - reconstruct, backfill, or infer evidence not captured during the run
  - modify, overwrite, or delete any required artifact
  - overwrite a prior audit card — must create a new re-audit card
  - escalate permissions or trigger a new Pi session
  - write to Vault or canonical docs
```

A handoff that was issued before an audit is not superseded by the audit card.
Both are non-canonical. The human reviewer consults both and decides.

Authority: `skills/pi/tier1-evidence-audit.skill.yaml`

## Human Approval Rule

```
Human Approval is the final release authority for all Pi runs above Tier 0.
No handoff verdict may substitute for or waive this requirement.
No agent may self-escalate based on a handoff verdict alone.
Promotion from draft to canonical requires a separate owner-approved slice.
```

## Boundary Rules

The following are forbidden in all Pi runs and must be reported clean in every
handoff boundary check:

```
providers/pi/ creation or modification
Vault writes
Secret reads (.env, env, printenv, API keys, credentials, auth files)
Network access without an explicit execution slice approving it
Package installation (npm install, pip install, etc.)
CI or hook wiring (.github/workflows/, pre-commit, husky, etc.)
Unbounded repo discovery (find /, glob without path constraint)
browser_use or computer_use (Tier 3+ only)
Automatic promotion without a promotion slice
Canonical file writes outside an approved write slice
Runtime code changes
```

## Authority Chain

```
runtime/surfaces/pi/handoff.md           ← this document
runtime/surfaces/pi/session-policy.md    ← session tier and pre-condition rules
runtime/surfaces/pi/evidence-contract.md ← evidence boundary and diff rules
runtime/surfaces/pi/smoke-command.md     ← smoke command surface and abort conditions
docs/evidence-path-contract.md           ← canonical path and minimal structure
sandbox/runs/run-evidence-template.md    ← authoritative field template
skills/pi/tier1-evidence-audit.skill.yaml ← audit skill contract
tools/pi-cli.tool.yaml                   ← approved command shapes
policies/write-modes.policy.yaml         ← write mode definitions
```

## Non-Goals

```
no runtime activation
no provider adapter
no providers/pi/
no CI wiring
no secret access
no schema change
no Vault write
no automatic promotion
no open-ended Pi sessions
no tool grant beyond approved shape
```
