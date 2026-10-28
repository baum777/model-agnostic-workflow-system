# Authorization Boundary Review — oauth-callback: FINDING (access token in redirect URL query)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/authorization-boundary-review` ·
Input: `cases/authorization-boundary-review/neg-token-in-url/callback.md`

## PRINCIPALS

- End user at the browser (resource owner); authorization server (`provider.exchangeCode`); resource server accepting `tokens.accessToken` as a bearer credential. The callback route itself is the trust-transfer control point.

## SCOPES

- Bearer token scope: whatever the access token grants on the resource server — carried **outside any session boundary** in the reviewed flow (see control point 1).

## CONTROL POINTS

1. `handleCallback` (`cases/.../callback.md`, `app/auth/callback.js`): **FINDING — the access token is transferred in the redirect URL query** (`?token=${...accessToken}`). Bearer tokens in URL queries leak into browser history, proxy and server access logs, and `Referer` headers on downstream navigations; the redirect target is a client-side route, so the token also remains addressable in the URL bar. Required remedy: do not put the access token in the redirect URL; establish a server-side session (or equivalent secure callback mechanism: authorization-code + PKCE with server-side token exchange, or http-only cookie session) and keep the token server-side. Reference: OAuth 2.0 Security BCP (RFC 9700) §4.3.2 — do not pass credentials in URLs.
2. `state` handling: `req.query.state || "/dashboard"` is used unvalidated as the redirect base — open-redirect-shaped control point; must be validated against an allowlist or bound to the transaction (recorded here as a control point requiring evidence, see UNVERIFIED).

## NEGATIVE TESTS

1. Inspect the issued redirect: must contain **no** credential material in the URL (no `token=`, no code fragments) — currently fails by construction.
2. Access-log/redaction probe: after a login, server/proxy logs must not contain a usable bearer token (assert via staged log inspection on a test tenant).
3. Referer probe: navigating from the landing route to a third-party origin must not leak the credential (assert `Referer` absent/redacted) — only meaningful after the remedy, since the current construction fails probe 1.

## UNVERIFIED

- Whether `provider.exchangeCode` validates `state` (CSRF binding) — implementation not supplied.
- Redirect-base allowlisting behavior — see control point 2.
- Lifetime and revocation semantics of `tokens.accessToken` — not evidenced.

## VERDICT

**FINDING, remediation required before any adoption of this pattern.** This is the DR-019 class (confirmed unsafe example): the review flags it and prescribes the secure alternative; it does not adapt the example into anything the skill would endorse.
