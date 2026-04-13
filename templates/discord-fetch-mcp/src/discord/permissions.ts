import { DiscordApiError } from "../lib/errors.js";
import type { DiscordFetchEnv } from "../lib/env.js";
import type { DiscordArchiveScope } from "./types.js";

export function assertGuildAllowed(env: DiscordFetchEnv, guildId: string) {
  if (env.allowedGuildIds.size === 0) {
    return;
  }

  if (!env.allowedGuildIds.has(guildId)) {
    throw new DiscordApiError("guild_not_allowed", "Guild is not allowed by the configured allowlist.", false, {
      guild_id: guildId,
      allowed_guild_ids: Array.from(env.allowedGuildIds)
    });
  }
}

export function requiredPermissionsForArchiveScope(scope: DiscordArchiveScope) {
  if (scope === "public") {
    return ["READ_MESSAGE_HISTORY"];
  }

  if (scope === "private") {
    return ["READ_MESSAGE_HISTORY", "MANAGE_THREADS"];
  }

  return ["READ_MESSAGE_HISTORY"];
}

export function isThreadCapableChannelType(type: string) {
  return type === "GUILD_TEXT" || type === "GUILD_FORUM" || type === "GUILD_ANNOUNCEMENT" || type === "GUILD_MEDIA";
}
