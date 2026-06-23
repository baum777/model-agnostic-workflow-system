# Docs Proposals

## Class

proposal target / docs-only / non-canonical docs staging

## Status

active proposal target — not canonical until accepted

## Purpose

This directory stores proposed documentation changes before they are accepted into canonical docs.

Proposal files are review material, not final repo authority.

## Allowed Use

Allowed for Tier-1 draft-only workflows, including:

- future workflow proposals
- policy proposal drafts
- runtime-surface proposal drafts
- skill-contract proposal drafts
- reviewable documentation drafts

## Boundaries

- no secrets
- no `.env` contents
- no API keys
- no auth files
- no browser profiles
- no raw private credentials
- no automatic promotion to canonical docs
- no Vault writes

## Promotion Rule

A proposal may affect canonical docs only after a separate owner-approved promotion slice.

## Relation To Pi

Pi may write here only when:

- the accepted skill contract explicitly allows `./docs/proposals`
- write mode is `draft_only`
- approval tier is Tier 1
- network mode and vault mode remain within the skill boundary
- evidence is produced under `sandbox/runs/<timestamp>/`
