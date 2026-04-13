import { z } from "zod";
import { parseCsvSet } from "./guards.js";

const envSchema = z
  .object({
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    MCP_SERVER_NAME: z.string().min(1).default("discord_fetch"),
    DISCORD_BOT_TOKEN: z.string().min(1),
    DISCORD_API_BASE: z.string().url().default("https://discord.com/api/v10"),
    ALLOWED_GUILD_IDS: z.string().default(""),
    MAX_THREADS_PER_CALL: z.coerce.number().int().min(1).max(100).default(100),
    MAX_MESSAGES_PER_CALL: z.coerce.number().int().min(1).max(200).default(200),
    ENABLE_SQLITE_CACHE: z.coerce.boolean().default(false),
    SQLITE_PATH: z.string().min(1).default(".data/discord-fetch-mcp.sqlite"),
    EXPORT_DEFAULT_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(500).default(200)
  })
  .strict();

export type DiscordFetchEnv = z.infer<typeof envSchema> & {
  allowedGuildIds: Set<string>;
};

export function loadDiscordFetchEnv(rawEnv: NodeJS.ProcessEnv = process.env): DiscordFetchEnv {
  const parsed = envSchema.parse(rawEnv);
  return {
    ...parsed,
    allowedGuildIds: parseCsvSet(parsed.ALLOWED_GUILD_IDS)
  };
}
