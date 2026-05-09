---
zone: canonical-source
authority: canonical
source_path: wiki-overlay/authority-map.md
llm_processing: yes
summary_allowed: review-only
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: prose-governed
status: active
canonical_source: AGENTS.md
review_gate: none
notes: "Authority pointer map for approved canonical sources; non-migrating overlay with no original file edits."
generated_at: "2026-05-09T04:46:57+02:00"
overlay_spec_version: "1.0"
---

# Authority Map

> non-migrating overlay · no original file edits · pointer-only index

## Zweck
Diese Datei bildet die freigegebenen Authority-Quellen als Pointer-Only-Index ab. Sie ersetzt keine canonical Quelle und enthaelt keine Volltextkopien aus den Originaldateien.

## Scope
- **Zonen**: `canonical-source`
- **Authority-Klassen**: `canonical`
- **Ausgeschlossen**: `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs, generated JSON exports, nicht freigegebene project imports. Diese Bereiche sind fuer diese Datei nicht erforderlich und bleiben ausserhalb des LLM-/Wiki-Kontexts.
- **Fokus**: canonical vs. operational vs. generated wird als Leseregel sichtbar gemacht; die gelisteten Quellen sind canonical. Operational und generated Flächen sind in dieser Datei keine Source-Entries.

## Map / Entries
| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `AGENTS.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Root operating contract; hoechste lokale Repo-Authority fuer Agentenarbeit. |
| `WORKFLOW.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Root workflow contract; ordnet Workflow-Klassen, Gates und Reporting. |
| `docs/architecture.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Documentation architecture charter; definiert logische Klassen und Update-Regeln. |
| `docs/authority-matrix.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Claim/status ledger; trennt doc class von enforcement status. |
| `docs/governance/source-hierarchy.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Authority order fuer Quellen, Workflows, Specs, Skills, Tools und MCP evidence. |
| `docs/governance/external-portfolio-layer-reference.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Strukturierter Pointer auf externe Portfolio-Governance; keine Kopie externer Regeln. |
| `docs/mcp/policy.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Canonical MCP boundary policy; keine Deep-Dive-Details und keine Runtime-Claims. |

## Pointer-Only References
- [Root Operating Contract] → `AGENTS.md` – canonical Einstieg fuer lokale Agentenregeln.
- [Workflow Operating Contract] → `WORKFLOW.md` – canonical Einstieg fuer Workflow-Reihenfolge, Gates und Reporting.
- [Documentation Architecture Charter] → `docs/architecture.md` – canonical Regeln fuer logische Klassen und Dokumentationshierarchie.
- [Authority Matrix] → `docs/authority-matrix.md` – canonical Ledger fuer Claim-/Status-Interpretation.
- [Source Hierarchy] → `docs/governance/source-hierarchy.md` – canonical Rangfolge fuer Quellen und Evidence.
- [External Portfolio Governance Layer Reference] → `docs/governance/external-portfolio-layer-reference.md` – pointer-only Boundary zur externen Portfolio-Schicht.
- [MCP Policy] → `docs/mcp/policy.md` – canonical MCP-Boundary ohne Deep-Dive in MCP-Details.

## Open / Review-Required
- [ ] Entscheiden, ob spaetere Authority-Maps auch `operational` Quellen aufnehmen duerfen – aktueller Fokus enthaelt nur canonical Sources.
- [ ] Entscheiden, ob generated Flächen in einer separaten `generated-output-map.md` bleiben sollen – aktueller Stand: ja, nicht Teil dieser Authority-Map.
- [ ] Entscheiden, ob `docs/governance/external-portfolio-layer-reference.md` nur als Boundary-Pointer oder auch als Navigationsanker fuer externe Review-Flows genutzt werden darf.

## Changelog
- `2026-05-09`: initial proposed – Codex overlay generator, basierend auf `audit/local-llm-wiki-overlay-spec.md` und bestaetigten Gates.
