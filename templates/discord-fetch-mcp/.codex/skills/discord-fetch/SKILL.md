---
name: discord-fetch
description: Read-only Discord thread retrieval through the discord_fetch MCP server.
---

# Use when
- The task requires fetching Discord guild channels, threads, or thread messages
- The user asks for exports, audits, summaries, or thread discovery
- Current Discord data is needed

# Rules
- Always use the discord_fetch MCP server, never infer Discord data from memory
- Treat Discord as the source of truth
- Do not claim access to private threads unless the tool returned them
- If a tool returns partial=true, state the result as partial
- Prefer normalized exports over raw object dumps

# Typical flow
1. Call `discord_list_guild_channels`
2. Filter thread-capable parent channels
3. Call `discord_list_active_threads`
4. Call `discord_list_archived_threads` with `public`
5. Only call private scopes when explicitly needed
6. Call `discord_get_thread_messages` or `discord_export_thread`
