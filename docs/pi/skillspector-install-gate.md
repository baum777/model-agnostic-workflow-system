# SkillSpector Install Gate

Class: operational.
Use rule: use this as the operator-facing gate for pre-install risk scanning. It does not replace `docs/security/extension-install-safety-policy.md`.

## Purpose

Use SkillSpector to scan the exact install target before installing a skill, extension, theme, MCP server, plugin, package, repo, ZIP, or local third-party script.

The gate is static by default. The LLM-assisted mode is optional and must be explicitly approved.

## MAWS Skill Candidate Composition

For a target of type `skill`, SkillSpector is the security analyzer inside the stricter MAWS Skill Frontdoor. Do not treat a clean SkillSpector report alone as implementation or installation eligibility.

Run the composed gate instead:

    npm run skill:frontdoor -- --skill-id <stable-id> --target <staged-local-skill> --action <implement|install|activate|import|bind|publish>

That path requires both the static SkillSpector report and NVIDIA/SkillEvaluator Tier 1 evidence, then derives a MAWS-owned disposition. Analyzer PASS never grants authority.

The standalone helper below remains valid for non-skill extension targets and for debugging the SkillSpector sub-gate.

## Standard Static Scan

Preferred Pi tool invocation:

```text
skillspector_scan target=<target> format=json noLlm=true output=sandbox/runs/<timestamp>/skillspector-report.json
```

CLI fallback when the Pi tool is not available:

```bash
skillspector scan <target> --no-llm --format json --output sandbox/runs/<timestamp>/skillspector-report.json
```

The exact target is mandatory. The report must land in the timestamped `sandbox/runs/<timestamp>/` directory.

## Optional Strict Scan

Use only after explicit owner approval and only as an additional review:

```text
skillspector_scan target=<target> format=json noLlm=false provider=anthropic model=<approved-model> output=sandbox/runs/<timestamp>/skillspector-report.json
```

Strict scanning does not replace the static scan. If provider credentials are unavailable or the report cannot be written, the install remains blocked.

## Recommended Local Helper

For Baum-OS-local installs, use the repo helper:

```bash
npm run preinstall-risk-check -- --type <skill|extension|theme|mcp|package|plugin|other> --target <exact-target>
```

The helper writes `skillspector-report.json` and `install-risk-decision.md` under `sandbox/runs/<timestamp>/` and exits non-zero when the scan is missing, unclear, or blocking.

## Evidence Path

- `sandbox/runs/<timestamp>/skillspector-report.json`
- `sandbox/runs/<timestamp>/install-risk-decision.md`

## Acceptance Contract

A BLOCKING-branch test passes when ALL of the following conditions are met:

1. **Helper envelope**: `blocked: true` (JSON stdout from the helper)
2. **Findings**: At least one `CRITICAL` or `HIGH` finding is present in the report (for the golden fixture `tests/fixtures/risky_skill/SKILL.md`, the contract is `critical >= 1`)
3. **Decision fields**: `install-risk-decision.md` contains all 12 required fields (Evidence path, Target, Type, Scan command, Report path, Findings summary, Block reason, Classification reason, Owner decision, Accepted risk, Scope limit, Rollback path, Date)
4. **Both reasons populated**: Both `Block reason` (priority-chain) and `Classification reason` (internal classification) are present (the latter may be empty for early exit conditions)
5. **No install executed**: The target is scanned ONLY; no install command or activation is run
6. **Residual risk: none**: No global config, shell profile, PATH, secrets, auth, or deploy targets are modified

The golden fixture regression test (`npm run validate-blocked-branch`) enforces this contract.

## Block When

- The target cannot be resolved to one exact install target.
- The report is missing, unreadable, or cannot be written.
- The scan exits non-zero.
- The report shows high/critical findings.
- The report suggests prompt injection, secret access, privilege escalation, supply-chain risk, dangerous shell execution, credential access, memory poisoning, or MCP tool poisoning.
- The install would change global config, shell profiles, `PATH`, secrets, auth, or deploy targets.

## Notes

- Static scan first.
- LLM scan only as additive review.
- Evidence before install.
- No evidence means no install.
