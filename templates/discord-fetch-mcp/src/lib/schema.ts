import { z } from "zod";

export const ChannelTypeSchema = z.enum([
  "GUILD_TEXT",
  "GUILD_FORUM",
  "GUILD_ANNOUNCEMENT",
  "GUILD_MEDIA",
  "OTHER"
]);

export const ThreadTypeSchema = z.enum(["PUBLIC_THREAD", "PRIVATE_THREAD", "ANNOUNCEMENT_THREAD"]);

export const MessageTypeSchema = z.enum(["DEFAULT", "REPLY", "THREAD_STARTER_MESSAGE", "SYSTEM", "OTHER"]);

export const ArchiveScopeSchema = z.enum(["public", "private", "joined_private"]);

export const ExportFormatSchema = z.enum(["json", "markdown"]);

export const AttachmentSchema = z
  .object({
    id: z.string(),
    filename: z.string(),
    content_type: z.string().nullable(),
    size: z.number().int().nonnegative(),
    url: z.string()
  })
  .strict();

export const AuthorSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    global_name: z.string().nullable()
  })
  .strict();

export const ChannelSchema = z
  .object({
    id: z.string(),
    guild_id: z.string(),
    name: z.string(),
    type: ChannelTypeSchema,
    is_thread_capable: z.boolean()
  })
  .strict();

export const ThreadSchema = z
  .object({
    id: z.string(),
    guild_id: z.string(),
    parent_id: z.string(),
    name: z.string(),
    thread_type: ThreadTypeSchema,
    archived: z.boolean(),
    locked: z.boolean(),
    auto_archive_duration: z.number().int().positive(),
    archive_timestamp: z.string().datetime().nullable(),
    message_count: z.number().int().nonnegative(),
    member_count: z.number().int().nonnegative(),
    owner_id: z.string().nullable(),
    created_at: z.string().datetime().nullable(),
    last_activity_at: z.string().datetime().nullable()
  })
  .strict();

export const ThreadMemberSchema = z
  .object({
    thread_id: z.string(),
    user_id: z.string(),
    join_timestamp: z.string().datetime().nullable(),
    flags: z.number().int()
  })
  .strict();

export const MessageSchema = z
  .object({
    id: z.string(),
    thread_id: z.string(),
    author: AuthorSchema,
    content: z.string(),
    created_at: z.string().datetime(),
    edited_at: z.string().datetime().nullable(),
    message_type: MessageTypeSchema,
    attachments: z.array(AttachmentSchema),
    referenced_message_id: z.string().nullable()
  })
  .strict();

export const PaginatedResultEnvelopeSchema = z
  .object({
    partial: z.boolean(),
    has_more: z.boolean(),
    next_cursor: z.string().nullable()
  })
  .strict();

export const ListGuildChannelsInputSchema = z
  .object({
    guild_id: z.string().min(1),
    include_types: z
      .array(ChannelTypeSchema)
      .refine((items) => new Set(items).size === items.length, { message: "include_types must contain unique values." })
      .default(["GUILD_TEXT", "GUILD_FORUM", "GUILD_ANNOUNCEMENT", "GUILD_MEDIA"])
  })
  .strict();

export const ListGuildChannelsOutputSchema = z
  .object({
    guild_id: z.string(),
    channels: z.array(ChannelSchema),
    partial: z.boolean()
  })
  .strict();

export const ListActiveThreadsInputSchema = z
  .object({
    guild_id: z.string().min(1),
    parent_channel_id: z.string().min(1).optional()
  })
  .strict();

export const ListActiveThreadsOutputSchema = z
  .object({
    guild_id: z.string(),
    threads: z.array(ThreadSchema),
    members: z.array(ThreadMemberSchema),
    partial: z.boolean()
  })
  .strict();

export const ListArchivedThreadsInputSchema = z
  .object({
    channel_id: z.string().min(1),
    archive_scope: ArchiveScopeSchema,
    before: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(50)
  })
  .strict();

export const ListArchivedThreadsOutputSchema = z
  .object({
    channel_id: z.string(),
    archive_scope: ArchiveScopeSchema,
    threads: z.array(ThreadSchema),
    members: z.array(ThreadMemberSchema),
    has_more: z.boolean(),
    next_cursor: z.string().nullable(),
    partial: z.boolean()
  })
  .strict();

export const GetThreadInputSchema = z
  .object({
    thread_id: z.string().min(1)
  })
  .strict();

export const GetThreadOutputSchema = z
  .object({
    thread: ThreadSchema
  })
  .strict();

export const GetThreadMessagesInputSchema = z
  .object({
    thread_id: z.string().min(1),
    before: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
    around: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    include_system_messages: z.boolean().default(false)
  })
  .strict();

export const GetThreadMessagesOutputSchema = z
  .object({
    thread_id: z.string(),
    messages: z.array(MessageSchema),
    partial: z.boolean()
  })
  .strict();

export const ExportThreadInputSchema = z
  .object({
    thread_id: z.string().min(1),
    format: ExportFormatSchema.default("markdown"),
    message_limit: z.number().int().min(1).max(500).default(200)
  })
  .strict();

export const ExportThreadOutputSchema = z
  .object({
    thread_id: z.string(),
    format: ExportFormatSchema,
    content: z.string()
  })
  .strict();
