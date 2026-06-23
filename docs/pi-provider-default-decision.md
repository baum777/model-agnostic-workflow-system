# Pi Provider Default Decision

## Class
derived / docs-only / provider-default decision

## Status
proposed — no smoke executed

## Decision

```text
Primary provider for first Pi smoke:  anthropic
Primary model candidate:              claude-haiku-4-5
Co-confirmed provider:                openai-codex (gpt-5.4-mini) — equally valid
Fallback provider:                    minimax — after Pi-specific auth/config verification
Excluded now:                         google — not in pi --list-models
```

**Correction note (2026-06-23):** Previous version deferred anthropic due to unconfirmed
owner-availability. Corrected: both Claude subscription and OpenAI subscription are connected.
Both providers are now confirmed co-candidates. anthropic is preferred as primary because
Pi-Help confirms both ANTHROPIC_API_KEY and ANTHROPIC_OAUTH_TOKEN, Pi lists 25+ anthropic
models vs. 4 openai-codex models, and this workspace is Claude-native.

## Use Rule

Dieses Dokument entscheidet nur den Provider-/Model-Default-Kandidaten für spätere Pi-Sessions.
Es startet keine Pi-Session, lädt keine Secrets und aktiviert keine Runtime.
Canonical authority für Smoke-Design: `docs/pi-smoke-command-design.md`.
Canonical authority für Secret-Handling: `docs/pi-secret-handling-spec.md`.
Canonical authority für Approval-Tiers: `docs/pi-execution-surface-policy.md`.

## Context

- Pi ist Execution Surface / CLI-Agent-Runner (`@earendil-works/pi-coding-agent@0.79.9`)
- Pi ist kein LLM-Provider — `providers/pi/` ist Kategoriefehler
- Provider-Auswahl betrifft Pi-Sessions, nicht `providers/<name>`-Adapter-Implementierungen
- OpenAI/Codex ist laut Owner-Info per Abo/Login verfügbar
- MiniMax ist laut Owner-Info per API-Key verbunden
- Google erscheint nicht in `pi --list-models` — aktuell nicht aktiv
- Anthropic ist Pi-seitig gut dokumentiert (`ANTHROPIC_API_KEY` + `ANTHROPIC_OAUTH_TOKEN` in Pi-Help) — Claude-Subscription ist Owner-bestätigt
- Integrationspfad-Entscheidung: Option C (No Integration Yet), Zukunftspfad Option A (`runtime/surfaces/pi/`) per `docs/pi-integration-path-decision.md`

## Candidate Assessment

Beobachtet via `pi --list-models` und `pi --help` (read-only, keine Ausführung):

| Provider | Listed by Pi | Owner availability | Secret/Auth confidence | Smoke fit | Decision |
|---|---|---|---|---|---|
| `openai-codex` | yes — 4 Modelle | **Owner-bestätigt: Abo/Login** | `OPENAI_API_KEY` in Pi-Help ✓ | **best for first smoke** | **default** |
| `minimax` | yes — 3 Modelle | Owner: API-Key verbunden | Env Var nicht in Pi-Help bestätigt | fallback nach Verifikation | verify first |
| `anthropic` | yes — 25+ Modelle | **Owner-bestätigt: Claude-Subscription** | `ANTHROPIC_API_KEY` + `ANTHROPIC_OAUTH_TOKEN` in Pi-Help ✓ | **primary candidate** | **primary** |
| `google` | **nein** — keine Modelle | nicht bestätigt | nicht in Pi-Help | nein | **exclude** |

### Beobachtete `openai-codex` Modelle (aus `pi --list-models`)

| Model | Context | Max-Out | Thinking | Images |
|---|---|---|---|---|
| `gpt-5.3-codex-spark` | 128K | 128K | yes | no |
| `gpt-5.4` | 272K | 128K | yes | yes |
| `gpt-5.4-mini` | 272K | 128K | yes | yes |
| `gpt-5.5` | 272K | 128K | yes | yes |

**Empfohlener Smoke-Modell-Kandidat: `gpt-5.4-mini`**

Begründung:
- Größeres Context-Window (272K) als `gpt-5.3-codex-spark` (128K)
- Für einen Smoke-Command (`--print "Return exactly: PI_SMOKE_OK"`) ausreichend leistungsfähig
- `-mini`-Suffix deutet auf eine cost-effective Variante hin gegenüber `gpt-5.4` und `gpt-5.5`
- Thinking-Support nicht benötigt für deterministisches Smoke-Output — aber kein Nachteil
- `gpt-5.5` und `gpt-5.4` bleiben als Upgrade-Kandidaten für spätere, anspruchsvollere Pi-Sessions

## Rationale

### `openai-codex` — Co-Confirmed (gleichwertige Alternative)

- **Owner-Verfügbarkeit bestätigt**: OpenAI-Subscription ist verbunden
- **Pi-seitige Evidence**: `OPENAI_API_KEY` explizit in `pi --help` Env-Var-Liste gelistet
- **Modell-Liste verfügbar**: `pi --list-models` zeigt 4 Modelle (gpt-5.3-codex-spark, gpt-5.4, gpt-5.4-mini, gpt-5.5)
- **Co-Kandidat, nicht default**: Da beide Subscriptions bestätigt sind und anthropic mehr Pi-seitige Evidence + mehr Modelle hat, ist openai-codex gleichwertig aber nicht primär
- **Empfohlen als Alternativ-Smoke**: Falls anthropic-Auth-Mechanismus (API-Key vs. OAuth) unklar bleibt, ist `openai-codex`/`gpt-5.4-mini` der direkte Fallback
- **Login/Subscription-Mechanismus**: Ob OpenAI via `OPENAI_API_KEY` in `.env` oder via Session-Auth läuft, muss vor Smoke verifiziert werden

### `minimax` — Fallback (nach Verifikation)

- **Owner-Verfügbarkeit bestätigt**: API-Key vorhanden
- **Pi-seitige Env-Var unklar**: `MINIMAX_API_KEY` erscheint **nicht** in `pi --help` Env-Var-Liste. Das bedeutet entweder:
  - Pi verwendet einen anderen Env-Var-Namen für MiniMax (unbekannt)
  - MiniMax-Konfiguration läuft über `pi config` TUI oder einen anderen Mechanismus
  - MiniMax verwendet `--api-key` Flag (verboten per `docs/pi-secret-handling-spec.md`)
- **Nächster Schritt**: Verifizieren via `pi config` oder Pi-Extension-Docs, welchen Env-Var-Namen Pi für MiniMax erwartet. Erst danach `.env.example` mit `MINIMAX_API_KEY=` oder korrektem Alternativ-Namen befüllen.
- **Langfristig wichtig**: MiniMax ist verbunden und ist ein relevanter lokaler Provider — Verifikation hat hohe Priorität nach dem ersten Smoke.

### `anthropic` — Primary (Korrektur von "Vertagt")

- **Owner-Verfügbarkeit bestätigt**: Claude-Subscription ist verbunden — Korrektur der initialen Einschätzung
- **Pi-seitige Evidence stark**: Pi-Help listet sowohl `ANTHROPIC_API_KEY` als auch `ANTHROPIC_OAUTH_TOKEN` (Alternative für Subscription-basiertes Auth)
- **Modell-Tiefe**: 25+ Modelle in `pi --list-models` — deutlich mehr Auswahl als openai-codex (4 Modelle)
- **Claude-nativer Workspace**: Dieser Workspace nutzt Claude Code als primären Agenten — Anthropic als Pi-Provider ist konsistent mit dem bestehenden Setup
- **Smoke-Kandidat**: `claude-haiku-4-5` — der schnellste/günstigste Haiku-Tier mit Thinking-Support und 200K Kontext; analog zur `-mini`-Logik bei OpenAI
- **Auth-Flexibilität**: Subscription kann entweder via `ANTHROPIC_API_KEY` (Console) oder `ANTHROPIC_OAUTH_TOKEN` (Claude.ai OAuth) konfiguriert sein — welcher davon in Pi greift, muss vor dem Smoke verifiziert werden

### `google` — Ausgeschlossen

- **Kein Modell in `pi --list-models`**: Eindeutig — kein Google-Provider aktuell konfiguriert
- **Pi-Help Default-Name `google`**: Pi-Help nennt `google` als Default-Provider, aber ohne konfigurierte Credentials erscheinen keine Modelle
- **Exclude bis neue Evidence vorliegt**: Falls Google-Provider-Konfiguration hinzukommt, erneute Prüfung nötig

## Auth/Config Verification Notes

Vor dem ersten OpenAI-Codex-Smoke müssen folgende Punkte geklärt sein:

| Punkt | Status | Nächste Aktion |
|---|---|---|
| Anthropic via API-Key oder OAuth-Token? | unklar — Pi-Help listet beide (`ANTHROPIC_API_KEY` + `ANTHROPIC_OAUTH_TOKEN`) | Verifizieren, welcher Auth-Pfad mit bestehender Claude-Subscription greift |
| OpenAI via API-Key oder Login/OAuth? | unklar — `OPENAI_API_KEY` in Pi-Help bestätigt, aber Abo-Mechanismus unbekannt | Verifizieren, ob `OPENAI_API_KEY` gesetzt ist oder Pi OpenAI via session-auth erreicht |
| MiniMax Env-Var-Name für Pi | unklar — nicht in Pi-Help | `pi config` oder Pi-MiniMax-Doku prüfen |
| `.env.example`-Platzhalter | noch nicht erstellt | erst nach P-04 + P-01 |

## Relation To Existing Docs

| Dokument | Relation |
|---|---|
| `docs/pi-smoke-command-design.md` | Smoke-Shape: `pi --provider openai-codex --model gpt-5.4-mini --no-tools --no-session --print "Return exactly: PI_SMOKE_OK"` |
| `docs/pi-secret-handling-spec.md` | Secret-Handling: `OPENAI_API_KEY` via `source .env`, nie als `--api-key` Flag |
| `docs/pi-execution-surface-policy.md` | Tier 0 für `--no-tools --print`-Smoke — kein Human Approval nötig |
| `docs/pi-integration-path-decision.md` | Option C aktuell, Option A (`runtime/surfaces/pi/`) nach P-01/Smoke |

## Proposed First Smoke Shape (Entwurf, nicht ausführen)

Nach Abschluss von P-01 und Anthropic-Auth-Verifikation (primär):

```bash
# Not executed in this slice — design only
set -a && source .env && set +a
pi --provider anthropic \
  --model claude-haiku-4-5 \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

Alternativ mit openai-codex (falls anthropic-Auth unklar):

```bash
# Alternative — not executed in this slice
set -a && source .env && set +a
pi --provider openai-codex \
  --model gpt-5.4-mini \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

Erwarteter Output: `PI_SMOKE_OK`
Exit-Code: `0`
Approval-Tier: 0 (`read_only`) — kein Human Approval nötig
Secret-Boundary: Key kommt aus env, nicht aus dem CLI-Argument

**Vorbehalt Auth-Mechanismus:** Ob Pi anthropic via `ANTHROPIC_API_KEY` (Console-Key in `.env`) oder via `ANTHROPIC_OAUTH_TOKEN` (Claude.ai OAuth) authentifiziert, muss vor dem Smoke verifiziert werden. Pi-Help listet beide. Dasselbe gilt für openai-codex (`OPENAI_API_KEY` vs. Session-Login).

## Required Before First Smoke

1. **Konkretes Modell gewählt**: `claude-haiku-4-5` (anthropic primary) oder `gpt-5.4-mini` (openai-codex fallback)
2. **Auth-Mechanismus verifiziert**: `ANTHROPIC_API_KEY` vs. `ANTHROPIC_OAUTH_TOKEN` — vor Smoke klären, welcher in Pi greift; analog für OpenAI
3. **Keine Secrets im Command**: Key kommt aus `.env` oder OAuth-Session, nie `--api-key <value>`
4. **Smoke-Flags**: `--no-tools`, `--no-session`, `--print` zwingend
5. **Exit-/Marker-Erwartung**: `PI_SMOKE_OK`
6. **Evidence-Output**: Command-Shape ohne Secret, Provider, Model, Exit-Code, Timestamp — per `docs/pi-smoke-command-design.md`
7. **Worktree clean**: `git status --short` zeigt keine ungestagten/untracked Files vor Smoke
8. **Human Approval**: Tier 0 — nicht nötig für `--no-tools --print`

## Non-Goals

- keine Smoke-Ausführung
- keine Runtime-Integration
- kein `runtime/surfaces/pi/`
- kein `providers/pi/`
- keine `.env.example`
- keine Secrets laden oder ausgeben
- keine Contract-Änderung
- keine Validatoren
- keine Provider-Implementation
- kein `OPENAI_API_KEY`-Wert lesen, anzeigen oder erzeugen

## Recommended Next Gate

**P-01 Pi Workspace Reproducibility Decision**

Ziel:
- Klären, wie Pi im Workspace reproduzierbar verfügbar ist:
  - **Option A**: Pi bleibt global installiert, nur als external prerequisite dokumentiert (kein `package.json`-Eintrag)
  - **Option B**: Pi als devDependency in `package.json` (`@earendil-works/pi-coding-agent@0.79.9`)
  - **Option C**: Pi via `npx @earendil-works/pi-coding-agent` — kein lokaler Install nötig
- Nach P-01: `.env.example`-Template mit verifizierten Platzhaltern erstellen
- Danach: echter Smoke-Run mit `openai-codex` / `gpt-5.4-mini` und Evidence-Dokumentation
- Danach: `runtime/surfaces/pi/` anlegen (Option A aus `docs/pi-integration-path-decision.md`)
