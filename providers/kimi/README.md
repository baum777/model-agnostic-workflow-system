# Kimi Provider Adapter

Status: scaffolded.

This directory is the provider-specific export boundary for Kimi K2.5-compatible packaging.

## Current State

- canonical behavior stays in the shared core
- this adapter will eventually compile prompt bundles, tool serialization, and OpenAI-compatible transport metadata for Kimi surfaces

## Non-Goals

- no provider-specific behavior becomes canonical here
- no JSON-mode assumption may bypass shared schema validation
