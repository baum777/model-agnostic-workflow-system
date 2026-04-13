import { clampInt } from "../lib/guards.js";

export function clampThreadLimit(limit: number, ceiling: number) {
  return clampInt(limit, 1, ceiling);
}

export function clampMessageLimit(limit: number, ceiling: number) {
  return clampInt(limit, 1, ceiling);
}

export function nextCursorFromThreads<T extends { archive_timestamp: string | null }>(threads: T[]) {
  const last = threads.at(-1);
  return last?.archive_timestamp ?? null;
}
