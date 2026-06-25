# Prompt Template — tdd-impl-loop v0.1

Dieser Loop erzeugt immer sieben Sektionen — eine pro Phase.
Jede Phase endet mit einem expliziten Gate-Ergebnis.

---

## Template

```text
# TDD Implementation Loop

Task: <task_description>
Repo: <repo_path | "current working directory">
Datum: <YYYY-MM-DD>
Slug: <kebab-slug-fuer-evidence>

---

## Phase 1 — INTAKE (token-savior-recall MCP)

### 1.1 Memory Recall
```
→ memory_index()
Prior Observations: <Anzahl> / keine
Relevante IDs: <IDs oder "none">

→ memory_search(query="<task_description>")
Treffer: <Snippets oder "none">

→ memory_get(ids=[...])  [nur wenn Treffer relevant]
Prior Context: <Inhalt oder "none">
```

### 1.2 Projekt-Orientierung
```
→ get_project_summary()
Struktur: <Top-Level Dirs, File Count>
Top Symbols: <relevante>

→ get_git_status()
Branch: <branch>
Repo State: clean | dirty | unknown
Staged/Unstaged: <Anzahl Dateien>

→ get_changed_symbols()  [nur wenn dirty]
Veränderte Symbole: <Liste oder "none">
```

### 1.3 Scope Discovery
```
→ get_feature_files(keyword="<task_keyword>")
Matching Files: <Liste>
Traced Imports: <Liste>

→ search_codebase(pattern="<relevant_term>")
Treffer in Contracts/Tests/Docs: <Liste>
```

### 1.4 Intake Record

Task (Observable Terms):
<Neuformulierung in messbaren, beobachtbaren Termen>

Prior Context:
<aus memory_search — oder "none">

Repo State: clean | dirty | unknown

Scope Boundary:
- <Datei oder Verzeichnis 1>
- <Datei oder Verzeichnis 2>

Out of Scope:
- <explizit ausgeschlossen 1>
- <explizit ausgeschlossen 2>

Gate: PASS | BLOCKED
Grund (wenn BLOCKED): <warum>

---

## Phase 2 — EINORDNUNG

Task Class: implementation | bugfix | contract-change | docs | validation
Risk Level: low | medium | high | blocked
Execution Mode: AFK | HITL
Affected Surfaces:
- <Surface 1>
- <Surface 2>

Begründung:
<Warum diese Klassifizierung — direkt aus Repo-Evidence>

Gate: PASS | BLOCKED | HITL-PAUSE
Grund (wenn nicht PASS): <warum>

---

## Phase 3 — PLANUNG

SUMMARY:
<1-3 Sätze was umgesetzt wird>

IMPLEMENTATION WAVES:
Wave 1 (smallest safe first slice):
  Scope: <was genau>
  Done wenn: <messbares Kriterium>
  AFK / HITL: <welches>

Wave 2 (wenn nötig):
  Scope: <was genau>
  Done wenn: <messbares Kriterium>
  AFK / HITL: <welches>

DEPENDENCIES:
- <Abhängigkeit 1>

NON-GOALS:
- <Ausschluss 1>

RISKS:
- <Risiko 1>

ACCEPTANCE CRITERIA:
- [ ] <Kriterium 1>
- [ ] <Kriterium 2>

Gate: PASS | BLOCKED
Grund (wenn BLOCKED): <warum>

---

## Phase 4 — TEST SCHREIBEN

BEHAVIOR UNDER TEST:
<Observable Behavior — was soll nach der Implementierung wahr sein>

FAILING CHECK:
Datei: <Pfad zur Testdatei>
Kommando: <npm test | node ... | etc.>
Erwartetes Failure Signal: <was der Test beim FAIL ausgibt>

FAILURE SIGNAL (tatsächlich):
<tatsächliche Ausgabe — beobachtet>

Gate: RED (Test schlägt FEHL) | BLOCKED | SKIP
Grund (wenn BLOCKED/SKIP): <warum>

---

## Phase 5 — CODE UMSETZEN

IMPLEMENTATION BOUNDARY:
Datei(en): <genaue Pfade>
Zeilen / Sektionen: <was genau geändert wurde>

PASSING CHECK:
Kommando: <npm test | node ... | etc.>
Ausgabe: <tatsächliches PASS-Signal>

REGRESSION GATE:
Kommando: <npm run validate | npm test | etc.>
Ergebnis: PASS | FAIL | SKIP
Ausgabe: <relevante Zeilen>

REFACTOR NOTES:
<optional — nur innerhalb Boundary, oder "none">

Gate: PASS | BLOCKED
Grund (wenn BLOCKED): <warum — bei 3+ Fehlversuchen: → diagnostic-feedback-loop>

---

## Phase 6 — DOKUMENTATION

Observed:
- <direkt beobachtete Fakten mit Pfaden>

Applied:
- <Datei 1 geändert: <was>
- <Datei 2 geschrieben: <was>

Verified:
- <Pfad + Kommando + Ergebnis>

Inferred:
- <Schlussfolgerungen — klar als Inference markiert>

BLOCKED:
- <was nicht umgesetzt wurde und warum — oder "none">

CHANGELOG Entry (wenn öffentlich sichtbar):
<Eintrag oder "none">

Authority Matrix Update (wenn Claim-Status sich ändert):
<Update oder "none">

Gate: PASS | BLOCKED

---

## Phase 7 — RUN ABSCHLUSS

Result: pass | partial | blocked | failed

Closure Summary:
<2-5 Sätze: was wurde gemacht, was war das Ergebnis, was bleibt offen>

Evidence Path:
evidence/loop-runs/<slug>/

Nächstes Gate:
<konkreter Re-Entry-Pointer für nächste Session, oder "none">

Phasen-Übersicht:
| Phase | Status |
|---|---|
| 1 INTAKE | PASS / BLOCKED / FAILED |
| 2 EINORDNUNG | PASS / BLOCKED / HITL |
| 3 PLANUNG | PASS / BLOCKED |
| 4 TEST | RED / BLOCKED / SKIP |
| 5 CODE | PASS / BLOCKED |
| 6 DOCS | PASS / BLOCKED |
| 7 CLOSURE | PASS / PARTIAL / FAILED |
```

---

## Regeln für Template-Verwendung

- Jede Phase muss mit einem expliziten Gate-Ergebnis enden
- `BLOCKED` immer mit Grund versehen
- `Applied` erfordert immer ein `Verified` Gegenstück
- Phasen-Übersicht in Phase 7 immer vollständig ausfüllen
- `SKIP` ist nur in Phase 4 erlaubt und nur wenn `task_class: docs`
- Keine positive Anweisung mit blockierten Begriffen aus `stop-rules.md`

---

## Phase 5 Untergrenze bei Fehlversuchen

Nach 3 FAIL-Versuchen in Phase 5:

```text
Gate: BLOCKED
Grund: 3 Implementierungsversuche fehlgeschlagen.
→ Diagnostic required: core/skills/diagnostic-feedback-loop/SKILL.md
→ Loop weiter mit Phase 7 (result: blocked)
```

Kein vierter Versuch ohne Diagnose.
