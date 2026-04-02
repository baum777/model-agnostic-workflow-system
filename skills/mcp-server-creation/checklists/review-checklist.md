# MCP Server Review Checklist

## Scope And Architecture

- [ ] The server type is explicit: internal tool server, ChatGPT App server, or API integration server.
- [ ] The server boundary is documented, including what is out of scope.
- [ ] The architecture summary matches the real implementation.
- [ ] The server prefers remote MCP patterns unless a local-only reason is documented.

## Tool Design

- [ ] The tool catalog was defined before broad implementation.
- [ ] Every tool description uses `Use this when...`.
- [ ] Read-only tools are separate from write/destructive tools.
- [ ] Tool names are narrow, not overloaded.
- [ ] Tool annotations or equivalent metadata match actual behavior.

## Schemas And Contracts

- [ ] Every tool has explicit input validation.
- [ ] Unknown or malformed inputs are rejected.
- [ ] Every tool has an explicit output contract.
- [ ] Success and error shapes are stable and documented.
- [ ] Pagination, warnings, and rate-limit metadata are documented where applicable.

## Auth And Security

- [ ] The auth model is documented as `noauth`, `oauth2`, or mixed auth.
- [ ] The executing identity is explicit per tool or per auth path.
- [ ] Least privilege is applied to scopes, secrets, and upstream permissions.
- [ ] Prompt-injection and untrusted-text risks are considered where relevant.
- [ ] No hidden writes exist behind read-only tools.
- [ ] External side effects are documented explicitly.

## Operations

- [ ] Structured logs include request IDs or equivalent correlation.
- [ ] Errors are categorized into validation, auth, upstream, and internal failures.
- [ ] Upstream rate limits are handled or documented honestly.
- [ ] Caching is used only where safe and documented with TTL assumptions.
- [ ] Environment variables are documented without leaking secrets.

## Testing And Honesty

- [ ] At least one example or test exists for the highest-risk tool paths.
- [ ] Deployment notes exist.
- [ ] Acceptance criteria exist and are specific.
- [ ] Placeholders, TODOs, and assumptions are labeled explicitly.
- [ ] The server is not described as production-ready unless auth, validation, observability, and testing are materially complete.
