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

## Second Attempt — Anthropic (Failed, Provider-Side Billing Limit)

```text
command: pi --no-tools --no-session --print "Return exactly: PI_SMOKE_OK" --provider anthropic --model claude-haiku-4-5
provider: anthropic
model: claude-haiku-4-5
tool_mode: --no-tools
exit_behaviour: deterministic, returned immediately (--print)
expected_marker: PI_SMOKE_OK
observed_output: HTTP 400 invalid_request_error
error_message: "Third-party apps now draw from your extra usage, not your plan limits. Add more at claude.ai/settings/usage and keep going."
request_id: req_011CcLuMixGo1m8XwijhPm3Y
marker_found: false
approval_tier: Tier 0 (no-tools, no-session, print)
host: baum-Latitude-3440 (persistent Owner-Host, owner-executed)
session: ephemeral (--no-session)
secrets_in_command: none
secrets_in_output: none
.env_read: no
```

**Klassifikation:** Provider-seitiges Billing-/Plan-Limit (Claude-Subscription "extra usage" für Third-Party-Apps erschöpft), kein Pi-Fehler, kein Workspace-Fehler, kein Secret-Leak. Die Fehlermeldung enthält keine Key-Werte, nur eine Nutzungsgrenzen-Auskunft — Secret-Boundary bleibt eingehalten.

**Konsequenz für P-04:** `anthropic` ist damit für aktuelle Smoke-Zwecke vorübergehend nicht nutzbar (Kontingent), unabhängig von der dokumentierten Auth-Fähigkeit. Das ist ein Verfügbarkeits-, kein Architekturproblem — ändert nichts an der bestehenden Provider-Default-Entscheidung.

## Third Attempt — Openai-Codex (Failed, Confirmed Subscription Usage Limit)

```text
command: pi --no-tools --no-session --print "Return exactly: PI_SMOKE_OK" --provider openai-codex --model gpt-5.4-mini
provider: openai-codex
model: gpt-5.4-mini
tool_mode: --no-tools
exit_behaviour: deterministic, returned immediately (--print)
expected_marker: PI_SMOKE_OK
observed_output: HTTP 429 usage_limit_reached
error_type: usage_limit_reached
plan_type: plus
primary_used_percent: 1
secondary_used_percent: 100
primary_reset_at_utc: 2026-06-24 02:37:03
secondary_reset_at_utc: 2026-06-25 11:28:04
credits_balance: 0
marker_found: false
approval_tier: Tier 0 (no-tools, no-session, print)
host: baum-Latitude-3440 (persistent Owner-Host, owner-executed)
session: ephemeral (--no-session)
secrets_in_command: none
secrets_in_output: none
.env_read: no
```

**Klassifikation:** Bestätigtes Subscription-Quota-Limit (Secondary-Window zu 100% ausgeschöpft, Credits-Balance 0), kein Pi-Fehler, kein Secret-Leak. Deckt sich mit der ursprünglichen Owner-Aussage ("Codex-Limit erreicht") aus diesem Slice — Befund ist konsistent, nicht widersprüchlich.

**Konsequenz für P-04:** Alle drei dokumentierten Provider (`minimax` ✓, `anthropic` ✗ Billing, `openai-codex` ✗ Quota) wurden in diesem Slice real angetestet. Einziger funktionierender Smoke bisher: `minimax`. Der primäre Default (`openai-codex`) bleibt durch echte Evidence weiterhin nur als "erreichbar, aber aktuell kontingentiert" belegt — nicht als "funktionsfähig getestet".

## Fourth Run — MiniMax-M3 (Successful, Model-Level Verification)

```text
command: pi --provider minimax --model MiniMax-M3 --no-tools --no-session --print "Return exactly: PI_SMOKE_OK"
provider: minimax
model: MiniMax-M3
tool_mode: --no-tools
exit_behaviour: deterministic, returned immediately (--print)
expected_marker: PI_SMOKE_OK
observed_output: PI_SMOKE_OK
marker_found: true
exit_code: 0
approval_tier: Tier 0 (no-tools, no-session, print)
host: baum-Latitude-3440 (persistent Owner-Host)
session: ephemeral (--no-session)
secrets_in_command: none
secrets_in_output: none
.env_read: no
timestamp_utc: 2026-06-24
```

**Klassifikation:** Erfolgreicher Tier-0-Smoke mit dem Owner-gewählten Default-Modell. Provider-Level-Verifikation (MiniMax-M2.7, Run 1) und Modell-Level-Verifikation (MiniMax-M3, dieser Run) sind jetzt beide abgeschlossen. P-04 ist vollständig durch Runtime-Evidence gedeckt.

**Pi-Config-Kontext:** `~/.pi/agent/settings.json` enthält `defaultProvider: minimax` und `defaultModel: MiniMax-M3` — kein `.env`-sourcing nötig; Credentials intern in Pi konfiguriert.

## Recommended Next Gate

**openai-codex Secondary Verification** — optional nach `secondary_reset_at_utc: 2026-06-25 11:28:04`. Nicht blockierend für v0; minimax/MiniMax-M3 als Default vollständig verifiziert.

Anthropic-Recheck optional, sobald "extra usage" beim Owner wieder verfügbar ist — nicht blockierend für v0.

**Zwischenfazit:** P-04 vollständig durch Runtime-Evidence abgedeckt. minimax/MiniMax-M3 ist Provider-Level UND Modell-Level verifiziert. Nächster Schritt: P-01 Workspace-Reproducibility → `.env.example` → `runtime/surfaces/pi/`.

## References

- `docs/pi-smoke-command-design.md`
- `docs/pi-provider-default-decision.md`
- `docs/pi-secret-handling-spec.md`
- `docs/pi-execution-surface-policy.md`
- `docs/pi-execution-environment-boundary-decision.md`
