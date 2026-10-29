---
name: user-research-plan
description: Design bounded user-research plans — neutral questions, recruitment, consent and privacy rules, and analysis with decision-changing criteria — from an explicit evidence base, without fabricating participants, interviews, or findings.
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

# User Research Plan

## Trigger

Use this skill when a product or design decision needs user research — what is already known from real evidence, what remains assumption, which neutral questions and recruitment approach would answer it, and what findings would actually change the decision.

## When Not To Use

- Do not use to produce or evaluate visual composition; use the native `ui-ux-composition` skill.
- Do not use to conduct interviews, recruit participants, or contact anyone — this skill designs research, it never runs it.
- Do not use to summarize existing research literature; use the native `research-synthesis` skill.
- Do not use to present invented participants, quotes, sessions, or findings as evidence.

## Purpose

Turn a research question into an executable, bounded plan with an honest evidence base: known user observations separated from assumptions, neutral instruments, explicit consent and data-minimization rules, and analysis criteria whose outcomes can change the decision.

## Boundary Differentiation

- `ui-ux-composition` evaluates interface quality; this skill plans how to gather the user evidence such evaluations may lack — neither substitutes for the other.
- `research-synthesis` condenses existing literature; this skill designs new primary research and never invents its results.
- Findings analysis after sessions have run is downstream work; this skill defines in advance how findings will be judged, so results cannot be bent to fit.

## Workflow

1. Establish the evidence base: list what is actually known from real user observations (support tickets, analytics, prior sessions, owner-supplied notes), each with its source — and list the working hypotheses separately; a plan built on unlabeled assumptions is a finding about the plan, not a usable input.
2. Keep hypotheses and observations visibly distinct throughout: every statement in the plan is marked as observed (with source) or hypothesis (to be tested); observed facts are never restated as research outcomes.
3. Design neutral questions and recruitment: open, non-leading questions per hypothesis; participant criteria that serve the question rather than convenience; recruitment that does not prime the expected answer.
4. Specify consent, minimization, and analysis: what participants agree to, what personal data is collected (minimum viable), where it is stored, for how long, and how it is analyzed; consent is a recorded participant action, never inferred from participation, silence, or engagement.
5. Define what findings would change the decision: for each hypothesis, state in advance which outcomes would confirm, refute, or force a redesign — before any session exists that could bias the judgment.
6. List what remains unknown until real sessions run under these rules.

## Tool Requirements

- `repo-structure-scanner`
- `spec-compliance-checker`
- `git-diff-explainer`
- `validate-repo-surface`

## Local Inputs

- repository root
- research question tied to a decision
- participant constraints (access, population, schedule)
- data retention rules and applicable privacy constraints
- existing user evidence with sources (optional but required for observed claims)

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

- `QUESTIONS`
- `METHOD`
- `PRIVACY`
- `ANALYSIS`
- `LIMITS`

## Quality Checks

- never fabricate participants, sessions, quotes, interviews, or findings; the plan contains no simulated research results, and placeholders are labeled as examples, never as data
- never infer consent; consent must be an explicit, recorded participant action, and its absence blocks data collection rather than excusing it
- never upload, transmit, or expose personal data; work only with owner-supplied, minimized inputs, and prefer aggregates over identifiable records
- keep observed evidence (with sources) and hypotheses (to be tested) distinct in every section; hypotheses are never phrased as findings
- questions must be neutral and non-leading; a question that presupposes the expected answer is a defect in the instrument
- state analysis criteria and decision-changing outcomes before sessions exist, so results cannot be reverse-fitted
