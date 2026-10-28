# Input: profile-route (fixture) — full persistence object serialized

Source: `cases/authorization-boundary-review/neg-unprojected-user/profile.md` (fixture, self-contained; derived from deep-review case DR-020)

```js
// app/profile/route.js
export async function getProfile(req, res) {
  const user = await db.users.findById(req.principal.userId);
  res.json({ user });
}
```

```js
// app/profile/model.js (excerpt)
export const User = schema({
  id: "uuid",
  displayName: "string",
  tenantId: "uuid",
  passwordHash: "string",   // credential-hash-style field on the same object
  mfaSecret: "string",
});
```

Context: the same model is used for persistence and for the session example in
the adjacent training doc; no response DTO or field allowlist is configured for
this route.
