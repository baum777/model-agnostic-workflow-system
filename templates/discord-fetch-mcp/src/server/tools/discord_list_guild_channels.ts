import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { ListGuildChannelsInputSchema, ListGuildChannelsOutputSchema } from "../../lib/schema.js";
import { failureFromError, success } from "../../lib/errors.js";
import { assertGuildAllowed } from "../../discord/permissions.js";
import type { DiscordServerRuntime } from "../mcp.js";

export function registerDiscordListGuildChannelsTool(server: McpServer, runtime: DiscordServerRuntime) {
  server.registerTool(
    "discord_list_guild_channels",
    {
      title: "List guild channels",
      description:
        "Use this when you need to discover thread-capable parent channels for a guild. This tool is read-only and returns normalized channel metadata.",
      inputSchema: ListGuildChannelsInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async (rawInput) => {
      const requestId = randomUUID();

      try {
        const input = ListGuildChannelsInputSchema.parse(rawInput);
        assertGuildAllowed(runtime.env, input.guild_id);

        const result = await runtime.client.listGuildChannels(input.guild_id);
        const payload = ListGuildChannelsOutputSchema.parse({
          guild_id: input.guild_id,
          channels: result.channels.filter((channel) => input.include_types.includes(channel.type)),
          partial: false
        });

        return {
          content: [
            {
              type: "text",
              text: `Returned ${payload.channels.length} channel(s) for guild ${input.guild_id}.`
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
              text: `discord_list_guild_channels failed: ${envelope.error.message}`
            }
          ],
          structuredContent: envelope,
          isError: true
        };
      }
    }
  );
}
