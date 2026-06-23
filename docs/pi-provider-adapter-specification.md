# Pi Provider Adapter Specification

## Class
derived / docs-only / provider-adapter specification

## Status
proposed — not implemented

## Use rule
Dieses Dokument beschreibt Pi als zukünftige Adapter-/Runtime-Schicht. Es aktiviert keinen Provider, erzeugt keine Runtime-Fähigkeit und ändert keine Contracts. Canonical authority bleibt `docs/pi-agent-kit-adapter-core-anchor-decision.md` (Strukturentscheidung), `docs/architecture.md` und `docs/authority-matrix.md` (Doc-Class-Authority), `core/contracts/*` (Contract-Wahrheit).

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

Pi wird beschrieben als:

- Runtime-Adapter (zukünftig, nicht aktiv)
- Workflow-Ausführungsfläche für bereits im Core definierte Workflows
- möglicher Connector zu Minimax 3, lokalen Modellen oder externen Modellen — als Ausführungsschicht, nicht als Modell- oder Provider-Wahrheit

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

**Warum `docs/pi-provider-adapter-specification.md` und nicht `providers/pi/README.md`:**

Das bestehende Muster (`providers/minimax/README.md`, `providers/anthropic/`, `providers/codex/` etc.) dokumentiert Adapter, für die bereits eine reale, beobachtbare API-Surface existiert (Base URL, Auth-Schema, Model-Familie, Tool-Use-Format) — auch wenn der Adapter selbst nur `scaffolded` ist. Für Pi existiert aktuell keine solche beobachtbare Surface: keine Pi-Laufzeitkonfiguration im Workspace gefunden (bereits in `docs/pi-agent-kit-adapter-core-anchor-decision.md`, Abschnitt "Adapter-Zielbild" festgehalten: "Claude in Pi: nur falls lokal belegbar — aktuell nicht belegt"). Ein `providers/pi/README.md` würde an dieser Stelle eine API-Surface suggerieren, die nicht beobachtet, sondern nur erwartet ist. Eine `docs/`-Spezifikation hält die Unterscheidung zwischen "Provider-Verzeichnis mit beobachtbarer Surface" (`providers/`) und "Konzept-/Gap-Dokumentation ohne beobachtbare Surface" (`docs/`) explizit aufrecht — dieselbe Unterscheidung, die bereits zwischen `docs/skill-contract-gap-analysis.md` (Gap-Analyse) und realen `SKILL.md`-Dateien (Implementierung) gilt.

**Warum noch kein `providers/pi/README.md` angelegt wird:**

Ein `providers/<name>/`-Verzeichnis impliziert im bestehenden Muster mindestens einen scaffolded Adapter mit benennbarer API-Surface. Für Pi sind `allowed_agents`, `allowed_models` und `write_mode` noch nicht entschieden (offene Gaps), und es gibt keine bestätigte Pi-Laufzeitumgebung im Workspace. Ein `providers/pi/`-Verzeichnis vor dieser Klärung würde eine Implementationsbereitschaft suggerieren, die nicht vorliegt — im Widerspruch zur Non-Goals-Liste der Adapter-Core-Anchor-Decision ("Keine Provider-Implementierung").

**Wann ein späterer `providers/pi/README.md`-Slice sinnvoll wäre:**

- wenn Provider-Surface autorisiert ist (explizite Owner-Freigabe, ein `providers/pi/`-Verzeichnis anzulegen)
- wenn `allowed_agents` / `allowed_models` / `write_mode` für Pi entschieden sind
- wenn Runtime-Grenzen und Approval-Bezug klar sind (mindestens eine bestätigte, beobachtbare Pi-Laufzeitkonfiguration im Workspace)

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

Empfohlen: **Skill-Schema-Proposal für `allowed_agents` / `allowed_models` / `write_mode`** als nächster kleiner, docs-only Slice.

Begründung: Diese drei Felder sind die am häufigsten wiederkehrenden offenen Gaps — sie werden in `docs/pi-agent-kit-adapter-core-anchor-decision.md`, `docs/skill-contract-gap-analysis.md` und in diesem Dokument gleichermaßen als Voraussetzung benannt, bevor irgendein Provider-Surface-Slice (`providers/pi/README.md`) sinnvoll wird. Eine Klärung dieser drei Felder schließt die Voraussetzung für den in "Provider Surface Decision" benannten späteren Schritt, ohne selbst eine Contract-Änderung oder Runtime-Aktivierung zu sein.

Alternativen, die bewusst nicht empfohlen werden: ein Docs-README-Link-Slice für diese neue Datei (kleinster Scope, aber inhaltlich nicht der nächste sinnvolle Schritt, da `docs/README.md` laut Auftrag in diesem Slice nicht angefasst werden darf und ein reiner Link-Slice keine offene Frage schließt); ein Provider-Surface-Decision-Slice für `providers/pi/README.md` (verfrüht — siehe "Provider Surface Decision" oben, Voraussetzungen noch nicht erfüllt).
