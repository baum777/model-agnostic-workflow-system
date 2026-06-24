# Pi Smoke Command Policy Review

## Result

rework

## Scope

**In scope:**
- `runtime/surfaces/pi/smoke-command.md` — read and assessed against expanded session policy
- `runtime/surfaces/pi/handoff.md` — read and assessed against expanded evidence contract and session policy

**Explicitly out of scope:**
- No Pi execution, no smoke run, no provider call
- No modification of any existing file
- No runtime code, no CI/hook wiring
- `runtime/surfaces/pi/session-policy.md` — already expanded (`611ae3a`), used as reference only
- `runtime/surfaces/pi/evidence-contract.md` — already expanded (`84116f8`), used as reference only

## Files Reviewed

| File | Role |
|------|------|
| `runtime/surfaces/pi/smoke-command.md` | Reviewed — smoke boundary definition |
| `runtime/surfaces/pi/handoff.md` | Reviewed — post-run handoff format |
| `runtime/surfaces/pi/session-policy.md` | Reference — expanded session policy (611ae3a) |
| `runtime/surfaces/pi/evidence-contract.md` | Reference — expanded evidence contract (84116f8) |
| `runtime/surfaces/pi/README.md` | Reference — surface overview |
| `docs/evidence-path-contract.md` | Reference — canonical evidence path |
| `docs/baum-os-v0.1-closure-review.md` | Reference — v0.1 closure |
| `skills/pi/tier1-docs-draft.skill.yaml` | Reference |
| `skills/pi/tier1-contract-review.skill.yaml` | Reference |
| `skills/pi/tier1-evidence-audit.skill.yaml` | Reference |
| `tools/pi-cli.tool.yaml` | Reference |
| `policies/write-modes.policy.yaml` | Reference |

## Smoke Command Review

`runtime/surfaces/pi/smoke-command.md` — current: 32 lines, minimal skeleton

| Criterion | Status | Finding |
|-----------|--------|---------|
| Smoke is not a free Pi run | partial | Forbidden list present; no explicit statement that smoke is Tier 0 only and requires the session policy pre-conditions |
| Allowed flags/constraints clear | pass | `--no-tools`, `--no-session`, `--print`, `no --api-key`, no mutation — all present |
| `--no-tools --print` safe tier boundary | pass | Explicitly listed in Approved Shape |
| No CLI key passing | pass | "no `--api-key`" present |
| Forbidden actions listed | pass | `bash`, `edit`, `write`, `--api-key`, secrets, provider calls from sandbox — present |
| Reference to `session-policy.md` | **missing** | No link; reader cannot trace smoke boundary to the tier system |
| Reference to `evidence-contract.md` | **missing** | No link; smoke evidence requirements are implicit, not enforced by reference |
| Abort conditions | **missing** | No explicit list of when to stop; "forbidden" list is not the same as abort conditions |
| Tier classification | **missing** | Tier 0 not named; approved session type (`read_only_review`) not referenced |
| Evidence requirement after smoke | **missing** | No requirement to capture evidence under `sandbox/runs/<timestamp>/` |

**Summary:** The Approved Shape and Forbidden list are correct and coherent with the expanded session policy. However, the file lacks cross-references to `session-policy.md` and `evidence-contract.md`, does not name the Tier classification, and defines no abort conditions or evidence requirement. For v0.2-pre-runtime coherence, an update slice is needed.

## Handoff Review

`runtime/surfaces/pi/handoff.md` — current: 27 lines, minimal skeleton

| Criterion | Status | Finding |
|-----------|--------|---------|
| Handoff format defined | pass | Required output sections named |
| Evidence artifacts requirement | **weak** | "Evidence path or summary" is vague — does not name the 8 canonical files from `evidence-contract.md` |
| Reference to `sandbox/runs/<timestamp>/` | **missing** | Canonical evidence path not referenced; "evidence path or summary" allows non-standard paths |
| Reference to 8 minimal artifacts | **missing** | `intent.md`, `commands-run.md`, `files-read.md`, `files-changed.md`, `validation.md`, `diff.patch`, `risks.md`, `next-gate.md` — none named |
| Reference to audit / re-audit | **missing** | No mention of `pi.tier1.evidence_audit`, audit cards, or re-audit pattern |
| Human Approval as final authority | **missing** | Not mentioned; reader cannot determine whether handoff constitutes an approval gate |
| Handoff ≠ automatic promotion | **missing** | No explicit non-promotion statement; "pass | rework | blocked" verdict could be misread as triggering promotion |
| Reference to `session-policy.md` | **missing** | No link to tier system or pre-condition rules |
| Reference to `evidence-contract.md` | **missing** | No link to the evidence boundary rules |
| "No handoff without evidence and next gate" | pass | Rule present and correct |

**Summary:** The core rule ("no handoff without evidence and next gate") is correct. The output format sections are reasonable but the evidence requirement is too vague for v0.2. Critical gaps: no canonical path, no 8-artifact list, no audit reference, no human approval mention, no non-promotion statement, no cross-references. Needs an update slice.

## Boundary Review

| Boundary | Status |
|----------|--------|
| Pi execution | not triggered — review only |
| Provider calls | none |
| Vault | no evidence of Vault access in either file |
| Secrets | neither file references secrets in an unsafe way; "no `--api-key`" correctly present in smoke-command.md |
| Network | none |
| CI / Hook | none |
| Runtime | neither file activates runtime |
| `providers/pi/` | absent |

Both files are docs-only and contain no execution triggers.

## Decision

Neither skeleton is adequate for v0.2-pre-runtime coherence when measured against the now-expanded `session-policy.md` (611ae3a) and `evidence-contract.md` (84116f8).

| File | Adequate for v0.2? | Reason |
|------|--------------------|--------|
| `smoke-command.md` | **no** | Missing: tier classification, session-policy.md reference, evidence-contract.md reference, abort conditions, evidence capture requirement |
| `handoff.md` | **no** | Missing: canonical evidence path, 8-artifact list, audit/re-audit reference, human approval boundary, non-promotion statement, cross-references |

Both files are consistent with existing boundaries and do not introduce regressions. They are simply incomplete relative to the expanded surfaces.

## Required Follow-up

**Both Update Slices required:**

1. **Smoke Command Update Slice** — `runtime/surfaces/pi/smoke-command.md`
   - Add Tier 0 classification and `read_only_review` session type reference
   - Add link to `session-policy.md` and `evidence-contract.md`
   - Add explicit abort conditions
   - Add evidence capture requirement (`sandbox/runs/<timestamp>/`)

2. **Handoff Update Slice** — `runtime/surfaces/pi/handoff.md`
   - Add canonical evidence path (`sandbox/runs/<timestamp>/`)
   - Add 8-artifact minimal list by name
   - Add audit / re-audit references
   - Add human approval as final authority
   - Add explicit non-promotion statement
   - Add cross-references to `session-policy.md` and `evidence-contract.md`

Recommended order: Smoke Command Update first (simpler scope), then Handoff Update.

## Risks / Gaps

- Without these updates, the surface skeletons are internally consistent but leave gaps that a future Pi-session operator could misread (e.g., treating "pass" in handoff as automatic promotion, or running a smoke without knowing the abort conditions).
- Neither gap is a security failure — both files enforce correct boundaries. They are documentation completeness gaps, not boundary violations.

## Recommended Next Gate

**Pi Smoke Command Update Slice** — expand `runtime/surfaces/pi/smoke-command.md` to add:
tier classification (Tier 0 / `read_only_review`), cross-references to `session-policy.md`
and `evidence-contract.md`, explicit abort conditions, and evidence capture requirement.
Commit-Grenze: only `runtime/surfaces/pi/smoke-command.md`. No Pi, no provider, no runtime.
