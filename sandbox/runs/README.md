# Sandbox Runs Evidence

## Class

evidence directory / docs-only / sandbox-run bootstrap

## Status

active evidence location — no runtime execution

## Purpose

This directory stores evidence for future governed Baum-OS / Pi / sandbox runs.

A run is not complete unless it produces evidence.

## Directory Rule

Future runs should create a timestamped directory:

```text
sandbox/runs/<timestamp>/
```

Each run directory should contain:

```text
intent.md
files-read.md
files-changed.md
commands-run.md
diff.patch
validation.md
risks.md
next-gate.md
```

## Default Boundary

- no secrets
- no `.env` contents
- no API keys
- no auth files
- no browser profiles
- no raw private credentials
- no unredacted secret-bearing output

## Relation To Pi

Pi-assisted runs must follow:

- `runtime/surfaces/pi/evidence-contract.md`
- `runtime/surfaces/pi/handoff.md`
- `runtime/surfaces/pi/session-policy.md`

## Relation To Tier-1 Draft Session

The first accepted Tier-1 design is:

```text
docs/pi-tier-1-draft-session-design.md
```

No Tier-1 execution is approved by this directory bootstrap.

## Rule

Evidence may document execution.
Evidence must not silently authorize execution.
