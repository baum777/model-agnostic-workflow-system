import type { DiscordServerRuntime } from "../mcp.js";

export const threadMessagesResource = {
  name: "discord_thread_messages",
  uriTemplate: "discord://thread/{thread_id}/messages?limit=100",
  description: "Normalized thread messages for one thread.",
  load: async (runtime: DiscordServerRuntime, threadId: string, limit = 100) =>
    runtime.client.getThreadMessages(threadId, { limit, include_system_messages: true })
} as const;

export function threadMessagesResourceUri(threadId: string, limit = 100) {
  return `discord://thread/${threadId}/messages?limit=${limit}`;
}
