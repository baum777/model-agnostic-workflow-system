import type { DiscordServerRuntime } from "../mcp.js";

export const archivedThreadsResource = {
  name: "discord_archived_threads",
  uriTemplate: "discord://channel/{channel_id}/threads/archived/{scope}",
  description: "Normalized archived threads for a channel and archive scope.",
  load: async (runtime: DiscordServerRuntime, channelId: string, scope: "public" | "private" | "joined_private") =>
    runtime.client.listArchivedThreads(channelId, scope)
} as const;

export function archivedThreadsResourceUri(channelId: string, scope: "public" | "private" | "joined_private") {
  return `discord://channel/${channelId}/threads/archived/${scope === "joined_private" ? "joined-private" : scope}`;
}
