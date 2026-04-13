import { DiscordApiError } from "../lib/errors.js";
import { assertNonEmptyString, isRecord } from "../lib/guards.js";
import { toIso8601 } from "../lib/time.js";
import { isThreadCapableChannelType } from "./permissions.js";
import type {
  DiscordAttachment,
  DiscordAuthor,
  DiscordChannel,
  DiscordChannelType,
  DiscordMessage,
  DiscordMessageType,
  DiscordThread,
  DiscordThreadMember,
  DiscordThreadType
} from "./types.js";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeChannelType(rawType: unknown): DiscordChannelType {
  if (typeof rawType === "string") {
    if (rawType === "GUILD_TEXT" || rawType === "GUILD_FORUM" || rawType === "GUILD_ANNOUNCEMENT" || rawType === "GUILD_MEDIA") {
      return rawType;
    }

    return "OTHER";
  }

  if (rawType === 0) {
    return "GUILD_TEXT";
  }

  if (rawType === 15) {
    return "GUILD_FORUM";
  }

  if (rawType === 5) {
    return "GUILD_ANNOUNCEMENT";
  }

  if (rawType === 16) {
    return "GUILD_MEDIA";
  }

  return "OTHER";
}

function normalizeThreadType(rawType: unknown): DiscordThreadType {
  if (rawType === "PUBLIC_THREAD" || rawType === "PRIVATE_THREAD" || rawType === "ANNOUNCEMENT_THREAD") {
    return rawType;
  }

  if (rawType === 11) {
    return "PUBLIC_THREAD";
  }

  if (rawType === 12) {
    return "PRIVATE_THREAD";
  }

  if (rawType === 10) {
    return "ANNOUNCEMENT_THREAD";
  }

  throw new DiscordApiError("unsupported_channel_type", `Unsupported thread type: ${String(rawType)}`, false, {
    raw_type: rawType
  });
}

function normalizeMessageType(rawType: unknown): DiscordMessageType {
  if (rawType === "DEFAULT" || rawType === 0) {
    return "DEFAULT";
  }

  if (rawType === "REPLY" || rawType === 1) {
    return "REPLY";
  }

  if (rawType === "THREAD_STARTER_MESSAGE" || rawType === 19) {
    return "THREAD_STARTER_MESSAGE";
  }

  if (rawType === "SYSTEM") {
    return "SYSTEM";
  }

  return "OTHER";
}

function normalizeAttachments(rawAttachments: unknown): DiscordAttachment[] {
  if (!Array.isArray(rawAttachments)) {
    return [];
  }

  return rawAttachments.flatMap((attachment) => {
    if (!isRecord(attachment)) {
      return [];
    }

    return [
      {
        id: asString(attachment.id),
        filename: asString(attachment.filename),
        content_type: typeof attachment.content_type === "string" ? attachment.content_type : null,
        size: asNumber(attachment.size),
        url: asString(attachment.url)
      }
    ];
  });
}

export function normalizeChannel(raw: unknown, guildId: string): DiscordChannel {
  if (!isRecord(raw)) {
    throw new DiscordApiError("discord_api_error", "Channel payload was not an object.", false);
  }

  const id = asString(raw.id);
  const name = asString(raw.name);
  const type = normalizeChannelType(raw.type);
  assertNonEmptyString(id, "Channel payload is missing an id.");
  assertNonEmptyString(name, "Channel payload is missing a name.");
  assertNonEmptyString(guildId, "Channel payload is missing a guild id.");
  return {
    id,
    guild_id: guildId,
    name,
    type,
    is_thread_capable: isThreadCapableChannelType(type)
  };
}

export function normalizeThread(raw: unknown, parentIdOverride?: string): DiscordThread {
  if (!isRecord(raw)) {
    throw new DiscordApiError("discord_api_error", "Thread payload was not an object.", false);
  }

  const threadType = normalizeThreadType(raw.type);
  const metadata = isRecord(raw.thread_metadata) ? raw.thread_metadata : null;
  const id = asString(raw.id);
  const guildId = asString(raw.guild_id);
  const parentId = parentIdOverride ?? asString(raw.parent_id);
  const name = asString(raw.name);
  assertNonEmptyString(id, "Thread payload is missing an id.");
  assertNonEmptyString(guildId, "Thread payload is missing a guild id.");
  assertNonEmptyString(parentId, "Thread payload is missing a parent id.");
  assertNonEmptyString(name, "Thread payload is missing a name.");

  return {
    id,
    guild_id: guildId,
    parent_id: parentId,
    name,
    thread_type: threadType,
    archived: asBoolean(raw.archived),
    locked: asBoolean(raw.locked),
    auto_archive_duration: asNumber(raw.auto_archive_duration, 1440),
    archive_timestamp: toIso8601(metadata?.archive_timestamp ?? raw.archive_timestamp),
    message_count: asNumber(raw.message_count),
    member_count: asNumber(raw.member_count),
    owner_id: typeof raw.owner_id === "string" ? raw.owner_id : null,
    created_at: toIso8601(raw.created_at),
    last_activity_at: toIso8601(raw.last_activity_at ?? metadata?.archive_timestamp ?? null)
  };
}

export function normalizeThreadMember(raw: unknown, threadId: string): DiscordThreadMember {
  if (!isRecord(raw)) {
    throw new DiscordApiError("discord_api_error", "Thread member payload was not an object.", false);
  }

  const resolvedThreadId = asString(raw.thread_id);
  const resolvedUserId = asString(raw.user_id);
  assertNonEmptyString(resolvedThreadId, "Thread member payload is missing a thread id.");
  assertNonEmptyString(resolvedUserId, "Thread member payload is missing a user id.");

  return {
    thread_id: resolvedThreadId,
    user_id: resolvedUserId,
    join_timestamp: toIso8601(raw.join_timestamp),
    flags: asNumber(raw.flags)
  };
}

export function normalizeMessage(raw: unknown, threadId: string): DiscordMessage {
  if (!isRecord(raw)) {
    throw new DiscordApiError("discord_api_error", "Message payload was not an object.", false);
  }

  const authorRecord = isRecord(raw.author) ? raw.author : null;
  const authorId = asString(authorRecord?.id);
  const authorUsername = asString(authorRecord?.username);
  const author: DiscordAuthor = {
    id: (() => {
      assertNonEmptyString(authorId, "Message payload is missing an author id.");
      return authorId;
    })(),
    username: (() => {
      assertNonEmptyString(authorUsername, "Message payload is missing an author username.");
      return authorUsername;
    })(),
    global_name: typeof authorRecord?.global_name === "string" ? authorRecord.global_name : null
  };

  const id = asString(raw.id);
  const createdAt = asString(raw.created_at);
  assertNonEmptyString(id, "Message payload is missing an id.");
  assertNonEmptyString(createdAt, "Message payload is missing a created_at timestamp.");

  return {
    id,
    thread_id: threadId,
    author,
    content: asString(raw.content),
    created_at: (() => {
      const normalizedCreatedAt = toIso8601(createdAt);
      if (normalizedCreatedAt == null) {
        throw new DiscordApiError("discord_api_error", "Message payload has an invalid created_at timestamp.", false);
      }
      return normalizedCreatedAt;
    })(),
    edited_at: toIso8601(raw.edited_at),
    message_type: normalizeMessageType(raw.type),
    attachments: normalizeAttachments(raw.attachments),
    referenced_message_id: isRecord(raw.referenced_message) ? asString(raw.referenced_message.id) || null : null
  };
}
