export function guildChannelsCacheKey(guildId: string) {
  return `guild:${guildId}:channels`;
}

export function activeThreadsCacheKey(guildId: string, parentChannelId?: string) {
  return parentChannelId ? `guild:${guildId}:parent:${parentChannelId}:active_threads` : `guild:${guildId}:active_threads`;
}

export function archivedThreadsCacheKey(channelId: string, scope: string, before?: string, limit?: number) {
  return `channel:${channelId}:scope:${scope}:before:${before ?? "latest"}:limit:${limit ?? "default"}`;
}

export function threadCacheKey(threadId: string) {
  return `thread:${threadId}`;
}

export function threadMessagesCacheKey(threadId: string, before?: string, after?: string, around?: string, limit?: number) {
  return `thread:${threadId}:before:${before ?? ""}:after:${after ?? ""}:around:${around ?? ""}:limit:${limit ?? "default"}`;
}
