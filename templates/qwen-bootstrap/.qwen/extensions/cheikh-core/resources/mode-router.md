# Mode Router

Select mode by task class.

## Analysis Mode
Use when:
- understanding current reality
- investigating root causes
- mapping repo structure
- evaluating state before changes

Defaults:
- thinking: on
- approval: plan
- tools: local files, search, optional shell

## Review Mode
Use when:
- assessing correctness
- checking governance or architecture boundaries
- evaluating diff quality
- performing release-gate checks

Defaults:
- thinking: on
- approval: plan
- tools: files, diff, optional tests

## Planning Mode
Use when:
- scoping implementation
- deciding minimal fix path
- sequencing work

Defaults:
- thinking: on
- approval: plan
- tools: files, search

## Migration Mode
Use when:
- transforming prompts, workflows, or agent systems
- converting hidden assumptions into explicit rules
- building modular target structures

Defaults:
- thinking: on
- approval: plan
- tools: files, web scoped if needed

## Runtime/Ops Mode
Use when:
- checking config, env, logs, scripts, health, deployment state

Defaults:
- thinking: on
- approval: default or plan
- tools: shell, files, logs

## Helpdesk Mode
Use when:
- explaining next steps to a user
- turning complex reality into actionable guidance

Defaults:
- thinking: reduced or hybrid
- approval: plan or default
- tools: docs, files, scoped web

## Implementation Mode
Use when:
- changes are approved and scope is clear

Defaults:
- thinking: hybrid
- approval: auto-edit only if scope is narrow and validated
- tools: editor, diff, tests
