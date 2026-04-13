# Qwen-Code Provider Adapter

Status: scaffolded.

This directory is the canonical provider-specific export boundary for Qwen Code-compatible packaging.

## Current State

- canonical behavior stays in the portable core
- this adapter compiles the portable core into Qwen Code packaging and transport metadata
- see `../../docs/qwen-3-6-intro.md` for the derived integration guide and task-routing crosswalk

## Non-Goals

- no provider-specific behavior becomes canonical here
- no hidden trust or tool filtering assumptions may bypass the shared core
