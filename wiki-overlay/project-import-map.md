---
zone: project-import
authority: derived
source_path: wiki-overlay/project-import-map.md
llm_processing: review-only
summary_allowed: review-only
wiki_allowed: pointer-only
copy_policy: metadata-only
privacy: review
maturity: prose-governed
status: review-only
canonical_source: null
review_gate: owner-approval-required
notes: "Project-import pointer map using only approved metadata/index sources; imported library contents remain excluded until owner approval."
generated_at: "2026-05-09T06:09:10+02:00"
overlay_spec_version: "1.0"
---

# Project Import Map

> non-migrating overlay · no original file edits · pointer-only index

## Zweck

Diese Overlay-Datei kontrolliert importiertes Projektwissen aus `repo-skill-libraries/` ueber Owner-/Freigabe-Felder, Review-Status und Pointer-only Referenzen. Sie kopiert keine Projektbibliotheksinhalte und macht nicht freigegebene Imports explizit nicht LLM-readable.

## Scope

- **Zonen**: `project-import`, `needs-human-review`, `exclude-from-llm-context`
- **Authority-Klassen**: `derived`, `project-import`, `unknown`
- **Ausgeschlossen**: Inhalte aus `repo-skill-libraries/*/`, nicht freigegebene Projektbibliotheken, private Logs, lokale Runtime-State-Dateien, Secrets, Tokens, Credentials
- **Erlaubte Quellen**: `repo-skill-libraries/README.md`, `repo-skill-libraries/summary-comparison.md`
- **Nicht gelesen**: Projektbibliotheks-Unterordner unter `repo-skill-libraries/*/`; diese bleiben bis Owner-/Freigabe-Review ausgeschlossen.

## Map / Entries

| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `repo-skill-libraries/README.md` | `project-import` | `derived` | `metadata-only` | `review-only` | `owner-approval-required` | Approved metadata/index source for the project-import surface; not canonical project truth. |
| `repo-skill-libraries/summary-comparison.md` | `project-import` | `derived` | `metadata-only` | `review-only` | `owner-approval-required` | Approved comparison metadata source; not a substitute for per-project owner review. |
| `repo-skill-libraries/organoid-symbionts/` | `exclude-from-llm-context` | `project-import` | `no-copy` | `no` | `owner-approval-required` | Imported library root; contents remain excluded until owner/freigabe, freshness and privacy are confirmed. |
| `repo-skill-libraries/sparkfined-tradeapp/` | `exclude-from-llm-context` | `project-import` | `no-copy` | `no` | `owner-approval-required` | Imported library root; contents remain excluded until owner/freigabe, freshness and privacy are confirmed. |
| `repo-skill-libraries/*/README.md` | `needs-human-review` | `project-import` | `no-copy` | `no` | `owner-approval-required` | Borderline future source; may become metadata-only after explicit owner approval. |
| `repo-skill-libraries/*/skill-tree.md` | `needs-human-review` | `project-import` | `no-copy` | `no` | `owner-approval-required` | Borderline future source; may become pointer-only after explicit owner approval. |
| `repo-skill-libraries/*/**/SKILL.md` | `needs-human-review` | `project-import` | `no-copy` | `no` | `owner-approval-required` | Imported skill bodies are not processed without per-library approval. |

## Owner / Freigabe Register

| Import Root | Observed Marker | Owner | Freigabe | Current Wiki Use | Required Before Any Processing |
|---|---|---|---|---|---|
| `repo-skill-libraries/organoid-symbionts/` | import listed in approved index metadata | `TBD` | `not-approved` | `excluded` | Owner, source repo status, privacy review, freshness review, allowed-file list. |
| `repo-skill-libraries/sparkfined-tradeapp/` | import listed in approved index metadata | `TBD` | `not-approved` | `excluded` | Owner, source repo status, privacy review, freshness review, allowed-file list. |
| `repo-skill-libraries/README.md` | approved metadata/index source | `repo-maintainer` | `metadata-only` | `pointer-only` | Confirm that index-level metadata remains non-sensitive. |
| `repo-skill-libraries/summary-comparison.md` | approved comparison metadata source | `repo-maintainer` | `metadata-only` | `pointer-only` | Confirm comparison remains high-level and does not become project truth. |

## Non-Approved Import Rules

| Rule | Default | Reason | Allowed After Approval |
|---|---|---|---|
| Imported project library roots | `exclude` | Derived from external/local projects; ownership, privacy and freshness are not settled here. | Pointer-only or metadata-only per approved file list. |
| Imported skill bodies | `exclude` | Skill content may encode project-specific assumptions or private operational knowledge. | Review-only, never canonical, with source repo pointer. |
| Imported project comparisons | `review-only` | Comparison can flatten context and overstate authority. | Metadata-only with explicit derived status. |
| Imported runtime/deploy details | `exclude` | Could expose operational posture or stale deployment facts. | Redacted metadata only after owner review. |
| Imported prompt/governance surfaces | `review-only` | Prompt/governance material can be sensitive or too project-specific. | Pointer-only after owner and privacy approval. |

## Borderline Review Gates

| Borderline Case | Default | Required Gate | Allowed Output After Approval |
|---|---|---|---|
| `repo-skill-libraries/*/README.md` | `no` | Owner approval plus privacy/freshness review | Metadata-only pointer with `project-import` status. |
| `repo-skill-libraries/*/skill-tree.md` | `no` | Owner approval plus allowed-file list | Pointer-only routing metadata. |
| `repo-skill-libraries/*/**/SKILL.md` | `no` | Owner approval plus scope review per skill | Pointer-only skill reference; no full-text copy. |
| Project-specific deployment docs | `no` | Owner approval plus operational-sensitivity review | Redacted metadata only. |
| Project-specific prompt/governance docs | `no` | Owner approval plus privacy/context review | Pointer-only or redacted-summary-only. |
| Comparing imported libraries | `review-only` | Human review that comparison is high-level metadata | Metadata-only comparison; never canonical. |

## Pointer-Only References

- `Project Import Index` -> `repo-skill-libraries/README.md` - approved metadata/index source for known import roots and usage posture.
- `Project Import Comparison` -> `repo-skill-libraries/summary-comparison.md` - approved metadata-only comparison source.
- `Private Exclusion Map` -> `wiki-overlay/private-exclusion-map.md` - hard exclusions and owner-approval gates for project imports.
- `Review Decisions` -> `audit/local-llm-wiki-review-decisions.md` - project-import zone decision and review-only status.
- `Path Mapping` -> `audit/local-llm-wiki-path-mapping.md` - project-import rationale and unresolved review questions.

## Open / Review-Required

- [ ] Identify the human owner for each imported project library.
- [ ] Decide whether each import root may be visible at all in Obsidian/LLM search.
- [ ] Define an allowed-file list before reading any `repo-skill-libraries/*/` contents.
- [ ] Decide whether imported `SKILL.md` files may ever be indexed, and under which redaction rule.
- [ ] Confirm freshness of the imported libraries against their source repositories before treating metadata as current.
- [ ] Decide whether project-import maps need a separate retention and deletion policy.

## Changelog

- `2026-05-09`: initial proposed - Codex Overlay-Generator, using only approved project-import metadata sources and leaving imported library contents excluded.
