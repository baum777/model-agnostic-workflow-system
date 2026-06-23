# Pi Integration Path Decision

## Class
derived / docs-only / integration-path decision

## Status
proposed — no runtime integration

## Decision

```text
Decision:        Option C — No Integration Yet
Preferred Future Path: Option A — runtime/surfaces/pi/
Rejected Path:   providers/pi/
Deferred Path:   Pi Extension Host
```

## Use Rule

Dieses Dokument entscheidet nur den Integrationspfad.
Es aktiviert keine Runtime, erzeugt keinen Runtime-Pfad und startet keine Pi-Session.
Canonical authority bleibt:
- `docs/pi-local-runtime-evidence.md` (Evidence-Basis, commit `c14bc52`)
- `docs/pi-execution-surface-policy.md` (Approval-Tiers)
- `docs/pi-secret-handling-spec.md` (Secret-Handling)
- `docs/pi-smoke-command-design.md` (Smoke-Design)

## Context

| Fakt | Status |
|---|---|
| Pi lokal installiert und ausführbar | ✓ `/home/baum/.npm-global/bin/pi`, Version `0.79.9` |
| Pi ist Execution Surface / CLI-Agent-Runner | ✓ dokumentiert, 5 commits |
| Pi ist kein LLM-Provider | ✓ reklassifiziert, commit `44c52f6` |
| `providers/pi/` ist Kategoriefehler | ✓ gesperrt in 3 Docs, 2 Commits |
| Approval-Policy existiert | ✓ `docs/pi-execution-surface-policy.md` |
| Secret-Handling dokumentiert | ✓ `docs/pi-secret-handling-spec.md`, commit `6575eb4` |
| Smoke-Design dokumentiert | ✓ `docs/pi-smoke-command-design.md`, commit `79efe52` |
| Workspace-Reproduzierbarkeit (P-01) | offen |
| Provider-Auswahl (P-04) | offen |
| `.env.example`-Template | offen |
| Echter Smoke-Run | offen |
| `runtime/surfaces/pi/` | nicht vorhanden |

Beobachtet via `pi --list-models` (read-only, kein Provider-Call):
Aktive Provider mit verfügbaren Modellen: `anthropic`, `minimax`, `openai-codex`.
`google` erscheint **nicht** in `pi --list-models` — obwohl `pi --help` `google` als Default-Provider nennt. Dies bedeutet: kein Google-Modell ist aktuell für Pi konfiguriert/verfügbar. `google` als Provider-Kandidat ist vorerst **ausgeschlossen**.

## Option Assessment

| Option | Description | Current Fit | Blockers | Decision |
|---|---|---|---|---|
| A `runtime/surfaces/pi/` | Pi als Runtime Surface im `runtime/` Layer | future-preferred | P-01 / P-04 / `.env.example` / Smoke-Run | defer |
| B Extension Host | Pi lädt Core-Skills/Exports via Extension-API | possible later | Extension-API-Contracts unverified, doppeltes Provider-Routing riskant | defer |
| C No Integration Yet | nur docs/evidence, kein Code | **best current fit** | keine | **accept now** |
| Rejected `providers/pi/` | Pi als LLM-Provider-Adapter | Kategoriefehler | falscher Layer, keine HTTP-API-Surface | reject permanently |

## Rationale

### Option C — No Integration Yet (angenommen)

Sofortige Runtime-Integration wäre zu früh:

1. **P-01 Workspace-Reproduzierbarkeit fehlt**: Pi ist nur global installiert (`/home/baum/.npm-global/bin/pi`), nicht als Workspace-Dependency in `package.json`. Ohne reproduzierbare Installation kann kein Runtime-Surface-Pfad stable sein.

2. **P-04 Provider-Auswahl fehlt**: Drei aktive Provider (`anthropic`, `minimax`, `openai-codex`) — keiner ist als Workspace-Default für Pi-Sessions entschieden. Eine `runtime/surfaces/pi/session-policy.md` ohne Provider-Default wäre unvollständig.

3. **`.env.example`-Template fehlt**: Env-Var-Namen für `minimax` und (ggf. andere) sind noch nicht gegen Pi-Help verifiziert. `MINIMAX_API_KEY` erscheint nicht in Pi-Help-Env-Var-Liste. Ohne sauberes Template riskiert ein Runtime-Surface falsche Secret-Konfiguration.

4. **Kein echter Smoke-Run**: Der Smoke-Command ist design-ready, aber nie ausgeführt. Ohne Smoke-Run-Evidence kann keine Runtime-Surface-Datei behaupten, dass Pi in diesem Workspace funktioniert.

5. **Falsche Claims verhindern**: Einen `runtime/surfaces/pi/` Pfad anzulegen, bevor Smoke + Provider + `.env.example` existieren, würde eine Laufzeitfähigkeit suggerieren, die noch nicht belegt ist. Per `docs/pi-local-runtime-evidence.md` und dem Runtime-Evidence-vs-Surface-Auditor-Skill: Docs ohne ausführenden Code + Smoke + Test sind Surface-Evidence, keine Hard Evidence.

No Integration Yet verhindert diese Fehler und hält den Core sauber.

### Option A — `runtime/surfaces/pi/` (bevorzugter Zukunftspfad)

Passt korrekt zur Reklassifikation:
- Pi ist Execution Surface — `runtime/surfaces/` ist der logische Ort (nicht `providers/`)
- Analog zu wie andere Execution Surfaces von anderen CLI-Tools gehandelt würden
- Core-Skills/Workflows würden über Pi-CLI ausgeführt, nicht via Provider-Adapter-Normalisierung
- Pi liefert Evidence-Output zurück (Logs, Exit-Code, Marker)
- Session-Management und Provider-Auswahl bleiben bei Pi, Core bleibt Provider-neutral

Spätere Files (nur Konzept, nicht anlegen):
```text
runtime/surfaces/pi/
├── README.md          — Surface-Steckbrief, Approval-Tier-Ref
├── smoke-command.md   — ausgeführter Smoke mit Evidence
├── evidence-contract.md — was ein Pi-Run-Output enthalten darf/muss
└── session-policy.md  — Provider-Default, Model, Tool-Mode, Secret-Loading-Ref
```

Dieser Pfad darf erst entstehen, wenn alle Preconditions erfüllt sind (siehe unten).

### Option B — Pi Extension Host (vertagt)

Pi hat eine Extension-API (`pi.registerProvider()`, beobachtet in npm-Package-Docs, dokumentiert in `docs/pi-local-runtime-evidence.md`). Aber:

- **Extension-API-Contracts nicht verifiziert**: Kein lokaler Nachweis des genauen Extension-Registrierungs-Schemas oder -Formats. `pi.registerProvider()` ist in npm-Package-Doku erwähnt, aber nicht in Pi-Help oder lokalen Config-Dateien spezifiziert.
- **Doppeltes Provider-Routing riskant**: Core-Skills via Pi-Extension würden Pi zu einem weiteren Routing-Layer machen — Pi routet selbst zu anthropic/minimax/openai-codex. Doppeltes Routing erhöht Komplexität ohne klaren Nutzen gegenüber Option A.
- **Human Approval schwerer zu steuern**: Wenn Pi Core-Skills als Extensions lädt, ist der Approval-Flow schwerer zu prüfen als bei einem klaren `runtime/surfaces/pi/` Surface-Layer.
- **Kein Blocker für Zukunft**: Extension Host bleibt interessant, sobald konkrete Extension-Contract-Evidence vorliegt. Vertagt, nicht abgelehnt.

### Rejected: `providers/pi/`

Permanent gesperrt als Kategoriefehler:
- Pi hat keine HTTP-API-Surface (kein Base URL, kein Auth-Schema, keine Modell-Normalisierungs-Endpunkte)
- `providers/<name>/adapter.mjs` normalisiert Core-Skill-Calls gegen eine LLM-HTTP-API — Pi ist keine solche
- `pi --list-models` zeigt: Pi nutzt anthropic/minimax/openai-codex als eigene Backends — Pi selbst ist keiner dieser Provider
- Dokumentiert in: `docs/pi-local-runtime-evidence.md`, `docs/pi-provider-adapter-specification.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`

## Provider Selection Notes

Beobachtet via `pi --list-models` und `pi --help` (read-only, kein Provider-Call):

| Provider | Pi-Listed (--list-models)? | Env Var confirmed in --help? | Status |
|---|---|---|---|
| `anthropic` | yes — 25+ Modelle | `ANTHROPIC_API_KEY` ✓ | **strongest candidate** |
| `openai-codex` | yes — 4 Modelle (gpt-5.x-Reihe) | `OPENAI_API_KEY` ✓ | candidate |
| `minimax` | yes — 3 Modelle (MiniMax-M2.7, M3) | nicht in Pi-Help-Env-Liste | verify before use |
| `google` | **nein — keine Modelle in --list-models** | nicht in Pi-Help-Env-Liste | **ausgeschlossen** |

**Wichtige Updates gegenüber `docs/pi-smoke-command-design.md` und `docs/pi-secret-handling-spec.md`:**

1. **`google` nicht in `pi --list-models`**: Pi-Help nennt `google` als Default-Provider-Namen (`--provider <name>  Provider name (default: google)`), aber `pi --list-models` zeigt keine Google-Modelle. Kein Google-Provider für Pi-Sessions verwenden, bis neue Evidence vorliegt.

2. **`minimax` Env Var unklar**: `MINIMAX_API_KEY` erscheint nicht in Pi-Help. Möglicherweise nutzt Pi für MiniMax ein anderes Konfigurationsformat (z. B. über `pi config` TUI oder `--api-key` Flag — letzteres ist verboten per `docs/pi-secret-handling-spec.md`). MiniMax erst nach Verifikation des korrekten Env-Var-Namens nutzen.

3. **`anthropic` als Erstkandidat**: Env Var `ANTHROPIC_API_KEY` in Pi-Help bestätigt, 25+ Modelle in `--list-models` verfügbar, Standard-Konvention klar.

Keine Provider-Auswahl in diesem Slice. P-04 entscheidet.

## Preconditions Before Runtime Surface

Muss-Voraussetzungen für Option A (geordnet):

1. **P-01 Workspace-Reproduzierbarkeit**: `package.json`-Eintrag oder `npx`-basierter Pi-Aufruf — Pi muss reproducible sein, nicht nur global installiert
2. **P-04 Provider-/Model-Default-Entscheidung**: Welcher Provider wird für Pi-Workspace-Sessions genutzt? (Kandidat: `anthropic`)
3. **`.env.example` oder config-template**: Leere Platzhalter für verifizierte Env-Var-Namen — erst nach P-04, weil Env-Var-Namen provider-abhängig sind
4. **Sicherer Smoke-Run mit Evidence**: `pi --provider <name> --model <name> --no-tools --no-session --print "Return exactly: PI_SMOKE_OK"` — ausgeführt und dokumentiert
5. **Evidence-Output-Contract**: Was darf/muss ein Pi-Run-Output enthalten? (per `docs/pi-smoke-command-design.md` bereits designiert)
6. **Approval-Tier-Mapping**: aus `docs/pi-execution-surface-policy.md` — bereits geschlossen (P-06)
7. **Secret-Boundary**: aus `docs/pi-secret-handling-spec.md` — konzeptionell geschlossen (P-05)
8. **kein `providers/pi/`**: permanent gesperrt
9. **keine Open-ended Sessions**: `--print` enforced für alle Smoke/Test-Runs
10. **fail-closed bei unklarer Tool-/Secret-/Write-Grenze**: per `docs/pi-execution-surface-policy.md`

## Future Target Shape

Nur Konzept, nicht anlegen in diesem Slice:

```text
runtime/surfaces/pi/
├── README.md            — Surface-Steckbrief: Pi-Version, Provider-Default, Approval-Tier-Ref
├── smoke-command.md     — ausgeführter Smoke-Run mit Evidence (Exit-Code, Marker, Timestamp)
├── evidence-contract.md — erlaubte/verbotene Felder in Pi-Run-Outputs
└── session-policy.md    — Provider-Default, Model, Tool-Mode, Secret-Loading-Ref, Tier-Mapping
```

Dieser Pfad entsteht erst, wenn alle 10 Preconditions oben erfüllt sind.

## Relation To Existing Pi Docs

| Dokument | Relation zu dieser Entscheidung |
|---|---|
| `docs/pi-local-runtime-evidence.md` | Evidence-Basis für Option A/C; bestätigt: kein `providers/pi/` |
| `docs/pi-provider-adapter-specification.md` | Provider-Surface-Decision permanent auf "Kategoriefehler" gesetzt |
| `docs/pi-agent-kit-adapter-core-anchor-decision.md` | Core-Anker-Entscheidung bestätigt; Adapter-Zielbild = `runtime/surfaces/pi/` |
| `docs/pi-execution-surface-policy.md` | Approval-Tier-Mapping für Option A vorbereitet |
| `docs/pi-secret-handling-spec.md` | Secret-Boundary für Option A vorbereitet |
| `docs/pi-smoke-command-design.md` | Smoke-Design für Option A vorbereitet |

## Non-Goals

- keine Runtime-Integration
- kein `runtime/surfaces/pi/`
- kein `providers/pi/`
- keine Provider-Implementation
- keine Contract-Änderung
- keine Validatoren
- keine Skills
- keine `.env.example`
- keine Smoke-Ausführung
- keine Secrets
- keine README- oder Architecture-Änderungen

## Recommended Next Gate

**P-04 Pi Provider Default Decision**

Ziel:
- Entscheiden, welcher Provider/Model-Default für spätere Pi-Workspace-Sessions genutzt wird
- `anthropic` ist stärkster Kandidat: `ANTHROPIC_API_KEY` in Pi-Help bestätigt, 25+ Modelle in `--list-models`, Standard-Konvention klar
- `openai-codex` als Alternative: `OPENAI_API_KEY` in Pi-Help bestätigt, 4 Modelle verfügbar
- MiniMax und Google erst nach Env-Var-Verifikation
- Nach P-04: `.env.example`-Template mit verifizierten Platzhaltern
- Nach `.env.example`: P-01 (Workspace-Reproduzierbarkeit, `package.json`)
- Nach P-01: echter Smoke-Run mit Evidence → P-03 vollständig geschlossen
- Danach: `runtime/surfaces/pi/` anlegen (Option A)

P-04 ist der unmittelbare, kleinstmögliche nächste Slice.
