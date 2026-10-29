---
name: media-production-brief
description: Plan a video or graphic production from owned source assets — edit intent, frame/audio/caption requirements, rights and sensitive-material checks, and export/QA checklists — as a brief for editors and production tools, without rendering assets or touching account-private media.
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

# Media Production Brief

## Trigger

Use this skill when a video clip, graphic, or audio asset set needs a production plan — what the edit should accomplish, which source assets may be used under which rights, what the output must contain frame-by-frame, and how the export is quality-checked and delivered.

## When Not To Use

- Do not use to render, cut, encode, or generate the media — this skill writes the production brief; rendering is a separately mandated step for named tools or editors.
- Do not use to define brand identity constraints; use the native `brand-asset-brief` skill and treat its outputs as inputs here.
- Do not use to preflight a finished draft for social publication; use the native `social-publication-preflight` skill once an asset exists.
- Do not use to download, scrape, or reuse account-private or third-party media whose rights are not documented.

## Purpose

Turn an edit intent into a complete, production-ready brief: source assets with provenance and rights state, an explicit edit plan, per-asset technical requirements, a rights and sensitive-material review, and export/QA checklists a human can verify — so production can start without ambiguity about what may be used and what counts as done.

## Boundary Differentiation

- `brand-asset-brief` defines identity constraints upstream; this skill consumes them for a concrete production and never overrides them.
- `social-publication-preflight` reviews a finished draft before publication downstream; this skill plans the production that creates the draft.
- Rendering and editing tools (video suites, image generators, audio tools) execute against the brief under their own mandate; this skill neither runs nor pays for them.

## Workflow

1. Bind the edit intent and audience: what the piece must communicate, where it plays, and its length/aspect/format envelope — from the owner's request, not invented strategy.
2. Inventory source assets with provenance: every clip, image, track, and font named with its origin, license state, and consent status (people appearing on camera) — an asset without documented rights is listed as blocked, never assumed usable.
3. Specify the edit plan: scene-by-scene structure, frame requirements (dimensions, safe areas, stills), audio requirements (music bed, voice-over, levels), and caption/subtitle requirements (languages, placement) — precise enough that two editors would produce recognizably the same piece.
4. Run the rights and sensitive-material review: third-party material flagged with the license evidence still to be attached; personal data, minors, private locations, and competitor marks flagged for review; music identified as licensed, royalty-free-with-evidence, or blocked.
5. Define export and QA checklists: exact export specs per channel, plus a human-verifiable QA list (first/last frame check, audio peak levels, caption sync spot-checks, color consistency with the brand brief) — no tool-scored numbers stand in for the human pass.
6. Name the production mandate: which editor or tool produces, who approves cuts, and what paid generation or stock requires separate authorization — a brief is not a render order.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- edit intent and audience/channel specification
- source asset inventory with provenance
- license and consent documentation (or its known gaps)
- brand brief constraints (optional upstream input)
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

- `ASSETS`
- `EDIT PLAN`
- `RIGHTS`
- `QA`
- `DELIVERY`

## Quality Checks

- never present the brief as a rendered asset; "the edit plan is done" is never "the video is done", and placeholders are labeled, never shipped
- no account-private media is downloaded, scraped, or reused; only owner-supplied sources with documented provenance enter the plan
- every third-party element carries named license evidence or is listed as blocked; consent for identifiable people is verified, never inferred
- no paid generation, stock purchase, or tool subscription is invoked; production runs only under a named, separately authorized mandate
- sensitive material (minors, private data, private locations, competitor marks) is flagged for human review, never waved through
- QA criteria are human-verifiable checks, not tool-scored numbers; the human pass is the pass
