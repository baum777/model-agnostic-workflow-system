# Pi Execution Surface Policy

## Class
governance / docs-only / execution-surface-policy

## Status
proposed — not runtime-enforced

## Use rule
Dieses Dokument definiert Approval-Tiers und Verwendungsgrenzen für Pi-Sessions, wenn Pi als lokale Execution Surface genutzt wird.
Es aktiviert keine Runtime-Fähigkeit, erzeugt keinen Provider und ändert keine Contracts.
Canonical authority bleibt:
- `docs/human-approval-tier-extension.md` (Tier-Modell)
- `docs/computer-use-policy.md` (Computer-Use-Policy)
- `docs/pi-local-runtime-evidence.md` (Evidence-Basis, commit `c14bc52`)
- `core/contracts/permission-boundary.json` (Contract-Wahrheit)
- `AGENTS.md` und `WORKFLOW.md` (Execution-Claim-Policy)

Lies dieses Dokument vor jeder Pi-Session, die mehr als `--no-tools` oder `--tools read` verwendet.

## Purpose

Pi (`@earendil-works/pi-coding-agent@0.79.9`) ist eine lokale Execution Surface — ein CLI-Agent-Runner mit Tools wie `read`, `bash`, `edit`, `write` und MCP. Diese Tools haben unterschiedliche Risikoniveaus. Dieses Dokument ordnet Pi-Capabilities den Approval-Tiers aus `docs/human-approval-tier-extension.md` zu und schließt damit Blocker **P-06** aus dem Pi Preconditions Audit.

Pi ist kein LLM-Provider. `providers/pi/` ist explizit verboten (Kategoriefehler, dokumentiert in `docs/pi-local-runtime-evidence.md` und `docs/pi-provider-adapter-specification.md`).

## Pi Tool Inventory

Beobachtet aus `pi --help` (version `0.79.9`):

| Tool | Funktion | Risikostufe |
|---|---|---|
| `read` | Dateien und Verzeichnisse lesen | niedrig |
| `bash` | Shell-Befehle ausführen | variabel — abhängig vom Befehl |
| `edit` | Dateien im Workspace verändern | mittel–hoch |
| `write` | Dateien im Workspace erstellen/überschreiben | mittel–hoch |
| MCP (`--mcp-config`) | Typed, scoped tool calls via MCP | abhängig vom MCP-Tool |
| Provider-Routing (`--provider`, `--model`) | Wählt Backend-LLM | niedrig für Routing selbst |

Pi kann Tools über `--tools`, `--no-tools`, `--exclude-tools` eingrenzen. Diese Flags sind zentral für die Tier-Zuweisung.

## Approval-Tier-Mapping

Basierend auf `docs/human-approval-tier-extension.md` (Tiers 0–4):

| Pi-Nutzungsform | Tools aktiv | Tier | Tier-Name | Human Approval |
|---|---|---|---|---|
| Reines Lesen / Analyse | `--no-tools` oder `--tools read` | **0** | `read_only` | nicht nötig |
| Lesen + ungefährliche bash-Befehle (nicht-mutierend: `ls`, `cat`, `git log`, `git diff`, `git status`) | `read` + eingeschränktes `bash` | **0–1** | `read_only` / `draft_only` | optional |
| Draft / Vorschlag ohne Ausführung | alle Tools, aber keine Schreibaktion tatsächlich ausgeführt | **1** | `draft_only` | optional |
| Dateien im Workspace editieren oder erstellen (`edit`, `write`) | `edit` oder `write` | **2** | `approved_write` | **erforderlich** |
| Bash mit schreibenden Operationen (z. B. `git add`, `git commit`, `mkdir`, `npm install`, Datei löschen) | `bash` mit Mutation | **2** | `approved_write` | **erforderlich** |
| Bash mit produktiven / sensitiven Operationen (Deploy, `rm -rf`, Credential-Befehle, produktive API-Calls) | `bash` mit sensitiver Op | **3** | `sensitive_action` | **immer erforderlich** |
| Computer-Use über Pi (Browser, Desktop-Automation) | Computer-Use | **3+** | `sensitive_action` | **immer erforderlich** — zusätzlich per `docs/computer-use-policy.md` |
| Pi-Session ohne definierten Scope oder offenendige Autonomie | beliebig | **4** | `forbidden_or_blocked` | **nicht ausführen** |
| Pi-Session mit Zugriff auf Secrets, Credentials, Vault-Write | beliebig | **4** | `forbidden_or_blocked` | **nicht ausführen** |

## Bash-Sonderregel

`bash` in Pi ist nicht dasselbe wie Computer-Use (per `docs/computer-use-policy.md`: Computer-Use = direkte UI/Desktop-Kontrolle). `bash` ist CLI-Ausführung — in der Preferred Interface Order (`computer-use-policy.md`) auf Stufe 2 (CLI, deterministic, scriptable), nicht auf Stufe 7 (Computer-Use as fallback).

Dennoch gilt: `bash` in Pi kann schreibende, produktive und irreversible Operationen ausführen. Deshalb:

- **Nicht-mutierende bash-Befehle** (Output-only: `ls`, `cat`, `git log`, `grep`, `find`, `echo`, `which`, `pi --version`): Tier 0
- **Mutierende bash-Befehle** (Zustandsänderung im Workspace: `git add`, `git commit`, `mkdir`, `mv`, `npm install`, `rm`): Tier 2 — `approved_write` erforderlich
- **Sensitive bash-Befehle** (produktive Systeme, Credentials, Deployment, `rm -rf`, irreversible Ops): Tier 3 — `sensitive_action`, immer Human Approval

Zweifelhafte Befehle werden als Tier 3 behandelt (fail closed).

## Approval-Regeln für Pi-Sessions

1. **Scope vor Session**: Eine Pi-Session muss vor dem Start einen klar definierten Scope haben: Aufgabe, erwartete Tools, Zielpfad. Keine open-ended Pi-Sessions.
2. **Approval ist scoped und einmalig**: Eine Freigabe gilt für genau diese Aufgabe, diesen Pfad, diesen Befehlssatz. Sie erstreckt sich nicht auf folgende Sessions oder verwandte Aufgaben.
3. **Pi genehmigt sich nicht selbst**: Pi darf keine Schreibaktion mit `applied` oder `approved` melden, für die keine vorherige Human-Freigabe vorlag.
4. **`verified` ≠ `approved`**: Pi kann Evidence liefern (Logs, Diffs, Run-Output) — das ist `verified`. `approved` ist eine menschliche Freigabeentscheidung, die vor der Aktion vorliegen muss.
5. **Keine Privilege-Eskalation**: Pi darf sich selbst keine höheren Rechte geben, keine anderen Agenten auf höhere Tiers stufen und keine Standing-Grants beanspruchen.
6. **Fail closed**: Wenn Scope, Tier oder Seiteneffekt einer Pi-Aktion unklar ist, stoppt Pi mit `blocked` und nennt, was fehlt.

## Relation To Computer-Use Policy

`docs/computer-use-policy.md` gilt additiv. Falls Pi Computer-Use-Fähigkeiten nutzt:

- Preferred Interface Order bleibt: MCP → CLI (`bash`) → API → Local files → Browser-Use → Deterministic handlers → Computer-Use
- Computer-Use in Pi ist immer Tier 3 (`sensitive_action`) und braucht zusätzlich die explizite, scoped, one-off Approval per `computer-use-policy.md` — über die Pi-Session-Approval hinaus
- `computer_use_allowed: false` ist der Default für Pi-Sessions bis explizit beantragt und freigegeben

## Relation To Permission Boundary

`core/contracts/permission-boundary.json` (`runtimeStatus: deferred`, `adoptionMode: opt-in`) enthält `human_gate.request` als Permission-Kategorie. Für Pi-Sessions gilt:

- Tier-2-Aktionen (`approved_write`) entsprechen konzeptionell einem `human_gate.request` mit `scope: own-run`
- Tier-3-Aktionen (`sensitive_action`) erfordern `human_gate.request` mit explizitem Evidence-Step
- Kein Pi-Adapter existiert aktuell — diese Zuordnung ist eine Governance-Projektion, kein implementiertes Binding

## Relation To Skill Contracts

- Skills steuern, welche Aktionen Pi in einer Session ausführen darf — sofern Skills später als Pi-Execution-Contracts definiert werden
- `write_mode` (Proposal in `docs/skill-schema-extension-proposal.md`) würde das Tier direkt deklarieren: `read_only` → Tier 0, `draft_only` → Tier 1, `approved_write` → Tier 2
- Bis `write_mode` implementiert ist, gilt dieses Dokument als prosa-basierter Governance-Rahmen

## What Pi Must Not Do

```text
Pi darf nicht:
- Schreib- oder bash-Aktionen ohne vorherige Human-Freigabe mit Tier ≥ 2 ausführen
- Sich selbst Approval erteilen oder behaupten
- Secrets, API-Keys oder Credentials lesen, anzeigen oder in Prompts einfügen
- Produktive/Deployment-Aktionen ohne Tier-3-Approval ausführen
- Computer-Use ohne computer-use-policy.md-konforme Approval starten
- Open-ended Sessions ohne definierten Scope beginnen
- Andere Agenten auf höhere Tiers stufen
- Core Contracts, Skills, Validatoren oder Policies eigenständig ändern
- providers/pi/ anlegen
- runtime/surfaces/pi/ ohne explizite Architekturentscheidung anlegen
```

## Runtime Status

Diese Datei ist `prose-governed`. Es existiert kein Validator, kein Enforcer und keine Runtime-Implementierung. Sie definiert die Governance-Grenzen für zukünftige Pi-Integration — sie aktiviert keine Pi-Fähigkeit.

Aktueller Integrationsstatus: **Option C — No Integration Yet** (per Pi Preconditions Audit). Dieses Dokument schließt Blocker P-06. Weitere Blocker (P-05: Secret-Handling) bleiben offen.

## Non-Goals

- kein Code
- kein `providers/pi/`
- kein `runtime/surfaces/pi/`
- keine Contract-Änderung
- keine Skill-Migration
- keine Validator-Implementierung
- keine Runtime-Aktivierung
- keine Secrets
- keine Human-Approval-Automatisierung

## Preconditions Audit Reference

Schließt: **P-06** (Approval-Tier für Pi-Sessions mit `bash`, `edit`, `write`) aus dem Pi Execution Surface Integration Preconditions Audit.

Noch offen:
- P-05 Secret-Handling (`--api-key` Flag, `.env.example`-Strategie)
- P-01 Workspace-Reproduzierbarkeit (`package.json` Eintrag)
- P-03 Sicherer Smoke-Befehl ohne Secrets
- P-12 Architekturentscheidung `runtime/surfaces/pi/` vs. Extension Host

## Recommended Next Gate

**Pi Secret-Handling-Spec** — schließt Blocker P-05:

Dokumentiert, wie Pi-API-Keys ohne Shell-History-Risiko bereitgestellt werden (`ANTHROPIC_API_KEY`/`MINIMAX_API_KEY` via `.env`-Datei, nicht via `--api-key` Flag), und erstellt eine `.env.example`-Vorlage für Pi-Sessions ohne echte Werte.
