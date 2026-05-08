---
name: safe-main-sync-ff-only
description: Synchronize local main with origin/main using fast-forward-only logic and fail-closed divergence checks. Use when main/origin-main state must be aligned without merge or rebase side effects.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: model-agnostic-workflow-system
status: extracted
---

# Safe Main Sync FF Only

## Purpose
Synchronize `main` with `origin/main` only through fast-forward-safe decisions and explicit divergence handling.

## Trigger
Use this skill when local `main` and `origin/main` must be synchronized and only fast-forward-safe actions are allowed.

## When Not To Use
- Do not use when the user requested merge-commit or rebase workflows.
- Do not use when working branch is not intended to touch `main`.
- Do not use when dirty worktree changes must be preserved during branch switching.

## Non-Goals
- This skill does not perform merge conflict resolution.
- This skill does not perform rebase or force push operations.
- This skill does not modify unrelated branches.

## Expected Inputs
- intent to synchronize `main` and `origin/main`
- permission posture for read-only diagnosis vs ff-only update
- current repository context where branch switching risk matters

## Workflow
1. Run `git status --short --branch --untracked-files=all`.
2. If worktree is dirty, do not switch branches and do not pull. Return `blocked` or read-only diagnosis.
3. Run `git fetch origin main`.
4. Read SHAs:
   - `git rev-parse main`
   - `git rev-parse origin/main`
5. Evaluate ancestry:
   - `git merge-base --is-ancestor main origin/main`
   - `git merge-base --is-ancestor origin/main main`
6. Decision logic:
   - If `main == origin/main`: no action.
   - If `main` is ancestor of `origin/main`: update `main` only by `git pull --ff-only` or `git merge --ff-only origin/main`.
   - If `origin/main` is ancestor of `main`: local `main` is ahead; push may be possible after separate validation.
   - If neither is ancestor: diverged, return `blocked`.
7. Forbidden actions:
   - automatic merge commits
   - rebase without explicit user request
   - force push
   - pull without `--ff-only`

## Output
Return these fields:
- `Result` (`pass` | `blocked` | `partial`)
- `main SHA`
- `origin/main SHA`
- `Relation` (`equal` | `behind` | `ahead` | `diverged`)
- `Action executed`
- `Next safe step`

## Quality Checks
- Dirty worktree blocks branch-changing sync actions.
- Relation classification is explicit and reproducible from SHAs/ancestry.
- No merge, rebase, or force operation is used.
