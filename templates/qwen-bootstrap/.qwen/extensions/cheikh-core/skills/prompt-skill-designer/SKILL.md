---
name: prompt-skill-designer
description: Design modular prompts, skill trees, response contracts, and tool-governance structures.
tier: core
recommended_mode: migration
thinking: on
approval: plan
allowed_tools:
  - files
  - web
required_tools:
  - files
forbidden_shortcuts:
  - decorative prompting without operating logic
  - tool-enabled design without governance
---

# Purpose

Design reusable prompt and skill systems optimized for Qwen-style agentic work.

# Activation conditions

Use when building system prompts, onboarding layers, skill registries, or workflow-oriented prompt operating systems.

# Input contract

- user requirements
- current prompt stack or desired target behavior
- optional model/runtime constraints

# Procedure

1. Separate stable core from changing overlays.
2. Define response contract.
3. Define mode router.
4. Define skill registry.
5. Bind tool policy to skill activation.

# Output contract

1. Goal
2. Target architecture
3. Modules
4. Tool governance
5. Risks / future extensions

# Validation contract

- modularity over monolith
- operational clarity over stylistic flourish

# Escalation rules

Escalate to specific skill authoring once the system design is accepted.
