# Pi Tier-1 Dry Run Decision

## Result

conditional — governance framework ready; one environment pre-condition
must be confirmed before the Dry Run Preparation Slice proceeds

## Scope

**In scope:**
- Pre-condition review against `runtime/surfaces/pi/session-policy.md`
- Skill contract, tool contract, write mode, evidence path, abort condition review
- Safe Pi CLI availability and version check (`command -v pi`, `pi --version`)
- Boolean-only MiniMax auth key presence check (no value output, no `.env` read)
- Proposed Dry Run command shape (not executed — documentation only)
- Boundary review of this Decision Gate itself

**Explicitly out of scope:**
- No Pi execution, no provider call, no network test, no auth test
- No `.env` read, no `env`, no `printenv`, no secret value output
- No smoke run
- No runtime code, CI/hook, schema, or contract changes
- `providers/pi/` remains permanently forbidden

## Files Reviewed

| File | Role |
|------|------|
| `runtime/surfaces/pi/session-policy.md` | Session governance — tiers, pre-conditions, abort conditions |
| `runtime/surfaces/pi/evidence-contract.md` | Evidence boundary rules |
| `runtime/surfaces/pi/smoke-command.md` | Smoke command surface and abort conditions |
| `runtime/surfaces/pi/handoff.md` | Handoff format and non-promotion statement |
| `runtime/surfaces/pi/README.md` | Surface overview (updated `d66d47d`) |
| `docs/pi-runtime-surface-closure-review.md` | v0.2 closure review |
| `docs/evidence-path-contract.md` | Canonical evidence path |
| `docs/baum-os-v0.1-closure-review.md` | v0.1 closure — contract inventory |
| `tools/pi-cli.tool.yaml` | Approved command shapes |
| `policies/write-modes.policy.yaml` | Write mode definitions |
| `skills/pi/tier1-docs-draft.skill.yaml` | Primary Tier-1 skill contract |
| `skills/pi/tier1-contract-review.skill.yaml` | Tier-1 contract review skill |
| `skills/pi/tier1-evidence-audit.skill.yaml` | Evidence audit skill |

## Preconditions Review

All pre-conditions from `runtime/surfaces/pi/session-policy.md` assessed:

| Pre-Condition | Status | Finding |
|---------------|--------|---------|
| Owner Approval | **ready** | Mechanism established; OWNER_APPROVAL: prefix enforced in all prior slices |
| Skill Contract | **ready** | `skills/pi/tier1-docs-draft.skill.yaml` (schema-validated PASS) covers Tier-1 draft runs |
| Tool Contract | **ready** | `tools/pi-cli.tool.yaml` (schema-validated PASS); approved command shape defined |
| Write Mode | **ready** | `policies/write-modes.policy.yaml` — `draft_only` mode defined and enforced |
| Evidence Path | **ready** | `sandbox/runs/<timestamp>/` canonical path established; `docs/evidence-path-contract.md` authoritative |
| Abort Conditions | **ready** | 15 abort conditions in `smoke-command.md`; 13 in `session-policy.md`; 15 in `tools/pi-cli.tool.yaml`; fully aligned |
| Verification Plan | **ready** | `verify_steps` defined in `skills/pi/tier1-docs-draft.skill.yaml` |
| Tier boundary clear | **ready** | Tier 1 / `draft_only_generation`; `--no-tools --print` mandatory; ceiling enforced |
| Human Approval as final authority | **ready** | Visible in session-policy.md, evidence-contract.md, smoke-command.md, handoff.md |
| Automatic promotion excluded | **ready** | Non-promotion rule in handoff.md; promotion rule in write-modes.policy.yaml |
| `providers/pi/` absent | **ready** | Confirmed absent; permanently forbidden in all surfaces |
| MINIMAX_API_KEY in shell | **conditional** | Boolean check: MISSING in current shell environment. Key may exist in `.env` file (not read — policy-compliant). Operator must confirm key is loadable before Dry Run starts. |

**All governance pre-conditions: ready.**
**One environment pre-condition: conditional (key not confirmed in shell).**

## Local Environment Review

| Item | Status | Detail |
|------|--------|--------|
| Pi CLI in PATH | **present** | `/home/baum/.npm-global/bin/pi` |
| Pi CLI version | **confirmed** | `0.79.9` — matches expected `@earendil-works/pi-coding-agent@0.79.9` |
| Pi invocation method | safe | `command -v pi` + `pi --version` only; no session, no network, no provider call, no secret access |
| MINIMAX_API_KEY (shell) | **missing** | Boolean check only; no value output; no `.env` read. Key not present in current shell environment. |
| MINIMAX_API_KEY (.env) | **unknown — not checked** | `.env` read is forbidden per policy. Key may be present in `.env`. This must be confirmed by the operator before the Dry Run Preparation Slice. |
| Evidence path exists | **ready** | `sandbox/runs/` directory confirmed in prior runs |
| Contract validator | **green** | `npm run validate-baumos-contracts` → 5/5 PASS (confirmed in prior slice) |

**Assessment:** The Pi binary is present and at the correct version. The governance framework is complete. The only unresolved item is MINIMAX_API_KEY availability in the execution environment.

## Proposed Dry Run Shape

**Documentation only — not executed.**

If the Dry Run Preparation Slice proceeds, the approved command shape from
`tools/pi-cli.tool.yaml` (`tier1_markdown_draft_no_tools`) is:

```bash
pi \
  --provider minimax \
  --model MiniMax-M3 \
  --no-session \
  --no-tools \
  --print \
  "<bounded Tier-1 draft-only prompt>"
```

Constraints:
- Prompt must be bounded (no open-ended query)
- Output is stdout only (`--print`); no automatic file write
- Auth via `MINIMAX_API_KEY` from shell/`.env` — never `--api-key` flag
- Evidence path `sandbox/runs/<timestamp>/` must be created before run
- 8 artifacts required in evidence folder after run
- Handoff format from `handoff.md` required

Skill to use: `pi.tier1.docs_draft` (`skills/pi/tier1-docs-draft.skill.yaml`)

## Boundary Review

This Decision Gate itself:

| Boundary | Status | Detail |
|----------|--------|--------|
| Pi execution | **not triggered** | `pi --version` only; no session, no prompt, no output beyond version string |
| Provider calls | **none** | No API call made |
| Vault | **none** | No Vault access |
| Secrets | **none** | Boolean-only key check; no value output; no `.env` read |
| Network | **none** | `pi --version` does not make network calls |
| CI / Hook | **none** | No CI or hook files touched |
| Runtime code | **none** | No runtime files changed |
| `providers/pi/` | **absent** | Confirmed |
| Automatic promotion | **none** | This decision document is docs-only; no promotion triggered |

## Decision

**Pi Tier-1 Dry Run Slice allowed: conditional yes**

The governance framework is complete and ready:
- All four runtime surfaces are expanded and coherent
- Skill contract, tool contract, write mode, evidence path, abort conditions, and verification plan are all defined and schema-validated
- Pi CLI is present at the correct version (`0.79.9`)
- All boundaries have been reviewed and are intact

**Single remaining condition before Dry Run Preparation Slice proceeds:**

The operator must confirm that `MINIMAX_API_KEY` is loadable in the Pi execution
environment (e.g., present in the `.env` file that Pi reads at startup) — without
reading the `.env` in this session. This confirmation should be stated explicitly
in the OWNER_APPROVAL string of the Dry Run Preparation Slice.

If the key is confirmed loadable, the Dry Run Preparation Slice may proceed immediately.
If the key is not available, the Dry Run is blocked until key setup is resolved.

## Blockers

None — provided `MINIMAX_API_KEY` can be confirmed loadable by the operator.

## Accepted Gaps

| Gap | Reason |
|-----|--------|
| `MINIMAX_API_KEY` not confirmed in shell | Boolean check: missing in current shell. Key may exist in `.env` (not read per policy). Operator must confirm. Not a hard blocker — resolves with operator declaration in next slice's OWNER_APPROVAL. |
| Evidence run template file path variance | `sandbox/runs/run-evidence-template.md` referenced in multiple contracts; not explicitly verified in this gate. Non-blocking — template verified in prior evidence runs. |

## Known Gaps (v0.3 Candidates)

| Candidate | Purpose |
|-----------|---------|
| Vault Read Bridge Design | Read-only memory bridge for later tiers; not needed for Tier-1 dry run |
| Second Tier-1 Skill | Expand skill set beyond the three existing; post-dry-run work |
| `docs/pi-tier-1-draft-workflow.md` expansion | Concrete operator steps; currently a minimal proposal |
| Pi Dry Run post-mortem skill | Skill for reviewing dry run evidence; post-dry-run work |

## Recommended Next Gate

**Pi Tier-1 Dry Run Preparation Slice** — owner-approved slice that:

1. Confirms `MINIMAX_API_KEY` is loadable in the OWNER_APPROVAL string (boolean — no value)
2. Creates `sandbox/runs/<timestamp>/` evidence directory
3. Defines the bounded prompt for the Tier-1 draft run
4. Names the approved output path for the draft output
5. Does **not** execute Pi — preparation only

After the Preparation Slice is committed, the **Pi Tier-1 Dry Run Execution Slice**
may proceed as a separate owner-approved gate.

Alternatively, if the operator can confirm the key is available in this session's
context, the Preparation and Execution Slices may be combined into a single
**Pi Tier-1 Dry Run Slice** with explicit OWNER_APPROVAL covering both steps.
