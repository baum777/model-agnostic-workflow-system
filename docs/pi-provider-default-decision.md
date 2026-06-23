# Pi Provider Default Decision

## Class
derived / docs-only / provider-default decision

## Status
verified — four smokes executed; minimax/MiniMax-M3 fully verified (provider + model level); P-04 complete

## Decision

```text
Default provider for first Pi smoke:  minimax
Default auth mode:                    MINIMAX_API_KEY via .env (source .env before smoke)
Default model candidate:              MiniMax-M3 (fully smoke-verified: PI_SMOKE_OK, exit 0, 2026-06-24)
Secondary provider:                   openai-codex — Subscription-Login via /login; currently quota-limited (reset: 2026-06-24/25)
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
- Third correction (commit 08e8b46): Status updated against real smoke evidence (three runs on 2026-06-23);
  anthropic billing-limit noted; openai-codex model candidate concretized to gpt-5.3-codex-spark.
- Fourth correction (2026-06-23, explicit Owner decision): Default switched to minimax / MiniMax-M3.
  Reason: minimax is the only smoke-verified provider (PI_SMOKE_OK via MiniMax-M2.7); openai-codex
  remains documented as secondary/simplest-auth but is currently quota-limited. MiniMax-M3 is the
  Owner-chosen model (512K context, images+thinking); individual MiniMax-M3 smoke pending.

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
| `minimax` | yes — 3 Modelle | Owner: API-Key verbunden | `MINIMAX_API_KEY` **Pi.dev offiziell bestätigt**; opt. `MINIMAX_CN_API_KEY` | **Provider smoke-verifiziert (PI_SMOKE_OK via MiniMax-M2.7); MiniMax-M3 pending** | **default** |
| `openai-codex` | yes — 4 Modelle | **Owner-bestätigt: Abo/Login** | auth.json via `/login` — **kein Env Var nötig** | simplest auth; aktuell quota-limitiert | secondary |
| `anthropic` | yes — 25+ Modelle | **Owner-bestätigt: Claude-Subscription** | `ANTHROPIC_API_KEY` oder `ANTHROPIC_OAUTH_TOKEN` — Env Var nötig | co-confirmed; billing-limitiert (Third-party quota) | co-candidate |
| `google` | **nein** — keine Modelle | nicht bestätigt | `GEMINI_API_KEY` (korrekt lt. Pi.dev; nicht `GOOGLE_API_KEY`) | nein | **exclude** |

### Beobachtete `minimax` Modelle (aus `pi --list-models`)

| Model | Context | Max-Out | Thinking | Images | Smoke-Status |
|---|---|---|---|---|---|
| `MiniMax-M3` | 512K | 128K | yes | yes | **smoke-verifiziert (PI_SMOKE_OK, exit 0, 2026-06-24)** |
| `MiniMax-M2.7` | — | — | — | — | **smoke-verifiziert (PI_SMOKE_OK, 2026-06-23)** |

**Default-Modell: `MiniMax-M3`** — Owner-Entscheidung (2026-06-23), smoke-verifiziert (2026-06-24). Größtes Context-Window (512K), Images und Thinking verfügbar. P-04 vollständig durch Runtime-Evidence gedeckt.

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

### `minimax` — Default (Owner-Entscheidung 2026-06-23, Provider smoke-verifiziert)

- **Owner-Verfügbarkeit bestätigt**: API-Key vorhanden und verbunden
- **Pi.dev-Doku bestätigt**: `MINIMAX_API_KEY` ist der offizielle Env-Var-Name; optional `MINIMAX_CN_API_KEY` für CN-Region
- **Provider smoke-verifiziert (2026-06-23)**: MiniMax-M2.7 lieferte `PI_SMOKE_OK` — einziger Provider mit erfolgreichem Tier-0-Smoke in diesem Slice
- **Owner-Modellwahl: MiniMax-M3**: Größtes Context-Window (512K), Images+Thinking; nicht identisch mit dem verifizierten Smoke-Modell (MiniMax-M2.7) — MiniMax-M3 braucht eigenen Verifikations-Smoke
- **Default-Begründung**: explizite Owner-Entscheidung; kombiniert Provider-Verifikation mit dem fähigsten verfügbaren Modell

### `openai-codex` — Secondary (simplest auth, aktuell quota-limitiert)

- **Owner-Verfügbarkeit bestätigt**: OpenAI-Subscription (ChatGPT Plus/Pro) ist verbunden
- **Simplest auth path**: Pi.dev-Doku bestätigt: Subscription-Provider laufen via `/login`-Flow; Token wird automatisch in `~/.pi/agent/auth.json` gespeichert und refresht — **kein Env Var in `.env` nötig**
- **`OPENAI_API_KEY` ist ein anderer Provider**: Pi.dev unterscheidet `openai-codex` (Subscription) von `openai` (API-Key-Provider mit `OPENAI_API_KEY`). Diese müssen getrennt gehalten werden.
- **Aktueller Smoke-Status**: HTTP 429 quota-limit (secondary_used_percent: 100, credits_balance: 0); reset ~2026-06-25; kein Pi-Fehler
- **Secondary statt Default**: bleibt dokumentierter einfachster Auth-Pfad für zukünftige Verifikation sobald Quota zurückgesetzt

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

## Provider-Verifikation vs. Modell-Verifikation (Kritische Trennung nach Owner-Entscheidung)

**Stand nach Owner-Entscheidung 2026-06-23:**

Die frühere Spannung zwischen "architektonischem Default" (openai-codex) und "smoke-verifiziertem Provider" (minimax) ist durch explizite Owner-Entscheidung aufgelöst: **minimax ist jetzt beides — architektonischer Default UND smoke-verifizierter Provider.**

Eine neue Trennung bleibt jedoch bestehen — diesmal innerhalb von minimax:

| Achse | Definition | Status |
|---|---|---|
| **Provider-Level-Verifikation** | Hat `minimax` als Provider einen Tier-0-Smoke erfolgreich abgeschlossen? | **verifiziert** — MiniMax-M2.7 lieferte PI_SMOKE_OK (2026-06-23) |
| **Modell-Level-Verifikation** | Hat `MiniMax-M3` (das gewählte Default-Modell) einen Smoke abgeschlossen? | **verifiziert** — MiniMax-M3 lieferte PI_SMOKE_OK, exit 0 (2026-06-24) |

**Konsequenz:** Beide Achsen sind verifiziert. P-04 ist vollständig durch Runtime-Evidence gedeckt. Nächster Gate: P-01 Workspace-Reproducibility → `.env.example` → `runtime/surfaces/pi/`.

**Leitplanke erhalten:** `openai-codex` bleibt als Secondary dokumentiert mit dem einfachsten Auth-Pfad. Die Rolle hat sich verändert (Default → Secondary), aber die architektonische Eigenschaft (kein `.env` nötig, auth.json-basiert) bleibt dokumentiert für zukünftige Nutzung.

## Auth/Config Verification Notes

| Punkt | Status | Nächste Aktion |
|---|---|---|
| minimax MINIMAX_API_KEY gesetzt? | Pi.dev: `MINIMAX_API_KEY` offiziell bestätigt; smoke mit MiniMax-M2.7 erfolgreich | Vor MiniMax-M3-Smoke: `source .env` mit `MINIMAX_API_KEY` — kein `/login` nötig |
| MiniMax-M3 Smoke ausgeführt? | **ausstehend** — Owner-Modell, noch nicht individuell getestet | Nächster Gate: MiniMax-M3 Tier-0-Smoke zur Modell-Level-Verifikation |
| openai-codex Quota-Reset abgewartet? | HTTP 429; secondary_reset_at_utc: 2026-06-25 | Optional Secondary-Smoke nach Reset für vollständige openai-codex Verifikation |
| Anthropic via API-Key oder OAuth-Token? | Provider billing-limitiert; Auth-Pfad dokumentiert aber aktuell nicht nutzbar | Recheck sobald Claude Third-party-Quota wieder verfügbar — nicht blockierend |
| `.env.example`-Platzhalter | noch nicht erstellt | Nach P-01 + P-04 mit `MINIMAX_API_KEY` als primärem Platzhalter |

## Relation To Existing Docs

| Dokument | Relation |
|---|---|
| `docs/pi-smoke-command-design.md` | Smoke-Shape: `pi --provider minimax --model MiniMax-M3 --no-tools --no-session --print "Return exactly: PI_SMOKE_OK"` |
| `docs/pi-secret-handling-spec.md` | Secret-Handling: `MINIMAX_API_KEY` via `source .env`, nie als `--api-key` Flag |
| `docs/pi-execution-surface-policy.md` | Tier 0 für `--no-tools --print`-Smoke — kein Human Approval nötig |
| `docs/pi-integration-path-decision.md` | Option C aktuell, Option A (`runtime/surfaces/pi/`) nach P-01/Smoke |

## Proposed Next Smoke Shape (Entwurf, nicht ausführen)

**Nächster Gate: MiniMax-M3 Modell-Level-Verifikation** — nach Abschluss von P-01:

```bash
# Not executed in this slice — design only
# Prerequisite: MINIMAX_API_KEY set in .env
# Purpose: model-level smoke for MiniMax-M3 (provider minimax already provider-verified via MiniMax-M2.7)

set -a && source .env && set +a
pi --provider minimax \
  --model MiniMax-M3 \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

**Fallback** falls MiniMax-M3 Probleme zeigt (z. B. Modell-Availability):

```bash
# Alternative — previously smoke-verified model
set -a && source .env && set +a
pi --provider minimax \
  --model MiniMax-M2.7 \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

**Secondary: openai-codex** (nach Quota-Reset ~2026-06-25):

```bash
# Secondary verification — no .env needed for subscription auth
# Execute only after secondary_reset_at_utc: 2026-06-25 11:28:04
pi --provider openai-codex \
  --model gpt-5.3-codex-spark \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

Erwarteter Output: `PI_SMOKE_OK`
Exit-Code: `0`
Approval-Tier: 0 (`read_only`) — kein Human Approval nötig
Secret-Boundary: minimax — `MINIMAX_API_KEY` via `source .env`, nie im Command; openai-codex — kein Secret nötig

## Required Before Next Smoke (MiniMax-M3)

1. **Provider und Modell**: `minimax` / `MiniMax-M3` — Owner-entschieden; Provider smoke-verifiziert via MiniMax-M2.7
2. **MINIMAX_API_KEY in `.env`**: Vor dem Smoke `source .env` ausführen — Key-Wert nie im Command
3. **Smoke-Flags**: `--no-tools`, `--no-session`, `--print` zwingend
4. **Exit-/Marker-Erwartung**: `PI_SMOKE_OK`
5. **Evidence-Output**: Command-Shape ohne Secret, Provider, Model, Exit-Code, Timestamp — per `docs/pi-smoke-command-design.md`
6. **Worktree clean**: `git status --short` zeigt keine ungestagten/untracked Files vor Smoke
7. **Human Approval**: Tier 0 — nicht nötig für `--no-tools --print`
8. **P-01 abgeschlossen**: Workspace-Reproducibility-Decision vor erstem Smoke-Run

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
- Danach: MiniMax-M3 Modell-Level-Smoke und Evidence-Dokumentation (Provider minimax bereits provider-verifiziert)
- Danach: `runtime/surfaces/pi/` anlegen (Option A aus `docs/pi-integration-path-decision.md`)
