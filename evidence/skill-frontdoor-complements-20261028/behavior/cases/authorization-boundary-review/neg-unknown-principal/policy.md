# Input: legacy-fallback (fixture) — unknown principal falls back to viewer

Source: `cases/authorization-boundary-review/neg-unknown-principal/policy.md` (fixture, self-contained)

```js
// app/authz/authorize.js
export function authorize(principal, action, resource) {
  let role = principal?.role;
  if (!role) {
    // legacy fallback: unmapped principals keep read access for compatibility
    role = "viewer";
  }
  const roleActions = {
    viewer: ["order:read"],
    operator: ["order:read", "order:write"],
  };
  const tenantOk = !resource?.tenantId || principal?.tenantId === resource.tenantId;
  return { allowed: tenantOk && roleActions[role].includes(action) };
}
```

Context: `principal` is `null` for unauthenticated calls in one legacy route
that does not run the authentication middleware; the owning policy document
states "unknown principals are denied by default".
