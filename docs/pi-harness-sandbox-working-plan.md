# Pi Harness Sandbox Working Plan

## Class

derived / docs-only / sandbox-policy working plan

## Status

proposed — not implemented

## Use Rule

Dieses Dokument beschreibt den Sandbox-Arbeitsplan für Pi im Baum-OS.
Es aktiviert keine Runtime, startet keine Pi-Session und erzeugt keine Implementierung.
Canonical authority für Approval-Tiers: `docs/pi-execution-surface-policy.md`.
Canonical authority für Secret-Handling: `docs/pi-secret-handling-spec.md`.
Canonical authority für Smoke-Design: `docs/pi-smoke-command-design.md`.

## Purpose

Pi (`@earendil-works/pi-coding-agent@0.79.9`) ist ein minimaler CLI-Agent-Harness mit
Tools (`read`, `bash`, `edit`, `write`, MCP). Diese Tools operieren direkt auf dem Host-Filesystem
und der Host-Shell — ohne eigene Isolations-Schicht. Das bedeutet:

- Pi erbt standardmäßig alle Rechte des ausführenden Users.
- Pi-Subagents können dieselben schreibenden und löschenden Operationen auslösen wie ein manueller Shell-User.
- Ohne explizite Grenzen hat Pi potentiell Zugriff auf `~/.ssh`, `.env`, Vault-Dateien und produktive Configs.

**Sandbox ist die Policy-Schicht zwischen Agent, Repo und Host.** Sie definiert:

- Welche Zonen Pi betreten darf (S0–S4)
- Welche Filesystem-, Shell- und Netzwerkoperationen erlaubt sind
- Welche Evidence jede Ausführung liefern muss
- Wann und wie Promotion zwischen Zonen stattfinden darf

**Kernprinzipien:**

1. Pi darf nicht automatisch dieselben Rechte haben wie der normale User.
2. Subagent-Rechte dürfen nie größer sein als Parent-Rechte.
3. Keine Promotion ohne explizite Owner-Freigabe.
4. Jede Ausführung muss Evidence erzeugen — kein Run ohne Audit-Trail.
5. Human Approval bleibt letzte Instanz; keine Self-Approval durch Pi.
6. Vault ist read-only by default; Vault-Writes immer blockiert bis explizit freigegeben.

## Zone Model

| Zone | Zweck | Rechte | Typische Aufgaben | Promotion-Bedingung |
|------|-------|--------|-------------------|---------------------|
| **S0** Read-only Audit | Verstehen, dokumentieren, prüfen | Lesen des Repos; kein Schreiben, kein Netz | Docs lesen, `git diff`, `git log`, `pi --list-models` (read-only), Struktur analysieren | Explizite Owner-Freigabe für Draft-Scope |
| **S1** Draft Sandbox | Entwürfe erstellen, Pläne formulieren | Schreiben in `./sandbox` und `./drafts`; kein Commit, kein Deploy | Doc-Entwürfe, Working-Plans, Proposals, Skeleton-Dateien in sandbox/ | Target-Dateien und Schreibpfad explizit approved |
| **S2** Repo Worktree | Implementierung in isoliertem Branch | Schreiben in explizit freigegebene Projektdateien; `git checkout -b sandbox/*`; kein Push | Code-Änderungen, Testdateien, Doc-Korrekturen in genehmigten Pfaden | Validation-Command approved; kein direkter merge in main |
| **S3** Host Execution | Ausführung auf persistentem Owner-Host | Tier-0–2 Shell-Befehle per Allowlist; Smoke-Runs; Tests | Pi-Smoke, `npm test`, `npm run typecheck`, begrenzte `git commit` | Manuelle Owner-Approval; nur auf baum-Latitude-3440 |
| **S4** External / Live | Produktive Dienste, Deploy, API-Mutation | Ausschließlich manuell; keine Automatisierung | `git push`, Vercel-Deploy, Supabase-Migration, produktive API-Calls | Immer manuelle Owner-Freigabe; nie automatisch |

**Pflichtentscheidungen:**

```text
Default Zone:       S0 Read-only Audit
Default Write Mode: blocked unless explicitly scoped
Default Network:    NET_0 (kein Netzwerk)
Default Vault Mode: read-only
```

## Filesystem Boundary

### ALLOW_READ

```text
./repo
./docs
./package.json
./src
./tests
./README.md
./AGENTS.md
./CLAUDE.md
./WORKFLOW.md
./core/contracts/  (read-only)
```

### ALLOW_WRITE

```text
./sandbox/
./drafts/
./docs/              (nur explizit freigegebene neue Dateien oder Korrekturen)
./tests/             (nur nach S2-Approval)
explizit freigegebene Projektdateien im Scope des aktuellen Slices
```

### DENY_ALWAYS

```text
~/.ssh
~/.config
~/.env
.env
.env.*
.env.local
secrets/
credentials/
private/
Obsidian/Vault         — write access denied by default
~/.pi/agent/auth.json  — read and write denied
browser profiles
production configs
/etc/
/usr/
/root/
core/contracts/        — write denied; nur read erlaubt
```

```text
Vault write access is denied by default.
Secrets and browser profiles are always denied.
Pi must never read, display, or interpolate key values from any of these paths.
```

## Shell Command Boundary

### Read-only Commands (S0, kein Approval nötig)

```text
pwd
ls
find
cat        (nur auf ALLOW_READ-Pfaden)
sed        (read/filter, kein in-place)
grep
git status
git diff
git log --oneline
git diff --name-only
git diff --cached
which
pi --version
pi --list-models
pi --help
```

### Safe Validation Commands (S2–S3, Approval per Scope)

```text
npm test
npm run typecheck
npm run lint
npm run build
pnpm test
pytest
node scripts/validate-*.js
git diff --stat
```

### Limited Git Commands (S2, expliziter Branch-Scope)

```text
git diff
git status
git checkout -b sandbox/*
git worktree add ./worktrees/*
git add <explicit-file>    (nie git add . oder git add -A)
git commit -m "..."        (nur nach Staged-Check: git diff --cached --name-only)
```

### Denied Without Explicit Approval (Tier 3 oder S4)

```text
rm -rf
sudo
chmod / chown
curl | sh
wget | sh
docker socket access
ssh
scp
git push
git push --force
npm publish
vercel deploy
supabase db push
live migrations
npx (außer explizit freigegeben)
npm install (außer explizit freigegeben)
printenv
env
cat .env
cat ~/.ssh/*
```

```text
Any command outside the allowlist requires explicit approval.
Zweifelhafte Befehle werden als Tier 3 behandelt (fail closed).
```

## Network Boundary

| Level | Name | Erlaubt | Typischer Einsatz |
|-------|------|---------|-------------------|
| **NET_0** | kein Netzwerk | nichts | S0-Audit, S1-Draft, lokale Validation |
| **NET_1** | Web-Recherche / Docs | read-only HTTP(S), keine Auth | Dokumentation lesen, Pi.dev-Referenz, öffentliche APIs lesen |
| **NET_2** | APIs mit Test-Keys | HTTP(S) mit Test-Credentials | Smoke-Runs, Test-API-Calls, Sandbox-Validierung |
| **NET_3** | Live-APIs / Deploy | volle Netzwerkrechte | `git push`, Deploy, Payments, GitHub Write — immer S4 |

```text
Network is off by default (NET_0).
Web research requires approval (NET_1).
API calls use test keys only unless explicitly elevated (NET_2).
Production/API mutation is S4 and manually gated (NET_3).
Production calls are forbidden in S0–S2.
```

## Subagent Boundary

**Parent-Agent (Pi-Session-Owner):**
- Darf planen, synthetisieren und Subagents beauftragen.
- Darf Schreiboperationen vorschlagen (Draft), aber nicht autonom ausführen ohne Approval.
- Entscheidet über Zone-Promotion-Requests.

**Subagents (von Pi gestartete Unter-Agenten):**

```text
Subagents:
- read-only by default (S0)
- kein direkter Commit
- kein Deploy
- kein Secret-Zugriff (kein Lesen von .env, auth.json, ~/.ssh)
- kein eigenständiges Installieren (kein npm install, kein npx)
- kein externer API-Write (NET_3 immer blockiert)
- kein selbständiges git push
- kein Wechsel zu höherer Zone ohne explizite Parent-Freigabe
```

**Invariante:** Subagent-Rechte dürfen nie größer sein als Parent-Rechte. Ein Subagent kann
keine Promotion erzwingen, die dem Parent nicht erlaubt wäre.

## Evidence Contract

Jede Ausführung in S2–S4 muss ein vollständiges Evidence-Paket erzeugen:

```text
/sandbox/runs/<timestamp>/
  intent.md         — Aufgabe, Scope, Zone, erwartetes Ergebnis
  files-read.md     — alle gelesenen Dateien (Pfad + Zweck)
  files-changed.md  — alle geänderten Dateien (Pfad + Art der Änderung)
  commands-run.md   — jeder ausgeführte Shell-Befehl (kein Secret-Wert)
  diff.patch        — git diff aller Änderungen
  validation.md     — Ergebnis der Validation-Commands
  risks.md          — identifizierte Risiken, offene Fragen
  next-gate.md      — konkrete nächste Freigabe-Anforderung
```

**Pflicht-Regeln für Evidence:**

```text
No run is complete without evidence.
Evidence darf keine Secret-Werte enthalten (kein Key, kein Token, kein Passwort).
commands-run.md zeigt Command-Shape, nie Key-Werte (MINIMAX_API_KEY=<REDACTED>).
Evidence wird vor Commit erzeugt, nicht danach.
```

Smoke-spezifische Evidence (bereits definiert in `docs/pi-smoke-command-design.md`):

```text
command:           (Command-Shape ohne Secrets)
provider:
model:
exit_code:
observed_output:
marker_found:      true | false
approval_tier:
host:
session:           ephemeral (--no-session)
secrets_in_command: none
secrets_in_output:  none
.env_read:         yes | no
```

## Promotion Rules

Promotion zwischen Zonen ist explizit und nie automatisch:

```text
S0 → S1: Draft scope approved
          — Owner benennt explizit: Zieldatei(en), Schreibpfad, Zweck

S1 → S2: Target files approved
          — Owner bestätigt: welche Produktionsdateien im Repo geändert werden dürfen

S2 → S3: Validation command approved
          — Owner bestätigt: welche Befehle ausgeführt werden dürfen, auf welchem Host

S3 → S4: Manual owner approval only
          — Kein automatischer Pfad; Owner führt Deploy/Push/Mutation selbst aus
            oder gibt explizit frei mit vollem Scope-Statement
```

**Ablehnung und Fallback:**

```text
Jede Promotion-Anfrage, die keinen expliziten Owner-Scope hat, wird blockiert.
Fail closed: bei Unklarheit über Zone → S0.
Keine Selbst-Promotion durch Pi oder Subagents.
```

## Relation To Existing Pi Docs

| Dokument | Relation |
|----------|----------|
| `docs/pi-execution-surface-policy.md` | Tier-Mapping (Tier 0–4) für Pi-Tool-Nutzung; Approval-Regeln; Bash-Sonderregel; Was Pi nicht darf |
| `docs/pi-secret-handling-spec.md` | Secret-Boundary-Regeln; `source .env` Pattern; kein `--api-key`-Flag; Shell-History-Schutz |
| `docs/pi-smoke-command-design.md` | Tier-0-Smoke-Command-Design; Evidence-Output-Contract; Forbidden Patterns |
| `docs/pi-integration-path-decision.md` | Option C (No Integration Yet); Option A (`runtime/surfaces/pi/`) als Zukunftspfad |
| `docs/pi-execution-environment-boundary-decision.md` | Owner-Host-only für v0-Smoke; Cowork-Sandbox darf nur auditieren; Required Before Smoke Checklist |
| `docs/pi-provider-default-decision.md` | Default: minimax/MiniMax-M3 (smoke-verifiziert); Secondary: openai-codex; Anthropic co-confirmed |
| `docs/pi-smoke-run-evidence.md` | Vier Smoke-Runs; MiniMax-M2.7 und MiniMax-M3 PI_SMOKE_OK bestätigt |

## Relation To Runtime Surface

```text
runtime/surfaces/pi/ must not be created before:

1. Tier-0 Smoke passed                          ✓ (MiniMax-M3, 2026-06-24, PI_SMOKE_OK)
2. Smoke evidence documented                    ✓ (docs/pi-smoke-run-evidence.md)
3. Sandbox policy accepted                      ⏳ (dieses Dokument — pending Owner-Acceptance)
4. Runtime surface skeleton decision approved   ⏳ (eigener Slice erforderlich)
```

Dieses Dokument ist Policy-Vorstufe — es beschreibt die Grenzen, innerhalb derer
`runtime/surfaces/pi/` später betrieben werden muss. Es erstellt `runtime/surfaces/pi/` nicht.

## Relation To Vault / Memory Bridge

```text
Vault = read-only by default.

Vault writes = blocked unless explicitly approved by Owner.

Review cards / MSPR packets = draft first (S1), never automatic truth promotion.

Vault-Write erfordert:
- Explizite S1→S2-Promotion (Target-Files-Approval)
- Evidence-Paket mit files-changed.md
- Human-Review vor Merge in produktiven Vault-Branch

Obsidian/Vault write access is in DENY_ALWAYS — auch für Pi-Sessions mit Tier 2.
Vault-Bridge-Entscheidung ist eigener Gate: "Vault Memory Bridge Boundary Decision"
```

## Relation To Skills

Ein Pi-ausführbarer Skill muss alle folgenden Felder deklarieren:

```text
A Pi-runnable Skill must define:

  allowed_agents:     [liste erlaubter Agent-IDs oder Wildcard]
  allowed_models:     [liste erlaubter Provider/Model-Kombinationen]
  allowed_tools:      [read | bash | edit | write | mcp — explizit, nie wildcard]
  write_mode:         read_only | draft_only | approved_write
  approval_tier:      0 | 1 | 2 | 3 | 4
  allowed_paths:      [explizite Pfad-Allowlist]
  forbidden_paths:    [explizite DENY-Liste, mindestens .env, ~/.ssh, credentials/]
  secret_boundary:    none | env_only | vault_read_only
  evidence_contract:  path zu /sandbox/runs/<timestamp>/
  abort_conditions:   [Bedingungen, bei denen Skill mit "blocked" stoppt]
```

Bis ein formales Skill-Contract-Schema existiert, gilt die prosa-basierte Deklaration
aus `docs/pi-execution-surface-policy.md` als Governance-Rahmen.

## Non-Goals

- keine Runtime-Integration
- kein `runtime/surfaces/pi/`
- kein `providers/pi/`
- kein Smoke-Run
- keine Pi-Session
- keine Installation (`npm install`, `npx`)
- keine `.env.example`
- keine Validatoren
- keine Contracts
- keine Vault-Schreibrechte
- keine Skill-Schema-Implementierung
- keine Self-Approval-Mechanismen

## Recommended Next Gates

Empfohlene Reihenfolge:

1. **Pi Harness Sandbox Policy Acceptance** — Owner bestätigt dieses Dokument als verbindliche Policy-Vorstufe
2. **Pi Runtime Surface Skeleton Decision** — Entscheidung: `runtime/surfaces/pi/`-Skelett anlegen (eigener Slice, mit Scope + Freigabe)
3. **Vault Memory Bridge Boundary Decision** — Vault-Write-Policy für Pi-Sessions formalisieren
4. **Pi-Compatible Skill Contract Schema Proposal** — formales Schema für Pi-runnable Skills (alle Pflichtfelder)
5. **Pi Harness Evidence Directory Bootstrap** — `/sandbox/runs/`-Struktur im Repo anlegen (nach S1-Approval)
6. **openai-codex Secondary Smoke** — optional nach Quota-Reset (2026-06-25); nicht blockierend

> **Hinweis:** "Pi Tier-0 Smoke Execution Gate" und "Pi Tier-0 Smoke Evidence Doc" sind bereits
> abgeschlossen (MiniMax-M3 PI_SMOKE_OK, 2026-06-24; `docs/pi-smoke-run-evidence.md`).

## Verification

Nach Erstellung geprüft:

```bash
git diff --name-only
# → docs/pi-harness-sandbox-working-plan.md

test -d providers/pi && echo PROVIDERS_PI_EXISTS || echo PROVIDERS_PI_NOT_EXISTS
# → PROVIDERS_PI_NOT_EXISTS

test -d runtime/surfaces/pi && echo RUNTIME_SURFACE_PI_EXISTS || echo RUNTIME_SURFACE_PI_NOT_EXISTS
# → RUNTIME_SURFACE_PI_NOT_EXISTS

git status --short --untracked-files=all
# → docs/pi-harness-sandbox-working-plan.md als neue Datei

git diff --cached --name-only
# → exakt eine Datei: docs/pi-harness-sandbox-working-plan.md
```
