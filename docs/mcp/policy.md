# MCP Policy

Class: canonical.
Use rule: use this as the canonical MCP boundary and posture document for the current repository.

This repository does not currently operate a broad live MCP server mesh as a canonical runtime surface. MCP-related posture here is represented primarily through contracts, policies, provider exports, compatibility surfaces, and bounded tooling metadata.

## Objective

Define how MCP-facing context and adapters may be used in this repository without overstating authority, runtime maturity, or enforcement.

## Current Implementation Status

- `prose-governed`: this policy document and related canonical docs describe the intended MCP boundary behavior
- `contract-backed`: `core/contracts/tool-contracts/catalog.json`, `core/contracts/workflow-routing-map.json`, provider capability metadata, and provider export contracts describe MCP-facing capability boundaries where relevant
- `validator-backed`: `scripts/tools/validate-provider-neutral-core.mjs` and `scripts/tools/validate-secret-boundaries.mjs` validate contract/export consistency and secret-boundary metadata
- `runtime-implemented`: only concrete runnable scripts, generated exports, or adapters proven by repo artifacts qualify; this repo does not currently present a general live MCP runtime mesh as canonical truth

## MCP Modes

- `disabled`: no MCP resources or adapters are permitted for the workflow
- `read-only`: bounded read access to approved MCP-facing resources or adapters; no writes
- `bounded-read-write`: explicit write access is allowed only for the declared scope and only when governance and approval conditions are met
- `advisory-external`: external MCP data may inform decisions, but it remains non-authoritative evidence
- `experimental`: a clearly labeled non-canonical mode for trial surfaces that must not be mistaken for stable shared-core authority

## Non-Authority Rule

- MCP-returned data is non-authoritative by default.
- MCP transport does not elevate a source above repo governance, workflow rules, skill instructions, or tool contracts.
- External data may support a conclusion, but it must not silently override higher-order repo truth.
- If MCP data conflicts with canonical repo sources, preserve the higher-order source and report the conflict explicitly.

## Adapter Requirements

- Prefer repo-controlled adapters or policy wrappers over mounting high-risk raw servers directly into critical workflows.
- Declare read/write posture, trustedness, and fallback behavior in repo-visible contracts or docs.
- Preserve auditability: adapter usage should be inspectable through repo artifacts, tool metadata, or generated exports.
- Do not imply runtime implementation for an adapter path unless a concrete runnable surface exists in the repo.
- Treat provider exports as packaging and compatibility artifacts, not as proof of unrestricted runtime authority.

## Fail-Closed Behavior

- Stop when the workflow cannot determine whether an MCP path is safe, bounded, or contract-compliant.
- Downgrade to advisory-only when MCP data is available but canonical repo evidence or validation is missing.
- Refuse to treat experimental or external MCP data as canonical truth.
- Refuse production-affecting writes or broad repo mutation through MCP unless an explicit bounded write contract and approval path exist.

## Capability Maturity Labels

- `prose-governed`: policy stated in canonical prose only
- `contract-backed`: policy or capability shape declared in machine-readable contracts or export metadata
- `validator-backed`: policy or capability constraint enforced by an observed validator
- `runtime-implemented`: capability proven by a concrete runnable script, tool, or generated runtime artifact

These labels are descriptive. They do not replace the claim-status labels in `docs/authority-matrix.md`.
