import { DiscordApiError } from "../lib/errors.js";
import type { DiscordFetchEnv } from "../lib/env.js";

export function requireDiscordBotToken(env: DiscordFetchEnv) {
  if (env.DISCORD_BOT_TOKEN.trim() === "") {
    throw new DiscordApiError("invalid_input", "DISCORD_BOT_TOKEN is required.", false);
  }

  return env.DISCORD_BOT_TOKEN;
}

export function buildDiscordHeaders(env: DiscordFetchEnv) {
  return {
    Authorization: `Bot ${requireDiscordBotToken(env)}`,
    Accept: "application/json",
    "User-Agent": env.MCP_SERVER_NAME
  };
}
