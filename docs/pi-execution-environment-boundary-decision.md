# Pi Execution Environment Boundary Decision

## Class

derived / docs-only / execution-environment decision

## Status

proposed — no runtime integration

## Decision

```text
Decision: Owner-host only for v0 Pi smoke execution.
Cowork sandboxes may audit and prepare docs, but must not install or run Pi unless a later explicit install decision is approved.
```

## Rationale

Die aktuell verwendete Cowork-Sandbox ist nicht identisch mit der historischen Owner-Host-Umgebung, in der Pi unter `/home/baum/.npm-global/bin/pi` beobachtet wurde. Der Owner-Host Pi Availability Recheck und der nachfolgende Setup-Alignment-Audit haben bestätigt: In dieser Sandbox existiert `/home/baum/.npm-global` nicht, `pi` ist nicht im PATH, und es ist kein `@earendil-works/pi-coding-agent`-Paket global installiert. Der globale npm-Root dieser Session (`/usr/local/lib/node_modules`) unterscheidet sich vom historisch dokumentierten Pfad.

Eine Installation von Pi in der Cowork-Sandbox wäre eine neue operative Entscheidung mit eigenem Install-, State- und Secret-Risiko — sie ist nicht Gegenstand dieses Slices und nicht automatisch durch die historische Owner-Host-Evidence gedeckt. Für v0 bleibt Pi daher ein external prerequisite: nicht workspace-reproduzierbar, sondern host-gebunden.

Smoke darf nur auf einem Host laufen, auf dem Pi vorher erfolgreich per `which pi`, `pi --version` und `pi --list-models` bestätigt wurde. Solange diese Bestätigung nicht für einen konkreten, tatsächlich für Smoke genutzten Host vorliegt, bleibt Smoke blockiert. `runtime/surfaces/pi/` wird nicht angelegt, solange kein erfolgreicher Smoke mit dokumentierter Evidence existiert — dies ist orthogonal zur Environment-Boundary-Entscheidung und bereits in `docs/pi-workspace-reproducibility-decision.md` (P-12-Abschnitt) festgehalten.

## Environment Boundary

| Environment | Pi observed? | Allowed actions | Forbidden actions |
|---|---|---|---|
| persistent Owner-Host | historically yes | availability check, later smoke readiness | no secrets in logs, no mutating tools |
| Cowork sandbox | currently no | docs/audit only | install, smoke, provider-call |
| Claude/agent sandbox | environment-dependent | docs/audit only unless Pi confirmed | assume Pi availability |

## Required Before Any Smoke

1. Host eindeutig bestimmen
2. `which pi` erfolgreich
3. `pi --version` erfolgreich
4. `pi --list-models` erfolgreich
5. Provider/Model bestätigt
6. Secret Boundary bestätigt
7. Worktree clean
8. Smoke nur mit `--no-tools --no-session --print`
9. keine Tools, kein bash/edit/write
10. Evidence ohne Secrets

## Non-Goals

- keine Installation
- kein Smoke
- keine Pi-Session
- kein `runtime/surfaces/pi/`
- kein `providers/pi/`
- keine `.env.example`
- keine Secrets
- keine Contract-/Skill-/Provider-/Validator-Änderung

## Recommended Next Gate

```text
Owner-Host Manual Availability Checklist
```

Ziel:
- User/Cowork prüft direkt auf dem persistenten Host: `which pi`, `pi --version`, `pi --list-models`
- Ergebnis wird als Evidence zurückgegeben.
- Danach erst Smoke-Readiness.

## References

- `docs/pi-local-runtime-evidence.md`
- `docs/pi-workspace-reproducibility-decision.md`
- `docs/pi-provider-default-decision.md`
- `docs/pi-smoke-command-design.md`
- `docs/pi-secret-handling-spec.md`
- `docs/pi-execution-surface-policy.md`
- `docs/pi-integration-path-decision.md`
