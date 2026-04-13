# Discord Fetch MCP Template

Derived template bundle for a read-only Discord MCP server.

This bundle is **template material**, not canonical policy. Copy it into a downstream repo and then pin versions, secrets, and deployment decisions there.

## Core Shape

- primary transport: STDIO
- optional later transport: Streamable HTTP
- Discord REST only
- read-only only
- Bot token stays server-side
- optional SQLite cache, disabled by default

## Included Surfaces

- MCP server entrypoint
- tool registry
- resource registry
- Discord REST client
- normalization helpers
- guardrail helpers
- optional cache placeholder
- `.codex/config.toml`
- `.codex/skills/discord-fetch/SKILL.md`

## File Tree

```text
discord-fetch-mcp/
  package.json
  tsconfig.json
  README.md
  .env.example
  .gitignore
  src/
    index.ts
    server/
      mcp.ts
      registerTools.ts
      registerResources.ts
      tools/
        discord_list_guild_channels.ts
        discord_list_active_threads.ts
        discord_list_archived_threads.ts
        discord_get_thread.ts
        discord_get_thread_messages.ts
        discord_export_thread.ts
      resources/
        guild_channels.ts
        guild_active_threads.ts
        archived_threads.ts
        thread.ts
        thread_messages.ts
    discord/
      client.ts
      endpoints.ts
      auth.ts
      permissions.ts
      pagination.ts
      normalize.ts
      types.ts
    cache/
      sqlite.ts
      keys.ts
    lib/
      env.ts
      logger.ts
      errors.ts
      schema.ts
      time.ts
      markdown.ts
      guards.ts
  .codex/
    config.toml
    skills/
      discord-fetch/
        SKILL.md
```

## What Is Implemented Versus Placeholder-Only

Implemented in the scaffold:

- env validation
- tool schemas
- normalized output contracts
- REST endpoint builders
- fail-closed error envelopes
- server bootstrap
- STDIO MCP transport

Placeholder-only in the scaffold:

- SQLite driver wiring
- downstream deployment hardening
- production auth hardening beyond the bot token boundary
- any later HTTP transport

## Tool Catalog

| Tool | Purpose | Status |
| --- | --- | --- |
| `discord_list_guild_channels` | List relevant parent channels for a guild. | read-only |
| `discord_list_active_threads` | List active threads for a guild or parent channel. | read-only |
| `discord_list_archived_threads` | List archived public, private, or joined-private threads. | read-only |
| `discord_get_thread` | Read normalized thread metadata. | read-only |
| `discord_get_thread_messages` | Read normalized message history for a thread. | read-only |
| `discord_export_thread` | Export a thread as JSON or Markdown. | read-only |

## Resource URIs

- `discord://guild/{guild_id}/channels`
- `discord://guild/{guild_id}/threads/active`
- `discord://channel/{channel_id}/threads/archived/public`
- `discord://channel/{channel_id}/threads/archived/private`
- `discord://channel/{channel_id}/threads/archived/joined-private`
- `discord://thread/{thread_id}`
- `discord://thread/{thread_id}/messages?limit=100`

## Environment

The downstream repo should document these variables explicitly:

- `MCP_SERVER_NAME`
- `DISCORD_BOT_TOKEN`
- `DISCORD_API_BASE`
- `ALLOWED_GUILD_IDS`
- `MAX_THREADS_PER_CALL`
- `MAX_MESSAGES_PER_CALL`
- `ENABLE_SQLITE_CACHE`
- `SQLITE_PATH`
- `LOG_LEVEL`
- `EXPORT_DEFAULT_MESSAGE_LIMIT`

## Notes

- The template fails closed on invalid inputs, permission errors, rate limits, and unsupported thread types.
- The cache module is intentionally placeholder-only until a real SQLite driver is wired downstream.
