# Pi Session Policy

## Tier Mapping
| Tier | Mode | Allowed |
|---|---|---|
| Tier 0 | read_only / no-tools | version, help, list-models, no-tools smoke |
| Tier 1 | draft_only | non-mutating drafts |
| Tier 2 | approved_write | edit/write/mutating bash with approval |
| Tier 3 | sensitive_action | external systems, live services, computer-use |
| Tier 4 | forbidden_or_blocked | secrets, open-ended sessions, unclear tools |

## Default
Pi sessions default to Tier 0 unless explicitly elevated.

## Forbidden By Default
- `bash`
- `edit`
- `write`
- open-ended sessions
- secrets
- `--api-key`
- production/external writes
- Vault writes

## Approval Rule
Any mutation requires explicit human approval before execution.

## Vault / Memory Boundary

Vault and Memory Bridge access follows:

`docs/vault-memory-bridge-boundary-decision.md`

Default:

- Vault context may be read only through approved read-only bridges.
- Vault write access is blocked by default.
- Any Pi-assisted Vault write is Tier 2+ and requires a separate owner-scoped write slice.
- Subagents must not write Vault notes or promote memory to truth.
