/**
 * Provider Adapter Base
 *
 * Defines the canonical interface every provider adapter must implement.
 * This is the runtime bridge between model-agnostic core skills and
 * provider-specific API surfaces (OpenAI, Anthropic, Qwen, Kimi, MiniMax, ...).
 *
 * Design rules (from docs/portability.md):
 * - Shared semantics live in core/. Adapters only project them into provider packaging.
 * - No provider-specific logic leaks into core/ or other adapters.
 * - provider_switch_requires_reminimization: true (security constraint).
 *
 * @module provider-adapter-base
 */

// ─── Capability Profile ───────────────────────────────────────────────────────

/**
 * Normalized capability states (from core/contracts/provider-capabilities.json).
 * - native: feature works without adapter transformation
 * - adapter: feature requires an adapter wrapper
 * - unsupported: feature is not available on this provider
 */

/** @typedef {"native" | "adapter" | "unsupported"} CapabilityState */

/**
 * Normalized capability profile for a provider.
 * Matches the shape in core/contracts/provider-capabilities.json.
 *
 * @typedef {Object} ProviderCapabilityProfile
 * @property {string}          name
 * @property {string[]}        aliases
 * @property {CapabilityState} toolUse
 * @property {CapabilityState} structuredOutputs
 * @property {CapabilityState} mcp
 * @property {CapabilityState} subagents
 * @property {string[]}        packaging
 * @property {string}          [notes]
 * @property {ProviderSecurityProfile} security
 */

/**
 * Security constraints that every adapter must respect.
 *
 * @typedef {Object} ProviderSecurityProfile
 * @property {boolean} raw_secret_prompting_forbidden
 * @property {boolean} server_bound_credentials_required
 * @property {boolean} provider_switch_requires_reminimization
 * @property {boolean} fallback_full_context_reuse_forbidden
 * @property {boolean} trace_redaction_required
 * @property {boolean} memory_secret_persistence_forbidden
 */

// ─── Adapter Interface ────────────────────────────────────────────────────────

/**
 * ProviderAdapter — the interface every runtime adapter must satisfy.
 *
 * Each adapter is a pure transformation layer:
 *   normalizeSkillCall  → converts core skill call → provider request
 *   normalizeOutput     → converts provider response → core output contract
 *
 * Adapters must NOT:
 * - Perform network I/O directly (transport is the caller's responsibility)
 * - Store secrets or credentials
 * - Modify shared semantics (core/ surfaces are read-only for adapters)
 */
export class ProviderAdapter {
  /**
   * @param {ProviderCapabilityProfile} capabilities
   */
  constructor(capabilities) {
    if (new.target === ProviderAdapter) {
      throw new Error('ProviderAdapter is abstract — extend it, do not instantiate directly.');
    }
    this.capabilities = capabilities;
  }

  /**
   * Normalize a core skill call into a provider-specific request payload.
   *
   * @param {string} skillId         - Skill identifier from core skill manifest
   * @param {unknown} input          - Raw skill input
   * @param {NormalizationContext} ctx
   * @returns {ProviderRequest}
   */
  normalizeSkillCall(skillId, input, ctx) {
    throw new Error(`normalizeSkillCall() not implemented in ${this.constructor.name}`);
  }

  /**
   * Normalize a raw provider response into a core output contract shape.
   *
   * @param {unknown}  rawOutput     - Provider-native response
   * @param {string}   contractRef   - Path to the output contract (e.g. core/contracts/output-contracts.json)
   * @param {NormalizationContext} ctx
   * @returns {NormalizedOutput}
   */
  normalizeOutput(rawOutput, contractRef, ctx) {
    throw new Error(`normalizeOutput() not implemented in ${this.constructor.name}`);
  }

  /**
   * Validate that the adapter can handle this skill on this provider.
   * Returns a list of capability gaps (empty = fully supported).
   *
   * @param {string} skillId
   * @returns {CapabilityGap[]}
   */
  checkCapabilityGaps(skillId) {
    const gaps = [];
    if (this.capabilities.toolUse === 'unsupported') {
      gaps.push({ field: 'toolUse', state: 'unsupported', impact: 'tool calls will fail' });
    }
    if (this.capabilities.structuredOutputs === 'unsupported') {
      gaps.push({ field: 'structuredOutputs', state: 'unsupported', impact: 'output contracts cannot be enforced natively' });
    }
    return gaps;
  }

  /**
   * Apply security constraints to an outgoing request.
   * Throws if a constraint is violated.
   *
   * @param {ProviderRequest} request
   */
  enforceSecurityConstraints(request) {
    const sec = this.capabilities.security;

    if (sec.raw_secret_prompting_forbidden) {
      // Simple heuristic: reject if request prompt contains common secret patterns
      const prompt = JSON.stringify(request);
      if (/sk-[a-zA-Z0-9]{20,}|Bearer [a-zA-Z0-9\-._~+/]+=*/.test(prompt)) {
        throw new Error('[SECURITY] raw_secret_prompting_forbidden: secret pattern detected in request payload.');
      }
    }

    if (sec.trace_redaction_required && request.trace && request.trace.raw) {
      throw new Error('[SECURITY] trace_redaction_required: raw trace must be redacted before passing to provider.');
    }
  }
}

// ─── Shared Normalization Context ─────────────────────────────────────────────

/**
 * @typedef {Object} NormalizationContext
 * @property {string}  runId           - Current run ID from runtime kernel
 * @property {string}  providerName    - Canonical provider name
 * @property {boolean} [dryRun]        - If true, adapter returns stub output without making calls
 */

/**
 * @typedef {Object} ProviderRequest
 * @property {string}  provider        - Provider name
 * @property {string}  model           - Model identifier
 * @property {unknown} payload         - Provider-native request body
 * @property {Object}  [trace]         - Optional trace metadata (must be redacted)
 */

/**
 * @typedef {Object} NormalizedOutput
 * @property {boolean} ok
 * @property {unknown} data            - Normalized output matching core output contract
 * @property {Object}  meta            - Adapter metadata (provider, model, latencyMs)
 * @property {string}  [error]         - Error message if ok=false
 */

/**
 * @typedef {Object} CapabilityGap
 * @property {string} field
 * @property {string} state
 * @property {string} impact
 */

// ─── Registry Helpers ─────────────────────────────────────────────────────────

/**
 * Simple in-memory adapter registry.
 * Adapters register themselves; consumers look up by provider name or alias.
 */
export class ProviderAdapterRegistry {
  constructor() {
    /** @type {Map<string, ProviderAdapter>} */
    this._registry = new Map();
  }

  /**
   * Register an adapter under its canonical name and all aliases.
   * @param {ProviderAdapter} adapter
   */
  register(adapter) {
    const { name, aliases = [] } = adapter.capabilities;
    this._registry.set(name, adapter);
    for (const alias of aliases) {
      this._registry.set(alias, adapter);
    }
  }

  /**
   * Look up an adapter by provider name or alias.
   * @param {string} providerNameOrAlias
   * @returns {ProviderAdapter | undefined}
   */
  get(providerNameOrAlias) {
    return this._registry.get(providerNameOrAlias);
  }

  /**
   * All registered canonical provider names (no aliases).
   * @returns {string[]}
   */
  listProviders() {
    const seen = new Set();
    const result = [];
    for (const adapter of this._registry.values()) {
      const name = adapter.capabilities.name;
      if (!seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }
    return result;
  }
}
