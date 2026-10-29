# Input: session-clean (fixture)

Source: `cases/authorization-boundary-review/pos-standard/session-flow.md` (fixture, self-contained)

```js
// app/auth/session.js — owning policy: "authenticated principal may act only
// within its tenant; unknown principals are denied by default"
const SESSION_TTL_MS = 30 * 60 * 1000;

export function authenticate(token, keyStore) {
  if (!token) return { principal: null };
  return { principal: keyStore.verify(token) || null };
}

export function authorize(principal, action, resource) {
  if (!principal) return { allowed: false, reason: "UNKNOWN_PRINCIPAL" };
  if (principal.tenantId !== resource.tenantId) {
    return { allowed: false, reason: "CROSS_TENANT" };
  }
  const roleActions = {
    viewer: ["order:read"],
    operator: ["order:read", "order:write"],
    admin: ["order:read", "order:write", "order:delete"],
  };
  const allowed = (roleActions[principal.role] || []).includes(action);
  return { allowed, reason: allowed ? null : "ROLE_MISSING_ACTION" };
}

export async function refresh(session, store) {
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) {
    await store.revoke(session.id);
    return { session: null, reason: "EXPIRED" };
  }
  return store.rotate(session.id);
}

export async function logout(session, store) {
  await store.revoke(session.id);
  return { revoked: true };
}

// app/profile/route.js
import { serializeProfile } from "./serialize.js";
export async function getProfile(req, res) {
  const user = await req.db.users.findById(req.principal.userId);
  res.json(serializeProfile(user)); // explicit DTO projection in serialize.js
}
```

`app/profile/serialize.js` allowlists `id`, `displayName`, `tenantId` and drops
all other fields (including any credential-hash-style fields).
