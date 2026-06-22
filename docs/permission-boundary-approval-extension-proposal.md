# Permission Boundary Approval Extension Proposal

## Class
Governance-adjacent / docs-only / contract-extension proposal

## Use rule
Dieses Dokument beschreibt eine mögliche spätere Erweiterung des Permission-Boundary-Contracts. Es ändert keinen Contract, aktiviert keinen Validator und erteilt keinem Agenten neue Rechte. Canonical authority bleibt `core/contracts/permission-boundary.json`, `docs/human-approval-tier-extension.md`, `docs/skill-contract-gap-analysis.md`, `docs/computer-use-policy.md`, `AGENTS.md`, `WORKFLOW.md`.

## Purpose

- `docs/human-approval-tier-extension.md` hat Approval-Tiers (`read_only`/`draft_only`/`approved_write`/`sensitive_action`/`forbidden_or_blocked`) und Agent-Privilege-Grenzen definiert.
- Diese Konzepte sollen später maschinenlesbar an den Permission-Boundary-Contract (PBC, `core/contracts/permission-boundary.json`) anschließbar sein.
- Dieser Slice prüft nur die Projektionslogik — keine Umsetzung, keine Migration, keine Runtime-Aktivierung.

## Current Permission Boundary Baseline

Observed aus `core/contracts/permission-boundary.json` (`schemaVersion: 1.0.0`, `maturityLabel: contract-backed`, `validatorStatus: deferred`, `runtimeStatus: deferred`, `adoptionMode: opt-in`):

**Tatsächlich vorhandene Felder:**
- Top-level required: `pbc_version`, `skill_id`, `skill_type`, `denied_by_default`, `permissions`.
- `skill_type` enum: `generic`, `handoff-emitter`, `handoff-receiver`, `memory-reader`, `memory-writer`, `orchestrator`.
- `denied_by_default: boolean` (default `true`) — Default-Deny-Posture auf Contract-Ebene.
- `exception_rationale` (required nur wenn `denied_by_default: false`).
- `permissions[]` (mind. 1 Eintrag), jeder Eintrag (`permissionGrant`):
  - `category` — geschlossenes Enum (`permissionCategory`): `memory.read`, `memory.write`, `handoff.emit`, `handoff.receive`, `subagent.spawn`, `external.http`, `external.mcp`, `filesystem.read`, `filesystem.write`, **`human_gate.request`**, `provider.model_call`, `provider.tool_call`.
  - `scope` — geschlossenes Enum (`scopeLevel`): `own-run`, `own-workflow`, `cross-workflow`, `global`.
  - `rationale` (required, min. 10 Zeichen).
  - `optional: boolean`.
  - `degraded_behavior` (required wenn `optional: true`).
  - `constraints[]` — freitextiges Array.
- `optional_permissions[]` — wie `permissions[]`, aber `degraded_behavior` zwingend.
- `denied_by_default_permissions[]` — Array von `permissionCategory`-Werten.
- `consumer_policy_schema_ref` — freitextiger Verweis.
- `notes` — freitext.

**Funktional ähnliche Felder (kein 1:1-Match):**
- `category: human_gate.request` existiert bereits als Enum-Wert — siehe Human Gate Projection unten. Es ist aber nur eine Permission-Kategorie mit `scope`/`rationale`/`constraints`, kein eigenständiges, strukturiertes `human_gate`-Objekt mit z. B. `evidence_required` oder `expires_after`.
- `scope` (`own-run`/`own-workflow`/`cross-workflow`/`global`) ist konzeptionell näher an "Blast-Radius" als an Approval-Tier-Stufung — siehe Approval Tier Projection.
- `skill_type: orchestrator` ist die einzige rollenartige Unterscheidung; sie beschreibt Skill-Typ, nicht Agent-Identität oder Privilege-Level.

**Fehlende Felder (keine Spur im JSON):**
- `approval_tier`, `agent_privilege_level`, `human_approval_required`, `approval_scope`, `approval_evidence_required`, `privilege_escalation_allowed`, `computer_use_allowed`, `write_mode`, `verified`/`approved`-Unterscheidung, `sensitive_action`, `forbidden_or_blocked`.

**Unklare Stellen:**
- Ob `human_gate.request` aktuell von irgendeinem Skill tatsächlich deklariert wird, ist mit den read-only Listings dieser Session nicht geprüft (kein Grep über alle `skills/*/SKILL.md` durchgeführt); dieses Dokument behauptet dazu nichts.
- `consumer_policy_schema_ref` könnte später ein Ankerpunkt für ein externes Approval-Schema sein, ist aber aktuell nur ein freier String ohne definierte Zielstruktur.

## Proposed Mapping

| Concept | Source doc | Existing PBC equivalent | Proposed future PBC representation | Status |
| --- | --- | --- | --- | --- |
| `approval_tier` | `docs/human-approval-tier-extension.md` | kein direktes Äquivalent; `scope` beschreibt Blast-Radius, nicht Approval-Stufe | neues optionales Top-Level-Feld oder Property auf `permissionGrant` | proposal only |
| `agent_privilege_level` | `docs/human-approval-tier-extension.md` | kein direktes Äquivalent; `skill_type` ist Skill-, nicht Agent-bezogen | neues optionales Feld, getrennt von `skill_type` | proposal only |
| `human_approval_required` | `docs/skill-contract-gap-analysis.md` | `category: human_gate.request` existiert als Permission-Kategorie | boolean-Shortcut oder Ableitung aus Vorhandensein eines `human_gate.request`-Grants | partially covered |
| `human_gate.request` | PBC selbst | **bereits vorhanden** als `permissionCategory`-Enum-Wert | keine neue Struktur nötig; ggf. zusätzliche optionale Sub-Properties (siehe Human Gate Projection) | already covered |
| `approval_scope` | `docs/human-approval-tier-extension.md` | `scope` (`own-run`/`own-workflow`/`cross-workflow`/`global`) auf `permissionGrant` | Wiederverwendung von `scope` statt neuem Feld | already covered (mit Vorbehalt — siehe Approval Tier Projection) |
| `approval_evidence_required` | `docs/human-approval-tier-extension.md` | kein Äquivalent; `rationale` ist Begründung, nicht Evidence-Pflicht | neues optionales boolean-Feld auf `permissionGrant` | missing |
| `privilege_escalation_allowed: false` | `docs/human-approval-tier-extension.md` | `denied_by_default: true` ist verwandt (Default-Deny), aber adressiert Permissions, nicht Privilege-Eskalation zwischen Agenten | neues, separat zu deklarierendes Feld; sollte nicht aus `denied_by_default` abgeleitet werden | proposal only |
| `computer_use_allowed` | `docs/computer-use-policy.md`, `docs/skill-contract-gap-analysis.md` | kein Äquivalent; keine `permissionCategory` für Computer-Use | denkbar als neuer Enum-Wert in `permissionCategory` (z. B. `computer_use.request`) — nicht in diesem Slice | missing |
| `write_mode` | `docs/human-approval-tier-extension.md`, `docs/skill-contract-gap-analysis.md` | `category: filesystem.write` + `scope` kommt am nächsten | `write_mode` bliebe ein Skill-Frontmatter-Konzept; PBC-Permission bleibt die granularere, contract-seitige Spiegelung | partially covered |
| `verified != approved` | `docs/human-approval-tier-extension.md`, `AGENTS.md`/`WORKFLOW.md` | kein PBC-Äquivalent; PBC kennt keine Execution-Status-Werte | bleibt außerhalb von PBC — Execution-Claim-Vokabular lebt in `AGENTS.md`/`WORKFLOW.md`, nicht im Contract | blocked by design |
| `sensitive_action` | `docs/human-approval-tier-extension.md` | kein direktes Äquivalent; am nächsten kämen `scope: global` kombiniert mit `category: human_gate.request` | keine neue Enum-Erweiterung vorgeschlagen; Kombination bestehender Felder genügt konzeptionell | partially covered |
| `forbidden_or_blocked` | `docs/human-approval-tier-extension.md` | `denied_by_default_permissions[]` kommt am nächsten (explizite Verbotsliste) | Wiederverwendung von `denied_by_default_permissions[]` statt neuem Feld | already covered (mit Vorbehalt) |

## Approval Tier Projection

| Approval tier | Meaning | Possible PBC scope | Allowed without human gate? | Notes |
| --- | --- | --- | --- | --- |
| `read_only` | Lesen, Analyse, Klassifikation | am nächsten: `category: filesystem.read` / `memory.read`, `scope: own-run` | ja, solange keine Secrets sichtbar werden | Bestehende `scope`-Werte beschreiben Blast-Radius, nicht Approval-Pflicht — die Zuordnung "kein Human-Gate nötig" ist hier ein Vorschlag, kein im JSON kodiertes Verhalten. |
| `draft_only` | Vorschläge, Patches als Draft, keine Anwendung | keine Schreib-Permission nötig; ggf. `category: handoff.emit`, `scope: own-run` | ja | Entspricht keiner echten Write-Permission, da kein Repo-Write erfolgt. |
| `approved_write` | begrenzte Schreibaktion nach Freigabe | `category: filesystem.write`, `scope: own-run` oder `own-workflow`, kombiniert mit `category: human_gate.request` | nein — Human-Gate-Grant wäre Voraussetzung | Zwei Permission-Grants gemeinsam (write + human_gate.request) wären die nächstliegende heutige Ausdrucksform, nicht ein neues Tier-Feld. |
| `sensitive_action` | Secrets, Login, Computer-Use, produktive Systeme | `scope: global` + `category: human_gate.request`, evtl. künftig `computer_use.request` | nein, immer | Computer-Use hat aktuell keine eigene `permissionCategory` (siehe Mapping-Tabelle, Status `missing`). |
| `forbidden_or_blocked` | irreversibel, unklar, zu breit, unsafe | `denied_by_default_permissions[]` | nicht ausführen | `denied_by_default: true` (Default) deckt dieses Tier bereits strukturell ab, ohne dass ein neues Feld nötig wäre. |

Bestehende PBC-Namen (`own-run`/`own-workflow`/`cross-workflow`/`global`, `permissionCategory`-Enum) werden hier unverändert verwendet; es wird keine neue Scope-Terminologie vorgeschlagen.

## Human Gate Projection

`human_gate.request` existiert bereits als Wert im `permissionCategory`-Enum in `core/contracts/permission-boundary.json`. Es ist **kein** eigenständiges JSON-Objekt mit Unterfeldern, sondern wird wie jede andere Kategorie über einen `permissionGrant`-Eintrag ausgedrückt. Die heute mögliche, schema-konforme Form sieht so aus (kein neues Beispiel erfunden — dies ist die bestehende `permissionGrant`-Struktur, lediglich mit `category: human_gate.request` instanziiert):

```json
{
  "category": "human_gate.request",
  "scope": "own-run",
  "rationale": "bounded docs-only write requires a named human approval before the write occurs",
  "optional": false,
  "constraints": [
    "scoped to exactly one named file path",
    "single-use, not a standing grant"
  ]
}
```

**Beobachtete Gaps gegenüber dem in `docs/human-approval-tier-extension.md` skizzierten Approval-Evidence-Bedarf:**
- Kein dediziertes `evidence_required: boolean` — müsste aktuell informell über `constraints[]` (Freitext) ausgedrückt werden.
- Kein dediziertes `expires_after` / Einmaligkeits-Feld — ebenfalls nur über `constraints[]` als Freitext möglich, nicht strukturiert/maschinenlesbar.
- Kein Feld, das `human_gate.request` explizit mit einem `approval_tier`-Wert verknüpft.

Diese drei Gaps werden hier nur benannt, nicht geschlossen — eine Schema-Erweiterung würde diese Session überschreiten.

## Agent Privilege Projection

Mögliche Zukunftswerte (rein illustrativ, nicht Teil eines Contracts):

```yaml
agent_privilege_level:
  - observer
  - drafter
  - bounded_writer
  - sensitive_requester
```

Pflicht-Guardrails:

- Agent Privilege darf nur begrenzen, nicht automatisch erweitern.
- Kein Agent darf eigene Privilegien erhöhen.
- Kein Agent darf andere Agenten in höhere Privilege-Level stufen.
- Planner/Synthesizer/Verifier sind Rollen, keine Freigabeinstanzen.
- Human Approval bleibt Primat.
- `sensitive_requester` darf sensitive Aktionen nur beantragen, nicht ausführen.

Diese Liste ist bewusst von `skill_type` (PBC) und von `agent_role` (`core/contracts/handoff-protocol.json`: `primary-agent`/`subagent`/`validator`/`scheduler`/`human`) getrennt gehalten, statt sie zu überschreiben — beide bestehenden Enums bleiben unverändert und unangetastet.

## Execution Claim Boundary

- `proposed` ist kein Approval.
- `drafted` ist kein Approval.
- `applied` ist kein Approval.
- `verified` ist kein Approval.
- `approved` braucht Approval-Evidence.

`approved` ist aktuell **nicht** Teil der Execution-Claim-Policy in `AGENTS.md`/`WORKFLOW.md` (dort nur `proposed`/`drafted`/`applied`/`verified`). Dieses Dokument fügt `approved` der Execution-Claim-Policy nicht hinzu und definiert keine neue Claim-Policy. Es dokumentiert ausschließlich die Beziehung: ein Human-Gate-Grant (`human_gate.request`) wäre die Voraussetzung dafür, dass eine `applied`/`verified`-Aktion zusätzlich als `approved` bezeichnet werden dürfte — diese Bezeichnung selbst bleibt außerhalb des PBC-Schemas und außerhalb der heutigen Execution-Claim-Policy.

## Relation To Computer Use Policy

- Computer-Use bleibt mindestens `sensitive_action`.
- Computer-Use bleibt Fallback, nicht Default (`docs/computer-use-policy.md`, Preferred Interface Order).
- `computer_use_allowed: true` wäre höchstens Antragsfähigkeit, keine Ausführungsfreigabe.
- Human Approval + Evidence bleiben Pflicht, unabhängig von einem etwaigen `computer_use.request`-PBC-Eintrag.
- `docs/computer-use-policy.md` bleibt maßgebliche Referenz; dieses Dokument definiert keine konkurrierende Policy.

## Relation To Skill Contract Gap Analysis

- Dieses Proposal unterstützt die in `docs/skill-contract-gap-analysis.md` offenen späteren Felder: `write_mode`, `human_approval_required`, `computer_use_allowed`, `agent_privilege_hierarchy`, `evidence_required`.
- Es migriert keine Skills.
- Es ändert kein Frontmatter.
- Es aktiviert keinen Validator.

## No-Duplicate Rule

- `core/contracts/permission-boundary.json` bleibt einzige Contract-Zieloberfläche für diese Art von Permission-Grenze.
- Dieses Dokument dupliziert den Contract nicht (kein vollständiges Schema kopiert, nur einzelne beobachtete Felder zitiert).
- Keine parallele Approval-Policy als zweite Wahrheit.
- `docs/computer-use-policy.md` bleibt eigenständige Policy.
- `docs/skill-contract-gap-analysis.md` bleibt Gap-Dokument.
- `docs/human-approval-tier-extension.md` bleibt semantisches Brückendokument.

## Proposed Future Contract Additions

Keine Contract-Änderung durchgeführt. Nur als Vorschlag dokumentiert — **future proposal only**:

```json
{
  "approval_tier": "read_only | draft_only | approved_write | sensitive_action | forbidden_or_blocked",
  "agent_privilege_level": "observer | drafter | bounded_writer | sensitive_requester",
  "privilege_escalation_allowed": false,
  "human_gate": {
    "request_required": true,
    "scope": "string",
    "evidence_required": true
  }
}
```

Dieses Beispiel ist nicht identisch mit der bestehenden `permissionGrant`-Struktur aus PBC — es ist ein hypothetisches, vereinfachtes Zukunftsbild, das eine spätere Schema-Diskussion anstoßen könnte, aber heute weder gültig noch implementiert ist.

## Non-Goals

- keine Änderung an `core/contracts/permission-boundary.json`
- kein Validator
- keine Runtime-Aktivierung
- keine Skill-Migration
- keine Provider-Implementierung
- keine Computer-Use-Aktivierung
- keine Änderung an bestehenden `SKILL.md`-Dateien
- keine Freigabe realer Aktionen
- keine produktive Ausführung

## Recommended Next Gate

Empfohlen: **Docs-README-Link-/Update-Slice** für die vier neu entstandenen docs-only Dateien (`docs/computer-use-policy.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`, `docs/skill-contract-gap-analysis.md`, `docs/human-approval-tier-extension.md`, `docs/permission-boundary-approval-extension-proposal.md`). Begründung: `docs/README.md` ist als "Nicht anfassen" für diese fünf Slices gesetzt geblieben; dadurch sind diese Dokumente aktuell nicht über die Doku-Navigation auffindbar — ein eigener, klar gescopter Gate würde genau das adressieren, ohne die inhaltliche Governance-Diskussion (Skill-Schema, Security-Scan, Pi-Adapter) vorzeitig zu öffnen.

## Result

`result`: `pass`

## Owner / Scope

Owner: Cheikh (baum777). Repo: `agentic_workflow/model-agnostic-workflow-system`. Surface: `docs/`. Task class: docs-only contract-extension proposal. Risk: niedrig (keine Code-/Schema-/Runtime-Änderung; reine Beobachtung + Vorschlag).

## Files Read

`AGENTS.md`, `WORKFLOW.md`, `docs/README.md`, `docs/architecture.md`, `docs/runtime-activation-status.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`, `docs/computer-use-policy.md`, `docs/skill-contract-gap-analysis.md`, `docs/human-approval-tier-extension.md`, `core/contracts/permission-boundary.json`, `core/contracts/resource-governor.json`, `core/contracts/handoff-protocol.json`, Verzeichnislistings von `core/contracts/`, `skills/`, `providers/`, `policies/`.

## Files Changed

Genau eine Datei: `docs/permission-boundary-approval-extension-proposal.md` (vorher nicht existent, per `test -f` geprüft).

## Proposal Recorded

12-Konzept-Mapping-Tabelle gegen PBC erstellt; Status verteilt auf `already covered` (`human_gate.request`, `approval_scope`, `forbidden_or_blocked` mit Vorbehalt), `partially covered` (`human_approval_required`, `write_mode`, `sensitive_action`), `proposal only` (`approval_tier`, `agent_privilege_level`, `privilege_escalation_allowed`), `missing` (`approval_evidence_required`, `computer_use_allowed`), `blocked by design` (`verified != approved` — bleibt bewusst außerhalb von PBC). `human_gate.request` bereits als bestehender Enum-Wert identifiziert und referenziert statt neu erfunden; nur die fehlenden Sub-Felder (`evidence_required`, `expires_after`) wurden als Gap benannt.

## Verification

`test -f docs/permission-boundary-approval-extension-proposal.md` vor dem Write → `NOT_EXISTS`. Datei danach an exakt diesem Pfad erstellt. `core/contracts/permission-boundary.json` wurde nur gelesen, nicht verändert. Keine `SKILL.md`, keine `policies/*.yaml`, keine sonstige `core/contracts/*.json`, keine Runtime-/Provider-Datei geändert. Keine Secrets gelesen oder ausgegeben. Diff ist docs-only. Dokument behauptet keine existierende Runtime-Fähigkeit oder Contract-Erweiterung — alle neuen Felder explizit als `proposal only` / `future proposal only` markiert.

## Risks / Gaps

- Ob `human_gate.request` heute tatsächlich von einem Skill deklariert wird, wurde nicht per Volltextsuche über alle `skills/*/SKILL.md` verifiziert (nur Verzeichnislisting, keine Grep-Suche in diesem Slice).
- Der Vorschlag für `computer_use.request` als neue `permissionCategory` ist rein illustrativ und in keinem Dokument vorher benannt — er sollte im nächsten Slice explizit als eigener, separat zu bewertender Vorschlag markiert werden, nicht implizit mitgenommen werden.
- Die Tier→Scope-Zuordnung in "Approval Tier Projection" ist eine Interpretation, keine im Schema kodierte Regel; bei einer echten Schema-Erweiterung könnte sich die Zuordnung ändern.

## Next Gate

Docs-README-Link-/Update-Slice: `docs/README.md` um Verweise auf die fünf neuen docs-only Dateien ergänzen (reine Navigations-Verlinkung, keine inhaltliche Änderung an Governance-Regeln) — vorausgesetzt, der Nutzer hebt für diesen einen Slice das bisherige "Nicht anfassen" für `docs/README.md` gezielt auf.
