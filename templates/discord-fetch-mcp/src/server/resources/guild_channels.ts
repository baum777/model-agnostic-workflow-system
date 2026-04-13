import type { DiscordServerRuntime } from "../mcp.js";

export const guildChannelsResource = {
  name: "discord_guild_channels",
  uriTemplate: "discord://guild/{guild_id}/channels",
  description: "Normalized guild channel list for one guild.",
  load: async (runtime: DiscordServerRuntime, guildId: string) => runtime.client.listGuildChannels(guildId)
} as const;

export function guildChannelsResourceUri(guildId: string) {
  return `discord://guild/${guildId}/channels`;
}
