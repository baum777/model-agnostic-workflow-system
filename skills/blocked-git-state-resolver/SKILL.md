---
name: blocked-git-state-resolver
description: Diagnose blocked or ambiguous Git states in read-only mode and return one smallest safe next step without speculative repair. Use when commit/push/sync work cannot proceed safely due to unclear repository state.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: true
owner: model-agnostic-workflow-system
status: extracted
---

# Blocked Git State Resolver

## Purpose
Produce a read-only, fail-closed diagnosis for ambiguous Git state and return one minimal next action.

## Trigger
Use this skill when Git state is unclear, contradictory, or unsafe for commit/push/sync actions and a fail-closed diagnosis is required.

## When Not To Use
- Do not use when a normal safe commit/push skill can proceed deterministically.
- Do not use to perform direct history mutation.
- Do not use when the task explicitly requests execution instead of diagnosis.

## Non-Goals
- This skill does not repair state automatically.
- This skill does not run commit, push, pull, merge, or rebase operations.
- This skill does not delete or discard files.

## Expected Inputs
- blocked or ambiguous Git situation
- task scope context (if known)
- required decision point (commit, sync, push, or branch safety)

## Workflow
1. Run read-only Git diagnostics:
   - `git status`
   - `git branch`
   - `git log`
   - `git diff`
   - `git fetch`
   - `git merge-base`
2. If the worktree is dirty, do not use `checkout` or `switch`.
3. Classify:
   - branch
   - worktree cleanliness
   - staged / unstaged / untracked state
   - `main` vs `origin/main` relation
   - scope clarity (`yes` or `no`)
4. Return one concrete blocker and one smallest safe next step.
5. Do not guess missing facts; keep speculative fixes out of output.

## Output
Return exactly this shape:

- `Result: blocked`
- `Observed`
  - `Branch`
  - `Worktree`
  - `Staged`
  - `Unstaged`
  - `Untracked`
  - `main/origin/main relation`
  - `scope clear`
- `Blocker`
- `Smallest safe next step`

## Quality Checks
- Diagnosis remains read-only.
- Output contains one concrete blocker, not a vague list.
- Next step is singular, minimal, and safely executable.
