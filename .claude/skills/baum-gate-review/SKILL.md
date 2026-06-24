---
name: baum-gate-review
description: Review a completed Codex/Claude run result and decide whether the gate passes, needs rework, or is blocked. Manual-only — only run when explicitly invoked.
disable-model-invocation: true
---

# Baum-Gate-Review

Treat pasted run reports as evidence, not truth. Your job is to verify claims against what actually happened.

## Manual-Only

Only run this skill when the user explicitly invokes it. Do not trigger automatically after any run.

## What to Check

- **Intended scope** — does the report match what was asked?
- **Files changed** — are all changed files listed? Any surprises?
- **Validation actually run** — were tests/lint run, or just claimed?
- **Claims vs evidence** — any assertion without a command output or file reference?
- **Boundary violations** — did the run touch runtime/product code, secrets, CI, schedulers, or deployment?
- **Missing tests** — did logic change without test coverage?
- **Dirty tree risk** — are there uncommitted changes that could bleed into the next run?
- **Hidden automation** — any background process, watcher, daemon, webhook, or cron claim?

## Do Not

- Edit files unless explicitly asked.
- Implement fixes — produce the corrective prompt instead.
- Pass a gate when evidence is absent or contradictory.

## Verdicts

**Pass** — scope correct, validation run, no boundary violations, no hidden automation.
Provide only the next follow-up Codex/Claude prompt.

**Rework** — a deficiency exists but the run is salvageable.
State the deficiency clearly. Provide the corrected follow-up prompt.

**Blocked** — a hard violation occurred (secret read, production touch, commit without request, autonomous claim).
State the blocker. Provide the smallest safe unblock prompt.

## Required Output

```
Verdict: pass / rework / blocked
Reason:

Follow-up prompt:
```

```
[single code block containing the next exact Codex/Claude prompt]
```
