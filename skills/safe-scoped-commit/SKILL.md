---
name: safe-scoped-commit
description: Create exactly one commit for clearly attributable task work without broad staging or accidental inclusion of unrelated files. Use when commit actions are requested in a mixed or potentially dirty worktree.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: extracted
---

# Safe Scoped Commit

## Purpose
Produce one safe, scope-bounded commit without absorbing unrelated repository changes.

## Trigger
Use this skill when the task requires committing current work and there is a risk of unrelated tracked or untracked files in the same repository.

## When Not To Use
- Do not use when scope ownership of changed files cannot be determined.
- Do not use when multiple separate commits are required.
- Do not use when the user explicitly asks for history rewrite or workspace cleanup.

## Non-Goals
- This skill does not clean, delete, or reset repository state.
- This skill does not stage broad sets of files.
- This skill does not decide product scope; it only isolates commit scope.

## Expected Inputs
- requested commit outcome
- scope-owned file set (explicit or inferable from current task)
- required commit message intent

## Workflow
1. Run `git status --short --branch --untracked-files=all`.
2. Identify:
   - current branch
   - tracked changes
   - untracked files
   - files clearly attributable to the current task
3. Stage only explicit user-confirmed files or clearly scope-owned files.
4. Never use:
   - `git add .`
   - `git add -A`
   - broad staging without explicit file list
   - `reset`, `clean`, delete, or discard operations without explicit user permission
5. Commit only the scoped file list with one clear scope-specific commit message.
6. If unrelated or unclear files exist, exclude them. If safe separation is not possible, stop as `blocked`.

## Output
Return these fields:
- `Result` (`pass` | `blocked` | `partial`)
- `Branch`
- `Files staged`
- `Files committed`
- `Files intentionally not touched`
- `Commit SHA`
- `Next safe step`

## Quality Checks
- Commit includes only scoped files.
- Staging commands are explicit and file-bound.
- Commit message names the scope clearly.
- Ambiguous ownership is treated as `blocked`, not guessed.
