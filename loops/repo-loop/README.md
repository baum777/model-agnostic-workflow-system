# loops/repo-loop

Kanonischer Contract für den `command/ loop repo <path>` Command.

## Version

v0.4

## Status

canonical

## Modus

read-only

## v0.4 Runtime

- Adapter: `scripts/tools/baum-loop-repo.mjs` (Scoring-Klassifikation)
- Validator: `scripts/tools/validate-loop-run.mjs`
- CI Gate: `scripts/tools/ci-gate.mjs`
- Actions: `.github/workflows/loop-repo-validate.yml`

```bash
# Einzelschritte
node scripts/tools/baum-loop-repo.mjs "command/ loop repo <path>"
node scripts/tools/validate-loop-run.mjs evidence/loop-runs/<slug>
node scripts/tools/validate-loop-run.mjs --quality evidence/loop-runs/<slug>

# Vollständiger CI-Lauf
node scripts/tools/ci-gate.mjs
```

`--quality` aktiviert den v0.3/v0.4 Quality Gate.
`ci-gate.mjs` führt Adapter + Structural + Quality in einem Aufruf aus und gibt PASS/FAIL.

## Dateien

| Datei | Inhalt |
|---|---|
| `command-contract.md` | Trigger, Input, Output, Memory-Regeln, Conditions |
| `stop-rules.md` | Fail-closed Stopp-Bedingungen |
| `prompt-template.md` | Wiederverwendbares Workblock-Template |
| `output-schema.json` | JSON-Schema für Loop-Output-Validierung |
| `validator-spec.md` | Was einen Workblock Baum-OS-konform macht |

## Verweise

- Command-Einstieg: `commands/loop-repo.md`
- Evidence-Struktur: `evidence/loop-runs/README.md`
