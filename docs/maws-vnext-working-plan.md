# MAWS vNext — Current-State Map and Detailed Working Plan

Class: derived.
Status: implementation plan.
Baseline: main @ 93d3bc980360bacdc08a8f613d5fece9afc135d5.
Decision source: docs/maws-vnext-owner-decisions.md.

## 1. Objective

Evolve the current shared core into a governed executor-centric MAWS vNext runtime that can be initiated from a ZCode session, use TypeSafe Jev as a fast typed semantic decision engine, route qualified WorkUnits to Codex and OpenRouter executors, preserve fail-closed authority and policy boundaries, and prove completion through evidence and verification.

The implementation must be additive and compatibility-preserving. Existing workflow/skill routing and provider export semantics remain valid until explicitly superseded.

## 2. Current truth — Observed

The following facts were read from main at baseline commit 93d3bc980360bacdc08a8f613d5fece9afc135d5.

### Existing strengths to reuse

| Current surface | Observed state | vNext reuse |
| --- | --- | --- |
| WORKFLOW.md | canonical workflow classes, gates, stop conditions, execution-claim discipline | retain as workflow-entry authority; extend only after new runtime contracts exist |
| core/contracts/workflow-routing-map.json | validator-backed mapping from workflow class to skills/tools/MCP posture/output/evidence/completion posture | keep for workflow-class routing; do not overload it with executor routing |
| core/contracts/provider-capabilities.json | canonical provider-level portability vocabulary: toolUse, structuredOutputs, mcp, subagents | retain as provider transport/packaging capability contract; add separate executor/capability contracts |
| runtime/adapters/provider-adapter-base.mjs | pure provider normalization layer; explicitly no network I/O | preserve; vNext adds transport/executor layer instead of injecting I/O here |
| core/contracts/permission-boundary.json | deny-by-default permission categories including provider.model_call, external.http, subagent.spawn | extend rather than replace |
| runtime/permissions/permission-engine.mjs | local fail-closed permission engine; filesystem write only inside run artifacts; external.http denied | evolve into explicit outbound/provider decision enforcement |
| core/contracts/resource-governor.json | contract surface for budgets, retries, fallback constraints; runtime enforcement deferred | evolve into run/work-unit budget envelope |
| core/contracts/observability-spine.json | provider-neutral event envelope with provenance/outcome/metrics | extend with planner/routing/qualification/graph events |
| core/contracts/output-contracts.json | workflow run/validation/certification evidence contracts | extend with decision/routing/execution/verification receipts |
| evals + scripts/tools/run-certification-evals.mjs | deterministic certification framework already exists | extend with vNext fixture families |
| runtime local evidence | run artifacts, replay, permission/evidence discipline | retain and extend into work-graph receipts |
| providers/openai-codex | canonical export scaffold only | preserve as packaging projection; add Codex runtime executor separately |

### Missing / gap state

| vNext capability | Baseline state | Gap class |
| --- | --- | --- |
| Executor as first-class runtime object | absent | NEW CONTRACT + RUNTIME |
| capability-centric executor resolution | absent | NEW CONTRACT + RUNTIME |
| evidence-backed qualification / eligibility | absent | NEW SUBSYSTEM |
| execution profiles and profile subsumption | absent | NEW CONTRACT + VALIDATOR |
| qualification fingerprints/materiality | absent | NEW CONTRACT + VALIDATOR |
| bound WorkGraph and immutable graph versions | absent | NEW SUBSYSTEM |
| bounded decomposition / governed recursion | absent | NEW PLANNER |
| typed revision requests / stale revalidation | absent | NEW PLANNER |
| policy arbitration / disagreement policies | absent | NEW POLICY + DECISION |
| runtime scoring / exploration | absent | NEW ROUTER |
| multi-executor composition | only proposed role/team docs; no governed runtime semantics | NEW RUNTIME |
| WorkUnit CompletionContract | current completion posture exists at workflow-class level only | EXTEND, DO NOT REPLACE |
| Jev | no integration | NEW DECISION ENGINE |
| OpenRouter | no provider/runtime surface | NEW EXECUTOR TRANSPORT |
| ZCode | no surface/integration | NEW INTERACTION ADAPTER |
| Codex subscription-backed runtime execution | provider export scaffold only; no authenticated Codex harness runtime | NEW EXECUTOR TRANSPORT |
| live MCP entry | explicitly not activated | SEPARATE ACTIVATION GATE |

## 3. Architectural target

~~~text
ZCode interaction session
        |
        v
MAWS intake / WorkUnit normalization
        |
        v
Deterministic envelope
  - scope
  - authority ceiling
  - policy
  - qualification applicability
  - budget
        |
        v
Jev typed decision engine
  - work classification
  - decomposition recommendation
  - routing preference among allowed candidates
  - risk / verification / disagreement classification
        |
        v
Deterministic decision gates
        |
        v
BoundExecutionGraph vN
        |
        +--> Codex harness executor
        +--> OpenRouter executor
        +--> deterministic service
        +--> human gate
        |
        v
Evidence / Verification / CompletionContract
        |
        v
Result to ZCode
~~~

## 4. Preserve / extend / add / defer map

### Preserve unchanged in principle

- provider adapter purity: adapters transform, transports execute;
- canonical-vs-derived authority hierarchy;
- fail-closed execution claim policy;
- provider export generation;
- current compatibility mirrors;
- local evidence and replay posture;
- secret minimization on provider switch.

### Extend

- permission-boundary contract;
- resource-governor contract;
- observability spine;
- output contracts;
- eval catalog/runner;
- authority matrix;
- provider capability matrix;
- runtime manifest/evidence artifacts.

### Add

- WorkUnit and ExecutionProfile contracts;
- ExecutorManifest and ExecutorRegistry contracts;
- CapabilityDefinition and CapabilityRequirement contracts;
- QualificationRecord, QualificationFingerprint, MaterialityDecision;
- EligibilityDecision;
- RoutingRequest and RoutingDecision;
- ExecutionPlanTemplate / CandidateGraph / BoundExecutionGraph;
- DecompositionRequest/Decision;
- PlanRevisionRequest/Decision and GraphSupersessionRecord;
- ArbitrationPolicy/Decision;
- CompositionPolicy/Decision;
- DisagreementPolicy/Decision;
- CompletionContract/CompletionDecision;
- Jev DecisionRequest/DecisionReceipt;
- Codex harness executor;
- OpenRouter executor;
- ZCode interaction surface.

### Defer

- production HTTP/SSE control-plane service;
- remote daemon/background scheduler;
- automatic canonical promotion;
- global self-modifying qualification;
- unrestricted provider fallback;
- unrestricted autonomous agent spawning.

## 5. Implementation waves

Each wave follows the repo TTD frame: Decision, Owner/Scope, Contract, Gate/Test, Implementation Slice, Evidence, Next Gate.

---

## Phase 0 — Baseline and decision lock

### MAWS-VN-000 — Freeze owner decisions
Mode: AFK
Scope: docs/maws-vnext-owner-decisions.md

DoD:
- OD-01 through OD-18 are present;
- session model vs executor boundary is explicit;
- Jev authority prohibition is explicit;
- document is marked design input, not runtime activation.

### MAWS-VN-001 — Baseline drift fixture
Mode: AFK
Scope: evals/fixtures/maws-vnext-baseline.json plus validator hook.

Contract:
- baseline commit;
- current package version;
- required current canonical surfaces;
- explicit absence markers for Jev/OpenRouter/ZCode/executor qualification.

Gate:
- fixture passes on baseline-derived target branch;
- future work cannot accidentally claim a vNext surface before its ticket promotes maturity.

DoD:
- a deterministic check distinguishes ABSENT, CONTRACT_ONLY, VALIDATOR_BACKED, RUNTIME_IMPLEMENTED.

### MAWS-VN-002 — Authority-matrix planning entries
Mode: AFK
Scope: docs/authority-matrix.md

DoD:
- every new vNext family enters as planned or contract-only only when its contract lands;
- no runtime claim is introduced in Phase 0.

Next gate: Phase 1 contracts.

---

## Phase 1 — Canonical vNext contract spine

### MAWS-VN-100 — WorkUnit contract
Mode: AFK
Add: core/contracts/work-unit.schema.json

Required semantics:
- immutable work_unit_id;
- objective/intent;
- parent_work_unit_id optional;
- required capabilities;
- context envelope reference;
- authority ceiling reference;
- decomposition policy reference;
- completion contract reference;
- dependency refs;
- run and graph version refs.

DoD:
- JSON Schema validates positive/negative fixtures;
- child cannot declare fields that imply authority expansion without separate validation failure.

### MAWS-VN-101 — Capability and execution-profile contracts
Mode: AFK
Add:
- core/contracts/capability-definition.schema.json
- core/contracts/execution-profile.schema.json
- core/contracts/profile-subsumption.schema.json

DoD:
- profiles are dimensioned across tools/effects/context/network/delegation/verification;
- no global scalar broader/stricter shortcut;
- explicit subsumption fixture proves safe downward reuse and rejects upward inference.

### MAWS-VN-102 — Executor manifest and registry contract
Mode: AFK
Add:
- core/contracts/executor-manifest.schema.json
- core/contracts/executor-registry.schema.json

Executor classes:
- llm
- agent_harness
- deterministic_service
- human

DoD:
- provider identity is separated from executor identity;
- model identity is separated from provider binding;
- InteractionSessionModel is not an executor binding by default.

### MAWS-VN-103 — Qualification / eligibility contract family
Mode: AFK
Add:
- qualification-record.schema.json
- qualification-fingerprint.schema.json
- materiality-decision.schema.json
- eligibility-decision.schema.json

DoD:
- DECLARED cannot satisfy routability;
- QUALIFIED is capability+profile scoped;
- expiration/revocation/material drift makes current applicability fail closed;
- fingerprint stores all behaviorally relevant components.

### MAWS-VN-104 — Planning and graph contract family
Mode: AFK
Add:
- execution-plan-template.schema.json
- candidate-graph.schema.json
- bound-execution-graph.schema.json
- decomposition-request.schema.json
- decomposition-decision.schema.json

DoD:
- bound graph carries graph_version;
- graph version is immutable by contract;
- decomposition limits include max_depth/max_children/max_total_work_units;
- child envelope cannot widen parent envelope.

### MAWS-VN-105 — Revision / arbitration / disagreement contracts
Mode: AFK
Add:
- plan-revision-request.schema.json
- plan-revision-decision.schema.json
- graph-supersession-record.schema.json
- arbitration-policy.schema.json
- arbitration-decision.schema.json
- disagreement-policy.schema.json
- disagreement-decision.schema.json

DoD:
- revision request requires base_graph_version;
- stale paths have explicit revalidation result;
- policy/authority conflict cannot resolve via majority/synthesis.

### MAWS-VN-106 — Routing / composition / completion contracts
Mode: AFK
Add:
- routing-request.schema.json
- routing-decision.schema.json
- composition-policy.schema.json
- composition-decision.schema.json
- completion-contract.schema.json
- completion-decision.schema.json

DoD:
- routing records selection_mode;
- qualification reference is mandatory;
- composition has explicit max executor and allowed mode bounds;
- COMPLETED cannot validate without required evidence and verification.

### MAWS-VN-107 — vNext contract validator and eval family
Mode: AFK
Add/extend:
- scripts/tools/validate-maws-vnext-contracts.mjs
- evals/catalog.json
- evals/fixtures/maws-vnext/*

Gate:
- npm run validate-maws-vnext
- npm run eval:maws-vnext

DoD:
- all OD-01..OD-17 semantic invariants have at least one negative fixture.

Next gate: no runtime implementation until contract suite passes.

---

## Phase 2 — Jev typed decision engine

### MAWS-VN-200 — TypeSafe client boundary
Mode: HITL for API credential availability; code itself AFK.
Add:
- runtime/decision-engine/jev/client.mjs
- runtime/decision-engine/jev/model-resolution.mjs
- runtime/decision-engine/jev/decision-receipt.mjs

Dependency:
- TypeSafe JS SDK or direct API client chosen without migrating the whole repo language.

Posture:
- development request model: jev-latest;
- always persist resolved model from response;
- resolved-model change enters materiality evaluation.

DoD:
- API key read only from server-bound environment;
- secret never enters state, logs, evidence, or prompt;
- timeout/rate-limit failure returns typed BLOCKED/ESCALATE path;
- no fallback to an unrestricted generative model.

### MAWS-VN-201 — Decision question registry
Mode: AFK
Add: runtime/decision-engine/questions/

Initial typed decisions:
- work_class
- decomposition_needed
- risk_class
- preferred_executor from pre-filtered candidates
- composition_mode
- independent_verification_required
- revision_type
- disagreement_type
- evidence_sufficiency

DoD:
- every Choice is constructed only from deterministic candidate input;
- Jev cannot invent executor IDs or permissions;
- confidence/probability retained in receipt.

### MAWS-VN-202 — Threshold policy
Mode: HITL for threshold approval after eval.
Add:
- core/contracts/decision-threshold-policy.schema.json
- policies/decision-thresholds.yaml

DoD:
- low confidence maps to re-evaluate, deterministic fallback, or human gate;
- low confidence never maps to wider authority;
- thresholds may be model-version scoped.

### MAWS-VN-203 — Jev fixture/eval harness
Mode: HITL if live TypeSafe access is required; deterministic replay fixture AFK.

Required cases:
- valid candidate preference;
- disallowed candidate injection attempt;
- low confidence;
- alias resolution drift;
- oversized state handling;
- API unavailable;
- conflicting semantic signals.

DoD:
- replayable decision receipts exist;
- live and fixture modes are distinguishable.

Next gate: Jev may advise only; executor binding still blocked until Phases 3-4.

---

## Phase 3 — Qualification and eligibility engine

### MAWS-VN-300 — Executor registry runtime
Mode: AFK
Add:
- runtime/executors/registry.mjs
- runtime/executors/manifest-loader.mjs

DoD:
- registry loads only schema-valid executor manifests;
- aliases cannot silently shadow canonical IDs.

### MAWS-VN-301 — Qualification applicability engine
Mode: AFK
Add:
- runtime/qualification/applicability.mjs
- runtime/qualification/profile-subsumption.mjs
- runtime/qualification/fingerprint.mjs
- runtime/qualification/materiality.mjs

DoD:
- exact match and explicit safe subsumption work;
- broader requested effect/context/network/delegation fails;
- MATERIAL and UNKNOWN fingerprints are unroutable.

### MAWS-VN-302 — Eligibility engine
Mode: AFK

Input:
- WorkUnit capability requirements;
- qualification applicability;
- provider availability;
- context/data rules;
- budget;
- authority compatibility.

Output:
- closed candidate set plus exclusion reasons.

DoD:
- Jev receives only this candidate set;
- qualification cannot be bypassed by score.

---

## Phase 4 — Executor transport layer

Architecture rule: provider adapters remain pure transformation layers. Network/process execution lives under runtime/executors or runtime/transports.

### MAWS-VN-400 — Generic executor interface
Mode: AFK
Add:
- runtime/executors/executor-base.mjs
- runtime/executors/execution-attempt.mjs
- runtime/transports/

DoD:
- execute returns normalized ExecutionResult + receipt metadata;
- transport cannot mutate canonical contracts.

### MAWS-VN-401 — Codex harness executor
Mode: HITL for local ChatGPT/Codex authentication; implementation AFK.

Initial integration:
- prefer isolated codex exec invocation for tracer bullet;
- app-server/SDK integration is a later extension if required for persistent/streamed control.

DoD:
- Codex is registered as agent_harness, not merely model;
- auth material stays outside work context/evidence;
- WorkUnit receives bounded ContextPackage and authority envelope;
- process exit/timeout/cancel are normalized;
- no implicit subagent spawn outside MAWS governed recursion.

### MAWS-VN-402 — OpenRouter executor
Mode: HITL for OPENROUTER_API_KEY; code AFK.
Add:
- runtime/executors/openrouter-executor.mjs
- provider metadata surface under canonical provider contracts.

DoD:
- explicit model ID is recorded per execution;
- provider fallback is disabled by default or surfaced as a new MAWS routing decision;
- full-context fallback reuse is forbidden;
- cost/latency/token usage is normalized into observability metrics.

### MAWS-VN-403 — TypeSafe outbound permission activation
Mode: HITL for policy approval.

Extend:
- core/contracts/permission-boundary.json
- runtime/permissions/permission-engine.mjs
- secret-boundary validator.

DoD:
- outbound access is allowlisted by provider/action/target;
- api.typesafe.ai and OpenRouter are explicit targets, not generic external.http allow;
- server-bound credential references only;
- all denied attempts produce permission evidence.

Next gate: one direct executor can run under explicit permission in local mode.

---

## Phase 5 — Planner and versioned work graph

### MAWS-VN-500 — WorkGraph store
Mode: AFK
Add:
- runtime/planner/work-graph-store.mjs
- runtime/planner/graph-versioning.mjs

DoD:
- active graph pointer plus immutable historical versions;
- completed execution/evidence cannot be rewritten;
- graph version preconditions enforce optimistic concurrency.

### MAWS-VN-501 — Hybrid planner
Mode: AFK

Responsibilities:
- apply workflow template constraints;
- ask Jev bounded semantic questions;
- emit CandidateGraph;
- never grant authority.

DoD:
- mandatory stages cannot be removed by planner;
- candidate graph requires deterministic validation before binding.

### MAWS-VN-502 — Bounded decomposition and governed recursion
Mode: AFK

DoD:
- executor can emit DecompositionRequest only;
- planner validates inheritance and limits;
- max depth/children/total nodes enforced;
- child scope/context/effects/authority never widen parent.

### MAWS-VN-503 — Versioned revision engine
Mode: AFK

DoD:
- base_graph_version mandatory;
- stale request -> explicit revalidation;
- no silent rebase;
- outputs STILL_VALID, CONFLICTING, OBSOLETE, REQUIRES_REBASE;
- accepted revision creates new graph version, not mutation.

### MAWS-VN-504 — Policy arbitration
Mode: AFK

DoD:
- conflict class selects explicit ArbitrationPolicy;
- authority conflict cannot resolve through synthesis;
- arbitration decision is evidence-producing.

---

## Phase 6 — Routing, scoring, exploration, composition

### MAWS-VN-600 — Routing core
Mode: AFK

Pipeline:
~~~text
capability requirements
 -> qualification applicability
 -> eligibility
 -> policy constraints
 -> Jev bounded preference
 -> deterministic threshold/gate
 -> ExecutorBinding
~~~

DoD:
- every binding references RoutingDecision;
- session model has no implicit preference unless workflow policy explicitly states it.

### MAWS-VN-601 — Runtime evidence scoring
Mode: AFK

DoD:
- only verified run evidence contributes;
- metrics are capability+profile+workload scoped;
- self-reported quality cannot enter score.

### MAWS-VN-602 — Bounded exploration
Mode: AFK

DoD:
- only qualified candidates;
- max exploration share enforced;
- high-risk/production-critical/irreversible/weak-verification work rejects exploration;
- routing receipt marks selection_mode=exploration.

### MAWS-VN-603 — Multi-executor composition
Mode: AFK

Implement initial modes:
- independent_parallel
- producer_verifier
- specialist_synthesis

DoD:
- workflow policy bounds allowed modes/count/parallelism/budget;
- composition does not aggregate authority.

### MAWS-VN-604 — Typed disagreement runtime
Mode: AFK

DoD:
- disagreement classification is typed;
- resolution policy selected explicitly;
- factual conflict can require evidence/independent verification;
- policy/authority conflict fail-closed or escalates;
- synthesizer cannot self-authorize a resolution outside policy.

---

## Phase 7 — Evidence, verification, completion

### MAWS-VN-700 — Observability spine extension
Mode: AFK

Add event families for:
- work_unit.lifecycle
- planner.decision
- qualification
- eligibility
- routing
- executor.binding
- execution
- graph.revision
- arbitration
- disagreement
- verification
- completion

DoD:
- run_id, work_unit_id, graph_version, executor_id, qualification ref, routing decision ref are correlatable.

### MAWS-VN-701 — Decision and execution receipts
Mode: AFK

Extend output contracts for:
- Jev DecisionReceipt;
- QualificationApplicability;
- RoutingDecision;
- CompositionDecision;
- ExecutionAttempt/Result;
- VerificationReceipt;
- CompletionDecision.

### MAWS-VN-702 — Completion engine
Mode: AFK

DoD:
- executor success alone never marks COMPLETED;
- required child/dependency closure enforced;
- unresolved mandatory disagreement blocks;
- required evidence and verification enforced;
- CompletionDecision names every satisfied/unsatisfied clause.

---

## Phase 8 — ZCode interaction surface

### MAWS-VN-800 — Session/execution boundary contract
Mode: AFK
Add:
- core/contracts/interaction-session.schema.json
- core/contracts/execution-surface-boundary.schema.json

DoD:
- interaction host and session model are metadata;
- orchestration owner = MAWS;
- host model may submit/query/present;
- host model may not override bound executor, mutate graph, or create MAWS children.

### MAWS-VN-801 — Local ZCode entry tracer bullet
Mode: HITL for ZCode installation/runtime access.

Preferred first activation:
- local stdio MCP surface or equivalent local process bridge;
- no HTTP/SSE listener;
- submit_work, get_run, get_work_graph, approve, cancel only.

DoD:
- request from ZCode creates MAWS WorkUnit;
- selected ZCode model does not force executor choice;
- transport identity and permission are local and explicit;
- existing MCP activation docs are updated only when runnable proof exists.

### MAWS-VN-802 — ZCode plugin packaging
Mode: AFK after 801.

DoD:
- plugin only exposes interaction commands/skills and MAWS connection config;
- no duplicate planner/routing logic inside ZCode plugin.

---

## Phase 9 — End-to-end reference path

### MAWS-VN-900 — Reference scenario
Mode: HITL for live provider credentials.

Scenario:
~~~text
ZCode session model
 -> submit "audit and repair repository"
 -> MAWS intake
 -> Jev classifies/decomposition/routing preference
 -> analysis optionally OpenRouter
 -> implementation Codex harness
 -> deterministic tests
 -> optional independent verifier
 -> CompletionContract
 -> result to ZCode
~~~

Required evidence:
- session metadata;
- WorkUnit;
- Jev resolved model;
- candidate set;
- routing decision;
- qualification refs;
- executor receipts;
- graph versions;
- verification receipt;
- completion decision.

### MAWS-VN-901 — Failure matrix
Mode: AFK with fixtures, HITL for live provider failures.

Cases:
- Jev unavailable;
- Jev low confidence;
- jev-latest resolves to changed version;
- OpenRouter unavailable;
- Codex unavailable;
- requested executor unqualified;
- user requires a specific unavailable executor;
- provider tries hidden fallback;
- stale graph revision;
- decomposition exceeds max depth;
- budget exceeded;
- disagreement unresolved;
- verification failure;
- completion evidence missing.

DoD:
- every case terminates deterministically as re-route, revalidate, escalate, BLOCKED, or FAILED;
- no silent downgrade of authority or verification.

---

## Phase 10 — Migration and release

### MAWS-VN-1000 — Compatibility projection
Mode: AFK

DoD:
- existing core registry and provider exports continue to validate;
- vNext metadata is projected only after canonical contract owners are stable;
- compatibility mirrors remain derived.

### MAWS-VN-1001 — Authority/maturity promotion
Mode: AFK

For every vNext surface:
- planned -> contract-only -> validator-backed -> runtime-implemented only with named evidence.

### MAWS-VN-1002 — Version and release disposition
Mode: HITL

Decide final semver only after end-to-end gate. Candidate is additive minor release, but no version bump is frozen by this plan.

Required gates:
- npm run validate
- npm run validate-neutral
- npm run eval
- npm run validate-maws-vnext
- npm run eval:maws-vnext
- runtime vNext integration tests
- secret scan
- registry disposition

## 6. Smallest safe tracer bullet

The first implementation slice after planning should not attempt the full graph runtime.

Recommended tracer bullet:

~~~text
one WorkUnit
 -> deterministic eligible set with two fixture executors
 -> one Jev Choice over only those candidates
 -> threshold gate
 -> one fixture ExecutorBinding
 -> one ExecutionResult fixture
 -> CompletionContract evaluation
 -> evidence receipt
~~~

No ZCode, Codex, OpenRouter, live MCP, recursion, graph revision, or exploration in this first slice.

Why:
- validates the core separation between deterministic envelope, Jev decision, executor binding, and completion;
- makes OD-01, OD-09/10, OD-17, OD-18 executable early;
- minimizes external credentials and service activation.

## 7. Dependency chain

~~~text
Phase 0
 -> Phase 1 contracts
 -> Phase 2 Jev decision engine
 -> Phase 3 qualification/eligibility
 -> Phase 4 executor transports
 -> Phase 5 planner/work graph
 -> Phase 6 adaptive routing/composition
 -> Phase 7 evidence/completion
 -> Phase 8 ZCode surface
 -> Phase 9 E2E
 -> Phase 10 release
~~~

Parallel-safe lanes after Phase 1:
- Jev engine and qualification engine can progress in parallel;
- Codex/OpenRouter transport adapters can progress in parallel behind the generic executor interface;
- observability/output-contract extension can begin before full planner runtime.

## 8. Primary risks

1. Capability ontology explosion
Mitigation: start with a small closed vocabulary and version additions.

2. Qualification combinatorics
Mitigation: capability+profile qualification plus explicit profile subsumption and reusable eval profiles.

3. Jev overreach
Mitigation: candidate choices built in deterministic code; Jev receives no authority-granting answer shape.

4. Alias drift
Mitigation: record resolved Jev model; run materiality/eval gate when resolved ID changes.

5. Agent-on-agent orchestration ambiguity
Mitigation: ZCode = interaction surface; MAWS = orchestration owner; Codex = bound executor.

6. Hidden provider fallback
Mitigation: provider-level fallback disabled or surfaced as explicit new MAWS routing decision.

7. Runtime state explosion
Mitigation: graph/node/revision/parallel/cost/runtime budgets.

8. Current MCP posture conflict
Mitigation: local stdio activation is a separate Phase-8 gate; no live-service claim before executable evidence.

9. Current runtime language drift
Mitigation: stay Node ESM for vNext implementation unless a separate migration is approved.

## 9. Rollback strategy

Every implementation phase is additive.

Rollback order:
- disable ZCode entry;
- disable live executor transports;
- disable Jev decision path and return to fixture/static routing;
- keep canonical vNext contracts as non-activated contract surfaces if runtime is rolled back;
- never rewrite historical evidence or graph versions.

No migration should require deleting the existing workflow-routing-map, provider exports, compatibility mirrors, or current local runtime commands.

## 10. Acceptance criteria for MAWS vNext

MAWS vNext is implementation-complete only when all are true:

1. A ZCode-started interaction can submit a WorkUnit without fixing the WorkUnit executor to the session model.
2. Jev receives only deterministically allowed choices and emits a typed decision receipt with resolved model ID.
3. Only currently applicable QUALIFIED capability+profile candidates can become eligible.
4. Routing produces an explicit, evidence-backed ExecutorBinding.
5. Codex and OpenRouter can both execute through separate runtime executor transports.
6. Provider adapters remain provider-normalization layers, not authority or orchestration sources.
7. Bounded decomposition and recursion cannot widen parent constraints.
8. Graph changes create new immutable versions.
9. Stale revision requests are explicitly revalidated.
10. Arbitration/disagreement resolution follows explicit policy.
11. Exploration and multi-executor composition remain policy-bounded.
12. Executor success alone cannot produce COMPLETED.
13. Required verification/evidence is enforced by CompletionContract.
14. Existing repo validators/evals remain green.
15. Authority matrix accurately reflects maturity without overclaiming live MCP/HTTP/service activation.

## 11. Registry disposition expectation

This planning branch changes repo-local design documentation only.

Expected disposition at plan stage:
- material_change: true
- registry_relevant_change: false unless the current adopted registry taxonomy classifies this derived planning record as CONTRACT_RECORD, PROVENANCE, or SUPERSESSION
- default expected status: NO_CHANGE

The implementation stream must re-evaluate registry disposition whenever canonical vNext contracts are introduced or superseded.
