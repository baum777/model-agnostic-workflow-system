---
name: baum-security-audit-report
description: Run a report-only security audit planning and recon workflow. Manual-only — only run when explicitly invoked.
disable-model-invocation: true
---

# Baum-Security-Audit-Report

Report and plan only. Do not touch production, read secrets, or run dynamic tests without explicit approval.

## Manual-Only

Only run when explicitly invoked. Do not trigger automatically.

## Hard Boundaries

- Do not edit app or runtime code.
- Do not install tools without approval.
- Do not read secrets, `.env` files, or credential stores.
- Do not run dynamic tests against production or staging.
- Do not create or update audit docs unless explicitly allowed.
- If a tool is unavailable, record the blocker — do not invent findings.
- Report high-confidence risks only. Do not pad with speculative issues.

## Structural Scan

Before assessing risks, identify:

- **Stack** — language, runtime, frameworks
- **Package manager** — lockfile present?
- **Deploy target** — cloud, on-prem, edge, Pi/embedded
- **Auth/session surfaces** — login, tokens, cookies, API keys
- **Env/config surfaces** — where config is stored and loaded
- **Database/persistence** — type, ORM, connection handling
- **External integrations** — third-party APIs, webhooks, SDKs
- **Generated/cache/vendor paths** — exclude from manual audit scope

## Tool Recommendations

Recommend local, open-source, repo-relevant tools only. Examples:

- Static analysis: `semgrep`, `bandit` (Python), `eslint-plugin-security` (JS), `cargo audit` (Rust)
- Dependency audit: `npm audit`, `pip-audit`, `cargo audit`
- Secret scanning: `trufflehog`, `gitleaks`
- SAST: `codeql` (if available locally)

If a tool is not installed or not applicable, say so explicitly.

## Required Output

```
Audit scope:
  [what was reviewed, what was excluded]

Structural scan:
  Stack:
  Package manager:
  Deploy target:
  Auth/session surfaces:
  Env/config surfaces:
  Database/persistence:
  External integrations:
  Excluded paths:

Security-relevant surfaces:
  [list surfaces worth auditing, with notes]

Tool recommendations:
  | Tool | Purpose | Available? |
  |------|---------|------------|

Blockers:
  [tools not available, files inaccessible, approvals needed]

Risk register:
  | Risk | Surface | Confidence | Severity | Mitigation |
  |------|---------|------------|----------|------------|

Next audit gate:
  [what to approve, run, or review next]
```
