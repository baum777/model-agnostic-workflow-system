---
name: mcp-server-creation
description: Design and scaffold reusable remote MCP servers for internal tools, ChatGPT Apps, and API integrations with a tool-first workflow, explicit schemas, safe auth choices, and honest operational guardrails. Use when Codex needs to define MCP tool boundaries, choose remote server architecture, scaffold a TypeScript/Node server, document auth and deployment, or review an MCP server for safety and completeness before calling it production-ready.
version: 1.0.0
classification: shared
requires_repo_inputs: false
produces_structured_output: true
safe_to_auto_run: false
owner: codex-workflow-core
status: extracted
---

# MCP Server Creation

## Trigger

Use this skill when the task is to design, scaffold, refine, or review a remote MCP server.

Use it for:

- internal tool servers exposed to trusted operators or internal automation
- ChatGPT App backends that must expose well-scoped tools to OpenAI-compatible clients
- API integration servers that wrap one or more upstream services behind explicit tool contracts
- first-pass server scaffolds that still need auth, validation, observability, and test honesty called out explicitly

## When Not To Use

- Do not use for local one-off scripts that do not need MCP.
- Do not use when the task is only to build a UI with no server/tool surface.
- Do not use when the user needs product brainstorming but has no concrete server goal yet.
- Do not use to hide destructive behavior inside read-only tools.
- Do not claim production readiness if auth, validation, observability, or testing are still placeholders.

## Expected Inputs

- target use case and end user
- server type: internal tool server, ChatGPT App server, or API integration server
- target runtime and deployment environment
- upstream systems, credentials, and trust boundaries
- desired tools, especially read-only versus write/destructive actions
- auth expectation: `noauth`, `oauth2`, or mixed auth
- performance constraints, rate limits, and caching opportunities
- delivery expectation: design only, scaffold only, or scaffold plus docs/tests

If the user omits details, make the minimum reasonable assumptions, label them explicitly, and keep the scaffold narrow.

## Workflow

1. Understand the use case, operator, and target environment.
2. Classify the server:
   - internal tool server
   - ChatGPT App server
   - API integration server
3. Write the tool catalog before writing server code.
4. Split tools by capability and risk:
   - read-only tools
   - state-changing tools
   - destructive or approval-sensitive tools
5. Define the auth strategy:
   - `noauth` only for tightly controlled or explicitly public use cases
   - `oauth2` for user-bound access to external systems
   - mixed auth when read-only and write paths need different trust levels
6. Define explicit input and output schemas for every tool.
7. Normalize result shapes where appropriate so clients can handle success, failure, warnings, pagination, and rate-limit signals consistently.
8. Choose the stack and folder structure. Default to TypeScript/Node.js and remote HTTP transport unless repo context strongly suggests otherwise.
9. Scaffold the server with validation, annotations, logging, and error handling from the start.
10. Add environment variable templates, auth notes, deployment notes, and usage examples.
11. Add examples or tests for the riskiest tools first.
12. Review the server for safety, correctness, operational honesty, and reusability.

## Execution Sequence

### 1. Clarify the boundary

Define:

- who calls the server
- what systems the server may read
- what systems the server may mutate
- which actions must never occur implicitly
- what the server is explicitly out of scope to do

Fail closed on scope. Prefer fewer tools with crisp boundaries over a broad server with unclear behavior.

### 2. Design the tool catalog first

Produce a tool inventory before implementation. Each tool entry should include:

- tool name
- category: `read`, `write`, or `destructive`
- a strong description in the style `Use this when...`
- caller assumptions
- upstream dependencies
- auth requirement
- input schema summary
- output schema summary
- side effects
- failure modes
- caching eligibility

Prefer small, composable tools over overloaded "do everything" tools.

Split multi-purpose actions into multiple tools when:

- inputs would become conditional or ambiguous
- auth requirements differ by action
- side effects differ
- read and write logic would otherwise mix

### 3. Annotate tool intent

When the SDK supports tool annotations or metadata, set them deliberately.

Minimum expectation:

- mark read-only tools as read-only
- mark destructive tools as destructive
- mark idempotent tools when repeated calls are safe
- never label a tool read-only if it writes, triggers jobs, sends messages, or mutates caches with external impact

If the transport or SDK lacks a native annotation field, document the same intent in the tool catalog and implementation comments.

### 4. Define schemas and contracts

Require explicit schemas for every tool input and structured output.

For each tool:

- define a machine-validated input schema
- define a machine-validated output schema when possible
- reject unknown or malformed inputs
- document defaults explicitly
- document nullable and optional fields explicitly
- cap pagination, free text, and list sizes

Prefer a normalized result envelope for tools that return structured data:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "req_123",
    "auth": "oauth2",
    "warnings": [],
    "rateLimit": {
      "remaining": 42,
      "resetSeconds": 30
    },
    "pagination": {
      "nextCursor": null
    }
  }
}
```

For failures, prefer a stable error shape:

```json
{
  "ok": false,
  "error": {
    "code": "UPSTREAM_RATE_LIMITED",
    "message": "Retry later.",
    "retryable": true
  },
  "meta": {
    "requestId": "req_123",
    "auth": "oauth2",
    "warnings": []
  }
}
```

If the client ecosystem forces a different response format, document the deviation and keep it consistent.

### 5. Choose auth deliberately

Choose the least powerful auth mode that still supports the use case.

`noauth`:

- use only for explicitly public or tightly network-restricted servers
- do not combine with hidden write capability
- document network and deployment assumptions clearly

`oauth2`:

- use for user-scoped access to external systems
- document scopes, token lifetime, refresh behavior, and failure handling
- ensure tools fail clearly when tokens are missing or expired

Mixed auth:

- use when different tools or callers need different trust levels
- keep auth boundaries explicit per tool
- never silently elevate an unauthenticated caller into a privileged write path

For all auth modes:

- document what identity the tool executes as
- document whether access is user-bound, service-bound, or hybrid
- document revocation and secret rotation expectations

### 6. Prefer remote MCP patterns

Prefer remote server patterns unless the project explicitly needs local-only execution.

Default remote assumptions:

- HTTP transport
- stateless request handling where practical
- explicit auth middleware or per-tool auth gate
- environment-based configuration
- container-friendly deployment
- health and readiness visibility

For ChatGPT Apps and OpenAI-compatible clients:

- keep tools narrow and descriptive
- design for predictable latency and bounded output
- avoid leaking internal-only tools into public-facing deployments
- use the OpenAI developer docs skill or official OpenAI docs when implementation details are uncertain

### 7. Scaffold honestly

Start with a minimal correct scaffold, not a pseudo-platform.

Default folder shape:

```text
src/
  index.ts
  server.ts
  auth/
  config/
  tools/
  schemas/
  lib/
  observability/
test/
```

Prefer:

- one file per tool or cohesive tool family
- shared schema helpers
- shared error helpers
- small composable service wrappers
- comments only where behavior or risk is not obvious

### 8. Add safety controls by default

Every tool call must validate inputs again at execution time, even if the client already validated them.

Required safety posture:

- least privilege for secrets, scopes, and upstream permissions
- no hidden writes
- explicit external side effect awareness
- prompt-injection awareness for any tool that consumes model-generated or user-supplied text
- output encoding or sanitization where external systems are called
- explicit allowlists for hosts, actions, or resources when feasible

If a tool can write, send, trigger, delete, or spend:

- call that out in the description
- document the side effect in code and docs
- prefer confirmation or policy gating for destructive actions

### 9. Add operational guidance

Minimum operational posture:

- structured logging with request IDs
- error taxonomy that separates validation, auth, upstream, and internal failures
- rate-limit awareness for every upstream dependency
- bounded retries with jitter only where safe
- caching only for safe read paths, with explicit TTL and invalidation notes
- environment variable hygiene: required vars listed, optional vars documented, no secrets logged

Do not fake observability. If metrics, tracing, or audit logging are not implemented, label them as TODOs.

### 10. Document before finishing

Produce:

- architecture summary
- tool catalog
- auth model
- input and output contracts
- deployment notes
- test plan
- acceptance criteria

If anything is placeholder-only, mark it as placeholder-only.

## Output

Produce as many of these as the task warrants:

- MCP server architecture brief
- tool inventory with `Use this when...` descriptions
- JSON schemas for each tool input and output
- starter server implementation scaffold
- `.env.example` or equivalent environment template
- testing checklist
- deployment checklist
- usage examples

Use the bundled templates and examples in this skill folder:

- `templates/server.ts.template`
- `templates/tool-definition.template`
- `templates/package.json.template`
- `templates/tsconfig.json.template`
- `templates/env.example.template`
- `examples/minimal-readonly-mcp-server.md`
- `examples/mixed-auth-mcp-server.md`
- `checklists/review-checklist.md`

## Guardrails

- Prefer remote MCP server patterns.
- Prefer tool-first design over transport-first design.
- Prefer read-only tools until writes are explicitly required.
- Never mix read-only and destructive behavior behind one ambiguous tool.
- Never omit auth reasoning; explain why `noauth`, `oauth2`, or mixed auth is appropriate.
- Never ship hidden assumptions about identity, scopes, rate limits, or write effects.
- Never describe a scaffold as production-ready when auth, validation, logging, testing, or deployment hardening are incomplete.
- Keep the server generic and reusable unless the user explicitly asks for app-specific branding or behavior.

## Quality Checks

- The tool catalog should be implementation-ready before code starts.
- Every tool should have explicit schemas, side-effect notes, and auth expectations.
- Read-only versus write/destructive behavior should be unambiguous.
- The scaffold should be minimal, coherent, and extendable without major rewrites.
- Documentation should make assumptions, TODOs, and limitations obvious.
- Safety controls should exist in code or be called out as missing, not implied.

## Acceptance Criteria

- A clear architecture brief exists.
- The tool inventory is defined before or alongside implementation.
- Every tool has explicit input and output contracts.
- Read-only and write/destructive tools are clearly separated.
- Auth mode is justified and documented.
- Validation, logging, and error handling are present or explicitly marked incomplete.
- Deployment and testing notes are included.
- The result is reusable across projects and not narrowly branded.

## Preferred Implementation Defaults

- Language/runtime: TypeScript on Node.js
- Transport: remote HTTP MCP server
- Validation: schema-first validation for every tool
- Logging: structured JSON logs with request IDs
- Auth: least privilege, per-tool clarity, no silent elevation
- Tool results: normalized structured result envelope when appropriate
- Caching: read-only tools only, explicit TTL, bounded scope
- Errors: stable codes, user-safe messages, retryability signal where useful

## Finish Checklist

- [ ] Server type is classified correctly.
- [ ] Tool catalog exists before implementation expands.
- [ ] Each tool description uses `Use this when...`.
- [ ] Read-only tools are separate from write/destructive tools.
- [ ] Tool annotations or equivalent intent metadata are set deliberately.
- [ ] Input schemas are explicit and validated at execution time.
- [ ] Output contracts are explicit and consistent.
- [ ] Auth choice is documented per server and per tool where needed.
- [ ] External side effects are called out explicitly.
- [ ] Logging and error handling are wired with request IDs or equivalent correlation.
- [ ] Rate-limit and caching behavior is documented.
- [ ] Environment variables are documented without leaking secrets.
- [ ] Architecture, deployment, and test notes are included.
- [ ] Placeholders and TODOs are labeled honestly.
- [ ] The result is not described as production-ready unless the evidence supports it.

## References

- `skills/mcp-server-creation/templates/server.ts.template`
- `skills/mcp-server-creation/templates/tool-definition.template`
- `skills/mcp-server-creation/templates/package.json.template`
- `skills/mcp-server-creation/templates/tsconfig.json.template`
- `skills/mcp-server-creation/templates/env.example.template`
- `skills/mcp-server-creation/examples/minimal-readonly-mcp-server.md`
- `skills/mcp-server-creation/examples/mixed-auth-mcp-server.md`
- `skills/mcp-server-creation/checklists/review-checklist.md`
