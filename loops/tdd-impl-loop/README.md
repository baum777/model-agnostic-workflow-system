# tdd-impl-loop

Version: v0.2
Status: canonical
Modus: read-write (gated)
MCP: token-savior-recall (Phase 1 primary)

---

## Was dieser Loop ist

Der vollständige, gate-gesteuerte Implementierungsloop für `model-agnostic-workflow-system`.

Er ist das Gegenstück zu `loops/repo-loop/` (read-only):
- `repo-loop` liest ein Repo und erzeugt einen Workblock-Prompt
- `tdd-impl-loop` führt diesen Workblock aus — von Intake bis Evidence-Closure

## Die 7 Phasen

```text
INTAKE → EINORDNUNG → PLANUNG → TEST → CODE → DOCS → CLOSURE
  1          2           3        4      5       6       7
```

| Phase | Kurz | Skill | Gate |
|---|---|---|---|
| 1 INTAKE | Aufgabe verstehen, Scope begrenzen | `token-savior-recall` | Scope bounded |
| 2 EINORDNUNG | Klassifizieren, Risiko, AFK/HITL | — | Alle 4 Klassifizierungen explizit |
| 3 PLANUNG | Slices + Acceptance Criteria | `planning-slice-builder` | Erster Slice + Done-Kriterium |
| 4 TEST | Failing Test erzeugen | `behavior-first-tdd` (red) | Test FAIL (Red) |
| 5 CODE | Kleinste Impl. die Test besteht | `behavior-first-tdd` (green) | Test PASS + Regression PASS |
| 6 DOCS | Evidence schreiben | `post-implementation-review-writer` | Applied = Verified |
| 7 CLOSURE | Run abschließen, Next Gate setzen | — | closure.md geschrieben |

## Trigger

```text
command/ loop impl <task-description> [--path <repo-path>]
```

## Wann nutzen

- Wenn ein Feature, ein Bugfix oder eine Contract-Änderung implementiert werden soll
- Wenn TDD möglich ist (ausführbarer Test-Surface existiert)
- Wenn eine Session von Intake bis Closure vollständig protokolliert sein soll

## Wann nicht nutzen

- Für reine Orientierung oder Lagebild → `loop repo`
- Wenn kein Scope definierbar → zuerst `loop repo`
- Wenn Runtime, Deployment oder externe Credentials nötig → `blocked`

## Dateien

| Datei | Inhalt |
|---|---|
| `command-contract.md` | Vollständige Phase-Definitionen + Input/Output-Schema |
| `stop-rules.md` | Alle Stop-Bedingungen pro Phase |
| `prompt-template.md` | Template für Loop-Ausführung |
| `memory-save-schema.md` | Call-Muster für memory_save (Phase 6 + 7) |
| `circling-integration.md` | Wie ~/circling/ in Phase 1, 6, 7 eingebunden wird |
| `README.md` | Diese Datei |

## Verweise

- MCP: `token-savior-recall` v4.4.1 (`~/.local/bin/token-savior`)
- Referenz-Loop: `loops/repo-loop/`
- TDD-Skill: `core/skills/behavior-first-tdd/SKILL.md`
- Planung: `skills/planning-slice-builder/SKILL.md`
- Diagnose: `core/skills/diagnostic-feedback-loop/SKILL.md`
- Evidence: `evidence/loop-runs/README.md`
- WORKFLOW.md: Klasse `implementation`
