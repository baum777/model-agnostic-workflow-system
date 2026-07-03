# Pre-Install Risk Scan Checklist

Class: operational.
Use rule: complete this checklist before installing any extension-like artifact.

## Checklist

- [ ] Identify the install type: `skill`, `extension`, `theme`, `MCP`, `package`, `plugin`, or `other`.
- [ ] Capture the exact install target: one path, one URL, one ZIP, one repo, or one `SKILL.md`.
- [ ] Confirm the target is unambiguous.
- [ ] Run the static SkillSpector scan with `noLlm=true` and `format=json`.
- [ ] Write the report to `sandbox/runs/<timestamp>/skillspector-report.json`.
- [ ] Review the report for `high` or `critical` findings.
- [ ] Review the report for prompt injection, secret exfiltration, privilege escalation, supply-chain risk, dangerous shell execution, credential access, memory poisoning, and MCP tool poisoning.
- [ ] Block the install if the report is missing, unreadable, or unclear.
- [ ] Record `install-risk-decision.md` in `sandbox/runs/<timestamp>/`.
- [ ] Use owner override only if the decision file explicitly records scope, accepted risk, rollback path, and evidence path.
- [ ] Install only after the gate passes or the owner override is documented.

## Minimum Evidence

- `skillspector-report.json`
- `install-risk-decision.md`

## Stop Rule

If you cannot answer what exact target is being installed, stop and block the install.
