# Pi Provider Default Decision

## Class
derived / docs-only / provider-default decision

## Status
applied — three smokes executed (2026-06-23); minimax confirmed successful; openai-codex and anthropic provider-limited

## Decision

```text
Default provider for first Pi smoke:  openai-codex
Default auth mode:                    subscription login via /login — NOT OPENAI_API_KEY
Default model candidate:              gpt-5.3-codex-spark (smoke-status: not yet verified; openai-codex quota-limited on 2026-06-23)
Fallback provider:                    minimax — MINIMAX_API_KEY confirmed by Pi.dev; smoke-verified successful (PI_SMOKE_OK, 2026-06-23)
Excluded now:                         google — not in pi --list-models
Correct Google env (if ever needed):  GEMINI_API_KEY (not GOOGLE_API_KEY)
Co-confirmed provider:                anthropic — Claude subscription connected; auth via ANTHROPIC_API_KEY or ANTHROPIC_OAUTH_TOKEN
                                      (smoke-status: provider-side billing limit, Third-party usage quota exhausted; not an architectural issue)
```

**Correction history:**
- Initial version (commit 32a99bc): openai-codex default; anthropic deferred (no owner confirmation)
- First correction (commit 68c9b29): both subscriptions confirmed; anthropic promoted to primary
- Second correction (2026-06-23, Pi.dev Web-Review): openai-codex restored as default because
  Pi.dev confirms Codex subscription uses /login + auth.json (no env var needed — simpler auth).
  Anthropic remains co-confirmed but requires API-Key or OAuth-Token in env.
  MiniMax MINIMAX_API_KEY officially confirmed. Google env corrected to GEMINI_API_KEY.

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
| `openai-codex` | yes — 4 Modelle | **Owner-bestätigt: Abo/Login** | auth.json via `/login` — **kein Env Var nötig** | **best for first smoke — simplest auth** | **default** |
| `minimax` | yes — 3 Modelle | Owner: API-Key verbunden | `MINIMAX_API_KEY` **Pi.dev offiziell bestätigt**; opt. `MINIMAX_CN_API_KEY` | valider Fallback | fallback |
| `anthropic` | yes — 25+ Modelle | **Owner-bestätigt: Claude-Subscription** | `ANTHROPIC_API_KEY` oder `ANTHROPIC_OAUTH_TOKEN` — Env Var nötig | co-confirmed; etwas mehr Auth-Setup | co-candidate |
| `google` | **nein** — keine Modelle | nicht bestätigt | `GEMINI_API_KEY` (korrekt lt. Pi.dev; nicht `GOOGLE_API_KEY`) | nein | **exclude** |

### Beobachtete `openai-codex` Modelle (aus `pi --list-models`)

| Model | Context | Max-Out | Thinking | Images | Owner-Verified |
|---|---|---|---|---|---|
| `gpt-5.3-codex-spark` | 128K | 128K | yes | no | **yes** |
| `gpt-5.4` | 272K | 128K | yes | yes | — |
| `gpt-5.4-mini` | 272K | 128K | yes | yes | — |
| `gpt-5.5` | 272K | 128K | yes | yes | — |

**Smoke-Modell-Kandidaten für openai-codex (geordnet nach Owner-Verifikation):**

1. **Primary: `gpt-5.3-codex-spark`** — Owner hat dieses Modell lokal via `pi --list-models` bestätigt
   - Smallest context (128K), aber ausreichend für Smoke-Command (`--print "Return exactly: PI_SMOKE_OK"`)
   - Zu versuchen zuerst, da direkt Owner-verifiziert
   
2. **Fallback: `gpt-5.4-mini`** — Falls `gpt-5.3-codex-spark` Probleme hat
   - Größeres Context-Window (272K) als gpt-5.3-codex-spark
   - Cost-effective Variante
   - Thinking-Support nicht benötigt für deterministisches Smoke-Output
   
3. **Future Upgrade: `gpt-5.4`, `gpt-5.5`** — Für spätere anspruchsvollere Pi-Sessions

## Rationale

### `openai-codex` — Default (Pi.dev-bestätigt)

- **Owner-Verfügbarkeit bestätigt**: OpenAI-Subscription (ChatGPT Plus/Pro) ist verbunden
- **Simplest auth path**: Pi.dev-Doku bestätigt: Subscription-Provider laufen via `/login`-Flow; Token wird automatisch in `~/.pi/agent/auth.json` gespeichert und refresht — **kein Env Var in `.env` nötig**
- **`OPENAI_API_KEY` ist ein anderer Provider**: Pi.dev unterscheidet `openai-codex` (Subscription) von `openai` (API-Key-Provider mit `OPENAI_API_KEY`). Diese müssen getrennt gehalten werden.
- **Modell-Liste verfügbar**: `pi --list-models` zeigt 4 Modelle; `gpt-5.4-mini` als Smoke-Kandidat
- **Default wegen Einfachheit**: Subscription-Auth braucht keine `.env`-Konfiguration — geringster Setup-Aufwand für ersten Smoke

### `minimax` — Fallback (Pi.dev bestätigt)

- **Owner-Verfügbarkeit bestätigt**: API-Key vorhanden
- **Pi.dev-Doku bestätigt**: `MINIMAX_API_KEY` ist der offizielle Env-Var-Name; optional `MINIMAX_CN_API_KEY` für CN-Region
- **Früherer Vorbehalt aufgehoben**: "nicht in Pi-Help bestätigt" war unvollständige Evidence — Pi.dev-Doku ist autoritativer
- **Langfristig wichtig**: MiniMax ist verbunden — wird nach erstem Smoke als Alternativ-Provider verifiziert

### `anthropic` — Co-Confirmed (etwas mehr Auth-Setup, aktuell provider-limitiert)

- **Owner-Verfügbarkeit bestätigt**: Claude-Subscription ist verbunden
- **Pi.dev und Pi-Help**: Sowohl `ANTHROPIC_API_KEY` (Console-API-Key) als auch `ANTHROPIC_OAUTH_TOKEN` (Claude.ai OAuth) sind verfügbar
- **Warum nicht default**: Auth erfordert Env-Var (`ANTHROPIC_API_KEY` oder `ANTHROPIC_OAUTH_TOKEN` in `.env`) — mehr Setup als openai-codex Subscription-Login
- **Aktueller Smoke-Status (2026-06-23)**: `claude-haiku-4-5` Smoke fehlgeschlagen mit HTTP 400 — "Third-party apps now draw from your extra usage"; Quota für Third-Party-Integration erschöpft. Dies ist ein Verfügbarkeitsproblem (Kontingent), nicht ein architektonisches Problem. Auth-Pfad bleibt dokumentiert und funktionsfähig sobald Quota wieder verfügbar ist.
- **Co-Kandidat, nicht excluded**: Architektonisch gleichwertig zu openai-codex; auth-Setup und Provider-Kontingent entscheiden über Timing

### `google` — Ausgeschlossen

- **Kein Modell in `pi --list-models`**: Provider aktuell nicht konfiguriert
- **Env-Var-Korrektur**: Korrekte Env-Var laut Pi.dev wäre `GEMINI_API_KEY` (nicht `GOOGLE_API_KEY`) — relevant, falls Provider später aktiviert wird
- **Exclude bis neue Evidence vorliegt**: Keine Aktion bis Google-Provider in `pi --list-models` erscheint

## Architektonischer Default vs. Smoke-Verifikation (Kritische Trennung)

**Wichtige Leitplanke (aus dieser Slice, 2026-06-23):**

Das Dokument distinguiert streng zwischen zwei unabhängigen Achsen:

| Achse | Definition | Entscheidung | Basis |
|---|---|---|---|
| **Architektonischer Default** | Welcher Provider hat den einfachsten Auth-Pfad und die geringsten Runtime-Voraussetzungen? | **openai-codex** — Subscription-Login via `/login`, kein `.env` nötig, automatische Token-Verwaltung in `auth.json` | Design, nicht Validation |
| **Smoke-Verifiziert (aktuell)** | Welcher Provider hat einen erfolgreichen Tier-0-Smoke mit PI_SMOKE_OK-Marker gezeigt? | **minimax** — einziger Provider mit erfolgreichem Smoke-Run (MiniMax-M2.7, 2026-06-23) | Runtime-Evidence aus `docs/pi-smoke-run-evidence.md` |

**Konsequenz:** Obwohl `minimax` aktuell der einzige smoke-verifizierte Provider ist, bleibt `openai-codex` der architektonische Default. Der Grund: eine Architekturentscheidung (einfachste Auth) von Smoke-Verification abzukoppeln ist essentiell — sonst würde jede temporäre Provider-Quota-Erschöpfung die architektonische Wahl rückwirkend ändern. Das widerspricht dem Geist dieses gesamten Governance-Prozesses.

**Für den Leser:** Diese Trennung ist nicht ein Fehler oder eine Inkonsistenz. Sie ist die zu erhaltende Invariante. openai-codex bleibt der architecturally intended Default; minimax ist der aktuell praktisch nutzbare Fallback.

## Auth/Config Verification Notes

Vor dem ersten OpenAI-Codex-Smoke müssen folgende Punkte geklärt sein:

| Punkt | Status | Nächste Aktion |
|---|---|---|
| openai-codex Subscription Login ausgeführt? | Pi.dev: `pi` dann `/login` — Token in `auth.json` | Einmalig `pi` starten und `/login` für OpenAI-Codex ausführen (kein Env Var nötig) |
| Anthropic via API-Key oder OAuth-Token? | Pi.dev: beide möglich — `ANTHROPIC_API_KEY` oder `ANTHROPIC_OAUTH_TOKEN` | Für anthropic-Fallback verifizieren, welcher Auth-Pfad mit Claude-Subscription greift |
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

Nach Abschluss von P-01 — openai-codex Subscription-Login vorausgesetzt:

```bash
# Not executed in this slice — design only
# Prerequisite: pi /login already executed for openai-codex subscription
# Using gpt-5.3-codex-spark as primary because owner locally verified this model

pi --provider openai-codex \
  --model gpt-5.3-codex-spark \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

Fallback bei Problemen:

```bash
# Alternative — if gpt-5.3-codex-spark fails for any reason
pi --provider openai-codex \
  --model gpt-5.4-mini \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

**Kein `source .env` nötig für openai-codex Subscription:** Auth läuft via `~/.pi/agent/auth.json` — kein Key-Wert in `.env` oder im Command. Dieses Pattern ist der einfachste sichere Auth-Pfad.

Alternativ mit anthropic (falls API-Key oder OAuth-Token in `.env` vorhanden):

```bash
# Alternative — not executed in this slice
set -a && source .env && set +a
pi --provider anthropic \
  --model claude-haiku-4-5 \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

Erwarteter Output: `PI_SMOKE_OK`
Exit-Code: `0`
Approval-Tier: 0 (`read_only`) — kein Human Approval nötig
Secret-Boundary: openai-codex — kein Secret-Wert exponiert; anthropic — Key aus env, nie im Command

## Required Before First Smoke

1. **Konkretes Modell gewählt**: `gpt-5.4-mini` (openai-codex default) aus `pi --list-models`
2. **openai-codex Login ausgeführt**: `pi` → `/login` → OpenAI Subscription verbinden (einmalig; Token in `auth.json`)
3. **Keine Secrets im Command**: openai-codex braucht kein Env Var; anthropic-Fallback via `.env`
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
