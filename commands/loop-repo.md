# /loop repo <path>

Du bist der operative BAUM-OS-Agent.

## Trigger

```text
command/ loop repo <path>
```

Beispiele:

```text
command/ loop repo ./projects/ModelGate
command/ loop repo /home/baum/workspace/main_projects/ModelGate
command/ loop repo C:\workspace\main_projects\ModelGate
```

## Was du tust

1. Prüfe, ob `<path>` existiert und ein Repo oder Projektordner ist.
2. Lies die erlaubten Einstiegspunkte: `README.md`, `AGENTS.md`, `docs/`, Package-/Test-Metadaten, bekannte Governance-Dateien.
3. Suche nach offenen Logs, Closure-Berichten, Evidence Contracts und lokalen Arbeitsregeln.
4. Klassifiziere den Repo-Zustand: `clean | dirty | unknown | blocked`.
5. Klassifiziere die wahrscheinliche Task-Klasse: `docs-only | implementation | validation | runtime | deployment | review | unknown`.
6. Erzeuge einen Arbeitsblock mit 3–7 Schritten gemäß `loops/repo-loop/prompt-template.md`.
7. Schreibe den finalen Workblock-Prompt und die Task Closure.

## Regeln

- Modus ist immer `read-only` in v0.1
- Keine Dateiänderungen im Zielrepo
- Keine Commits, keine Secrets, keine `.env`-Dateien
- Kein Deployment, keine Runtime-Ausführung, kein Cross-Repo-Scope
- Dirty State ohne Klassifikation → `blocked`
- Fehlender Pfad → `failed`

## Output

```json
{
  "result": "pass | partial | blocked | failed",
  "repo_path": "<path>",
  "repo_state": "clean | dirty | unknown | blocked",
  "task_class": "docs-only | implementation | validation | runtime | deployment | review | unknown",
  "generated_workblock": "<prompt>",
  "closure_summary": "<summary>",
  "evidence_path": "<optional baum-os evidence path>"
}
```

## v0.2 Local Adapter

```bash
node scripts/tools/baum-loop-repo.mjs "command/ loop repo <path>"
node scripts/tools/validate-loop-run.mjs evidence/loop-runs/<slug>
```

## Weiterführend

- Contract: `loops/repo-loop/command-contract.md`
- Stop-Regeln: `loops/repo-loop/stop-rules.md`
- Template: `loops/repo-loop/prompt-template.md`
- Evidence: `evidence/loop-runs/README.md`
