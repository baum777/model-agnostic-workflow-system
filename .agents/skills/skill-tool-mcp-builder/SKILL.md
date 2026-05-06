---
name: skill-tool-mcp-builder
description: Repo-local control-plane skill that classifies a loose request into new skill, new tool, new MCP surface, extension, router/contract/docs-only change, or no justified reusable surface.
version: 1.0.0
classification: local-only
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: active
---

# Skill Tool MCP Builder

## Trigger
Use this skill when the request is about what kind of repo surface should exist or change, and the decision must stay fail-closed and explainable.

## When Not To Use
- Do not use for small obvious edits with a single known destination.
- Do not use when the request is already clearly a skill-only, tool-only, or docs-only change.
- Do not use to design the final implementation of a chosen surface.

## Non-Goals
- This skill does not author the final skill, tool, or MCP implementation.
- This skill does not widen the shared-core registry or provider export surface.
- This skill does not turn compatibility catalogs into canonical authority.

## Expected Inputs
- raw user request
- observed repo surfaces
- nearest existing skill and tool coverage
- router and reuse-versus-create policy
- canonical vs local-only vs compatibility-only boundary
- any approval or local-input constraints that matter to the request

## Workflow
1. Confirm the request needs a surface-type decision rather than a small obvious edit.
2. Apply the decision logic against observed repo evidence and nearest existing coverage.
3. Emit exactly one normalized decision packet.
4. Use the quality checks to reject over-broad or unsupported surface creation.

## Decision Logic
1. Classify the request as one of:
   - `new skill`
   - `new tool`
   - `new MCP surface`
   - `extend existing surface`
   - `router/contracts/docs-only change`
   - `no justified reusable surface`
2. Check whether an existing canonical or repo-local surface already covers the need with a narrow extension.
3. Prefer extension over creation when the current surface can absorb the change without boundary drift.
4. Prefer skill when the request is a repeatable workflow with explainable steps and structured output.
5. Prefer tool when the request is a deterministic executable action with explicit inputs and outputs.
6. Prefer MCP only when the request needs a remote protocol boundary, tool catalog, and auth/transport semantics.
7. Route to router/contracts/docs-only when the issue is selection, naming, authority, or metadata rather than execution.
8. Reject new-surface creation when the request is one-off, vague, or unsupported by enough evidence.
9. For borderline cases, prefer the nearest existing surface over creation and record the tie-break rule used.
10. If the request remains tied after nearest-surface comparison, fail closed as `no justified reusable surface`.
11. If a surface is justified, identify the nearest existing surface and the smallest repo placement that preserves authority boundaries.

## Decision Packet
Return exactly one JSON object with these required fields:

```json
{
  "decision": "new skill",
  "confidence": "high",
  "reasoning_basis": "repeatable_workflow",
  "tie_break_rule": "none",
  "recommended_repo_action": "create_skill",
  "placement": "canonical/shared-core",
  "followup_required": true,
  "reject_reason": null
}
```

Allowed values:

- `decision`: `new skill`, `new tool`, `new MCP surface`, `extend existing surface`, `router/contracts/docs-only change`, `no justified reusable surface`
- `confidence`: `high`, `medium`, `low`
- `reasoning_basis`: `repeatable_workflow`, `deterministic_tooling`, `remote_protocol_boundary`, `nearest_existing_coverage`, `authority_or_metadata_only`, `insufficient_evidence`
- `tie_break_rule`: `none`, `prefer_extension_over_creation`, `prefer_metadata_or_authority_only`, `fail_closed_on_missing_evidence`
- `recommended_repo_action`: `create_skill`, `create_tool`, `create_mcp_surface`, `extend_existing_surface`, `update_router_contracts_docs`, `reject_new_surface`
- `placement`: `canonical/shared-core`, `repo-local-control-plane`, `compatibility-only`, `docs/router/contracts`, `external MCP boundary`, `none`
- `followup_required`: boolean
- `reject_reason`: null unless `decision` is `no justified reusable surface`

Borderline rules:

- If the request can be absorbed by an existing surface without boundary drift, emit `extend existing surface` and use `tie_break_rule = prefer_extension_over_creation`.
- If the request is about authority, naming, or metadata rather than execution, emit `router/contracts/docs-only change` and use `tie_break_rule = prefer_metadata_or_authority_only`.
- If evidence is incomplete or the request is too vague for a stable reusable surface, emit `no justified reusable surface` and use `tie_break_rule = fail_closed_on_missing_evidence`.
- Never invent a surface when a borderline case can be resolved by extension or docs-only change.

## Output
- Emit the normalized decision packet only.
- Do not add narrative sections outside the packet.
- Do not omit required fields.

## Quality Checks
- Separate observed repo truth from inference.
- Keep the category choice singular and explicit.
- Prefer the narrowest reusable surface over a broader sibling.
- Do not claim canonical status for local or compatibility-only assets.
- Do not recommend MCP creation without a clear protocol boundary.
- Do not recommend new-surface creation when extension is sufficient.
- Do not omit tie-break metadata for borderline cases.

## Overlap Notes
| Related surface | Difference | Prefer this when | Prefer sibling when |
| --- | --- | --- | --- |
| `workflow-core-router` | chooses artifact shape, not surface type | the task already needs spec/runbook/plan/checklist routing | the task is about what kind of surface should exist |
| `skill-creator-orchestrator` | governs reuse vs extend vs create for skills only | the request has already been classified as skill-level work | the request is still deciding between skill, tool, MCP, or docs-only |
| `mcp-server-creation` | designs MCP server scaffolds, not repo-local decision routing | the chosen outcome is a real MCP surface | the task is deciding whether MCP is justified at all |
