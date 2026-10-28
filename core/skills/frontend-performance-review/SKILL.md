---
name: frontend-performance-review
description: Review frontend bundle, loading, and render performance from captured build artifacts and runtime traces without fabricating profiling data.
version: 1.0.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
metadata:
  author: baum777 <baum777@users.noreply.github.com>
status: extracted
---

# Frontend Performance Review

## Trigger

Use this skill when a frontend change needs a bounded performance review of bundles, loading waterfalls, cache scoping, or render behavior before merge or release, from captured evidence.

## When Not To Use

- Do not use to choose a rendering posture (static vs dynamic); use the native `static-vs-dynamic-rendering-advisor` skill.
- Do not use for behavior/test design; use the native `behavior-first-tdd` skill.
- Do not use for whole-system structure review; use the native `architecture-depth-review` skill.
- Do not use to claim Lighthouse, profiler, or lab numbers that were not actually executed.

## Purpose

Bounded performance review of frontend loading and rendering from supplied build and runtime artifacts: what loads in what order, what is cacheable, what re-renders, and what still needs to be measured.

## Boundary Differentiation

- `static-vs-dynamic-rendering-advisor` decides the rendering posture; this skill reviews the performance of whatever posture exists.
- `state-consistency-review` covers client state correctness; this skill covers loading and render cost.
- `architecture-depth-review` covers system structure; this skill stays inside the frontend performance boundary.

## Workflow

1. Reconstruct the loading waterfall from the supplied build/bundle evidence: entry chunks, async boundaries, duplicate dependencies, and asset sizes with their artifact revisions.
2. Classify cache scope: static/immutably-cacheable assets, negotiated or authenticated resources, and anything loaded serially that could be parallel or prefetched.
3. Review render behavior from supplied traces: state-driven re-render hotspots, layout thrash, and unbatched updates, keeping measured evidence distinct from inferred hypotheses.
4. Propose a measurement plan (which profiles, which hardware/network shaping, which budgets) and list what cannot be concluded until it runs.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- build/bundle evidence (size maps, manifests, analyzer exports)
- captured runtime traces or profiler exports
- target environments and performance budgets, if defined

## Approval Mode

- read-only

## Provider Projections

- OpenAI/Codex: native
- Claude: adapter
- Qwen Code: adapter
- Kimi K2.5: adapter

## Eval Scaffolding

- routing
- schema conformance
- tool selection
- provider parity
- failure modes

## Output

- `WATERFALLS AND BUNDLES`
- `CACHE SCOPE`
- `RENDER AND STATE BEHAVIOR`
- `MEASUREMENT PLAN`
- `GAPS`

## Quality Checks

- never fabricate profiling, trace, or Lighthouse data; missing evidence is a gap, never an invented number
- an audit that was not executed is a gap, never a pass
- cite exact file paths and artifact revisions for every claim
- keep measured evidence visibly separate from inferred hypotheses
- absent budgets and environments are recorded as gaps, not assumed defaults
