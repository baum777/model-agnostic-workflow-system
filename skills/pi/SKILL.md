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
2. Read `docs/skill-frontdoor-contract.md` and `docs/pi/skillspector-install-gate.md`.
3. Identify the exact install target and install type.
4. For a `skill`, stage the exact candidate locally without activation and run `npm run skill:frontdoor -- --skill-id <stable-id> --target <target> --action <action>`.
5. For non-skill extension types, run the static SkillSpector gate first.
6. Treat `high` or `critical` findings, unresolved targets, missing reports, unknown severity, incomplete analyzer evidence, or unclear evidence as blocked.
7. Review the timestamped decision/evidence artifacts before any install or implementation action.
8. Proceed only when the applicable gate passes. A MAWS skill-frontdoor owner exception may accept known fully analyzed risk only; incomplete evidence remains blocked.

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
- Confirm the SkillSpector scan is static by default (`noLlm=true`).
- For skill candidates, confirm SkillEvaluator Tier 1 also completed under the MAWS frontdoor.
- Block when either required analyzer is unavailable, incomplete, or the report is unclear.
- Keep analyzer evidence separate from authority, install, and implementation action.

## References

- `docs/security/extension-install-safety-policy.md`
- `docs/skill-frontdoor-contract.md`
- `docs/pi/skillspector-install-gate.md`
- `docs/checklists/pre-install-risk-scan.md`
- `scripts/tools/preinstall-skill-risk-check.mjs`
