import type { DiscordArchiveScope } from "./types.js";

export const DiscordEndpoints = {
  guildChannels: (guildId: string) => `/guilds/${guildId}/channels`,
  activeThreads: (guildId: string, parentChannelId?: string) =>
    parentChannelId ? `/guilds/${guildId}/threads/active?channel_id=${encodeURIComponent(parentChannelId)}` : `/guilds/${guildId}/threads/active`,
  channel: (channelId: string) => `/channels/${channelId}`,
  archivedPublicThreads: (channelId: string) => `/channels/${channelId}/threads/archived/public`,
  archivedPrivateThreads: (channelId: string) => `/channels/${channelId}/threads/archived/private`,
  archivedJoinedPrivateThreads: (channelId: string) => `/channels/${channelId}/users/@me/threads/archived/private`,
  channelMessages: (channelId: string) => `/channels/${channelId}/messages`,
  archiveThreads: (channelId: string, scope: DiscordArchiveScope) => {
    if (scope === "public") {
      return `/channels/${channelId}/threads/archived/public`;
    }

    if (scope === "private") {
      return `/channels/${channelId}/threads/archived/private`;
    }

    return `/channels/${channelId}/users/@me/threads/archived/private`;
  }
} as const;
