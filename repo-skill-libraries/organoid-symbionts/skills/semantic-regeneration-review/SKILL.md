---
name: semantic-regeneration-review
description: Reviews semantic index rebuilds and snippet extraction artifacts for organoid_Symbionts.
version: 1.0.0
repo: organoid_Symbionts
classification: repo-specific
safe_to_auto_run: true
requires_repo_inputs: false
produces_structured_output: true
---

## Purpose
Review derived semantic artifacts so rebuilds remain reproducible and do not silently change the runtime's memory or snippet outputs.

## Trigger
Use when semantic index scripts, snippet extractors, or derived memory artifacts change.

## When to use
- Checking rebuild scripts and derived outputs
- Auditing semantic memory or snippet generation changes
- Reviewing artifact regeneration before commit or release

## When not to use
- Pure runtime policy changes with no derived artifacts
- Deploy topology work

## Required inputs
- `scripts/build-organoid-semantic-index.ts`
- `src/context/semantic/*`
- `src/embodiment/compiler/*`
- `src/embodiment/dailySnippetExtractor.ts`

## Workflow
1. Identify the artifact being regenerated.
2. Check the script inputs and output locations.
3. Verify the rebuild remains deterministic enough for operators to trust.
4. Mark any artifact or path that is only inferred from code naming.

## Expected outputs
- SUMMARY
- FINDINGS
- RISKS
- BOUNDARIES
- NEXT ACTIONS

## Quality checks
- Rebuild script has a clear source of truth
- Derived outputs are regenerated, not hand-edited
- Artifact paths stay stable across rebuilds

## Repo grounding notes
- `scripts/build-organoid-semantic-index.ts`
- `src/context/semantic/semanticIndex.ts`
- `src/context/semantic/semanticMemory.ts`
- `src/context/semantic/semanticTimelineScout.ts`
- `src/embodiment/compiler/buildSemanticRecords.ts`
- `src/embodiment/dailySnippetExtractor.ts`

