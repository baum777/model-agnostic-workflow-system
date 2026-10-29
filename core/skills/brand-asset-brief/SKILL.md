---
name: brand-asset-brief
description: Draft a brand asset brief — identity and communication constraints, deliverables, legibility acceptance checks, and rights-review needs — as a brief for humans and production tools, without claiming trademark clearance or generating paid assets.
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

# Brand Asset Brief

## Trigger

Use this skill when a logo, identity system, or brand asset set needs a brief — what the brand must communicate, which constraints bind every asset, what exactly gets delivered in which formats, and which originality and rights questions must be answered before anything ships.

## When Not To Use

- Do not use to define UI visual direction, layout, or component styling; use the native `ui-ux-composition` skill (which excludes identity definition by design).
- Do not use to generate, render, or produce the assets — this skill writes the brief; production is a separate, separately authorized step.
- Do not use to clear or register trademarks — clearance is a legal and registry process this skill never performs or verdicts.
- Do not use to install fonts, image tools, or paid generation services.

## Purpose

Turn brand intent into a complete, production-ready brief with an explicit evidence base: communication constraints, deliverable and format specifications, measurable legibility acceptance criteria, and a rights-review checklist that names what is unverified until a human or registry says otherwise.

## Boundary Differentiation

- `ui-ux-composition` derives bounded UI posture from content semantics and explicitly excludes brand identity definition; this skill owns the identity brief that UI work later consumes.
- Production tools (image generators, font foundries, design suites) execute against the brief; this skill neither runs them nor pays for them.
- Trademark counsel and registries decide clearance; this skill records the open rights questions, never the answers.

## Workflow

1. Establish brand intent from evidence: owner-supplied mission, audience, positioning, and any existing identity material — each constraint in the brief traces to supplied intent, not to invented strategy.
2. Define identity and communication constraints: name treatment, mark concepts to explore, color posture, typography direction, and usage rules — as constraints for producers, not as finished designs.
3. Separate the brand decision from UI style: the brief fixes identity constraints; interface styling downstream stays governed by the UI composition skill and its evidence rules.
4. Specify deliverables and legibility checks: exact asset list, formats and sizes, and acceptance criteria a human can verify — legibility at minimum size, contrast on declared backgrounds, monochrome and reversed variants, favicon readability.
5. Record originality and rights review needs: for each proposed element, whether it is original work, licensed, or derived — with the license or clearance evidence still to be obtained named explicitly; nothing is treated as cleared because a tool generated it.
6. Name the production mandate: which tool or vendor may produce, who approves, and what budget or paid generation requires separate authorization — a brief is not an order to generate.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- brand intent statement (mission, audience, positioning)
- existing identity material (optional, with provenance)
- asset rights situation (what is owned, licensed, or unknown)
- delivery format requirements
- production constraints (budget authority, tool approvals)

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

- `BRIEF`
- `ASSETS`
- `RIGHTS`
- `ACCEPTANCE`

## Quality Checks

- never claim trademark clearance, registrability, or legal availability; rights status is open until a qualified human or registry states otherwise, and the brief says so
- no automatic image-tool, font, or paid generation service is installed, invoked, or subscribed to; production runs only under a named, separately authorized mandate
- never publish, deploy, or ship assets; the brief precedes production and publication is a further authorized step
- every constraint traces to supplied brand intent or is marked as a proposal for the owner to decide — invented "brand facts" are a defect
- acceptance criteria are human-verifiable (legibility, contrast, variants), not tool-scored numbers
- third-party elements (fonts, icons, imagery, stock) enter the brief only with their license named and its evidence still to be attached
