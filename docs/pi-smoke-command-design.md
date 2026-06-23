# Pi Smoke Command Design

## Class
derived / docs-only / smoke-command design

## Status
proposed — not executed

## Use rule
Dieses Dokument beschreibt Smoke-Command-Designs für spätere Pi-Sessions.
Es führt keine Pi-Session aus, lädt keine Secrets und aktiviert keine Runtime.
Canonical authority für Approval-Tiers: `docs/pi-execution-surface-policy.md`.
Canonical authority für Secret-Handling: `docs/pi-secret-handling-spec.md`.
Canonical authority für Pi-Classification: `docs/pi-local-runtime-evidence.md`.

## Purpose

P-03 definiert einen sicheren Minimalbefehl, der später prüft, ob Pi grundsätzlich startbar
und konfigurierbar ist — ohne dabei Grenzen der Secret-/Approval-Policy zu verletzen.

Anforderungen an den Smoke-Command:
- **Keine Dateien ändern**: kein `edit`, kein `write`, kein mutierendes `bash`
- **Keine Secrets ausgeben**: kein Key-Wert im Command, kein Env-Dump
- **Keinen offenen Agenten-Loop starten**: `--print` für deterministischen Exit
- **Klar eingeschränkter Prompt**: deterministisches erwartetes Ergebnis
- **Evidence-fähiger Output**: Marker-String, Exit-Code, Command-Shape ohne Secrets

Dieses Dokument ist Design, keine Ausführung. Der Smoke-Command wird erst ausgeführt,
nachdem P-12 (Architekturentscheidung) und P-01 (Workspace-Reproduzierbarkeit) abgeschlossen
sind und Secret-Handling (P-05, konzeptionell geschlossen) verifiziert vorliegt.

## Observed Pi Capabilities (Evidence from --help, no execution)

Relevante Flags aus `pi --help` (Version `0.79.9`):

| Flag | Alias | Funktion | Relevanz für Smoke |
|---|---|---|---|
| `--no-tools` | `-nt` | Alle Tools deaktivieren (Built-in + Extension) | **zentral** — garantiert keine Mutation |
| `--print` | `-p` | Non-interactive: Prompt verarbeiten und beenden | **zentral** — deterministischer Exit |
| `--no-session` | — | Keine Session-Datei speichern (ephemeral) | empfohlen — kein Zustand hinterlassen |
| `--provider <name>` | — | Provider-Auswahl | Platzhalter bis P-12 |
| `--model <pattern>` | — | Modell-Auswahl | Platzhalter bis Provider-Entscheidung |
| `--tools <list>` | `-t` | Erlaubte Tool-Allowlist | Alternative zu `--no-tools` für Read-only-Stufe |
| `--thinking off` | — | Thinking deaktivieren | optional, Output deterministischer |

Env Vars laut `pi --help` (Auszug, keine echten Werte):

| Env Var | Provider | Confidence |
|---|---|---|
| `ANTHROPIC_API_KEY` | anthropic | high — explizit in Pi-Help gelistet |
| `ANTHROPIC_OAUTH_TOKEN` | anthropic | high — explizit in Pi-Help gelistet (Alternative zu API Key) |
| `OPENAI_API_KEY` | openai-codex | high — explizit in Pi-Help gelistet |
| `MINIMAX_API_KEY` | minimax | medium — aus `providers/minimax/README.md` belegt, aber nicht in Pi-Help-Output |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | google | low — nicht in Pi-Help-Output; verify before use |

**Update vs. `docs/pi-secret-handling-spec.md`:** MINIMAX und GOOGLE sind nicht in Pi-Help-Env-Var-Liste aufgeführt. Diese Korrektur ist relevant für die spätere `.env.example`-Erstellung. `ANTHROPIC_API_KEY` und `OPENAI_API_KEY` sind high-confidence bestätigt.

## Preconditions

Vor jedem Smoke-Ausführungs-Versuch müssen folgende Voraussetzungen erfüllt sein:

- **Pi binary verfügbar**: `which pi` → Pfad bekannt (`/home/baum/.npm-global/bin/pi`)
- **Pi version bekannt**: `pi --version` → `0.79.9` ✓ (bereits verifiziert)
- **Provider-Auswahl entschieden**: P-12 muss abgeschlossen sein — bevorzugter Provider für Pi-Sessions definiert
- **Model-Auswahl entschieden**: Konkrete Modell-ID nach Provider-Entscheidung
- **Secrets nur über lokale, untracked Env geladen**: `.env` in `.gitignore`, kein `--api-key` Flag
- **Approval-Tier geprüft**: Smoke mit `--no-tools --print` ist Tier 0 — kein Human Approval nötig, aber Secret-Boundary gilt
- **Keine mutierenden Tools erlaubt**: `--no-tools` oder `--tools read` erzwungen
- **Evidence-Ziel definiert**: Wohin wird Smoke-Output dokumentiert? (Run-Summary, Log-Datei)
- **`.gitignore`-Verifikation**: `.env` muss vor jeder Provider-Key-Nutzung in `.gitignore` stehen

## Forbidden Smoke Patterns

```bash
# VERBOTEN — Key im CLI-Flag (Shell-History-Risiko)
pi --api-key sk-ant-...
pi --provider anthropic --api-key <key>

# VERBOTEN — Mutierende Tools
pi --provider anthropic --tools bash,edit,write --print "Fix this bug"

# VERBOTEN — Open-ended / kein deterministischer Exit (kein --print)
pi --provider anthropic
pi --auto
pi "Do whatever seems best"

# VERBOTEN — Prompt mit Schreib-Intention
pi --print "Create a new file called output.txt with the text hello"
pi --print "Edit package.json and add pi as a dependency"

# VERBOTEN — Env-Dump oder Secret-Ausgabe im Prompt
pi --print "What is my ANTHROPIC_API_KEY value?"
pi --print "Run: printenv"
pi --print "Run: env | grep KEY"

# VERBOTEN — Open-ended Agenten-Session
pi --session my-session "Help me refactor the whole codebase"

# VERBOTEN — API-Key als Teil des System-Prompts
pi --system-prompt "Your API key is sk-ant-..."
```

## Allowed Smoke Shape

Bevorzugte Form — **nicht ausführen in diesem Slice**:

```bash
# Preferred Minimal Smoke — do not execute in this slice
# Requires: P-12 done, P-01 done, .env loaded via source .env, .env in .gitignore

set -a && source .env && set +a    # load secrets without printing — not in this slice
pi --provider <approved-provider> \
  --model <approved-model> \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

Alternative (Read-only tool set statt no-tools) — **nicht ausführen in diesem Slice**:

```bash
# Read-only tool allowlist alternative — do not execute in this slice
set -a && source .env && set +a
pi --provider <approved-provider> \
  --model <approved-model> \
  --tools read \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

**Warum `--no-tools` bevorzugt gegenüber `--tools read` für Smoke:**
- `--no-tools` garantiert keine Tool-Ausführung überhaupt (Built-in + Extensions)
- `--tools read` lässt lesende Tool-Calls zu — für einen reinen Connectivity-/Startup-Smoke nicht nötig
- Smoke-Zweck ist Startbarkeit und Provider-Erreichbarkeit, nicht Tool-Funktionalität
- Tool-Tests kommen in separaten, explizit gescopten Slices

**Warum `--no-session`:**
- Smoke-Sessions hinterlassen keine Zustandsdatei im Workspace
- Keine Akkumulation von Test-Sessions in `~/.pi/` oder Workspace-Local-Session-Verzeichnissen
- Evidence liegt im Run-Output, nicht in einer gespeicherten Session-Datei

## Tier Mapping

| Smoke Type | Tools | Mutation Risk | Approval Tier | Allowed Now? |
|---|---|---|---|---|
| help / version / list-models | none | none | Tier 0 | yes — already used |
| provider no-tools prompt (`--no-tools --print`) | none | low | Tier 0 | design only — not yet |
| read-only tool prompt (`--tools read --print`) | read only | low-medium | Tier 0/1 | later, after P-12 |
| bash/edit/write smoke | bash/edit/write | high | Tier 2+ | not allowed for smoke |
| open-ended agent session (no `--print`) | unknown | high | Tier 4 | forbidden |

Basis: `docs/pi-execution-surface-policy.md` Approval-Tier-Mapping-Tabelle.

**Tier-0-Begründung für `--no-tools --print`:**
- `--no-tools` = keine Tool-Ausführung = keine Filesystem-Mutation
- `--print` = deterministischer Exit, kein offener Loop
- Einziges Risiko: Provider-API-Call (Netzwerk, Token-Verbrauch) — kein Workspace-Risiko
- Kein Human Approval nötig, aber Secret-Boundary (kein Key im Command) gilt weiterhin

## Evidence Output Contract

Erlaubt in einem späteren Smoke-Run-Summary:

```text
command: pi --provider <name> --model <name> --no-tools --no-session --print "Return exactly: PI_SMOKE_OK"
provider: <name>
model: <name>
tool_mode: --no-tools
exit_code: 0
expected_marker: PI_SMOKE_OK
marker_found: true | false
approval_tier: Tier 0 (read_only)
timestamp: <ISO 8601>
session: ephemeral (--no-session)
env_source: [env: ANTHROPIC_API_KEY loaded via source .env] (kein Wert)
```

Verboten in Evidence:

```text
- API-Key-Werte (vollständig oder partiell)
- Vollständige Env-Dumps (env, printenv)
- Shell-History-Auszüge mit Key-Werten
- .env-Datei-Inhalte
- Rohe Provider-Responses, die sensitive Context enthalten
- File-Diffs von mutierenden Tools
- Interne Pi-Session-Objekte mit Key-Feldern
```

Per `docs/pi-secret-handling-spec.md` und `docs/secret-handling.md`: "Traces are operational evidence, not a sink for secrets."

## Proposed Minimal Smoke

Bevorzugter Smoke für späteren Einsatz — **nicht ausgeführt in diesem Slice**:

```bash
# Future command; not executed in this slice
# Prerequisites: P-12 done, P-01 done, .env in .gitignore, secrets loaded via source
pi --provider <approved-provider> \
  --model <approved-model> \
  --no-tools \
  --no-session \
  --print "Return exactly: PI_SMOKE_OK"
```

Offen bis P-12/P-01:
- `<approved-provider>`: noch nicht entschieden — anthropic (high-confidence env var) oder google (default laut Pi-Help: `--provider <name>  Provider name (default: google)`) möglich
- `<approved-model>`: folgt aus Provider-Entscheidung
- **Hinweis Pi-Help Default**: Pi nutzt `google` als Default-Provider — für Workspace-Nutzung muss die Provider-Auswahl explizit in P-12 entschieden werden, nicht implizit vom Default abhängen

**Warum nicht `google` als Default annehmen:**
- `google` steht in Pi-Help als Default, aber kein `GOOGLE_API_KEY` in Pi-Help-Env-Var-Liste — unklar ob Key-Name korrekt ist
- Provider-Auswahl ist eine Governance-Entscheidung (P-12), keine technische Default-Übernahme
- Anthropic hat high-confidence Env-Var-Belege + Standard-Konvention

## Relation To Open Preconditions

| Precondition | Status nach diesem Slice |
|---|---|
| P-01 Workspace-Reproduzierbarkeit (`package.json`) | offen |
| P-03 Smoke-Befehl ohne Secrets | **design-seitig geschlossen** durch dieses Dokument; nicht ausgeführt |
| P-04 Provider-Auswahl | offen — hängt von P-12 ab |
| P-05 Secret-Handling | konzeptionell geschlossen (`docs/pi-secret-handling-spec.md`, commit `6575eb4`) |
| P-06 Approval-Tiers | geschlossen (`docs/pi-execution-surface-policy.md`, commit `8c54da8`) |
| P-12 Architekturentscheidung | offen — `runtime/surfaces/pi/` vs. Extension Host |

P-03 ist erst **vollständig geschlossen**, wenn der Smoke-Command tatsächlich ausgeführt und sein Output als Evidence dokumentiert ist. Dieses Dokument schließt P-03 designseitig.

## Relation To Pi Help Env Var Discovery

Pi-Help listet nur vier Env Vars explizit:
- `ANTHROPIC_API_KEY` (high confidence)
- `ANTHROPIC_OAUTH_TOKEN` (high confidence — Alternative)
- `ANT_LING_API_KEY` (unbekannter Anbieter — nicht in Workspace-Scope)
- `OPENAI_API_KEY` (high confidence)

**Abweichung von `docs/pi-secret-handling-spec.md`:** Die Spec listet `MINIMAX_API_KEY` (high confidence, aus `providers/minimax/README.md`). Pi-Help zeigt `MINIMAX_API_KEY` nicht explizit — das bedeutet entweder Pi liest es unter einem anderen Namen oder MiniMax wird über den `--api-key` Flag (verboten) oder ein Pi-internes Routing-Format konfiguriert. Dies muss vor MiniMax-Provider-Nutzung in Pi verifiziert werden.

**Empfehlung:** Für den initialen Smoke, anthropic als ersten Provider-Kandidaten nutzen (sofern P-12 nicht anders entscheidet) — weil `ANTHROPIC_API_KEY` in Pi-Help explizit belegt ist.

## Non-Goals

- keine Smoke-Ausführung in diesem Slice
- keine Runtime-Integration
- kein `runtime/surfaces/pi/`
- kein `providers/pi/`
- kein Adapter-Code
- keine Contract-Änderung
- keine Validatoren
- keine Secrets laden oder ausgeben
- keine `.env.example` in diesem Slice
- keine Provider-API aufrufen
- keine Pi-Session starten

## Recommended Next Gate

**P-12 Pi Integration Path Decision** — Architecture Decision Record

Ziel:
1. Entscheidung: `runtime/surfaces/pi/` vs. Extension Host vs. No Integration Yet
2. Konsequenz: Provider-Auswahl für Pi-Sessions (P-04)
3. Konsequenz: Workspace-Reproduzierbarkeit (`package.json` Eintrag, P-01)
4. Konsequenz: `.env.example`-Template mit verifizierten Env-Var-Namen
5. Danach: Echter Smoke-Run mit dokumentierter Evidence

Der Smoke-Command ist design-ready (dieses Dokument). Ausführung wartet auf P-12-Entscheidung.

## Non-Smoke Verification Commands

Diese Commands wurden bereits sicher ausgeführt (kein Provider-Call, keine Secrets):

```bash
which pi        # → /home/baum/.npm-global/bin/pi
pi --version    # → 0.79.9
pi --help       # → flags, env vars, examples (read-only, no execution)
```

Diese Tier-0-Verifikation ist bereits in `docs/pi-local-runtime-evidence.md` dokumentiert.
Sie bestätigen Pi-Verfügbarkeit, nicht Pi-Provider-Konnektivität.
