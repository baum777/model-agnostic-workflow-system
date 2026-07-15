# Self-Harness Loop

## Class

derived / docs-only / concept-document — Slice 1 (Weakness Mining only)

## Status

concept accepted — no runtime implementation, no automation
Slice 1 = Weakness Mining. Slice 2 (Harness Proposal) and Slice 3 (Proposal Validation)
are deliberately deferred and not part of this document.

## Use Rule

Dieses Dokument beschreibt das **Self-Harness-Loop**-Konzept für Baum-OS.
Es aktiviert keine Runtime, startet keine Loop-Ausführung und schreibt keine
Harness-Änderungen automatisch. Canonical authority für Evidence-Pfade:
`docs/evidence-path-contract.md`. Canonical authority für Skill-Verträge:
`docs/pi-compatible-skill-contract-schema-proposal.md`. Canonical authority für
Sandbox-Zonen: `docs/pi-harness-sandbox-working-plan.md`.

## Purpose

Baum-OS behandelt Code nicht als Output, sondern als **Harness** — die
ausführbare, inspizierbare, zustandsbehaftete Umgebung, in der Agenten operieren.
Aus dieser Sicht ist die Harness selbst ein Mittel, um Agenten-Verhalten
*konstant* zu prüfen, zu begrenzen und zu verbessern — nicht eine Folge von
Agenten-Verhalten.

Der Self-Harness Loop ist der Mechanismus, mit dem das Harness **über sich
selbst lernt**, ohne seine eigene Autorität zu untergraben. Er macht Schwächen
sichtbar, schlägt Verbesserungen vor, und übergibt jede Verbesserung an den
Human-Owner — niemals an automatische Promotion.

**Kernprinzipien:**

1. Code / Evidence / Tools / Validators sind das Harness — nicht das Modell.
2. Schwächen werden ausgeführtem Verhalten entnommen, nicht aus Modell-Selbstauskunft.
3. Kein Vorschlag wird automatisch angewendet; Human Approval bleibt letzte Instanz.
4. Evidence wird vor jedem Vorschlag erzeugt, nicht danach.
5. Die Skill Registry bleibt die stabile Basis; Loop-Ergebnisse sind Anhang, nie Ersatz.
6. Schwäche ≠ Berechtigung: ein Vorschlag darf nur auf freigegebenen Pfaden landen.
7. Fail closed: unklarer Befund → kein Proposal, statt Pseudo-Improvement.

## Code-as-Agent-Harness Paradigm

Die Harness besteht aus vier tragenden Schichten:

| Schicht | Zweck | Beispiel im Repo |
|---------|-------|------------------|
| **Code** | Trägt Verträge, Strukturen, Boundaries, Pfade | `core/`, `runtime/`, `agentic_workflow/model-agnostic-workflow-system/` |
| **Evidence** | Macht Runs auditierbar; Truth-of-What-Happened | `sandbox/runs/<ts>/{intent,commands-run,files-read,files-changed,validation,diff,risks,next-gate}.md` |
| **Tools** | Bestimmt, was Agenten ausführen dürfen | Pi-Tools (`read`, `bash`, `edit`, `write`, `mcp`); Zone-gebunden |
| **Validators** | Prüft Konformität gegen Verträge und Policies | `scripts/validate-*.sh`, `make validate-*`, `node scripts/validate-*.js` |

**Invariante:** Wenn eine dieser Schichten fehlt, ist der Agent nicht *operational* —
er spekuliert. Self-Harness-Loop zielt darauf, jede dieser Schichten zu stärken.

## Self-Harness Loop — Drei-Stufen-Modell

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   Stage 1             Stage 2                 Stage 3                   │
│   Weakness Mining  →  Harness Proposal     →  Proposal Validation       │
│   (Slice 1 ✓)         (Slice 2 — deferred)    (Slice 3 — deferred)       │
│                                                                          │
│   Read-only           Draft-only              Human Approval required    │
│   Evidence-based      Sandbox-pfad            Owner-Gated                │
│   Human-readable      proposal.md             diff + dry-run gate        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Stage 1 — Weakness Mining (dieser Slice)

**Zweck:** beobachtete Schwächen im aktuellen Harness sammeln, ohne Veränderung
vorzuschlagen oder auszuführen.

**Eingaben:**

- Evidence-Files aus `sandbox/runs/<ts>/` (insbesondere `risks.md`, `next-gate.md`,
  `validation.md`)
- Validators-Output (`make validate-*`, `node scripts/validate-*.js`)
- Skill-Registry-Einträge (`skills/index.md`, `skills/**/*.skill.yaml`)
- Sandbox-Policy-Statements (`docs/pi-harness-sandbox-working-plan.md`)
- Manuelle Owner-Notizen (Session-Handover, Chat-Summaries — nur als Hinweis, nicht
  als Wahrheit)

**Ausgaben pro Mining-Run:**

```text
sandbox/runs/<ts>/weakness-mining.md
  - Befund-Liste (jede Schwäche mit Evidence-Verweis)
  - Klassifikation: Code | Evidence | Tools | Validators | Boundary | Skill
  - Severity: low | medium | high | blocker
  - Status:    observed | inferred (must be labeled)
  - Vermeintliche Ursache (Inferred, gelabelt)
  - Verweis auf Quelle (Datei + Pfad)
  - KEIN Fix-Vorschlag (Slice 2)
  - KEIN Patch (Slice 3)
```

**Regeln für Weakness Mining:**

```text
- Read-only: kein Schreiben außerhalb des runs/-Ordners.
- Evidence-anchored: jede Schwäche muss einen Datei-, Run- oder Command-Verweis haben.
- Inferred muss gelabelt sein; Observed muss direkt lesbar sein.
- Keine Modell-Selbstauskunft als Quelle ("I think the harness is missing X").
- Owner-Notizen sind Hinweis, nicht Befund — Befund entsteht durch Lesen der Quelle.
- Befunde sind unverbindlich, bis Stage 2 einen Vorschlag macht.
```

### Stage 2 — Harness Proposal (Slice 2, deferred)

**Zweck:** pro akzeptierter Schwäche einen konkreten Proposal-Entwurf in
Sandbox-Pfad schreiben — niemals direkt ins Live-Harness.

**Pflicht-Felder eines Proposals (Vorstufe, finalisiert in Slice 2):**

```text
proposal.md
  - Bezug auf Weakness-Mining-Befund (run-ts + befund-id)
  - Betroffene Schicht: Code | Evidence | Tools | Validators | Boundary | Skill
  - Konkrete Datei-Änderungen (Pfad + Zeile / Block)
  - Sandbox-Pfad: ./sandbox/ oder ./drafts/ — kein Live-Pfad
  - Validation-Plan: welcher Validator läuft, welcher erwartet wird
  - Rollback-Strategie
  - Risiko-Statement
  - KEIN Apply-Schritt in diesem Slice
```

**Slice 2 liefert nur Vorschläge. Apply bleibt Slice 3.**

### Stage 3 — Proposal Validation (Slice 3, deferred)

**Zweck:** Apply-Gate für freigegebene Proposals. Erzwingt Owner-Approval,
Dry-Run-Validation und Evidence-Pflicht.

**Pflicht-Schritte:**

```text
1. Owner-Approval des proposal.md (kein Auto-Approve)
2. Dry-Run auf Sandbox-Pfad
3. Validator-Output dokumentiert in validation.md
4. diff.patch gegen vorherigen Stand
5. next-gate.md benennt den Folge-Slice oder schließt mit "no further action"
6. KEIN Merge in main / KEIN Push / KEIN Deploy — Owner entscheidet selbst
```

**Self-Approval ist ausgeschlossen.** Pi, Subagents und Loop-Runner haben
keine Befugnis, eigene Proposals anzuwenden.

## Relationship To Skill Registry

Die Skill Registry (`skills/index.md`, `skills/**/*.skill.yaml`) bleibt die
stabile Basis des Harness. Self-Harness Loop arbeitet **neben** der Registry,
nicht **über** sie.

```text
Skill Registry          Self-Harness Loop
─────────────────       ──────────────────
stabile Verträge        dynamische Befunde
Owner-editiert          Evidence-anchored
v0.x versioniert        pro Run versioniert
Schema-pflichtig        Schema-frei in Slice 1
```

**Verbindungsregeln:**

- Befunde, die einen existierenden Skill betreffen, werden im Befund als
  `related_skill: <skill-id>` markiert — aber niemals automatisch in
  `skills/index.md` geschrieben.
- Ein Proposal in Slice 2 darf Skill-Definitionen nur in `./drafts/skills/`
  vorschlagen, niemals direkt in `skills/`.
- Loop-Output ist nicht Wahrheit für die Registry — die Registry ist
  Owner-pflichtig.

## Relationship To Existing Evidence-Run Artifacts

Der Loop greift auf bestehende Evidence-Files zu, ohne deren Format zu verändern.

```text
sandbox/runs/<ts>/
  intent.md           ← Loop liest (Scope + Zone)
  commands-run.md     ← Loop liest (welche Befehle liefen)
  files-read.md       ← Loop liest (welche Quellen gesichtet wurden)
  files-changed.md    ← Loop liest (welche Dateien schon verändert wurden)
  validation.md       ← Loop liest (Pass/Fail pro Check)
  diff.patch          ← Loop liest (vorangegangene Diffs als Diff-Basis)
  risks.md            ← Loop liest + kann als Schwächen-Quelle dienen
  next-gate.md        ← Loop liest + kann als Schwächen-Quelle dienen

  weakness-mining.md  ← Loop schreibt in Slice 1
  proposal.md         ← Loop schreibt in Slice 2 (deferred)
```

**Pflicht:** Weakness-Mining verändert keine bestehende Evidence-Datei. Es
schreibt ausschließlich neue Mining-Dateien im selben Run-Ordner oder in
einem neuen Run-Ordner.

## Boundary

**Dieser Slice definiert Weakness Mining ONLY.**

```text
In-Scope (Slice 1):
  - Befunde sammeln
  - Befunde klassifizieren
  - Befunde dokumentieren
  - Befunde als unverbindlich markieren
  - Loop-Artefakte lesen, ohne sie zu mutieren

Out-of-Scope (Slice 1):
  - KEINE Harness-Änderungen
  - KEINE Proposal-Automation
  - KEINE Validators-Änderungen
  - KEINE Skill-Registry-Änderungen
  - KEINE Sandbox-Policy-Änderungen
  - KEINE Auto-Approval-Mechanismen
  - KEINE Live-Pfad-Schreibvorgänge
  - KEIN Merge in main / KEIN Push
```

Die Boundaries in `docs/pi-harness-sandbox-working-plan.md` gelten unverändert.
Zone S0 (Read-only Audit) ist Default; jede Mining-Aktion in einer höheren Zone
braucht explizite Owner-Freigabe.

## Non-Goals

- keine Loop-Implementierung
- keine Loop-Automatisierung
- kein Cron / kein Scheduled-Run
- kein Proposal-Generator
- kein Apply-Bot
- keine Skill-Registry-Mutation
- keine Validator-Mutation
- keine Vault-Writes
- keine Netzwerk-Aufrufe (NET_0 bleibt Default)
- keine Live-Pfad-Mutation
- keine Auto-Promotion

## Recommended Next Gates

Empfohlene Reihenfolge nach Owner-Acceptance dieses Konzepts:

1. **Slice 2 — Harness Proposal Design** — exakte Pflicht-Felder für `proposal.md`,
   Sandbox-Pfade, Owner-Approval-Schema, Rollback-Strategie (eigener Slice)
2. **Slice 2 — Proposal Validation Design** — Dry-Run-Protocol, Validator-Output-Contract,
   Diff-Basis-Regeln (eigener Slice)
3. **Slice 1 — First Real Mining Run** — ein konkret ausgeführter Weakness-Mining-Run
   auf einem bestehenden Evidence-Ordner, mit nachvollziehbarem Befund-Set
4. **Owner-Acceptance dieses Konzepts** — Voraussetzung für jeden Slice 2-Schritt

> **Hinweis:** `skills/harness/` enthält ausschließlich den schema-validierten
> Contract `weakness-mining.skill.yaml`. Ohne `SKILL.md` bleibt er contract-only
> und wird nicht in die Codex-/Provider-Skill-Registry oder Exports promoviert.
> Ein Slice-2-Design entscheidet separat, ob Self-Harness-Loop als ausführbarer
> Skill, als Command oder als Hybrid verfasst wird.

## Relation To Existing Docs

| Dokument | Relation |
|----------|----------|
| `docs/pi-harness-sandbox-working-plan.md` | Zonen, Evidence-Contract, Subagent-Boundary — gelten unverändert |
| `docs/evidence-path-contract.md` | Pflicht-Files unter `sandbox/runs/<ts>/` — Loop liest, ohne zu mutieren |
| `docs/pi-compatible-skill-contract-schema-proposal.md` | Skill-Format — Loop ändert Registry nicht |
| `docs/pi-execution-surface-policy.md` | Tier-Regeln — Loop operiert in Tier 0/1, nie 3/4 |
| `docs/pi-secret-handling-spec.md` | Secret-Boundary — kein Key, kein Token, keine `.env`-Reads |
| `docs/pi-smoke-command-design.md` | Smoke-Patterns — als Validator-Quelle nutzbar, nicht als Loop-Auslöser |

## Verification

Nach Erstellung geprüft:

```bash
test -f docs/harness/self-harness-loop.md && echo CONCEPT_EXISTS || echo CONCEPT_MISSING
# → CONCEPT_EXISTS

test -f skills/harness/SKILL.md && echo SKILL_EXISTS || echo SKILL_NOT_EXISTS
# → SKILL_NOT_EXISTS (absichtlich — Contract-only, Slice 2 entscheidet Promotion)

python3 runtime/validators/validate-contracts.py
# → skills/harness/weakness-mining.skill.yaml PASS

grep -c "^##" docs/harness/self-harness-loop.md
# → Sektionen vorhanden

grep -i "auto.apply\|auto.approve\|auto.promote" docs/harness/self-harness-loop.md
# → keine Treffer (fail-closed gewahrt)

git diff --name-only
# → docs/harness/self-harness-loop.md

git status --short
# → ?? docs/harness/self-harness-loop.md (neuer Pfad unter docs/harness/)
#    Status: untracked, uncommitted — kein clean-state-Blocker,
#    vorgesehen für expliziten Owner-Acceptance-Commit
```
