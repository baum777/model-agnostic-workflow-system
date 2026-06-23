# Pi Provider Default Decision

## Class
derived / docs-only / provider-default decision

## Status
proposed — no smoke executed

## Decision

```text
Default provider for first Pi smoke: openai-codex
Default model candidate:             gpt-5.4-mini
Fallback provider:                   minimax — after Pi-specific auth/config verification
Excluded now:                        google — not in pi --list-models
Deferred:                            anthropic — no owner-availability confirmation
```

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
- Anthropic ist Pi-seitig gut dokumentiert (`ANTHROPIC_API_KEY` in Pi-Help), aber nicht als Owner-verfügbar bestätigt
- Integrationspfad-Entscheidung: Option C (No Integration Yet), Zukunftspfad Option A (`runtime/surfaces/pi/`) per `docs/pi-integration-path-decision.md`

## Candidate Assessment

Beobachtet via `pi --list-models` und `pi --help` (read-only, keine Ausführung):

| Provider | Listed by Pi | Owner availability | Secret/Auth confidence | Smoke fit | Decision |
|---|---|---|---|---|---|
| `openai-codex` | yes — 4 Modelle | **Owner-bestätigt: Abo/Login** | `OPENAI_API_KEY` in Pi-Help ✓ | **best for first smoke** | **default** |
| `minimax` | yes — 3 Modelle | Owner: API-Key verbunden | Env Var nicht in Pi-Help bestätigt | fallback nach Verifikation | verify first |
| `anthropic` | yes — 25+ Modelle | **nicht als Owner-Info bestätigt** | `ANTHROPIC_API_KEY` in Pi-Help ✓ | möglich, aber nicht Owner-verfügbar | defer |
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

### `openai-codex` — Default (angenommen)

- **Owner-Verfügbarkeit bestätigt**: OpenAI/Codex per Abo/Login verfügbar — das ist der primäre Entscheidungsgrund
- **Pi-seitige Evidence**: `OPENAI_API_KEY` explizit in `pi --help` Env-Var-Liste gelistet
- **Modell-Liste verfügbar**: `pi --list-models` zeigt 4 Modelle — kein Google-Style-Blackout
- **Login/Subscription-Mechanismus**: Falls OpenAI via Login (OAuth) statt klassischem API-Key funktioniert, ist `OPENAI_API_KEY` möglicherweise nicht die einzige Auth-Option. Dies muss vor dem ersten Smoke verifiziert werden — der Key-Name ist Pi-seitig bestätigt, der Login-Flow noch nicht.
- **Vorbehalt**: `openai-codex` ist der bevorzugte erste Default, aber die Workspace-Reproduzierbarkeit (P-01) kann den Auth-Mechanismus beeinflussen. Wenn OpenAI nur via session-basiertem Login verfügbar ist (kein API-Key), braucht der Smoke einen anderen Auth-Path als `.env`-basiert.

### `minimax` — Fallback (nach Verifikation)

- **Owner-Verfügbarkeit bestätigt**: API-Key vorhanden
- **Pi-seitige Env-Var unklar**: `MINIMAX_API_KEY` erscheint **nicht** in `pi --help` Env-Var-Liste. Das bedeutet entweder:
  - Pi verwendet einen anderen Env-Var-Namen für MiniMax (unbekannt)
  - MiniMax-Konfiguration läuft über `pi config` TUI oder einen anderen Mechanismus
  - MiniMax verwendet `--api-key` Flag (verboten per `docs/pi-secret-handling-spec.md`)
- **Nächster Schritt**: Verifizieren via `pi config` oder Pi-Extension-Docs, welchen Env-Var-Namen Pi für MiniMax erwartet. Erst danach `.env.example` mit `MINIMAX_API_KEY=` oder korrektem Alternativ-Namen befüllen.
- **Langfristig wichtig**: MiniMax ist verbunden und ist ein relevanter lokaler Provider — Verifikation hat hohe Priorität nach dem ersten Smoke.

### `anthropic` — Vertagt

- **Pi-seitige Evidence stark**: `ANTHROPIC_API_KEY` in Pi-Help, 25+ Modelle in `--list-models` — technisch der am besten dokumentierte Provider Pi-seitig
- **Owner-Verfügbarkeit unbestätigt**: Kein Anthropic-Key/Login wurde als Owner-Info angegeben
- **Deferred, nicht excluded**: Falls Anthropic-Verfügbarkeit später bestätigt wird, wäre `anthropic` mit `claude-haiku-4-5` oder `claude-sonnet-4-6` ein starker Smoke-Kandidat
- **Nicht `excluded`**: `ANTHROPIC_API_KEY` ist legitimer Pi-Env-Var; die Entscheidung ist Owner-getrieben, nicht technisch

### `google` — Ausgeschlossen

- **Kein Modell in `pi --list-models`**: Eindeutig — kein Google-Provider aktuell konfiguriert
- **Pi-Help Default-Name `google`**: Pi-Help nennt `google` als Default-Provider, aber ohne konfigurierte Credentials erscheinen keine Modelle
- **Exclude bis neue Evidence vorliegt**: Falls Google-Provider-Konfiguration hinzukommt, erneute Prüfung nötig

## Auth/Config Verification Notes

Vor dem ersten OpenAI-Codex-Smoke müssen folgende Punkte geklärt sein:

| Punkt | Status | Nächste Aktion |
|---|---|---|
| OpenAI via API-Key oder Login/OAuth? | unklar — `OPENAI_API_KEY` in Pi-Help bestätigt, aber Login-Abo-Mechanismus unbekannt | Verifizieren, ob `OPENAI_API_KEY` gesetzt ist oder Pi OpenAI via session-auth erreicht |
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

Nach Abschluss von P-01 und OpenAI-Auth-Verifikation:

```bash
# Not executed in this slice — design only
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
Secret-Boundary: `OPENAI_API_KEY` kommt aus env, nicht aus dem CLI-Argument

**Vorbehalt OpenAI Login-Mechanismus:** Falls OpenAI-Codex via Subscription/Session-Login ohne API-Key funktioniert (kein klassischer `OPENAI_API_KEY` in `.env`), muss der Smoke-Shape angepasst werden. In diesem Fall:
- Verifizieren, ob Pi OpenAI via gespeicherten Session-Token authentifiziert
- Env-Var möglicherweise nicht nötig, wenn Login bereits in Pi-Konfiguration persistiert
- Secret-Boundary bleibt: kein Key-Wert im Command, in Logs oder Evidence

## Required Before First Smoke

1. **Konkretes Modell gewählt**: `gpt-5.4-mini` (aus diesem Dokument)
2. **OpenAI-Auth-Mechanismus verifiziert**: API-Key via `.env` oder Session-Login via Pi-Config — vor Smoke klären
3. **Keine Secrets im Command**: `OPENAI_API_KEY` aus `.env` oder Session-Auth, nie `--api-key <value>`
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
