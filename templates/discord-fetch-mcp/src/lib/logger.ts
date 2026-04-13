import pino from "pino";

export function createLogger(level: string) {
  return pino({
    level,
    redact: ["DISCORD_BOT_TOKEN", "req.headers.authorization", "headers.authorization"]
  });
}
