---
name: prompt-canon-and-embodiment-review
description: Reviews canonical prompt assets, embodiment fragments, and lore-facing guidance for organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Keep the canonical prompt and embodiment surface aligned with the repo's operational canon instead of letting parallel language drift in.

## Trigger
Use when prompt fragments, embodiment definitions, or lore docs change.

## When to use
- Reviewing prompt assembly or fragment loading
- Checking embodiment labels, glyph anchors, or shared canon text
- Auditing where runtime language is canonical versus legacy-compatible

## When not to use
- Pure HTTP or state-store changes
- Generic documentation cleanup unrelated to prompts

## Required inputs
- `prompts/`
- `src/context/prompts/organoid/`
- `src/prompts/promptFragments.ts`
- `docs/lore/`

## Workflow
1. Identify the canonical prompt path used by the runtime.
2. Check that embodiment fragments and legacy fragments are not mixed accidentally.
3. Review lore text for operational clarity and canonical terminology.
4. Note any fragment or prompt behavior that is inferred from loader code.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Canonical fragments are loaded from the expected prompt root
- Legacy compatibility fragments stay isolated
- Embodiment language matches the runtime contract

## Repo grounding notes
- `prompts/fragments/sharedOrganoidCanon.md`
- `prompts/fragments/sharedCanon.md`
- `prompts/fragments/embodiments/*`
- `prompts/presets/initiate-symbiosis.md`
- `src/context/prompts/organoid/organoid_system.md`
- `src/prompts/promptFragments.ts`
- `docs/lore/ORGANOID_ORCHESTRATION.md`

