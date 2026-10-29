---
name: research-reproduction-review
description: Review whether research claims can be reproduced from the stated method and artifacts, and design bounded reproduction protocols with sandboxed, approval-gated execution — without fabricating experiments or statistics.
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

# Research Reproduction Review

## Trigger

Use this skill when a paper, benchmark, or research claim needs a reproduction assessment — what the stated method and artifacts actually support, what blocks reproduction, and what a bounded reproduction protocol with honest failure criteria looks like.

## When Not To Use

- Do not use to summarize or synthesize literature; use the native `research-synthesis` skill.
- Do not use to design software tests; use the native `behavior-first-tdd` skill.
- Do not use to execute paper code, download artifact bundles, or run experiments — this skill designs and reviews, it never runs.
- Do not use to claim a reproduction succeeded without executed evidence.

## Purpose

Separate what a publication states from what its method and artifacts can actually reproduce, and turn the difference into an explicit, bounded protocol with failure criteria and governed execution.

## Boundary Differentiation

- `research-synthesis` condenses what papers say; this skill tests what they can support.
- `behavior-first-tdd` covers software behavior tests; this skill covers experimental reproduction design.
- Long-document ingestion belongs to the native `long-document-to-knowledge-asset` skill; this skill consumes the extracted claims.

## Workflow

1. Extract the claims and their measurable predictions, keeping stated results visibly separate from reproducible evidence.
2. Map method, data, baselines, and confounders against the artifact versions supplied; identify what is available, referenced-but-unavailable, and unstated.
3. Record reproduction blockers: missing data or code, unstated hyperparameters and seeds, environment or compute assumptions, and undocumented preprocessing.
4. Design the bounded reproduction experiment: smallest protocol per claim, explicit checkpoints, and decision criteria agreed before execution.
5. Specify execution governance: where a protocol needs autonomous or background research runners, they must run sandboxed with approvals enabled by default — a runner that bypasses the sandbox or approval gates by default is a finding, not a configuration option.
6. List what remains unknown until the protocol is executed under that governance.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- paper or claim document with version identity
- artifact inventory (code, data, seeds, configs) with versions
- compute and data constraints
- research question to reproduce

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

- `METHOD`
- `ARTIFACTS`
- `REPRODUCTION PLAN`
- `FAILURE CRITERIA`
- `GAPS`

## Quality Checks

- never fabricate experiments, measurements, or statistics; missing evidence is a blocker, never an invented number
- never present a designed protocol as an executed reproduction
- paper code and artifact bundles are not executed, installed, or fetched before admission
- autonomous or background execution must be sandboxed and approval-gated by default; sandbox or approval bypass by default is a finding
- cite exact artifact versions and document locations for every method claim
- keep stated results, reproducible evidence, and reviewer inference distinct
