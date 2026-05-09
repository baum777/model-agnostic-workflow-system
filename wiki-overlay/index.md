---
zone: operational-playbook
authority: operational
source_path: wiki-overlay/index.md
llm_processing: yes
summary_allowed: yes
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: prose-governed
status: active
canonical_source: README.md
review_gate: none
notes: "Pointer-only index for the non-migrating local LLM-Wiki overlay; no original file edits and no content copies."
generated_at: "2026-05-09T06:54:22+02:00"
overlay_spec_version: "1.0"
---

# Local LLM-Wiki Overlay Index

> non-migrating overlay - no original file edits - pointer-only index

## Zweck

Dieses Overlay ist eine Navigations- und Metadatenschicht ueber dem bestehenden Repository. Ein LLM darf diese Dateien nutzen, um Pfade, Authority-Status, Exclusions und Review-Gates zu verstehen; es darf daraus keine neue canonical Truth ableiten und keine Originaldateien umschreiben.

## Scope

- **Zonen**: `operational-playbook`, `canonical-source`, `derived-knowledge`, `compatibility-mirror`, `generated-output`, `template-source`, `runtime-evidence`, `private-or-local`, `project-import`, `exclude-from-llm-context`, `needs-human-review`
- **Authority-Klassen**: `operational`, `canonical`, `derived`, `compatibility`, `generated`, `private`, `local`, `unknown`
- **Ausgeschlossen**: `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs, nicht freigegebene project imports, raw secrets, tokens, credentials
- **Contract-Referenz**: `audit/local-llm-wiki-overlay-spec.md`
- **Index-Regel**: Diese Datei ist selbst pointer-only und ersetzt weder `README.md`, `WORKFLOW.md` noch die Audit-/Decision-Dateien.

## Map / Entries

| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `README.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Repo-Frontdoor; Orientierung ohne Volltextkopie. |
| `docs/README.md` | `operational-playbook` | `operational` | `pointer-only` | `yes` | `none` | Docs-Navigator; Index only, nicht canonical Authority. |
| `WORKFLOW.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Root Workflow Contract; Workflow-Truth bleibt dort. |
| `audit/local-llm-wiki-review-decisions.md` | `operational-playbook` | `operational` | `metadata-only` | `yes` | `none` | Zone-Entscheidungen und Exclusion-Policy fuer Overlay-Nutzung. |
| `audit/local-llm-wiki-overlay-spec.md` | `operational-playbook` | `operational` | `pointer-only` | `yes` | `none` | Contract-Referenz fuer geplante Overlay-Dateien und Gates. |
| `wiki-overlay/authority-map.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Primaere Navigationsreferenz fuer canonical Authority-Pointer. |

## Overlay Navigation

| Overlay File | Zweck | Default Use |
|---|---|---|
| `wiki-overlay/authority-map.md` | Verweist auf canonical Authority-Quellen und deren Leseregeln. | Startpunkt fuer Authority-Klaerung. |
| `wiki-overlay/path-map.md` | Routet bestehende Repo-Pfade auf logische Wissenszonen. | Zone-Entscheidung fuer bekannte Pfade pruefen. |
| `wiki-overlay/skill-map.md` | Trennt portable, compatibility und local-only Skill-Flächen. | Skill-Scope und Promotion-Grenzen pruefen. |
| `wiki-overlay/workflow-map.md` | Verknuepft Workflow-Klassen, Gates und Template-Pointer. | Workflow-Kontext und Gate-Status nachschlagen. |
| `wiki-overlay/template-map.md` | Trennt operational Templates, derived Examples und canonical Contract-Pointer. | Template-Nutzung ohne Promotion zu canonical pruefen. |
| `wiki-overlay/generated-output-map.md` | Markiert generated exports, compatibility mirrors und runtime/eval evidence. | Generated Output nie als canonical lesen. |
| `wiki-overlay/private-exclusion-map.md` | Dokumentiert Hard Exclusions, no-copy Muster und Borderline Review Gates. | Vor jeder unsicheren Kontextaufnahme pruefen. |
| `wiki-overlay/project-import-map.md` | Kontrolliert externe/project imports ueber Owner- und Freigabe-Gates. | Importiertes Projektwissen default excluded halten. |
| `wiki-overlay/frontmatter-schema.md` | Definiert das overlay-only Metadatenschema und Defaults. | Frontmatter nur fuer Overlay-Artefakte nutzen. |

## LLM Use Rules

- Nutze dieses Overlay nur als Pointer-, Map- und Metadatenebene.
- Lies canonical Truth an der referenzierten Originalquelle, nicht aus Overlay-Zusammenfassungen.
- Behandle generated, compatibility, runtime evidence, private/local und project-import Bereiche als review-gated oder excluded.
- Kopiere keine Inhalte aus Originaldateien in Overlay-Artefakte, wenn die Copy Policy `pointer-only`, `metadata-only` oder `no-copy` sagt.
- Fuege kein Frontmatter in Originaldateien ein; Frontmatter bleibt overlay-only.
- Stoppe fail-closed bei unbekannter Authority, privatem Kontext, secret-nahen Pfaden oder fehlender Owner-Freigabe.

## Spec Reference

- `audit/local-llm-wiki-overlay-spec.md` - Contract-Referenz fuer das nicht-migrierende Overlay-Konzept, erlaubte Quellen, verbotene Quellen, Frontmatter-Schema und Human Review Gates.

## Pointer-Only References

- `Repository Frontdoor` -> `README.md` - Repo-Orientierung und Strukturhinweise.
- `Documentation Navigator` -> `docs/README.md` - Einstieg in Docs ohne Authority-Promotion.
- `Workflow Operating Contract` -> `WORKFLOW.md` - Workflow-Klassen, Gates und Reporting.
- `Review Decisions` -> `audit/local-llm-wiki-review-decisions.md` - genehmigte Zonen, Limits und Hard Exclusions.
- `Overlay Spec` -> `audit/local-llm-wiki-overlay-spec.md` - Contract-Referenz fuer dieses Overlay-System.
- `Authority Map` -> `wiki-overlay/authority-map.md` - primaere Navigationsreferenz fuer canonical Pointer.

## Open / Review-Required

- [ ] Entscheiden, ob `wiki-overlay/index.md` spaeter als Obsidian-Startseite genutzt werden soll oder nur als Repo-interner Index.
- [ ] Entscheiden, ob weitere Maps fuer docs class, validator/evidence oder archive/timeline noetig sind.
- [ ] Entscheiden, ob alle Overlay-Dateien vor einem Release mit einem Frontmatter-Validator geprueft werden sollen.
- [ ] Entscheiden, ob die untracked Audit-Artefakte dauerhaft versioniert oder lokal gehalten werden.

## Changelog

- `2026-05-09`: initial proposed - Codex Overlay-Generator, pointer-only Index fuer die bestehenden neun Overlay-Dateien.
