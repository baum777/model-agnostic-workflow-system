# Secret Handling Charter

Class: canonical.
Use rule: this is the single canonical prose authority for secret classes, exposure boundaries, redaction rules, memory policy, provider-switch handling, and fallback posture in `model-agnostic-workflow-system`.

This file defines the shared-core secret boundary model. Validators, machine-readable policies, tool contracts, provider capability profiles, and eval fixtures must point back here instead of inventing parallel secret-handling rules.

## Objective

Define a provider-neutral, fail-closed secret boundary model for portable skills, tool contracts, provider projections, traces, memory, eval fixtures, and consumer-facing audit workflows.

## Canonical Surfaces

- prose authority: `docs/secret-handling.md`
- machine-readable policy: `policies/secret-classes.yaml`, `policies/tool-capabilities.yaml`
- tool metadata: `core/contracts/tool-contracts/catalog.json`
- provider projection metadata: `core/contracts/provider-capabilities.json`
- enforcement: `scripts/tools/validate-secret-boundaries.mjs`, `scripts/tools/scan-secrets.mjs`
- certification: `evals/catalog.json` plus secret-boundary fixtures under `evals/fixtures/`

## Secret Classes

Secret classes are defined in `policies/secret-classes.yaml`.

- Class `A`: raw long-lived credentials or signing material. Highest exposure risk.
- Class `B`: service tokens, access secrets, DSNs with embedded credentials, authorization headers, and runtime environment secrets.
- Class `C`: derived or partially masked credential material that still allows correlation or escalation.
- Class `P`: public identifiers or non-secret references that may coexist with secret-bearing systems but are not secrets themselves.

## Boundary Rules

1. Raw secrets must never be injected into model-visible prompts when a server-bound or brokered alternative exists.
2. Tool contracts must declare secret needs and exposure posture explicitly. Missing metadata is invalid, not permissive.
3. Provider switches must re-minimize context. Reusing a full prior context blob across providers is forbidden.
4. Trace surfaces must redact secret-bearing data before persistence or export.
5. Memory surfaces must not persist raw or reconstructable secret material.
6. Compatibility exports may project security metadata, but they must not become the authority source.
7. If a secret boundary cannot be proven, validators and audit flows must fail closed.

## Tool Contract Expectations

Every tool row in `core/contracts/tool-contracts/catalog.json` must declare the secret-boundary fields defined in `policies/tool-capabilities.yaml`.

- `requires_secret` states whether the tool depends on secret-bearing material.
- `secret_classes` states which secret classes the tool may touch.
- `credential_binding` states where credential authority lives.
- `raw_secret_exposure` states whether raw secret material may ever be surfaced. Current policy allows only `forbidden`.
- `fallback_context_policy` must preserve fail-closed re-minimization.
- `trace_redaction` and `memory_persistence` must make the trace and memory boundary explicit.

## Provider Projection Expectations

Each provider row in `core/contracts/provider-capabilities.json` must declare a `security` object that states the minimum boundary guarantees the provider projection must preserve.

- Provider capability data is projection metadata, not canonical policy.
- Secret-boundary policy remains provider-neutral even when transport or packaging differs.
- Any provider row missing required security flags is invalid.

## Trace, Memory, and Eval Boundaries

- Traces are operational evidence, not a sink for secrets.
- Memory is durable context and therefore a high-risk persistence surface; raw or reconstructable secrets are forbidden.
- Eval fixtures must use synthetic or redacted values only.
- Secret-boundary evals must prove both pass and fail cases deterministically.

## Fallback And Failure Posture

- `re-minimize` is the canonical fallback posture whenever a provider changes, a downstream tool degrades, or context must be reconstituted.
- If a tool or workflow cannot satisfy redaction, memory, or credential-binding requirements, the correct outcome is `BLOCKED`, not a weaker best-effort attempt.

## Update Rules

1. Update this file and the enforcing validator in the same slice when the rule changes.
2. Add or change secret metadata only through the canonical core contracts, then regenerate registry and provider exports.
3. Record new enforcement surfaces in `docs/authority-matrix.md`.
4. Do not create provider-specific secret policy docs that redefine this charter.
