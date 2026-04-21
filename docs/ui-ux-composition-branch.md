# UI/UX Composition Branch Hardening

Class: canonical.
Use rule: this is the branch charter for `ui-ux-composition`; treat it as the authority boundary for the branch, not as a runtime implementation claim.

## Objective

Implement `ui-ux-composition` as a canonical, model-agnostic branch in the shared core with tighter truth boundaries: explicit branch-status classification, a narrower branch-level output contract, a bounded `audit` mode, explicit semantic-design posture coverage, and registry-level proof that the branch is discoverable without special-case generator logic.

## Current Truth

- Observed: the repo already has reusable planning and governance primitives in `.agents/skills/workflow-core-router/SKILL.md`, `.agents/skills/skill-creator-orchestrator/SKILL.md`, `skills/implementation-contract-extractor/SKILL.md`, `skills/planning-slice-builder/SKILL.md`, `skills/patch-strategy-designer/SKILL.md`, `skills/failure-mode-enumerator/SKILL.md`, and `skills/test-matrix-builder/SKILL.md`.
- Observed: `scripts/tools/build-neutral-core-registry.mjs` auto-discovers skill manifests from `core/skills/` and `skills/`, so a new portable skill is discoverable without generator changes.
- Observed: `core/contracts/output-contracts.json` and `core/contracts/tool-contracts/catalog.json` are the canonical contract surfaces for new structured outputs and contract-only logical tools.
- Observed: `docs/architecture.md` and `docs/authority-matrix.md` are the correct authority surfaces for classifying canonical, operational, derived, archive, contract-only, missing, and implemented claims.
- Observed: deterministic semantic-design tooling already exists under `scripts/tools/` for semantic analysis, visual-direction contract derivation, semantic-layout eval, contract linting, and role-based color posture derivation.
- Inferred: the branch should be represented as one canonical charter plus one operational skill surface, with the detailed module tree kept as advisory internal taxonomy rather than 19 executable skills.
- Missing: there is no runtime visual-analysis surface in this repo, so native screenshot/DOM/computed-style audit must remain missing, not implied.

## Gaps

- No canonical UI/UX composition branch charter existed before this slice.
- No portable `ui-ux-composition` skill existed in `core/skills/`.
- No branch-specific output contract existed in `core/contracts/output-contracts.json`.
- No branch-specific logical tool contracts existed in `core/contracts/tool-contracts/catalog.json`.
- No runtime visual-analysis tool surface exists in the repository.
- Semantic visual-direction/layout/color/typography posture capability existed mostly as tooling and advisory docs but was not explicit in the branch skill contract.

## Constraints

- Do not add a special-case generator path.
- Do not turn the internal module taxonomy into 19 executable skills in v1.
- Do not claim screenshot, DOM-runtime, or computed-style truth where no runtime visual parser exists.
- Do not weaken usability, accessibility, clarity, or information hierarchy for aesthetic purity.
- Do not proliferate branch-adjacent standalone skills when branch-scope extension is sufficient.

## Reuse Decision

- Reuse `docs/architecture.md`, `docs/authority-matrix.md`, `docs/authoring-guides.md`, `core/contracts/portable-skill-manifest.json`, `core/contracts/output-contracts.json`, and `core/contracts/tool-contracts/catalog.json`.
- Reuse the existing validation and registry scripts, especially `scripts/tools/build-neutral-core-registry.mjs`, `scripts/tools/build-provider-exports.mjs`, `scripts/tools/validate-provider-neutral-core.mjs`, and `scripts/tools/validate-shared-core-scaffold.mjs`.
- Reuse the branch-shaping skills `skills/implementation-contract-extractor`, `skills/planning-slice-builder`, `skills/patch-strategy-designer`, `skills/failure-mode-enumerator`, and `skills/test-matrix-builder`.
- Bypass `skills/repo-intake-sot-mapper` and `skills/runtime-policy-auditor`, because their consumer-local contracts are absent and this is shared-core implementation, not consumer-overlay auditing.

## Status Matrix

| Surface | Status | Notes |
| --- | --- | --- |
| `ui-ux-composition` branch | canonical | branch authority boundary and claim ledger |
| `core/skills/ui-ux-composition/SKILL.md` | canonical operational skill surface | portable branch skill discoverable by registry |
| `docs/ui-ux-composition/*` module docs | advisory internal branch taxonomy | not a second authority path |
| tool-contract entries | canonical contract-only | logical surfaces only, not runnable tools |
| visual parsing / screenshot / DOM audit | missing | no runtime visual-analysis surface is wired in this repo |
| module-level executable skills | not implemented by design | keep the branch flat in v1 |
| semantic visual/layout/color/typography posture | canonical branch scope | explicit in branch skill; tooling-backed and deterministic where scripts exist |
| rendering posture advice (`static`/server/hydration) | canonical sibling skill scope | separated as a bounded skill to avoid UI/UX branch authority drift |

## Implementation Plan

- Add the branch skill at `core/skills/ui-ux-composition/SKILL.md` with bounded `audit` semantics.
- Extend `ui-ux-composition` to explicitly cover semantic visual direction, semantic layout posture, semantic color posture, tone-aware typography posture, and bounded golden-ratio use.
- Add the branch output contract to `core/contracts/output-contracts.json` with stable required fields.
- Add contract-only logical tool entries to `core/contracts/tool-contracts/catalog.json`.
- Add one bounded sibling skill for rendering posture (`static-vs-dynamic-rendering-advisor`) only because this capability is not covered by existing branch scope or deterministic semantic-design tooling.
- Add the advisory branch bundle under `docs/ui-ux-composition/`.
- Update the docs and authority surfaces so the new branch is discoverable and truthfully classified.

## Acceptance Criteria

- The charter exists and contains the explicit status matrix above.
- The portable branch skill exists and is discoverable by the registry.
- The output contract contains the stable required fields `branch`, `mode`, `result_type`, `summary`, `constraints_applied`, `confidence`, `findings`, and `recommendations`.
- The branch skill explicitly states semantic visual-direction/layout/color/typography coverage and bounded golden-ratio rules.
- Golden-ratio guidance remains subordinate to semantic clarity, accessibility, responsiveness, readability, and implementation practicality.
- The tool catalog contains the branch logical tool entries and marks them contract-only.
- The generated registry artifact contains `ui-ux-composition`.
- If rendering posture advice is added, it exists as one bounded sibling skill and does not duplicate `ui-ux-composition` scope.
- The export/build artifacts include the skill without special-case generator changes.
- No unrelated skill manifests change as a side effect of adding the branch.
- The authority matrix distinguishes canonical branch truth from advisory internal taxonomy and missing runtime visual-analysis capability.

## Verification / Tests

- `npm run validate`
- `npm run validate-neutral`
- `npm run build-registry`
- `npm run build-exports`
- Compare generated registry output against committed registry output and confirm `ui-ux-composition` is present.
- Confirm the export artifacts include the new skill without manual registry edits.
- `node scripts/tools/spec-compliance-checker.mjs --file docs/ui-ux-composition-branch.md --must-contain Objective,Current Truth,Gaps,Reuse Decision,Status Matrix,Implementation Plan,Acceptance Criteria,Verification / Tests,Risks / Rollback,Next Step`

## Risks / Rollback

- Risk: the umbrella skill could become too vague if the branch tries to encode every module as a separate executable surface.
- Risk: the new output contract could drift toward a generic blob if the stable required fields are not enforced.
- Risk: `audit` may be overclaimed as a visual runtime analysis.
- Risk: contract-only tool entries could be mistaken for runnable tools.
- Rollback: remove the branch doc bundle, the new skill folder, the new output contract, and the branch tool-contract entries; leave existing validators, portable skills, and provider exports intact.

## Next Step

Implement the branch charter, branch skill, contract additions, and authority updates as a single docs-plus-manifest slice.
