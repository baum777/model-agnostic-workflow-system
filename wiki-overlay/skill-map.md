---
zone: operational-playbook
authority: operational
source_path: wiki-overlay/skill-map.md
llm_processing: yes
summary_allowed: yes
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: prose-governed
status: active
canonical_source: core/skills/README.md
review_gate: none
notes: "Pointer-only skill map separating portable, compatibility, and local-only skill surfaces; no skill promotion."
generated_at: "2026-05-09T05:00:39+02:00"
overlay_spec_version: "1.0"
---

# Skill Map

> non-migrating overlay · no original file edits · pointer-only index

## Zweck
Diese Datei trennt Skill-Flächen nach Scope und Authority, ohne Skill-Inhalte zu kopieren oder Skills zu promoten. `portable` ist nicht `compatibility`, und `local-only` ist nicht exportierbar.

## Scope
- **Zonen**: `operational-playbook`, `compatibility-mirror`
- **Authority-Klassen**: `portable`, `compatibility`, `local-only`
- **Ausgeschlossen**: `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs, generated JSON exports, nicht freigegebene project imports. Diese Bereiche sind fuer diese Datei nicht erforderlich und bleiben ausserhalb des LLM-/Wiki-Kontexts.
- **Fokus**: Nur Skills mit klarer Scope-/Authority-Zuordnung aus `core/skills/`, `skills/` und `.agents/skills/`.

## Map / Entries
| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `core/skills/repo-audit/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill; referenced from canonical skill index. |
| `core/skills/readiness-check/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill; referenced from canonical skill index. |
| `core/skills/supabase-deployment/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill; provider-specific behavior remains out of portable skill body. |
| `core/skills/migration-planner/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/research-synthesis/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/ui-to-backend-contract-extractor/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/source-conflict-resolver/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/spec-to-task-breakdown/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/incident-runbook-composer/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/multi-audience-summarizer/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/tradeoff-matrix-builder/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/long-document-to-knowledge-asset/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/ui-ux-composition/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill with canonical UI/UX composition branch linkage. |
| `core/skills/static-vs-dynamic-rendering-advisor/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `core/skills/secret-boundary-audit/SKILL.md` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable core skill. |
| `skills/blocked-git-state-resolver/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/failure-mode-enumerator/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/getdesign-style-router/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/implementation-contract-extractor/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/mcp-server-creation/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/patch-strategy-designer/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/planning-slice-builder/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/post-implementation-review-writer/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/release-narrative-builder/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/repo-intake-sot-mapper/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level contract-bound/compatibility skill; not promoted to portable. |
| `skills/runtime-policy-auditor/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level contract-bound/compatibility skill; not promoted to portable. |
| `skills/safe-current-branch-push/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/safe-main-push-release/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/safe-main-sync-ff-only/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/safe-scoped-commit/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/test-matrix-builder/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `skills/vercel-deployment/SKILL.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Top-level compatibility skill; not promoted to portable. |
| `.agents/skills/skill-creator-orchestrator/SKILL.md` | `operational-playbook` | `local-only` | `pointer-only` | `yes` | `none` | Repo-local control-plane skill; not exportable. |
| `.agents/skills/skill-tool-mcp-builder/SKILL.md` | `operational-playbook` | `local-only` | `pointer-only` | `yes` | `none` | Repo-local control-plane skill; not exportable. |
| `.agents/skills/workflow-core-router/SKILL.md` | `operational-playbook` | `local-only` | `pointer-only` | `yes` | `none` | Repo-local control-plane skill; not exportable. |

## Pointer-Only References
- [Core Skills Index] → `core/skills/README.md` – portable skill slice and compatibility rule.
- [Portable Skills] → `core/skills/` – canonical portable skill source paths.
- [Compatibility Skills] → `skills/` – top-level compatibility and contract-bound skill paths.
- [Repo-Local Control Skills] → `.agents/skills/` – local-only orchestration skills.
- [Review Decisions] → `audit/local-llm-wiki-review-decisions.md` – approved zone and path decisions used by this overlay.

## Open / Review-Required
- [ ] Decide whether future `skill-map` iterations should add workflow/output contract IDs from machine-readable contracts – current file stays pointer-only.
- [ ] Decide whether top-level `skills/` entries should be split into `compatibility` vs. `contract-bound` in a later metadata-only pass.
- [ ] Decide whether local-only skills should appear in downstream consumer-facing overlays – current decision says no export.

## Changelog
- `2026-05-09`: initial proposed – Codex overlay generator, based on `core/skills/README.md`, skill path inventory, and confirmed gates.
