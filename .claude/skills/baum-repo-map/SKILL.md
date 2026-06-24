---
name: baum-repo-map
description: Map an unknown or partially known repo before planning changes. Use when the user asks to map a repo, establish documentation logic, understand workflow rules, define root memory behavior, or orient before starting implementation.
---

# Baum-Repo-Map

Read the repo before touching it. A map prevents boundary violations, duplicate work, and false confidence.

## Rules

- Start read-only.
- Do not modify any files.
- Do not run destructive commands (`rm`, `reset`, `clean`, etc.).
- Do not claim the repo is ready unless validation commands were actually run and passed.
- If a file is inaccessible, record the blocker — do not guess its contents.

## What to Identify

**Identity**
- Root path and name
- Package manager (npm/pnpm/yarn/pip/cargo/etc.)
- Runtime/language stack

**Key docs**
- README, CLAUDE.md, AGENTS.md, GEMINI.md, or equivalent
- Governance/evidence docs
- Changelog or release notes

**Structure**
- Source directories
- Test directories
- Generated / cache / vendor paths (exclude from analysis)
- Config files

**Agent/harness layer**
- `.claude/`, `.codex/`, or equivalent
- Hooks, skills, settings
- Memory files

**Validation**
- Test command
- Lint/type-check command
- Build command (if applicable)
- Whether these were run and what they returned

**Working tree**
- `git status` output
- Dirty files classified: intentional WIP vs unexpected

**Governance/evidence surfaces**
- Audit docs, gate logs, evidence files
- Boundary rules in agent instructions

## Required Output

```
Result: pass / blocked / partial

Repo identity:
  Path:
  Stack:
  Package manager:

Files read:
  -

Architecture map:
  Source:
  Tests:
  Generated/excluded:
  Config:

Governance map:
  Agent instructions:
  Skills:
  Hooks:
  Evidence surfaces:

Validation map:
  Test command:       [run? result?]
  Lint command:       [run? result?]
  Build command:      [run? result?]

Dirty tree classification:
  Modified:
  Untracked:
  Classification: intentional / unexpected / unknown

Risks/gaps:
  -

Empfohlener Arbeitsblock (optional — nur wenn Scope Gate oder Closure Gate relevant):
  Ziel:
  Grenzen:
  Done:
```
