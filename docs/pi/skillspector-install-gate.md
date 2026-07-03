# SkillSpector Install Gate

Class: operational.
Use rule: use this as the operator-facing gate for pre-install risk scanning. It does not replace `docs/security/extension-install-safety-policy.md`.

## Purpose

Use SkillSpector to scan the exact install target before installing a skill, extension, theme, MCP server, plugin, package, repo, ZIP, or local third-party script.

The gate is static by default. The LLM-assisted mode is optional and must be explicitly approved.

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
