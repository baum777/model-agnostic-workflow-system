import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { GetThreadMessagesInputSchema, GetThreadMessagesOutputSchema } from "../../lib/schema.js";
import { failureFromError, success } from "../../lib/errors.js";
import { clampMessageLimit } from "../../discord/pagination.js";
import type { DiscordServerRuntime } from "../mcp.js";

export function registerDiscordGetThreadMessagesTool(server: McpServer, runtime: DiscordServerRuntime) {
  server.registerTool(
    "discord_get_thread_messages",
    {
      title: "Get thread messages",
      description:
        "Use this when you need normalized message history for a thread. This tool is read-only and returns a bounded message list.",
      inputSchema: GetThreadMessagesInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async (rawInput) => {
      const requestId = randomUUID();

      try {
        const input = GetThreadMessagesInputSchema.parse(rawInput);
        await runtime.client.getThread(input.thread_id);
        const result = await runtime.client.getThreadMessages(input.thread_id, {
          before: input.before,
          after: input.after,
          around: input.around,
          limit: clampMessageLimit(input.limit, runtime.env.MAX_MESSAGES_PER_CALL),
          include_system_messages: input.include_system_messages
        });
        const payload = GetThreadMessagesOutputSchema.parse(result);

        return {
          content: [
            {
              type: "text",
              text: `Returned ${payload.messages.length} message(s) for thread ${input.thread_id}.`
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
              text: `discord_get_thread_messages failed: ${envelope.error.message}`
            }
          ],
          structuredContent: envelope,
          isError: true
        };
      }
    }
  );
}
