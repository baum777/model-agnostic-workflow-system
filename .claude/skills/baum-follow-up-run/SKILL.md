---
name: baum-follow-up-run
description: Generate the next exact Codex/Claude prompt after a gate result, repo mapping, or implementation report. Manual-only — only run when explicitly invoked.
disable-model-invocation: true
---

# Baum-Follow-Up-Run

Produce one directly usable prompt. Not a menu. Not alternatives. One prompt.

## Manual-Only

Only run when explicitly invoked. Do not auto-generate follow-up prompts after any run or gate.

## Rules

- Produce exactly one prompt unless the user asks for alternatives.
- Do not auto-expand into the next individual step — only generate a follow-up if a meaningful continuation work block is warranted.
- A completed task closure does not automatically require a new prompt. Assess whether the work block is genuinely done.
- Preserve all governance constraints from the previous prompt:
  - Repo path
  - Owner/scope
  - Task class
  - Boundary rules (no secrets, no production, no commit unless asked)
  - Validation commands
  - Evidence requirements
- Include explicit stop conditions so the next run knows when to stop.
- Include the expected result report format so the gate reviewer has a consistent surface to check.

## Prompt Template

The generated prompt must use this structure:

```
Context:
  [what was done, what was found, what gate result was]

Objective:
  [one clear goal for this run]

Scope:
  [files/directories in scope — be explicit]

Hard boundaries:
  - Do not read secrets or env files
  - Do not modify runtime/product code outside scope
  - Do not commit
  - Do not install dependencies without approval
  - Do not run background processes, watchers, daemons, or schedulers

Required reads before starting:
  - [list key files the agent must read first]

Allowed changes:
  - [explicit list of what may be created or modified]

Required verification:
  - Run: [test command]
  - Run: [lint command]
  - Confirm: [what to check]

Stop conditions:
  - Stop if [condition A]
  - Stop if [condition B]

Result report format:
  Result: pass / blocked / partial
  Files changed:
  Validation output:
  Risks/gaps:
  Empfohlener Arbeitsblock (nur wenn nötig — bei Risiko, Entscheidung oder echtem Slice-Abschluss):
```

## Required Output

One final prompt in a single markdown code block.
