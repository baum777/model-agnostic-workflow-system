import { DiscordApiError } from "../lib/errors.js";
import { clampInt } from "../lib/guards.js";
import type { DiscordFetchEnv } from "../lib/env.js";
import {
  DiscordArchiveScopeSchema,
  ExportFormatSchema,
  ListActiveThreadsOutputSchema,
  ListArchivedThreadsOutputSchema,
  ListGuildChannelsOutputSchema
} from "../lib/schema.js";
import { buildDiscordHeaders } from "./auth.js";
import { DiscordEndpoints } from "./endpoints.js";
import {
  normalizeChannel,
  normalizeMessage,
  normalizeThread,
  normalizeThreadMember
} from "./normalize.js";
import { assertGuildAllowed } from "./permissions.js";
import type {
  DiscordGetThreadMessagesResult,
  DiscordGetThreadResult,
  DiscordListActiveThreadsResult,
  DiscordListArchivedThreadsResult,
  DiscordListGuildChannelsResult
} from "./types.js";

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestDiscordJson<T>(env: DiscordFetchEnv, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, env.DISCORD_API_BASE), {
    ...init,
    headers: {
      ...buildDiscordHeaders(env),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await safeJson(response);
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;

    if (response.status === 403) {
      throw new DiscordApiError("permission_denied", "Discord denied access to the requested resource.", false, {
        status: response.status,
        body
      });
    }

    if (response.status === 404) {
      throw new DiscordApiError("not_found", "Discord did not find the requested resource.", false, {
        status: response.status,
        body
      });
    }

    if (response.status === 429) {
      throw new DiscordApiError("rate_limited", "Discord rate-limited the request.", true, {
        status: response.status,
        retry_after_seconds: retryAfterSeconds,
        body
      });
    }

    throw new DiscordApiError("discord_api_error", `Discord API returned HTTP ${response.status}.`, response.status >= 500, {
      status: response.status,
      body
    });
  }

  return (await response.json()) as T;
}

function normalizeThreadListPayload(payload: unknown, parentId?: string) {
  if (payload == null || typeof payload !== "object") {
    throw new DiscordApiError("discord_api_error", "Thread list payload was not an object.", false);
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.threads)) {
    throw new DiscordApiError("discord_api_error", "Thread list payload is missing a threads array.", false);
  }

  if (record.members != null && !Array.isArray(record.members)) {
    throw new DiscordApiError("discord_api_error", "Thread list payload has a malformed members field.", false);
  }

  const threads = record.threads.map((thread) => normalizeThread(thread, parentId));
  const members = Array.isArray(record.members)
    ? record.members.map((member) => normalizeThreadMember(member, parentId ?? ""))
    : [];
  const hasMore = typeof record.has_more === "boolean" ? record.has_more : false;
  return { threads, members, has_more: hasMore };
}

export type DiscordClient = ReturnType<typeof createDiscordClient>;

export function createDiscordClient(env: DiscordFetchEnv) {
  return {
    async listGuildChannels(guildId: string): Promise<DiscordListGuildChannelsResult> {
      const payload = await requestDiscordJson<unknown[]>(env, DiscordEndpoints.guildChannels(guildId));
      if (!Array.isArray(payload)) {
        throw new DiscordApiError("discord_api_error", "Guild channel payload was not an array.", false);
      }
      const channels = payload.map((channel) => normalizeChannel(channel, guildId));
      return ListGuildChannelsOutputSchema.parse({
        guild_id: guildId,
        channels,
        partial: false
      });
    },

    async listActiveThreads(guildId: string, parentChannelId?: string): Promise<DiscordListActiveThreadsResult> {
      const payload = await requestDiscordJson<unknown>(env, DiscordEndpoints.activeThreads(guildId, parentChannelId));
      const normalized = normalizeThreadListPayload(payload, parentChannelId);
      return ListActiveThreadsOutputSchema.parse({
        guild_id: guildId,
        threads: normalized.threads,
        members: normalized.members,
        partial: false
      });
    },

    async listArchivedThreads(
      channelId: string,
      archiveScope: string,
      before?: string,
      limit = 50
    ): Promise<DiscordListArchivedThreadsResult> {
      const scope = DiscordArchiveScopeSchema.parse(archiveScope);
      const query = new URLSearchParams();
      if (before) {
        query.set("before", before);
      }
      query.set("limit", String(clampInt(limit, 1, env.MAX_THREADS_PER_CALL)));

      const payload = await requestDiscordJson<unknown>(
        env,
        `${DiscordEndpoints.archiveThreads(channelId, scope)}${query.toString() ? `?${query.toString()}` : ""}`
      );
      const normalized = normalizeThreadListPayload(payload, channelId);
      for (const thread of normalized.threads) {
        assertGuildAllowed(env, thread.guild_id);
      }
      return ListArchivedThreadsOutputSchema.parse({
        channel_id: channelId,
        archive_scope: scope,
        threads: normalized.threads,
        members: normalized.members,
        has_more: normalized.has_more,
        next_cursor: normalized.threads.at(-1)?.archive_timestamp ?? null,
        partial: false
      });
    },

    async getThread(threadId: string): Promise<DiscordGetThreadResult> {
      const payload = await requestDiscordJson<unknown>(env, DiscordEndpoints.channel(threadId));
      const thread = normalizeThread(payload);
      assertGuildAllowed(env, thread.guild_id);
      return {
        thread
      };
    },

    async getThreadMessages(
      threadId: string,
      query: Partial<{ before: string; after: string; around: string; limit: number; include_system_messages: boolean }>
    ): Promise<DiscordGetThreadMessagesResult> {
      const params = new URLSearchParams();
      if (query.before) params.set("before", query.before);
      if (query.after) params.set("after", query.after);
      if (query.around) params.set("around", query.around);
      if (query.limit != null) params.set("limit", String(clampInt(query.limit, 1, env.MAX_MESSAGES_PER_CALL)));

      const payload = await requestDiscordJson<unknown[]>(
        env,
        `${DiscordEndpoints.channelMessages(threadId)}${params.toString() ? `?${params.toString()}` : ""}`
      );
      if (!Array.isArray(payload)) {
        throw new DiscordApiError("discord_api_error", "Thread message payload was not an array.", false);
      }
      const messages = payload.map((message) => normalizeMessage(message, threadId));
      const filtered = query.include_system_messages ? messages : messages.filter((message) => message.message_type !== "SYSTEM");
      return {
        thread_id: threadId,
        messages: filtered,
        partial: false
      };
    },

    async exportThread(threadId: string, format: "json" | "markdown", messageLimit: number) {
      const threadResult = await this.getThread(threadId);
      const messagesResult = await this.getThreadMessages(threadId, {
        limit: clampInt(messageLimit, 1, env.MAX_MESSAGES_PER_CALL),
        include_system_messages: true
      });

      ExportFormatSchema.parse(format);

      return {
        thread_id: threadId,
        format,
        thread: threadResult.thread,
        messages: messagesResult.messages
      };
    }
  };
}
