# Memory

Class: operational.
Use rule: this is the local memory skeleton index; canonical workflow and contract truth remains in `core/contracts/*` and durable repo decisions remain in reviewed canonical docs.

## Scope

This directory defines the Phase 2 memory structure only.

It may describe:

- runtime observations
- validated run facts
- handoff summaries
- project-local working notes
- operator preferences
- decision candidates

It enables:

- controlled runtime memory writes for runtime-scoped validated run facts

It does not enable:

- automatic canonical promotion
- SQLite storage
- scheduler behavior
- remote memory

## Validation

```bash
npm run memory:validate
```

The validator checks required files, policy markers, and JSON schema parseability. Passing validation does not mean memory persistence is active.

## Structure

```text
memory/
  README.md
  MEMORY_CONTRACT.md
  scopes/
  policies/
  schemas/
```

The JSONL runtime store is local-only and non-canonical.
