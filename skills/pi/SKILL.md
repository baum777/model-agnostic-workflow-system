---
name: pi
description: Govern Pi.dev / Baum-OS install safety, exact-target pre-install scanning, and fail-closed Pi boundary decisions.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: extracted
---

# Pi Safety Frontdoor

## Trigger

Use this skill when a task involves Pi.dev / Baum-OS install safety, exact-target risk scanning, or deciding whether a Pi-adjacent install may proceed.

## When Not To Use

- Do not use for unrelated repo maintenance.
- Do not use to approve an install without a scan.
- Do not use to infer secret state, credentials, or runtime readiness.
- Do not use as a substitute for the canonical policy or gate docs.

## Workflow

1. Read `docs/security/extension-install-safety-policy.md`.
2. Read `docs/pi/skillspector-install-gate.md`.
3. Identify the exact install target and install type.
4. Run the static scan first.
5. Treat `high` or `critical` findings, unresolved targets, missing reports, or unclear evidence as blocked.
6. Write or review `sandbox/runs/<timestamp>/install-risk-decision.md`.
7. Proceed only when the gate passes or an owner override is explicitly documented.

## Output

Use these headings:

- `SUMMARY`
- `TARGET`
- `SCAN COMMAND`
- `REPORT PATH`
- `DECISION`
- `BLOCKERS`
- `OWNER OVERRIDE`
- `EVIDENCE`
- `NEXT ACTIONS`

## Quality Checks

- Confirm the exact target before scanning.
- Confirm the report path lives under `sandbox/runs/<timestamp>/`.
- Confirm the scan is static by default (`noLlm=true`).
- Block when the scanner is unavailable or the report is unclear.
- Keep install evidence separate from install action.

## References

- `docs/security/extension-install-safety-policy.md`
- `docs/pi/skillspector-install-gate.md`
- `docs/checklists/pre-install-risk-scan.md`
- `scripts/tools/preinstall-skill-risk-check.mjs`
