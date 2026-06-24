# Pi Smoke Command

> v0.2-pre-runtime · docs-only · no runtime activation

## Status

documented smoke command — no execution in this file

## Purpose

The Pi Smoke Command is a bounded, non-mutating check that confirms Pi CLI
is reachable and returns output within expected parameters. It is the minimal
signal that the Pi execution surface is operational.

It is **not** a free Pi run. It does not grant permission to use tools, mutate
files, read secrets, access the network, or elevate beyond the approved tier.
A smoke is evidence-producing; its output lands under `sandbox/runs/<timestamp>/`
and must meet the 8-artifact requirement defined in `runtime/surfaces/pi/evidence-contract.md`.

## Tier Classification

A Pi Smoke Command operates at **Tier 0 / `read_only_review`** by default.
The maximum allowed tier for a smoke run is **Tier 1 / `draft_only_generation`**.

| Tier | Session Type | Ceiling |
|------|-------------|---------|
| Tier 0 | `read_only_review` | Default; no file writes |
| Tier 1 | `draft_only_generation` | Maximum; `--no-tools --print` only; output to approved path |

A smoke command must never be used as an entry point to Tier 2 or above.
Elevation to Tier 2+ requires a separate owner-approved execution slice.

Authority: `runtime/surfaces/pi/session-policy.md`

## Pi Classification

```
Pi is an Execution Surface / CLI-Agent-Runner.
Pi is NOT an LLM provider.
providers/pi/ is permanently forbidden.
```

## Approved Evidence

The first accepted Tier-0 smoke is recorded in:

`docs/pi-smoke-run-evidence.md`

Commit: `bdcc4b5`

Observed successful marker: `PI_SMOKE_OK`

## Approved Command Shape

All smoke commands must use the following flags without exception:

```
pi \
  --provider minimax \
  --model MiniMax-M3 \
  --no-session \
  --no-tools \
  --print \
  "<bounded smoke prompt>"
```

| Constraint | Required | Reason |
|-----------|----------|--------|
| `--no-tools` | yes | Prevents tool grant; keeps run Tier 0/1 |
| `--no-session` | yes | Prevents persistent session creation |
| `--print` | yes | Output to stdout only; no automatic file write |
| `--api-key` flag | **forbidden** | Credentials must come from `.env` via provider default; never inline |
| approved provider/model | yes | Default: `minimax` / `MiniMax-M3` |
| bounded prompt | yes | Open-ended prompts are forbidden |

## Current Smoke Provider / Model

```
Provider: minimax
Model:    MiniMax-M3
Auth:     MINIMAX_API_KEY via .env (never --api-key flag)
```

Authority: `tools/pi-cli.tool.yaml`

## Required Pre-Conditions

All of the following must be confirmed before a smoke command runs:

| Pre-Condition | Check |
|---------------|-------|
| Owner Approval | Explicit `OWNER_APPROVAL:` string present in the slice |
| Skill Contract | A valid `skills/pi/*.skill.yaml` covers this run type |
| Tool Contract | `tools/pi-cli.tool.yaml` command shape respected |
| Write Mode | `policies/write-modes.policy.yaml` write mode declared (`read_only` or `draft_only`) |
| Evidence Path | `sandbox/runs/<timestamp>/` directory created before run starts |
| Abort Conditions | All abort conditions reviewed before execution |
| Verification Plan | `verify_steps` from the skill contract are explicit and checkable |

A smoke that starts without any of these confirmed is invalid and must be aborted.

## Required Evidence After Smoke

Every smoke command must produce the following artifacts under `sandbox/runs/<timestamp>/`:

| Artifact | Content |
|----------|---------|
| `intent.md` | What the smoke was supposed to verify; skill contract and scope |
| `commands-run.md` | Exact command executed without secrets; exit code |
| `files-read.md` | Files read by Pi, or "none" |
| `files-changed.md` | Files changed or created, or "none" |
| `validation.md` | All verify_steps executed with results; explicit pass/rework/blocked verdict; secret-check block |
| `diff.patch` | Git diff of changed files; or supplement if no diff (new file or identical) |
| `risks.md` | Real open gaps; no vague placeholders |
| `next-gate.md` | One concrete next slice |

The `validation.md` must include a secret-check block:

```
.env read: no
API keys exposed: no
auth files read: no
browser profiles accessed: no
secret-bearing output: no
```

Authority: `runtime/surfaces/pi/evidence-contract.md`, `docs/evidence-path-contract.md`

## Abort Conditions

A smoke command must abort immediately if any of the following occur:

```
owner_approval_missing
skill_contract_not_found_or_not_applicable
tool_contract_not_respected
evidence_path_not_prepared
tier_boundary_unclear
pi_requests_tools_or_open_session
secret_access_requested
env_file_read_attempted
vault_write_requested
provider_call_not_via_approved_shape
network_requested_without_explicit_approval
output_targets_canonical_path
automatic_promotion_triggered
providers_pi_creation_requested
unexpected_dirty_tree_before_run
```

## Forbidden Actions

The following are forbidden in all smoke commands regardless of tier:

```
providers/pi/ creation or modification
Vault writes
Secret reads (.env, env, printenv, API keys, credentials, auth files)
Network access without an explicit execution slice approving it
Package installation (npm install, pip install, etc.)
CI or hook wiring (.github/workflows/, pre-commit, husky, etc.)
Unbounded repo discovery (find /, glob without path constraint)
browser_use or computer_use (Tier 3+ only)
Automatic promotion from smoke output to canonical without a promotion slice
Open-ended sessions without a bounded prompt
--api-key flag in any Pi command
bash, edit, or write tool use
Mutation of runtime, schema, or provider contract files
```

In addition, all Tier 0 defaults from `runtime/surfaces/pi/session-policy.md` remain in force.

## Output Boundary

The output of a smoke command is:

- **allowed**: text/analysis in `--print` mode captured to `commands-run.md` or equivalent evidence artifact
- **allowed**: draft file written to `sandbox/runs/<timestamp>/` (Tier 1 only, with `--no-tools --print`)
- **forbidden**: automatic write to any canonical path outside `sandbox/runs/<timestamp>/`
- **forbidden**: automatic promotion to docs, runtime, policies, or skills
- **not a pass verdict**: a smoke that produces output is not itself an approval; it requires evidence review

## Authority Chain

```
runtime/surfaces/pi/smoke-command.md  ← this document
runtime/surfaces/pi/session-policy.md ← session tier and pre-condition rules
runtime/surfaces/pi/evidence-contract.md ← evidence boundary rules
docs/evidence-path-contract.md        ← canonical path and minimal structure
sandbox/runs/run-evidence-template.md ← authoritative field template
tools/pi-cli.tool.yaml                ← approved command shapes
policies/write-modes.policy.yaml      ← write mode definitions
skills/pi/tier1-docs-draft.skill.yaml ← Tier-1 draft skill contract
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
no tool grant
```
