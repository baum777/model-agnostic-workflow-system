import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { ListArchivedThreadsInputSchema, ListArchivedThreadsOutputSchema } from "../../lib/schema.js";
import { failureFromError, success } from "../../lib/errors.js";
import { clampThreadLimit } from "../../discord/pagination.js";
import type { DiscordServerRuntime } from "../mcp.js";

export function registerDiscordListArchivedThreadsTool(server: McpServer, runtime: DiscordServerRuntime) {
  server.registerTool(
    "discord_list_archived_threads",
    {
      title: "List archived threads",
      description:
        "Use this when you need to list archived public, private, or joined-private threads for a channel. This tool is read-only and returns normalized thread metadata plus pagination hints.",
      inputSchema: ListArchivedThreadsInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async (rawInput) => {
      const requestId = randomUUID();

      try {
        const input = ListArchivedThreadsInputSchema.parse(rawInput);
        const result = await runtime.client.listArchivedThreads(
          input.channel_id,
          input.archive_scope,
          input.before,
          clampThreadLimit(input.limit, runtime.env.MAX_THREADS_PER_CALL)
        );
        const payload = ListArchivedThreadsOutputSchema.parse({
          channel_id: input.channel_id,
          archive_scope: input.archive_scope,
          threads: result.threads,
          members: result.members,
          has_more: result.has_more,
          next_cursor: result.next_cursor,
          partial: false
        });

        return {
          content: [
            {
              type: "text",
              text: `Returned ${payload.threads.length} archived thread(s) for channel ${input.channel_id}.`
            }
          ],
          structuredContent: success(requestId, "noauth", payload, {
            pagination: {
              nextCursor: payload.next_cursor
            }
          })
        };
      } catch (error) {
        const envelope = failureFromError(requestId, "noauth", error);
        return {
          content: [
            {
              type: "text",
              text: `discord_list_archived_threads failed: ${envelope.error.message}`
            }
          ],
          structuredContent: envelope,
          isError: true
        };
      }
    }
  );
}
