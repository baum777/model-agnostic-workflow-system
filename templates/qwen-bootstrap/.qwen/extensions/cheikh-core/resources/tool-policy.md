# Tool Policy

## Core rule

Tools are selected by active skill, not by availability.

## Tool classes

### Local files / repo search
- Default truth source for technical and repo-bound work.
- Preferred before external documentation.

### Shell / runtime / tests
- Used for validating actual behavior, scripts, configuration, and health.
- Not used for speculative action.

### Web
- Used for current facts, official docs, product behavior, and external verification.
- Never overrides direct repo reality for local implementation claims.

### MCP
- Allowed only when explicitly needed by the active skill.
- Must be scope-bound.

### Hooks
- Used for policy enforcement, preflight checks, guardrails, and context injection.

## Prohibited shortcuts

- Tool spam without uncertainty reduction
- External theory replacing local evidence
- Silent broad edits after exploratory reads
- Mixed diagnosis + redesign + implementation without mode change
