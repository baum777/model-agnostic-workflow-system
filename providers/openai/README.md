# OpenAI Provider Adapter

Status: scaffolded.

This directory is the provider-specific export boundary for OpenAI, Codex, and GPT-compatible packaging.

## Current State

- canonical behavior stays in the shared core
- this adapter will eventually compile prompt bundles, tool serialization, and packaging metadata
- `.codex-plugin/plugin.json` remains the compatibility export for the current Codex surface

## Non-Goals

- no provider-specific behavior becomes canonical here
- no hidden policy or approval logic is allowed to bypass the shared core
