/**
 * MiniMax Provider Adapter
 *
 * Implements the ProviderAdapter base for MiniMax's OpenAI-compatible API.
 *
 * Capabilities:
 *   toolUse         → native  (function calling via tools array)
 *   structuredOutputs → adapter (JSON mode requires explicit prompt instruction)
 *   mcp             → adapter (no native MCP; bridge via HTTP)
 *   subagents       → adapter (no native orchestration surface)
 *
 * Security constraints from core (all enforced via base class):
 *   raw_secret_prompting_forbidden: true
 *   server_bound_credentials_required: true
 *   provider_switch_requires_reminimization: true
 *   trace_redaction_required: true
 *   memory_secret_persistence_forbidden: true
 *
 * Non-goal: speech/TTS (speech-01-turbo) — provider-only, not in portable core.
 */

import { ProviderAdapter } from '../provider-adapter-base.mjs';

// ─── Capability Profile ───────────────────────────────────────────────────────

const MINIMAX_CAPABILITIES = {
  name: 'minimax',
  aliases: ['minimax-text', 'abab', 'speech-01'],
  toolUse: 'native',
  structuredOutputs: 'adapter',
  mcp: 'adapter',
  subagents: 'adapter',
  packaging: ['openai-compatible-api', 'tool-calls'],
  notes: 'OpenAI-compatible. JSON mode requires explicit prompt shaping.',
  security: {
    raw_secret_prompting_forbidden: true,
    server_bound_credentials_required: true,
    provider_switch_requires_reminimization: true,
    fallback_full_context_reuse_forbidden: true,
    trace_redaction_required: true,
    memory_secret_persistence_forbidden: true,
  },
};

// Default model — consumers may override via normalizeSkillCall ctx.modelOverride
const DEFAULT_MODEL = 'abab6.5s';

// ─── MiniMax Adapter ──────────────────────────────────────────────────────────

export class MiniMaxAdapter extends ProviderAdapter {
  constructor() {
    super(MINIMAX_CAPABILITIES);
  }

  /**
   * Normalize a core skill call into a MiniMax chatcompletion_pro request.
   *
   * MiniMax deviates from standard OpenAI in two ways:
   * 1. `bot_setting` array replaces the system role in messages
   * 2. `role_meta` is required when using the chatcompletion_pro endpoint
   *
   * @param {string}  skillId
   * @param {unknown} input    - Expected shape: { messages, tools?, systemPrompt?, modelOverride? }
   * @param {import('../provider-adapter-base.mjs').NormalizationContext} ctx
   * @returns {import('../provider-adapter-base.mjs').ProviderRequest}
   */
  normalizeSkillCall(skillId, input, ctx) {
    const {
      messages = [],
      tools = [],
      systemPrompt = '',
      modelOverride,
      stream = false,
    } = typeof input === 'object' && input !== null ? input : {};

    const model = modelOverride ?? DEFAULT_MODEL;

    // MiniMax bot_setting replaces system role
    const botSetting = systemPrompt
      ? [{ bot_name: 'skill_executor', content: systemPrompt }]
      : [{ bot_name: 'skill_executor', content: 'You are a helpful assistant.' }];

    // Normalize messages: MiniMax uses sender_type instead of role
    const normalizedMessages = messages.map((msg) => ({
      sender_type: this._mapRole(msg.role ?? 'user'),
      sender_name: msg.name ?? (msg.role === 'assistant' ? 'skill_executor' : 'user'),
      text: msg.content ?? '',
    }));

    // Normalize tools: MiniMax uses OpenAI-compatible functions array
    const functions = tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.parameters ?? { type: 'object', properties: {} },
    }));

    const payload = {
      model,
      bot_setting: botSetting,
      messages: normalizedMessages,
      role_meta: { user_name: 'user', bot_name: 'skill_executor' },
      stream,
      ...(functions.length > 0 ? { functions, function_call: 'auto' } : {}),
    };

    const request = {
      provider: 'minimax',
      model,
      payload,
      trace: {
        runId: ctx.runId,
        skillId,
        providerName: ctx.providerName ?? 'minimax',
        // raw trace MUST NOT be forwarded to provider (trace_redaction_required)
        redacted: true,
      },
    };

    // Enforce security constraints before returning
    this.enforceSecurityConstraints(request);

    return request;
  }

  /**
   * Normalize a MiniMax chatcompletion_pro response into core output contract shape.
   *
   * MiniMax response shape:
   * {
   *   choices: [{ messages: [{ sender_type, text, function_call? }] }],
   *   usage: { total_tokens },
   *   base_resp: { status_code, status_msg }
   * }
   *
   * @param {unknown}  rawOutput
   * @param {string}   contractRef
   * @param {import('../provider-adapter-base.mjs').NormalizationContext} ctx
   * @returns {import('../provider-adapter-base.mjs').NormalizedOutput}
   */
  normalizeOutput(rawOutput, contractRef, ctx) {
    if (!rawOutput || typeof rawOutput !== 'object') {
      return {
        ok: false,
        data: null,
        meta: { provider: 'minimax', model: DEFAULT_MODEL },
        error: 'Empty or non-object response from MiniMax',
      };
    }

    const resp = rawOutput;

    // Check MiniMax base_resp for API-level errors
    if (resp.base_resp?.status_code !== 0) {
      return {
        ok: false,
        data: null,
        meta: {
          provider: 'minimax',
          model: resp.model ?? DEFAULT_MODEL,
          statusCode: resp.base_resp?.status_code,
        },
        error: resp.base_resp?.status_msg ?? 'MiniMax API error',
      };
    }

    const choice = resp.choices?.[0];
    const messages = choice?.messages ?? [];
    const lastMessage = messages[messages.length - 1];

    // Tool/function call
    if (lastMessage?.function_call) {
      return {
        ok: true,
        data: {
          type: 'tool_call',
          tool_name: lastMessage.function_call.name,
          tool_input: this._safeParseJson(lastMessage.function_call.arguments),
          raw_text: lastMessage.text ?? '',
        },
        meta: {
          provider: 'minimax',
          model: resp.model ?? DEFAULT_MODEL,
          totalTokens: resp.usage?.total_tokens ?? null,
          contractRef,
        },
      };
    }

    // Text response
    return {
      ok: true,
      data: {
        type: 'text',
        content: lastMessage?.text ?? '',
      },
      meta: {
        provider: 'minimax',
        model: resp.model ?? DEFAULT_MODEL,
        totalTokens: resp.usage?.total_tokens ?? null,
        contractRef,
      },
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Map OpenAI-style role to MiniMax sender_type.
   * MiniMax uses: USER | BOT | FUNCTION
   */
  _mapRole(role) {
    const map = { user: 'USER', assistant: 'BOT', function: 'FUNCTION', tool: 'FUNCTION' };
    return map[role] ?? 'USER';
  }

  _safeParseJson(str) {
    try {
      return JSON.parse(str);
    } catch {
      return { _raw: str };
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const minimaxAdapter = new MiniMaxAdapter();
