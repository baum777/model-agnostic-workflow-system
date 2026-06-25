# Command Contract — tdd-impl-loop

Version: v0.2
Status: canonical
Modus: read-write (gated)
Klasse: implementation
MCP: token-savior-recall (Phase 1 primary, Phase 2/4/5/6/7 supporting)

---

## Trigger

```text
command/ loop impl <task-description> [--path <repo-path>]
```

Beispiele:

```text
command/ loop impl "add classifyRisk to policy gate"
command/ loop impl "fix output-schema validation bug" --path ./loops/repo-loop
```

## Was dieser Loop tut

Dieser Loop führt eine vollständige, gate-gesteuerte Implementierungseinheit aus — von Intake bis Evidence-Closure.
Er ist das Gegenstück zu `loop repo` (read-only): Dieser Loop darf schreiben, aber nur innerhalb des deklarierten Scope und nur nach expliziten Gates.

---

## Phasen

### Phase 1 — INTAKE (via token-savior-recall MCP)

Ziel: Den Task verstehen, Prior Context laden und Scope präzise abgrenzen —
ohne manuelle Datei-Reads, stattdessen über token-savior-recall MCP Tools.

#### 1.1 — Memory Recall (Prior Context)

Tool-Sequenz (in dieser Reihenfolge):

```
memory_index()
  → Compact Index aller gespeicherten Observations für dieses Projekt
  → Prüfe: gibt es gespeicherte Entscheidungen, Guardrails oder Patterns die diesen Task betreffen?

memory_search(query=<task_description>)
  → FTS5-Suche über Observations
  → Prüfe: frühere Closure-Summaries, bekannte Blocker, verwandte Slices

memory_get(ids=[...])
  → Vollinhalt der relevanten Observations (nur die die wirklich zutreffen)
```

Wenn keine Observations existieren: weiter mit 1.2 (kein Blocker).

#### 1.2 — Projekt-Orientierung

```
get_project_summary()
  → Struktur, File-Count, Top-Symbols, Infra-Dirs
  → Prüfe: Welche Bereiche sind betroffen?

get_git_status()
  → Branch, ahead/behind, staged/unstaged/untracked
  → Klassifiziere: clean | dirty | unknown

get_changed_symbols()
  → Symbol-level Diff des aktuellen Worktree
  → Nur relevant wenn dirty — was wurde bereits verändert?
```

#### 1.3 — Scope Discovery

```
get_feature_files(keyword=<task_keyword>)
  → Dateien die zum Task-Keyword matchen + traced imports
  → Ergibt initiale scope_boundary

search_codebase(pattern=<relevant_term>)
  → Contracts, Tests, Docs die direkt relevant sind
  → Erweitert oder begrenzt scope_boundary
```

#### 1.4 — Intake Record synthetisieren

Aus den token-savior Outputs wird der Intake Record gebaut:

```json
{
  "task_description": "<Neuformulierung in Observable Terms>",
  "prior_context": "<relevant aus memory_search — oder 'none'>",
  "repo_state": "clean | dirty | unknown",
  "scope_boundary": ["<Datei oder Verzeichnis>"],
  "out_of_scope": ["<explizit ausgeschlossen>"],
  "changed_symbols": ["<falls dirty: betroffene Symbole>"]
}
```

Outputs:
- `task_description` — Neuformulierung in messbaren Termen
- `prior_context` — gespeicherter Kontext aus früheren Sessions
- `repo_state` — git-Status
- `scope_boundary` — betroffene Dateien und Surfaces (aus get_feature_files)
- `out_of_scope` — explizit ausgeschlossen

Gate: Scope ist bounded und task_description ist in Observable Terms formuliert.
BLOCKED wenn: Scope zu breit für eine Session, Auth/Secrets erforderlich, Runtime-Zugriff nötig.

---

### Phase 2 — EINORDNUNG

Ziel: Den Task klassifizieren, bevor Planung beginnt.

Supporting token-savior Tools:
```
get_changed_symbols()            → Scope-Validierung gegen aktuellen Diff
find_impacted_test_files()       → Welche Tests sind durch den Scope betroffen?
get_change_impact(symbol=<...>)  → Transitive Abhängigkeiten eines betroffenen Symbols
```

Klassifizierungen:
- `task_class`: `implementation | bugfix | contract-change | docs | validation`
- `risk_level`: `low | medium | high | blocked`
- `execution_mode`: `AFK` (aus Repo-Evidence allein ausführbar) | `HITL` (Mensch-Entscheidung nötig)
- `affected_surfaces`: Liste der betroffenen Skill-, Contract-, Docs-, Test-Surfaces

Routing-Regel:
- `risk_level: blocked` → Loop stoppt, gibt `BLOCKED` zurück
- `execution_mode: HITL` → Loop pausiert, wartet auf Freigabe
- `task_class: docs` und kein Test möglich → weiter zu Phase 3, aber Phase 4 auf `SKIP` gesetzt

Gate: Alle vier Klassifizierungen sind explizit und mit Begründung versehen.

---

### Phase 3 — PLANUNG

Ziel: Implementierung in bounded Slices aufteilen.

Skill: `skills/planning-slice-builder/SKILL.md`

Outputs (nach planning-slice-builder Schema):
- `SUMMARY`
- `IMPLEMENTATION WAVES` — mindestens 1, maximal 5
- `DEPENDENCIES`
- `NON-GOALS`
- `RISKS`
- `ACCEPTANCE CRITERIA`
- `NEXT ACTIONS`

Gate: Erster Slice ist identifiziert, Done-Kriterium ist messbar oder reviewbar.
BLOCKED wenn: Acceptance Criteria nicht prüfbar, Dependencies ungeklärt, Waves > 5.

---

### Phase 4 — TEST SCHREIBEN

Ziel: Failing Test für das deklarierte Verhalten erzeugen.

Supporting token-savior Tools:
```
find_impacted_test_files()       → Welche Testdateien sind im Scope?
get_function_source(name=<...>)  → Source des zu testenden Symbols
get_edit_context(symbol=<...>)   → Callers + Dependencies für Test-Setup
run_impacted_tests()             → Test-Run nach Test-Erstellung (Failure-Signal)
```

Skill: `core/skills/behavior-first-tdd/SKILL.md` (Phasen 1–3)

Outputs:
- `BEHAVIOR UNDER TEST` — in Observable Terms
- `FAILING CHECK` — konkrete Testdatei + Zeile + erwartetes Ergebnis
- `FAILURE SIGNAL` — tatsächliche Ausgabe des fehlschlagenden Tests

Gate: Test läuft und schlägt FEHL (Red). Failure Signal ist explizit.
BLOCKED wenn:
- Kein ausführbares Test-Surface existiert
- Test kann nicht ohne externe Deps ausgeführt werden
- `task_class: docs` aus Phase 2 → Phase überspringen, als `SKIP` markieren

---

### Phase 5 — CODE UMSETZEN

Ziel: Kleinste Änderung implementieren, die den Test zum Bestehen bringt.

Supporting token-savior Tools:
```
get_edit_context(symbol=<...>)         → Pre-Edit Bundle (Source + Deps + Callers)
replace_symbol_source(symbol=<...>)    → Vollständige Symbol-Ersetzung (wenn Logik sich ändert)
edit_lines_in_symbol(symbol=<...>)     → Minimale Inline-Änderung (wenn nur Zeilen betroffen)
run_impacted_tests()                   → PASS-Signal nach Implementierung
run_project_action(action_id=<...>)    → Regression Gate (npm run validate etc.)
checkpoint(op="create")                → Sicherungspunkt vor der Änderung
```

Skill: `core/skills/behavior-first-tdd/SKILL.md` (Phasen 4–7)

Constraints:
- Nur innerhalb des in Phase 1 deklarierten `scope_boundary`
- Eine Änderung, nicht mehrere auf einmal
- Keine Refactors außerhalb der berührten Boundary
- Kein Scope Creep in andere Slices

Outputs:
- `IMPLEMENTATION BOUNDARY` — betroffene Dateien und Zeilen
- `PASSING CHECK` — Testlauf mit PASS-Signal
- `REGRESSION GATE` — Ergebnis des umgebenden Test-Runs
- `REFACTOR NOTES` — optional, nur innerhalb Boundary

Gate: Fokussierter Test PASS, Regression Gate PASS.
BLOCKED wenn: Test nach Implementation weiterhin FAIL, Regression Gate bricht.

---

### Phase 6 — DOKUMENTATION

Ziel: Arbeit nachvollziehbar festhalten.

Supporting token-savior Tools:
```
memory_save(type="fact", content=<...>)
  → Persistiert Entscheidungen, Guardrails und Erkenntnisse für zukünftige Sessions
  → Nutze für: "Was wurde geändert", "Warum", "Was wurde bewusst ausgelassen"

build_commit_summary()
  → Kompakte Commit-Narrative mit Stats und Hotspots
  → Grundlage für CHANGELOG-Eintrag

get_changed_symbols()
  → Finaler Diff für Applied-Liste im Evidence Record
```

Was dokumentiert wird:
- Welches Verhalten sich verändert hat
- Welche Dateien geschrieben oder geändert wurden
- Welcher Test das beweist
- Offene Lücken die nicht Teil dieses Slice waren

Dokumentations-Targets (je nach Scope):
- `CHANGELOG.md` — wenn das Verhalten öffentlich sichtbar ist
- `docs/authority-matrix.md` — wenn ein Claim-Status sich ändert
- `evidence/loop-runs/<slug>/` — immer (Closure-Record)
- `docs/` — wenn prose-governed Docs betroffen sind

Format: Evidence-Labels müssen verwendet werden:
- `Observed:` — direkt aus Dateien oder Kommandoausgaben
- `Inferred:` — Schlussfolgerung, klar markiert
- `Applied:` — was tatsächlich geschrieben wurde (mit Pfad)
- `Verified:` — Post-Write-Prüfung (Pfad + Kommando + Ergebnis)
- `BLOCKED:` — was nicht umgesetzt werden konnte und warum

Gate: Evidence-Record ist vollständig. Alle `Applied` Einträge haben `Verified` Gegenstücke.

---

### Phase 7 — RUN ABSCHLUSS

Ziel: Loop sauber beenden, Nächste-Gate-Pointer setzen.

Supporting token-savior Tools:
```
memory_save(type="fact", content=<closure_summary>)
  → Closure-Summary + next_gate in Memory persistieren
  → Wird beim nächsten Loop-Start via memory_index / memory_search geladen

checkpoint(op="prune", keep=10)
  → Alte Checkpoints bereinigen nach erfolgreichem Abschluss
```

Outputs:
- `result`: `pass | partial | blocked | failed`
- `closure_summary`: 2–5 Sätze — was wurde gemacht, was bleibt offen
- `next_gate`: expliziter Re-Entry-Pointer für die nächste Session
- `evidence_path`: Pfad in `evidence/loop-runs/<slug>/`

Pflicht-Writes:
- `evidence/loop-runs/<slug>/closure.md`

Optional:
- Eintrag in `current_session.md` (wenn BAUM-OS-Kontext aktiv)

Gate: `closure.md` ist geschrieben, `next_gate` ist explizit oder `none`.

---

## Input-Schema

```json
{
  "command": "command/ loop impl <task-description>",
  "task_description": "<string>",
  "repo_path": "<string | optional>",
  "mode": "read-write",
  "write_policy": "scope_boundary_only",
  "target": "tdd_implementation_with_evidence"
}
```

## Output-Schema

```json
{
  "result": "pass | partial | blocked | failed",
  "task_class": "implementation | bugfix | contract-change | docs | validation",
  "risk_level": "low | medium | high | blocked",
  "execution_mode": "AFK | HITL",
  "scope_boundary": ["<file-or-dir>"],
  "behavior_under_test": "<string>",
  "failing_check": "<test-path + expected signal>",
  "passing_check": "<test-path + pass signal>",
  "regression_gate": "PASS | FAIL | SKIP",
  "evidence_path": "evidence/loop-runs/<slug>/",
  "closure_summary": "<string>",
  "next_gate": "<string | none>"
}
```

---

## Memory — Was der Loop lesen darf

**Immer erlaubt:**
- token-savior MCP Tools (kein direkter Datei-Read in Phase 1 nötig)
- `README.md`, `AGENTS.md`, `WORKFLOW.md`
- `docs/`, `contracts/`, `core/contracts/`
- bestehende Tests (`tests/`, `*.test.*`, `*.spec.*`)
- `skills/`, `core/skills/`
- `evidence/loop-runs/` (lesen)
- Package-Metadaten (`package.json`, `package-lock.json`)

**Nicht erlaubt:**
- `.env`-Dateien (auch nicht via token-savior `analyze_config`)
- Secret-, Credential-, Token-Dateien
- externe APIs ohne explizite Freigabe
- Binary Dumps ohne Klassifikation

---

## token-savior Tool-Map (Übersicht)

| Phase | Tool | Zweck |
|---|---|---|
| 1 INTAKE | `memory_index` | Prior Context — Layer 1 Index |
| 1 INTAKE | `memory_search` | Prior Context — FTS5 Suche |
| 1 INTAKE | `memory_get` | Prior Context — Vollinhalt |
| 1 INTAKE | `get_project_summary` | Projekt-Struktur |
| 1 INTAKE | `get_git_status` | Repo-State |
| 1 INTAKE | `get_changed_symbols` | Dirty-State Diff |
| 1 INTAKE | `get_feature_files` | Scope Discovery |
| 1 INTAKE | `search_codebase` | Contract/Test/Docs Suche |
| 2 EINORDNUNG | `get_change_impact` | Transitive Impact-Analyse |
| 2 EINORDNUNG | `find_impacted_test_files` | Betroffene Tests |
| 4 TEST | `get_function_source` | Source des Ziel-Symbols |
| 4 TEST | `get_edit_context` | Context für Test-Setup |
| 4 TEST | `run_impacted_tests` | Test-Run (Failure-Signal) |
| 5 CODE | `checkpoint(op=create)` | Sicherung vor Änderung |
| 5 CODE | `get_edit_context` | Pre-Edit Bundle |
| 5 CODE | `replace_symbol_source` | Vollständige Symbol-Ersetzung |
| 5 CODE | `edit_lines_in_symbol` | Minimale Inline-Änderung |
| 5 CODE | `run_impacted_tests` | PASS-Signal nach Impl. |
| 5 CODE | `run_project_action` | Regression Gate |
| 6 DOCS | `memory_save` | Entscheidungen persistieren |
| 6 DOCS | `build_commit_summary` | CHANGELOG-Grundlage |
| 6 DOCS | `get_changed_symbols` | Finaler Diff (Applied-Liste) |
| 7 CLOSURE | `memory_save` | Closure + Next Gate persistieren |
| 7 CLOSURE | `checkpoint(op=prune)` | Alte Checkpoints bereinigen |

---

## Verweise

- Stop-Regeln: `stop-rules.md`
- Template: `prompt-template.md`
- TDD-Skill: `core/skills/behavior-first-tdd/SKILL.md`
- Planung: `skills/planning-slice-builder/SKILL.md`
- Evidence: `evidence/loop-runs/README.md`
- Referenz-Loop: `loops/repo-loop/command-contract.md`
- MCP: `token-savior-recall` (binary: `~/.local/bin/token-savior`)
