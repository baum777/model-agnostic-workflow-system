# Validator Spec — loop repo v0.1

Ein generierter Workblock ist Baum-OS-konform, wenn alle Bedingungen dieser Spec erfüllt sind.

## Output-Schema

Prüfe gegen `output-schema.json`. Alle required fields müssen vorhanden und gültig sein:

| Feld | Typ | Erlaubte Werte |
|---|---|---|
| `result` | string | `pass`, `partial`, `blocked`, `failed` |
| `repo_path` | string | nicht leer |
| `repo_state` | string | `clean`, `dirty`, `unknown`, `blocked` |
| `task_class` | string | `docs-only`, `implementation`, `validation`, `runtime`, `deployment`, `review`, `unknown` |
| `generated_workblock` | string | nicht leer |
| `closure_summary` | string | nicht leer |
| `evidence_path` | string | optional |

## Pflichtstruktur im generierten Workblock

Ein gültiger Workblock enthält diese Sektionen (in dieser Reihenfolge):

- [ ] `# Task Start`
- [ ] `Name:` (nicht leer)
- [ ] `Ziel:` (nicht leer)
- [ ] `Modus:` (einer der erlaubten Werte)
- [ ] `Scope:` (nicht leer)
- [ ] `Boundaries:` (mindestens 3 Zeilen)
- [ ] `Done-Kriterium:` (messbar, nicht leer)
- [ ] `# Arbeitsblock` mit 3–7 nummerierten Schritten
- [ ] `# Stop-Regeln` (mindestens 2 Einträge)
- [ ] `# Task Closure` mit: `Result`, `Owner / Scope`, `Files Read`, `Files Changed`, `Verification`, `Risks / Gaps`, `Status`

## Schritt-Anzahl

```text
Mindestens 3 nummerierte Schritte im Arbeitsblock.
Maximal 7 nummerierte Schritte im Arbeitsblock.
```

## Read-Only-Invariante

```text
"Files Changed" im Task Closure muss in v0.1 "none" enthalten.
```

## Blockierte Begriffe

Diese Begriffe dürfen im `generated_workblock` nicht als positive Arbeitsanweisung erscheinen.
Sie sind nur in `stop-rules.md` und `validator-spec.md` als Negativliste erlaubt.

```text
Next smallest step
Next safe gate
automatically proceed
continue until everything is done
read .env
deploy automatically
commit all changes
```

Vorkommen außerhalb einer Negativliste → Workblock ungültig.

## Manuelle Prüfung (bis Runtime-Validator existiert)

```bash
# Pflichtstruktur
grep -c "Task Start" <workblock-file>
grep -c "Arbeitsblock" <workblock-file>
grep -c "Task Closure" <workblock-file>
grep -c "Done-Kriterium" <workblock-file>
# Erwartung: alle >= 1

# Blockierte Begriffe (0 Treffer erwartet außerhalb von Negativlisten)
grep -n "Next smallest step\|Next safe gate\|automatically proceed\|continue until everything is done\|read .env\|deploy automatically\|commit all changes" <workblock-file>

# JSON-Schema
node -e "JSON.parse(require('fs').readFileSync('loops/repo-loop/output-schema.json','utf8')); console.log('schema ok')"
```

## Runtime Validator (v0.2)

```bash
node scripts/tools/validate-loop-run.mjs evidence/loop-runs/<slug>
```

Prüft automatisch alle Pflichtstruktur-Bedingungen dieser Spec.
Exit Code `0` = PASS, Exit Code `1` = FAIL.

## v0.3 Quality Gate

Zusätzliche semantische Qualitätsprüfungen via `--quality` Flag.

```bash
node scripts/tools/validate-loop-run.mjs --quality evidence/loop-runs/<slug>
```

Führt alle v0.2 Strukturchecks **plus** die folgenden Qualitätschecks durch:

| Check | Datei | Bedingung |
|---|---|---|
| `qg: scope-treue` | `generated-workblock.md` | `Scope:` Sektion muss eine begrenzte Pfad-/Repo-Restriktion enthalten (`Nur`, `/`, `erlaubt`, `only`) |
| `qg: stop-regel-abdeckung` | `generated-workblock.md` | `# Stop-Regeln` muss abdecken: secrets/auth, deployment/runtime, cross-repo, dirty-state |
| `qg: task-class-plausibilitaet` | `classification.md` | Task-Class muss aus dem erlaubten Enum stammen + Reasoning Summary nicht leer |
| `qg: repo-state-plausibilitaet` | `classification.md` | Repo-State muss aus dem erlaubten Enum stammen |
| `qg: risks-gaps-pflicht` | `closure.md` | `Risks / Gaps` Sektion muss vorhanden und nicht leer sein |
| `qg: evidence-konsistenz` | `closure.md` | `Evidence Path` muss den Slug des validierten Run-Ordners enthalten |

**Erlaubte Enum-Werte:**

- Task-Class: `docs-only`, `implementation`, `validation`, `runtime`, `deployment`, `review`, `unknown`
- Repo-State: `clean`, `dirty`, `unknown`, `blocked`

**Kombinierbar mit `--json`:**

```bash
node scripts/tools/validate-loop-run.mjs --quality --json evidence/loop-runs/<slug>
```

## v0.4 CI Gate

Vollständiger Gate-Lauf (Adapter + Structural + Quality) in einem Aufruf:

```bash
node scripts/tools/ci-gate.mjs
node scripts/tools/ci-gate.mjs --repo <path>
```

Ablauf:
1. `baum-loop-repo.mjs` erzeugt neuen Evidence-Run
2. Neuester Run-Ordner wird automatisch erkannt
3. `validate-loop-run.mjs` prüft Struktur
4. `validate-loop-run.mjs --quality` prüft Quality Gate
5. Exit `0` = PASS CI Gate, Exit `1` = FAIL CI Gate

**GitHub Actions Integration:** `.github/workflows/loop-repo-validate.yml`

Läuft automatisch auf Push und Pull Request. Kein Deployment, keine Secrets.

**classifyTaskClass Scoring-Gewichte (v0.4):**

| Dateityp | Pfad | Gewicht |
|---|---|---|
| `.json/.yml/.yaml/.mjs/.js/.sh` | Root-Level | 3 |
| `.json/.yml/.yaml/.mjs/.js/.sh` | Subdirectory | 2 |
| `.md` und alles andere | beliebig | 1 |

Klasse `deployment` wird disqualifiziert, wenn alle Treffer aus `.md`-Dateien stammen.
