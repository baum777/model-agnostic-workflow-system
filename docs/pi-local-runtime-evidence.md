# Pi Local Runtime Evidence

## Class
derived / docs-only / runtime-evidence

## Status
observed locally — not integrated

## Use rule
Dieses Dokument beschreibt lokale Pi-Runtime-Evidenz.
Es aktiviert keine Runtime, erzeugt keinen Provider und ändert keine Contracts.
Canonical contract truth bleibt `core/contracts/*`; canonical doc-class authority bleibt `docs/architecture.md` und `docs/authority-matrix.md`.
Lies dieses Dokument vor jedem Pi-bezogenen Slice — insbesondere vor `docs/pi-provider-adapter-specification.md` und `docs/pi-agent-kit-adapter-core-anchor-decision.md`, deren Schichtannahme dieses Dokument korrigiert.

## Purpose

Pi wurde lokal als CLI-Agent-Runner beobachtet und verifiziert.

Wichtigste Feststellung: **Pi ist kein LLM-API-Provider** im Sinne von `providers/<name>/`.
Pi ist eine **Execution Surface** — ein lokaler Coding-Agent-Runner, der selbst LLM-Provider (Anthropic, MiniMax, OpenAI-Codex, Google) als Backends nutzt.

Dieses Dokument liefert die Evidenzbasis für eine notwendige Architekturkorrektur der bisherigen Pi-Docs: die Zielschicht für Pi ist nicht `providers/<name>/`, sondern Execution Surface.

## Observed Local Evidence

Nur secret-sichere Fakten:

| Evidence | Observed value | Notes |
| --- | --- | --- |
| binary | `/home/baum/.npm-global/bin/pi` | from `which pi` |
| version | `0.79.9` | from `pi --version` |
| package | `@earendil-works/pi-coding-agent@0.79.9` | global npm package |
| CLI role | coding agent CLI with read, bash, edit, write tools | from package description |
| provider flags | `--provider`, `--model`, `--mcp-config` | Pi routes to external providers |
| list-models providers | anthropic, minimax, openai-codex | Pi's own provider routing — Pi nutzt diese APIs |
| list-models (anthropic) | claude-sonnet-4-6, claude-opus-4-8, claude-fable-5, u.a. | provider-neutral Modellauswahl |
| list-models (minimax) | MiniMax-M2.7, MiniMax-M2.7-highspeed, MiniMax-M3 | MiniMax via Pi als Backend |
| list-models (openai-codex) | gpt-5.3-codex-spark, gpt-5.4, gpt-5.4-mini, gpt-5.5 | Codex-Familie via Pi |
| extension API | `pi.registerProvider()` | Pi hat eigene Provider-Extension-API (docs/custom-provider.md im npm package) |
| workspace dependency | nicht vorhanden | kein Eintrag in `package.json` des Workspace |
| providers/pi/ | nicht vorhanden | korrekt — noch nicht angelegt |

Keine Secrets, keine API-Keys, keine echten Env-Werte in diesem Dokument.

## Runtime Classification

```text
Pi = Execution Surface / CLI Agent Runner
Pi ≠ LLM API Provider
Pi ≠ providers/<name> adapter
Pi ≠ Core Authority
Pi ≠ Human Approval authority
Pi ≠ Skill Truth
```

Pi verhält sich strukturell wie Claude Code — ein Agent-CLI, der:
- eigene Tools hat (read, bash, edit, write)
- eigene Session-Verwaltung hat
- eigene Provider-Auswahl hat (`--provider`, `--model`)
- eigene Extension/Skill-Mechanismen hat
- selbst keine LLM-API-Endpunkte bereitstellt

## Layer Placement

| Layer | Examples | Pi belongs here? |
| --- | --- | --- |
| LLM Provider | `providers/minimax`, `providers/anthropic`, `providers/openai-codex` | **no** |
| Execution Surface | CLI agent runner, local coding agent, MCP-enabled runtime | **yes** |
| Core Contracts | permission boundary, core registry, skill manifests | no |
| Approval Authority | Human gate, approval evidence, verified-vs-approved | no |
| Skill Truth | `skills/<name>/SKILL.md` | no |

Der Unterschied zur `providers/<name>/`-Schicht ist grundlegend:
Ein Provider-Adapter in `providers/<name>/adapter.mjs` normalisiert Core-Skill-Calls in LLM-API-Requests.
Pi ist keine API, die normalisiert werden kann. Pi ist ein Runner, der selbst normalisiert.

## Why `providers/pi/` Is Not Justified

- `providers/<name>/` steht für LLM-/API-Provider-Surfaces mit beobachtbarer Base URL, Auth-Schema und Modell-Familie (vgl. `providers/minimax/README.md`: `Base URL: https://api.minimax.chat`, `Auth: Bearer <KEY>`).
- Pi hat keine solche API-Surface. Pi hat eine CLI-Binary.
- `pi --list-models` bestätigt: Pi nutzt anthropic, minimax, openai-codex als eigene Backends — Pi ist selbst keiner davon.
- Ein `providers/pi/adapter.mjs` würde `normalizeSkillCall()` gegen welchen Endpunkt normalisieren? Keinen — Pi hat keine HTTP-API für externe Caller.
- Die bestehende `providers/minimax/adapter.mjs` zeigt das Muster: Base URL + API-Request-Format + Auth-Header. Nichts davon existiert für Pi als LLM-Endpoint.
- Solange Pi keine echte LLM-API-Surface bereitstellt: **kein `providers/pi/`**.

## Relation To Existing Pi Docs

### `docs/pi-provider-adapter-specification.md`
- Enthält wertvolle Adapter-Grenzen (Non-Goals, Approval-Bezug, Permission Boundary)
- **Muss korrigiert werden**: beschreibt Pi als "zukünftiger Provider-/Runtime-Adapter-Kandidat unter `providers/pi/`" — das ist nach diesem Befund unzutreffend.
- Die Grenzziehungen (Pi darf keine Contracts ändern, keine Approvals ersetzen etc.) bleiben gültig und übertragen sich auf die Execution-Surface-Klassifikation.
- Status: Korrektur-Bedarf in "Provider Surface Decision" und "Adapter Role" — Zielschicht von Provider → Execution Surface.

### `docs/pi-agent-kit-adapter-core-anchor-decision.md`
- Core-Anker-Entscheidung (`model-agnostic-workflow-system` als Core) bleibt richtig.
- Pi bleibt kein Parallelbaum — weiterhin korrekt.
- **Muss präzisiert werden**: "zukünftiger Provider-/Runtime-Adapter-Kandidat unter `providers/pi/`" → "zukünftige Execution Surface unter `runtime/surfaces/pi/` oder als Extension Host".
- "Minimax 3: Pi-Runtime-Provider / Default-Kandidat" bleibt beobachtbar korrekt (Pi nutzt MiniMax als Backend), aber die Formulierung ist missverständlich — MiniMax ist Pi's Provider, nicht Pi's Runtime-Provider im Core-Sinne.

## Integration Options

Mögliche spätere Pfade — alle noch nicht implementiert:

### 1. `runtime/surfaces/pi/` (bevorzugter Pfad)
- Pi als lokale Execution Surface neben dem Core
- Core-Skills/Workflows werden über Pi-CLI ausgeführt
- Pi liefert Evidence-Output zurück (Logs, Run-Artefakte)
- Session-Management und Provider-Auswahl bleiben bei Pi
- Core bleibt Provider-neutral, Pi ist eine Execution Shell

### 2. Pi Extension Host
- Core-Skills könnten über Pi's Extension-API (`pi.registerProvider()` oder Skills-Extension) angebunden werden
- Pi lädt Skills als Extensions, nicht als LLM-Provider
- Noch kein Implementierungspfad definiert

### 3. Provider Wrapper (nicht empfohlen, aktuell nicht gerechtfertigt)
- Nur falls Pi später eine eigene HTTP-API-Surface bereitstellt (z. B. lokaler Server-Modus)
- In diesem Fall: neue Evidence-Prüfung nötig
- Aktuell: kein Anhaltspunkt dafür

## Missing For Integration

Offene Voraussetzungen, bevor ein Pi-Integration-Slice sinnvoll ist:

- workspace-lokale Pi-Konfiguration (Pi ist aktuell nur global installiert, nicht in `package.json`)
- dokumentierter sicherer Start-/Smoke-Befehl ohne Secrets
- klare Provider-Auswahl für Pi-Sessions (welcher Provider/welches Modell als Default?)
- Secret-Handling via `.env.example` statt echter `.env`
- Evidence-Output-Format (wie liefert Pi Logs/Artefakte zurück an Core?)
- Human-Approval-Grenzen für Pi-Sessions (Pi kann `bash` — Approval-Tier?)
- Mapping von Core-Skill-Contracts zu Pi-Extension-Mechanismen
- Runtime-Surface-Policy (analog zu `docs/computer-use-policy.md` für Pi-Sessions)
- Architekturkorrektur der bestehenden Pi-Docs (siehe "Relation To Existing Pi Docs")

## Non-Goals

- kein `providers/pi/`
- kein Adapter-Code
- kein `export.json`
- kein Core-Registry-Eintrag
- keine Runtime-Aktivierung
- keine Provider-Implementation
- keine Skill-Migration
- keine Contract-Änderung
- keine Validatoren
- keine Secrets
- keine Workspace-Dependency-Änderung in `package.json`

## Recommended Next Gate

**Pi Execution Surface Reclassification Slice** — docs-only, kein Runtime-Code:

Ziel:
1. `docs/pi-provider-adapter-specification.md` korrigieren: Zielschicht von "provider adapter" zu "execution surface" — insbesondere "Provider Surface Decision" und "Adapter Role"
2. `docs/pi-agent-kit-adapter-core-anchor-decision.md` korrigieren: "Adapter-Zielbild" präzisieren — `providers/pi/` → `runtime/surfaces/pi/` oder Extension Host
3. Dieses Dokument (`docs/pi-local-runtime-evidence.md`) als Canonical-Reference für die Korrektur verwenden
4. Kein Runtime-Code, keine Contract-Änderung, keine Provider-Änderung in diesem Slice
