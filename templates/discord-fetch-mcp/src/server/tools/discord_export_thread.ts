import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { ExportThreadInputSchema, ExportThreadOutputSchema } from "../../lib/schema.js";
import { failureFromError, success } from "../../lib/errors.js";
import { renderThreadMarkdownExport } from "../../lib/markdown.js";
import { clampMessageLimit } from "../../discord/pagination.js";
import type { DiscordServerRuntime } from "../mcp.js";

export function registerDiscordExportThreadTool(server: McpServer, runtime: DiscordServerRuntime) {
  server.registerTool(
    "discord_export_thread",
    {
      title: "Export thread",
      description:
        "Use this when you need a Codex-friendly thread export as JSON or Markdown. This tool is read-only and returns a bounded export payload.",
      inputSchema: ExportThreadInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async (rawInput) => {
      const requestId = randomUUID();

      try {
        const input = ExportThreadInputSchema.parse(rawInput);
        const messageLimit = clampMessageLimit(
          input.message_limit ?? runtime.env.EXPORT_DEFAULT_MESSAGE_LIMIT,
          runtime.env.MAX_MESSAGES_PER_CALL
        );
        const threadResult = await runtime.client.getThread(input.thread_id);
        const messagesResult = await runtime.client.getThreadMessages(input.thread_id, {
          limit: messageLimit,
          include_system_messages: true
        });

        const content =
          input.format === "markdown"
            ? renderThreadMarkdownExport(threadResult.thread, messagesResult.messages)
            : JSON.stringify(
                {
                  thread: threadResult.thread,
                  messages: messagesResult.messages
                },
                null,
                2
              );

        const payload = ExportThreadOutputSchema.parse({
          thread_id: input.thread_id,
          format: input.format,
          content
        });

        return {
          content: [
            {
              type: "text",
              text: `Exported thread ${input.thread_id} as ${input.format}.`
            }
          ],
          structuredContent: success(requestId, "noauth", payload)
        };
      } catch (error) {
        const envelope = failureFromError(requestId, "noauth", error);
        return {
          content: [
            {
              type: "text",
              text: `discord_export_thread failed: ${envelope.error.message}`
            }
          ],
          structuredContent: envelope,
          isError: true
        };
      }
    }
  );
}
