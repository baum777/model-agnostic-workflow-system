---
name: baum-create-cli
description: Design CLI surfaces for Baum-OS, Pi-Harness, repo tools, validators, and operator commands. Use when the user asks to create, review, or specify a CLI, command interface, flag set, or operator tool.
---

# Baum-Create-CLI

Design the interface first, implementation second. A CLI is a contract — get the surface right before writing code.

## Clarify First (fast)

Ask only what's needed; proceed with best-guess defaults if the user is unsure:

- Command name + one-sentence purpose
- Primary user: humans, scripts, or both
- Input sources: args, stdin, files, URLs (never secrets via flags)
- Output contract: human text, `--json`, `--plain`, exit codes
- Interactivity: prompts allowed? need `--no-input`? confirmations for destructive ops?
- Config model: flags / env / config file; precedence; XDG vs repo-local
- Platform/runtime constraints

## Design Rules

- **Secrets**: never via flags or positional args — use env vars or stdin
- **Dry-run**: require `--dry-run` for any state-changing command where useful
- **Machine output**: offer `--json` for scriptable output where useful
- **Non-interactive**: offer `--no-input` where useful
- **Stderr**: diagnostics, progress, warnings go to stderr
- **Stdout**: primary data only
- **Destructive ops**: require explicit confirmation or `--force`
- **Subcommands**: prefer `noun verb` ordering (`repo map`, not `map-repo`)

## Required Output

```
Command name:
One-liner:

Usage synopsis:
  <command> [subcommand] [flags] [args]

Command tree:
  <command>
    <subcommand>   — description

Args and flags:
  | Flag | Short | Type | Default | Description |
  |------|-------|------|---------|-------------|

I/O contract:
  stdin:
  stdout:
  stderr:

Exit codes:
  0  success
  1  usage/input error
  2  runtime error
  (add as needed)

Config precedence:
  flags > env vars > config file > defaults

Safety rules:
  (destructive ops, dry-run requirements, secret handling)

Example invocations:
  1.
  2.
  3.
  4.
  5.
```

Implementation notes only if explicitly asked.
