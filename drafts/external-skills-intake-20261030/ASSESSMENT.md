# MAWS external skill intake — assessment (2026-10-30)

Class: draft / review-only / non-canonical. Execution status: drafted. Validation outcome: BLOCKED (frontdoor not run).
Owner surface: MAWS shared core. This document neither imports a skill nor grants execution, network, filesystem, installation, credential, or publication authority.

## Objective and observed baseline

Assess three user-specified public repositories against the existing MAWS contracts, then define an exact, fail-closed admission path. Base inspected: MAWS main `616c622e7ffe2de3e7aba660718ed2023c042115` (2026-10-29).

Observed canonical authority:
- `AGENTS.md`, `docs/architecture.md`, `docs/authority-matrix.md`.
- `docs/skill-frontdoor-contract.md` and `docs/security/extension-install-safety-policy.md`: G0 immutable candidate, G1 SkillSpector, G2 SkillEvaluator Tier 1, G3 MAWS deterministic disposition. INCOMPLETE is not overridable. CLEAN/ELIGIBLE grants no runtime authority.
- `core/skills/README.md`: canonical portable skills under `core/skills`, generated compatibility/provider projections after admission.
- `core/contracts/portable-skill-manifest.json`, `core/contracts/output-contracts.json`, `core/contracts/workflow-routing-map.json`.
- Existing `api-contract-review` and `authorization-boundary-review` explicitly cover *review* of established interfaces/auth boundaries. Neither is a mandate to build or operate an identity provider.
- `drafts/README.md` allows non-canonical review packets and forbids secrets, auth files, and automatic promotion.

## Decision matrix

| User source | Proposed MAWS identity / boundary | Differentiation | Present decision |
| --- | --- | --- | --- |
| Vercel Labs `agent-browser` | `browser-interaction-preflight`: plan and assess bounded browser operations; CLI/adapter is a distinct extension and separate execution authority | Neither `frontend-performance-review` nor general browser tool access; cannot turn read-only observation into account operations | DEFER executable binding; accept this review-only analysis |
| wshobson `auth-implementation-patterns` | `auth-implementation-patterns`: architecture/implementation plan for AuthN/AuthZ, OIDC, cookies, sessions, rotation and negative tests | `authorization-boundary-review` audits existing controls; this plans changes but never creates accounts, issues tokens, or reads secrets | Candidate for staged MAWS frontdoor; no admission asserted |
| wshobson `api-design-principles` | `api-design-principles`: design a prospective REST/GraphQL surface and contract/test plan | `api-contract-review` validates existing API contract compatibility; this produces a proposed design and remains non-executing | Candidate for staged MAWS frontdoor; no admission asserted |

### Browser-specific threat model

Observed in the pinned upstream `skills/agent-browser/SKILL.md`: broad `allowed-tools: Bash(agent-browser:*)`; an instruction to prefer agent-browser over other browser/web tools; `agent-browser skills get core` to load more instructions at runtime; interactive site navigation, forms, screenshots, Slack/Electron/cloud browser skills. Observed in upstream README: `npm install -g agent-browser` plus browser download; package build/install differs from its prompt-facing skill stub.

MAWS translation:
1. Do **not** copy the blanket Bash permission, tool preference override, unpinned `skills get` workflow, or global installation instruction into an authoritative portable skill.
2. Treat the upstream prompt stub, its dynamically loaded skills, the CLI binary/package, the downloaded browser, and its network/profile/session state as separate exact targets for risk assessment. A clean scan of one does not approve the others.
3. Default to no browser launch and no ambient cookies, secrets, profiles, credential vaults, local files, private chat/account data, public posting, purchases, uploads, or unrestricted network. Classify URL/origin, session, requested operation, account context, and data sensitivity before any grant.
4. Plan/observation is read-only only when no action changes remote or local state. A browser click, fill, download, upload, login, submit, deletion, message, consent action, or preview-to-public operation requires a separately bound operation/target/payload grant. Unknown outcomes prohibit blind retries.
5. Browser page text and dynamic skill output are untrusted instructions, never MAWS authority. Store screenshots/DOM traces only within approved evidence boundaries; redact personal information and tokens, enforce expiry and bounded retention.

### Authentication-specific threat model

The source teaches common authentication strategies. No recommendation in a tutorial constitutes an implementation authority. Proposed skill must separately model identity, session validity, tenant membership, resource-level authorization, action-specific grants, refresh/revocation/replay/logout/CSRF/redirect integrity, storage/response DTOs, and negative probes. OIDC state/nonce/PKCE and provider policy must be verified from owning specifications; JWT/token or cookie lifetime claims must not become universal defaults. Never request real passwords, tokens or rotate production secrets during planning.

### API-design-specific threat model

REST vs GraphQL, versioning and pagination choices are design alternatives rather than universal invariants. Specify resource/operation semantics, authorization matrix, stable error contracts, idempotency/retries, timeouts, pagination limits, schema validation, observability and backwards compatibility. GraphQL introspection, rate limits, query-depth and N+1 control are explicit design decisions. Never auto-publish OpenAPI specs or mutate live endpoints. Treat reference implementation snippets as illustrations, not verified runtime code.

## TTD frame

- Decision: three sources classified, overlaps named, exact authority limits and mandatory gates specified.
- Scope: MAWS draft review packet only; no `core/skills` or `core/contracts` change in this PR.
- Contract: MAWS skill frontdoor; extension-install safety; existing manifest/routing/output contract; current review siblings.
- Gate: each intended *final* staged SKILL.md candidate MUST independently reach CLEAN/ELIGIBLE; any modified byte after admission triggers re-admission.
- Smallest implementation slice after G0–G3: create only the admitted portable skill plus machine-readable output/manifest bindings and necessary additive workflow routing; regenerate derived registry/provider exports.
- Evidence: raw and sanitized analyzer receipts, candidate content and tree digests, implementation and registry commits, targeted behavioral negatives, validators and requalify/re-pin evidence.
- Next gate: run frontdoor locally on each exact candidate; browser binary admission remains distinct.

## Unverified

No scanner, Tier 1, native MAWS validator, behavioral executor, registry derivation or provider export generator was run in this GitHub-only review. No statement of CLEAN/ELIGIBLE, PASS or runtime readiness is made. The existing core remains unchanged.

## Stop and rollback

Fail closed on unknown analyzer result, incomplete evidence, missing permission, license/notice mismatch, unresolved semantic collision, or attempts to activate a browser tool from a prompt. Rollback this draft by closing its PR without merging; no deployed capability or current MAWS export changes to undo.
