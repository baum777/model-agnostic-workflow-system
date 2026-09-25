# MAWS vNext — Owner Decision Record

Class: derived.
Status: owner-approved design input; not runtime activation.
Use rule: this record freezes the design decisions approved on 2026-09-25 for the MAWS vNext planning and implementation stream. It does not by itself modify current canonical runtime claims, grant authority, activate transports, or prove implementation.

## Baseline

Repository: baum777/model-agnostic-workflow-system
Baseline branch: main
Baseline commit: 93d3bc980360bacdc08a8f613d5fece9afc135d5
Current package version at baseline: 0.2.1

Target posture: evolve MAWS from provider-neutral workflow/skill routing plus local fail-closed runtime into a governed executor-centric work-graph runtime with a Jev-backed typed decision plane, while preserving deterministic authority, policy, qualification, and completion enforcement.

## Frozen Owner Decisions

### OD-01 — Executor-centric core with capability-centric resolution

The canonical execution abstraction is Executor, not Model.

Capability requirements are resolved before executor binding. Models, agent harnesses, deterministic services, humans, and future execution surfaces are executor classes.

Invariant:

~~~text
Workflow != Model
Capability != Authority
Executor != Authority
~~~

### OD-02 — Hybrid execution planning

The workflow owns mandatory stages, dependencies, authority ceilings, context boundaries, verification requirements, and composition limits.

The planner may dynamically bind executors and choose allowed composition within that envelope.

### OD-03 — Bounded decomposition

The planner may decompose a WorkUnit only inside inherited constraints.

~~~text
ChildScope subset ParentScope
ChildContext subset ParentContext
ChildEffects subset ParentAllowedEffects
ChildAuthority <= ParentAuthority
~~~

### OD-04 — Governed recursion through MAWS Planner only

Executors may request decomposition but may not directly create executable child bindings.

~~~text
Executor may request decomposition
Planner may instantiate validated child WorkUnits
Executor may not spawn MAWS-governed children directly
~~~

### OD-05 — Versioned plan mutation

A BoundExecutionGraph is immutable.

Runtime changes create PlanRevisionRequest -> validation -> PlanRevision -> new BoundExecutionGraph version.

Past execution truth and evidence are immutable.

### OD-06 — Typed revision requests

Executor, verifier, runtime, human, and policy/governance sources may request revisions only through declared request types.

No component may directly mutate the active graph.

### OD-07 — Version-anchored requests plus explicit revalidation

Every revision request records its base graph version.

A stale request must be explicitly revalidated or rebased. Silent rebasing and last-writer-wins are forbidden.

Expected revalidation outcomes:

- STILL_VALID
- CONFLICTING
- OBSOLETE
- REQUIRES_REBASE

### OD-08 — Policy-driven arbitration

Conflicting valid requests are resolved through explicit ArbitrationPolicy contracts.

The planner may classify and apply policy. It is not the source of authority.

### OD-09 — Evidence-backed executor qualification

Executor capability claims begin as declarations and become routable only after evidence-backed qualification.

~~~text
DECLARED != QUALIFIED
QUALIFIED != ELIGIBLE
ELIGIBLE != ASSIGNED
ASSIGNED != AUTHORIZED
~~~

### OD-10 — Qualification is Capability plus Execution Profile scoped

Qualification applies to a specific capability under a defined execution profile.

Global statements such as executor X is qualified are insufficient.

### OD-11 — Explicit profile subsumption

Qualification reuse is allowed only through an explicit formal profile-subsumption relation.

No heuristic similarity and no upward inference into broader context, tools, effects, network, delegation, or authority.

### OD-12 — Qualification fingerprint plus materiality rules

Qualification binds to a reproducible fingerprint covering all qualification-relevant execution state, including model/executor identity, provider/API behavior, harness/runtime, relevant tool contracts, execution profile, and qualification/eval profile.

Configuration deltas are classified as:

- NON_MATERIAL
- MATERIAL
- UNKNOWN

MATERIAL and UNKNOWN require requalification or fail-closed applicability.

### OD-13 — Policy-bounded runtime scoring

Qualification is the hard routing gate.

Inside the qualified candidate set, routing policy may use bounded verified runtime signals such as success, latency, cost, retries, verification failures, and provider availability.

Unverified self-report and unsupported quality inference are forbidden routing signals.

### OD-14 — Policy-bounded exploration

Exploration is allowed only inside the qualified candidate set and explicit policy limits.

Exploration must be disabled for high-risk, production-critical, irreversible, or insufficiently verifiable workloads.

### OD-15 — Policy-bounded multi-executor composition

A workflow declares whether multi-executor composition is allowed and which modes are permitted.

The planner may select count and bindings only inside those constraints.

Initial modes:

- independent_parallel
- producer_verifier
- specialist_synthesis

### OD-16 — Typed disagreement resolution

Multi-executor disagreement is classified before resolution.

Initial disagreement classes:

- factual_conflict
- implementation_conflict
- verification_conflict
- evidence_conflict
- policy_conflict
- authority_conflict

Each class must resolve only through its DisagreementPolicy. A synthesizer gains no independent authority.

### OD-17 — Contract-driven completion

Execution success is not completion.

A WorkUnit reaches COMPLETED only when its CompletionContract is satisfied, including required outputs, evidence, verification, graph conditions, and required disagreement/child closure.

~~~text
ACT != DID
Execution != Completion
Receipt != Verification
Output != Accepted Outcome
~~~

### OD-18 — Jev-backed typed MAWS control plane

The MAWS control plane uses TypeSafe Jev for bounded semantic decisions where the answer space is typed and already policy-bounded.

ZCode is the initial interaction surface. MAWS remains orchestration owner.

Canonical separation:

~~~text
ZCode session model
    -> interaction / intent submission

MAWS deterministic gates
    -> allowed state space

Jev
    -> typed semantic decision inside allowed choices

MAWS deterministic enforcement
    -> policy / authority / qualification / thresholds

Executor binding
    -> Codex harness / OpenRouter model / deterministic service / human
~~~

Jev must not grant authority, override policy, revive expired qualification, widen scope, mutate graphs directly, or convert low confidence into permission.

Core invariant:

~~~text
JevDecisionSpace subset DeterministicallyAllowedStateSpace
~~~

Development may request the moving alias jev-latest, but every decision receipt must record the resolved version returned by TypeSafe. As checked on 2026-09-25, jev-latest resolves to jev-1.13.0. Alias movement is a qualification-fingerprint/materiality event and must not be silently treated as identical behavior.

Source for current model alias: https://docs.typesafe.ai/models

## Session / execution boundary

The ZCode-selected session model does not automatically become the WorkUnit executor.

~~~text
InteractionSessionModel != WorkUnitExecutor
InteractionSessionModel != VerifierExecutor
Session selection != routing authority
~~~

The initial target flow is:

~~~text
ZCode
  -> MAWS intake
  -> deterministic envelope
  -> Jev decision bundle
  -> deterministic gates
  -> executor binding
      -> Codex harness using authenticated Codex path
      -> OpenRouter direct model executor
      -> deterministic service
  -> evidence
  -> verification
  -> CompletionContract
  -> result returned to ZCode
~~~

## Explicit non-decisions / non-goals

This record does not yet decide:

- final public semantic version number
- production HTTP/SSE service activation
- remote daemon/background scheduling
- automatic canonical promotion
- a TypeScript migration of the existing Node ESM runtime
- unrestricted provider fallback
- unrestricted agent self-spawn
- direct executor authority grants

## Adoption boundary

These decisions are owner-approved design inputs for vNext, but current canonical contracts and runtime claims remain unchanged until implementation slices update the owning canonical surfaces and their validators/evals.

Promotion rule:

1. change canonical contract or policy owner;
2. add/extend validator or eval;
3. implement runtime behavior where claimed;
4. produce evidence;
5. update docs/authority-matrix.md claim status;
6. only then describe the capability as validator-backed or runtime-implemented.
