# Pi Tier-1 Draft Session Design

## Class

derived / docs-only / tier-1 draft-session design

## Status

proposed — no runtime execution

## Purpose

Definiere die erste Pi-kompatible Tier-1 Draft Session als kontrollierten Work Contract.
Diese Session darf nur Draft-Artefakte vorbereiten und keine kanonischen Runtime-/Skill-/Vault-Dateien verändern.

## Decision

```text
Decision: first Pi Tier-1 session will be a draft-only docs proposal skill.
No execution is approved in this slice.
```

## Skill Contract

```yaml
id: pi-tier1-docs-draft-proposal
name: Pi Tier-1 Docs Draft Proposal
purpose: Prepare a bounded draft proposal for a future Baum-OS / Pi workflow without modifying canonical runtime files.
allowed_agents:
  - cowork
  - claude
  - pi
allowed_models:
  - minimax/MiniMax-M3
allowed_tools:
  - read_only_shell
  - draft_file_write
write_mode: draft_only
approval_tier: Tier 1
allowed_paths:
  - ./sandbox
  - ./drafts
  - ./docs/proposals
forbidden_paths:
  - .env
  - .env.*
  - ~/.ssh
  - ~/.config
  - secrets/
  - credentials/
  - private/
  - browser profiles
network_mode: NET_0
vault_mode: draft_outside_vault
secret_boundary: no secrets, no env files, no auth files, no browser profiles, no provider account details
evidence_contract: required
verification: diff/report only, no canonical file mutation
abort_conditions:
  - unexpected dirty tree outside classified handover artifact
  - canonical file write requested
  - vault write requested
  - secret file requested
  - tool outside allowlist
  - network requested
  - provider/model unavailable
  - runtime mismatch
handoff_format: standard Baum-OS handoff
```

## Intended Draft Output

Die spätere Tier-1 Session darf nur erzeugen:

```text
./drafts/pi-tier1-docs-draft-proposal.md
```

oder:

```text
./docs/proposals/pi-tier1-docs-draft-proposal.md
```

Nicht in diesem Slice erstellen.

## Required Evidence For Future Execution

Eine spätere Ausführung muss berichten:

```text
Result
Host / Scope
Skill Contract ID
Provider / Model
Commands
Files Read
Files Changed
Evidence
Validation
Risks / Gaps
Next Gate
```

## Approval Boundary

Tier-1 erlaubt Draft-Erstellung, aber keine kanonische Änderung.
Nicht erlaubt:

```text
runtime/surfaces/pi/*
docs/*.md außer explizit freigegebene proposal files
Vault writes
Skill registry updates
Validator creation
Provider changes
```

## Relation To Vault Boundary

Vault bleibt:

```text
read-only by default
draft_outside_vault for this Tier-1 session
```

Canonical authority: `docs/vault-memory-bridge-boundary-decision.md` (commit `bd4ff8c`)

## Relation To Runtime Surface

Diese Session nutzt die Pi Runtime Surface nur als Policy-Referenz.
Sie aktiviert keine Runtime.

Canonical authority: `runtime/surfaces/pi/session-policy.md` (commit `880a3d4`)

## Non-Goals

- keine Pi-Ausführung
- kein Smoke
- kein Runtime-Code
- kein Validator
- kein Skill-Registry-Eintrag
- keine Vault-Integration
- keine Canonical-Docs-Änderung außerhalb dieser Design-Datei

## Recommended Next Gates

1. `Pi Tier-1 Draft Session Design Acceptance`
2. `Sandbox Runs Evidence Directory Bootstrap`
3. `Pi Tier-1 Draft Session Manual Execution Gate`
