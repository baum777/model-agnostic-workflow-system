import type { DiscordServerRuntime } from "../mcp.js";

export const guildActiveThreadsResource = {
  name: "discord_guild_active_threads",
  uriTemplate: "discord://guild/{guild_id}/threads/active",
  description: "Normalized active thread list for one guild.",
  load: async (runtime: DiscordServerRuntime, guildId: string) => runtime.client.listActiveThreads(guildId)
} as const;

export function guildActiveThreadsResourceUri(guildId: string) {
  return `discord://guild/${guildId}/threads/active`;
}
