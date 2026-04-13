# Qwen Provider Adapter

Status: scaffolded.

This directory is the provider-specific export boundary for Qwen-compatible packaging.

## Current State

- canonical behavior stays in the shared core
- this adapter will eventually compile prompt bundles, tool serialization, and transport metadata for Qwen surfaces
- see `../../docs/qwen-3-6-intro.md` for the derived integration guide and task-routing crosswalk

## Non-Goals

- no provider-specific behavior becomes canonical here
- no hidden trust or tool filtering assumptions may bypass the shared core
