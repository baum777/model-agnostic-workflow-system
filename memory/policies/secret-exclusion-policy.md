# Secret Exclusion Policy

Class: operational.
Use rule: memory must fail closed on secret-bearing content.

## Forbidden

- secrets
- tokens
- private keys
- raw credentials
- authorization headers
- DSNs with embedded credentials

## Result

If a memory entry may contain forbidden content, the result is `BLOCKED`.

Do not redact and persist in the runtime writer. Do not store secret-derived summaries unless a later reviewed policy explicitly allows that behavior.
