import type { DiscordMessage, DiscordThread } from "../discord/types.js";

export function renderThreadMarkdownExport(thread: DiscordThread, messages: DiscordMessage[]) {
  const lines = [
    `# ${thread.name}`,
    "",
    `- thread_id: ${thread.id}`,
    `- parent_id: ${thread.parent_id}`,
    `- thread_type: ${thread.thread_type}`,
    `- archived: ${thread.archived}`,
    `- locked: ${thread.locked}`,
    `- last_activity_at: ${thread.last_activity_at ?? "null"}`,
    "",
    "## Messages",
    ""
  ];

  for (const message of messages) {
    const timestamp = message.created_at.slice(0, 19).replace("T", " ");
    lines.push(`- ${timestamp} ${message.author.username}: ${message.content}`);
  }

  return `${lines.join("\n")}\n`;
}
