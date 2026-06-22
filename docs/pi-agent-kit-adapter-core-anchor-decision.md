# Pi-Agent-Kit Adapter Core Anchor Decision

Class: canonical (decision record).
Use rule: read this before proposing any `pi-agent-kit/` structure, any new Pi provider/runtime adapter, or any Skill-Contract / Computer-Use-Policy / Human-Approval work that touches Pi. Canonical contract truth remains `core/contracts/*`; canonical doc-class authority remains `docs/architecture.md` and `docs/authority-matrix.md`. This file records a structural decision, it does not introduce new contract or policy truth.

## Status

`proposed`

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

- Pi: zukünftiger Provider-/Runtime-Adapter-Kandidat unter `providers/pi/` (noch nicht angelegt).
- Minimax 3: Pi-Runtime-Provider / Default-Kandidat, keine Core-Wahrheit (bereits so dokumentiert in `providers/minimax/`).
- Claude lokal: Architektur-, Review- und Abschlussinstanz außerhalb von Pi.
- Claude in Pi: nur falls lokal belegbar — aktuell nicht belegt (keine Pi-Laufzeitkonfiguration im Workspace gefunden).
- Codex: Coding-/Repo-Agent oder Provider-Adapter (`providers/openai-codex/`), keine unkontrollierte Autonomie-Eskalation.
- Human Approval: bleibt finale Freigabeinstanz für riskante Schreib-, Credential-, Produktions- und Computer-Use-Aktionen.
- Verifier: bleibt an Policy, Tests und Evidence gebunden, nicht an ein einzelnes Modellurteil.

## Offene Gaps

- `allowed_agents`
- `allowed_models`
- `write_mode`
- `computer-use-policy`
- Human-Approval-Brücke zwischen dem prosa-basierten Tier-Modell (`docs/architecture.md`) und der technischen Review-Policy-Schicht (separates TS-Package, außerhalb dieses Repos)
- optional: `skill_id`, `forbidden_paths`, `log_target`, `last_reviewed`

## Nächster Gate

Ein separater, kleiner docs-only Slice — noch keine Umsetzung:

- entweder ein Skill-Contract-Gap-Dokument (Feld-für-Feld-Erweiterungsvorschlag für das bestehende SKILL.md-Schema),
- oder ein Computer-Use-Policy-Entwurf (aktuell in keinem der geprüften Systeme vorhanden),
- oder eine Pi-Provider-Adapter-Spezifikation nach dem Muster von `providers/minimax/README.md`.
