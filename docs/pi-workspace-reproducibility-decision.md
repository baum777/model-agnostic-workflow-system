# Pi Workspace Reproducibility Decision

## Class

derived / docs-only / reproducibility decision

## Status

proposed — no runtime integration

## Decision

```text
Decision: external prerequisite for v0.

Pi darf für Smoke-/Runtime-Schritte nur in einer Umgebung verwendet werden,
in der `which pi`, `pi --version` und `pi --list-models` vorab erfolgreich sind.
Der zuvor beobachtete Pfad `/home/baum/.npm-global/bin/pi` ist historische Owner-Host-Evidence,
nicht garantiert in jeder Agent-/Claude-/Cowork-Ausführungsumgebung.

Observed Version (Owner-Host, historisch): 0.79.9
Package:                                   @earendil-works/pi-coding-agent@0.79.9
Current Slice Execution Environment:       `which pi` → not found
Workspace Dependency:                      not yet added to package.json
npx Execution Path:                        not yet enabled
runtime/surfaces/pi/:                      not yet created
Reassessment Trigger:                      before runtime/surfaces/pi/ is architected (P-12)
```

## Environment Clarification

Pi wurde in früherer Owner-/Cowork-Umgebung als lokale CLI beobachtet.
In der aktuellen Ausführungsumgebung dieses P-01-Slices war `pi` jedoch nicht verfügbar.
Daher ist Pi für v0 ein external prerequisite, nicht eine aktuell workspace-reproduzierbare Dependency.

Diese Unterscheidung ist kein Widerspruch zur Decision, sondern ihre Begründung: Reproduzierbarkeit von Pi ist umgebungsabhängig und muss vor jeder Pi-Session lokal re-verifiziert werden — nicht aus diesem Dokument übernommen werden.

## Use Rule

Dieses Dokument entscheidet nur die Reproduzierbarkeitsstrategie für Pi im Baum-OS Workspace Core-Anker.
Es installiert nichts, startet keine Pi-Session und aktiviert keine Runtime-Integration.
Canonical authority bleibt:
- `docs/pi-integration-path-decision.md` (Integration-Pfad: Option C now, Option A later)
- `docs/pi-local-runtime-evidence.md` (Evidence-Basis, Reklassifikation als Execution Surface)
- `core/contracts/permission-boundary.json` (Contract-Wahrheit)
- `docs/architecture.md` und `docs/authority-matrix.md` (Canonical doc authority)

Lies dieses Dokument vor P-04 (Pi Provider Default Decision) und vor P-03 Smoke-Run-Ausführung.

## Context

| Fakt | Status | Quelle |
|---|---|---|
| Pi Execution Surface, nicht Provider | ✓ dokumentiert | `pi-local-runtime-evidence.md` commit `c14bc52` |
| Pi lokal installiert (global) | ✓ `/home/baum/.npm-global/bin/pi` | pre-existing, nicht in workspace |
| Pi Version beobachtet | ✓ `0.79.9` | beobachtet, nicht getestet |
| Pi ist npm package | ✓ `@earendil-works/pi-coding-agent@0.79.9` | npm registry |
| Workspace `package.json` existiert | ✓ vorhanden | `/package.json` |
| Pi als devDependency | ✗ nicht vorhanden | audit: 0 Treffer in package.json |
| Pi via `npx` nutzbar | ✗ nicht konfiguriert | audit: no npx-run-script |
| `runtime/surfaces/pi/` existiert | ✗ nicht vorhanden | audit: no directory |
| `providers/pi/` existiert | ✗ korrekt nicht vorhanden | permanently rejected |
| `.env.example` für Pi | ✗ nicht vorhanden | vertagt, siehe P-05 |

## Option Assessment

| Option | Beschreibung | v0-Fit | v0-Risiko | v1-Fit | Empfehlung | Rationale |
|---|---|---|---|---|---|---|
| **A** — External Local Prerequisite | Pi bleibt global installiert; nur Docs | **best** | minimal | übergang zu B/C später | ✓ accept now | geringes Repo-Risiko für v0, keine Package-Verwaltung, kein Drift, keine Install-Komplexität |
| **B** — Workspace devDependency | Pi wird in `package.json` als devDep verankert | possible | medium | reproducible | defer | Install-/Version-Drift-Risiko, `npm install` nötig, CI/CD-Integration vor v0 nicht belegt |
| **C** — npx/Ephemeral | Pi wird später via `npx` gestartet | possible | medium | flexible | defer | Netzwerk-Risiko, Versions-Unsicherheit, kein offline-Support |
| **D** — No Binding | nur Docs, keine Reproducibility-Regel | not viable | high | unclear | reject | zu ungelenkt für Smoke, für Onboarding unklar, suggeriert Zufälligkeit |

## Rationale — Warum Option A für v0

### 1. Minimales v0-Risiko

Pi ist bereits lokal beim Owner installiert und bestätigt. Option A dokumentiert nur diesen Zustand — es wird nichts Neues installiert, kein `npm install` ausgeführt, kein Dependency-Manager-Drift riskiert.

**Fakt:** Der Workspace funktioniert *derzeit* nicht mit Pi-Sessions (Option C — No Integration Yet). Option A bedeutet: wenn Smoke später ausgeführt wird, nutzt er die bereits bestätigte lokale Version.

### 2. Keine falschen Integration-Signale

Würde man Pi jetzt als devDependency in `package.json` hinzufügen, würde das suggerieren: "Pi ist Teil des Workspace-Builds." Das ist es noch nicht (Option C). Ein `package.json`-Eintrag ohne funktionierenden Smoke würde falsche Erwartung erzeugen.

**Fakt:** `package.json` ist Authority für Build-Voraussetzungen. Pi ist noch nicht eine Build-Voraussetzung; sie ist eine optionale lokale Execution Surface unter Vorbedingungen (P-01/P-04/Smoke).

### 3. Klare Versionsbindung ohne Auto-Update

Option A bindet explizit Pi Version `0.79.9` als beobachtete Versionserwartung. Diese Bindung ist **dokumentarisch**, nicht automatisch durchgesetzt, aber sie ist klar.

**Konsequenz:** Wenn später Smoke ausgeführt wird, muss verifiziert werden: `pi --version` == `0.79.9`. Falls Pi lokal aktualisiert wird, ist das ein bewusstes Upgrade, nicht ein stiller Drift durch `npm install`.

### 4. Deferred Integration-Komplexität

Option B (devDependency) und Option C (npx) bringen eigene Komplexitäten mit:
- **devDependency**: `npm install` im CI/CD, Lifecycle-Management, Plattform-spezifische Binaries (Pi ist Node.js CLI — Cross-Plattform komplexer)
- **npx**: Immer vom npm-Registry abhängig, Netzwerk-Risiko in CI, Versionsauflösungs-Fragen

Option A vermeidet diese Komplexitäten für v0. Sie können **später, nach Smoke-Verifikation** in P-04/P-12 Entscheidungen einfließen.

### 5. Audit-Freundlich für Smoke

Wenn Smoke-Readiness-Gate (kommend nach P-01) prüft, muss es verifizieren:
```bash
which pi
pi --version  # → 0.79.9
```

Option A-Dokumentation macht diese Checks zu einer klaren, expliziten Anforderung. Ein `package.json`-Eintrag würde diese Checks zu einem `npm install`-Check umwandeln — was für v0 unnötige Komplexität ist.

## Reproducibility Rule — v0

Für Pi-Sessions im Baum-OS Workspace v0 gilt:

1. **Pi-Verfügbarkeit prüfen**: `which pi` → Pfad muss bekannt sein (Standard: `/home/baum/.npm-global/bin/pi`)
2. **Pi-Version prüfen**: `pi --version` → muss `0.79.9` sein
3. **Provider-Verfügbarkeit prüfen**: `pi --list-models` → `anthropic`, `minimax`, `openai-codex` müssen sichtbar sein
4. **Keine automatic Installation**: Pi wird nicht durch `npm install` oder `npx` bereitgestellt — es muss vorab lokal installiert sein
5. **Voraussetzung für Smoke**: Diese Checks müssen erfolgreich sein, bevor P-03 Smoke-Ausführung startet

**Fail-Closed:** Falls `pi --version` einen anderen Wert zeigt oder `which pi` fehlschlägt, wird Smoke mit `blocked` und Fehlermeldung beendet.

## Local Prerequisite — v0

```bash
# Diese Checks müssen vor jeder Pi-Session erfolgen (Tier 0, no approval needed)

which pi
# Expected output: /home/baum/.npm-global/bin/pi (or similar absolute path)
# Status: checked in audit

pi --version
# Expected output: 0.79.9
# Status: checked in audit (pi binary not found in current workspace session)

pi --list-models
# Expected output includes: anthropic, minimax, openai-codex
# Expected output excludes or marks: google (not listed in pi --list-models)
# Status: not executed in this slice
```

Diese Checks sind dokumentarisch — nicht automatisch durchgesetzt. Sie definieren die v0-Erwartung.

## Relation To Integration Path Decision

| Integrations-Szenario | Pi Reproducibility Status |
|---|---|
| Option C — No Integration Yet (now) | Option A: doc-only, kein Code, kein Build-Binding |
| Option A — `runtime/surfaces/pi/` (future, P-12) | Option A → Option B (devDependency) oder A→C (npx); Entscheidung in P-12 |
| Option B — Pi Extension Host (deferred) | Option A bleibt, bis Extension-API verifiziert ist |

Diese Reproducibility-Entscheidung ist **orthogonal** zur Integrations-Path-Entscheidung (P-12). Option A (Prereq doc) ist mit allen zukünftigen Integrationspfaden kompatibel.

## Relation To Secret Boundary

Option A hat **kein Secret-Impakt**. Pi wird nicht via `npm install` oder CI/CD bereitgestellt — es gibt keinen automatisierten Secret-Loading-Pfad (noch nicht). Secrets bleiben Aufgabe der späteren Runtime-Integration (P-05 bereits dokumentiert, nur noch Verifikation nötig).

Secret-Handling-Regel bleibt: `.env` wird nicht committed, nicht gelesen in diesem Slice.

## Relation To Smoke Preconditions

| Precondition | Status | Erfüllt von Option A? |
|---|---|---|
| P-01 Workspace-Reproduzierbarkeit | **diese Entscheidung** | ✓ ja — dokumentiert |
| P-03 Sicherer Smoke-Befehl | dokumentiert | ✓ ja — per `pi-smoke-command-design.md` |
| P-04 Provider-Default | offen | später — abhängig von v1 Provider-Wahl |
| P-05 Secret-Handling | dokumentiert | ✓ ja — per `pi-secret-handling-spec.md` |
| P-06 Approval-Tiers | dokumentiert | ✓ ja — per `pi-execution-surface-policy.md` |

**P-01 Smoke-Readiness-Gate (kommend)** wird prüfen:
- Worktree clean
- `pi --version` == `0.79.9`
- Provider (`--list-models`) verfügbar
- Secrets nicht exponiert
- Smoke-Befehl Shape korrekt (`--no-tools --no-session --print`)

Option A-Dokumentation macht diese Checks zum Standard.

## Non-Goals

- keine Installation
- kein `npm install`
- kein `npm install -g pi` in diesem Slice
- keine `npx pi`-Nutzung
- keine `.env` lesen oder schreiben
- keine `.env.example` in diesem Slice
- keine `runtime/surfaces/pi/` anlegen
- keine `providers/pi/` anlegen
- keine Package-Datei ändern
- keine Contract-Änderung
- keine Validatoren
- keine Skills
- keine Secrets
- keine Pi-Session starten
- kein Smoke-Run
- keine Runtime-Aktivierung

## Recommended Next Gate

**P-01 Smoke-Readiness Gate** — vorbereitender Audit vor echtem Smoke-Run

Ziel:
1. Prüfen (read-only, keine Pi-Session): `which pi`, `pi --version`, `pi --list-models`
2. Verifizieren: `.env` im `.gitignore` oder nicht vorhanden
3. Verifizieren: Worktree clean, keine uncommitted changes
4. Verifizieren: Smoke-Befehl-Form ist korrekt (`--no-tools --no-session --print`)
5. Verifizieren: Keine Secrets im Befehl oder in Env-Dumps
6. Optional: Approval-Tier checken (Tier 0 für `--no-tools --print`, kein Human Approval nötig, aber Secret-Boundary gilt)

**Smoke-Freigabe-Status: nicht freigegeben.** In der aktuellen Ausführungsumgebung dieses Slices ist `which pi` nicht erfolgreich — Smoke-Readiness ist damit nicht gegeben, unabhängig von der historischen Owner-Host-Evidence.

Nächster Gate ist **P-04 Provider Default Decision** oder ein **Owner-Host Pi Availability Recheck** — nicht direkt P-03 Smoke.

P-03 Smoke-Run darf erst erfolgen, nachdem:
1. Pi im ausführenden Host verfügbar ist (`which pi`, `pi --version`, `pi --list-models` erfolgreich)
2. Provider-/Model-Default entschieden ist (P-04)
3. Secret Boundary bestätigt ist (P-05)
4. Worktree clean ist
5. Smoke-Befehl-Form korrekt ist (`--no-tools --no-session --print`)

Falls alle fünf Punkte erfüllt sind: P-03 Smoke-Run ist freigegeben.

Alternative nächster Schritt (falls P-04 Provider-Auswahl offener ist):
**P-04 Pi Provider Default Decision** → entscheidet, welcher Provider (`anthropic`, `minimax`, `openai-codex`) für Smoke genutzt wird → dann Owner-Host Pi Availability Recheck → P-01 Smoke-Readiness → P-03 Smoke-Run

## Verification

Nach Erstellung dieser Datei:

```bash
cd /sessions/practical-tender-sagan/mnt/workspace/baum-os/agentic_workflow/model-agnostic-workflow-system

# Verifiziere neue Datei
test -f docs/pi-workspace-reproducibility-decision.md && echo "DECISION_FILE_CREATED" || echo "DECISION_FILE_NOT_CREATED"

# Verifiziere keine unerwünschten Verzeichnisse angelegt
test -d providers/pi && echo "ERROR: providers/pi exists" || echo "OK: providers/pi not created"
test -d runtime/surfaces/pi && echo "ERROR: runtime/surfaces/pi exists" || echo "OK: runtime/surfaces/pi not created"

# Verifiziere keine Package-Änderungen
git diff package.json 2>&1 | head -5 || true

# Gesamtstatus
git status --short --untracked-files=all
```

## Recommended Commit

Falls Verification erfolgreich:

```bash
git add docs/pi-workspace-reproducibility-decision.md
git commit -m "docs: decide pi workspace reproducibility — option A external prerequisite for v0"
```

## Non-Decisions

Die folgenden Entscheidungen sind **nicht** Aufgabe dieses Slices und bleiben offen:

- P-04: Welcher Provider ist der Default für Pi-Workspace-Sessions? (anthropic, minimax, openai-codex — noch nicht entschieden)
- P-12: ist docs-only entschieden als **No Integration Yet**. Future-preferred path: `runtime/surfaces/pi/`. Der konkrete API-/Directory-Shape bleibt future work — noch nicht architekturiert.
- `.env.example`-Template: Welche Env-Var-Namen genau? (vertagt bis P-04)
- Extension Host: Ist Pi-Extension-API-Integration gewünscht? (deferred bis Evidence vorliegt)
- Upgrade-Strategie: Wann wird Pi von 0.79.9 auf eine neuere Version aktualisiert? (v0.x-Frage, nicht dieser Slice)

Alle diese Entscheidungen können nach P-01 in nachfolgenden Slices getroffen werden.

## References

- `docs/pi-local-runtime-evidence.md` (commit `c14bc52`)
- `docs/pi-execution-surface-policy.md` (commit `8c54da8`)
- `docs/pi-secret-handling-spec.md` (commit `6575eb4`)
- `docs/pi-smoke-command-design.md` (commit `79efe52`)
- `docs/pi-integration-path-decision.md` (commit `69545f0`)
- `docs/pi-provider-adapter-specification.md`
- `docs/pi-agent-kit-adapter-core-anchor-decision.md`
