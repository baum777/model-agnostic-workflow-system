# MAWS vNext — Skill Intelligence & Instruction Integrity
## Target Architecture & Implementation Specification

**Document ID:** MAWS-SII-TARGET-SPEC-001  
**Version:** 0.2.0  
**Date:** 2026-10-20  
**Status:** PROPOSED — TARGET SPECIFICATION  
**Owner:** model-agnostic-workflow-system  
**Authority:** Design proposal; no canonical adoption or runtime activation  
**Scope:** Shared-Core, Skill Lifecycle, Instruction Management, Harness, Evals, Qualification  
**Revision:** v0.2.0 (2026-10-20) — erweitert v0.1.0 um getrennte Harness-Kontexte (§ 4.3), modelladaptive Executor-Profile (§ 11.5) und einen vergleichenden Benchmark-Harness (§ 10.6); Klärung der Kontext-Ownership (§ 7.5) und der Audit-Coverage-Grenzen (§ 6.6). Amendment Note am Dokumentende.

---

## 1. Executive Summary

MAWS vNext soll zu einem modellagnostischen, evidenzbasiert optimierbaren Agentic-Workflow-System weiterentwickelt werden.

Die Erweiterung kombiniert drei Fähigkeiten:

1. **Skill Intelligence** — Wiederkehrende Nutzerkorrekturen, Fehlverhalten und erfolgreiche Arbeitsmuster werden in überprüfbare Skill-Verbesserungen überführt.
2. **Instruction Integrity** — Geladene Anweisungen werden auf Widersprüche, Redundanzen, veraltete Referenzen, unnötige Verpflichtungen und Modellkompatibilität geprüft.
3. **Adaptive Harness** — Kontext, Skills, Werkzeuge, Executor-Bindings und Validierungsverfahren werden aufgaben- und risikobezogen zusammengestellt.

Das System soll nicht durch immer umfangreichere Systemprompts zuverlässiger werden, sondern durch:

- präzise, kompakte Instruktionen;
- dynamische Skill- und Kontextauswahl;
- deterministisch durchgesetzte Sicherheitsgrenzen;
- evidenzbasierte Executor-Qualifikation;
- reproduzierbare Verhaltensevaluation;
- kontrollierte, versionierte Verbesserung.

### Core Principle

> Maximize useful agent capability while minimizing unnecessary instruction overhead, preserving deterministic governance and verifiable execution.

### v0.2.0 Erweiterungsumfang

v0.2.0 erweitert den bestehenden v0.1.0-Body um drei zusammenhängende Bereiche:

1. **Getrennte Harness-Kontexte** (§ 4.3) — Development Harness und UNITERA Product Harness als getrennt berechtigte Ausführungskontexte, deren Berechtigungen nicht ineinander übertragbar sind.
2. **Modelladaptive Executor-Profile** (§ 11.5) — eine versionierte Darstellungs- und Interaktionsschicht über der modellagnostischen Orchestrierungssemantik.
3. **Vergleichender Benchmark-Harness** (§ 10.6) — die Orchestrierungsform selbst wird gegen eine Single-Executor-Baseline gemessen, statt allein Skill- und Instruktionsänderungen zu evaluieren.

Zusätzlich werden zwei bestehende Grenzen explizit gemacht: die Kontext-Ownership gegenüber dem coreos-eigenen Context Compiler (§ 7.5) und die deklarierte Abdeckungsgrenze der Instruction-Audit-Taxonomie (§ 6.6).

Diese Fortschreibung startet keine bereits implementierten Slice neu und erklärt sie nicht rückwirkend als abgeschlossen.

### Primary Invariant

```text
Instruction != Authority
Skill != Permission
Context != Grant
Model Capability != Autonomy
Evaluation PASS != Approval
Execution SUCCESS != Completion
Feedback != Canonical Truth
Proposal != Promotion
```

Keine Verbesserung darf die bestehenden Autoritätsgrenzen automatisch erweitern.

---

## 2. Objectives

### O1 — Instruction Efficiency

Reduzierung unnötiger Always-on-Instruktionen und redundanter Kontextbelastung.

Erhaltung aller erforderlichen Architektur-, Governance- und Sicherheitsinformationen.

### O2 — Skill Effectiveness

Skills werden nicht allein nach Format und Schema beurteilt, sondern anhand ihres tatsächlichen Einflusses auf Aufgabenqualität und Agentenverhalten.

### O3 — Continuous Improvement

Korrekturen und Ausführungsevidenz können in reproduzierbare Regressionstests und versionierte Verbesserungen überführt werden.

### O4 — Model-Agnostic Portability

Gemeinsame Skill- und Governance-Semantik bleibt unabhängig von Modell, Provider und Agent-Harness.

Modellspezifische Unterschiede werden über Qualification, Execution Profiles, Adapter und Evals behandelt.

### O5 — Deterministic Governance

Kritische Sicherheits-, Berechtigungs-, Budget- und Completion-Regeln werden technisch durchgesetzt.

Prompttext erläutert die Grenzen, ersetzt deren Enforcement jedoch nicht.

### O6 — Evidence-Backed Evolution

Keine dauerhafte Regeländerung ohne nachvollziehbaren Befund, getesteten Änderungskandidaten und erforderliche Freigabe.

### O7 — Harness Context Separation

Entwicklungsharness und UNITERA Product Harness werden als getrennt berechtigte Ausführungskontexte geführt. Berechtigung, Effect-Grenzen und Nachweis-Pflichten des einen Kontexts werden nicht aus dem anderen abgeleitet.

### O8 — Measured Orchestration Benefit

Der Nutzen dynamischer Orchestrierung wird gegenüber einer statischen Single-Executor-Baseline gemessen. Der Vorteil wird nicht angenommen, sondern anhand reproduzierbarer Vergleichsläufe belegt oder verworfen.

---

## 3. Current Architecture Baseline

### 3.1 Existing Components

Folgende MAWS-Komponenten werden wiederverwendet:

| Component | Existing Owner / Surface |
|---|---|
| Root Governance | `AGENTS.md` |
| Workflow Contract | `WORKFLOW.md` |
| Authority Hierarchy | `docs/governance/source-hierarchy.md` |
| Authority Evidence | `docs/authority-matrix.md` |
| Layered Prompt Architecture | `docs/model-agnostic-core-prompt-system.md` |
| Portable Skills | `core/skills/` |
| Local Orchestration Skills | `.agents/skills/` |
| Skill Manifest | `core/contracts/portable-skill-manifest.json` |
| Workflow Routing | `core/contracts/workflow-routing-map.json` |
| Permission Boundary | `core/contracts/permission-boundary.json` |
| Workflow Memory | `core/contracts/workflow-memory-contract.json` |
| Qualification | `runtime/qualification/` |
| Execution Orchestration | `runtime/orchestrator/` |
| Runtime Evidence | `artifacts/runtime-runs/` |
| Skill Security Admission | `runtime/skills/frontdoor.mjs` |
| Certification Evals | `evals/` |
| Self-Harness Concept | `docs/harness/self-harness-loop.md` |
| Provider Exports | `providers/` |

### 3.2 Existing Capabilities to Preserve

- Executor-centric workflow architecture.
- Capability-first executor eligibility.
- Evidence-backed qualification.
- Immutable BoundExecutionGraph versions.
- Version-anchored plan revisions.
- Policy-driven arbitration.
- Bounded decomposition and composition.
- Jev-backed typed semantic decisions.
- Deterministic permission and completion gates.
- SkillSpector / SkillEvaluator admission.
- Provider-neutral skill and output contracts.
- Controlled runtime memory and evidence.
- Human approval and fail-closed behavior.

### 3.3 Identified Extension Gaps

Die Zielerweiterung adressiert insbesondere:

1. Kein nachgewiesener durchgängiger Feedback-to-Skill-Improvement-Lifecycle.
2. Keine vollständig integrierte Prüfung sämtlicher effektiv geladener Instruktionen.
3. Keine systematische Behavioral-Baseline/Candidate-Evaluation für Skill-Änderungen.
4. Keine explizite Versionsbindung des gesamten effektiven Instruction Bundles im Qualification Fingerprint.
5. Keine nachgewiesene adaptive Prompt-Zusammenstellung mit vollständiger Konfliktprüfung.
6. Keine gemeinsame Improvement-Analyse für Skill-, Prompt-, Routing- und Harness-Fehler.

Diese Punkte sind Erweiterungslücken, keine Aussage, dass bestehende Skill-, Eval- oder Governance-Komponenten fehlen.

Der aktuelle Implementierungsstand muss vor jedem Implementation Slice gegen den tatsächlichen Repository-HEAD neu verifiziert werden.

### 3.4 Extern verantwortliche Owner-Surfaces

Die Zielarchitektur erweitert MAWS nicht zu einer zweiten Instanz bestehender Verantwortlichkeiten. Die folgenden Surfaces bleiben an ihren Eigentümern:

| Concern | Owner | MAWS-Rolle |
|---|---|---|
| Source-Proofs, Datenklassifikation, Egress, Context-Budget | `coreos` (Context Compiler, `src/context/`) | Consumer der kompilierten Context-Quelle |
| Instruction-Klassen, Skill-Auswahl, Bundle-Assemblierung | MAWS | Owner |
| Executor-Eligibility, Qualification, Routing, Composition | MAWS | Owner |
| Tenant-Authority, Membership, Execution Control, Effect Dispatch | `unitera_control_plane`, `unitera_identity`, `Unitera_Systems` | Consumer |
| Capability-, Autonomie- und Grant-Semantik | `unitera-os` | Consumer |
| Registrierung, Provenienz, Supersession | Unitera Registry | Consumer |
| Kartographie, Navigation, Beziehungsdarstellung | Unitera Atlas | Consumer |

Diese Zuordnung ist bindend für die Umsetzung: MAWS führt keinen zweiten Context Compiler, keine zweite Execution-Control-Instanz und keine zweite Governance Authority ein.

---

## 4. Target Architecture

### 4.1 Logical Architecture

```text
USER / OPERATOR / WORK REQUEST
                |
                v
        TASK & CONTEXT INTAKE
                |
                v
     DETERMINISTIC POLICY ENVELOPE
                |
                v
       INSTRUCTION RESOLVER
                |
       +--------+---------+
       |                  |
       v                  v
 INSTRUCTION AUDIT    SKILL ROUTING
       |                  |
       +--------+---------+
                |
                v
       CONTEXT ASSEMBLY
                |
                v
    EFFECTIVE INSTRUCTION BUNDLE
                |
                v
      QUALIFICATION / ELIGIBILITY
                |
                v
       MAWS WORKGRAPH PLANNER
                |
                v
         EXECUTOR BINDING
                |
                v
       GOVERNED TASK EXECUTION
                |
                v
    VERIFICATION / COMPLETION
                |
                v
      EVIDENCE & OBSERVABILITY
                |
                v
        IMPROVEMENT ANALYZER
                |
       +--------+---------+
       |                  |
       v                  v
 SKILL IMPROVEMENT   INSTRUCTION REPAIR
       |                  |
       +--------+---------+
                |
                v
       BASELINE/CANDIDATE EVALS
                |
                v
      GOVERNANCE / OWNER GATES
                |
                v
       VERSIONED ADOPTION
```

Das Diagramm beschreibt logische Verantwortlichkeiten.

Es verlangt keine zusätzlichen dauerhaften Services, keine automatische Hintergrundausführung und keine zweite MAWS-Orchestrierung.

### 4.2 Authority Separation

Die bestehenden Autoritätsverhältnisse bleiben erhalten.

```text
Canonical Governance
         |
         v
Deterministic Policy / Permission Enforcement
         |
         v
MAWS Orchestration
         |
         v
Instruction / Skill / Context Resolution
         |
         v
Qualified Executor
         |
         v
Evidence / Verification / Completion
```

Der Instruction Resolver besitzt keine eigene Berechtigungsautorität.

Ein Skill kann Tool-Nutzung beschreiben, jedoch keine Permission erzeugen.

Ein Executor darf Verbesserungen vorschlagen, aber seine eigenen Qualifikations- oder Freigabebedingungen nicht verändern.

### 4.3 Harness Contexts

MAWS unterscheidet zwei getrennte Ausführungskontexte. Beide nutzen denselben executor-zentrierten Kern, beziehen ihre Berechtigung aber aus unterschiedlichen Quellen.

**A. Development Harness**

Scope: Repository-Inspektion, Code-Erzeugung und -Änderung, Tests und Validierung, Security-Auditing, Pull-Request-Vorbereitung, Cross-Repository-Abgleich.

Authority-Quelle: aktuelle Operator-Zuordnung, Repository-Ownership, geltende Governance und vermittelte Tool-Berechtigungen.

**B. UNITERA Product Harness**

Scope: mandantenspezifische Arbeit, persönlicher und institutioneller Kontext, capability-gebundene Business-Operationen, menschliche Entscheidungen und begrenzte Delegation, Provider-Interaktionen, persistente Runtime-Evidenz.

Authority-Quelle: verifizierte Identität, Tenant-Mitgliedschaft, aktuelle Policies, Delegation, Grants und Execution-Control-Entscheidungen.

```text
Development-Harness-Berechtigung != Product-Runtime-Authority
Harness Context != Tenant Assignment
Harness Context != Authority
```

Regeln:

- Der Harness-Kontext ist eine Routing- und Binding-Größe, keine Berechtigungsquelle.
- Ein Development-Harness-Run leitet keine Product-Runtime-Authority aus einer Instruktion, einem Skill, einer Modellfähigkeit oder einer Provider-Konfiguration ab.
- Der Wechsel des Harness-Kontexts ist ein gebundener Planwechsel mit eigener Evidenz, kein impliziter Fallback.
- Executor-Bindungen tragen den Harness-Kontext. Eine im Development-Kontext qualifizierte Executor-Bindung gilt nicht automatisch im Product-Kontext und umgekehrt.
- Product-Effekte bleiben unabhängig vom Harness-Kontext an Tenant-, Membership- und Execution-Control-Entscheidungen gebunden.
- Ein Run, dessen Kontextbindung fehlt oder widersprüchlich ist, bindet keinen Executor.

Der Slice S11 führt die maschinenlesbare Bindung ein; dieser Abschnitt beschreibt die Zielsemantik.

---

## 5. Instruction Architecture

### 5.1 Instruction Classes

MAWS klassifiziert Instruktionen anhand ihres Zwecks.

| Class | Purpose | Runtime Treatment |
|---|---|---|
| HARD_INVARIANT | Nicht verhandelbare Systemgrenzen | Deterministic enforcement |
| CONDITIONAL_RULE | Situationsgebundene Verpflichtung | Condition-based activation |
| TASK_GUIDANCE | Aufgabenbezogene Arbeitsmethode | Skill loading |
| DOMAIN_CONTEXT | Fach- und Projektwissen | Purpose-bound retrieval |
| STYLE_PREFERENCE | Darstellung und Kommunikation | Optional overlay |
| PROVIDER_ADAPTATION | Provider-/Harness-Spezifika | Adapter projection |

### 5.2 Hard Invariants

Folgende Bereiche bleiben technisch verbindlich:

- Permission- und Authority-Enforcement.
- Scope- und Path-Boundaries.
- Secret- und Credential-Schutz.
- Human Approval.
- Qualification und Eligibility.
- Externe Effekte und Idempotenz.
- Budget- und Ressourcenlimits.
- Completion- und Verification-Anforderungen.
- Canonical Source Authority.
- Verbot automatischer Scope-/Authority-Erweiterung.

Die Formulierung eines Hard Invariant darf vereinfacht werden.

Seine technische Bedeutung darf dabei nicht abgeschwächt werden.

### 5.3 Conditional Instructions

Situationsbezogene Regeln werden durch explizite Bedingungen aktiviert.

Beispiel:

**Legacy Instruction**

> Always run all tests before completing any task.

**Target Instruction**

> For implementation changes, execute the relevant tests and mandatory repository gates before reporting verified completion.

Die Runtime beziehungsweise der Validator bestimmt die tatsächlich verpflichtenden Gates.

Ein Modell darf verpflichtende Prüfungen nicht durch eigene Interpretation deaktivieren.

### 5.4 Instruction Priority

Die bestehende kanonische Source-Hierarchie bleibt maßgeblich.

Anweisungen werden unter Berücksichtigung von:

1. geltender Governance und technischen Hard Constraints;
2. genehmigtem Task Scope;
3. Workflow-Verträgen;
4. Skill-Verträgen;
5. Tool-Verträgen;
6. externen Daten und Modellinferenz

aufgelöst.

Zusätzliche Prompt-Layer dürfen die kanonische Reihenfolge nicht ersetzen.

Konflikte zwischen bestehenden kanonischen Dokumenten werden gemeldet und am zuständigen Owner-Surface geklärt.

---

## 6. Instruction Integrity Layer

### 6.1 Purpose

Der Instruction Integrity Layer überprüft die Konsistenz, Aktualität und Angemessenheit der für eine Aufgabe relevanten Instruktionen.

Er ist ein Analyse- und Kompositionsmechanismus, keine neue Governance Authority.

### 6.2 Required Audit Classes

| Finding Code | Definition |
|---|---|
| STALE_REFERENCE | Datei, Import oder Referenz existiert nicht |
| INVALID_COMMAND | Referenzierter Befehl ist nicht verfügbar |
| RULE_CONFLICT | Zwei relevante Regeln sind logisch unvereinbar |
| PRECEDENCE_CONFLICT | Widerspruch zwischen Authority-Ebenen |
| OVERCONSTRAINT | Regel ist breiter als ihr notwendiger Geltungsbereich |
| REDUNDANT_INSTRUCTION | Wiederholung ohne eigenständige Funktion |
| CONTEXT_OVERLOAD | Irrelevanter Kontext wird geladen |
| AUTHORITY_LEAK | Instruktion behauptet nicht vorhandene Berechtigung |
| MODEL_DRIFT | Instruktionsverhalten ändert sich nach Modellwechsel |
| SKILL_ROUTING_AMBIGUITY | Skill-Auswahl ist mehrdeutig oder unpräzise |

### 6.3 Audit Requirements

Der Auditor soll:

- alle tatsächlich geladenen Instruktionsquellen erfassen;
- Quellenidentität, Revision und Digest erhalten;
- Geltungsbereiche und Authority-Klassen unterscheiden;
- deterministisch prüfbare Referenzprobleme erkennen;
- semantische Konflikte als überprüfbare Befunde ausgeben;
- Änderungen mit möglichem Governance-Effekt kennzeichnen;
- Empfehlungen erzeugen, ohne Originaldateien zu verändern.

### 6.4 Finding Contract

Jeder Befund enthält mindestens:

```yaml
finding_id: string
finding_class: string
source_path: string
source_revision: string
line_range: [integer, integer]
authority_class: string
observed_problem: string
evidence_refs: []
inferred_cause: string | null
risk_level: low | medium | high | blocker
confidence: low | medium | high
recommended_action: string
requires_owner_review: boolean
```

`confidence` beschreibt die Sicherheit der Diagnose.

Es ersetzt keine Authority- oder Approval-Entscheidung.

### 6.5 Audit Safety

Der initiale Auditor operiert read-only.

- Keine automatische Änderung von `AGENTS.md`.
- Keine Policy-Mutation.
- Keine Registry-Promotion.
- Keine Provider-Credential-Reads.
- Keine automatische Modellqualifikation.
- Keine Produktionsaktivierung.

Semantische Befunde sind zunächst advisory.

Deterministisch bewiesene Integritätsfehler können gemäß bestehender Gate-Policy blockieren.

### 6.6 Coverage Boundaries

Die geschlossene Taxonomie in 6.2 ist der Zielumfang des Auditors, nicht der Umfang der heute deterministisch entscheidbaren Klassen.

- Statisch entscheidbare Klassen werden deterministisch geprüft.
- Die übrigen Klassen sind semantisch und werden als nicht statisch analysierbar ausgewiesen.
- Das Fehlen von Befunden in einer als nicht statisch analysierbar ausgewiesenen Klasse ist eine deklarierte Limitation und kein Freibrief.
- Semantische Klassen erfordern eine owner-geprüfte Analyse; sie blockieren niemals allein und ersetzen keine Approval-Entscheidung.
- Eine Erweiterung der Wellenabdeckung ist eigene, messbar gemachte Slice-Arbeit und keine implizite Eigenschaft des Auditors.
- Der Audit-Report führt die analysierten und die ausdrücklich nicht analysierten Klassen getrennt mit.

Ein Auditor, der eine Klasse nicht prüft, behauptet für diese Klasse keine Compliance.

### 6.7 Welle 2 — Advisory-Signallayer für die semantischen Klassen

Welle 1 hat die zwei statisch entscheidbaren Klassen geprüft und die übrigen
acht als nicht statisch analysierbar ausgewiesen. Welle 2 erweitert die
Wellenabdeckung um eine deterministische Signallayer
(`runtime/instructions/instruction-semantic-signals.mjs`): jede der acht
semantischen Klassen erhält ein Signal, das Kandidatenfundstellen mit Beleg
benennt.

Das Signal entscheidet die Klasse nicht.

- Jeder Fund trägt `determinism: semantic_advisory`, `requires_owner_review:
  true` und niemals `risk_level: blocker`; ein solcher Befund blockiert
  niemals allein.
- Die Klasse bleibt als nicht statisch analysierbar ausgewiesen. Der
  Audit-Report führt die Kandidatenzahl je Klasse neben dieser Limitation.
- Ein Kandidat ist ein Hinweis; die Klassifikation ist eine
  owner-geprüfte Analyse.
- Das Fehlen von Kandidaten ist kein Freibrief: es bleibt die deklarierte
  Limitation der Klasse.

Die acht Signale sind:

| Klasse | Deterministisches Signal |
|---|---|
| RULE_CONFLICT | derselbe punktierte Key ist in Instruktionszeilen unterschiedlicher Quellen an unterschiedliche Werte gebunden |
| PRECEDENCE_CONFLICT | dasselbe Subjekt wird in Quellen unterschiedlicher Authority-Klasse entgegengesetzt geregelt |
| OVERCONSTRAINT | ein Verbot quantifiziert über alles und nennt keine Grenze, an der es endet |
| REDUNDANT_INSTRUCTION | dieselbe normalisierte Instruktion steht in mehr als einer Quelle |
| CONTEXT_OVERLOAD | jede Instruktion einer Quelle steht bereits in einer Quelle höherer Authority |
| AUTHORITY_LEAK | eine Quelle unterhalb der kanonischen Authority-Klassen behauptet eine Berechtigung |
| MODEL_DRIFT | eine Instruktion behauptet ein Modellverhalten oder eine Modelleigenschaft |
| SKILL_ROUTING_AMBIGUITY | zwei Skill-Beschreibungen beanspruchen dasselbe Feld |

Die Welle ist messbar gemacht: der aktuelle Korpus lieferte in der
unkalibrierten Fassung 107 Rohkandidaten (davon 100 aus der
Skill-Routing-Klasse). Nach Kalibrierung der drei verrauschenden Signale
liefert derselbe Korpus 0 Kandidaten. Die Kalibrierung ist Teil des
Evidence-Runs `evidence/instruction-audit-wave2-2026-10-21/`.

---

## 7. Adaptive Context Assembly

### 7.1 Objective

Die effektiv geladene Instruktionsmenge soll möglichst klein sein, ohne notwendige Informationen, Evidence oder Sicherheitsgrenzen zu verlieren.

### 7.2 Loading Model

```text
Stable Core
    +
Task-Specific Workflow Contract
    +
Relevant Domain Overlay
    +
Selected Skill Instructions
    +
Required References
    +
Purpose-Bound Evidence
    =
Effective Instruction Bundle
```

### 7.3 Loading Rules

1. Always-on-Kontext enthält nur dauerhaft relevante Kernregeln.
2. Skills werden anhand von Aufgabe und Triggern ausgewählt.
3. Umfangreiche Referenzen werden bei Bedarf nachgeladen.
4. Kontextquellen werden nach Zweck und Relevanz gefiltert.
5. Nicht benötigte Beispiele bleiben außerhalb des aktiven Kontextes.
6. Roh-Evidenz bleibt adressierbar.
7. Kontextkürzung darf keine benötigte Prüfgrundlage entfernen.
8. Provider-spezifisches Prompt-Caching bleibt optional und adaptergebunden.

### 7.4 Instruction Bundle

Für jeden relevanten Run soll die effektive Instruktionszusammenstellung reproduzierbar sein.

Proposed Contract:

```yaml
instruction_bundle:
  bundle_id: string
  schema_version: 1.0.0

  task_ref: string
  workflow_class: string

  core_instruction_refs: []
  policy_refs: []
  overlay_refs: []
  skill_refs: []
  context_refs: []

  source_revisions: []
  source_digests: []

  executor_profile_ref: string
  assembly_policy_ref: string

  effective_instruction_digest: string

  provenance:
    assembled_at: datetime
    assembler_version: string
    source_snapshot_ref: string
```

Der Digest bindet die tatsächlich verwendeten Inhalte und ihre definierte Reihenfolge.

Ein Bundle ist Kontext- und Verhaltensinput, kein Permission-Token.

### 7.5 Context Ownership und Nicht-Duplikation

Die Kontextsemantik ist geteilt, aber nicht doppelt.

| Artefakt | Owner | Zweck |
|---|---|---|
| Context Compilation (Source-Proofs, Datenklasse, Egress, Context-Budget) | `coreos` — `src/context/` (Context Compiler) | Wissen, Klassifikation, Egress, Budget |
| Instruction Bundle (Instruktionen, Skills, Reihenfolge, Digest) | MAWS — Slice S6 | Effektive Instruktionsmenge |
| Executor-Binding, Qualification, Routing | MAWS | Ausführungswahl |
| Execution Control, Effect Dispatch | `Unitera_Systems`, `unitera_control_plane` | Durchsetzung |

Regeln:

- MAWS führt keinen zweiten Context Compiler und kein zweites kanonisches Context Manifest ein.
- Ein Instruction Bundle ist kein Context Manifest. Das Bundle bindet Instruktionen und Skills; die kompilierte Context-Quelle bindet Wissen, Klassifikation und Egress. Beide werden versiongebunden referenziert, nicht dupliziert.
- Fehlt eine für die Aufgabe erforderliche Context-Quelle, blockiert die betroffene Ausführung. Sie wird nicht durch eine schmalere Bundle-Definition ersetzt.
- Der Bundle-Digest referenziert die Context-Bindung, statt die Context-Bindung zu duplizieren.
- Widersprüchliche oder fehlende Kontextquellen bleiben als Konflikt im Bundle sichtbar und werden nicht stillschweigend aufgelöst.

---

## 8. Skill Intelligence Layer

### 8.1 Objective

Wiederkehrende Nutzerkorrekturen und beobachtete Ausführungsfehler sollen kontrolliert zur Verbesserung vorhandener Skills beitragen.

### 8.2 Feedback Sources

Zulässige Input-Kategorien:

- explizite Operator-Korrekturen;
- fehlgeschlagene Evals;
- Regressionen;
- strukturierte Run Evidence;
- Verification Failures;
- Routing-Fehler;
- wiederkehrende manuelle Nachbesserungen;
- positive, überprüfte Referenzbeispiele.

Modell-Selbstauskünfte sind keine unabhängige Ausführungsevidenz.

### 8.3 Feedback Classification

Jeder relevante Befund wird einer primären Fehlerklasse zugeordnet:

```text
SKILL_SELECTION_ERROR
SKILL_INSTRUCTION_ERROR
INSTRUCTION_CONFLICT
CONTEXT_SELECTION_ERROR
TOOL_CONTRACT_ERROR
EXECUTOR_BEHAVIOR_ERROR
VERIFICATION_GAP
POLICY_ENFORCEMENT_ERROR
EVIDENCE_GAP
UNKNOWN_ROOT_CAUSE
```

Die Fehlerklasse bestimmt den zuständigen Verbesserungsbereich.

Ein Skill wird nicht verändert, wenn der nachgewiesene Fehler ausschließlich im Tool-Contract oder der Runtime liegt.

### 8.4 Reuse / Extend / Create

Vor einer neuen Skill-Erstellung erfolgt die bestehende Reuse-Entscheidung:

```text
Existing Skill Sufficient?
        |
     YES -> REUSE
        |
      NO
        |
Existing Skill Extendable?
        |
     YES -> EXTEND
        |
      NO
        |
Reusable Pattern Proven?
        |
     YES -> CREATE PROPOSAL
        |
      NO -> NO NEW SKILL
```

Einmalige Korrekturen rechtfertigen nicht automatisch einen neuen Skill.

### 8.5 Skill Structure

Der Skill-Kern soll kompakt bleiben.

Er enthält:

- Identität und Zweck;
- Description;
- Aktivierungsbedingungen;
- Ausschlussbedingungen;
- erforderliche Inputs;
- geordnete Workflow-Schritte;
- Output Contract;
- Quality Checks;
- Failure Behavior;
- benötigte Referenzen.

Zusätzliche Beispiele, Templates und seltene Edge Cases werden bei Bedarf geladen.

---

## 9. Feedback-to-Improvement Lifecycle

### Stage 1 — Capture

Relevantes Feedback wird mit zugehöriger Task-, Skill-, Executor- und Run-Evidence erfasst.

### Stage 2 — Diagnose

Der Analyzer prüft:

- War der richtige Skill aktiv?
- Wurde die richtige Instruktion geladen?
- War der notwendige Kontext vorhanden?
- Ist die Abweichung reproduzierbar?
- Liegt die Ursache im Modell, Skill, Tool, Harness oder Validator?

### Stage 3 — Proposal

Bei hinreichender Evidenz wird ein Änderungskandidat erzeugt.

Mögliche Dispositionen:

```text
NO_CHANGE
REUSE
EXTEND_SKILL
CREATE_SKILL
REPAIR_INSTRUCTION
REPAIR_ROUTING
REPAIR_VALIDATOR
REPAIR_RUNTIME
NEEDS_MORE_EVIDENCE
```

### Stage 4 — Candidate Evaluation

Die bestehende Version wird gegen den Änderungskandidaten getestet.

Tests laufen mit getrennten, reproduzierbaren Kontexten.

### Stage 5 — Governance Review

Prüfung von:

- Scope;
- kanonischem Owner;
- Skill Frontdoor;
- Security;
- regressionskritischen Fällen;
- Qualification Materiality;
- erforderlichen menschlichen Entscheidungen.

### Stage 6 — Promotion

Nur freigegebene Kandidaten werden über die zuständigen kanonischen Repository-Surfaces übernommen.

Die bestehenden Registry- und Provider-Export-Prozesse bleiben maßgeblich.

### Stage 7 — Observation

Neue Runs liefern weitere Evidenz.

Fehler können neue Vorschläge auslösen, aber keine automatische Promotion.

---

## 10. Behavioral Evaluation Framework

### 10.1 Evaluation Principle

Schema-Validität ist notwendig, beweist aber keine Verhaltensverbesserung.

MAWS soll die tatsächliche Wirksamkeit der geänderten Instruktionen messen.

### 10.2 Evaluation Dimensions

| Dimension | Purpose |
|---|---|
| ROUTING_ACCURACY | Auswahl des passenden Skills |
| TASK_SUCCESS | Fachlich korrektes Ergebnis |
| CONTRACT_COMPLIANCE | Einhaltung der Output Contracts |
| INSTRUCTION_ADHERENCE | Befolgung relevanter Regeln |
| NEGATIVE_CASE_HANDLING | Verhalten bei unpassendem Skill |
| AMBIGUITY_HANDLING | Umgang mit fehlenden Angaben |
| EVIDENCE_FIDELITY | Keine erfundenen Nachweise |
| AUTHORITY_COMPLIANCE | Keine unzulässigen Rechte oder Effekte |
| CROSS_MODEL_PORTABILITY | Konsistenz über Modelle |
| CONTEXT_EFFICIENCY | Relevante Kontextnutzung |
| TOKEN_COST | Ressourcenverbrauch |
| LATENCY | Ausführungsgeschwindigkeit |

### 10.3 Evaluation Protocol

1. Exakte Baseline-Version fixieren.
2. Repräsentative Testfälle definieren.
3. Negative und unvollständige Fälle ergänzen.
4. Candidate-Version separat laden.
5. Frische, isolierte Sessions verwenden.
6. Exakte Executor-/Modellversion dokumentieren.
7. Baseline und Candidate mit vergleichbaren Inputs prüfen.
8. Ergebnisse gegen unabhängige Akzeptanzkriterien bewerten.
9. Kritische Regressionen separat ausweisen.
10. Prüfbericht unveränderlich referenzieren.

### 10.4 Required Test Families

```text
positive_cases
negative_trigger_cases
missing_information_cases
conflicting_information_cases
untrusted_instruction_cases
tool_failure_cases
model_variation_cases
context_reduction_cases
approval_boundary_cases
regression_cases
```

### 10.5 Promotion Criteria

Ein Candidate ist nur promotionsfähig, wenn:

- sämtliche verpflichtenden Sicherheitsgates bestehen;
- keine kritische Governance-Regression auftritt;
- der relevante Aufgabenbereich ausreichend getestet wurde;
- die festgelegten Qualitätsgrenzen eingehalten werden;
- relevante Verbesserungen gegenüber der Baseline belegt sind;
- Kostenoptimierung keine erforderliche Qualität reduziert;
- erforderliche Freigaben vorliegen.

Numerische Qualitäts- und Stichprobenschwellen werden anhand einer Baseline und eines freigegebenen Eval-Profils definiert.

Keine implizite Erfolgsschwelle aus einer einzelnen Demonstration.

### 10.6 Comparative Benchmark Harness

Die Evaluation in 10.3 misst Kandidaten gegen eine Baseline derselben Spezifikation. Der Comparative Benchmark Harness misst zusätzlich die Orchestrierungsform selbst: eine statische Single-Executor-Ausführung gegenüber einer policy-gebundenen Multi-Executor-Ausführung.

Benchmark-Protokoll:

1. Feste Benchmark-Aufgaben definieren, die eine statische und eine dynamische Variante zulassen.
2. Single-Executor-Baseline mit identischem Input, identischem Executor-Profil und frischen, isolierten Sessions fahren.
3. Policy-gebundene Multi-Executor-Alternative fahren, soweit die Composition-Policy sie zulässt.
4. Messen: Token, Kosten, Laufzeit, Interventionszahl, Verifikationserfolg und Artefaktqualität gegen unabhängige Akzeptanzkriterien.
5. Context-Isolation zwischen den Workern prüfen.
6. Geerbte Authority- und Budget-Grenzen zwischen Parent und Child prüfen.
7. Fälle dokumentieren, in denen Parallelisierung kontraproduktiv ist.
8. Auswahlkriterien für Routing und Composition als Ergebnis festhalten.

Grenzen:

- Decomposition wird nicht gewählt, weil mehrere Executor verfügbar sind.
- Ein Benchmark-Ergebnis ist eine Vergleichsgrundlage, keine Freigabe für breitere Autonomie und keine Qualification.
- Verglichen werden nur Kandidaten innerhalb derselben Authority-Domäne.
- Baseline und Candidate verwenden dieselbe Eval-Familie; ein Benchmark erzeugt keine eigene Erfolgsbehauptung.

---

## 11. Model-Aware Instruction Qualification

### 11.1 Principle

Gemeinsame Skill-Semantik bleibt modellagnostisch.

Die Wirksamkeit einer Instruktionskonfiguration ist jedoch von Modell, Harness, Tools und Ausführungsprofil abhängig.

### 11.2 Qualification Binding

Qualifikation soll künftig auch relevante Instruktionskonfigurationen berücksichtigen.

Proposed Extension:

```text
Qualification Fingerprint
    |
    +-- Model Identity
    +-- Provider/API Version
    +-- Runtime Harness
    +-- Tool Contract References
    +-- Execution Profile
    +-- Eval Profile
    +-- Effective Instruction Bundle Digest
```

### 11.3 Materiality

Änderungen werden gemäß dem bestehenden Materiality-Konzept klassifiziert:

```text
NON_MATERIAL
MATERIAL
UNKNOWN
```

Die bestehenden Regeln zur Requalifikation bleiben erhalten.

Eine relevante Änderung von Skill-Semantik, Sicherheitsinstruktionen, Tool-Nutzungsverhalten oder Executor-Konfiguration darf nicht stillschweigend die vorherige Qualification erben.

`MATERIAL` und `UNKNOWN` benötigen die vorgesehene Requalifikation beziehungsweise blockieren die Anwendung einer nicht mehr gültigen Qualification.

### 11.4 Model Upgrade

Bei Modellwechsel werden mindestens geprüft:

- Tool-Call-Verhalten;
- strukturierte Outputs;
- Regelbefolgung;
- Skill Routing;
- Kontextnutzung;
- kritische Negativfälle;
- Sicherheitsgrenzen;
- Completion-Qualität.

Eine stärkere Modellversion erhält dadurch keine erweiterten Berechtigungen.

### 11.5 Model-Adaptive Executor Profiles

Die gemeinsame Orchestrierungs- und Skill-Semantik bleibt modellagnostisch. Ein modelladaptives Profil optimiert ausschließlich Darstellung und Interaktionsform.

Modell-spezifisch optimierbar:

- Instruktionsdichte und Prompt-Struktur;
- Anzahl und Auswahl der Beispiele;
- Output-Formatierung und strukturiertes Output-Verhalten;
- Context-Packaging und Reihenfolge;
- Anforderungen an die Tool-Call-Schnittstelle;
- Wiederholungs- und Fehlerstrategie für nicht-effektive Aufgaben.

Unveränderlich über alle Modelle:

- Task Scope;
- Authority und Authority Ceiling;
- Tool-Rechte;
- Security Controls;
- Completion Criteria;
- Evidence-Anforderungen.

Abgrenzung zum Execution Profile: Das bestehende `core/contracts/execution-profile.schema.json` dimensioniert die Qualification (tools, effects, context, network, delegation, verification) und bleibt unverändert. Ein modelladaptives Profil ist eine Darstellungs- und Interaktionsschicht darüber und verändert keine Dimension des Execution Profiles.

Regeln:

- Profile sind versioniert und gegen repräsentative Evals qualifiziert.
- Ein Profilwechsel triggert die Requalifikation des betroffenen Verhaltens, nicht automatisch eine Neuformulierung kanonischer Verträge.
- Ein stärkeres Modell erhält dadurch keine erweiterten Berechtigungen.
- Zwei Profile desselben Modells müssen dieselbe Authority- und Completion-Semantik erzeugen; eine Abweichung ist ein Befund, keine zulässige Variante.

---

## 12. Self-Harness Integration

### 12.1 Existing Boundary

Der bestehende Self-Harness Loop ist in seiner dokumentierten ersten Stufe auf evidenzbasiertes Weakness Mining begrenzt.

Weitere Stufen sind bisher als nachgelagerte Konzepte beschrieben.

Diese Target Spec aktiviert sie nicht automatisch.

### 12.2 Target Evolution

```text
Weakness Mining
       |
       v
Improvement Classification
       |
       v
Bounded Proposal
       |
       v
Sandbox Evaluation
       |
       v
Independent Review
       |
       v
Owner-Governed Adoption
```

### 12.3 Separation Rules

- Weakness Mining sammelt Befunde.
- Improvement Analyzer klassifiziert Ursachen.
- Proposal Builder erstellt Änderungskandidaten.
- Evaluator prüft ihre Wirksamkeit.
- Governance entscheidet über Zulässigkeit.
- Canonical Owner verantwortet Adoption.

Keines dieser Module erzeugt selbst zusätzliche Ausführungsautorität.

---

## 13. Security and Governance

### 13.1 Mandatory Boundaries

Die vorhandene Skill Frontdoor bleibt bestehen:

- exakte Candidate-Identität;
- SkillSpector-Scan;
- SkillEvaluator Tier 1;
- deterministische Admission-Disposition;
- getrennte Approval- und Permission-Gates.

Behavioral Evals ergänzen diese Prüfung, ersetzen sie nicht.

### 13.2 Prompt Injection

Instruktions- und Skill-Quellen sind nach Authority und Vertrauen zu klassifizieren.

Externe Inhalte, Repository-Dateien, Logs, Tool-Ausgaben und Feedback dürfen keine höherwertige Authority behaupten.

Eine solche Behauptung wird als Dateninhalt beziehungsweise verdächtige Instruktionsinjektion behandelt.

### 13.3 Data Handling

Feedback- und Eval-Systeme sollen:

- Daten auf erforderlichen Umfang begrenzen;
- Secrets ausschließen;
- Provenienz erhalten;
- vertrauliche Inhalte nur gemäß ihrem Scope verarbeiten;
- Retention und Löschung vertraglich regeln;
- keine tenantübergreifende Wiederverwendung implizieren.

### 13.4 Promotion Boundary

```text
Feedback != Rule
Proposal != Applied Change
Eval PASS != Authority
Approval != Permission
Qualification != Execution Authorization
```

Keine automatische Änderung geschützter Governance-, Policy- oder Approval-Surfaces durch den Improvement Loop.

---

## 14. Proposed Repository Integration

Die folgende Struktur ist eine Zielprojektion.

Vor Implementierung sind tatsächlicher HEAD, vorhandene Zuständigkeiten und mögliche Namensüberschneidungen zu prüfen.

```text
model-agnostic-workflow-system/
|
+-- core/
|   +-- contracts/
|   |   +-- skill-feedback.schema.json
|   |   +-- skill-improvement-proposal.schema.json
|   |   +-- instruction-audit-finding.schema.json
|   |   +-- instruction-bundle.schema.json
|   |   +-- skill-effectiveness-report.schema.json
|   |
|   +-- skills/
|       +-- existing-portable-skills/
|
+-- runtime/
|   +-- instructions/
|   |   +-- instruction-inventory.mjs
|   |   +-- instruction-auditor.mjs
|   |   +-- instruction-resolver.mjs
|   |   +-- context-assembler.mjs
|   |
|   +-- skills/
|   |   +-- frontdoor.mjs
|   |   +-- feedback-analyzer.mjs
|   |   +-- improvement-classifier.mjs
|   |
|   +-- qualification/
|       +-- existing-qualification-logic/
|
+-- evals/
|   +-- skill-effectiveness/
|   |   +-- baseline/
|   |   +-- candidates/
|   |   +-- negative-cases/
|   |   +-- model-parity/
|   |
|   +-- instruction-integrity/
|
+-- scripts/
|   +-- tools/
|       +-- validate-instruction-integrity.mjs
|       +-- run-skill-effectiveness-evals.mjs
|
+-- docs/
|   +-- skill-intelligence-target-spec.md
|   +-- instruction-integrity-contract.md
|   +-- skill-improvement-lifecycle.md
|
+-- drafts/
    +-- skills/
```

Für die in v0.2.0 ergänzten Slices S11–S13 zusätzlich vorgeschlagen. Collision-Check gegen MAWS `origin/main` = `ee7f094b2676963b20161f093ed5a9a01e0c018b`: alle nachstehenden Pfade sind dort frei und existieren noch nicht. Die Pfade sind Vorschlag, keine Zusage.

```text
model-agnostic-workflow-system/
|
+-- core/
|   +-- contracts/
|   |   +-- harness-context.schema.json
|   |   +-- executor-model-profile.schema.json
|   |   +-- benchmark-result.schema.json
|
+-- runtime/
|   +-- harness-context/
|   |   +-- context-binding.mjs
|   +-- profiles/
|       +-- model-adaptive/
|
+-- evals/
|   +-- benchmark-harness/
|       +-- baselines/
|       +-- variants/
|       +-- results/
|
+-- scripts/
    +-- tools/
        +-- run-comparative-benchmark.mjs
```

Bestehende Dateien und kanonische Contracts sollen erweitert statt dupliziert werden.

Generated Provider Exports und Compatibility Mirrors bleiben abgeleitete Surfaces.

---

## 15. Implementation Slices

### Slice-Status (Stand v0.2.0)

Die Slices S0–S3 sowie die S4-Welle-A-Instruktionsreduktion sind an ihren jeweiligen Owner-Surfaces gemergt. Diese Fortschreibung startet sie nicht neu und erklärt sie nicht rückwirkend als abgeschlossen. Der tatsächliche Repository-Zustand ist an der jeweiligen Implementierungsstelle nachzuweisen; die Abschlussfeststellung erfolgt dort und nicht in diesem Dokument. Offene Nachweis-Pflichten der gemergten Slices — insbesondere die ausstehende Registry-`CONTRACT_RECORD`-Schreibung zu S1 — bleiben offen und sind an ihrer zuständigen Stelle zu schließen.

Die Slices S11–S13 sind Ergänzungen der v0.2.0-Fortschreibung und beginnen mit dem Slice-Status dieses Dokuments.

### S0 — Current-State Reconciliation

**Scope:** Read-only Repository Inspection

Tasks:

- [ ] Aktuellen Repository-HEAD fixieren.
- [ ] Vorhandene Skill-, Prompt-, Eval- und Governance-Surfaces inventarisieren.
- [ ] Tatsächliche Runtime-Verdrahtung von Proposals unterscheiden.
- [ ] Bestehende Owner-Verträge und Validatoren identifizieren.
- [ ] Überlappende Implementierungen vermeiden.
- [ ] Ziel-Scope und Non-Goals festhalten.

**DoD:** Evidence-backed Current-State Map mit Reuse-/Extend-/Create-Disposition.

### S1 — Feedback Contract

- [ ] Feedback-Schema definieren.
- [ ] Run-, Skill- und Executor-Bindings festlegen.
- [ ] Provenienz und Risikoklassen modellieren.
- [ ] Positiv-/Negativ-Fixtures erstellen.
- [ ] Schema-Validator integrieren.

**DoD:** Feedback ist strukturiert, versioniert und ohne Authority-Promotion validierbar.

### S2 — Instruction Inventory

- [ ] Geladene Instruktionsquellen erfassen.
- [ ] Datei-/Import-/Referenzgraph erstellen.
- [ ] Geltungsbereich und Precedence dokumentieren.
- [ ] Quellrevisionen und Digests binden.
- [ ] Read-only-Grenzen testen.

**DoD:** Effektiv geladene Instruktionen sind rekonstruierbar.

### S3 — Instruction Auditor

- [ ] Audit-Taxonomie implementieren.
- [ ] Statische Referenzprüfung ergänzen.
- [ ] Bedingungs- und Scope-Konflikte prüfen.
- [ ] Semantische Befunde als Advisory klassifizieren.
- [ ] Evidence-backed Audit Reports erzeugen.

**DoD:** Definierte Instruktionsprobleme werden reproduzierbar erkannt und korrekt klassifiziert.

### S4 — Skill Improvement Analyzer

- [ ] Feedback-Ursachen klassifizieren.
- [ ] Reuse-/Extend-/Create-Entscheidung anbinden.
- [ ] Skill- und Harness-Fehler unterscheiden.
- [ ] Bounded Proposals spezifizieren.
- [ ] Fehlende Evidenz blockierend behandeln.

**DoD:** Verbesserungsvorschläge benennen belegte Ursache, zuständigen Owner und exakten Änderungsscope.

### S5 — Behavioral Evaluation

- [ ] Baseline/Candidate-Eval-Vertrag definieren.
- [ ] Isolierte Modellläufe unterstützen.
- [ ] Positive und negative Testfamilien integrieren.
- [ ] Routing- und Output-Qualität messen.
- [ ] Sicherheitsregressionen blockieren.
- [ ] Kosten- und Latenzsignale erfassen.

**DoD:** Verbesserungen können mit reproduzierbarer Evidenz nachgewiesen oder zurückgewiesen werden.

### S6 — Adaptive Context Assembly

- [ ] Instruktionsklassen und Loading Conditions anbinden.
- [ ] Kontextreferenzen selektiv auflösen.
- [ ] Effective Instruction Bundle erzeugen.
- [ ] Kanonische Reihenfolge und Digests erhalten.
- [ ] Full-Context-Baseline gegen Candidate prüfen.

**DoD:** Kontext wird reduziert, ohne benötigte Evidence oder verbindliche Regeln zu verlieren.

### S7 — Qualification Integration

- [ ] Effective Instruction Digest in Qualification-Konzept einordnen.
- [ ] Materiality-Regeln erweitern.
- [ ] Modellwechsel-Regressionen ergänzen.
- [ ] Stale Qualification zuverlässig blockieren.
- [ ] Bestehendes Executor-Routing unverändert absichern.

**DoD:** Materielle Instruktionsänderungen können keine ungültige Qualification wiederverwenden.

### S8 — Governance Promotion

- [ ] Skill Frontdoor integrieren.
- [ ] Eval-Evidence an Proposal binden.
- [ ] Owner-Approval-Vertrag festlegen.
- [ ] Versionierte kanonische Adoption implementieren.
- [ ] Registry-/Provider-Exports regenerieren.
- [ ] Post-Adoption-Readback durchführen.

**DoD:** Keine Promotion ohne gültige Evidence, erforderliche Freigaben und verifizierte kanonische Änderung.

### S9 — Regression and Rollback

- [ ] Frühere Fehlerfälle dauerhaft in Evals aufnehmen.
- [ ] Candidate/Previous-Version-Switch testen.
- [ ] Rollback-Pfade festlegen.
- [ ] Materiality nach Rollback erneut prüfen.
- [ ] Unveränderliche Run-Evidence erhalten.

**DoD:** Fehlgeschlagene Verbesserungen können ohne Verlust der Ausführungshistorie zurückgenommen werden.

#### S9 — Implementierungsstand (Slice, 2026-10-22)

Der Slice S9 ist implementiert. Er besteht aus zwei Teilen, die getrennt
entscheiden: der **versionierte Vergleich** von Baseline und Candidate und
der **kontrollierte Rollback** auf die letzte qualifizierte Revision.

**Vergleich (`core/contracts/regression-comparison.schema.json`,
`runtime/regression/regression-gate.mjs`).** Beide Seiten tragen ihre
Version, ihren Inhalts-Digest, ihren Subject-Bezug und den Corpus-Digest, über
dem sie gemessen wurden. Die Kriterien (Skill-Routing, Output-Assertions,
Security-Regressions, advisory Instruction-Integrity-Kandidaten) und die
Zulässigkeits-Invarianten (Evidence vollständig, ein Corpus, derselbe
Subject, zwei verschiedene Revisionen, keine Adoption) werden getrennt
ausgewiesen. Das Security-Kriterium ist **absolut**: ein Candidate, der auch
nur eine Security-Regression trägt, regressiert das Kriterium, egal wie er
sich zum Baseline verhält — eine relative Verbesserung darf keine offene
Regression laundering. Die advisory Instruction-Integrity-Kandidaten bleiben
nicht blockierend und werden als Beobachtung geführt. Fehlende Evidence, ein
anderer Corpus, ein anderer Subject, ein Vergleich einer Revision mit sich
selbst und ein nicht gemessenes blockierendes Kriterium führen zu
`BLOCKED`, niemals zu `NO_REGRESSION`. Der Vergleich autorisiert nichts:
`adoption_authorized` und `authority_granted` sind Konstanten.

**Rollback-Plan (`core/contracts/rollback-record.schema.json`,
`runtime/regression/rollback.mjs`).** Das Restore-Ziel wird **abgeleitet**,
nicht gewählt: es ist die neueste Revision mit einer `QUALIFIED`-Qualifikation
und eigenem Nachweis. Nach dem Restore wird die Materialität des
zurückgesetzten Zustands gegen die geerbte Qualifikation neu abgeleitet; ein
Restore, der den qualifizierten Zustand nicht wiederherstellt, schließt
fail-closed. Die Ausführungshistorie wird über einen **unabhängigen**
Evidence-Inventar-Digest geprüft: der Digest, der VOR dem Rollback
genommen wurde, wird gegen den aktuell berechneten Digest gehalten; ein
fehlender Digest ist eine Verweigerung, kein Default, weil ein aus dem
geprüften Zustand abgeleiteter Digest den Vergleich tautologisch machen
würde. Der Record ist ein **Plan**, keine Ausführung: das Verdikt ist
`ROLLBACK_PLANNED`, niemals `ROLLED_BACK` — Plan ist nicht Apply, und ein
Record, der eine Rollback-Ausführung behauptete, ohne dass eine stattgefunden
hätte, wäre eine falsche Ausführungsaussage. Die Ausführung selbst gehört
in den owner-governierten Promotion-Pfad; ein Record einer **durchgeführten**
Rollback mit Readback ist ein eigener Vertrag.

**Messung.** Der unabhängige Fall-Korpus `evals/s9-regression/corpus.json`
trägt je Klasse der acht semantischen Signale einen Fall, in dem sie ZUTRIFFT,
und einen, in dem sie NICHT zutrifft — die Antwort jedes Falls steht fest,
bevor der Detektor läuft. Gemessen: 16 Fälle über 8/8 Klassen, 8 Treffer, 0
Falsch-Positive, 0 Falsch-Negative, 0 Coverage-Lücken; 8 Vergleichsfälle und
7 Rollback-Fälle mit erwarteten Verdicts und typisierten Refusal-Codes. Die
Labels sind **konstruiert** und nicht owner-geprüft; die acht Klassen bleiben
nicht statisch analysierbar, ihre Kandidaten bleiben advisory. Der Vergleich
adoptiert nichts: der S8-Promotion-Pfad bleibt der einzige Weg zu einer
Übernahme.

### S10 — Cross-Model Optimization

- [ ] Qualifizierte Executor-Konfigurationen vergleichen.
- [ ] Instruction-Overhead pro Modell messen.
- [ ] Provider- und Harness-Unterschiede klassifizieren.
- [ ] Modellspezifische Optimierungen an Adaptergrenzen halten.
- [ ] Qualität/Kosten/Latency-Pareto-Vergleiche erstellen.

**DoD:** Modellübergreifende Portabilität und Effizienz sind anhand vergleichbarer Runs nachgewiesen.

### S11 — Harness Context Separation

- [ ] Harness-Kontext (Development / UNITERA Product) als gebundene Routing- und Binding-Größe modellieren.
- [ ] Kontextbindung im WorkUnit und im BoundExecutionGraph verankern.
- [ ] Executor-Bindungen an den Harness-Kontext koppeln; keine kontextübergreifende Qualification-Übernahme.
- [ ] Ableitung von Product-Runtime-Authority aus einem Development-Harness-Run als negativen Fall fail-closed behandeln.
- [ ] Product-Effekte weiterhin an Execution-Control-Entscheidungen binden.
- [ ] Fehlende oder widersprüchliche Kontextbindung als Blocker führen, nicht als Fallback.

**DoD:** Ein Development-Harness-Run kann keine Product-Runtime-Authority erzeugen; ein Kontextwechsel ist ein gebundener Planwechsel mit eigener Evidenz.

### S12 — Model-Adaptive Executor Profiles

- [ ] Profilvertrag für Darstellungs- und Interaktionsdimensionen definieren.
- [ ] Abgrenzung zum Execution Profile (`core/contracts/execution-profile.schema.json`) festschreiben.
- [ ] Versionierung und Bindung an Executor-, Provider- und Modellidentität.
- [ ] Qualification gegen repräsentative Evals.
- [ ] Requalifikationsregel bei Modellwechsel und bei Materialitätswechsel.
- [ ] Nachweis, dass Authority-, Tool-, Security- und Completion-Semantik über Profile hinweg identisch bleiben.

**DoD:** Zwei Profile desselben Modells liefern äquivalente Authority- und Completion-Semantik bei unterschiedlicher Darstellung; ein Profilwechsel erzeugt keine erweiterten Berechtigungen.

### S13 — Comparative Benchmark Harness

- [ ] Benchmark-Aufgabensatz definieren, der statische und dynamische Varianten zulässt.
- [ ] Single-Executor-Baseline fahren.
- [ ] Policy-gebundene Multi-Executor-Variante fahren.
- [ ] Token, Kosten, Laufzeit, Interventionen, Verifikationserfolg und Artefaktqualität messen.
- [ ] Context-Isolation und geerbte Authority-/Budget-Grenzen prüfen.
- [ ] Kontraproduktive Fälle und Auswahlkriterien dokumentieren.

**DoD:** Der Vorteil dynamischer Orchestrierung ist für geeignete Workloads messbar belegt; für ungeeignete Fälle sind die Auswahlkriterien explizit festgehalten. Kein Benchmark-Ergebnis gilt als Freigabe.

---

## 16. Acceptance Criteria

### Functional

- [ ] Tatsächlich geladene Instruktionen sind rekonstruierbar.
- [ ] Veraltete Referenzen werden erkannt.
- [ ] Nachweisbare Authority-Konflikte werden nicht still aufgelöst.
- [ ] Skill-Fehler werden von Runtime-/Tool-Fehlern unterschieden.
- [ ] Feedback kann in einen überprüfbaren Verbesserungskandidaten überführt werden.
- [ ] Baseline und Candidate werden mit isolierten Runs verglichen.
- [ ] Skill Routing wird anhand tatsächlicher Modellentscheidungen geprüft.
- [ ] Jede relevante Ausführung bindet die angewendete Instruktionsversion.
- [ ] Ein Run bindet seinen Harness-Kontext; ein fehlender Kontext bindet keinen Executor.
- [ ] Ein Instruction Bundle referenziert die Context-Bindung, ohne sie zu duplizieren.
- [ ] Der Vorteil dynamischer Orchestrierung ist gegenüber einer Single-Executor-Baseline gemessen.

### Governance

- [ ] Keine selbstständige Authority-Erweiterung.
- [ ] Keine automatische kanonische Promotion.
- [ ] Keine Permission aus einem Skill oder Prompt.
- [ ] Keine Umgehung bestehender Approval-Gates.
- [ ] Keine unzulässige Qualification-Übernahme.
- [ ] Kein Harness-Kontext-Übergang ohne gebundenen Planwechsel.
- [ ] Kein Profil, das Authority-, Tool-, Security- oder Completion-Semantik verändert.
- [ ] Keine unzulässige Datenweitergabe.
- [ ] Kein Überschreiben fremder, nicht zugehöriger Änderungen.

### Quality

- [ ] Keine kritischen Safety-Regressionen.
- [ ] Keine Verletzung verpflichtender Completion Contracts.
- [ ] Source-Evidence bleibt adressierbar.
- [ ] Reproduzierbarkeit durch Versions- und Digest-Bindings.
- [ ] Kontextoptimierung besteht den Quality-Non-Regression-Gate.
- [ ] Provider-spezifische Abweichungen bleiben sichtbar.
- [ ] Instruction-Audit-Reports weisen analysierte und ausdrücklich nicht analysierte Klassen getrennt aus.

### Operational

- [ ] Bestehende Main-Validators bleiben erfolgreich.
- [ ] Neue Contract- und Behavioral-Evals sind integriert.
- [ ] Failed/Blocked-Zustände erzeugen nachvollziehbare Evidence.
- [ ] Rollback ist überprüfbar.
- [ ] Relevante Canonical- und Derived-Surfaces sind synchronisiert.

---

## 17. Validation Strategy

Bestehende Prüfpfade werden weiterverwendet:

```bash
npm run validate
npm run validate-neutral
npm run eval
npm run eval:skill-routing
npm run eval:maws-vnext
npm run test:vnext
```

Zusätzliche Ziel-Commands nach Implementierung:

```bash
npm run validate:instructions
npm run eval:skill-effectiveness
npm run eval:instruction-integrity
```

Die zusätzlichen Commands sind vorgeschlagen und derzeit nicht als verfügbar nachgewiesen.

Für jeden Slice gelten:

1. kleinster relevanter Test;
2. Contract-/Schema-Validierung;
3. Negative-Case-Prüfung;
4. bestehende erforderliche Repo-Gates;
5. Post-Write-Readback;
6. Evidence- und Statusdokumentation.

Ein Test-PASS beweist nur die tatsächlich geprüfte Capability.

---

## 18. Observability and Metrics

MAWS soll folgende Kennzahlen erfassen:

### Quality

- Task Success Rate.
- Skill Routing Accuracy.
- Instruction Conflict Rate.
- Critical Regression Count.
- Verification Failure Rate.
- Correction Rate.
- Cross-Model Behavioral Consistency.

### Efficiency

- Effective Instruction Tokens.
- Context Reduction Ratio.
- Unnecessary Skill Load Rate.
- Cost per Verified Task.
- Latency per Completed WorkUnit.
- Repeated Correction Rate.

### Improvement

- Improvement Candidates Created.
- Candidates Rejected.
- Candidates Accepted.
- Regression Reoccurrence Rate.
- Time to Verified Improvement.
- Rollback Frequency.

Kennzahlen erhalten konkrete Messdefinitionen und Baselines.

Kostenoptimierung darf keine Qualitäts- oder Governance-Anforderungen verdrängen.

---

## 19. Non-Goals

Diese Target Spec führt nicht ein:

- autonomes Umschreiben kanonischer Systemprompts;
- automatische Policy- oder Authority-Promotion;
- unbeschränkte Skill-Generierung;
- unkontrollierte rekursive Agentenvermehrung;
- neue produktive HTTP-/MCP-/Daemon-Aktivierung;
- allgemeine Agentenrechte aus Modellfähigkeiten;
- automatisches Training oder Fine-Tuning von Modellen;
- ungeprüfte Migration aller Skills;
- parallele zweite Skill Registry;
- zweite Governance Authority;
- vollständige Runtime-Neuarchitektur;
- automatische produktive Übernahme von Feedback;
- einen zweiten Context Compiler oder ein zweites kanonisches Context Manifest;
- eine Zusammenführung, Umgehung oder stille Vererbung zwischen Development- und Product-Harness-Kontext;
- eine Ausweitung der Orchestrierungsautonomie ohne gemessenen Nutzen;
- modelladaptive Profile, die Authority-, Tool-, Security- oder Completion-Semantik verändern.

Der bestehende executor-zentrierte MAWS-vNext-Kern bleibt erhalten.

---

## 20. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Unnötige Skill-Vermehrung | Reuse-/Extend-/Create-Gate |
| Prompt-Overoptimization | Behavioral Regression Tests |
| Verlust wertvoller Architekturinformationen | Source References und Progressive Loading |
| Sicherheitsregeln werden versehentlich geschwächt | Hard Invariants plus Deterministic Enforcement |
| Feedback wird als Wahrheit behandelt | Provenienz und Review |
| Modellspezifische Überanpassung | Cross-Model-Evals |
| Qualification Drift | Versioned Fingerprints und Materiality |
| Zu hohe Eval-Kosten | Risikobasierte Testprofile und Budgets |
| Selbstmodifikation des Harness | Owner-gated Promotion |
| Widersprüche zwischen kanonischen Quellen | Authority Resolution vor Änderung |
| Verwechslung der beiden Harness-Kontexte | Gebundene Kontextbindung (§ 4.3, S11) und negative Cross-Context-Fälle |
| Doppelte Kontextsemantik | Klare Context-Ownership (§ 7.5); MAWS implementiert keinen zweiten Context Compiler |
| Benchmark-Ergebnis wird zur Freigabe missbraucht | Benchmarks sind Vergleichs-, keine Autorisierungsinstrumente (§ 10.6) |
| Modellspezifische Überanpassung des Profils | Execution-Profile-Dimensionen bleiben unverändert; Qualification gegen repräsentative Evals |

---

## 21. Completion and Adoption

### Specification Completion

Diese Target Spec ist konzeptionell vollständig, wenn:

1. Zielarchitektur und bestehende MAWS-Grenzen eindeutig beschrieben sind.
2. Neue Komponenten klare Owner und Verträge haben.
3. Wiederverwendung bestehender Assets dokumentiert ist.
4. Neue Implementation Slices voneinander abgrenzbar sind.
5. Sicherheits- und Governance-Invarianten erhalten bleiben.
6. Acceptance Criteria und Validation Strategy feststehen.

### Implementation Completion

Die Implementierung gilt erst als vollständig, wenn:

1. die zugehörigen Contracts tatsächlich übernommen wurden;
2. Validatoren und Evals ausführbar sind;
3. Runtime-Verhalten mit Artefakten nachgewiesen wurde;
4. Materiality und Qualification gültig sind;
5. Promotion- und Rollback-Grenzen überprüft wurden;
6. der tatsächliche Repository-Zustand post-write verifiziert wurde;
7. die Authority Matrix den nachgewiesenen Reifegrad korrekt wiedergibt.

### Canonical Adoption

Die Übernahme dieser Spezifikation in MAWS benötigt einen eigenständigen Owner-/Repository-Adoption-Schritt.

Dieses Dokument erzeugt keine neue Authority, Qualification, Permission oder Runtime-Aktivierung.

---

## 22. Final Target State

MAWS soll seine Agenten nicht durch eine wachsende Menge pauschaler Promptregeln steuern.

Stattdessen soll es:

- **wissen**, welche Instruktionen für eine Aufgabe tatsächlich relevant sind;
- **prüfen**, ob diese Instruktionen konsistent und gültig sind;
- **auswählen**, welche Skills und qualifizierten Executoren eingesetzt werden;
- **durchsetzen**, welche Aktionen technisch zulässig sind;
- **verifizieren**, ob die Arbeit ihre Completion-Anforderungen erfüllt;
- **analysieren**, warum Fehler oder unnötige Korrekturen auftreten;
- **evaluieren**, ob vorgeschlagene Verbesserungen wirklich helfen;
- **bewahren**, welche geprüften Arbeitsmuster langfristig wiederverwendbar sind.

### Target Principle

> MAWS evolves from a provider-neutral workflow and skill execution framework into an evidence-driven, instruction-aware and continuously improvable agent harness — without granting models authority over their own governance.

**Target Status:** ADOPTED — TARGET SPECIFICATION (owner act of 2026-10-21)  
**Specification Version:** 0.2.0  
**Canonical Adoption:** ADOPTED AS THE SHARED-CORE DEVELOPMENT TARGET — owner act of 2026-10-21, recorded as OD-20 in `docs/maws-vnext-owner-decisions.md`. The act names this document and this version as the governing target of the MAWS-SII development lane, and it takes up the standing owner dispositions OA-04 (specification adoption) and OA-05 (instruction audit capability implementation) together with the resumption of that lane. The adoption grants no authority, qualification, permission or runtime activation, it replaces no approval decision, and it does not discharge the owner review of the advisory candidates the auditor names. The document surface keeps its path under `docs/proposals/`: eighteen evidence records of 2026-10-20/21 reference that path, and the evidence path contract makes those records immutable. The promotion of the document into the canonical docs surface is a separate slice and remains the next gate of the document placement.  
**Implementation Status:** APPLIED IN PART, BY SLICE — die Slices S0–S8 und S11–S13 sind an ihren Owner-Surfaces gemergt; die Welle 2 des S3-Auditors (deterministische Advisory-Signallayer für die acht semantischen Klassen) ist mit gepflanzten Fixtures implementiert und gegen den aktuellen Korpus gemessen; der Slice S9 (Regression and Rollback) ist als versionierter Baseline/Candidate-Vergleich und kontrollierter Rollback implementiert und gegen einen unabhängigen Fall-Korpus gemessen (16 Signal-Fälle über 8/8 Klassen mit 0 Falsch-Positiven und 0 Falsch-Negativen, 6 Vergleichs- und 6 Rollback-Fälle); der Slice S10 (Cross-Model Optimization) ist offen  
**Runtime Activation:** NONE  
**Next Gate:** ausstehende Registry-`CONTRACT_RECORD`-Schreibung zu S1 → S4 Skill Improvement Analyzer → S5 Behavioral Evaluation Baseline → S11 Harness Context Separation, der offene Slice S10, die owner-geprüfte Analyse der Advisory-Kandidaten aus Welle 2, sowie die dokumentbezogene Platzierung dieses Dokuments in der kanonischen Docs-Fläche

---

**End of Target Specification**

---

## Materialization Note (added at materialization — not part of the specification body)

This document was materialized into `docs/proposals/skill-intelligence-target-spec.md` on 2026-10-20 from the owner-provided specification text (Document ID `MAWS-SII-TARGET-SPEC-001`, Version 0.1.0, Status PROPOSED). The body above is verbatim owner input; the only change is the removal of one leading blank line and the addition of this note.

- Materialization run record: `evidence/sii-materialization-2026-10-20/RUN.md`
- Current-state reconciliation (S0) evidence: `docs/proposals/skill-intelligence-current-state-map-2026-10-20.md` (baseline pinned to MAWS `origin/main` = `dcd95bf2d1d5a811bfd81026e943e3c2d0e7a072`)
- Registry disposition: `evidence/sii-materialization-2026-10-20/registry-disposition.json` (`NO_CHANGE` — proposal staging only, no registry-relevant class changed)

Per `docs/proposals/README.md`, this file is review material and non-canonical until a separate owner-approved promotion slice accepts it. Per Section 21 of the specification itself, canonical adoption, implementation, and runtime activation each require their own gated steps.

---

## Amendment Note (v0.2.0 — added at revision, not part of the specification body)

This document was revised from v0.1.0 to v0.2.0 on 2026-10-20 under the bounded owner run instruction `OWNER-DIRECTED-HARNESS-TRANSFORMATION-RECONCILIATION-2026-10-20` (reconciliation and registration of a harness-transformation proposal; integration into this specification; registration in Registry and Atlas; no canonical adoption). The v0.1.0 body is preserved unchanged; v0.2.0 adds three areas, one ownership clarification and one coverage clarification.

### Was v0.2.0 ergänzt

1. Getrennte Harness-Kontexte — § 4.3, Slice S11, Objective O7.
2. Modelladaptive Executor-Profile — § 11.5, Slice S12.
3. Vergleichender Benchmark-Harness — § 10.6, Slice S13, Objective O8.
4. Kontext-Ownership gegenüber dem coreos-eigenen Context Compiler — § 7.5, § 3.4.
5. Deklarierte Coverage-Grenzen der Instruction-Audit-Taxonomie — § 6.6.

### Reconciliation

Eine gesonderte, weiter gefasste Harness-Transformation-Spezifikation wurde nicht als zweites Dokument angelegt. Ihre drei inhaltlichen Erweiterungen sind in diese Fortschreibung integriert. Über diese hinausgehende allgemeine Zielbeschreibungen entsprechen dem bereits vorhandenen v0.1.0-Body und werden nicht doppelt geführt.

### Nicht rückwirkend erklärt

Die an ihren Owner-Surfaces gemergten Slices S0–S3 und die S4-Welle-A-Instruktionsreduktion werden durch diese Fortschreibung weder neu begonnen noch als vollständig abgeschlossen erklärt. Deren tatsächlicher Repository-Zustand ist an der jeweiligen Implementierungsstelle nachzuweisen. Offene Nachweis-Pflichten — insbesondere die ausstehende Registry-`CONTRACT_RECORD`-Schreibung zu S1 — bleiben offen und sind an ihrer zuständigen Stelle zu schließen.

### Autorität und Nachweise

- Status bleibt PROPOSED. Canonical Adoption ist ein separater, durch diese Fortschreibung nicht ausgeführter Governance-Schritt.
- Diese Fortschreibung erzeugt keine Authority, Qualification, Permission oder Runtime-Aktivierung.
- Revisionsnachweis: `evidence/sii-target-spec-v0-2-0-2026-10-20/RUN.md`
- Registry-Disposition: `evidence/sii-target-spec-v0-2-0-2026-10-20/registry-disposition.json` (`NO_CHANGE` — proposal staging only, keine registry-relevante Klasse geändert; die Änderungsregistrierung erfolgt als eigener Datensatz im Registry-Repository)
- S0 Current-State Map: `docs/proposals/skill-intelligence-current-state-map-2026-10-20.md`
- Revisionsbasis: MAWS `origin/main` = `ee7f094b2676963b20161f093ed5a9a01e0c018b`
