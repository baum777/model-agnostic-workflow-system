---
zone: operational-playbook
authority: operational
source_path: wiki-overlay/README.md
llm_processing: yes
summary_allowed: yes
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: prose-governed
status: active
canonical_source: README.md
review_gate: none
notes: "Human review frontdoor for the non-migrating LLM-Wiki overlay; routes to pointer-only maps without changing original files."
generated_at: "2026-05-09T07:05:00+02:00"
overlay_spec_version: "1.0"
---

# LLM-Wiki Overlay Review Guide

> non-migrating overlay - no original file edits - pointer-only review guide

## Purpose

This directory is a human-review overlay for the existing repository structure. It helps reviewers and LLM agents identify authority, zone, copy policy, review gates, and exclusions without moving files, renaming paths, or copying source content.

## Review Rule

- Treat this directory as an index and decision aid, not a new source of truth.
- Read canonical truth from the referenced original path.
- Keep generated, compatibility, runtime-evidence, private/local, and project-import areas review-gated.
- Do not add frontmatter to original repo files.
- Do not copy excluded, generated, runtime, secret, private, or imported-project content into overlay files.

## Human Review Flow

1. Start with `wiki-overlay/index.md` for the overlay purpose and LLM use rules.
2. Use `wiki-overlay/authority-map.md` to identify canonical sources before trusting any derived or generated surface.
3. Use `wiki-overlay/path-map.md` to map an existing path to a logical zone.
4. Check `wiki-overlay/private-exclusion-map.md` before reading any private, local, memory, runtime, or secret-near path.
5. Check the relevant domain map for skills, workflows, templates, generated outputs, project imports, or frontmatter.
6. Run `npm run validate-overlay` before trusting or publishing overlay changes.
7. Record unresolved decisions as human review questions instead of changing source files.

## Tooling Gates

| Gate | Surface | Purpose |
|---|---|---|
| Frontmatter consistency | `scripts/tools/validate-wiki-overlay.mjs` | Checks required overlay metadata fields, enum values, timestamps, and `source_path` alignment. |
| Hard-exclusion pre-commit | `scripts/hooks/pre-commit-overlay` | Runs the hard-exclusion subset without touching `.git/hooks` directly. |
| Pointer-only CI | `.github/workflows/overlay-validation.yml` | Runs `npm run validate-overlay` for pull requests and pushes to `main`. |

Install the hook manually only after review:

```sh
cp scripts/hooks/pre-commit-overlay .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Overlay Files

| File | Human Review Use |
|---|---|
| `wiki-overlay/index.md` | Entry point for the complete overlay and LLM use rules. |
| `wiki-overlay/authority-map.md` | Canonical authority pointer map. |
| `wiki-overlay/path-map.md` | Existing path to logical zone routing. |
| `wiki-overlay/skill-map.md` | Portable, compatibility, and local-only skill separation. |
| `wiki-overlay/workflow-map.md` | Workflow class, gate, and template pointer routing. |
| `wiki-overlay/template-map.md` | Template, example, and canonical contract pointer separation. |
| `wiki-overlay/generated-output-map.md` | Generated output, compatibility mirror, and runtime-evidence boundaries. |
| `wiki-overlay/private-exclusion-map.md` | Hard exclusions and borderline review gates. |
| `wiki-overlay/project-import-map.md` | External/project import ownership and approval gates. |
| `wiki-overlay/frontmatter-schema.md` | Overlay-only metadata schema and defaults. |

## Review Outcomes

| Outcome | Meaning | Allowed Action |
|---|---|---|
| `approve` | Source can be used under the documented zone limits. | Pointer or metadata use according to the map. |
| `approve-with-limits` | Source can be used only with explicit restrictions. | Keep authority, copy policy, and canonical links visible. |
| `review-only` | Source needs human approval before processing or summarizing. | Do not promote; document the needed decision. |
| `exclude` | Source is not allowed in LLM or wiki context. | Keep as pattern/pointer only, or omit entirely. |
| `blocked` | Source cannot be safely classified from current evidence. | Stop and request human review. |

## Non-Goals

- No migration into an Obsidian vault.
- No physical restructuring by zone.
- No automatic frontmatter insertion into original files.
- No generated JSON, runtime artifact, secret, token, credential, private log, or project-import content copies.
- No promotion of overlays, examples, compatibility mirrors, or generated exports into canonical truth.

## Pointer-Only References

- `Overlay Index` -> `wiki-overlay/index.md`
- `Repository Frontdoor` -> `README.md`
- `Workflow Contract` -> `WORKFLOW.md`
- `Documentation Navigator` -> `docs/README.md`
- `Overlay Contract Reference` -> `audit/local-llm-wiki-overlay-spec.md`

## Changelog

- `2026-05-09`: initial proposed - human review frontdoor for the non-migrating overlay.
