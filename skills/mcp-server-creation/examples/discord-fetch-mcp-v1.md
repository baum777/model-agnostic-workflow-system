# Discord Fetch MCP v1 Example

Use `mcp-server-creation` with the derived template bundle at:

- [templates/discord-fetch-mcp/](templates/discord-fetch-mcp/)

## Intended Shape

- read-only Discord REST fetcher
- STDIO transport first
- Bot token stays server-side
- six tools
- URI-based resources
- optional SQLite cache, disabled by default

## Reuse Notes

- Reuse the generic MCP server scaffold pattern from `mcp-server-creation`
- Reuse the Discord-specific template bundle for the concrete tool and resource names
