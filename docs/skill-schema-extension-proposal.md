# Skill Schema Extension Proposal

## Class
derived / docs-only / skill-schema proposal

## Status
proposal-only — not implemented

## Use rule
Dieses Dokument beschreibt mögliche zukünftige Skill-Contract-Felder.
Es ändert keine Skills, keine Contracts, keine Validatoren und aktiviert keine Runtime-Fähigkeit.
Canonical authority bleibt `docs/skill-contract-gap-analysis.md` (Gap-Ledger),
`docs/human-approval-tier-extension.md` (Approval-Tier-Modell),
`docs/permission-boundary-approval-extension-proposal.md` (PBC-Projektion),
`docs/computer-use-policy.md` (Computer-Use-Policy),
`docs/pi-provider-adapter-specification.md` (Pi-Adapter-Spezifikation),
`core/contracts/permission-boundary.json` (Contract-Wahrheit).

---

## Purpose

Bestehende Skills (`skills/*/SKILL.md`) sind Arbeitsverträge, die bereits eine klare Struktur haben — Frontmatter-Felder, Workflow-Schritte, Non-Goals, Output-Format. Sie sind jedoch noch nicht vollständig maschinenlesbar für Agent-/Model-/Write-Grenzen.

Dieses Dokument adressiert drei konkrete Felder, die wiederholt als offene Gaps benannt wurden:

- `docs/pi-agent-kit-adapter-core-anchor-decision.md` → "Offene Gaps": `allowed_agents`, `allowed_models`, `write_mode`
- `docs/skill-contract-gap-analysis.md` → Gap-Tabelle (Priority: `high` für alle drei)
- `docs/pi-provider-adapter-specification.md` → "Required Future Fields": dieselben drei Felder explizit projiziert auf den Pi-Adapter

Der Grund: Pi darf später als Adapter nur mit maschinenlesbaren Grenzen an Skills, Provider-Routing und Approval anschließen. Ohne klare `allowed_agents`-, `allowed_models`- und `write_mode`-Definitionen in Skill-Contracts kann kein Pi-Adapter verlässlich prüfen, ob er einen Skill anfragen, welches Modell er verwenden und wie weit er schreiben darf.

Dieses Dokument ist Proposal, keine Migration. Es verschiebt keinen existierenden SKILL.md-Frontmatter-Wert und ändert keinen Contract.

Human Approval und Permission Boundary bleiben maßgeblich — das Proposal schließt sie nicht aus und ersetzt sie nicht.

---

## Current Skill Baseline

Beobachtet aus: `skills/safe-scoped-commit/SKILL.md`, `skills/runtime-policy-auditor/SKILL.md`,
`skills/repo-intake-sot-mapper/SKILL.md`, `skills/getdesign-style-router/SKILL.md`,
`skills/patch-strategy-designer/SKILL.md` (direkte Lesungen dieser Session).

### Bestehende Frontmatter-Felder (tatsächlich beobachtet)

```yaml
name: <string>
description: <string>
version: <semver>
classification: shared | shared-with-local-inputs
requires_repo_inputs: true | false
produces_structured_output: true | false
safe_to_auto_run: true | false
owner: <string>
status: extracted | ...
input_contract_path: <path>   # optional, nur bei requires_repo_inputs: true
```

### Bestehende Body-Abschnitte (tatsächlich beobachtet)

- `Purpose` / `Overview` / `Trigger`
- `When Not To Use`
- `Non-Goals`
- `Expected Inputs` / `Local Inputs`
- `Workflow` (nummerierte Schritte)
- `Output`
- `Quality Checks` (optional)
- `References` (optional)

### Fehlende maschinenlesbare Felder (kein Frontmatter-Eintrag vorhanden)

Beobachtung bestätigt die Gap-Tabelle aus `docs/skill-contract-gap-analysis.md`:

- `allowed_agents` — fehlt vollständig; keine Frontmatter-Entsprechung
- `allowed_models` — fehlt vollständig; kein Frontmatter-Äquivalent (Provider-Neutralität ist Designziel, aber kein per-Skill-Feld)
- `write_mode` — fehlt; `safe_to_auto_run` ist das einzige bestehende Risk-Signal, aber es ist ein grober Boolean (Scope: Auto-Ausführung, nicht Write-Tiefe)
- `human_approval_required` — fehlt als Frontmatter-Feld; existiert nur als prose-basierte Workflow-Konvention (z. B. Schritt "stop as blocked" in `safe-scoped-commit`)
- `computer_use_allowed` — fehlt vollständig; `docs/computer-use-policy.md` dokumentiert explizit, dass kein Skill dieses Feld aktuell deklariert

### Felder, die nur semantisch/prosaartig vorhanden sind

- `safe_to_auto_run: false` drückt aus, dass menschliche Steuerung erwartet wird — ist aber kein strukturiertes Approval-Feld
- Workflow-Schritte wie "stop with `blocked`" oder "verify before applying" sind Prozess-Konventionen, keine maschinenlesbaren Grenzen
- `owner`-Feld impliziert Ownership, aber kein Agent-Rollen-Scope

---

## Proposed Fields

Die folgenden Felder werden als mögliche zukünftige Erweiterung des SKILL.md-Frontmatters vorgeschlagen.

**Proposal-Status: future schema extension — not current schema, not validated, not migrated.**

```yaml
allowed_agents: []
allowed_models: []
write_mode: read_only | draft_only | approved_write
```

---

### Field: `allowed_agents`

**Zweck:**
Deklariert, welche Agenten-Rollen einen Skill anfragen oder ausführen dürfen. Begrenzt den Zugriff auf Skill-Funktionalität auf autorisierte Rollen, ohne die Rollen selbst zu definieren (Rollen-Definitionen bleiben in `AGENTS.md`, `WORKFLOW.md`, `core/contracts/handoff-protocol.json`).

**Erlaubte Werte / erwartete Form:**
Eine Liste von Rollen-Identifikatoren. Mögliche Zukunftswerte (nur Vorschlag):

```yaml
allowed_agents:
  - planner
  - drafter
  - reviewer
  - verifier
  - bounded_runtime
```

Diese Werte korrespondieren konzeptionell mit den in `docs/human-approval-tier-extension.md` genannten Agent-Privilege-Leveln (`observer`, `drafter`, `bounded_writer`, `sensitive_requester`) und den `agent_role`-Werten aus `core/contracts/handoff-protocol.json` (`primary-agent`, `subagent`, `validator`, `scheduler`, `human`) — ohne diese Felder zu überschreiben oder neu zu definieren.

**Default-Vorschlag:**
Wenn leer oder nicht gesetzt: kein Agent darf den Skill autonom ausführen. Conservative default — keine implizite Ausführungsfreigabe.

**Beziehung zu Human Approval:**
Agent-Rollen sind keine Approval-Instanzen. Ein Agent, der in `allowed_agents` gelistet ist, darf einen Skill anfragen — nicht autorisieren. Human Approval bleibt erforderlich, sobald `write_mode: approved_write` oder ein anderer genehmigungspflichtiger Scope vorliegt.

**Beziehung zu Provider-Routing:**
`allowed_agents` beschränkt, wer anfragen darf — nicht, über welchen Provider die Ausführung läuft. Provider-Routing bleibt von Agent-Rollen getrennt.

**Beziehung zu Permission Boundary:**
`allowed_agents` wäre ein Skill-Frontmatter-Feld, kein PBC-Eintrag. Die nächstliegende bestehende Struktur im PBC ist `skill_type` (beschreibt den Skill, nicht den anfragenden Agenten). `allowed_agents` ergänzt die PBC-Logik, ersetzt sie nicht.

**Risiken bei falscher Nutzung:**
- Kein Agent darf sich selbst auf `allowed_agents` setzen (keine Selbst-Autorisierung).
- `allowed_agents: ["*"]` oder Wildcard-Werte wären ein Anti-Pattern — sie heben den Schutzzweck auf.
- Ein leeres `allowed_agents`-Array darf nicht als "alle erlaubt" interpretiert werden; der Conservative-Default greift.
- Wenn `allowed_agents` nur bestimmte Rollen listet, dürfen nicht gelistete Rollen nicht durch implizite Freigabe ausführen.

---

### Field: `allowed_models`

**Zweck:**
Deklariert, welche Modelle oder Provider für einen Skill zulässig sind. Unterstützt die provider-neutrale Designentscheidung des Repos (vgl. `core/contracts/core-registry.json`: `"status": "provider-neutral"`), indem sie nicht eine implizite Annahme lässt, sondern eine explizite, per-Skill-Deklaration fordert.

**Erlaubte Werte / erwartete Form:**
Eine Liste von Provider-Bezeichnern. Mögliche Zukunftsform (nur Vorschlag):

```yaml
allowed_models:
  - provider:minimax
  - provider:anthropic
  - provider:openai
  - local:*
```

**Wichtig:** Diese Provider-Bezeichner beschreiben Zugehörigkeit zu einem Provider-Adapter-Tier — nicht spezifische Modell-Versionen. Modell-Versionen ändern sich; Adapter-Tier-Zugehörigkeit ist stabiler. Nicht alle hier genannten Provider sind heute implementiert — `providers/minimax/`, `providers/anthropic/`, `providers/openai-codex/` existieren als Scaffolds; ein `providers/pi/` existiert nicht.

**Default-Vorschlag:**
Wenn leer oder nicht gesetzt: keine automatische Ausführung über einen spezifischen Provider. Der Agent darf keinen Provider-spezifischen Claim ableiten.

**Beziehung zu Human Approval:**
`allowed_models` begrenzt, welcher Provider genutzt werden darf — ersetzt aber nicht die Freigabe für riskante Aktionen. Human Approval ist orthogonal zu Model-Routing.

**Beziehung zu Provider-Routing:**
`allowed_models` wäre das per-Skill-Gegenstück zur provider-level-Steuerung in `core/contracts/provider-capabilities.json` (Provider-Level, nicht Skill-Level, wie in `docs/skill-contract-gap-analysis.md` benannt). Ein Skill mit `allowed_models: [provider:minimax]` würde signalisieren, dass er nur über den Minimax-Adapter ausgeführt werden soll — nicht über andere Provider, auch wenn diese technisch verfügbar wären.

**Beziehung zu Permission Boundary:**
PBC kennt heute `category: provider.model_call` und `category: provider.tool_call` als Permission-Kategorien. `allowed_models` auf Skill-Ebene wäre eine Ergänzung, kein Ersatz für diese PBC-Kategorien.

**Risiken bei falscher Nutzung:**
- Modelle dürfen nicht hart in Core-Logik eingebrannt werden. `allowed_models` ist eine Skill-Deklaration, keine Core-Wahrheit.
- Minimax 3, Claude, Codex oder spätere lokale Modelle sind Provider-Adapter, keine Governance-Instanzen.
- Ein `allowed_models`-Eintrag darf nicht implizieren, dass der benannte Provider bereits vollständig implementiert oder in Production getestet ist.
- `allowed_models: ["*"]` oder Wildcard-Werte wären ein Anti-Pattern — sie heben den Routing-Schutzzweck auf.

---

### Field: `write_mode`

**Zweck:**
Deklariert die maximal zulässige Schreib-/Ausführungstiefe eines Skills. Überbrückt den groben `safe_to_auto_run`-Boolean mit einer differenzierten, maschinenlesbaren Schreibtiefe, die direkt auf das Approval-Tier-Modell aus `docs/human-approval-tier-extension.md` mappt.

**Erlaubte Werte:**

```yaml
write_mode: read_only | draft_only | approved_write
```

**Bedeutung der Werte:**

- `read_only`: Der Skill liest, analysiert, klassifiziert — erzeugt keine Änderungen an Repo, Dateien, Configs oder Systemen. Entspricht Tier 0 (`read_only`) aus `docs/human-approval-tier-extension.md`.

- `draft_only`: Der Skill erzeugt Vorschläge, Patches als Entwurf, Texte oder Artefakte — wendet sie aber nicht an. Keine Repo-Änderung; Ausgabe ist explizit als Entwurf markiert (`proposed`/`drafted`-Status per `AGENTS.md`/`WORKFLOW.md`). Entspricht Tier 1 (`draft_only`).

- `approved_write`: Der Skill darf begrenzt schreiben — nach expliziter Freigabe, mit konkretem Scope, konkreter Datei/Aktion, Human Approval, Evidence und Verify-Step. Entspricht Tier 2 (`approved_write`).

**Pflichthinweis:**
`approved_write` ist keine allgemeine Schreibfreigabe.
Es braucht:
- konkreten Scope (welche Datei, welcher Pfad, welche Aktion)
- Human Approval (explizite, scoped, einmalige Freigabe)
- Evidence (was genau wurde geschrieben, Vorher/Nachher-Zustand)
- Verify-Step (Prüfung nach Ausführung)

Ein Skill mit `write_mode: approved_write` darf nicht autonom schreiben. Das `approved_write`-Muster entspricht dem bereits in dieser Session praktizierten Governance-Muster für docs-only Slices.

**Default-Vorschlag:**
Wenn nicht gesetzt: `read_only` oder `draft_only`. Niemals `approved_write` als Fallback.

**Beziehung zu Human Approval:**
`write_mode: approved_write` bedingt Human Approval als Voraussetzung. Es ist nicht die Freigabe selbst — es ist die Deklaration, dass der Skill prinzipiell Schreibfähigkeit beansprucht, die Freigabe aber separat eingeholt werden muss.

**Beziehung zu Provider-Routing:**
`write_mode` beschreibt die Schreibtiefe des Skills, nicht den Provider. Ein Provider darf aus `write_mode: approved_write` keine Ausführungsfreigabe ableiten.

**Beziehung zu Permission Boundary:**
Im PBC entspricht `write_mode: approved_write` konzeptionell der Kombination aus `category: filesystem.write` + `scope: own-run` + `category: human_gate.request` (vgl. `docs/permission-boundary-approval-extension-proposal.md`, Approval Tier Projection). `write_mode` bleibt ein Skill-Frontmatter-Konzept; PBC-Permissions bleiben die granularere, contract-seitige Spiegelung.

**Risiken bei falscher Nutzung:**
- `write_mode: approved_write` ohne vorliegende Human-Approval-Evidence darf nicht zur Ausführung führen.
- `write_mode` darf nicht als Ersatz für `safe_to_auto_run` missverstanden werden. Beide Felder koexistieren: `safe_to_auto_run` adressiert Auto-Ausführung, `write_mode` adressiert Schreibtiefe.
- Ein Agent darf `write_mode` nicht eigenmächtig von `draft_only` auf `approved_write` anheben.

---

## Relation To Human Approval

Human Approval ist und bleibt Primat. Die vorgeschlagenen Felder begrenzen Zugriff und Scope — sie ersetzen keine Freigabe.

Verbatim aus `docs/human-approval-tier-extension.md`:
> "Agenten können gestufte Rechte bekommen. Human Approval bleibt Primat für riskante Aktionen. Kein Agent darf sich selbst höhere Rechte geben."

Konkret für die vorgeschlagenen Felder:

- `allowed_agents` ersetzt keine Human-Approval-Freigabe. Ein Agent, der gelistet ist, ist berechtigt anzufragen — nicht zu genehmigen.
- `allowed_models` ersetzt keine Human-Approval-Freigabe. Modell-Routing ist kein Approval-Mechanismus.
- `write_mode: approved_write` braucht Approval. Das Feld deklariert nur die Schreibfähigkeit des Skills — es ist keine stehende Freigabe.
- `verified` ist nicht `approved` (vgl. `docs/human-approval-tier-extension.md`, "Relation To Execution Claims"). Agenten dürfen Approval nicht simulieren.
- Kein Agent darf durch Manipulation von `allowed_agents` oder `allowed_models` eine Approval-Pflicht umgehen.

---

## Relation To Permission Boundary

`core/contracts/permission-boundary.json` bleibt unverändert durch dieses Proposal.

- Dieses Dokument ist kein Contract und erzeugt keine Contract-Wahrheit.
- Spätere PBC-Erweiterung (z. B. Aufnahme von `approval_tier`, `agent_privilege_level` oder `computer_use.request` als PBC-Kategorien) braucht einen eigenen Contract-Gate mit Schema-Validierung — diese ist in `docs/permission-boundary-approval-extension-proposal.md` als Proposal skizziert, aber nicht implementiert.
- `write_mode` auf Skill-Ebene und `category: filesystem.write` auf PBC-Ebene sind komplementär, nicht redundant: PBC beschreibt die Permission-Kategorie mit Scope und Rationale; `write_mode` beschreibt die Schreibtiefe in einem menschenlesbaren, per-Skill deklarierten Format.
- `allowed_agents` auf Skill-Ebene und `skill_type` auf PBC-Ebene adressieren verschiedene Dimensionen: PBC `skill_type` beschreibt den Skill, `allowed_agents` beschreibt den anfragenden Agenten.

---

## Relation To Pi Provider Adapter

Aus `docs/pi-provider-adapter-specification.md` ("Required Future Fields"):
Diese drei Felder sind dort bereits als illustrative Zukunftsfelder projiziert. Dieses Proposal schließt die Lücke zwischen der Pi-Adapter-Spezifikation und einer konkreten Feldbeschreibung, ohne einen Pi-Adapter zu implementieren.

- Pi darf Skills später nur innerhalb der durch `allowed_agents`, `allowed_models` und `write_mode` gesetzten Grenzen anfragen oder ausführen.
- Pi ist Adapter, kein Core. Pi darf Skill-Grenzen nicht überschreiben.
- Pi darf `allowed_agents` nicht eigenmächtig erweitern, um sich selbst Zugriff zu verschaffen.
- Pi darf `allowed_models` nicht so interpretieren, dass es Provider-Routing außerhalb deklarierter Grenzen aufnimmt.
- Pi darf `write_mode: approved_write` nicht ohne Human Approval ausführen.
- Dieses Proposal ist Voraussetzung für einen späteren `providers/pi/README.md`-Slice (vgl. `docs/pi-provider-adapter-specification.md`, "Provider Surface Decision" — Voraussetzungen benennt: `allowed_agents` / `allowed_models` / `write_mode` müssen entschieden sein), aktiviert ihn aber nicht.

---

## Relation To Computer Use

Computer-Use ist durch `write_mode` allein nicht erlaubt. Das gilt auch dann, wenn `write_mode: approved_write` gesetzt ist.

- Computer-Use benötigt ein eigenes, dediziertes Feld: `computer_use_allowed: true | false` (in `docs/skill-contract-gap-analysis.md` als Gap mit Priority `high` gelistet, in `docs/computer-use-policy.md` als fehlendes Skill-Feld explizit benannt).
- `computer_use_allowed: true` wäre höchstens Antragsfähigkeit (Deklaration, dass der Skill Computer-Use prinzipiell beanspruchen könnte) — keine Ausführungsfreigabe.
- Computer-Use bleibt mindestens Tier 3 (`sensitive_action`) im Approval-Tier-Modell aus `docs/human-approval-tier-extension.md`.
- `docs/computer-use-policy.md` bleibt maßgebliche Referenz für alle Computer-Use-Entscheidungen. Dieses Proposal definiert keine konkurrierende Policy.
- Kein in diesem Proposal genanntes Feld hebt die Preferred Interface Order aus `docs/computer-use-policy.md` auf: Computer-Use bleibt letzter Ausweg, nicht Default.

---

## Proposed Future Frontmatter Example

**future example only — not current schema**

Das folgende Beispiel illustriert, wie ein zukünftiger SKILL.md-Frontmatter mit diesen Feldern aussehen könnte. Es ist nicht Schema-konform (kein Validator existiert), nicht migriert und nicht auf einen bestehenden Skill angewendet.

```yaml
name: example-skill
description: Example only — illustrates future frontmatter extension
version: 0.1.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: proposed
# --- proposed future fields (not current schema) ---
allowed_agents:
  - planner
  - drafter
allowed_models:
  - provider:minimax
write_mode: draft_only
human_approval_required: true
computer_use_allowed: false
```

---

## Conservative Defaults

Für alle Fälle, in denen ein Skill die vorgeschlagenen Felder nicht deklariert, gelten folgende sichere Defaults. Diese Defaults gelten unabhängig von späteren Schema-Entscheidungen:

| Fehlendes Feld | Conservative Default | Bedeutung |
|---|---|---|
| `allowed_agents` nicht gesetzt | keine autonome Ausführung | kein Agent darf den Skill autonom anfragen |
| `allowed_models` nicht gesetzt | kein provider-spezifischer Ausführungsanspruch | Provider-Routing darf nicht implizit angenommen werden |
| `write_mode` nicht gesetzt | treat as `read_only` or `draft_only` | niemals als `approved_write` behandeln |
| `computer_use_allowed` nicht gesetzt | `false` | Computer-Use ist verboten ohne explizite Deklaration |
| Approval-Evidence fehlt | nicht approved | `verified` ist nicht `approved`; fehlende Evidence = nicht freigegeben |

---

## Non-Goals

- keine Skill-Migration
- keine Frontmatter-Änderung bestehender Skills (`skills/*/SKILL.md` unverändert)
- keine Contract-Änderung (`core/contracts/*.json` unverändert)
- kein Validator
- keine Runtime-Aktivierung
- kein Provider-Surface (`providers/pi/` wird nicht angelegt)
- keine Computer-Use-Aktivierung
- keine Approval-Automatisierung
- keine Secrets
- keine Submodule-Init/-Update
- keine Änderung an `docs/README.md`
- keine Änderung an bestehenden Core-Docs

---

## Recommended Next Gate

**Empfehlung: Provider-Surface-Decision-Slice für `providers/pi/README.md`**

Begründung: Dieses Proposal schließt die letzte der drei Voraussetzungen, die in `docs/pi-provider-adapter-specification.md` ("Provider Surface Decision") für einen `providers/pi/`-Slice benannt wurden:

1. ✓ Provider-Surface autorisiert — bestätigt in `docs/pi-provider-adapter-specification.md`
2. ✓ `allowed_agents` / `allowed_models` / `write_mode` für Pi dokumentiert — dieses Proposal
3. Runtime-Grenzen und Approval-Bezug — müssen als Teil des `providers/pi/README.md`-Slices konkretisiert werden, sobald eine beobachtbare Pi-Laufzeitkonfiguration im Workspace belegt ist

Der `providers/pi/README.md`-Slice wäre ein minimal scoped, docs-only Adapter-README im Stil von `providers/minimax/README.md` — Provider-spezifische Verpackungsbeschreibung ohne Core-Logik-Änderung, nur wenn eine Pi-API-Surface tatsächlich beobachtbar wird.

**Alternative, falls Pi-Surface noch nicht belegbar:** Docs-README-Link-Slice — `docs/README.md` um Verweise auf die neu entstandenen docs-only Dateien ergänzen, sobald dieses Nicht-anfassen-Scope aufgehoben wird. Dieser Slice wäre kleiner und inhaltlich unabhängig von Pi-Laufzeitverfügbarkeit.

---

## Verification

- Genau eine neue Datei erstellt: `docs/skill-schema-extension-proposal.md`
- Keine bestehenden Skill-Dateien geändert
- Keine Contracts geändert (`core/contracts/permission-boundary.json` nur gelesen)
- Keine Policies geändert
- Keine Provider-Dateien geändert
- Kein `providers/pi/` erzeugt
- Keine Validatoren geändert
- Keine Submodule geändert
- Keine Secrets gelesen oder ausgegeben
- `test -f docs/skill-schema-extension-proposal.md` vor dem Write: `NOT_EXISTS` → Datei neu erstellt, kein Überschreiben

---

## Result

`result`: pass

## Owner / Scope

Owner: Cheikh (baum777).
Repo: `agentic_workflow/model-agnostic-workflow-system`.
Surface: `docs/`.
Task class: docs-only / skill-schema proposal.
Risk: niedrig (keine Code-/Schema-/Runtime-/Provider-Änderung).

## Files Read

`docs/skill-contract-gap-analysis.md`, `docs/pi-provider-adapter-specification.md`,
`docs/human-approval-tier-extension.md`, `docs/permission-boundary-approval-extension-proposal.md`,
`docs/computer-use-policy.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`,
`core/contracts/permission-boundary.json` (Felder-Baseline),
`skills/safe-scoped-commit/SKILL.md`, `skills/runtime-policy-auditor/SKILL.md`,
`skills/repo-intake-sot-mapper/SKILL.md`, `skills/getdesign-style-router/SKILL.md`,
`skills/patch-strategy-designer/SKILL.md`.

## Applied

Datei erstellt: `docs/skill-schema-extension-proposal.md`.

Dokumentierte Proposal-Felder:
- `allowed_agents` — Zweck, erlaubte Werte, Default, Human-Approval-Bezug, PBC-Bezug, Risiken
- `allowed_models` — Zweck, erlaubte Werte, Default, Provider-Routing-Bezug, PBC-Bezug, Risiken
- `write_mode` — Zweck, drei Werte (`read_only`/`draft_only`/`approved_write`), Default, Approval-Bezug, PBC-Bezug, Risiken

Zusätzlich dokumentiert (aus Pflichtstruktur des Auftrags):
- Conservative Defaults für fehlende Felder
- Relation to Human Approval
- Relation to Permission Boundary
- Relation to Pi Provider Adapter
- Relation to Computer Use
- Future Frontmatter Example (als Illustration, nicht als Schema)
- Non-Goals
- Recommended Next Gate

## Risks / Gaps

- `allowed_agents`-Rollenwerte sind noch nicht mit einer bestehenden Skill-Instanz durchgespielt — rein konzeptionell.
- `allowed_models`-Provider-Bezeichner sind illustrativ; nicht alle genannten Provider sind vollständig implementiert.
- Die Konsistenz zwischen `write_mode` auf Skill-Ebene und `filesystem.write`/`human_gate.request` auf PBC-Ebene ist konzeptionell beschrieben, aber noch nicht durch einen Validator oder eine Schema-Erweiterung erzwungen.
- `computer_use_allowed` ist in diesem Proposal erwähnt, aber nicht als eigenes Feld spezifiziert — das bleibt dem Computer-Use-Policy-Erweiterungsslice vorbehalten.
- Der Conservative-Default-Satz ist prosa-basiert, nicht im Schema kodiert — bis ein Validator existiert, gilt er nur als Governance-Konvention.

## Next Gate

**Provider-Surface-Decision-Slice für `providers/pi/README.md`** (sobald eine beobachtbare Pi-Laufzeitkonfiguration im Workspace belegt ist) — oder alternativ **Docs-README-Link-Slice** als kleinerer, inhaltlich unabhängiger Zwischenschritt.
