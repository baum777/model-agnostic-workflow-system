# Pi Provider Adapter Specification

## Class
derived / docs-only / provider-adapter specification — reclassified: Pi ist Execution Surface, kein LLM-Provider

## Status
proposed — reclassified (siehe `docs/pi-local-runtime-evidence.md`, commit `c14bc52`)

## Use rule
Dieses Dokument beschreibt ursprünglich Pi als zukünftige Provider-Adapter-/Runtime-Schicht. Es aktiviert keinen Provider, erzeugt keine Runtime-Fähigkeit und ändert keine Contracts. Canonical authority bleibt `docs/pi-agent-kit-adapter-core-anchor-decision.md` (Strukturentscheidung), `docs/architecture.md` und `docs/authority-matrix.md` (Doc-Class-Authority), `core/contracts/*` (Contract-Wahrheit).

**Reklassifikation (2026-06-23):** Pi wurde lokal als `@earendil-works/pi-coding-agent@0.79.9` beobachtet. Pi ist ein CLI-Agent-Runner / Execution Surface — kein LLM-API-Provider. Die Schichtannahme "Pi unter `providers/<name>/`" ist damit hinfällig. Canonical Evidence: `docs/pi-local-runtime-evidence.md`. Die Grenzziehungen dieses Dokuments (Approval, Permission Boundary, Skill Contracts) bleiben gültig und übertragen sich auf die Execution-Surface-Klassifikation.

## Purpose

- Pi ist nicht Core. Der Core-Anker für Baum-OS / Harness / Skill-, Provider- und Governance-Logik bleibt `model-agnostic-workflow-system`.
- Pi ist kein Parallelbaum. Es wird kein eigener `pi-agent-kit/`-Baum mit eigenem Schema, eigenen Validatoren oder eigener Provider-Logik angelegt (bestätigt in `docs/pi-agent-kit-adapter-core-anchor-decision.md`, Abschnitt "Entscheidung").
- Pi ist ein potenzieller Adapter zum Core-Anker — strukturell analog zu den bestehenden Provider-Scaffolds unter `providers/` (`minimax`, `anthropic`, `codex`, `qwen`, `kimi`, `openai` u. a.).
- Skills, Provider-Registrierung, Permission Boundaries und Approval bleiben Core-gesteuert. Pi erbt diese Strukturen, definiert sie nicht neu.

## Reference Pattern

Übernommen aus `providers/minimax/README.md` (beobachtetes Muster, nicht dupliziert):

- Provider-Dokumentation getrennt von Core-Logik: ein Adapter-README beschreibt nur die Provider-spezifische Verpackung, nicht das portable Kernverhalten.
- Klare Status-Kennzeichnung (dort: `Status: scaffolded.`) statt impliziter Vollständigkeit.
- Beobachtet vs. inferred/proposed getrennt: API-Surface-Angaben (Base URL, Auth-Schema, Model-Familie) sind faktisch beobachtbar, sobald ein Adapter existiert; bei Pi existiert aktuell kein solcher Adapter, daher bleibt dieses Dokument vollständig auf der proposed-Seite.
- Eine README allein aktiviert keine Implementation — `providers/minimax/README.md` selbst sagt nichts über tatsächliche Laufzeitverdrahtung aus, sondern dokumentiert nur die vorgesehene Adapter-Form.

Dieses Muster wird hier referenziert, nicht kopiert: Es existiert kein `providers/pi/` und keine an dieses Dokument gebundene API-Surface-Tabelle mit echten Endpunkten.

## Adapter Role

**Reklassifikation:** Pi ist kein Provider-Adapter im Sinne von `providers/<name>/`. Pi ist eine Execution Surface.

Pi wird reklassifiziert als:

- Execution Surface / CLI-Agent-Runner (lokal beobachtet, nicht integriert) — kein LLM-API-Provider
- Workflow-Ausführungsfläche für bereits im Core definierte Workflows — aber über CLI-Ausführung, nicht über Provider-Adapter-Normalisierung
- Pi nutzt selbst Provider wie Anthropic, MiniMax, OpenAI-Codex als Backends (`pi --list-models`) — Pi ist keiner dieser Provider
- möglicher Execution Host für Core-Skills: `runtime/surfaces/pi/` oder Extension Host — nicht `providers/pi/adapter.mjs`

Canonical Evidence: `docs/pi-local-runtime-evidence.md`.

Pi ist explizit:

- nicht Authority-Layer
- nicht Skill-Truth (Skill-Verträge bleiben in `skills/<name>/SKILL.md`)
- nicht Approval-Instanz (Human Approval bleibt Primat, siehe `docs/human-approval-tier-extension.md`)

## Proposed Responsibilities

Pi darf später (nach Aktivierung, außerhalb dieses Slices) beantragen/ausführen:

- Workflow ausführen
- Provider aufrufen
- Skill-Anfragen weiterreichen
- Evidence zurückmelden
- Logs liefern
- bounded runtime context halten

Pi darf nicht:

- Core Contracts ändern
- Skills eigenmächtig erweitern
- Permissions selbst erhöhen
- Human Approval ersetzen
- Computer-Use selbst freigeben
- Secrets sichtbar machen
- `verified` als `approved` behandeln

## Required Future Fields

Illustrativ, nicht angewendet — `future proposal only`:

```yaml
allowed_agents: []
allowed_models: []
write_mode: read_only | draft_only | approved_write
computer_use_allowed: false
human_approval_required: true
approval_tier: read_only | draft_only | approved_write | sensitive_action | forbidden_or_blocked
evidence_required: []
```

Diese Felder sind dieselben offenen Gaps, die bereits in `docs/pi-agent-kit-adapter-core-anchor-decision.md` ("Offene Gaps"), `docs/skill-contract-gap-analysis.md` (Gap-Tabelle) und `docs/human-approval-tier-extension.md` (Approval-Tier-Modell) benannt sind. Dieses Dokument fügt keine neuen Felder hinzu, sondern projiziert die bestehenden Gaps auf einen konkreten zukünftigen Pi-Adapter.

## Relation To Computer Use Policy

- Pi darf Computer-Use nicht als Default behandeln.
- Computer-Use ist Fallback — letzter Punkt in der "Preferred Interface Order" aus `docs/computer-use-policy.md`.
- Computer-Use braucht explizite, scoped, one-off Human Approval — unabhängig davon, ob Pi oder ein anderer Agent die Aktion anfragt.
- `computer_use_allowed: true` wäre für Pi nur Antragsfähigkeit, keine Ausführungsfreigabe.
- `docs/computer-use-policy.md` bleibt maßgebliche Referenz; dieses Dokument definiert keine konkurrierende Policy.

## Relation To Human Approval

- Human Approval bleibt Primat für riskante Aktionen — auch wenn Pi als Ausführungsschicht zwischengeschaltet ist.
- Pi darf keine Freigabe simulieren.
- Pi darf sich selbst und keinem anderen Agenten höhere Rechte geben.
- `verified` ist nicht `approved` (siehe `docs/human-approval-tier-extension.md`, Abschnitt "Relation To Execution Claims").
- Pi kann Evidence liefern (Logs, Run-Artefakte), aber Approval nicht ersetzen.

## Relation To Permission Boundary

- `core/contracts/permission-boundary.json` bleibt durch dieses Dokument unverändert.
- Dieses Dokument ist kein Contract und erzeugt keine Contract-Wahrheit.
- Die in `docs/permission-boundary-approval-extension-proposal.md` skizzierte PBC-Projektion (`approval_tier`, `agent_privilege_level`, `human_gate.request`) bleibt Proposal — auch für einen späteren Pi-Adapter gilt: keine Schema-Erweiterung ohne separaten Contract-/Schema-Gate.
- Ein zukünftiger Pi-Adapter würde, wie jeder andere Provider-Adapter, PBC-Permissions deklarieren müssen, nicht eigene Permission-Logik einführen.

## Relation To Skill Contracts

- Pi führt Skills nicht frei aus. Ein Pi-Adapter würde Skill-Aufrufe an den Core weiterreichen, nicht selbst interpretieren oder erweitern.
- Skills bleiben Arbeitsverträge im Core (`skills/<name>/SKILL.md`).
- Skill-Gaps (`allowed_agents`, `allowed_models`, `write_mode`, `computer_use_allowed` u. a.) bleiben ausschließlich in `docs/skill-contract-gap-analysis.md` dokumentiert; dieses Dokument duplitziert die Gap-Tabelle nicht.
- Kein Skill wird in diesem Slice migriert oder geändert.

## Provider Surface Decision

**`providers/pi/` ist nicht gerechtfertigt — Kategoriefehler, nicht nur fehlende Voraussetzungen.**

Das bestehende Muster (`providers/minimax/README.md`, `providers/anthropic/`, `providers/codex/` etc.) dokumentiert Adapter für LLM-API-Provider mit beobachtbarer HTTP-Surface: Base URL, Auth-Schema, Model-Familie, Tool-Use-Format (Beispiel: `providers/minimax/README.md`: `Base URL: https://api.minimax.chat`, `Auth: Bearer <MINIMAX_API_KEY>`). Ein `providers/<name>/adapter.mjs` normalisiert Core-Skill-Calls in API-Requests gegen diesen Endpunkt.

**Pi hat keine solche API-Surface.** Pi ist ein lokaler CLI-Agent-Runner (`@earendil-works/pi-coding-agent@0.79.9`), der selbst LLM-Provider (Anthropic, MiniMax, OpenAI-Codex) als Backends nutzt. Canonical Evidence: `docs/pi-local-runtime-evidence.md`.

Warum kein `providers/pi/README.md`:

- Ein `providers/pi/adapter.mjs` würde `normalizeSkillCall()` gegen welchen HTTP-Endpunkt normalisieren? Keinen — Pi hat keine HTTP-API für externe Caller.
- `pi --list-models` bestätigt: Pi nutzt anthropic, minimax, openai-codex — Pi ist selbst keiner davon.
- `providers/pi/` wäre ein Schichten-Fehler, kein bloß verfrühter Slice.

**Wann `providers/pi/` gerechtfertigt wäre (Bedingung, nicht Zeitplan):**

Nur wenn Pi eine eigene LLM-HTTP-API-Surface bereitstellt (z. B. lokaler Server-Modus mit Endpunkt, Auth-Schema und Modell-Routing). Aktuell kein Anhaltspunkt dafür. Neue Evidence-Prüfung nötig, bevor dieser Pfad wieder geöffnet wird.

**Korrekter Zielpfad statt `providers/pi/`:**

- `runtime/surfaces/pi/` — Pi als lokale Execution Surface (bevorzugt)
- Pi Extension Host — Core-Skills via Pi Extension API
- Beide Pfade noch nicht implementiert, kein Code in diesem Slice.

## Non-Goals

- keine Runtime
- keine Provider-Implementation
- kein `providers/pi/`
- kein `export.json`
- keine Contract-Änderung
- keine Skill-Migration
- keine Validatoren
- keine Computer-Use-Aktivierung
- keine Human-Approval-Automatisierung
- keine Secrets
- kein Submodule-Update

## Next Gate

**Pi Execution Surface Integration Slice** — erst wenn folgende Voraussetzungen erfüllt sind:

- workspace-lokale Pi-Konfiguration (Pi in `package.json`, nicht nur global installiert)
- dokumentierter sicherer Smoke-Befehl ohne Secrets
- klare Provider-Auswahl für Pi-Sessions
- Human-Approval-Grenzen für Pi-Sessions (Pi kann `bash` — Approval-Tier?)
- Mapping von Core-Skill-Contracts zu Pi-Execution-Mechanismen

Vorgänger-Pfad `providers/pi/README.md` ist nicht mehr der empfohlene Gate — Begründung: Kategoriefehler (Pi ist kein LLM-Provider), dokumentiert in `docs/pi-local-runtime-evidence.md`.

Zielpfad: `runtime/surfaces/pi/` oder Pi Extension Host — erst nach Erfüllung der obigen Voraussetzungen.
