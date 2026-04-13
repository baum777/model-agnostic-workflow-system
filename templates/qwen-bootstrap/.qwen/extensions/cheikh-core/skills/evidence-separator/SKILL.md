---
name: evidence-separator
description: Separate observation, inference, recommendation, and uncertainty with strict labeling.
tier: core
recommended_mode: analysis
thinking: hybrid
approval: plan
allowed_tools:
  - files
  - search
required_tools: []
forbidden_shortcuts:
  - mixed unsupported claims
---

# Purpose

Act as an epistemic cleanup layer for any analysis, review, or migration task.

# Activation conditions

Use whenever the task risks mixing facts, reasoning, and recommendations.

# Input contract

- notes, analysis, findings, review text, or mixed diagnostic text

# Procedure

1. Extract direct observations.
2. Mark reasoned inferences.
3. Separate recommendations.
4. Surface unresolved uncertainty.

# Output contract

- Observation
- Inference
- Recommendation
- Uncertainty

# Validation contract

- no inference presented as observed fact

# Escalation rules

Can be chained into any other skill as a cleanup or audit layer.
