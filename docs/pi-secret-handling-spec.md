# Pi Secret Handling Spec

## Class
derived / docs-only / secret-handling specification

## Status
proposed — not implemented

## Use rule
Dieses Dokument beschreibt Secret-Handling-Regeln für Pi-Sessions.
Es aktiviert keine Runtime, startet keine Pi-Session und erzeugt keine Provider-Integration.
Canonical authority für Secret-Klassen und Boundary-Regeln bleibt:
- `docs/secret-handling.md` (Canonical Charter)
- `policies/secret-classes.yaml` (Class A/B/C/P Definitionen)
- `docs/pi-execution-surface-policy.md` (Approval-Tiers für Pi-Sessions)
- `docs/pi-local-runtime-evidence.md` (Evidence-Basis, commit `c14bc52`)

Lies dieses Dokument vor jeder Pi-Session, die Provider-Keys benötigt.

## Purpose

Pi (`@earendil-works/pi-coding-agent@0.79.9`) ist eine lokale Execution Surface / CLI-Agent-Runner. Pi nutzt LLM-Provider wie Anthropic, MiniMax, OpenAI-Codex und Google als Backends und benötigt dafür Provider-API-Keys.

Diese Keys sind per `policies/secret-classes.yaml`:
- **Class A** (raw-credential) oder **Class B** (runtime-secret)
- `raw_model_visibility: forbidden`
- `memory_persistence: forbidden`
- `trace_redaction: required`

Das bedeutet: API-Keys dürfen Pi-Sessions nie als Klartext im Prompt, in Logs, in Evidence-Reports oder in Git-Artefakten erscheinen.

Dieser Slice schließt Blocker **P-05** aus `docs/pi-execution-surface-policy.md` konzeptionell. Er erzwingt noch nichts maschinell (`prose-governed`, kein Validator).

## Secret Boundary

```text
Verboten:
- echte .env lesen, committen oder ausgeben
- API-Keys via --api-key <value> Flag (Shell-History-Risiko)
- API-Keys in pi-Prompts oder system prompts
- API-Keys in Logs, Traces oder Evidence-Reports
- API-Keys in Git-Commits oder gestagten Diffs
- API-Keys in Evidence-Artefakten (Tier-Outputs, Run-Summaries)
- Env-Dumps via printenv, env, env | grep, echo $KEY
- Grep in echter .env
```

Per `docs/secret-handling.md` Boundary Rule 7: "If a secret boundary cannot be proven, validators and audit flows must fail closed." Für Pi-Sessions gilt dasselbe: bei Unsicherheit über den Key-Exposure-Pfad — `blocked`.

## Forbidden Pattern

```bash
# VERBOTEN — Key im CLI-Flag (landet in Shell-History)
pi --api-key sk-ant-...
pi --provider minimax --api-key <key>

# VERBOTEN — Key in Prompt oder System-Prompt
pi --system-prompt "Use API key sk-ant-..."
pi --print "My key is $ANTHROPIC_API_KEY"

# VERBOTEN — Key in Log/Echo
echo $ANTHROPIC_API_KEY
printenv | grep KEY
env
cat .env
grep API_KEY .env

# VERBOTEN — Key in Evidence oder Output
# Evidence-Reports dürfen keine Key-Werte enthalten, auch keine partiellen
```

## Allowed Pattern

Keys ausschließlich via Shell-Environment — niemals als Flag-Wert:

```bash
# Schritt 1: .env laden ohne Ausgabe (setzt Vars im aktuellen Shell-Kontext)
# .env liegt außerhalb des Git-Index (.gitignore), kein Commit, kein Lesen durch Agenten
set -a
source .env
set +a

# Schritt 2: Pi aufrufen — Key kommt aus env, nicht aus dem CLI-Argument
pi --provider anthropic --model claude-sonnet-4-6 --no-tools --print "..."

# Pi liest den Key selbst aus der Umgebung (ANTHROPIC_API_KEY),
# der Wert erscheint nicht im Befehl, nicht in Shell-History-Wert, nicht in Logs.
```

**Wichtig:** Dieses Pattern ist Beispiel/Vorlage — nicht ausführen ohne Approval per `docs/pi-execution-surface-policy.md`. Eine Pi-Session mit `--print` ohne Tools ist Tier 0 (`read_only`) — trotzdem gilt die Secret-Boundary.

Alternativ, falls `.env` nicht gewünscht, direkte Env-Var-Zuweisung im aktuellen Shell-Subprozess:

```bash
# Nur für einmalige, kurzlebige Sessions — Key bleibt im Subshell-Scope
ANTHROPIC_API_KEY="$(cat /path/to/secure/keyfile)" pi --provider anthropic --no-tools --print "..."
# WARNUNG: /path/to/secure/keyfile darf nicht im Git-Index liegen
```

## Proposed Env Vars

Abgeleitet aus `pi --list-models` (beobachtete Provider), `providers/minimax/README.md` (Auth-Schema) und Standard-Konventionen. Keine echten Werte dokumentiert.

| Provider | Proposed Env Var | Confidence | Notes |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | high — explizit in Pi-Help gelistet | Class A; alternativ `ANTHROPIC_OAUTH_TOKEN` für Claude-Subscription-OAuth |
| `openai-codex` (Subscription) | keine Env Var — `~/.pi/agent/auth.json` | high — Pi.dev-Doku bestätigt: ChatGPT Plus/Pro läuft via `/login`, Token in auth.json | **kein Secret in `.env`** — Login-Flow via `pi` CLI; `--api-key` verboten |
| `openai` (API-Key) | `OPENAI_API_KEY` | high — Pi.dev-Doku bestätigt als separater Provider | Class A/B; **nicht identisch** mit openai-codex-Subscription |
| `minimax` | `MINIMAX_API_KEY` | **high — Pi.dev-Doku offiziell bestätigt** | Class B; optional `MINIMAX_CN_API_KEY` für CN-Region; kein MINIMAX_GROUP_ID nötig für Pi |
| `google` | `GEMINI_API_KEY` | excluded — nicht in `pi --list-models` | Korrekte Env-Var laut Pi.dev wäre `GEMINI_API_KEY` (nicht `GOOGLE_API_KEY`); excluded bis Provider in Pi aktiv |

Status-Legende:
- `high`: aus direkter Beobachtung oder Repo-Evidence abgeleitet — wahrscheinlich korrekt
- `medium`: aus Konvention abgeleitet — vor Nutzung verifizieren
- `low`: spekulativ — **nicht verwenden** ohne Verifikation gegen `pi --help` oder Pi-Docs

## MiniMax Auth

Pi.dev-Doku bestätigt offiziell: `MINIMAX_API_KEY` ist der korrekte Env-Var-Name für Pi-MiniMax-Auth.
Optional: `MINIMAX_CN_API_KEY` für CN-Region-Nutzer.

`MM-GroupId` ist ein HTTP-Header, den der Provider-Adapter (`providers/minimax/adapter.mjs`) selbst setzt — Pi nutzt `MINIMAX_API_KEY` direkt, kein separates `MINIMAX_GROUP_ID` in Pi-Env nötig.

Früherer Vermerk "nicht belegt in Pi-Help" ist überholt — Pi.dev-Doku ist autoritativer als Pi-Help-Output.

## .env.example Status

Im aktuellen Workspace existiert kein Root-Level `.env.example`. Das einzige `.env.example` liegt in `templates/discord-fetch-mcp/.env.example` — ein Template für einen spezifischen MCP-Server, kein allgemeines Workspace-Pattern.

**Entscheidung dieses Slice:** Kein neues Root-`.env.example` anlegen. Begründung:

- Pi ist noch nicht integriert (Option C per Preconditions Audit — kein `runtime/surfaces/pi/`, kein Code)
- Ein Root-`.env.example` würde eine Integration suggerieren, die noch nicht stattgefunden hat
- Zielort für ein Pi-spezifisches Template wäre nach Architekturentscheidung entweder `templates/pi-session/.env.example` oder `runtime/surfaces/pi/.env.example` — beides noch nicht entschieden (P-12 offen)

→ `.env.example`-Template ist Next Gate (siehe unten).

## .gitignore Requirement

Bevor irgendeine Pi-Session mit echten Keys startet, muss sichergestellt sein, dass `.env` im `.gitignore` des Workspace steht. Dies ist nicht Aufgabe dieses Slices zu implementieren — aber es ist eine Voraussetzung (P-05 ist erst vollständig geschlossen, wenn dies verifiziert ist).

Check (read-only, kein Secret-Leak):

```bash
grep -n "\.env" .gitignore 2>/dev/null || echo "WARNING: .env not in .gitignore"
```

## Relation To Approval Policy

- Secret-Loading via `source .env` ist keine Approval-Freigabe für die Pi-Session.
- Approval richtet sich nach `docs/pi-execution-surface-policy.md` (Tier 0–4).
- Sensitive Provider/Auth-Konfigurationsänderungen (z. B. Provider-Key-Rotation, neue Auth-Endpoints) sind mindestens Tier 3 (`sensitive_action`).
- Secret-Leak-Risiko → fail-closed: bei Unsicherheit stoppt Pi mit `blocked`.
- Eine Pi-Session darf nicht gestartet werden, wenn der Key-Exposure-Pfad nicht sicher ist.

## Relation To Evidence

Evidence-Reports (Tier-Outputs, Run-Summaries, Logs) nach Pi-Sessions:

**Erlaubt in Evidence:**
- Provider-Name (z. B. `anthropic`)
- Modell-Name (z. B. `claude-sonnet-4-6`)
- Command-Shape ohne Key-Werte (z. B. `pi --provider anthropic --model claude-sonnet-4-6 --no-tools`)
- Exit-Code
- Redacted Config Path (z. B. `[env: ANTHROPIC_API_KEY loaded]`)
- Policy-Entscheidung (z. B. `Tier 0 — read_only, no approval required`)

**Verboten in Evidence:**
- API-Key-Werte (vollständig oder partiell)
- Token-Werte
- Vollständige Env-Dumps (`env`, `printenv`)
- Shell-History-Auszüge
- Private `.env`-Datei-Inhalte
- Interne Pi-Session-Objekte mit Key-Feldern

Per `docs/secret-handling.md`: "Traces are operational evidence, not a sink for secrets."

## Relation To Secret Classes

| Pi-Kontext | Secret-Klasse | Handling |
|---|---|---|
| Provider-API-Keys (Anthropic, MiniMax, OpenAI, Google) | Class A oder B | `raw_model_visibility: forbidden`, `memory_persistence: forbidden`, `trace_redaction: required` |
| MiniMax Group ID | Class B | wie API-Keys |
| Pi-Session-ID / Run-ID | Class P (öffentliche Referenz) | safe für Evidence |
| Provider-Name, Modell-Name | Class P | safe für Evidence |
| Command-Shape ohne Key-Werte | Class P | safe für Evidence |

## Non-Goals

- keine Runtime-Aktivierung
- kein Pi-Smoke-Test
- kein Provider-Code
- kein `providers/pi/`
- kein `runtime/surfaces/pi/`
- keine echten Secrets
- keine `.env`-Datei lesen oder ausgeben
- keine Contract-Änderung
- keine Validatoren
- kein Root-`.env.example` in diesem Slice

## Preconditions Audit Reference

Schließt konzeptionell: **P-05** (Secret-Handling für Pi-Sessions ohne Secret-Leak) aus dem Pi Execution Surface Integration Preconditions Audit.

Vollständige P-05-Schließung erfordert noch:
- Verifikation dass `.env` im `.gitignore` steht
- `.env.example`-Template mit leeren Platzhaltern (Next Gate, nach P-04/P-01)
- Env-Var-Namen sind jetzt durch Pi.dev-Doku verifiziert (Update 2026-06-23)

Noch offen nach diesem Slice:
- P-01 Workspace-Reproduzierbarkeit (`package.json`)
- P-03 Sicherer Smoke-Befehl ohne Secrets
- P-12 Architekturentscheidung `runtime/surfaces/pi/` vs. Extension Host

## Recommended Next Gate

**`.env.example` Pi Template Slice** — nach Architekturentscheidung (P-12):

Ziel:
1. Verifikation: `.env` steht im `.gitignore`
2. Anlegen von `templates/pi-session/.env.example` (oder passendem Pfad nach P-12-Entscheidung) mit leeren Platzhaltern:
   ```bash
   # Pi execution surface provider keys — examples only, no real values
   # anthropic: API-Key (or use ANTHROPIC_OAUTH_TOKEN for Claude subscription OAuth)
   ANTHROPIC_API_KEY=
   # minimax: officially confirmed by Pi.dev docs
   MINIMAX_API_KEY=
   # minimax CN region (optional)
   # MINIMAX_CN_API_KEY=
   # openai API-Key provider (NOT for openai-codex subscription — that uses auth.json)
   OPENAI_API_KEY=
   # openai-codex subscription: no env var needed — login via: pi (then /login)
   # google (GEMINI_API_KEY): excluded — provider not active in pi --list-models
   # GEMINI_API_KEY=
   ```
3. `openai-codex` Subscription-Auth läuft via `pi` CLI Login-Flow — kein Env-Var-Eintrag nötig
4. Kein echter Wert, kein Commit echter `.env`
