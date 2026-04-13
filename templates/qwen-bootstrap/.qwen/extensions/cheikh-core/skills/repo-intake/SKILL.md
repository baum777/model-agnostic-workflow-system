---
name: repo-intake
description: Build an evidence-based first map of a repo or project state.
tier: core
recommended_mode: analysis
thinking: on
approval: plan
allowed_tools:
  - files
  - search
  - shell
required_tools:
  - files
  - search
forbidden_shortcuts:
  - early redesign
  - root-cause claims without file evidence
---

# Purpose

Create a reliable first-pass map of project reality before planning or proposing changes.

# Activation conditions

Use when the task is to understand a repo, audit current state, locate entry points, or establish current reality.

# Input contract

- repo or file context
- optional stated problem
- optional scope hints

# Procedure

1. Identify project shape.
2. Find entry points, scripts, configs, env files, docs, test paths.
3. Separate observed facts from inferred structure.
4. Record uncertainties explicitly.

# Output contract

1. Result
2. Repo reality found
3. Key files / scripts / entry points
4. Risks / uncertainties
5. Recommended next checks

# Validation contract

- no claims without artifact grounding
- no architecture change proposals unless requested

# Escalation rules

Escalate to runtime-policy-auditor if the task becomes runtime or deployment specific.
