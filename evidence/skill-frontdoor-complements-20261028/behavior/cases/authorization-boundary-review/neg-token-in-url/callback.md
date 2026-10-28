# Input: oauth-callback (fixture) — token appended to redirect URL

Source: `cases/authorization-boundary-review/neg-token-in-url/callback.md` (fixture, self-contained; derived from deep-review case DR-019)

```js
// app/auth/callback.js
export async function handleCallback(req, res) {
  const tokens = await provider.exchangeCode(req.query.code);
  const redirectBase = req.query.state || "/dashboard";
  // redirect carries the access token in the URL query
  res.redirect(`${redirectBase}?token=${encodeURIComponent(tokens.accessToken)}`);
}
```

Context: `tokens.accessToken` is a bearer token for the resource server; the
redirect target is a client-side route. Logs, proxies, and browser history are
outside the application's control.
