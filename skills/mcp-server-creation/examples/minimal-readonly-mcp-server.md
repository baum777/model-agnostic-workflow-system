# Minimal Read-Only Remote MCP Server

Use this pattern when the server only reads upstream data and should not mutate any external system.

## Example Scenario

- Purpose: search an internal knowledge index
- Server type: internal tool server
- Auth: `noauth` on a private network segment
- Risk posture: read-only only

## Tool Catalog

### `search_docs`

- Description: Use this when you need to search indexed documents without changing state.
- Classification: `read`
- Auth: `noauth`
- Side effects: none beyond reading the upstream index
- Annotation intent:
  - `readOnlyHint: true`
  - `destructiveHint: false`
  - `idempotentHint: true`

## Input Schema

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "minLength": 1, "maxLength": 200 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 25, "default": 10 }
  },
  "required": ["query"],
  "additionalProperties": false
}
```

## Output Schema

```json
{
  "type": "object",
  "properties": {
    "ok": { "type": "boolean" },
    "data": {
      "type": "object",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "title": { "type": "string" },
              "snippet": { "type": "string" }
            },
            "required": ["id", "title", "snippet"],
            "additionalProperties": false
          }
        }
      },
      "required": ["items"],
      "additionalProperties": false
    },
    "meta": {
      "type": "object",
      "properties": {
        "requestId": { "type": "string" },
        "auth": { "const": "noauth" },
        "warnings": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["requestId", "auth", "warnings"],
      "additionalProperties": true
    }
  },
  "required": ["ok", "data", "meta"],
  "additionalProperties": false
}
```

## Operational Notes

- Reject unknown input fields.
- Keep result size bounded.
- Cache only if the upstream data is safe to cache and staleness is acceptable.
- Do not describe the server as secure solely because it is on a private network; the network assumption is part of the risk model and must be documented.

## Acceptance Checks

- The tool cannot write to any upstream service.
- The tool description clearly says read-only.
- The schema is explicit and bounded.
- Logs contain request IDs but no document secrets.
