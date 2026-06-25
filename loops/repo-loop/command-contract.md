# Command Contract — loop repo

Version: v0.1
Status: canonical
Modus: read-only

## Trigger

```text
command/ loop repo <path>
```

Der Trigger startet genau einen Repo-Loop für genau einen Pfad.

## Input

```json
{
  "command": "command/ loop repo <path>",
  "repo_path": "<path>",
  "mode": "read-only",
  "target": "generate_workblock_prompt",
  "write_policy": "no_target_repo_writes"
}
```

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

## Memory — Was der Loop lesen darf

**Erlaubt:**
- `README.md`
- `AGENTS.md`
- `docs/` (Frontdoor-/Governance-Dateien)
- lokale Governance-Dateien
- offene Logs und Closure-Berichte
- Evidence Contracts
- Package- und Test-Metadaten
- Baum-OS Memory-Dateien, falls vorhanden

**Nicht erlaubt:**
- `.env`-Dateien
- Secret-Dateien
- private Token-Dateien
- Credential Stores
- unklar klassifizierte Binary Dumps
- externe Connector-Daten ohne explizite Freigabe

## Conditions

| Ergebnis | Bedeutung |
|---|---|
| `pass` | Direkt nutzbarer Arbeitsblock-Prompt wurde erzeugt |
| `blocked` | Risiko, fehlender Kontext, unklassifizierter Dirty State oder Secret/Auth/Runtime/Deployment-Bedarf erkannt |
| `partial` | Repo konnte teilweise analysiert werden, aber nicht genug für sicheren Arbeitsblock |
| `failed` | Repo-Pfad ungültig, Frontdoor nicht lesbar, Basisanalyse unmöglich |

## Parsing-Regeln

```text
- command prefix muss "command/" sein
- action muss "loop" sein
- target muss "repo" sein
- path ist required
- fehlender path → failed
- nicht existierender path → failed
```

## Verweise

- Stop-Regeln: `stop-rules.md`
- Template: `prompt-template.md`
- Schema: `output-schema.json`
- Validator: `validator-spec.md`
