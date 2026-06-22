# Skill Contract Gap Analysis

Class: derived.
Use rule: read this as a gap analysis only; it does not redefine canonical skill-contract authority. Canonical skill-contract rules remain in `docs/repo-intake-skill-contract.md`, `docs/runtime-policy-skill-contract.md`, and `core/contracts/permission-boundary.json`. Claim-status truth remains `docs/authority-matrix.md`.

## Purpose

Enumerate the gap between the skill contract fields this repo currently declares (frontmatter + referenced policy/contract surfaces) and a set of 16 governance-relevant fields named across `docs/pi-agent-kit-adapter-core-anchor-decision.md`, `docs/computer-use-policy.md`, and `/home/baum/workspace/baum-os-deepdive-harnessing-19repos.md` (Baum-OS Gap Map). This document is a gap analysis only. It is explicitly not a schema migration, not a validator activation, and not a runtime change. No `SKILL.md` file, no `core/contracts/*.json` file, and no `policies/*.yaml` file is modified by this slice.

## Current Skill Contract Baseline

Observed from `skills/safe-scoped-commit/SKILL.md`, `skills/runtime-policy-auditor/SKILL.md`, `skills/repo-intake-sot-mapper/SKILL.md`:

- Frontmatter fields currently in use: `name`, `description`, `version`, `classification` (`shared` | `shared-with-local-inputs`), `requires_repo_inputs`, `produces_structured_output`, `safe_to_auto_run`, `owner`, `status`, optional `input_contract_path`.
- Body sections in use: `Purpose`/`Trigger`, `When Not To Use`, `Non-Goals`, `Expected Inputs` / `Local Inputs`, `Workflow`, `Output`, `Quality Checks`, optional `References`.
- `requires_repo_inputs: true` skills declare a JSON input contract under `.codex/*.json`, validated by a named `scripts/tools/validate-*.mjs` script (`contract-backed`, validator-backed only where the script is named).
- `safe_to_auto_run` is the only existing boolean that approximates a risk/approval signal today; it is coarse (single bool, no scope, no path/tool binding).
- Adjacent machine-readable surfaces that already cover part of this space:
  - `core/contracts/permission-boundary.json` (PBC) — a `contract-backed`, `validatorStatus: deferred`, `adoptionMode: opt-in` schema with `skill_id`, `skill_type`, `denied_by_default`, and a `permissions[]` array using a closed `permissionCategory` enum (`memory.read/write`, `handoff.emit/receive`, `subagent.spawn`, `external.http`, `external.mcp`, `filesystem.read/write`, `human_gate.request`, `provider.model_call/tool_call`), each grant carrying `scope` (`own-run`|`own-workflow`|`cross-workflow`|`global`) and free-text `constraints[]`.
  - `policies/tool-capabilities.yaml` — secret-exposure-oriented fields (`requires_secret`, `secret_classes`, `credential_binding`, `raw_secret_exposure`, `model_visible`, `access_level`, `trace_redaction`, `memory_persistence`), `schema_version: 1.0.0`, applies per declared field set, not per skill identity.
  - `policies/secret-classes.yaml` — secret classification (A/B/C/P), revocation posture, eval-fixture and provider-switch re-minimization rules.
  - `docs/computer-use-policy.md` — `prose-governed`, repo-wide; explicitly states it is additive to per-skill `write_mode`/`human_approval_required` (named there as gaps) and that no skill currently declares computer-use capability.
- No skill currently declares: agent identity scope, model identity scope, an explicit tool allow/deny pair, an explicit path allow/deny pair, a human-approval flag, a prompt-injection risk rating, a security-scan result, a log target, a last-reviewed date, or a privilege-tier value.

## Gap Table

| Gap field | Current status | Existing nearest equivalent | Why it matters | Proposed treatment | Priority |
| --- | --- | --- | --- | --- | --- |
| `skill_id` | missing | frontmatter `name`; PBC requires `skill_id` but PBC is `opt-in`/unadopted per skill | stable identity needed to bind permissions/audit/logs across renames | document as future field; no migration | medium |
| `allowed_agents` | missing | none direct; named open gap in `pi-agent-kit-adapter-core-anchor-decision.md` | differentiates Orchestrator/Builder/Reviewer/future Pi-adapter invocation rights | document as future field; no migration | high |
| `allowed_models` | missing | `core/contracts/provider-capabilities.json` (provider-level, not skill-level) | model-agnostic posture requires explicit per-skill model scoping, not implicit assumption | document as future field; no migration | high |
| `allowed_tools` | missing at skill level | `core/contracts/tool-contracts/catalog.json` (catalog only) + PBC `permissionCategory` (`external.http`/`external.mcp`/`provider.tool_call`) | explicit allowlist limits blast radius per skill | document as future field, point at PBC as nearest pattern; no migration | high |
| `forbidden_tools` | missing | PBC `denied_by_default: true` (default-deny posture, not an explicit list) | explicit denial list aids audit even under default-deny | document as future field; no migration | medium |
| `allowed_paths` | missing | PBC `filesystem.read`/`filesystem.write` + `scope` + free-text `constraints[]` (closest existing structure) | mirrors the Nicht-anfassen / scoped-write pattern already used operationally in this workflow | document as future field, point at PBC `constraints[]` as nearest pattern; no migration | high |
| `forbidden_paths` | missing (named optional open gap in adapter decision) | PBC `constraints[]` (free-text only, no dedicated field) | explicit denial complements `allowed_paths`, reduces reliance on free text | document as future field; no migration | medium |
| `write_mode` | missing (named open gap in adapter decision) | frontmatter `safe_to_auto_run` (coarse, automation-only, not write-scope) + PBC `filesystem.write` category | central to the Freigabe model (read-only vs scoped-write vs broad-write) | document as future field; no migration | high |
| `human_approval_required` | missing as a field; present only as prose convention | PBC `human_gate.request` category; `docs/computer-use-policy.md` "Required Approval"; `skills/safe-scoped-commit/SKILL.md` workflow step 6 ("stop as blocked") | bridges prose-based Human-Approval-Primat with a per-skill machine-checkable flag | document as future field; no migration | high |
| `prompt_injection_risk` | missing entirely | none found in-repo | increasingly relevant as skills consume external/web content (cf. browser-use scope in `computer-use-policy.md`) | document as future field; external pattern only; no migration | medium |
| `evidence_required` | covered at workflow level, not per-skill | `AGENTS.md` / `WORKFLOW.md` Execution Claim Policy (`applied`/`verified` evidence rules) | currently a global rule; per-skill declaration would make evidence requirements explicit and checkable | document as future field; no migration | medium |
| `log_target` | missing (named optional open gap in adapter decision) | `artifacts/runtime-runs/<runId>/` (runtime-level, per `docs/runtime-activation-status.md`, not per-skill) | per-skill log target would make audit trails skill-attributable | document as future field; no migration | low-medium |
| `last_reviewed` | missing (named optional open gap in adapter decision) | frontmatter `status` (lifecycle state, e.g. `extracted`; not a reviewed date) | staleness tracking for governance-relevant skills | document as future field; no migration | low |
| `computer_use_allowed` | missing at skill level | `docs/computer-use-policy.md` itself — explicitly states no skill currently declares computer-use capability and that the policy is additive to this exact gap | strongest existing anchor; policy already anticipates this field | document as future field, point directly at `computer-use-policy.md` "Relation To Skill Contracts"; no migration | high |
| `skill_security_scan` | missing | none in-repo | no automated check exists today for malicious/vulnerable skill content | document as future field; external pattern only (NVIDIA/SkillSpector); no migration | medium |
| `agent_privilege_hierarchy` | open / identified in Deepdive Gap Map | prose-only constraint across `AGENTS.md`/`WORKFLOW.md`/`pi-agent-kit-adapter-core-anchor-decision.md` ("Human Approval: remains final Freigabeinstanz") | Agenten können gestufte Rechte bekommen. Human Approval bleibt Primat für riskante Aktionen. Kein Agent darf sich selbst höhere Rechte geben. | document as future field with this constraint stated verbatim; explicitly do not resolve tension with external full-autonomy patterns in this slice | high (conceptually sensitive — not to be resolved here) |

## External Pattern Inputs

Source: `/home/baum/workspace/baum-os-deepdive-harnessing-19repos.md` (19-repo Deepdive, read-only research, no code imported).

- **NVIDIA/SkillSpector** — security scanner for AI agent skills (vulnerability/malicious-pattern detection). Nearest external pattern for `skill_security_scan`. No code reviewed beyond README; not integrated.
- **athola/claude-night-market** — TDD-enforcement and spec-driven plugin hooks with risk-tiered gating. Nearest external pattern for `human_approval_required` / tiered `write_mode`. No code reviewed beyond README; not integrated.
- **agent0ai/agent-zero** — explicit safety-boundary framing, skeptical of unscoped computer-use. Supports the existing `docs/computer-use-policy.md` posture rather than introducing a new one.
- **daveshap/OpenAI_Agent_Swarm** — Hierarchical Autonomous Agent Swarm with a privilege-inheritance model and an explicit "Full Autonomy" philosophy. Nearest external pattern for `agent_privilege_hierarchy`, flagged in the Deepdive as in direct tension with this repo's Human-Approval-Primat. Documented here as an observation only — not adopted, not reconciled.

No external repo content, code, or schema is copied into this document or into any contract/policy file.

## No-Duplicate Rule

- `core/contracts/permission-boundary.json` is not duplicated, forked, or redefined; it is cited as the nearest existing machine-readable pattern for several gap fields.
- `policies/secret-classes.yaml` and `policies/tool-capabilities.yaml` are not duplicated or redefined.
- No `skills/*/SKILL.md` frontmatter is changed or migrated to a new schema.
- No external skill marketplace, plugin pattern, or security-scanner code is imported.
- `docs/runtime-activation-status.md` Phase status is not changed by this document.
- `model-agnostic-workflow-system` remains the Core-Anker; this document does not introduce a parallel gap-tracking tree.

## Proposed Minimal Future Schema Additions

Illustrative only. Not applied to any `SKILL.md` or contract file in this slice.

```yaml
# Illustrative future frontmatter extension — NOT applied, NOT validated, NOT migrated.
skill_id: safe-scoped-commit-v1
allowed_agents: [orchestrator, builder, reviewer]
allowed_models: [provider-neutral]
allowed_tools: [git]
forbidden_tools: [browser-use, computer-use]
allowed_paths: ["<scope-owned-files-only>"]
forbidden_paths: ["AGENTS.md", "WORKFLOW.md", "docs/", "policies/", "core/contracts/"]
write_mode: scoped-write
human_approval_required: true
prompt_injection_risk: low
evidence_required: true
log_target: artifacts/runtime-runs/<runId>/
last_reviewed: "2026-06-22"
computer_use_allowed: false
skill_security_scan: not-run
agent_privilege_hierarchy: tier-builder  # Human Approval remains primate for risky actions; no agent self-escalates.
```

## Result

`result`: `pass`

## Owner / Scope

Owner: Cheikh (baum777). Scope: read-only research of named files/directories plus creation of exactly one new docs-only file, `docs/skill-contract-gap-analysis.md`. No other file was created, modified, or deleted.

## Sources Reviewed

`AGENTS.md`, `WORKFLOW.md`, `docs/README.md`, `docs/architecture.md`, `docs/runtime-activation-status.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`, `docs/computer-use-policy.md`, directory listings of `skills/`, `providers/`, `core/contracts/`, `policies/`, `skills/safe-scoped-commit/SKILL.md`, `skills/runtime-policy-auditor/SKILL.md`, `skills/repo-intake-sot-mapper/SKILL.md`, `policies/tool-capabilities.yaml`, `policies/secret-classes.yaml`, `core/contracts/permission-boundary.json`, `/home/baum/workspace/baum-os-deepdive-harnessing-19repos.md`.

## Verification

`docs/skill-contract-gap-analysis.md` did not exist before this write (checked via shell `test -f`, result `NOT_EXISTS`). File created at exactly that path. No other file under this repo was touched. No `SKILL.md`, no `core/contracts/*.json`, no `policies/*.yaml` was modified.

## Next Gate

Propose one of: (1) Human-Approval-Tier-Erweiterung decision record turning `human_approval_required` + `agent_privilege_hierarchy` into a formal proposal (still docs-only); (2) a PBC-extension proposal mapping the 16 fields onto `core/contracts/permission-boundary.json` as optional, non-enforced properties (contract-only, no validator); (3) leave this as the resting gap ledger until the next Deepdive-driven slice is chosen. No implementation is recommended in this gate.
