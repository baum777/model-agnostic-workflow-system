# GENERIC-RUNTIME-CAPABILITY-MATRIX.md

Class: freeze artifact (canonical classification at freeze time).
Use rule: read together with GENERIC-RUNTIME-BASELINE.md. This matrix records
the state of every core capability at freeze (2026-09-14). It claims capability
and assurance posture — never production authorization, trust, or domain
activation.

Status values: PASS / PARTIAL / EXTERNAL_PORT / BLOCKED_OWNER_DECISION / HARDENING_ONLY

| Capability | Runtime | Contract | Tests | Assurance | Remaining Work |
| --- | --- | --- | --- | --- | --- |
| TaskContract | PASS | PASS (1.0.0, incl. resource_budget) | PASS | strict inline validator + JSON Schema | none |
| RuntimeState | PASS | PASS (closed 14-state SM enum) | PASS | digest-bound, schema-validated | none |
| Loop Controller | PASS | SM-canonical | PASS | applyDecision gate chain | none |
| Transition Enforcement | PASS | clg-transition-vocabulary.json | PASS | SM is sole transition authority | SM-GAP-1..4 = BLOCKED_OWNER_DECISION |
| Retry/Replan | PASS | SM-canonical (deliberate non-ledger) | PASS | RuntimeState stays execution truth | none (tuning = FUTURE_OPTIMIZATION) |
| Context Boundary | PASS | clg-context-manifest.json | PASS | foreign-task / over-budget DENY | EXTERNAL_PORT (real adapters) |
| Completion | PASS | clg-completion-contract.json | PASS | receipt completion-claims inert | none |
| Verification | PASS | clg-verification-record.json | PASS | claims cannot alter Verification | none |
| Authority Boundary | PASS | permission-boundary.json | PASS | subject / action / expiry enforced | EXTERNAL_PORT |
| Effect Boundary | PASS | completion/observability contracts | PASS | receipt identity runtime-owned | EXTERNAL_PORT |
| Checkpoint | PASS | clg-checkpoint-envelope.json 1.0.0 | PASS | digest + temp/rename atomicity | HARDENING (fsync class) |
| Resume | PASS | CLG-002 validation | PASS | identity preserved, no budget reset | none |
| Event Log | PASS | clg-runtime-event.json 1.0.0 | PASS | per-event digest, fail-closed reads | HARDENING (hash chain) |
| Memory Lifecycle | PASS | workflow-memory-contract.json | PASS | non-canonical, promotion gated | none |
| Resource Ledger | PASS | clg-resource-usage-record.json | PASS | admission-before-consumption, taint | EXTERNAL_PORT (tokens/cost sources) |
| Contract Alignment | PASS | 4 core contract schemas aligned | PASS | positive/negative matrix, historical compat | none |
| Evidence Chain | PASS | stage order + cross-artifact bindings | PASS | PASS/FAIL only (no PARTIAL invention) | none |
| State Consistency | PASS | SM-only projection semantics | PASS | CONSISTENT / INCONSISTENT / INSUFFICIENT_EVIDENCE | none |
| Adapter Conformance | PASS | generic-runtime-port-contract | PASS | 5 suites, no trust/authorization semantics | DOMAIN_INTEGRATION (real adapters) |

## Reading Rules

- No row carries an open CORE_CORRECTNESS or CORE_SAFETY gap.
- `EXTERNAL_PORT` means: the generic boundary is complete and conformance-tested;
  a real domain implementation is domain-integration work, not core work.
- `BLOCKED_OWNER_DECISION` means: the core enforces the state machine as-is;
  any semantic extension requires an explicit SM owner disposition
  (SM-GAP-1..4 remain OWNER_DECISION_REQUIRED).
- `HARDENING_ONLY` rows are complete as claimed; hardening closes defense-in-depth
  or operational gaps, never a documented-false claim.

## Assurance Family Map (what proves what)

| Family | Module(s) | Guarantees | Explicitly not guaranteed |
| --- | --- | --- | --- |
| Content integrity | checkpoint-integrity, runtime-event-log, resource-ledger, memory digest | per-artifact content mutation detection | stream/suffix rewrite detection, authenticity |
| Referential bindings | evidence-chain | stage order, causation, receipt/usage/task binding | source independence |
| State consistency | state-consistency | EventLog-vs-checkpoint agreement under SM semantics | controller correctness (same-process emitter) |
| Adapter conformance | adapter-conformance | port behavior vs generic contract | trust, production authorization, deployment approval |
