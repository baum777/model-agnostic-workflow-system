import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DiscordServerRuntime } from "./mcp.js";
import { registerDiscordListGuildChannelsTool } from "./tools/discord_list_guild_channels.js";
import { registerDiscordListActiveThreadsTool } from "./tools/discord_list_active_threads.js";
import { registerDiscordListArchivedThreadsTool } from "./tools/discord_list_archived_threads.js";
import { registerDiscordGetThreadTool } from "./tools/discord_get_thread.js";
import { registerDiscordGetThreadMessagesTool } from "./tools/discord_get_thread_messages.js";
import { registerDiscordExportThreadTool } from "./tools/discord_export_thread.js";

export function registerTools(server: McpServer, runtime: DiscordServerRuntime) {
  const registrations = [
    registerDiscordListGuildChannelsTool(server, runtime),
    registerDiscordListActiveThreadsTool(server, runtime),
    registerDiscordListArchivedThreadsTool(server, runtime),
    registerDiscordGetThreadTool(server, runtime),
    registerDiscordGetThreadMessagesTool(server, runtime),
    registerDiscordExportThreadTool(server, runtime)
  ];

  return registrations;
}
