import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DiscordServerRuntime } from "./mcp.js";
import { guildChannelsResource, guildChannelsResourceUri } from "./resources/guild_channels.js";
import { guildActiveThreadsResource, guildActiveThreadsResourceUri } from "./resources/guild_active_threads.js";
import { archivedThreadsResource, archivedThreadsResourceUri } from "./resources/archived_threads.js";
import { threadResource, threadResourceUri } from "./resources/thread.js";
import { threadMessagesResource, threadMessagesResourceUri } from "./resources/thread_messages.js";

function toJsonResourceContents(uri: URL, value: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function registerResources(server: McpServer, runtime: DiscordServerRuntime) {
  server.registerResource(
    guildChannelsResource.name,
    new ResourceTemplate(guildChannelsResource.uriTemplate, { list: undefined }),
    {
      title: "Guild channels",
      description: guildChannelsResource.description,
      mimeType: "application/json"
    },
    async (_uri, params) => toJsonResourceContents(new URL(guildChannelsResourceUri(params.guild_id)), await guildChannelsResource.load(runtime, params.guild_id))
  );

  server.registerResource(
    guildActiveThreadsResource.name,
    new ResourceTemplate(guildActiveThreadsResource.uriTemplate, { list: undefined }),
    {
      title: "Guild active threads",
      description: guildActiveThreadsResource.description,
      mimeType: "application/json"
    },
    async (_uri, params) => toJsonResourceContents(new URL(guildActiveThreadsResourceUri(params.guild_id)), await guildActiveThreadsResource.load(runtime, params.guild_id))
  );

  server.registerResource(
    archivedThreadsResource.name,
    new ResourceTemplate(archivedThreadsResource.uriTemplate, { list: undefined }),
    {
      title: "Archived threads",
      description: archivedThreadsResource.description,
      mimeType: "application/json"
    },
    async (_uri, params) => {
      const scope = params.scope === "joined-private" ? "joined_private" : params.scope;
      return toJsonResourceContents(
        new URL(archivedThreadsResourceUri(params.channel_id, scope)),
        await archivedThreadsResource.load(runtime, params.channel_id, scope)
      );
    }
  );

  server.registerResource(
    threadResource.name,
    new ResourceTemplate(threadResource.uriTemplate, { list: undefined }),
    {
      title: "Thread metadata",
      description: threadResource.description,
      mimeType: "application/json"
    },
    async (_uri, params) => toJsonResourceContents(new URL(threadResourceUri(params.thread_id)), await threadResource.load(runtime, params.thread_id))
  );

  server.registerResource(
    threadMessagesResource.name,
    new ResourceTemplate(threadMessagesResource.uriTemplate, { list: undefined }),
    {
      title: "Thread messages",
      description: threadMessagesResource.description,
      mimeType: "application/json"
    },
    async (_uri, params) => {
      const limit = typeof params.limit === "string" ? Number(params.limit) : 100;
      return toJsonResourceContents(
        new URL(threadMessagesResourceUri(params.thread_id, Number.isFinite(limit) ? limit : 100)),
        await threadMessagesResource.load(runtime, params.thread_id, Number.isFinite(limit) ? limit : 100)
      );
    }
  );
}

export function createResourceRegistry(runtime: DiscordServerRuntime) {
  return {
    guildChannels: guildChannelsResource,
    guildActiveThreads: guildActiveThreadsResource,
    archivedThreads: archivedThreadsResource,
    thread: threadResource,
    threadMessages: threadMessagesResource
  };
}
