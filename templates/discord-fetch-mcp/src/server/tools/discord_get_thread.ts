import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { GetThreadInputSchema, GetThreadOutputSchema } from "../../lib/schema.js";
import { failureFromError, success } from "../../lib/errors.js";
import type { DiscordServerRuntime } from "../mcp.js";

export function registerDiscordGetThreadTool(server: McpServer, runtime: DiscordServerRuntime) {
  server.registerTool(
    "discord_get_thread",
    {
      title: "Get thread",
      description:
        "Use this when you need normalized metadata for a single thread. This tool is read-only and returns a normalized thread object.",
      inputSchema: GetThreadInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async (rawInput) => {
      const requestId = randomUUID();

      try {
        const input = GetThreadInputSchema.parse(rawInput);
        const result = await runtime.client.getThread(input.thread_id);
        const payload = GetThreadOutputSchema.parse(result);

        return {
          content: [
            {
              type: "text",
              text: `Returned thread ${payload.thread.id}.`
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
              text: `discord_get_thread failed: ${envelope.error.message}`
            }
          ],
          structuredContent: envelope,
          isError: true
        };
      }
    }
  );
}
