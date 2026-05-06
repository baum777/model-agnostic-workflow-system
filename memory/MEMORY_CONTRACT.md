# Memory Contract

Class: operational.
Use rule: this is the non-canonical Phase 2 memory boundary. It does not replace `core/contracts/workflow-memory-contract.json`.

## Authority

Memory is non-canonical.

Memory entries may support review, handoff, replay, and local operational awareness. They must not become durable truth unless a human-reviewed promotion updates an existing canonical surface.

## Allowed Content

- runtime observations
- validated run facts
- handoff summaries
- project-local working notes
- operator preferences
- decision candidates

## Forbidden Content

- secrets
- tokens
- private keys
- raw credentials
- unreviewed personal data
- canonical decisions
- contract replacements
- SOT replacements

## Runtime Write Boundary

- Controlled runtime memory writes are allowed only for runtime-scoped validated run facts.
- Runtime memory writes must point provenance to the active run artifacts.
- Unknown scope is blocked.
- Secret-bearing content is blocked.
- No automatic canonical promotion.
- No SQLite.
- No scheduler.
- No remote memory backend.

## Promotion Boundary

Promotion can only happen through explicit review into a real canonical target such as:

- `SOT.md`
- `DECISIONS.md`
- `MEMORY.md`
- `docs/*`
- `core/contracts/*`

Unreviewed memory remains evidence or candidate material only.
