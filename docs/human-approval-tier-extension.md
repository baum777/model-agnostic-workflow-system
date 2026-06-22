# Human Approval Tier Extension

## Class
Governance-adjacent / docs-only / approval-model extension

## Use rule
Dieses Dokument beschreibt Approval-Tiers und ihre Beziehung zu Skill-Contracts, Computer-Use und Agent-Privileges. Es aktiviert keine Runtime-Fähigkeit, ändert keine Validatoren und erteilt keinem Agenten neue Rechte. Canonical authority bleibt `AGENTS.md`, `WORKFLOW.md`, `docs/computer-use-policy.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`, `docs/skill-contract-gap-analysis.md`, und `core/contracts/permission-boundary.json`.

## Purpose

- Human Approval soll expliziter mit `write_mode`, `computer_use_allowed` und `agent_privilege_hierarchy` verbunden werden (alle drei in `docs/skill-contract-gap-analysis.md` als offene Felder dokumentiert).
- Agenten dürfen Rechte nicht selbst erhöhen.
- Riskante Aktionen brauchen menschliche Freigabe.
- Approval muss später maschinenlesbar an Skills, Tools und Provider-Routing anschließbar sein — ohne dass diese Anschlussfähigkeit hier schon implementiert wird.
- Externe Pattern wie Risk-Tiers oder Agent-Hierarchien (siehe `docs/skill-contract-gap-analysis.md` → External Pattern Inputs, insb. `daveshap/OpenAI_Agent_Swarm`) dürfen Human Approval nicht ersetzen.

## Approval Principles

1. Human Approval ist Primat für riskante Aktionen.
2. Agenten dürfen Approval nicht simulieren.
3. Agenten dürfen sich keine höheren Rechte selbst geben.
4. Modellurteil ersetzt keine Freigabe.
5. `verified` bedeutet nicht automatisch `approved`.
6. Approval ist scoped, zeitlich begrenzt und zweckgebunden.
7. Standing Grants sind in v0 nicht erlaubt.
8. Wenn Scope oder Seiteneffekt unklar ist, gilt `blocked`.

## Proposed Approval Tiers

| Tier | Name | Meaning | Examples | Human Approval |
| --- | --- | --- | --- | --- |
| 0 | `read_only` | Lesen, Analyse, Klassifikation | Docs lesen, Repo-Struktur prüfen, Deepdive-Recherche | nicht nötig, solange keine Secrets sichtbar werden |
| 1 | `draft_only` | Vorschläge, Patches als Draft, keine Anwendung | Prompt, Plan, Patch-Vorschlag, `proposed`/`drafted`-Artefakte | optional / taskabhängig |
| 2 | `approved_write` | begrenzte Schreibaktion nach Freigabe | eine docs-only Datei, klarer Pfad (z. B. dieses Dokument) | erforderlich |
| 3 | `sensitive_action` | Secrets, Login, Computer-Use, produktive Systeme | Deploy, Admin-Konsole, Upload, Account-Settings | immer erforderlich |
| 4 | `forbidden_or_blocked` | irreversibel, unklar, zu breit, unsafe | Banking/Wallet, unscoped mass changes, Vault-Write | nicht ausführen / `blocked` |

Diese Tier-Namen sind ein Vorschlag; sie referenzieren absichtlich die bereits beobachteten Repo-Vokabulare (`proposed`/`drafted`/`applied`/`verified` aus `AGENTS.md`/`WORKFLOW.md`, `human_gate` aus `core/contracts/resource-governor.json`'s `on_budget_exceeded`-Enum, `human_gate.request` aus `core/contracts/permission-boundary.json`), statt ein neues Vokabular einzuführen.

## Relation To Write Mode

Mappe Approval-Tiers auf das in `docs/skill-contract-gap-analysis.md` offene Feld `write_mode`:

- `read_only` → kein Write.
- `draft_only` → kein Write; nur Artefakt-Erzeugung außerhalb des Repos oder als explizit markierter Entwurf.
- `approved_write` → genau ein vorher genannter Pfad, eine Aktion, nach expliziter Freigabe.

Wichtig: `approved_write` heißt nicht allgemeine Schreibfreigabe. Es bedeutet konkreter Pfad, konkrete Datei/Aktion, begrenzter Scope, vorherige Zustimmung, nachgelagerter Verify-Step — exakt das Muster, das in dieser Session bereits für `docs/skill-contract-gap-analysis.md` und für dieses Dokument selbst angewendet wurde.

## Relation To Computer Use Policy

Bezug zu `docs/computer-use-policy.md` (Class: `prose-governed`):

- Computer-Use ist mindestens Tier 3 (`sensitive_action`).
- Computer-Use ist nie Default — konsistent mit der dort dokumentierten "Preferred Interface Order" (Computer-Use als letzter Ausweg).
- Computer-Use braucht explizite, scoped, one-off Human Approval — identisch zur dort dokumentierten "Required Approval"-Regel.
- Computer-Use braucht Evidence — identisch zur dort dokumentierten "Evidence Required"-Regel.
- Computer-Use darf keine Secrets im sichtbaren Kontext verwenden.
- Ein späteres Skill-Feld `computer_use_allowed: true` wäre nur eine Möglichkeit zur Beantragung/Deklaration, keine automatische Ausführungsfreigabe. Die Policy bleibt additiv und übergeordnet, wie in `computer-use-policy.md` → "Relation To Skill Contracts" bereits festgehalten.

## Relation To Agent Privilege Hierarchy

Bezug zum in `docs/skill-contract-gap-analysis.md` identifizierten Gap `agent_privilege_hierarchy`:

- Agenten können unterschiedliche erlaubte Rollen/Schnittstellen haben (vgl. die bereits existierenden `agent_role`-Werte `primary-agent`, `subagent`, `validator`, `scheduler`, `human` in `core/contracts/handoff-protocol.json`).
- Diese Hierarchie darf nur begrenzen, nicht automatisch erweitern.
- Kein Agent darf andere Agenten auf höhere Rechte stufen.
- Kein Worker darf das Human-Gate umgehen.
- Planner/Synthesizer/Verifier sind Rollen, keine Freigabeinstanzen.
- Human Approval bleibt oberste Freigabe für sensitive Aktionen.

Wortlaut-Konstante (verbatim, nicht umzuformulieren): "Agenten können gestufte Rechte bekommen. Human Approval bleibt Primat für riskante Aktionen. Kein Agent darf sich selbst höhere Rechte geben."

## Relation To Execution Claims

Bezug zur Execution Claim Policy aus `AGENTS.md` / `WORKFLOW.md`:

- `proposed` = vorgeschlagen.
- `drafted` = als Entwurf erzeugt.
- `applied` = angewendet / geschrieben / ausgeführt.
- `verified` = geprüft.

Aber: `verified` ≠ `approved`. `approved` ist eine menschliche Freigabeentscheidung oder eine explizit dokumentierte Gate-Freigabe (z. B. die scoped Schreibfreigabe, unter der dieses Dokument selbst entstanden ist). Ein Agent darf `approved` nicht selbst behaupten, wenn kein Approval-Evidence vorhanden ist. `approved` ist damit ein fünfter, vom Execution-Status klar getrennter Begriff — kein Ersatz und keine Erweiterung der bestehenden vier Execution-Status-Werte.

## Approval Evidence

Für eine spätere, noch nicht implementierte Approval-Evidence-Struktur wären folgende Felder relevant:

- wer/was hat freigegeben
- was genau wurde freigegeben
- Scope
- Pfad / Tool / Zielsystem
- Zeitpunkt
- Ablaufdatum oder Einmaligkeit
- zugehöriger Verify-Step
- offene Risiken

Keine personenbezogenen Secrets oder Credentials dokumentieren — konsistent mit `policies/secret-classes.yaml` (Klasse A/B: `raw_model_visibility: forbidden`, `memory_persistence: forbidden`).

## No-Duplicate Rule

- Bestehende Skill-Dateien (`skills/*/SKILL.md`) werden nicht geändert.
- Bestehende Policies (`policies/secret-classes.yaml`, `policies/tool-capabilities.yaml`) werden nicht dupliziert.
- `docs/computer-use-policy.md` bleibt eigenständige Referenz, nicht hier neu definiert.
- `docs/skill-contract-gap-analysis.md` bleibt Gap-Dokument, nicht hier erweitert oder überschrieben.
- Dieses Dokument ist Brücke, keine Runtime-Implementierung.
- Externe Risk-Tier-Systeme (z. B. `OpenAI_Agent_Swarm`-Privilege-Inheritance) werden nicht importiert, nur als Kontrastfolie referenziert.
- `core/contracts/permission-boundary.json`, `core/contracts/handoff-protocol.json`, `core/contracts/resource-governor.json` werden nur zitiert, nicht verändert.

## Proposed Future Fields

Keine Migration durchgeführt. Nur als Vorschlag dokumentiert — future proposal, kein aktueller Contract:

```yaml
human_approval_required: true
approval_tier: read_only | draft_only | approved_write | sensitive_action | forbidden_or_blocked
approval_scope: string
approval_evidence_required: true
agent_privilege_level: observer | drafter | bounded_writer | sensitive_requester
privilege_escalation_allowed: false
```

## Non-Goals

- keine Runtime-Aktivierung
- kein Validator
- keine Skill-Migration
- keine Provider-Implementierung
- keine Computer-Use-Aktivierung
- keine Änderung an bestehenden `SKILL.md`-Dateien
- keine Freigabe realer Aktionen
- keine produktive Ausführung

## Recommended Next Gate

Empfohlen: **PBC-Extension-Proposal** — eine docs-only Skizze, wie `approval_tier`, `agent_privilege_level` und die bereits in `permission-boundary.json` vorhandenen `human_gate.request`-Kategorie und `scope`-Werte (`own-run`/`own-workflow`/`cross-workflow`/`global`) zueinander passen könnten, weiterhin ohne Schema-Änderung. Begründung: PBC ist bereits `contract-backed` mit `validatorStatus: deferred` und enthält die einzige existierende maschinenlesbare Struktur, die `human_gate` und Scope gemeinsam modelliert — die nächste sinnvolle Brücke liegt dort, nicht in einer neuen Skill-Migration oder Computer-Use-Aktivierung.

## Result

`result`: `pass`

## Owner / Scope

Owner: Cheikh (baum777). Repo: `agentic_workflow/model-agnostic-workflow-system`. Surface: `docs/`. Task class: docs-only governance-adjacent extension. Risk: niedrig (keine Code-/Schema-/Runtime-Änderung).

## Files Read

`AGENTS.md`, `WORKFLOW.md`, `docs/README.md`, `docs/architecture.md`, `docs/runtime-activation-status.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`, `docs/computer-use-policy.md`, `docs/skill-contract-gap-analysis.md`, Verzeichnislistings von `skills/`, `providers/`, `core/contracts/`, `policies/`, sowie `core/contracts/permission-boundary.json`, `core/contracts/resource-governor.json`, `core/contracts/handoff-protocol.json`.

## Files Changed

Genau eine Datei: `docs/human-approval-tier-extension.md` (vorher nicht existent, per `test -f` geprüft).

## Approval Model Recorded

5-Tier-Modell (`read_only` → `draft_only` → `approved_write` → `sensitive_action` → `forbidden_or_blocked`), gemappt auf `write_mode`, `computer_use_allowed` und `agent_privilege_hierarchy`. Human-Approval-Primat-Regel verbatim übernommen: Agenten können gestufte Rechte bekommen, Human Approval bleibt Primat für riskante Aktionen, kein Agent darf sich selbst höhere Rechte geben. `verified` explizit von `approved` getrennt.

## Verification

`test -f docs/human-approval-tier-extension.md` vor dem Write → `NOT_EXISTS`. Datei danach an exakt diesem Pfad erstellt. `git status --short` zeigt nur die neue Datei als Änderung durch diese Session; bereits vorher dirty Dateien (`AGENTS.md`, `WORKFLOW.md`, `docs/README.md`, `providers/README.md`, `docs/agent-teams/*`, `docs/computer-use-policy.md`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`) wurden nicht erneut angefasst. Keine `SKILL.md`, keine `policies/*.yaml`, keine `core/contracts/*.json`, keine Runtime-/Provider-Datei geändert. Keine Secrets gelesen oder ausgegeben. Diff ist docs-only. Dokument behauptet keine existierende Runtime-Fähigkeit (alle Felder als `proposed`/zukünftig markiert).

## Risks / Gaps

- Die vorgeschlagenen Tier-Namen sind noch nicht mit einer bestehenden Skill-Instanz durchgespielt worden (rein konzeptionell).
- Der Konflikt zwischen `agent_privilege_hierarchy` und externen Full-Autonomy-Mustern (`OpenAI_Agent_Swarm`) bleibt bewusst unaufgelöst — das ist beabsichtigt, kein Defizit dieses Slices.
- `approval_evidence_required` hat noch keine konkrete Speicher- oder Log-Zielangabe; das ist an `log_target` aus `docs/skill-contract-gap-analysis.md` gekoppelt und dort offen.

## Next Gate

PBC-Extension-Proposal: docs-only Skizze, wie `approval_tier` und `agent_privilege_level` auf die bestehende `human_gate.request`-Kategorie und Scope-Werte in `core/contracts/permission-boundary.json` projiziert werden könnten — weiterhin ohne Schema-Änderung, ohne Validator, ohne Migration.
