# Pi Runtime Surface Skeleton Decision

## Class

derived / docs-only / runtime-surface decision

## Status

accepted for next docs-only skeleton slice — no runtime execution

## Decision

```text
Decision: allow creation of docs-only runtime/surfaces/pi/ skeleton in a separate next slice.
```

## Rationale

### Pi ist Execution Surface, kein Provider

Pi (`@earendil-works/pi-coding-agent@0.79.9`) ist ein CLI-Agent-Runner, der LLM-Provider
(minimax, openai-codex, anthropic) als Backends nutzt. Es hat keine HTTP-API-Surface,
kein Base-URL, kein Auth-Schema nach Adapter-Muster. Canonical Evidence: `docs/pi-local-runtime-evidence.md`.

`providers/pi/` ist Kategoriefehler und bleibt permanent gesperrt.
`runtime/surfaces/pi/` ist der architektonisch korrekte Layer für Execution Surfaces.

### Smoke Evidence liegt vor

Vier Tier-0-Smokes wurden auf dem persistenten Owner-Host (baum-Latitude-3440) ausgeführt.
Kanonisches Evidence-Dokument: `docs/pi-smoke-run-evidence.md` (commit `bdcc4b5`).

Relevanter Run:
```text
provider:         minimax
model:            MiniMax-M3
observed_output:  PI_SMOKE_OK
marker_found:     true
exit_code:        0
secrets_in_command: none
secrets_in_output:  none
.env_read:        no
host:             baum-Latitude-3440
timestamp_utc:    2026-06-24
```

### Sandbox Policy ist accepted

`docs/pi-harness-sandbox-working-plan.md` wurde als Policy-Vorstufe akzeptiert (commit `43b68b5`).
Sandbox-Zonen S0–S4, Evidence-Contract, Subagent-Grenzen, Promotion-Regeln und DENY_ALWAYS-Liste
sind verbindlich dokumentiert.

### Alle Blockers aus pi-integration-path-decision.md aufgelöst

| Blocker | Auflösung |
|---------|-----------|
| P-01 Workspace Reproducibility | Option A (external prerequisite) — commit `b3e1295` |
| P-04 Provider Default | minimax/MiniMax-M3 — commits `ef28823`, `bdcc4b5` |
| Smoke-Run mit Evidence | PI_SMOKE_OK, exit 0 — commit `bdcc4b5` |
| Approval-Tier-Mapping | `docs/pi-execution-surface-policy.md` |
| Secret-Boundary | `docs/pi-secret-handling-spec.md` |
| Sandbox Policy | accepted — commit `43b68b5` |

### runtime/surfaces/pi/ ist jetzt als Dokumentationssurface gerechtfertigt

Die ursprüngliche Blocking-Bedingung aus `docs/pi-integration-path-decision.md` lautete:
"Dieser Pfad darf erst entstehen, wenn alle Preconditions erfüllt sind." Diese Bedingung ist
jetzt erfüllt. `runtime/surfaces/pi/` darf im nächsten Slice als docs-only Skeleton angelegt
werden.

**Keine Runtime-Ausführung in diesem Slice.** Dieser Slice entscheidet nur.
Der nächste Slice darf das Skeleton mit explizitem Write-Scope anlegen.

## Allowed Future Skeleton

Nur als Zukunftsstruktur dokumentiert — nicht in diesem Slice anlegen:

```text
runtime/surfaces/pi/
├── README.md
├── smoke-command.md
├── evidence-contract.md
├── session-policy.md
└── handoff.md
```

## File Responsibilities

| Datei | Inhalt / Zweck |
|-------|----------------|
| `README.md` | Rolle und Grenzen von Pi als Execution Surface; Pi-Version; Provider-Default-Ref; Kategoriefehler-Verweis; Surface-Classification |
| `smoke-command.md` | Erlaubter Tier-0 Smoke-Command; Evidence-Contract-Pflichtfelder; Secret-Boundary; Forbidden Patterns |
| `evidence-contract.md` | Erlaubte und verbotene Evidence-Felder; Secret-Redaction-Regeln; Timestamp-/Exit-Code-/Marker-Pflicht; was ein Pi-Run-Output enthalten darf und muss |
| `session-policy.md` | Tool-/Approval-Tier-Mapping; Provider-Default (minimax/MiniMax-M3); Secret-Loading-Ref; Scope-Anforderungen; Fail-Closed-Regel |
| `handoff.md` | Result-/Scope-/Risk-/Next-Gate-Format für Übergaben zwischen Slices; Evidence-Paket-Template |

## Still Forbidden

```text
providers/pi/
adapter.mjs
export.json
core-registry entry
runtime code
Pi execution in docs-only slices
open-ended Pi sessions
--api-key flag
secrets in command or output
.env reading
bash/edit/write without explicit S2/S3 approval
npm install
npx (except explicitly scoped)
```

## Preconditions For Next Slice

1. Worktree enthält nur klassifizierte untracked Handover-Artefakte — kein staged oder modifizierter unklarer State.
2. `runtime/surfaces/pi/` existiert noch nicht zu Beginn des nächsten Slices.
3. Der nächste Slice muss einen expliziten Write-Scope auf genau die fünf Skeleton-Dateien haben — keine andere Datei.
4. Kein Code — alle fünf Dateien sind Markdown-Dokumentation.
5. Kein Smoke-Run im Skeleton-Slice.
6. Kein Provider-Call.
7. Keine Secrets lesen oder schreiben.
8. Kein `providers/pi/`.
9. Kein `git add .` oder `git add -A` — jede Datei explizit stagen.
10. Evidence-Paket nach Erstellung: `git diff --name-only` zeigt exakt die Skeleton-Dateien.

## Relation To Existing Pi Docs

| Dokument | Relation |
|----------|----------|
| `docs/pi-integration-path-decision.md` | Entschied Option C (No Integration Yet) mit Option A als Zukunftspfad — alle Blockers jetzt aufgelöst |
| `docs/pi-smoke-run-evidence.md` | Kanonische Smoke-Evidence für Gate 1+2 |
| `docs/pi-harness-sandbox-working-plan.md` | Accepted Policy-Vorstufe; S0–S4-Zonen und Evidence-Contract gelten für Skeleton-Slice |
| `docs/pi-execution-surface-policy.md` | Tier-Mapping für Skeleton-Slice (S1-Scope, kein Commit ohne Verification) |
| `docs/pi-secret-handling-spec.md` | Secret-Boundary für alle Skeleton-Dateien |
| `docs/pi-execution-environment-boundary-decision.md` | Owner-Host-only; Cowork darf anlegen, nicht ausführen |
| `docs/pi-workspace-reproducibility-decision.md` | Option A: Pi als external prerequisite — kein package.json-Eintrag nötig |
| `docs/pi-provider-default-decision.md` | minimax/MiniMax-M3 als Default für session-policy.md |

## Non-Goals

- keine Runtime-Integration
- kein `runtime/surfaces/pi/` in diesem Slice
- kein `providers/pi/`
- kein Smoke-Run
- keine Pi-Session
- keine Installation (`npm install`, `npx`)
- keine `.env.example`
- keine Validatoren
- keine Contracts
- keine Vault-Schreibrechte
- kein Adapter-Code
- kein Runtime-Code irgendeiner Art

## Recommended Next Gate

```text
Pi Runtime Surface Skeleton Creation Slice
```

Ziel:
- `runtime/surfaces/pi/` anlegen (als neues Verzeichnis)
- Genau fünf Markdown-Dateien erstellen: `README.md`, `smoke-command.md`, `evidence-contract.md`, `session-policy.md`, `handoff.md`
- Keine Runtime-Ausführung
- Keine Contracts/Provider/Skills/Validatoren ändern
- Expliziter Write-Scope: nur `runtime/surfaces/pi/`
- Evidence: `git diff --name-only` zeigt exakt die fünf Dateien
- Commit: `docs: create pi runtime surface skeleton`

Basis-Inhalt für jede Datei leitet sich ab aus:
- `docs/pi-execution-surface-policy.md` (Tier-Mapping → session-policy.md)
- `docs/pi-smoke-command-design.md` (Smoke-Shape → smoke-command.md)
- `docs/pi-smoke-run-evidence.md` (Evidence-Felder → evidence-contract.md)
- `docs/pi-harness-sandbox-working-plan.md` (Zone-Model, handoff.md)
- `docs/pi-provider-default-decision.md` (minimax/MiniMax-M3 → session-policy.md)
