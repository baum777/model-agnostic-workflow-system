# Codex Compatibility Export

Status: compatibility export only.

This directory represents the current Codex-specific packaging boundary while the repo transitions toward a provider-neutral core.

## Current State

- canonical behavior lives in the shared core
- this boundary exists so the existing Codex package surface can remain stable during migration
- `.codex-plugin/plugin.json` remains the live compatibility manifest for this export

## Non-Goals

- this directory does not define shared semantics
- this directory does not override the neutral registry in `contracts/`
