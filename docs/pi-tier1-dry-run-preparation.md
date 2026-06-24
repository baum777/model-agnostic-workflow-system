# Pi Tier-1 Dry Run Preparation

## Result

conditional

## Scope

**In scope:**
- Pre-condition verification (governance, environment, secret placement)
- Pi CLI availability and version check (no session, no call)
- MINIMAX_API_KEY boolean shell check (no value output)
- Evidence run folder scaffold creation (`sandbox/runs/20260624T035035Z/`)
- Planned command shape definition (not executed)
- Preparation decision document

**Explicitly out of scope:**
- No Pi execution, no provider call, no smoke run
- No `.env` read (content), no secret output
- No `env`, `printenv`, `source .env`
- No runtime code, CI/hook, schema, or contract changes
- No `.gitignore` modification
- No canonical file writes outside `sandbox/runs/20260624T035035Z/` and `docs/`

## Preconditions

| Criterion | Status | Finding |
|-----------|--------|---------|
| Owner Approval present | pass | OWNER_APPROVAL: Pi Tier-1 Dry Run Preparation Slice |
| Skill Contract: `tier1-docs-draft.skill.yaml` | pass | Schema-validated; covers Tier-1 draft runs |
| Tool Contract: `pi-cli.tool.yaml` | pass | Schema-validated; `tier1_markdown_draft_no_tools` command shape defined |
| Write Mode: `draft_only` | pass | Defined in `policies/write-modes.policy.yaml` |
| Evidence Path: `sandbox/runs/20260624T035035Z/` | pass | Directory created |
| Abort Conditions defined | pass | 15 in smoke-command.md; 13 in session-policy.md; 15 in pi-cli.tool.yaml |
| Verification Plan defined | pass | `verify_steps` in `skills/pi/tier1-docs-draft.skill.yaml` |
| Tier boundary: `--no-tools --print` | pass | Mandatory flag set in planned command shape |
| Human Approval as final authority | pass | Visible in all four expanded surfaces |
| Automatic promotion excluded | pass | Non-promotion rule in handoff.md; write-modes.policy.yaml |
| `providers/pi/` absent | pass | Confirmed |
| `.env` gitignored | pass | `ENV_GITIGNORED` confirmed |
| `.env` not tracked | pass | `ENV_NOT_TRACKED` confirmed |
| `.gitignore` committed | **not yet** | Owner change uncommitted; gitignore rule active but not persisted |
| MINIMAX_API_KEY in shell | **missing** | Boolean check: MINIMAX_API_KEY_MISSING; owner-confirmed via `.env` |

## Local Environment

| Item | Status | Detail |
|------|--------|--------|
| Pi CLI in PATH | present | `/home/baum/.npm-global/bin/pi` |
| Pi CLI version | `0.79.9` | Matches `@earendil-works/pi-coding-agent@0.79.9` |
| MINIMAX_API_KEY (shell) | **missing** | Boolean check: false; key not exported in current shell |
| MINIMAX_API_KEY (owner confirmation) | `owner_confirmed_not_shell_verified` | OWNER_APPROVAL implies key available via `.env`; not shell-verifiable in this slice without reading `.env` |

## Planned Run Folder

`sandbox/runs/20260624T035035Z/`

8 evidence scaffold files created (preparation only — no Pi output):

| File | Status |
|------|--------|
| `intent.md` | created — skill/tool/write-mode/boundary declared |
| `commands-run.md` | created — preparation commands listed; planned Pi command documented |
| `files-read.md` | created — governance files listed |
| `files-changed.md` | created — scaffold files listed |
| `validation.md` | created — all pre-checks and boundary checks |
| `diff.patch` | created — supplement note (preparation-only; no prior version) |
| `risks.md` | created — two open risks documented |
| `next-gate.md` | created — Execution Slice requirements defined |

## Planned Command Shape

**Documentation only — NOT executed.**

```bash
pi \
  --provider minimax \
  --model MiniMax-M3 \
  --no-session \
  --no-tools \
  --print \
  "<bounded Tier-1 draft-only prompt>"
```

| Constraint | Value |
|-----------|-------|
| Tier | Tier 1 / `draft_only_generation` |
| `--no-tools` | required |
| `--print` | required (stdout only) |
| `--no-session` | required |
| `--api-key` flag | **forbidden** |
| Auth | `MINIMAX_API_KEY` via `.env` loaded in shell |
| Output destination | stdout captured to evidence or `docs/proposals/` draft file |
| Automatic commit | **forbidden** |
| Automatic promotion | **forbidden** |
| Free write access | **forbidden** |

Prompt scope for Execution Slice (proposed):
Generate a brief Markdown summary (~20-30 lines) of the Baum-OS Pi governance cycle
completed in v0.2-pre-runtime, covering the four expanded surfaces and closure verdict.
Output is draft-only for `docs/proposals/` — not canonical.

## Evidence Prepared

9 files created:
- `sandbox/runs/20260624T035035Z/intent.md`
- `sandbox/runs/20260624T035035Z/commands-run.md`
- `sandbox/runs/20260624T035035Z/files-read.md`
- `sandbox/runs/20260624T035035Z/files-changed.md`
- `sandbox/runs/20260624T035035Z/validation.md`
- `sandbox/runs/20260624T035035Z/diff.patch`
- `sandbox/runs/20260624T035035Z/risks.md`
- `sandbox/runs/20260624T035035Z/next-gate.md`
- `docs/pi-tier1-dry-run-preparation.md` (this document)

## Boundary Review

| Boundary | Status | Detail |
|----------|--------|--------|
| Pi execution | none | No Pi session; `pi --version` only |
| Provider calls | none | No API call |
| Vault | none | No Vault access |
| Secrets | none | No secret read; no value output; boolean check only |
| `.env` content | none | Not read; not sourced |
| Network | none | No network call |
| CI / Hook | none | No CI or hook files touched |
| Runtime code | none | No runtime files changed |
| `providers/pi/` | absent | Confirmed |
| Automatic promotion | none | Scaffold is preparation only |
| `.gitignore` | not modified | Owner change present but not committed by this slice |

## Decision

**Execution Slice allowed: conditional yes**

The governance framework is complete. The evidence scaffold is in place. Two items
must be resolved by the operator before the Execution Slice proceeds:

1. **Commit `.gitignore`** — owner runs:
   `git add .gitignore && git commit -m "chore: add .env to .gitignore"`

2. **Load `MINIMAX_API_KEY` into shell** — operator runs (outside this slice, no value output):
   `source .env` (or equivalent shell export) then verifies with boolean check:
   `[ -n "${MINIMAX_API_KEY:-}" ] && echo MINIMAX_API_KEY_PRESENT || echo MINIMAX_API_KEY_MISSING`

If both items are confirmed, the Execution Slice may proceed in the same or a
subsequent owner-approved gate.

## Blockers

None — provided the two operator steps above are completed.

## Recommended Next Gate

**Pi Tier-1 Dry Run Execution Slice** — after:
1. `.gitignore` committed by owner
2. `MINIMAX_API_KEY` loaded into shell (boolean confirmed PRESENT)

Execution Slice scope:
- Run Pi with planned command shape
- Capture stdout output to evidence artifact
- Complete the 8 evidence files with actual run content
- Produce handoff per `handoff.md` format
- No automatic commit of Pi output
- No canonical write without a promotion slice
