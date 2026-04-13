# Documentation Architecture Charter

Class: canonical.
Use rule: read this first for documentation hierarchy, class definitions, merge rules, and update rules; treat it as logical structure only, not a physical directory map.

This file is the canonical documentation operating charter for the repository.
It is prose authority, not script-enforced truth. When a validator or script disagrees with this file, the validator or script is the enforcement surface and [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md) records the claim status.

## Objective

Define how repository docs are classified, where authority lives, and how updates merge without duplicating truth.

## Authority Tiers

| Tier | Class | Meaning | Examples |
| --- | --- | --- | --- |
| 0 | enforced | Script- or validator-backed truth. This is the highest executable authority. | `scripts/tools/validate-shared-core-package.mjs`, `scripts/tools/validate-shared-core-scaffold.mjs`, `scripts/tools/validate-consumer-linkage.mjs` |
| 1 | canonical | Normative repo docs that define policy, contracts, and architecture. | `AGENTS.md`, `docs/authority-matrix.md`, `docs/compatibility.md`, `docs/lock-model.md`, `docs/repo-overlay-contract.md`, `docs/shared-with-local-inputs.md`, `docs/repo-intake-skill-contract.md`, `docs/runtime-policy-skill-contract.md`, `docs/tool-contracts/catalog.json`, `docs/portability.md`, `docs/provider-capability-matrix.md`, `core/README.md`, `core/contracts/README.md` |
| 2 | operational | Runbooks, usage guides, command references, checklists, and authoring guides that depend on canonical rules. | `docs/README.md`, `docs/usage.md`, `docs/adoption-playbook.md`, `docs/consumer-rollout-playbook.md`, `docs/maintainer-commands.md`, `docs/validation-checklist.md`, `docs/authoring-guides.md`, `evals/README.md` |
| 3 | derived | Summaries, baselines, examples, and templates that explain or demonstrate current practice. | `docs/overview.md`, `docs/eval-baseline.md`, `templates/codex-workflow/*`, `examples/codex-workflow/*` |
| 4 | archive | Historical or frozen planning records. | `docs/extraction-roadmap.md`, `CHANGELOG.md` |

## Current Repo Shape

- Root governance: `AGENTS.md`
- Front door: `README.md`
- Docs index: `docs/README.md`
- Canonical docs: `docs/authority-matrix.md`, `docs/architecture.md`, `docs/compatibility.md`, `docs/lock-model.md`, `docs/repo-overlay-contract.md`, `docs/shared-with-local-inputs.md`, `docs/repo-intake-skill-contract.md`, `docs/runtime-policy-skill-contract.md`, `docs/tool-contracts/catalog.json`, `docs/portability.md`, `docs/provider-capability-matrix.md`
- Machine-readable neutral registry: `core/contracts/core-registry.json`, `core/contracts/provider-capabilities.json`
- Portable core slice: `core/`
- Provider adapter scaffolds: `providers/`
- Operational docs: `docs/README.md`, `docs/usage.md`, `docs/adoption-playbook.md`, `docs/consumer-rollout-playbook.md`, `docs/maintainer-commands.md`, `docs/validation-checklist.md`, `docs/authoring-guides.md`, `evals/README.md`
- Evals surface: `evals/`
- Derived docs and support surfaces: `docs/overview.md`, `docs/eval-baseline.md`, `templates/codex-workflow/*`, `examples/codex-workflow/*`
- Archive: `docs/extraction-roadmap.md`, `CHANGELOG.md`
- Enforcement surfaces: `scripts/tools/*`
- Logical class model only: the repo does not currently use physical `canonical/`, `operational/`, `derived/`, or `archive` subdirectories.

## Documentation Topology

```mermaid
flowchart TD
  ROOT["README.md"] --> INDEX["docs/README.md"]
  INDEX --> ARCH["docs/architecture.md"]
  INDEX --> AUTH["docs/authority-matrix.md"]
  INDEX --> USAGE["docs/usage.md"]
  ARCH --> CANON["Canonical docs"]
  ARCH --> OPS["Operational docs"]
  ARCH --> DERIVED["Derived docs"]
  ARCH --> ARCHIVE["Archive docs"]
  AUTH --> LEDGER["Claim-status ledger"]
```

## Repository Surface Map

```mermaid
flowchart LR
  GOVERNANCE["AGENTS.md"] --> ROOT["README.md"]
  ROOT --> INDEX["docs/README.md"]

  subgraph Reusable["Reusable core"]
    CORE["core/"]
    CORE_CONTRACTS["core/contracts/"]
    CORE_SKILLS["core/skills/"]
  end

  subgraph Compatibility["Compatibility mirrors"]
    LEGACY_SKILLS["skills/"]
    LEGACY_CONTRACTS["contracts/"]
    LEGACY_PROVIDERS["providers/<legacy>/"]
  end

  subgraph CanonicalExports["Canonical provider exports"]
    OPENAI["providers/openai-codex/"]
    ANTHROPIC["providers/anthropic-claude/"]
    QWEN["providers/qwen-code/"]
    KIMI["providers/kimi-k2_5/"]
  end

  subgraph Docs["Documentation surfaces"]
    ARCH_DOC["docs/architecture.md"]
    AUTH_DOC["docs/authority-matrix.md"]
    USAGE_DOC["docs/usage.md"]
  end

  INDEX --> ARCH_DOC
  INDEX --> AUTH_DOC
  INDEX --> USAGE_DOC
  ARCH_DOC --> CORE
  ARCH_DOC --> CORE_CONTRACTS
  ARCH_DOC --> CORE_SKILLS
  ARCH_DOC --> OPENAI
  ARCH_DOC --> ANTHROPIC
  ARCH_DOC --> QWEN
  ARCH_DOC --> KIMI
```

## Skill Topology

- Portable exported skills live in `core/skills/`. They are reusable, versioned, and safe to project into provider bundles when their boundaries remain generic and explicit.
- Legacy shared exported skills live in `skills/` as compatibility surfaces until the migration is complete.
- Contract-bound skills still live in `skills/` when the only repo-specific dependency is an explicit local input contract. The boundary is the declared contract, not the directory name.
- Canonical provider-specific packaging and prompt compilation live in `providers/openai-codex/`, `providers/anthropic-claude/`, `providers/qwen-code/`, and `providers/kimi-k2_5/`. Legacy provider directories remain compatibility mirrors.
- Repo-local control-plane skills live in `.agents/skills/`. They govern routing, reuse-vs-create policy, and other repo-specific meta-decisions only.
- Docs and contracts are the home for truth declarations, authority rules, and input-contract surfaces. If a workflow mainly declares scope, authority, or local input shape, keep it in docs/contracts instead of promoting it to a skill.
- The skill class model is logical only; it does not imply a physical directory split beyond the current repository layout.

## Merge and Update Rules

1. Keep one canonical home per rule or contract.
2. If two files describe the same normative rule, merge that rule into the canonical file and leave the secondary file as a pointer or short appendix.
3. Operational docs may summarize flows, but they must point back to the canonical rule instead of redefining it.
4. Derived docs may restate current practice only if they are labeled derived and link back to the canonical source.
5. Archive docs are append-only except for factual corrections.
6. If enforcement changes, update the validator or script and the canonical doc in the same slice.
7. If a new doc is needed, justify it only when no existing canonical file can absorb the rule without becoming mixed-purpose.
8. If authority is unclear, fail closed and record the ambiguity in [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md).

## Enforcement Relationship

- If a rule is script-enforced, cite the script path instead of restating the rule as if prose were sufficient.
- If no enforcing surface exists, mark the claim as `contract-only`, `planned`, `missing`, or `unclear` in [docs/authority-matrix.md](C:/workspace/main_projects/codex-workflow-core/docs/authority-matrix.md).
- Do not label derived or archive material as current truth.

## Naming And Layout

- Canonical files should use direct nouns for the thing they govern.
- Operational files should use action-oriented names for flows and checklists.
- Derived files should signal summary, example, or baseline.
- Archive files should signal history, roadmap, or changelog.
- Physical path moves are deferred until validator-pinned references are updated.
