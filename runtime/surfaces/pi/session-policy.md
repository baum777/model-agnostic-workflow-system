# Pi Session Policy

> v0.2-pre-runtime · docs-only · no runtime implementation

## Purpose

This document defines the governance boundary for Pi sessions within Baum-OS.
It establishes which session types are allowed, what pre-conditions must be met
before any run, what evidence must be produced after, and what constitutes an
abort condition.

This policy is referenced by all Tier-1 skill contracts and the Pi CLI tool contract.
It does not activate any runtime — it is a boundary declaration.

## Pi Classification

```
Pi is an Execution Surface / CLI-Agent-Runner.
Pi is NOT an LLM provider.
providers/pi/ is permanently forbidden.
```

Pi (`@earendil-works/pi-coding-agent`) routes to external providers as its own
backends. Its role in Baum-OS is as a local execution shell, not a provider adapter.

## Runtime Default

```
Default provider:  minimax
Default model:     MiniMax-M3
Auth:              MINIMAX_API_KEY via .env (never passed as --api-key flag)
```

Authority: `docs/pi-provider-default-decision.md`

## External Governance Surfaces

Claude and Codex are used as external architecture, review, and implementation surfaces
within Baum-OS governance sessions. They are NOT Pi runtime provider candidates for
the purposes of this policy. Any future use of Anthropic or Codex as Pi runtime providers
requires a separate owner-approved slice with updated evidence.

## Tier Mapping

| Tier | Mode | Allowed |
|------|------|---------|
| Tier 0 | read_only / no-tools | version, help, list-models, no-tools smoke |
| Tier 1 | draft_only | non-mutating drafts, `--no-tools --print` only |
| Tier 2 | approved_write | edit/write/mutating bash with explicit owner approval |
| Tier 3 | sensitive_action | external systems, live services, computer-use |
| Tier 4 | forbidden_or_blocked | secrets, open-ended sessions, unclear tools |

Pi sessions default to **Tier 0** unless explicitly elevated by an owner-approved
execution slice that names the tier, tool set, and scope.

## Allowed Session Types

| Session Type | Tier | Description |
|--------------|------|-------------|
| `read_only_review` | 0 | Read context, list models, produce analysis in `--print` mode; no file writes |
| `draft_only_generation` | 1 | Generate bounded Markdown drafts; `--no-tools --print`; output to approved path only |
| `approved_execution` | 2+ | File edits, bash, or mutating operations; requires explicit owner approval per slice |

All session types require an owner approval string before execution.

## Pre-Conditions (Required Before Every Pi Run)

All of the following must be confirmed before a Pi session starts:

| Pre-Condition | Check |
|---------------|-------|
| Owner Approval | Explicit `OWNER_APPROVAL:` string present in the slice |
| Skill Contract | A valid `skills/pi/*.skill.yaml` covers this run type |
| Tool Contract | `tools/pi-cli.tool.yaml` command shape is respected |
| Write Mode | `policies/write-modes.policy.yaml` write mode declared and enforced |
| Evidence Path | `sandbox/runs/<timestamp>/` directory created before run starts |
| Abort Conditions | All abort conditions reviewed; agent must know when to stop |
| Verification Plan | `verify_steps` from the skill contract are explicit and checkable |

A run that starts without any of these confirmed is invalid and must be aborted.

## Required Evidence (After Every Pi Run)

Every Pi run must produce the following artifacts under `sandbox/runs/<timestamp>/`:

| Artifact | Content |
|----------|---------|
| `intent.md` | What the run was supposed to do; skill contract referenced |
| `commands-run.md` | Commands executed without secrets; exit code |
| `files-read.md` | Files read by Pi, or "none" |
| `files-changed.md` | Files changed or created, or "none" |
| `validation.md` | All verify_steps executed with results; explicit pass/rework/blocked verdict |
| `diff.patch` | Git diff of changed files; or empty with explanation if new file (must reference files-changed.md) |
| `risks.md` | Real open gaps; no vague placeholders |
| `next-gate.md` | One concrete next slice |

Authority: `docs/evidence-path-contract.md`, `sandbox/runs/run-evidence-template.md`

The validation artifact must include a secret-check block confirming:
- `.env` read: no
- API keys exposed: no
- auth files read: no
- browser profiles accessed: no
- secret-bearing output: no

## Forbidden Session Actions

The following are forbidden in all Pi sessions regardless of tier:

```
providers/pi/ creation or modification
Vault writes without a dedicated owner-scoped write slice
Secret reads (.env, env, printenv, API keys, credentials, auth files)
Network access without an explicit execution slice approving it
Package installation (npm install, pip install, etc.)
CI or hook wiring (.github/workflows/, pre-commit, husky, etc.)
Unbounded repo discovery (find /, glob without path constraint)
browser_use or computer_use unless Tier 3 is explicitly approved
Automatic promotion from draft to canonical without a promotion slice
Open-ended sessions without a bounded prompt
--api-key flag in any Pi command (credentials must come from .env, never inline)
```

In addition, the existing Tier 0 defaults remain in force:

```
bash (mutating)
edit
write
open-ended sessions
secrets
--api-key
production / external writes
Vault writes
```

## Abort Conditions

A Pi session must abort immediately if any of the following occur:

```
owner_approval_missing
skill_contract_not_found_or_not_applicable
tool_contract_not_respected
output_path_outside_allowlist
providers_pi_creation_requested
vault_write_requested
secret_access_requested
env_file_read_attempted
network_requested_without_explicit_approval
evidence_path_not_prepared
canonical_file_write_without_promotion_slice
unexpected_dirty_tree_before_run
run_exits_nonzero_without_documented_reason
```

## Approval Rule

Any mutation (Tier 2+) requires explicit human approval before execution.

Human Approval is the final release authority for all Pi sessions above Tier 0.
No agent may self-escalate beyond Tier 1 without a new owner-approved execution slice.

## Vault / Memory Boundary

Vault and Memory Bridge access follows:

`docs/vault-memory-bridge-boundary-decision.md`

Default:

- Vault context may be read only through approved read-only bridges.
- Vault write access is blocked by default.
- Any Pi-assisted Vault write is Tier 2+ and requires a separate owner-scoped write slice.
- Subagents must not write Vault notes or promote memory to truth.

## Authority Chain

```
runtime/surfaces/pi/session-policy.md   ← this document
docs/evidence-path-contract.md          ← evidence path and minimal structure
sandbox/runs/run-evidence-template.md   ← evidence field template
docs/pi-tier-1-draft-workflow.md        ← Tier-1 workflow authority
docs/pi-execution-surface-policy.md     ← execution surface policy
docs/pi-secret-handling-spec.md         ← secret boundary authority
docs/pi-provider-default-decision.md    ← provider/model default
policies/write-modes.policy.yaml        ← write mode definitions
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
```
