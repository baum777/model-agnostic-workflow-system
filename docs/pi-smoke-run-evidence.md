# Pi Smoke Run Evidence

## Class

derived / docs-only / smoke-run evidence record

## Status

executed — Tier 0 smoke confirmed

## Use Rule

Dieses Dokument dokumentiert das Ergebnis eines bereits ausgeführten Tier-0 Pi-Smokes auf dem persistenten Owner-Host. Es ist reine Evidence-Ablage, kein neuer Trigger für Runtime-Integration. Canonical authority für Command-Design: `docs/pi-smoke-command-design.md`. Canonical authority für Secret-Boundary: `docs/pi-secret-handling-spec.md`.

## Context

Codex-Subscription-Limit (`openai-codex`) war zum Ausführungszeitpunkt erreicht. Smoke wurde daher mit dem dokumentierten Fallback-Provider (`docs/pi-provider-default-decision.md`) ausgeführt statt mit dem primären Default.

## Evidence

```text
command: pi --no-tools --no-session --print "Return exactly: PI_SMOKE_OK" --provider minimax --model MiniMax-M2.7
provider: minimax
model: MiniMax-M2.7
tool_mode: --no-tools
exit_behaviour: deterministic, returned immediately (--print)
expected_marker: PI_SMOKE_OK
observed_output: PI_SMOKE_OK
marker_found: true
approval_tier: Tier 0 (no-tools, no-session, print)
host: baum-Latitude-3440 (persistent Owner-Host, owner-executed)
session: ephemeral (--no-session)
secrets_in_command: none
secrets_in_output: none
.env_read: no
```

## Result

Pi ist auf dem persistenten Owner-Host startbar, Provider-erreichbar (minimax) und liefert einen deterministischen Exit ohne Tool-Ausführung. Damit ist die Grundannahme aus `docs/pi-smoke-command-design.md` (P-03) bestätigt: Pi kann Tier-0-Smokes ohne Mutation und ohne Secret-Exposition ausführen.

## Scope Of This Evidence

Bestätigt:
- Pi-Binary-Startbarkeit auf Owner-Host
- `--no-tools --no-session --print` Shape funktioniert wie dokumentiert
- `minimax`-Provider ist über Pi erreichbar und liefert korrekten Marker

Nicht bestätigt durch diesen Smoke:
- `openai-codex` (primärer Default) — nicht getestet, da Subscription-Limit erreicht; weiterhin nur P-04-Doc-Annahme
- `anthropic` — nicht getestet in diesem Run
- Tool-Ausführung (read oder mutierend) — bewusst ausgeschlossen (`--no-tools`)
- Verhalten bei Session-Persistenz (`--no-session` war aktiv)

## Relation To Open Preconditions

| Precondition | Status nach diesem Run |
|---|---|
| P-03 Smoke-Befehl ohne Secrets | **ausgeführt und mit Evidence belegt** (dieser Run, Provider minimax statt openai-codex) |
| P-04 Provider-Auswahl (`openai-codex` primary) | weiterhin unverifiziert durch echten Smoke — nur minimax-Fallback bestätigt |
| P-05 Secret-Handling | eingehalten — keine Secrets im Command oder Output |
| P-06 Approval-Tiers | Tier 0 bestätigt — kein Human Approval nötig, Boundary eingehalten |
| P-12 Architekturentscheidung | weiterhin offen — dieser Smoke ändert nichts an "No Integration Yet" |

## Non-Goals

- keine Runtime-Integration ausgelöst durch diesen Run
- kein `runtime/surfaces/pi/`
- kein `providers/pi/`
- kein Adapter-Code
- keine Contract-/Skill-/Validator-Änderung
- keine weitere Pi-Session in diesem Slice

## Recommended Next Gate

**Pi Provider Default Verification (openai-codex)** — sobald das Subscription-Limit zurückgesetzt ist, denselben Tier-0-Smoke mit dem primären Default (`openai-codex`, Modellkandidat aus `pi --list-models`) wiederholen, um P-04 vollständig durch Runtime-Evidence zu decken statt nur durch Doc-Annahme.

## References

- `docs/pi-smoke-command-design.md`
- `docs/pi-provider-default-decision.md`
- `docs/pi-secret-handling-spec.md`
- `docs/pi-execution-surface-policy.md`
- `docs/pi-execution-environment-boundary-decision.md`
