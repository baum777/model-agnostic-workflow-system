# Pi Evidence Contract

> v0.2-pre-runtime · docs-only · no runtime implementation

## Purpose

This document defines what constitutes valid Evidence for Pi runs within Baum-OS,
how Evidence must be structured, what counts and does not count as Evidence, and
what rules govern Diff capture, supplementation, and audit.

This contract is the runtime-surface companion to `docs/evidence-path-contract.md`.
It does not supersede that document — it adds Pi-session-specific rules and links
all authority surfaces together.

## Relation to Canonical Evidence Path Contract

The canonical authority for the Evidence path is:

`docs/evidence-path-contract.md` (commit `d9e96d8`)

This document inherits all rules from that contract and adds:

- Pi-session-specific boundary rules
- Allowed supplementary artifact types
- Diff-capture and supplement rules
- Audit rules for `pi.tier1.evidence_audit`
- Explicit links to session policy and run template

## Canonical Run Path

```
sandbox/runs/<timestamp>/
```

`<timestamp>` format: `YYYYMMDDTHHMMSSz` (UTC ISO-8601 compact)

This path is established in `docs/evidence-path-contract.md` and confirmed by
live runs: `sandbox/runs/20260623T225209Z/` and `sandbox/runs/20260623T230640Z/`.

## Minimal Run Folder Structure

Every run folder must contain at minimum:

| File | Required | Purpose |
|------|----------|---------|
| `intent.md` | yes | What the run was supposed to do; skill contract and scope |
| `commands-run.md` | yes | Commands executed without secrets; exit code |
| `files-read.md` | yes | Files read during the run, or "none" |
| `files-changed.md` | yes | Files changed or created, or "none" |
| `validation.md` | yes | All verify_steps with results; explicit pass/rework/blocked verdict |
| `diff.patch` | yes | Git diff of changed files (see Diff Rule below) |
| `risks.md` | yes | Real open gaps only; no vague placeholders |
| `next-gate.md` | yes | One concrete next slice |

Field template authority: `sandbox/runs/run-evidence-template.md`

## Optional Supplementary Artifacts

These files may be added to a run folder without changing the canonical structure:

| File | Purpose |
|------|---------|
| `evidence-audit-card.md` | Non-canonical audit card produced by `pi.tier1.evidence_audit` |
| `evidence-audit-rerun-card.md` | Re-audit card after a supplement or fix; must not overwrite the prior audit card |
| `evidence-gap-supplement.md` | Explanation of a known evidence gap when reconstruction is not possible |
| `diff.patch` supplement | Existing `diff.patch` may be expanded with a `# Evidence Supplement` header if originally empty |

Additional non-canonical review cards are allowed as supplementary artifacts.
No supplementary artifact may modify or overwrite a required artifact.

## What Counts as Evidence

The following constitute valid Evidence in a run folder:

- Commands actually executed during the run (without secrets)
- Files read by the agent during the run
- Files changed or created during the run, with names and purpose
- A git diff or supplement thereof that references all files listed in `files-changed.md`
- Validation results from the skill contract's `verify_steps`
- Explicit boundary checks (Pi, Provider, Vault, Secrets, Network, CI/Hook, Runtime)
- Risks and gaps that are real and specific
- A concrete next gate naming the next slice

## What Does Not Count as Evidence

The following are not valid Evidence:

- Model assertions not backed by an executed command or file read
- Summaries that cannot be traced to an artifact in the run folder
- A missing diff for a file listed in `files-changed.md` without a supplement or explanation
- Evidence reconstructed after the fact without a `# Evidence Supplement` header identifying the source
- Any output containing secrets, API keys, tokens, credentials, or `.env` contents
- Provider or Vault claims without a concrete reference
- Blank or placeholder fields copied from `sandbox/runs/run-evidence-template.md` without content

## Secret Check Requirement

Every `validation.md` must include a secret-check block confirming:

```
.env read: no
API keys exposed: no
auth files read: no
browser profiles accessed: no
secret-bearing output: no
```

This block is required regardless of whether the run involved Pi execution.
Absence of the secret-check block makes the validation artifact incomplete.

## Diff Rule

```
If files-changed.md lists a file as changed or created,
diff.patch must reference that file.

If the original diff.patch was empty (e.g., new untracked file, or diff -u
on identical files), it may be supplemented retrospectively with a clear
# Evidence Supplement header that includes:
  - the reason the patch was originally empty
  - the reconstruction source (git show <commit>)
  - the date of the supplement
  - a reference to the audit finding that triggered the supplement

A diff.patch that is empty without explanation, while files-changed.md
lists changed files, is an evidence inconsistency and will result in
audit verdict: rework.
```

## Audit Rule

```
pi.tier1.evidence_audit may:
  - read all files in a run folder
  - compare them against docs/evidence-path-contract.md
  - produce a non-canonical audit card (evidence-audit-card.md)
  - produce a re-audit card (evidence-audit-rerun-card.md) after a supplement
  - issue a verdict: pass | rework | blocked

pi.tier1.evidence_audit must not:
  - reconstruct, backfill, or infer evidence that was not captured during the run
  - modify, overwrite, or delete any required artifact
  - overwrite a prior audit card — must create a new re-audit card
  - escalate permissions or trigger a new Pi session
  - write to Vault or canonical docs
```

## Boundary Rule

Evidence artifacts must not contain or trigger:

```
Pi execution without a valid session policy and owner approval
Provider API calls
Vault writes
Network requests
Runtime or CI/hook expansion
Package installation
Secret exposure
providers/pi/ creation
```

Evidence is documentation of what happened — it is not itself an execution surface.
No evidence artifact may itself grant permissions or trigger side effects.

## Human Approval Rule

Human Approval is the final release authority for all Pi runs above Tier 0.
No evidence artifact may substitute for or waive the requirement for explicit
owner approval in an execution slice.

## Authority Chain

```
runtime/surfaces/pi/evidence-contract.md  ← this document
docs/evidence-path-contract.md            ← canonical path and minimal structure
sandbox/runs/run-evidence-template.md     ← authoritative field template
runtime/surfaces/pi/session-policy.md     ← session tier and pre-condition rules
skills/pi/tier1-evidence-audit.skill.yaml ← audit skill contract
docs/pi-tier-1-draft-workflow.md          ← Tier-1 workflow authority
docs/pi-secret-handling-spec.md           ← secret boundary authority
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
no modification of canonical evidence artifacts
```
