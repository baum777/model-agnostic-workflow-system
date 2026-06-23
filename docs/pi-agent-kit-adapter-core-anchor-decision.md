# Pi-Agent-Kit Adapter Core Anchor Decision

Class: canonical (decision record).
Use rule: read this before proposing any `pi-agent-kit/` structure, any new Pi provider/runtime adapter, or any Skill-Contract / Computer-Use-Policy / Human-Approval work that touches Pi. Canonical contract truth remains `core/contracts/*`; canonical doc-class authority remains `docs/architecture.md` and `docs/authority-matrix.md`. This file records a structural decision, it does not introduce new contract or policy truth.

**Reklassifikation (2026-06-23):** Pi wurde lokal als `@earendil-works/pi-coding-agent@0.79.9` beobachtet. Pi ist Execution Surface / CLI-Agent-Runner — kein LLM-API-Provider. Das Adapter-Zielbild (Abschnitt unten) wurde entsprechend korrigiert. Canonical Evidence: `docs/pi-local-runtime-evidence.md`.

## Status

`proposed — Adapter-Zielbild reklassifiziert (siehe docs/pi-local-runtime-evidence.md, commit c14bc52)`

## Entscheidung

`model-agnostic-workflow-system` ist der Core-Anker für Baum-OS / Harness / Skill-, Provider- und Governance-Logik.

Pi-Agent-Kit wird **nicht** als eigener Parallelbaum (`pi-agent-kit/04_…10_…`) angelegt. Pi wird stattdessen perspektivisch als dünne Adapter-/Runtime-Schicht über diesem Core angebunden, analog zu den bestehenden Provider-Scaffolds unter `providers/`.

## Begründung

- Bestehende Runtime-, Contract-, Provider-, Skill- und Policy-Strukturen sind hier bereits vorhanden und gepflegt (`runtime/`, `core/contracts/*`, `providers/<name>/`, `skills/<name>/SKILL.md`, `policies/*.yaml`).
- Skill-Frontmatter-Schema (`name`, `description`, `version`, `classification`, `input_contract_path`, …) und vorhandene Validator-Skripte (`scripts/tools/validate-*.mjs`) liegen näher am geforderten Skill-Vertrag als ein Neubau.
- Das System ist explizit provider-neutral designed (`core-registry.json`: `"status": "provider-neutral"`) und behandelt Claude, Codex und Minimax bereits gleichrangig als Adapter (`status: "adapter"` in `core/contracts/core-registry.json`).
- Ein neuer `pi-agent-kit/`-Baum würde Skill-Schema, Provider-Adapter-Muster, Secret-/Tool-Policies und Verifikationslogik duplizieren, die hier bereits evidenzbasiert (Validator-gestützt) existieren.
- Pi passt strukturell in das bestehende Provider-Adapter-Muster (`providers/<name>/README.md` + `export.json`) und ist damit eher ein weiterer Runtime-Adapter als ein eigenes Governance-Trägersystem.

## Nicht-Ziele

- Kein neues `pi-agent-kit/04_…10_…`.
- Keine Skill-Schema-Migration in diesem Slice.
- Keine Provider-Implementierung (kein `providers/pi/` wird in diesem Slice angelegt).
- Keine Computer-Use-Aktivierung.
- Keine Human-Approval-Brücke in diesem Slice.
- Keine Runtime-/Scheduler-/Watcher-/Daemon-Änderung.

## Adapter-Zielbild

**Korrektur:** Pi ist kein `providers/<name>`-Kandidat. Pi ist eine Execution Surface / CLI-Agent-Runner.

- Pi: lokal beobachtet als `@earendil-works/pi-coding-agent@0.79.9` (global installiert, nicht workspace-lokal). Zielschicht: `runtime/surfaces/pi/` oder Extension Host — **nicht `providers/pi/`**. Canonical Evidence: `docs/pi-local-runtime-evidence.md`.
- Minimax, Anthropic, OpenAI-Codex: die LLM-Provider, die Pi selbst als Backends nutzt (`pi --list-models`). Diese gehören in `providers/<name>/`. Pi ist keiner davon.
- Minimax 3 / MiniMax-M3: beobachtbar als Pi-Backend-Provider (`pi --list-models` zeigt `minimax` als Provider-Slot) — aber MiniMax ist Pi's Provider, nicht Pi's Runtime-Identity im Core.
- Claude lokal: Architektur-, Review- und Abschlussinstanz außerhalb von Pi.
- Claude in Pi: via `pi --provider anthropic --model claude-sonnet-4-6` lokal ausführbar (beobachtet) — kein `providers/pi/`-Eintrag nötig dafür.
- Codex: Coding-/Repo-Agent oder Provider-Adapter (`providers/openai-codex/`), keine unkontrollierte Autonomie-Eskalation.
- Human Approval: bleibt finale Freigabeinstanz für riskante Schreib-, Credential-, Produktions- und Computer-Use-Aktionen — auch für Pi-Sessions.
- Verifier: bleibt an Policy, Tests und Evidence gebunden, nicht an ein einzelnes Modellurteil.

## Offene Gaps

- `allowed_agents`
- `allowed_models`
- `write_mode`
- `computer-use-policy`
- Human-Approval-Brücke zwischen dem prosa-basierten Tier-Modell (`docs/architecture.md`) und der technischen Review-Policy-Schicht (separates TS-Package, außerhalb dieses Repos)
- optional: `skill_id`, `forbidden_paths`, `log_target`, `last_reviewed`

## Nächster Gate

**Pi Execution Surface Reklassifikation abgeschlossen** (dieser Slice + `docs/pi-local-runtime-evidence.md`, commit `c14bc52`).

Nächste mögliche Schritte — alle docs-only, kein Runtime-Code:

- **Pi Execution Surface Integration Slice**: `runtime/surfaces/pi/` planen, wenn workspace-lokale Pi-Konfiguration und Smoke-Befehl ohne Secrets vorliegen.
- **Skill-Contract-Gap-Dokument**: Feld-für-Feld-Erweiterungsvorschlag für `allowed_agents` / `allowed_models` / `write_mode` — unabhängig von Pi, für alle Execution-Surfaces nötig.
- **Computer-Use-Policy-Entwurf**: aktuell in keinem der geprüften Systeme vorhanden — gilt auch für Pi-Sessions (Pi kann `bash`).

Nicht mehr empfohlen: eine Pi-Provider-Adapter-Spezifikation nach dem Muster von `providers/minimax/README.md` — Begründung: Kategoriefehler, Pi ist kein LLM-Provider (dokumentiert in `docs/pi-local-runtime-evidence.md`).
