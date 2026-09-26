# Extension Install Safety Policy

Class: canonical.
Use rule: read this before any install, activation, import, or runtime binding of an extension-like artifact. This policy is the canonical safety rule for pre-install SkillSpector gating in Baum-OS / Pi.dev workflows.

## Purpose

Before installing any extension, skill, theme, MCP server, plugin, external package, GitHub repository, ZIP archive, or local third-party script, run SkillSpector on the exact install target first.

The scan is a gate, not an install. If the gate fails, the install is blocked.

## Relation To The MAWS Skill Frontdoor

For install type `skill`, this SkillSpector scan is the mandatory **security sub-gate**, not the complete admission decision.

A skill candidate must also pass the canonical MAWS Skill Frontdoor in `docs/skill-frontdoor-contract.md`, which adds NVIDIA/SkillEvaluator Tier 1 and a deterministic MAWS-owned admission record before implementation, installation, activation, import, binding, or publication.

Use:

    npm run skill:frontdoor -- --skill-id <stable-id> --target <staged-local-skill> --action <action>

For non-skill extension types, this policy remains the current SkillSpector exact-target gate unless another canonical contract adds a stricter boundary.

A frontdoor owner exception may accept only **known, fully analyzed risk**. Missing, unknown, or incomplete analyzer evidence remains blocked and cannot be overridden.

## Required Default

Default scan mode:

```text
noLlm=true
format=json
```

Use the static scan first. LLM-assisted analysis is optional and additive only. It never replaces the static scan.

## Exact Target Rule

The scan target must be the exact object that would be installed:

- a path
- a URL
- a ZIP file
- a Git repository
- a single `SKILL.md`

If the target cannot be resolved unambiguously, the install is blocked before any install action starts.

## Blocking Conditions

Installation must be blocked when any of the following is true:

- SkillSpector cannot be executed.
- The target is missing, ambiguous, or cannot be resolved to one exact install target.
- The scan aborts or produces no usable report.
- The report cannot be written to evidence.
- The report cannot be parsed or the schema is unclear.
- The report contains `high` or `critical` findings.
- The report indicates prompt injection, secret exfiltration, privilege escalation, supply-chain risk, dangerous shell execution, credential access, memory poisoning, or MCP tool poisoning.
- The target requests access beyond its plausible scope.
- The install would mutate global config, shell profiles, `PATH`, secrets, auth state, or deploy targets.
- The install would require a live side effect before the scan evidence exists.

## Owner Override

Override is allowed only when it is documented in a decision file with explicit scope and risk acceptance.

Required fields:

```markdown
# Install Risk Decision

- Evidence path:
- Target:
- Type: skill | extension | theme | MCP | package | plugin | other
- Scan command:
- Report path:
- Findings summary:
- Block reason:
- Owner decision:
- Accepted risk:
- Scope limit:
- Rollback path:
- Date:
```

Without this documentation, a blocked scan remains blocked.

## Evidence Path

Evidence for the gate must live under:

```text
sandbox/runs/<timestamp>/
```

Required artifacts:

- `skillspector-report.json`
- `install-risk-decision.md`

The helper in `scripts/tools/preinstall-skill-risk-check.mjs` writes the decision artifact and blocks fail-closed when the scanner is unavailable, the target is unclear, or the report is unsafe.

## Relation To Pi

If Pi is used for installation work, the Pi extension's `skillspector_scan` tool must call the same static gate first.

Optional strict scan:

```text
skillspector_scan target=<target> format=json noLlm=false provider=anthropic model=<approved-model>
```

Strict scanning is additive. It does not waive the static scan.

## Non-Goals

```text
no install without scan
no evidence-free install
no secret reads
no automatic override
no global configuration change
no provider/runtime promotion
```
