export type DiscordChannelType = "GUILD_TEXT" | "GUILD_FORUM" | "GUILD_ANNOUNCEMENT" | "GUILD_MEDIA" | "OTHER";
export type DiscordThreadType = "PUBLIC_THREAD" | "PRIVATE_THREAD" | "ANNOUNCEMENT_THREAD";
export type DiscordMessageType = "DEFAULT" | "REPLY" | "THREAD_STARTER_MESSAGE" | "SYSTEM" | "OTHER";
export type DiscordArchiveScope = "public" | "private" | "joined_private";
export type DiscordExportFormat = "json" | "markdown";

export interface DiscordChannel {
  id: string;
  guild_id: string;
  name: string;
  type: DiscordChannelType;
  is_thread_capable: boolean;
}

export interface DiscordThread {
  id: string;
  guild_id: string;
  parent_id: string;
  name: string;
  thread_type: DiscordThreadType;
  archived: boolean;
  locked: boolean;
  auto_archive_duration: number;
  archive_timestamp: string | null;
  message_count: number;
  member_count: number;
  owner_id: string | null;
  created_at: string | null;
  last_activity_at: string | null;
}

export interface DiscordThreadMember {
  thread_id: string;
  user_id: string;
  join_timestamp: string | null;
  flags: number;
}

export interface DiscordAuthor {
  id: string;
  username: string;
  global_name: string | null;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  content_type: string | null;
  size: number;
  url: string;
}

export interface DiscordMessage {
  id: string;
  thread_id: string;
  author: DiscordAuthor;
  content: string;
  created_at: string;
  edited_at: string | null;
  message_type: DiscordMessageType;
  attachments: DiscordAttachment[];
  referenced_message_id: string | null;
}

export interface DiscordListGuildChannelsResult {
  guild_id: string;
  channels: DiscordChannel[];
  partial: boolean;
}

export interface DiscordListActiveThreadsResult {
  guild_id: string;
  threads: DiscordThread[];
  members: DiscordThreadMember[];
  partial: boolean;
}

export interface DiscordListArchivedThreadsResult {
  channel_id: string;
  archive_scope: DiscordArchiveScope;
  threads: DiscordThread[];
  members: DiscordThreadMember[];
  has_more: boolean;
  next_cursor: string | null;
  partial: boolean;
}

export interface DiscordGetThreadResult {
  thread: DiscordThread;
}

export interface DiscordGetThreadMessagesResult {
  thread_id: string;
  messages: DiscordMessage[];
  partial: boolean;
}

export interface DiscordExportThreadResult {
  thread_id: string;
  format: DiscordExportFormat;
  content: string;
}
