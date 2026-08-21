# Registry Disposition Contract

Class: canonical.
Use rule: classify the registry consequence of a completed run without granting authority to a registry or turning it into a run log.

## Authority Boundary

This shared-core policy owns the portable Registry Disposition grammar and relevance rules. A consuming registry records evidence and references; it does not create source, contract, or authority truth.

The three decisions are distinct:

```text
material_change != registry_relevant_change != registry_write
```

- `material_change` means the run changed a durable repository artifact or behavior.
- `registry_relevant_change` means that material change altered at least one closed relevance class below.
- `registry_write` is the separate act evidenced only by `status: UPDATED` and a non-null `registry_commit_sha`.

## Closed Relevance Taxonomy

A change is registry-relevant only when it changes at least one of:

- `SOURCE_RECORD`
- `CONTRACT_RECORD`
- `AUTHORITY_MAPPING`
- `DEPENDENCY_BINDING`
- `LIFECYCLE_BINDING`
- `SUPERSESSION`
- `PROVENANCE`
- `REGISTERED_IMPLEMENTATION_BINDING`

Each `affected_records` entry uses the closed syntax `<RELEVANCE_CLASS>:<record-ref>`. The class prefix must be one of the eight values above and the record reference must be non-empty. When `registry_relevant_change` is true, at least one such entry and at least one `classification_evidence_refs` entry are required. When it is false, `affected_records` must be empty. This makes relevance a validator-backed classification rather than an agent assertion.

Implementation details, refactors, tests, bug fixes, UI changes, runtime optimizations, and documentation clarifications are not automatically registry-relevant. They become relevant only when they alter a registered binding, record, or claim in the closed taxonomy.

## Canonical Grammar

```yaml
registry_disposition:
  status: NO_CHANGE | UPDATED | REQUIRED_BUT_BLOCKED
  material_change: true | false
  registry_relevant_change: true | false
  reason: ""
  registry_baseline_sha: ""
  affected_records: []
  authority_refs: []
  source_refs: []
  supersession_refs: []
  provenance_refs: []
  evidence_refs: []
  implementation_commit_sha: ""
  registry_commit_sha: null
  validation: []
  contract_version: "registry-disposition.v1"
  classification_evidence_refs: []
```

The canonical machine-readable shape is `core/contracts/registry-disposition.schema.json`.

## Blocking Invariants

1. `registry_relevant_change: true` with `status: NO_CHANGE` is invalid.
2. `status: UPDATED` requires `registry_relevant_change: true`, a non-null `registry_commit_sha`, and at least one `affected_records` entry.
3. `status: REQUIRED_BUT_BLOCKED` requires `registry_relevant_change: true`, a non-empty `reason`, at least one `evidence_refs` entry, and `registry_commit_sha: null`.
4. A non-null `registry_commit_sha` is invalid unless `status: UPDATED`.
5. `material_change: false` with `registry_relevant_change: true` is invalid. A future reconciliation-only class requires an explicit contract revision and is not implied by v1.

## Adoption Boundary

This contract does not activate repo-local agent bindings, CI gates, or registry writes. Consumers may adopt it only through an explicit, separately reviewed binding. Until a required registry update is independently approved and verified, the correct disposition is `REQUIRED_BUT_BLOCKED`.
