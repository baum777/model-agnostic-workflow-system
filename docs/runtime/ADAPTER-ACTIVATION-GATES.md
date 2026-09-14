# ADAPTER-ACTIVATION-GATES.md

Class: freeze artifact (canonical activation boundary for adapters on the frozen generic runtime core).
Use rule: generic core readiness is not operational activation. Any adapter on a
generic port passes through these gates, in order, per surface. No gate grants
the next one.

## Gate Sequence (per adapter)

```text
G1 Implementation          adapter implements the generic port contract
G2 Conformance run         reusable harness suite for that port: PASS
G3 Cross-port composition  composition suite (binding across ports): PASS
G4 Architecture review     scope, ownership, failure semantics disposition
G5 Production authorization  separate explicit owner authorization
```

G2/G3 results carry no trust: `trust_level: null`, `authorization: null` by
construction. CONFORMANCE != TRUST != PRODUCTION_AUTHORIZATION !=
DEPLOYMENT_APPROVAL.

## Surface Matrix (at freeze, 2026-09-14)

| Surface | Generic Core Ready | Domain Adapter Needed | Owner Gate |
| --- | --- | --- | --- |
| Context | READY (ContextEnginePort + conformance suite: malformed/foreign-task/over-budget/throwing DENY) | real ContextEnginePort implementation | G1–G5 |
| Authority | READY (AuthorityPort + suite: wrong-subject / wrong-action / expired / malformed DENY; missing/throwing fail-closed UNAVAILABLE) | real AuthorityPort / issuer surface | G1–G5 + authority semantic governance review |
| Effects | READY (EffectPort + suite: receipt identity runtime-owned; verified/complete claims inert) | real EffectPort | G1–G5 |
| Usage metering | READY (ResourceAdmissionPort + ledger: admission-before-consumption, taint DENY) | real usage source for tokens/cost | G1–G5 + external metering decision (tokens/cost stay EXTERNAL_USAGE_SOURCE until then; no fake cost model) |
| Workflow state | READY (LoopController + SM 0.1.0, closed 14-state vocabulary) | domain workflow definitions on top | SM owner dispositions for SM-GAP-1..4 before any semantic extension |
| CCA-02 context | NOT_ACTIVATED — explicitly outside the generic core | CCA-02 adapter | explicit owner order; excluded from the freeze scope |

## Activation Facts (already proven generically)

- A conforming adapter cannot violate the runtime guarantees the core enforces:
  foreign-task manifests are rejected by the controller itself, authority
  evaluation stays claim-independent, effect receipts are runtime-identified,
  completion/verification claims cannot alter evaluator outcomes, usage
  recording is refused for unsupported/external sources.
- The conformance harness produces objective FAIL evidence for non-conforming
  stores (proven with a tampered usage ledger) — it does not accept adapter
  self-attestation.
- Negative paths are part of the suites: unauthorized denial, expired/revoked
  authority, malformed input, throwing adapters (fail-closed), invented
  authority-like fields (inert).

## Explicit Non-Claims

- No production adapter is authorized by the freeze.
- No Unitera surface (CCA-02, Authority, production Effect) is activated.
- No production or security certification exists or is claimed.
