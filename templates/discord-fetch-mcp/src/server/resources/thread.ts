import type { DiscordServerRuntime } from "../mcp.js";

export const threadResource = {
  name: "discord_thread",
  uriTemplate: "discord://thread/{thread_id}",
  description: "Normalized thread metadata for one thread.",
  load: async (runtime: DiscordServerRuntime, threadId: string) => runtime.client.getThread(threadId)
} as const;

export function threadResourceUri(threadId: string) {
  return `discord://thread/${threadId}`;
}
