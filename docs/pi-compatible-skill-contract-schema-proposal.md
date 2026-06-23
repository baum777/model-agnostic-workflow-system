# Pi-Compatible Skill Contract Schema Proposal

## Class

derived / docs-only / skill-contract schema proposal

## Status

proposed — no validator, no runtime implementation

## Purpose

Pi-kompatible Skills müssen Work Contracts sein. Ein Skill darf nicht nur aus Prompt-Text
bestehen. Ohne explizite Grenzen erbt ein Pi-runnable Skill alle Rechte der laufenden
Pi-Session — einschließlich Schreibzugriff auf Repo-Dateien, Shell-Ausführung und
potenziell Secret-Exposition.

**Jeder Pi-runnable Skill muss deklarieren:**
- Welche Agents ihn ausführen dürfen
- Welche Modelle erlaubt sind
- Welche Tools aktiviert sind
- Welchen Write-Mode er hat
- Welchen Approval-Tier er braucht
- Welche Pfade er lesen und schreiben darf
- Welche Pfade absolut verboten sind
- Welchen Netzwerk- und Vault-Modus er verwendet
- Welche Evidence er liefern muss
- Unter welchen Bedingungen er abbricht
- In welchem Format er den Handoff liefert

Das Schema ist zunächst docs-only und wird erst nach wiederholter, stabiler Nutzung
als Validator-Kandidat betrachtet. Keine Implementierung in diesem Slice.

## Core Principle

```text
A skill is runnable by Pi only if its execution boundary is explicit.
No implicit tools.
No implicit writes.
No implicit network.
No implicit memory promotion.
```

## Proposed Fields

| Field | Required | Purpose | Example |
|-------|----------|---------|---------|
| `id` | yes | eindeutiger Skill-Identifier | `repo-readonly-audit` |
| `name` | yes | lesbarer Name | `Repo Read-only Audit` |
| `purpose` | yes | Ziel und Scope des Skills | `Inspect repo structure…` |
| `allowed_agents` | yes | welche Agents dürfen den Skill ausführen | `[cowork, claude, pi]` |
| `allowed_models` | yes | erlaubte Provider/Model-Kombis | `minimax/MiniMax-M3` |
| `allowed_tools` | yes | Tool-Klassen; keine Wildcard | `[read_only_shell]` |
| `write_mode` | yes | schreibendes Verhalten | `read_only` |
| `approval_tier` | yes | erforderlicher Approval-Tier (0–4) | `Tier 0` |
| `allowed_paths` | yes | explizite Lese-/Schreibpfade | `./docs`, `./src` |
| `forbidden_paths` | yes | absolut verbotene Pfade | `.env`, `~/.ssh` |
| `network_mode` | yes | Netzwerkzugang | `NET_0` |
| `vault_mode` | yes | Vault-Zugangsstufe | `read_only` |
| `secret_boundary` | yes | was nie exponiert werden darf | `no secrets, no env files` |
| `evidence_contract` | yes | Evidence-Pflicht: required / partial / none | `required` |
| `verification` | yes | was nach Ausführung geprüft wird | `report-only, no mutation` |
| `abort_conditions` | yes | Bedingungen für sofortigen Abbruch | `secret file requested` |
| `handoff_format` | yes | Format für Übergabe | `standard Baum-OS handoff` |

Vollständige YAML-Struktur:

```yaml
id:
name:
purpose:
allowed_agents:
allowed_models:
allowed_tools:
write_mode:
approval_tier:
allowed_paths:
forbidden_paths:
network_mode:
vault_mode:
secret_boundary:
evidence_contract:
verification:
abort_conditions:
handoff_format:
```

## Allowed Agents

Erlaubte Werte:

```text
cowork
claude
codex
pi
human
```

Regel:

```text
If `pi` is not listed in allowed_agents, Pi must not run the skill.
```

## Allowed Models

Format:

```text
provider/model
```

Beispiele:

```text
minimax/MiniMax-M3
openai-codex/gpt-5.4-mini
openai-codex/gpt-5.5
anthropic/<approved-model>
```

Regel:

```text
If no approved provider/model is listed, the skill is not runnable.
```

## Allowed Tools

Tool-Klassen (geordnet nach Risiko):

```text
none                  — kein Tool, nur --print
read_only_shell       — pwd, ls, find, cat, grep, git status, git diff, git log
safe_validation       — npm test, npm run typecheck, npm run lint, pytest
git_limited           — git diff, git status, git checkout -b sandbox/*, git worktree add
draft_file_write      — Schreiben in ./sandbox und ./drafts ausschließlich
approved_repo_write   — Schreiben in explizit freigegebene Repo-Dateien (Tier 2+)
browser_read          — read-only Web-Recherche (NET_1)
mcp_read              — read-only MCP-Tool-Calls
```

Verboten by default (explizite Freigabe nötig):

```text
bash_mutating         — mutierende Shell-Befehle (rm, mv, mkdir außerhalb sandbox)
edit                  — Dateien im Repo editieren
write                 — Dateien im Repo erstellen/überschreiben
deploy                — Vercel, Supabase, npm publish
git_push              — git push, git push --force
secret_read           — .env lesen, printenv, auth-Dateien lesen
vault_write           — Obsidian/Vault schreiben
external_api_write    — produktive API-Mutation (NET_3)
```

## Write Mode

Erlaubte Werte:

```text
read_only        — kein Schreiben, kein Commit
draft_only       — Schreiben nur in ./sandbox oder ./drafts; kein Commit
approved_write   — Schreiben in explizit genehmigte Pfade; Commit nach Approval
sensitive_action — externe Systeme, Live-Services, Computer-Use
forbidden        — Skill darf nicht ausgeführt werden
```

## Approval Tier

```text
Tier 0 = read_only / no-tools / no mutation
         version, help, list-models, --no-tools smoke, read-only audit
Tier 1 = draft_only
         Proposals, Working-Plans, Skeleton-Dateien in sandbox/
Tier 2 = approved_write
         edit/write/mutating bash mit expliziter Owner-Freigabe
Tier 3 = sensitive_action
         externe Systeme, Live-Services, Computer-Use
Tier 4 = forbidden_or_blocked
         Secrets, open-ended Sessions, unklare Tools — nie ausführen
```

Canonical authority: `docs/pi-execution-surface-policy.md`

## Path Boundary

Muss in jedem Skill enthalten sein:

```yaml
allowed_paths:
  - (explizite Liste je nach Skill)

forbidden_paths:
  - .env
  - .env.*
  - ~/.ssh
  - ~/.config
  - secrets/
  - credentials/
  - private/
  - browser profiles
  - Obsidian/Vault       # write — read benötigt separate Freigabe
```

Regel: Pfade, die nicht explizit in `allowed_paths` stehen, gelten als verboten.

## Network Mode

```text
NET_0   — kein Netzwerk (default)
NET_1   — Web-Recherche / Docs lesen (read-only HTTP/S)
NET_2   — APIs mit Test-Keys
NET_3   — Live-APIs / Deploy / Payments / GitHub Write (immer S4, manuell)
```

Default:

```text
NET_0
```

Jede Erhöhung über NET_0 erfordert explizite Freigabe im Skill-Contract.

## Vault Mode

```text
none                  — kein Vault-Zugriff
read_only             — Vault-Kontext lesen, nicht schreiben (default)
draft_outside_vault   — Entwürfe außerhalb des Vaults (in ./drafts oder ./sandbox)
approved_write_slice  — Vault-Write nur in dediziertem Owner-scoped Write-Slice
```

Default:

```text
read_only
```

Regel:

```text
Vault write is never implicit.
```

Canonical authority: `docs/vault-memory-bridge-boundary-decision.md`

## Secret Boundary

Muss klar verbieten:

```text
API keys
tokens
.env contents
auth files
shell history
browser profiles
provider account details
private credentials
```

Jeder Pi-Run muss `secrets_in_command: none` und `secrets_in_output: none` liefern.
Canonical authority: `docs/pi-secret-handling-spec.md`

## Evidence Contract

Jede Skill-Ausführung muss mindestens liefern:

```text
Result          — pass | rework | blocked
Host / Scope    — Host, Repo, Surface, Task Class, Risk
Commands        — ausgeführte Befehle ohne Secrets
Files Read      — gelesene Dateien
Files Changed   — geänderte Dateien, falls vorhanden
Evidence        — Evidence-Pfad oder Zusammenfassung
Validation      — Checks und Ergebnis
Risks / Gaps    — nur echte offene Punkte
Next Gate       — konkreter nächster Slice
```

Format: `runtime/surfaces/pi/handoff.md`

## Abort Conditions

Jeder Skill muss mindestens diese Abort-Bedingungen deklarieren:

```text
unexpected dirty tree                      — Worktree enthält nicht erwartete Änderungen
missing approval                           — Approval für Tier 2+ nicht vorhanden
secret exposure risk                       — Secret könnte in Command oder Output erscheinen
requested path outside scope               — Pfad nicht in allowed_paths
tool outside allowlist                     — Tool nicht in allowed_tools
provider/model unavailable                 — Provider-Quota oder Connectivity-Problem
runtime mismatch                           — Pi-Version oder Host-Umgebung nicht verifiziert
vault write requested without write slice  — Vault-Write ohne dedizierten Write-Slice
```

Fail-closed-Regel: bei Unklarheit → Abbruch mit `blocked` und Nennung des fehlenden Elements.

## Example: Read-only Repo Audit Skill

Tier-0 Skill — kein Approval nötig:

```yaml
id: repo-readonly-audit
name: Repo Read-only Audit
purpose: Inspect repo structure and produce a bounded audit report.
allowed_agents: [cowork, claude, pi]
allowed_models:
  - minimax/MiniMax-M3
allowed_tools: [read_only_shell]
write_mode: read_only
approval_tier: Tier 0
allowed_paths:
  - ./README.md
  - ./AGENTS.md
  - ./docs
  - ./src
  - ./tests
forbidden_paths:
  - .env
  - .env.*
  - ~/.ssh
  - ~/.config
  - secrets/
  - credentials/
network_mode: NET_0
vault_mode: read_only
secret_boundary: no secrets, no env files, no auth files
evidence_contract: required
verification: report-only, no mutation
abort_conditions:
  - secret file requested
  - write requested
  - tool outside allowlist
handoff_format: standard Baum-OS handoff
```

## Example: Tier-1 Draft Skill

Draft-Skill — Owner-Scope für Zieldatei nötig, kein Commit ohne Review:

```yaml
id: docs-draft-proposal
name: Docs Draft Proposal
purpose: Prepare a proposal document without modifying canonical runtime files.
allowed_agents: [cowork, claude, pi]
allowed_models:
  - minimax/MiniMax-M3
allowed_tools: [read_only_shell, draft_file_write]
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
network_mode: NET_0
vault_mode: draft_outside_vault
secret_boundary: no secrets
evidence_contract: required
verification: diff/report only
abort_conditions:
  - canonical file write requested
  - vault write requested
  - secret risk
handoff_format: standard Baum-OS handoff
```

## Relation To Pi Runtime Surface

Dieses Schema leitet sich ab aus und referenziert:

- `runtime/surfaces/pi/session-policy.md` — Tier-Mapping, Forbidden-by-Default-Liste
- `runtime/surfaces/pi/evidence-contract.md` — Evidence-Pflichtfelder
- `runtime/surfaces/pi/handoff.md` — Handoff-Format

Jeder Skill, der `pi` in `allowed_agents` listet, muss mit den Tier-Grenzen aus
`runtime/surfaces/pi/session-policy.md` kompatibel sein.

## Relation To Vault Boundary

Vault-Mode-Werte dieses Schemas entsprechen direkt der Boundary aus:
`docs/vault-memory-bridge-boundary-decision.md`

```text
Vault context may be read.
Vault writes require a separate owner-scoped write slice.
```

Kein Skill darf `vault_mode: approved_write_slice` verwenden, ohne dass ein
dedizierter Vault-Write-Slice mit Owner-Approval vorhanden ist.

## Non-Goals

- kein Validator
- kein Runtime-Code
- keine Skill-Ausführung
- keine Pi-Session
- kein Provider-Adapter
- kein `providers/pi/`
- keine Änderung an bestehenden Skills
- keine Vault-Integration
- keine Implementierung der Beispiel-Skills

## Recommended Next Gates

1. **Skill Contract Schema Acceptance** — Owner bestätigt dieses Schema als verbindlichen
   Rahmen für Pi-runnable Skills; Status von `proposed` → `accepted`
2. **Pi Tier-1 Draft Session Design** — ersten echten Tier-1-Skill als Work Contract
   nach diesem Schema definieren; kein Ausführen, nur Contract-Design
3. **Sandbox Runs Evidence Directory Bootstrap** — `/sandbox/runs/`-Verzeichnis im Repo
   anlegen mit `README.md` und Template-Struktur für Evidence-Pakete
4. **Runtime Surface Consistency Link Slice** — `runtime/surfaces/pi/session-policy.md`
   und `evidence-contract.md` mit Vault-Boundary-Referenz ergänzen
