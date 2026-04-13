import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { ListActiveThreadsInputSchema, ListActiveThreadsOutputSchema } from "../../lib/schema.js";
import { failureFromError, success } from "../../lib/errors.js";
import type { DiscordServerRuntime } from "../mcp.js";

export function registerDiscordListActiveThreadsTool(server: McpServer, runtime: DiscordServerRuntime) {
  server.registerTool(
    "discord_list_active_threads",
    {
      title: "List active threads",
      description:
        "Use this when you need to list active threads for a guild, optionally filtered by parent channel. This tool is read-only and returns normalized thread metadata.",
      inputSchema: ListActiveThreadsInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async (rawInput) => {
      const requestId = randomUUID();

      try {
        const input = ListActiveThreadsInputSchema.parse(rawInput);
        const result = await runtime.client.listActiveThreads(input.guild_id, input.parent_channel_id);
        const payload = ListActiveThreadsOutputSchema.parse({
          guild_id: input.guild_id,
          threads: result.threads,
          members: result.members,
          partial: false
        });

        return {
          content: [
            {
              type: "text",
              text: `Returned ${payload.threads.length} active thread(s) for guild ${input.guild_id}.`
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
              text: `discord_list_active_threads failed: ${envelope.error.message}`
            }
          ],
          structuredContent: envelope,
          isError: true
        };
      }
    }
  );
}
