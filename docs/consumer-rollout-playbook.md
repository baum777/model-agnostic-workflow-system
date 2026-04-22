# Consumer Rollout Playbook

Class: operational.
Use rule: use this playbook when a consumer overlay already exists and shared-core updates must be rolled out safely.

## Scope

- refresh shared-core lock and fingerprint in consumer manifest
- validate consumer linkage after shared-core updates
- keep canonical-vs-compatibility ownership explicit during rollout
- hand off bounded rollout evidence

## Rollout Flow

1. Refresh lock metadata: `npm run refresh-lock -- --consumer <consumer-root>`.
2. Validate consumer linkage: `npm run validate-consumer -- --consumer <consumer-root>`.
3. Validate adopted local input contracts where applicable.
4. If shared-core canonical surfaces changed, regenerate derived shared-core projections and rerun shared-core gates:
   - `npm run build-registry`
   - `npm run build-exports`
   - `npm run validate`
   - `npm run validate-neutral`
   - `npm run eval`
5. Review manifest and contract diff before merge/handoff.

## Compatibility Governance During Rollout

- Canonical semantic changes must originate in `core/contracts/*`, `core/skills/*`, or `policies/*`.
- Compatibility mirrors (`contracts/*`, legacy `providers/*`, `skills/*`, `docs/tool-contracts/catalog.json`) must remain derived outputs.
- Provider-specific rollout notes must not redefine canonical shared-core semantics.

## Handoff Evidence

1. Shared-core version and fingerprint used for rollout.
2. Validator/eval results and whether any failures were pre-existing and unrelated.
3. Any deferred consumer-local contract updates.
4. Explicit statement that compatibility/export surfaces were treated as derived.

## Notes

- Rollback behavior remains consumer-specific and is not a shared-core runtime control plane.
- Canonical boundaries remain in [architecture.md](architecture.md), [authority-matrix.md](authority-matrix.md), and [compatibility.md](compatibility.md).
- Command details remain in [maintainer-commands.md](maintainer-commands.md).

## Maturity Posture

- `prose-governed`: rollout and handoff sequence in this playbook.
- `contract-backed`: consumer manifest and canonical contract references used during rollout.
- `validator-backed`: `refresh-consumer-lock.mjs`, `validate-consumer-linkage.mjs`, and shared-core validators/evals.
- `runtime-implemented`: bounded to script execution and artifact outputs; no live migration orchestration service claimed.
