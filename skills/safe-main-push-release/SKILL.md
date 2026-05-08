---
name: safe-main-push-release
description: Gate direct pushes to main with explicit authorization, clean-tree checks, linear ancestry validation, and non-force push-only execution. Use when a direct main release push is explicitly requested.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: extracted
---

# Safe Main Push Release

## Purpose
Allow direct `main` release push only under explicit authorization, linear history checks, and fail-closed safety gates.

## Trigger
Use this skill when the user explicitly authorizes a direct push from local `main` to `origin/main`.

## When Not To Use
- Do not use when main push authorization is not explicit.
- Do not use when current branch is not `main`.
- Do not use when worktree is dirty.

## Non-Goals
- This skill does not resolve divergence with merge/rebase.
- This skill does not use force push.
- This skill does not alter branch strategy or release policy outside the requested push.

## Expected Inputs
- explicit authorization for direct `main` push
- required validation expectations before release push
- confirmation that `main` is the intended source branch

## Workflow
1. Require explicit user intent to push on `main`.
2. Run `git status --short --branch --untracked-files=all`.
3. Run `git branch --show-current`; require `main`.
4. Run `git fetch origin main`.
5. Inspect commit ranges:
   - `git log --oneline origin/main..main`
   - `git log --oneline main..origin/main`
6. Check linear ancestry:
   - `git merge-base --is-ancestor origin/main main`
7. Decision logic:
   - If `origin/main..main` is empty: nothing to push.
   - If `origin/main` is ancestor of `main`: local commits are linear ahead; run required validations for release scope; push allowed.
   - If ancestry check fails: return `blocked`.
   - If remote has commits missing locally (`main..origin/main` non-empty): ff-only sync first or `blocked`.
8. Push only with:
   - `git push origin main`
9. Forbidden actions:
   - force push
   - rebase
   - merge commits

## Output
Return these fields:
- `Result` (`pass` | `blocked` | `partial`)
- `Commit range`
- `Validations`
- `Push target`
- `Final main SHA`
- `Final origin/main SHA`
- `Next safe step`

## Quality Checks
- Authorization, branch, cleanliness, and ancestry preconditions are all explicit.
- Divergence is fail-closed (`blocked`).
- Push command is exactly `git push origin main`.
