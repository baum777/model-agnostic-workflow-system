---
zone: template-source
authority: operational
source_path: wiki-overlay/template-map.md
llm_processing: yes
summary_allowed: review-only
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: contract-backed
status: active
canonical_source: core/contracts/
review_gate: none
notes: "Pointer-only template and example map; templates are operational scaffolds, examples are derived references, and canonical contract truth remains in core/contracts/."
generated_at: "2026-05-09T05:19:13+02:00"
overlay_spec_version: "1.0"
---

# Template Map

> non-migrating overlay · no original file edits · pointer-only index

## Zweck

Diese Overlay-Datei routet Template- und Example-Pfade ohne Migration, Umbenennung oder Inhaltskopie. Sie trennt operational Templates, derived Examples und canonical Contract Truth nur als Pointer.

## Scope

- **Zonen**: `template-source`, `derived-knowledge`, `canonical-source`, `exclude-from-llm-context`
- **Authority-Klassen**: `operational`, `derived`, `canonical`
- **Ausgeschlossen**: `.git/`, `.codex/`, echte `.env*`, `.env.example`, raw runtime artifacts, operator memory, private logs, nicht freigegebene project imports, generated JSON full copies
- **Fokus**: `templates/codex-workflow/` als operational Template-Fläche, `examples/` als derived Referenzfläche, `core/contracts/` nur als canonical Pointer

## Map / Entries

| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `templates/codex-workflow/README.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Template-Index und Routing-Einstieg; keine kanonische Contract Truth. |
| `templates/codex-workflow/task-packet-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Operator-facing Scaffold fuer Planning-Slices. |
| `templates/codex-workflow/review-summary-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Operator-facing Scaffold fuer Review-/Validation-Zusammenfassungen. |
| `templates/codex-workflow/handoff-summary-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Operator-facing Scaffold fuer Handoff-Zusammenfassungen. |
| `templates/codex-workflow/validation-checklist-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Operator-facing Checklist-Scaffold; keine Promotion zu canonical. |
| `templates/codex-workflow/tool-contract-template.json` | `template-source` | `operational` | `metadata-only` | `yes` | `none` | JSON-Template nur als Pfad/Metadaten referenzieren, nicht als Prosa-Ersatz kopieren. |
| `examples/codex-workflow/README.md` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | Example-Index fuer Workflow-Beispiele; nicht canonical. |
| `examples/codex-workflow/planning-slice-example.md` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | Beispielartefakt fuer Planning-Kontext; nicht als Vorlage promoten. |
| `examples/codex-workflow/review-summary-example.md` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | Beispielartefakt fuer Review-Kontext; nicht als Vorlage promoten. |
| `examples/codex-workflow/handoff-summary-example.md` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | Beispielartefakt fuer Handoff-Kontext; nicht als Vorlage promoten. |
| `examples/codex-workflow/tool-contract-example.json` | `derived-knowledge` | `derived` | `metadata-only` | `yes` | `none` | JSON-Example nur als Pfad/Metadaten referenzieren. |
| `examples/mahp/` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | Domain-spezifische Example-Fläche; keine canonical Template-Quelle. |
| `examples/rgc/` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | Domain-spezifische Example-Fläche; keine canonical Template-Quelle. |
| `examples/tsc/` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | Domain-spezifische Example-Fläche; keine canonical Template-Quelle. |
| `examples/snake/` | `derived-knowledge` | `derived` | `pointer-only` | `yes` | `none` | App-/implementation-nahes Example; nicht mit Workflow-Templates vermischen. |
| `core/contracts/` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical Contract Truth nur per Pointer; keine Contract-Inhalte in dieses Overlay kopieren. |
| `core/contracts/output-contracts.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical Pointer fuer Output-Contract-Wahrheit. |
| `core/contracts/workflow-routing-map.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical Pointer fuer Workflow-Routing-Wahrheit. |
| `core/contracts/tool-contracts/catalog.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical Pointer fuer Tool-Contract-Katalog. |

## Explicit Exclusions

| Pattern / Path | LLM-readable | Summary allowed | Wiki allowed | Reason |
|---|---|---|---|---|
| `.git/` | `no` | `no` | `no` | Repository internals bleiben hard-excluded. |
| `.codex/` | `no` | `no` | `no` | Lokale Agenten-/Runtime-nahe Flaeche bleibt hard-excluded. |
| `.env*` | `no` | `no` | `no` | Echte Environment-Dateien koennen Secrets enthalten. |
| `.env.example` | `no` | `no` | `no` | Secret-nahe Template-Flaeche bleibt ausgeschlossen, auch wenn beispielhaft. |
| `templates/**/.env.example` | `no` | `no` | `no` | Keine Uebernahme oder Zusammenfassung secret-naher Template-Pfade. |
| `examples/**/.env*` | `no` | `no` | `no` | Keine Verarbeitung potentiell lokaler oder secret-naher Example-Konfiguration. |
| `artifacts/runtime-runs/*` | `no` | `no` | `no` | Raw runtime artifacts sind nicht Teil dieser Template-Map. |
| generated JSON full copies | `no` | `no` | `no` | JSON darf hier nur metadata-only/pointer-only erscheinen. |
| private logs | `no` | `no` | `no` | Private oder personenbezogene Logs gehoeren nicht in das Overlay. |
| nicht freigegebene project imports | `no` | `no` | `no` | Externe Imports brauchen explizite Freigabe vor Kontextaufnahme. |

## Pointer-Only References

- `Template Index` -> `templates/codex-workflow/README.md` - operational Einstieg in Codex-Workflow-Templates.
- `Task Packet Template` -> `templates/codex-workflow/task-packet-template.md` - Scaffold-Pointer fuer Planning-Artefakte.
- `Review Summary Template` -> `templates/codex-workflow/review-summary-template.md` - Scaffold-Pointer fuer Review-Artefakte.
- `Handoff Summary Template` -> `templates/codex-workflow/handoff-summary-template.md` - Scaffold-Pointer fuer Handoff-Artefakte.
- `Validation Checklist Template` -> `templates/codex-workflow/validation-checklist-template.md` - Scaffold-Pointer fuer Validierungschecklisten.
- `Tool Contract Template` -> `templates/codex-workflow/tool-contract-template.json` - metadata-only JSON-Template-Pointer.
- `Workflow Examples Index` -> `examples/codex-workflow/README.md` - derived Example-Einstieg.
- `Planning Slice Example` -> `examples/codex-workflow/planning-slice-example.md` - derived Example-Pointer.
- `Review Summary Example` -> `examples/codex-workflow/review-summary-example.md` - derived Example-Pointer.
- `Handoff Summary Example` -> `examples/codex-workflow/handoff-summary-example.md` - derived Example-Pointer.
- `Tool Contract Example` -> `examples/codex-workflow/tool-contract-example.json` - metadata-only JSON-Example-Pointer.
- `Example Domains` -> `examples/` - derived Example-Sammlung mit separater Review-Grenze.
- `Canonical Contracts` -> `core/contracts/` - canonical Pointer, keine Inhaltskopie.
- `Output Contracts` -> `core/contracts/output-contracts.json` - canonical metadata-only Pointer.
- `Workflow Routing Map` -> `core/contracts/workflow-routing-map.json` - canonical metadata-only Pointer.
- `Tool Contract Catalog` -> `core/contracts/tool-contracts/catalog.json` - canonical metadata-only Pointer.

## Open / Review-Required

- [ ] Entscheiden, ob `examples/mahp/`, `examples/rgc/`, `examples/tsc/` und `examples/snake/` eigene Domain-Maps erhalten sollen.
- [ ] Entscheiden, ob JSON-Template- und JSON-Example-Pfade dauerhaft `metadata-only` bleiben oder fuer einzelne Validierungsjobs separat freigegeben werden.
- [ ] Entscheiden, ob canonical Contract Pointer in einer spaeteren `contract-map.md` feiner nach Contract-Typ gruppiert werden sollen.
- [ ] Pruefen, ob zusaetzliche secret-nahe Template-Dateien ausserhalb der hier gelisteten Quellen existieren, bevor ein breiterer Overlay-Generator genutzt wird.

## Changelog

- `2026-05-09`: initial proposed - Codex Overlay-Generator, pointer-only und non-migrating.
