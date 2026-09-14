# GENERIC-RUNTIME-BASELINE.md

Class: freeze baseline (canonical for the generic runtime core surface).
Use rule: this file pins the frozen baseline of the generic Context+Loop runtime
kernel. It documents what is frozen — not what is authorized. Freeze is not
production readiness, not domain activation, and not security certification.

## Freeze Statement

```yaml
scope: GENERIC_RUNTIME_CORE
status: FROZEN_BASELINE
frozen_on: 2026-09-14
functional_core: CLOSED
assurance_core: CLOSED
remaining_internal_work:
  class: HARDENING_ONLY
next_phase: DOMAIN_INTEGRATION_READINESS
production_authorized: false
```

The freezing commit itself is recorded in the parent repository evidence trail
(`CLG-GENERIC-CORE-FREEZE-01-RUN.md`, runtime/context-loop-kernel/ in the
baum-os workspace). The functional/assurance baseline is the P0–P11 chain whose
last pre-freeze shared-core commit is `7fcbbbc` (P11 adapter conformance).

## Version Pins

```yaml
shared_core_repo: model-agnostic-workflow-system (branch rescue/astra-safety-harness)
pre_freeze_shared_core_sha: 7fcbbbcb8cb559e9c88139c63960b24fadf1153b
runtime_version: 0.1.0            # runtime/kernel/runtime-context.mjs RUNTIME_VERSION
state_machine_version: 0.1.0      # runtime/kernel/loop-state-machine.mjs STATE_MACHINE_VERSION
contract_versions:
  clg-task-contract.json: 1.0.0
  clg-runtime-state.json: 1.0.0
  clg-runtime-event.json: 1.0.0
  clg-checkpoint-envelope.json: 1.0.0
  clg-resource-usage-record.json: 1.0.0
  clg-verification-record.json: 1.0.0
  clg-context-manifest.json: 1.0.0
  clg-transition-vocabulary.json: 1.0.0
  clg-completion-contract.json: 1.0.0
  clg-runtime-state lifecycle enum: closed 14-state kernel SM vocabulary
checkpoint_contract_version: 1.0.0   # runtime/kernel/checkpoint-integrity.mjs
artifact_versions:
  runtime_event_log: 1.0.0           # runtime-event-log.mjs EVENT_LOG_VERSION
  resource_usage_record_version: 1.0.0   # resource-ledger.mjs USAGE_RECORD_VERSION
  memory_record_version: 1.0.0           # memory-lifecycle.mjs MEMORY_RECORD_VERSION
```

## Test and Validation Baseline (at freeze)

```yaml
test_baseline:
  full_suite: 284/284 PASS          # node --test $(find tests -name "*.test.mjs" | sort)
  dry_run: 18/18 PASS               # runtime/cli/runtime-dry-run.mjs
  phase_targeted_suites:
    P2_transition_enforcement: PASS
    P3_authority_effect_boundary: PASS
    P4_checkpoint_resume: PASS
    P5_event_log: PASS
    P6_memory_lifecycle: PASS
    P7_resource_ledger: PASS
    P8_contract_alignment: PASS (11)
    P9_evidence_chain: PASS (14)
    P10_state_consistency: PASS (13)
    P11_adapter_conformance: PASS (9)
validation_baseline:
  validate: PASS
  validate-neutral: PASS
  validate-baumos-contracts: PASS
  validate-secrets: PASS
  validate-blocked-branch: PASS (expected fixture outcome: blocked true, 2 CRITICAL)
  git_diff_check: PASS
mimosa_note: >
  Mimosa scanner compat-pass findings (library_source_limit_exceeded,
  callgraph_fact_partial, scanner_enobufs) are explicitly NOT A SECURITY CLAIM.
```

## Durability Vocabulary (exact claims at freeze)

All persistence claims in the frozen core mean exactly:
"persisted across normal process restart". No fsync-backed, power-loss-surviving,
or crash-safe durability is implemented or claimed. See
GENERIC-RUNTIME-OPEN-GAPS.md (CRASH_DURABILITY class).

## Frozen Architecture Invariants

```text
Context != Permission. Authority != Effect. Receipt != Verification.
Checkpoint != Verification != Completion. EventLog != RuntimeState != Checkpoint != Memory != Ledger.
Memory != Canonical (EXTERNAL_POLICY). Resource admission != Authority != Completion.
CONFORMANCE != TRUST != PRODUCTION_AUTHORIZATION != DEPLOYMENT_APPROVAL.
CONSISTENT (state consistency) != verification != authority != completion.
Event history may constrain RuntimeState evaluation; it never replaces RuntimeState
as execution truth; evaluators are read-only and repair nothing.
```

## Post-Freeze Capability Addition Rule

No new generic runtime capability enters this baseline without an explicit
architecture disposition per GENERIC-RUNTIME-CHANGE-POLICY.md.
