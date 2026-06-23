# Drafts

## Class

draft target / docs-only / non-canonical workspace

## Status

active draft target — no canonical truth

## Purpose

This directory stores temporary or reviewable draft artifacts created by governed Baum-OS / Pi / sandbox workflows.

Drafts are not canonical repo truth.

## Allowed Use

Allowed for Tier-1 draft-only workflows, including:

- proposal drafts
- review-card drafts
- MSPR packet drafts outside the Vault
- non-canonical working notes
- temporary handoff drafts

## Boundaries

- no secrets
- no `.env` contents
- no API keys
- no auth files
- no browser profiles
- no private credentials
- no automatic promotion to canonical docs
- no Vault writes

## Promotion Rule

A draft may become canonical only through a separate review/approval slice.

## Relation To Pi

Pi may write here only when:

- the skill contract allows `draft_file_write`
- write mode is `draft_only`
- approval tier is Tier 1
- evidence is produced under `sandbox/runs/<timestamp>/`
