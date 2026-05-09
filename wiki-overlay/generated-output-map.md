---
zone: generated-output
authority: generated
source_path: wiki-overlay/generated-output-map.md
llm_processing: review-only
summary_allowed: review-only
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: validator-backed
status: active
canonical_source: core/contracts/
review_gate: human-review-required
notes: "Maps generated exports, compatibility mirrors, eval evidence, and canonical contract pointers; generated output is never canonical."
generated_at: "2026-05-09T05:44:28+02:00"
overlay_spec_version: "1.0"
---

# Generated Output Map

> non-migrating overlay · no original file edits · pointer-only index

## Zweck

Diese Overlay-Datei trennt generated exports, compatibility mirrors, eval evidence und canonical contract pointers. Sie kopiert keine JSON-Inhalte und macht generated output ausdruecklich never canonical.

## Scope

- **Zonen**: `generated-output`, `compatibility-mirror`, `runtime-evidence`, `canonical-source`, `exclude-from-llm-context`
- **Authority-Klassen**: `generated`, `compatibility`, `validator-backed`, `canonical`
- **Ausgeschlossen**: `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs, nicht freigegebene project imports, generated JSON full copies
- **Review-Freigabe**: `providers/` wurde explizit als review-only Source freigegeben; generated output bleibt pointer-only und never canonical.
- **Contract-Regel**: Canonical contract truth wird nur per Pointer auf `core/contracts/*` referenziert.

## Map / Entries

| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `providers/README.md` | `generated-output` | `generated` | `pointer-only` | `review-only` | `human-review-required` | Provider export boundary; shared semantics bleiben in `core/contracts/*`. |
| `providers/openai-codex/` | `generated-output` | `generated` | `pointer-only` | `review-only` | `human-review-required` | Current provider export boundary; not canonical semantic authority. |
| `providers/anthropic-claude/` | `generated-output` | `generated` | `pointer-only` | `review-only` | `human-review-required` | Current provider export boundary; not canonical semantic authority. |
| `providers/qwen-code/` | `generated-output` | `generated` | `pointer-only` | `review-only` | `human-review-required` | Current provider export boundary; not canonical semantic authority. |
| `providers/kimi-k2_5/` | `generated-output` | `generated` | `pointer-only` | `review-only` | `human-review-required` | Current provider export boundary; not canonical semantic authority. |
| `providers/openai-codex/export.json` | `generated-output` | `generated` | `metadata-only` | `review-only` | `human-review-required` | Generated export bundle; canonical links: `core/contracts/core-registry.json`, `core/contracts/provider-capabilities.json`. |
| `providers/anthropic-claude/export.json` | `generated-output` | `generated` | `metadata-only` | `review-only` | `human-review-required` | Generated export bundle; canonical links: `core/contracts/core-registry.json`, `core/contracts/provider-capabilities.json`. |
| `providers/qwen-code/export.json` | `generated-output` | `generated` | `metadata-only` | `review-only` | `human-review-required` | Generated export bundle; canonical links: `core/contracts/core-registry.json`, `core/contracts/provider-capabilities.json`. |
| `providers/kimi-k2_5/export.json` | `generated-output` | `generated` | `metadata-only` | `review-only` | `human-review-required` | Generated export bundle; canonical links: `core/contracts/core-registry.json`, `core/contracts/provider-capabilities.json`. |
| `providers/openai/` | `compatibility-mirror` | `compatibility` | `pointer-only` | `review-only` | `human-review-required` | Legacy provider export boundary; non-canonical. |
| `providers/anthropic/` | `compatibility-mirror` | `compatibility` | `pointer-only` | `review-only` | `human-review-required` | Legacy provider export boundary; non-canonical. |
| `providers/qwen/` | `compatibility-mirror` | `compatibility` | `pointer-only` | `review-only` | `human-review-required` | Legacy provider export boundary; non-canonical. |
| `providers/kimi/` | `compatibility-mirror` | `compatibility` | `pointer-only` | `review-only` | `human-review-required` | Legacy provider export boundary; non-canonical. |
| `providers/codex/` | `compatibility-mirror` | `compatibility` | `pointer-only` | `review-only` | `human-review-required` | Legacy provider export boundary; non-canonical. |
| `providers/openai/export.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `review-only` | `human-review-required` | Legacy generated export; never canonical. |
| `providers/anthropic/export.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `review-only` | `human-review-required` | Legacy generated export; never canonical. |
| `providers/qwen/export.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `review-only` | `human-review-required` | Legacy generated export; never canonical. |
| `providers/kimi/export.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `review-only` | `human-review-required` | Legacy generated export; never canonical. |
| `providers/codex/export.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `review-only` | `human-review-required` | Legacy generated export; never canonical. |
| `contracts/README.md` | `compatibility-mirror` | `compatibility` | `pointer-only` | `yes` | `none` | Compatibility guidance; canonical machine-readable source remains `core/contracts/`. |
| `contracts/core-registry.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `yes` | `none` | Mirror of `core/contracts/core-registry.json`; non-canonical. |
| `contracts/provider-capabilities.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `yes` | `none` | Mirror of `core/contracts/provider-capabilities.json`; non-canonical. |
| `docs/tool-contracts/catalog.json` | `compatibility-mirror` | `compatibility` | `metadata-only` | `yes` | `none` | Compatibility/export catalog; canonical pointer: `core/contracts/tool-contracts/catalog.json`. |
| `evals/README.md` | `runtime-evidence` | `validator-backed` | `pointer-only` | `review-only` | `human-review-required` | Eval entrypoint; evidence posture, not project truth. |
| `evals/catalog.json` | `runtime-evidence` | `validator-backed` | `metadata-only` | `review-only` | `human-review-required` | Eval catalog metadata only; no JSON copy. |
| `evals/fixtures/` | `runtime-evidence` | `validator-backed` | `metadata-only` | `review-only` | `human-review-required` | Synthetic/test fixtures; not canonical semantics and not release proof by themselves. |
| `evals/fixtures/provider-export-alignment.json` | `runtime-evidence` | `validator-backed` | `metadata-only` | `review-only` | `human-review-required` | Fixture pointer for generated export alignment; never canonical. |
| `evals/fixtures/workflow-execution-evidence.json` | `runtime-evidence` | `validator-backed` | `metadata-only` | `review-only` | `human-review-required` | Fixture pointer for evidence-shape checks; not raw runtime evidence. |
| `evals/fixtures/secret-boundary-tool-contracts.json` | `runtime-evidence` | `validator-backed` | `metadata-only` | `review-only` | `human-review-required` | Fixture pointer for boundary checks; do not infer secret contents. |
| `evals/fixtures/context-builder-redaction.json` | `runtime-evidence` | `validator-backed` | `metadata-only` | `review-only` | `human-review-required` | Fixture pointer for redaction behavior; no private data copied. |
| `core/contracts/README.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Canonical contract index; prose guide only. |
| `core/contracts/core-registry.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical registry source; JSON not copied. |
| `core/contracts/provider-capabilities.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical provider capability source; JSON not copied. |
| `core/contracts/output-contracts.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical output contract source; JSON not copied. |
| `core/contracts/tool-contracts/catalog.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical tool contract catalog; JSON not copied. |
| `core/contracts/workflow-routing-map.json` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Canonical workflow routing contract; JSON not copied. |

## Non-Canonical JSON Rules

| Pattern / Path | Marker | Canonical Link | Rule |
|---|---|---|---|
| `providers/*/export.json` | generated export | `core/contracts/core-registry.json` | Pointer/metadata only; generated output never becomes canonical. |
| `contracts/*.json` | compatibility mirror | matching `core/contracts/*.json` | Non-canonical mirror; direct edits require regeneration and validation before trust. |
| `docs/tool-contracts/catalog.json` | compatibility export | `core/contracts/tool-contracts/catalog.json` | Non-canonical catalog view; lower rank than core contract. |
| `evals/catalog.json` | validator metadata | `core/contracts/` | Evidence catalog only; not release proof without command evidence. |
| `evals/fixtures/*.json` | synthetic fixture | relevant `core/contracts/*` | Test data only; not project truth or runtime output. |

## Runtime-Evidence Review Gates

| Area | Default Handling | Required Review Before Wiki Use |
|---|---|---|
| `evals/README.md` | Pointer-only | Confirm eval scope is being used as certification guidance, not runtime proof. |
| `evals/catalog.json` | Metadata-only | Confirm catalog entries are current and tied to explicit validation commands. |
| `evals/fixtures/` | Metadata-only | Confirm fixtures are synthetic/test data and not copied as domain facts. |
| `artifacts/runtime-runs/*` | Excluded | Requires redacted summary approval; raw artifacts remain out of scope here. |
| raw logs or private run evidence | Excluded | Requires owner approval and redaction before any pointer or summary. |

## Pointer-Only References

- `Provider Export Boundary` -> `providers/README.md` - generated/export governance and legacy compatibility distinction.
- `Current Provider Exports` -> `providers/openai-codex/`, `providers/anthropic-claude/`, `providers/qwen-code/`, `providers/kimi-k2_5/` - generated provider projections.
- `Legacy Provider Exports` -> `providers/openai/`, `providers/anthropic/`, `providers/qwen/`, `providers/kimi/`, `providers/codex/` - compatibility mirrors.
- `Compatibility Contracts` -> `contracts/` - mirror surface, lower authority than `core/contracts/`.
- `Tool Contract Compatibility Catalog` -> `docs/tool-contracts/catalog.json` - export/mirror pointer only.
- `Eval Evidence Surface` -> `evals/` - validator-backed evidence and fixtures, review-gated.
- `Canonical Contracts` -> `core/contracts/` - canonical machine-readable source, metadata-only in this overlay.
- `Canonical Tool Contract Catalog` -> `core/contracts/tool-contracts/catalog.json` - canonical pointer for tool-contract catalog truth.

## Open / Review-Required

- [ ] Decide whether provider export freshness should be tracked in a separate `provider-export-map.md` with build/validation evidence.
- [ ] Decide whether eval fixtures should move to a dedicated `evidence-map.md` overlay so runtime-evidence stays isolated from generated-output.
- [ ] Decide whether each compatibility mirror should carry a machine-checked canonical target in future overlay metadata.
- [ ] Decide whether JSON path lists should be regenerated by script in future, while preserving pointer-only/no-copy rules.
- [ ] Decide whether any generated output can be used for search indexing; default remains review-only and never canonical.

## Changelog

- `2026-05-09`: initial proposed - Codex overlay generator, with `providers/` explicitly approved as review-only and all generated JSON held to pointer/metadata-only.
