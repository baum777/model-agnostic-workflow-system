# Retention Policy

Class: operational.
Use rule: define retention labels for future memory entries without enabling storage.

## Labels

- `session`: valid for the active working session only
- `30d`: candidate material that should expire unless reviewed
- `durable-candidate`: material that may be promoted only after review

## Phase 2 Boundary

Retention labels are declared for schema shape only. No cleanup job, scheduler, or background process exists in Phase 2.
