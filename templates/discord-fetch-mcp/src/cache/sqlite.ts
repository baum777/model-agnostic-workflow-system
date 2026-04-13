import type pino from "pino";
import type { DiscordFetchEnv } from "../lib/env.js";

export type DiscordCacheLayer = {
  status: "disabled" | "placeholder";
  enabled: false;
  note: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  close(): Promise<void>;
};

export function createDiscordCacheLayer(env: DiscordFetchEnv, logger: pino.Logger): DiscordCacheLayer {
  if (env.ENABLE_SQLITE_CACHE) {
    logger.warn(
      { sqlitePath: env.SQLITE_PATH },
      "SQLite cache is placeholder-only in this template bundle; downstream projects must wire a real driver before enabling it."
    );
  }

  return {
    status: "placeholder",
    enabled: false,
    note: "SQLite cache is placeholder-only in this template bundle.",
    async get() {
      return null;
    },
    async set() {
      return;
    },
    async close() {
      return;
    }
  };
}
