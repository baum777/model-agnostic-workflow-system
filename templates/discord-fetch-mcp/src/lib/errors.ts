import { z } from "zod";

export type DiscordAuthMode = "noauth";

export type DiscordToolErrorCode =
  | "invalid_input"
  | "not_found"
  | "permission_denied"
  | "rate_limited"
  | "discord_api_error"
  | "partial_result"
  | "unsupported_channel_type"
  | "guild_not_allowed"
  | "tool_execution_failed";

export type SuccessEnvelope<T> = {
  ok: true;
  data: T;
  meta: {
    requestId: string;
    auth: DiscordAuthMode;
    warnings: string[];
    rateLimit?: {
      remaining?: number;
      resetSeconds?: number;
    };
    pagination?: {
      nextCursor?: string | null;
    };
  };
};

export type ErrorEnvelope = {
  ok: false;
  error: {
    code: DiscordToolErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: {
    requestId: string;
    auth: DiscordAuthMode;
    warnings: string[];
  };
};

export class DiscordApiError extends Error {
  code: DiscordToolErrorCode;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(code: DiscordToolErrorCode, message: string, retryable = false, details?: Record<string, unknown>) {
    super(message);
    this.name = "DiscordApiError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function success<T>(
  requestId: string,
  auth: DiscordAuthMode,
  data: T,
  extra?: Partial<SuccessEnvelope<T>["meta"]>
): SuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      requestId,
      auth,
      warnings: extra?.warnings ?? [],
      rateLimit: extra?.rateLimit,
      pagination: extra?.pagination
    }
  };
}

export function failure(
  requestId: string,
  auth: DiscordAuthMode,
  code: DiscordToolErrorCode,
  message: string,
  retryable = false,
  details?: Record<string, unknown>
): ErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
      details
    },
    meta: {
      requestId,
      auth,
      warnings: []
    }
  };
}

export function failureFromError(
  requestId: string,
  auth: DiscordAuthMode,
  error: unknown,
  fallbackCode: DiscordToolErrorCode = "tool_execution_failed"
): ErrorEnvelope {
  if (error instanceof DiscordApiError) {
    return failure(requestId, auth, error.code, error.message, error.retryable, error.details);
  }

  if (error instanceof z.ZodError) {
    return failure(requestId, auth, "invalid_input", error.message, false, {
      issues: error.issues
    });
  }

  if (error instanceof Error) {
    return failure(requestId, auth, fallbackCode, error.message, false);
  }

  return failure(requestId, auth, fallbackCode, "Unknown error", false);
}
