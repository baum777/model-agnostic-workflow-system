---
zone: operational-playbook
authority: operational
source_path: wiki-overlay/workflow-map.md
llm_processing: yes
summary_allowed: yes
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: contract-backed
status: active
canonical_source: WORKFLOW.md
review_gate: none
notes: "Pointer-only workflow map separating workflow classes, gates, and template pointers; contract JSON used metadata-only."
generated_at: "2026-05-09T05:03:53+02:00"
overlay_spec_version: "1.0"
---

# Workflow Map

> non-migrating overlay · no original file edits · pointer-only index

## Zweck
Diese Datei verbindet Workflow-Klassen mit Gate- und Template-Pointern, ohne Contract-JSON oder Templates als Prosa zu kopieren. `core/contracts/workflow-routing-map.json` wird nur metadata-only genutzt.

## Scope
- **Zonen**: `canonical-source`, `operational-playbook`, `template-source`, `derived-knowledge`, `generated-output`
- **Authority-Klassen**: `canonical`, `operational`, `derived`, `generated`
- **Ausgeschlossen**: `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs, generated JSON exports als Volltext, nicht freigegebene project imports.
- **Contract-JSON-Regel**: `core/contracts/workflow-routing-map.json` ist metadata-only; diese Datei ersetzt den Contract nicht.

## Map / Entries
| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `WORKFLOW.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Root workflow taxonomy and phase order. |
| `docs/workflows/README.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Workflow deep-dive entrypoint; extends `WORKFLOW.md` without replacing it. |
| `docs/workflows/implementation-and-handoff.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Class-level implementation and handoff posture. |
| `docs/workflows/verification-and-certification.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Class-level verification and certification posture. |
| `templates/codex-workflow/README.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Template index; operator-facing scaffold map. |
| `templates/codex-workflow/task-packet-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Planning / task packet scaffold. |
| `templates/codex-workflow/review-summary-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Review / validation / certification scaffold. |
| `templates/codex-workflow/handoff-summary-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Run / handoff summary scaffold. |
| `templates/codex-workflow/validation-checklist-template.md` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Validation checklist scaffold. |
| `core/contracts/workflow-routing-map.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Machine-readable workflow routing map; never copied as prose replacement. |

## Workflow Class / Gate / Template Pointers
| Workflow Class | Gate Metadata | Template Pointer | Generated / Derived Markers | Notes |
|---|---|---|---|---|
| `intake-and-truth-mapping` | `all-blocking-gates-pass`; `record-only` advisory gates; required evidence present | `templates/codex-workflow/review-summary-template.md` | generated evidence metadata: `repo-audit-report-v1`, `workflow-validation-summary-v1`; no derived example pointer declared | Root class listed in `WORKFLOW.md`; routing metadata comes from `core/contracts/workflow-routing-map.json`. |
| `spec-and-authority-mapping` | `all-blocking-gates-pass`; `record-only` advisory gates; required evidence present | `templates/codex-workflow/review-summary-template.md` | generated evidence metadata: `source-conflict-resolution-report-v1`, `workflow-validation-summary-v1`; no derived example pointer declared | Authority mapping class; contract metadata only. |
| `implementation-planning` | `all-blocking-gates-pass`; `record-only` advisory gates; required evidence present | `templates/codex-workflow/task-packet-template.md` | generated evidence metadata: `workflow-plan-v1`, `workflow-validation-summary-v1`; derived example pointer declared: `examples/codex-workflow/planning-slice-example.md` | Derived example path is metadata from the routing contract, not a source consumed by this file. |
| `implementation` | `all-blocking-gates-pass`; `record-only` advisory gates; required evidence present | `templates/codex-workflow/task-packet-template.md`; `templates/codex-workflow/handoff-summary-template.md` | generated evidence metadata: `workflow-handoff-summary-v1`, `workflow-validation-summary-v1`; derived example pointer declared: `examples/codex-workflow/handoff-summary-example.md` | Implementation class remains governed by `WORKFLOW.md`. |
| `verification-and-review` | `all-blocking-gates-pass`; `record-only` advisory gates; required evidence present | `templates/codex-workflow/review-summary-template.md` | generated evidence metadata: `workflow-validation-summary-v1`, `workflow-certification-summary-v1`; derived example pointer declared: `examples/codex-workflow/review-summary-example.md` | Verification deep dive pointer: `docs/workflows/verification-and-certification.md`. |
| `migration-and-compatibility` | `all-blocking-gates-pass`; `record-only` advisory gates; required evidence present | `templates/codex-workflow/task-packet-template.md`; `templates/codex-workflow/review-summary-template.md`; `templates/codex-workflow/handoff-summary-template.md` | generated evidence metadata: `migration-plan-v1`, `workflow-validation-summary-v1`, `workflow-certification-summary-v1`; derived example pointers declared in routing metadata | Compatibility work must preserve canonical vs mirror distinction. |
| `readiness-and-release-review` | `all-blocking-gates-pass`; `record-only` advisory gates; required evidence present | `templates/codex-workflow/review-summary-template.md`; `templates/codex-workflow/handoff-summary-template.md` | generated evidence metadata: `workflow-validation-summary-v1`, `workflow-certification-summary-v1`; derived example pointers declared in routing metadata | Release posture must not imply runtime readiness without evidence. |

## Pointer-Only References
- [Workflow Operating Contract] → `WORKFLOW.md` – root workflow taxonomy, phase order, gates, reporting and stop conditions.
- [Workflow Deep Dives] → `docs/workflows/README.md` – canonical entrypoint for class-level deep dives.
- [Implementation And Handoff] → `docs/workflows/implementation-and-handoff.md` – implementation, migration and handoff posture.
- [Verification And Certification] → `docs/workflows/verification-and-certification.md` – verification, certification and release-readiness posture.
- [Codex Workflow Templates] → `templates/codex-workflow/README.md` – template map and canonical contract links.
- [Task Packet Template] → `templates/codex-workflow/task-packet-template.md` – planning scaffold.
- [Review Summary Template] → `templates/codex-workflow/review-summary-template.md` – review/certification scaffold.
- [Handoff Summary Template] → `templates/codex-workflow/handoff-summary-template.md` – run/handoff scaffold.
- [Validation Checklist Template] → `templates/codex-workflow/validation-checklist-template.md` – validation checklist scaffold.
- [Workflow Routing Map Contract] → `core/contracts/workflow-routing-map.json` – metadata-only routing contract; not a prose replacement.

## Open / Review-Required
- [ ] Decide whether future iterations may add `examples/codex-workflow/` as explicit sources; current file only references derived example paths as metadata declared by the routing contract.
- [ ] Decide whether a future generated-output map should expand generated evidence artifact IDs into separate pointer-only entries.
- [ ] Decide whether workflow maps should include validator command pointers in a later pass; current file keeps gates as metadata-only.

## Changelog
- `2026-05-09`: initial proposed – Codex overlay generator, based on `WORKFLOW.md`, `docs/workflows/`, `templates/codex-workflow/`, and metadata-only routing contract inspection.
