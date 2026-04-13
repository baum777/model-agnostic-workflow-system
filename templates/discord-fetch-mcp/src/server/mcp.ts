import { randomUUID } from "node:crypto";
import type pino from "pino";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDiscordClient } from "../discord/client.js";
import { loadDiscordFetchEnv } from "../lib/env.js";
import { createLogger } from "../lib/logger.js";
import { createDiscordCacheLayer } from "../cache/sqlite.js";
import { registerTools } from "./registerTools.js";
import { createResourceRegistry, registerResources } from "./registerResources.js";

export type DiscordServerRuntime = {
  env: ReturnType<typeof loadDiscordFetchEnv>;
  logger: pino.Logger;
  client: ReturnType<typeof createDiscordClient>;
  cache: ReturnType<typeof createDiscordCacheLayer>;
  tools: ReturnType<typeof registerTools>;
  resources: ReturnType<typeof createResourceRegistry>;
};

export async function createServer() {
  const env = loadDiscordFetchEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const client = createDiscordClient(env);
  const cache = createDiscordCacheLayer(env, logger);
  const runtime: DiscordServerRuntime = {
    env,
    logger,
    client,
    cache,
    tools: [] as ReturnType<typeof registerTools>,
    resources: {} as ReturnType<typeof createResourceRegistry>
  };

  const server = new McpServer({
    name: env.MCP_SERVER_NAME,
    version: "0.1.0"
  });

  runtime.tools = registerTools(server, runtime);
  registerResources(server, runtime);
  runtime.resources = createResourceRegistry(runtime);

  return {
    runtime,
    server,
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info(
        {
          requestId: randomUUID(),
          transport: "stdio",
          server: env.MCP_SERVER_NAME
        },
        "discord-fetch-mcp started"
      );
    }
  };
}
