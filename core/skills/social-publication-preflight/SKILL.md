---
name: social-publication-preflight
description: Review an approved draft for publication on a named platform and account — identity binding, claim and media-rights checks, per-action approval scope, and readback rules — without sending, posting, or touching account credentials.
version: 1.0.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
metadata:
  author: baum777 <baum777@users.noreply.github.com>
status: extracted
---

# Social Publication Preflight

## Trigger

Use this skill when an approved draft is about to be published on a social platform and needs a preflight review — what exactly would be published, under which account, with which approvals, how success or failure would be verified, and what must not happen automatically.

## When Not To Use

- Do not use to send, post, comment, schedule, or delete anything — this skill reviews before external actions; every external action needs its own separate authority.
- Do not use to write or edit the draft; drafting belongs to writing and content surfaces.
- Do not use for internal release readiness gates; use the native `readiness-check` skill.
- Do not use to sign into or operate accounts, and do not transmit account sign-in material of any kind — preflight works from supplied artifacts only.

## Purpose

Bind the draft, the platform, and the account into one reviewable preflight record; verify claims and media rights from evidence; make the approval scope per-action explicit; and define readback and failure behavior so that an uncertain outcome never triggers a blind retry.

## Boundary Differentiation

- `readiness-check` gates internal repository or release readiness; this skill preflights an external publication on a named platform account — different evidence, different blast radius.
- Draft quality review (tone, structure) belongs to writing surfaces; this skill checks identity, rights, scope, and failure behavior, not prose.
- Account access, posting, and scheduling are operator actions outside this skill by design; a preflight pass is not a send order.

## Workflow

1. Bind draft identity and intended account: exact draft (file, version, hash), exact platform and account handle, and the intended action type (post, reply, comment) — an unbound or "whichever account" target is a blocker.
2. Verify claims and media rights from evidence: external factual claims carry sources; images, video, and quotes carry rights or license evidence; unverifiable claims are flagged for rewrite, not waved through.
3. Specify per-action permission: who approved this draft, for which platform and action, and when — approval of a draft is not approval to send; the send decision is named, human, and separate.
4. Define receipts and readback: what evidence the publication attempt must produce (receipt ID, URL, timestamp) and how it will be read back and recorded after the operator acts.
5. Handle uncertain outcomes without automatic repost: if the outcome is unknown (timeout, ambiguous error, no readback), the next step is a bounded manual readback, never an automatic retry — a resend without a verified first-send state risks duplicate external effects.
6. Record the failure plan: what happens when the post fails, is rejected, or must be withdrawn.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- approved draft with version identity
- platform and account specification
- explicit action scope (action types permitted this run)
- claim sources and media rights evidence
- approver identity and approval timestamp

## Approval Mode

- read-only

## Provider Projections

- OpenAI/Codex: native
- Claude: adapter
- Qwen Code: adapter
- Kimi K2.5: adapter

## Eval Scaffolding

- routing
- schema conformance
- tool selection
- provider parity
- failure modes

## Output

- `DRAFT ID`
- `ACCOUNT SCOPE`
- `APPROVAL`
- `READBACK`
- `FAILURE PLAN`

## Quality Checks

- never send, post, comment, schedule, or delete; this skill performs no external action and its output is not send authority
- an unknown external outcome blocks automatic repost; retry requires a human decision on a verified first-send state
- never borrow an authenticated session or transmit account sign-in material; operating the account stays with the operator, before and after publication
- draft, platform, account, and action type are bound exactly — ambiguity anywhere is a blocker, not a default
- claims without sources and media without rights evidence are flagged, not assumed fine
- keep the approved draft, the preflight record, the send decision, and the readback receipt as separate, named states
