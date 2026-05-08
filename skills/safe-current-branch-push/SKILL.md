---
name: safe-current-branch-push
description: Push only the current non-main branch after explicit cleanliness and branch checks, without implicit or broad push commands. Use when a feature or working branch push is requested.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: extracted
---

# Safe Current Branch Push

## Purpose
Push exactly one checked non-main branch target while preventing implicit or broad remote updates.

## Trigger
Use this skill when a push is requested for the active working branch and accidental `main` or multi-branch push must be prevented.

## When Not To Use
- Do not use when the task explicitly targets `main` release push.
- Do not use when the request is to push all branches or tags.
- Do not use when the user explicitly wants to push despite a dirty tree unless that exact exception is authorized.

## Non-Goals
- This skill does not create commits.
- This skill does not modify `main` push policy.
- This skill does not perform force push or global push behavior.

## Expected Inputs
- push request for current branch
- dirty-tree override authorization (if any)
- expected remote target (`origin`)

## Workflow
1. Run `git status --short --branch --untracked-files=all`.
2. If staged or unstaged changes exist, do not push unless the explicit instruction is equivalent to `push existing commits despite dirty tree`.
3. Run `git fetch origin`.
4. Determine active branch with `git branch --show-current`.
5. If current branch is `main`, route to `safe-main-push-release` and stop this skill.
6. Push only with:
   - `git push origin <current-branch>`
7. Never use:
   - `git push`
   - `git push origin main`
   - `git push --all`
   - `git push --force`

## Output
Return these fields:
- `Result` (`pass` | `blocked` | `partial`)
- `Branch`
- `Upstream`
- `Pushed commit range`
- `Remote target`
- `Branches intentionally not touched`
- `Next safe step`

## Quality Checks
- Push target is explicit and equals current non-main branch.
- Dirty-tree behavior follows explicit instruction only.
- No implicit, broad, or force push command is used.
