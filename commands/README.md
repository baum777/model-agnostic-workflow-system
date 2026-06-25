# Commands

Kanonische Command-Einstiege für Baum-OS im tatsächlichen Core.

## Loop Commands

- `loop-repo.md` — Repo kontrolliert einlesen, Workblock erzeugen und Loop-Run-Evidence validieren (`command/ loop repo <path>`)

## Runtime

Lokaler Adapter:

```bash
node scripts/tools/baum-loop-repo.mjs "command/ loop repo <path>"
```

Runtime Validator:

```bash
node scripts/tools/validate-loop-run.mjs evidence/loop-runs/<slug>
node scripts/tools/validate-loop-run.mjs --quality evidence/loop-runs/<slug>
```

CI Gate (Adapter + Validate + Quality in einem Lauf):

```bash
node scripts/tools/ci-gate.mjs
```

npm-Wrapper:

```bash
npm run baum:loop-repo -- "command/ loop repo <path>"
npm run baum:ci-gate
```
