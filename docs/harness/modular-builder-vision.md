# Modular Harness Builder — Vision

## Class

derived / docs-only / concept-document — Vision-Layer

## Status

concept accepted — no runtime implementation, no automation, no commitment
Dieses Dokument ist eine **Vision**, kein Bauanleitung. Kein Modul-Backlog,
kein Sprint-Plan, kein Code-Generator. Slice-Trennung gilt: Self-Harness
Loop bleibt unverändert auf Slice 1 (Weakness Mining). Modular Builder ist
eine **darüber liegende Ziel-Schicht**, die explizit als Future Work markiert
ist und in keinem aktuellen Slice gebaut wird.

## Use Rule

Dieses Dokument beschreibt die langfristige Ziel-Architektur für einen
**Modular Harness Builder** innerhalb von Baum-OS / Shared-Core. Es aktiviert
keine Runtime, startet keinen Build, schreibt keine Module automatisch, und
erlaubt keine Auto-Promotion von Skills, Policies, Prompts oder Provider-Adaptern.
Canonical authority für Skill-Verträge: `docs/pi-compatible-skill-contract-schema-proposal.md`
und `schemas/skill-contract.schema.json`. Canonical authority für Evidence-Pfade:
`docs/evidence-path-contract.md`. Canonical authority für Sandbox-Zonen:
`docs/pi-harness-sandbox-working-plan.md`. Self-Harness-Bezug:
`docs/harness/self-harness-loop.md`.

## Purpose

Baum-OS und Shared-Core werden heute von **einem Owner / einer Company** mit
fester Skill-Registry, festen Provider-Adaptern und festen Validators betrieben.
Ziel der Modular-Builder-Vision: dieselbe stabile Vertrags-Basis für **mehrere
Harnesses** — pro User, pro Team, pro Company — verfügbar machen, ohne die
stabile Basis selbst zu destabilisieren.

**Kernprinzipien:**

1. Stabile Verträge bleiben stabil. Modularität entsteht durch **Pluggable
   Surfaces**, nicht durch Vertrags-Drift.
2. Skill Registry ist die **stabile Basis**. Provider-Adapter, Harness-Config
   und Prompt-Templates sind die **pluggable Surfaces**.
3. Self-Harness Loop liefert **Schwächen-Befunde**. Modular Builder nutzt sie
   als Input — niemals als Auto-Apply-Signal.
4. Kein Modul wird automatisch erzeugt. Jedes Modul ist Owner-/Company-Approval-pflichtig.
5. Vault, Secrets, Provider-Credentials bleiben in stabiler Zone — Builder
   liest sie nie direkt.
6. Vision-Doc ist explizit **nicht** buildable: kein `modular-builder init`,
   kein Scaffolding-Script, kein Modul-Generator.
7. Fail closed: unklarer Scope → kein Modul-Vorschlag.

## Relationship: Registry + Loop → Builder

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   Skill Registry            Self-Harness Loop         Modular Builder    │
│   (stable base)             (Pi/Evidence learning)    (vision target)    │
│                                                                          │
│   v0.x versioniert          pro Run versioniert        future work       │
│   Owner-editiert            Evidence-anchored          Vision-only       │
│   Schema-pflichtig          Read-only in Slice 1       no runtime        │
│   Single Source of Truth    Befund-Quelle              pluggable target  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Skill Registry → Builder:** Registry definiert, welche Verträge ein Builder
nutzen darf. Builder darf Registry nicht mutieren, nicht erweitern, nicht
„vorschlagen". Builder konsumiert Registry als unveränderliche Schnittstelle.

**Self-Harness Loop → Builder:** Loop produziert Befunde ausgeführten
Verhaltens. Builder liest Befunde als **eine** Input-Quelle für zukünftige
Modul-Design-Entscheidungen — neben Owner-Notizen, neben Company-Requirements.
Loop bleibt unverändert in Slice 1 (Weakness Mining); Builder ist **kein**
Loop-Output.

**Builder ist keine dritte Authority-Schicht.** Er ist ein langfristiger
Schnittstellen-Plan, der Registry und Loop **zusammenführt**, ohne ihre
Trennung aufzuweichen.

## Target Architecture Sketch

### Stable Surfaces (bleiben unverändert)

Diese Surfaces sind **Single Source of Truth** und werden vom Modular Builder
**nie** ersetzt, erweitert oder umgangen:

| Surface | Pfad / Datei | Zweck |
| Skill Contract Schema | `schemas/skill-contract.schema.json` | Vertragsformat für alle Skills |
| Tool Contract Schema | `schemas/tool-contract.schema.json` | Vertragsformat für alle Tools |
| Policy Contract Schema | `schemas/policy-contract.schema.json` | Vertragsformat für alle Policies |
| Skill Registry Index | `skills/index.md` + `skills/**/*.skill.yaml` | Owner-editierte Skill-Liste |
| Sandbox-Zonen | `docs/pi-harness-sandbox-working-plan.md` | S0–S3, Zonen-Boundary |
| Evidence-Pfad-Contract | `docs/evidence-path-contract.md` | `sandbox/runs/<ts>/` Pflicht-Files |
| Validators | `scripts/validate-*.sh`, `make validate-*` | Konformitäts-Prüfung |
| Secret-Boundary | `docs/pi-secret-handling-spec.md`, `docs/secret-handling.md` | `.env`, Keys, Tokens |
| Vault-Bridge-Gates | `agentic_workflow/obsidian-macl-vault/` + Governance | Vault-Writes bleiben gated |

### Pluggable Surfaces (per User / Company konfigurierbar)

Diese Surfaces dürfen pro Harness-Instanz variieren — ohne stabile Surfaces
anzutasten:

| Surface | Variabilität | Begründung |
| Provider-Adapter | pro Harness wählbar | User/Company hat eigene Provider, eigene Keys, eigene Limits |
| Harness-Config | pro Harness editierbar | Tier-Wahl, Tool-Budgets, Subagent-Scope, Sandbox-Zone |
| Prompt-Templates | pro Harness einsetzbar | Sprache, Ton, Domain-Vokabular, Hausstil |
| Repo-Overlay | pro Harness möglich | zusätzliche Regeln, Branch-Policies, Convention-Checks |
| Loop-Output-Konsum | pro Harness optional | welche Self-Harness-Befunde fließen in Modul-Planung |
| Eval-Baseline | pro Harness konfigurierbar | welche Evals laufen, mit welchen Schwellen |

**Trennlinie:** Stable Surfaces definieren **was ein Vertrag ist** und **wie
Validation läuft**. Pluggable Surfaces definieren **wer** mit welchem Provider
**welche Inhalte** ausführt.

### Modular Builder — Schnittstellen-Skizze (Vision)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                       Modular Harness Builder (vision)                  │
│                                                                          │
│   Eingaben (alle opt-in, alle explizit):                                │
│     - Skill Registry   (stable, read-only)                              │
│     - Self-Harness Loop Befunde (optional, read-only)                   │
│     - Owner-Requirements   (manuell, niemals auto-extracted)             │
│     - Company-Constraints   (manuell, niemals auto-inferred)            │
│                                                                          │
│   Pluggable Surfaces (pro Harness instanziiert):                        │
│     - provider.adapter.{anthropic,openai,codex,qwen,minimax,...}        │
│     - harness.config.{tier,tools,subagents,sandbox-zone}                │
│     - prompt.templates.{language,domain,voice}                         │
│     - repo.overlay.{branches,conventions,forbidden-paths}               │
│     - eval.baseline.{smoke,regression,gates}                            │
│                                                                          │
│   Stabile Surfaces (nie ersetzt, nie umgangen):                         │
│     - schemas/skill-contract.schema.json                                │
│     - schemas/tool-contract.schema.json                                │
│     - schemas/policy-contract.schema.json                              │
│     - skills/index.md + skills/**/*.skill.yaml                          │
│     - docs/pi-harness-sandbox-working-plan.md                           │
│     - docs/evidence-path-contract.md                                    │
│     - docs/pi-secret-handling-spec.md                                   │
│     - vault-bridge gates                                               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Boundary

**Dieses Vision-Doc definiert eine Ziel-Architektur, keinen Implementierungsplan.**

```text
In-Scope (Vision-Layer):
  - Schnittstellen-Skizze für pluggable Surfaces
  - Trennung von stable vs pluggable
  - Beziehung zu Skill Registry und Self-Harness Loop
  - Explizite Non-Goals
  - Empfohlene Reihenfolge zukünftiger Slices (ohne Implementierung)

Out-of-Scope (Vision-Layer):
  - KEINE Builder-Implementierung
  - KEIN Scaffolding-Script
  - KEIN Modul-Generator
  - KEINE Auto-Erzeugung von Skills, Policies oder Prompts
  - KEINE Auto-Erzeugung von Provider-Adaptern
  - KEINE Auto-Promotion
  - KEINE Vault-Writes
  - KEINE `.env`- oder Secrets-Reads
  - KEINE Live-Pfad-Mutation
  - KEIN Merge in main / KEIN Push
```

Die Boundaries in `docs/pi-harness-sandbox-working-plan.md` und
`docs/harness/self-harness-loop.md` gelten unverändert. Zone S0 (Read-only
Audit) bleibt Default.

## Non-Goals

- **KEINE** Promise von „automatic harness generation"
- **KEIN** Modul-Backlog, kein Sprint-Plan, keine Timeline
- **KEINE** Builder-Implementierung in diesem Slice
- **KEINE** Scaffolding-Scripts
- **KEINE** Auto-Promotion von Skills, Policies oder Prompts
- **KEINE** Auto-Erzeugung von Provider-Adaptern
- **KEINE** Loop-Implementierung als Builder-Output
- **KEINE** Skill-Registry-Mutation
- **KEINE** Validator-Mutation
- **KEINE** Vault-Writes
- **KEINE** Netzwerk-Aufrufe über NET_0 hinaus
- **KEINE** `.env`-Reads, keine Secret-Access, keine Credential-Discovery
- **KEINE** Live-Pfad-Mutation, kein Apply-Schritt, kein Owner-Bypass

## Recommended Next Gates (alle Future Work, kein Commit)

1. **Owner-Acceptance dieses Vision-Docs** — Voraussetzung für jeden
   Modular-Builder-Slice. Status: `proposed` → `accepted` nur durch Owner.
2. **Stable-Surface-Audit** — Verifikation, dass alle in diesem Doc
   gelisteten Stable Surfaces tatsächlich existieren und Schema-pflichtig sind.
3. **Pluggable-Surface-Spec** — eigener Slice, der pro pluggable Surface
   exakte Vertragsfelder und Versionsregeln definiert (Skill-Format bleibt
   unverändert; Pluggable-Surface-Format ist **neu**, aber Slice-exklusiv).
4. **Builder-Loop-Trennung-Spec** — eigener Slice, der die Trennung von
   Self-Harness Loop und Modular Builder festschreibt (Loop bleibt read-only,
   Builder bleibt nicht-existent bis Slice 2+).
5. **First Builder Slice** — nur nach expliziter Owner-Freigabe und nur als
   Contract-Definition, niemals als Code.

> **Hinweis:** Bis Slice 2+ existiert kein `modular-builder/`-Pfad, kein
> `core/builder/`-Modul, kein Builder-Skill. Dieses Dokument ist **die** Vision.

## Relation To Existing Docs

| Dokument | Relation |
| `docs/harness/self-harness-loop.md` | Loop bleibt Slice 1; Builder ist Future Work, kein Loop-Output |
| `docs/pi-harness-sandbox-working-plan.md` | Zonen + Subagent-Boundary — gelten unverändert |
| `docs/evidence-path-contract.md` | Pflicht-Files unter `sandbox/runs/<ts>/` — Builder liest, ohne zu mutieren |
| `docs/pi-compatible-skill-contract-schema-proposal.md` | Skill-Format — Builder konsumiert Registry, ändert sie nicht |
| `docs/pi-provider-adapter-specification.md` | Provider-Adapter-Format — ist **pluggable surface**, nicht stable |
| `docs/pi-execution-surface-policy.md` | Tier-Regeln — Builder operiert in Tier 0/1, nie 3/4 |
| `docs/pi-secret-handling-spec.md` | Secret-Boundary — kein Key, kein Token, keine `.env`-Reads |
| `docs/architecture.md` | 3-Säulen / Authority-Tiers — Builder bleibt Tier 3 (derived) bis Slice 2+ |
| `docs/architecture/baum-os-harness-family.md` | Harness-Familie — Builder ist Vision-Layer über den 7 Harnesses |

## Verification

Nach Erstellung geprüft:

```bash
test -f docs/harness/modular-builder-vision.md && echo VISION_EXISTS || echo VISION_MISSING
# → VISION_EXISTS

grep -c "^##" docs/harness/modular-builder-vision.md
# → Sektionen vorhanden

grep -i "auto.generate\|auto.create\|auto.promote\|auto.apply" docs/harness/modular-builder-vision.md
# → nur in Non-Goals / Out-of-Scope als Verbote (fail-closed gewahrt)

grep -i "automatic.harness.generation" docs/harness/modular-builder-vision.md
# → in Non-Goals explizit als Verbot markiert

grep -i "vault.write\|\.env.read\|secret.access" docs/harness/modular-builder-vision.md
# → nur in Boundary / Non-Goals als Verbote (fail-closed gewahrt)

git diff --name-only
# → docs/harness/modular-builder-vision.md

git status --short
# → ?? docs/harness/modular-builder-vision.md (neuer Pfad unter docs/harness/)
#    Status: untracked, uncommitted — kein clean-state-Blocker,
#    vorgesehen für expliziten Owner-Acceptance-Commit
```