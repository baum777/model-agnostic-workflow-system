# Evidence — Loop Runs

Pro Loop-Run ein Unterordner.

## Struktur

```text
evidence/loop-runs/
  README.md              ← diese Datei
  .gitkeep               ← leerer Ordner wird getrackt
  YYYY-MM-DD-<repo-name>-<result>/
    input.md             ← Trigger, Pfad, Zeitstempel
    repo-scan.md         ← gelesene Dateien, Frontdoor-Befund
    classification.md    ← Repo-State, Task-Class, Begründung
    generated-workblock.md ← finaler Prompt (bei pass/partial)
    closure.md           ← Result, Files Read/Changed, Verification, Risks/Gaps, Status
```

## Slug-Format

```text
YYYY-MM-DD-<repo-name>-<result>
Beispiel: 2026-06-25-ModelGate-pass
```

## Evidence Level

Loop-Runs erzeugen in v0.1 ausschließlich L1-Evidence (read-only, Klassifikation).
Kein Owner-Approval erforderlich, solange keine Zielrepo-Änderung erfolgt.

Referenz: `evidence/README.md` (L1–L4 Definitionen)

## Pflichtartefakte

| Datei | Inhalt | Pflicht |
|---|---|---|
| `input.md` | Trigger, Pfad, Zeitstempel | Ja |
| `repo-scan.md` | Gelesene Dateien, Frontdoor-Befund | Ja |
| `classification.md` | Repo-State, Task-Class, Begründung | Ja |
| `generated-workblock.md` | Finaler Prompt | Ja bei `pass`/`partial` |
| `closure.md` | Result, Files Read/Changed, Verification, Risks/Gaps, Status | Ja |

## Verweise

- Evidence-Regeln: `evidence/README.md`
- Loop-Contract: `loops/repo-loop/command-contract.md`
