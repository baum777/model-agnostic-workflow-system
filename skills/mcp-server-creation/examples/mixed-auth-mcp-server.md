# Mixed-Auth Remote MCP Server

Use this pattern when the server exposes both read-only tools and privileged write tools with different trust requirements.

## Example Scenario

- Purpose: manage issue tracker records for a ChatGPT App and internal operators
- Server type: API integration server
- Auth model:
  - read tools use service identity for low-risk lookup
  - write tools require user-bound `oauth2`
- Risk posture: mixed read and write with explicit separation

## Tool Catalog

### `list_projects`

- Description: Use this when you need to list available projects without changing state.
- Classification: `read`
- Auth: service-bound low-privilege access
- Annotation intent:
  - `readOnlyHint: true`
  - `destructiveHint: false`
  - `idempotentHint: true`

### `create_issue`

- Description: Use this when you need to create a new issue in a project. This tool writes to the external tracker.
- Classification: `write`
- Auth: user-bound `oauth2`
- Annotation intent:
  - `readOnlyHint: false`
  - `destructiveHint: false`
  - `idempotentHint: false`

### `delete_issue`

- Description: Use this when you need to permanently remove an issue. This tool is destructive and should be tightly gated.
- Classification: `destructive`
- Auth: user-bound `oauth2` with elevated scope
- Annotation intent:
  - `readOnlyHint: false`
  - `destructiveHint: true`
  - `idempotentHint: false`

## Required Guardrails

- Document auth per tool, not only per server.
- Prevent unauthenticated callers from discovering hidden write paths.
- Do not reuse a service token for user-bound destructive actions.
- Return explicit error codes for missing scopes, expired tokens, and policy denial.
- Consider approval or policy gating for destructive tools.

## Example Normalized Error

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_SCOPE_MISSING",
    "message": "The caller lacks permission for delete_issue.",
    "retryable": false
  },
  "meta": {
    "requestId": "req_789",
    "auth": "oauth2",
    "warnings": []
  }
}
```

## Deployment Notes

- Keep OAuth configuration explicit in environment templates.
- Log auth mode, request ID, tool name, and outcome, but never tokens or secrets.
- Document whether the ChatGPT App surface should expose all tools or only a curated subset.
- If write tooling is incomplete, say so plainly and avoid claiming production readiness.
