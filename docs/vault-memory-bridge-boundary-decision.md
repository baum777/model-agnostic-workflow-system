# Vault Memory Bridge Boundary Decision

## Class

derived / docs-only / memory-boundary decision

## Status

accepted boundary — no runtime integration

## Decision

```text
Vault / Memory Bridge is read-only by default.
Write access is blocked unless explicitly approved in a separate owner-scoped write slice.
```

## Rationale

### Vault kann Kontext liefern, aber darf nicht automatisch Wahrheit werden

Vault enthält kanonische Notizen, Review-Cards, MSPR-Packets und Kontext-Fragmente, die
im Laufe der Zeit als Wahrheit anerkannt wurden. Automatisches Schreiben in den Vault —
durch Pi, Subagents oder autonome Agent-Runs — würde diese Wahrheitslinie unterhöhlen:
ungeprüfte Inhalte würden kanonischen Status erhalten, ohne dass eine Owner-Freigabe
stattgefunden hat.

### Memory-Write ist truth-sensitive

Jede Vault-Schreiboperation verändert den Wissensstand des Systems. Falsch promotete
Memory-Einträge sind schwer zu entfernen und können zukünftige Agent-Outputs korrumpieren.
Deshalb: Write ist Tier 2+ und braucht explizite Owner-Approval.

### Pi und Subagents dürfen keine Vault-Inhalte ungeprüft erzeugen oder verändern

Pi (`@earendil-works/pi-coding-agent@0.79.9`) ist eine Execution Surface mit Tools
(`bash`, `edit`, `write`). Diese Tools könnten direkt auf Vault-Dateien angewendet werden,
wenn keine Boundary existiert. Diese Boundary verhindert das: Pi darf Vault-Kontext lesen
und zusammenfassen, aber nicht schreiben.

### Review-Cards / MSPR-Packets dürfen nur als Draft entstehen

Review-Cards und MSPR-Packets sind strukturierte Wissensartefakte. Sie dürfen als Entwürfe
außerhalb des Vaults (in `./drafts/` oder `./sandbox/`) entstehen. Ihre Promotion in den
Vault ist ein expliziter Schritt mit Owner-Approval, Review-Step und Evidence-Trail.

### Promotion in den Vault braucht Owner-Approval

Kein Agent, kein Subagent und keine automatische Pipeline darf Vault-Inhalte direkt
promoten. Promotion = explizite Owner-Entscheidung in einem dedizierten Write-Slice.

## Allowed By Default

```text
read vault context
summarize vault context
reference known notes
extract candidate memory
prepare review-card drafts outside the vault
prepare MSPR packet drafts outside the vault
```

## Blocked By Default

```text
write directly to vault
rewrite canonical notes
create notes inside vault
promote memory to truth
store secrets
store raw logs
store provider/auth details
auto-create MSPR packets as truth
```

## Write Preconditions

Vault write access requires all of:

1. explicit owner approval
2. target folder defined
3. note schema defined
4. write mode defined
5. rollback/cleanup rule
6. no secrets
7. review step
8. evidence trail
9. dedicated write slice
10. no automatic promotion to canonical truth

## Relation To Pi

```text
Pi may consume Vault-derived context only through approved read-only bridges.
Pi must not write to Vault by default.
Any Pi-assisted Vault write is Tier 2+ and owner-approved.
```

Canonical authority for Pi Tier mapping: `docs/pi-execution-surface-policy.md`.
Canonical authority for Secret handling: `docs/pi-secret-handling-spec.md`.

## Relation To Subagents

```text
Subagents may inspect summarized context.
Subagents may not write Vault notes.
Subagents may not promote memory.
Subagents may not access secrets or private credentials.
```

Subagent-Rechte dürfen nie größer sein als Parent-Rechte (per `docs/pi-harness-sandbox-working-plan.md`).
Vault-Write durch Subagents ist permanent blockiert, auch wenn der Parent-Agent Write-Approval hat.

## Relation To runtime/surfaces/pi/

Diese Boundary gilt als zukünftige Referenz für:

- `runtime/surfaces/pi/session-policy.md` — Vault-Write ist Tier 2+ und default-blockiert
- `runtime/surfaces/pi/evidence-contract.md` — Evidence darf keine Vault-Inhalte unkontrolliert spiegeln
- `runtime/surfaces/pi/handoff.md` — Handoff-Format darf keine Vault-Write-Operationen enthalten

Diese Dateien werden in diesem Slice **nicht** modifiziert.

## Relation To Sandbox Working Plan

`docs/pi-harness-sandbox-working-plan.md` (commit `43b68b5`) enthält bereits:

```text
DENY_ALWAYS:
  Obsidian/Vault write access
```

Diese Boundary ergänzt und formalisiert diese Regel als eigenständige Governance-Entscheidung
mit expliziten Write-Preconditions und Promotion-Regeln.

## Non-Goals

- keine Vault-Integration
- keine MCP-Implementierung
- kein Vault-Write in diesem Slice
- kein Runtime-Code
- kein Skill-Schema
- kein Validator
- keine Provider-Änderung
- keine Pi-Ausführung
- keine Obsidian-Datei-Änderung
- keine Submodule-Änderung

## Recommended Next Gate

```text
Pi-Compatible Skill Contract Schema Proposal
```

Ziel: formales Schema für Pi-ausführbare Skills mit allen Pflichtfeldern
(`allowed_agents`, `allowed_models`, `allowed_tools`, `write_mode`, `approval_tier`,
`allowed_paths`, `forbidden_paths`, `secret_boundary`, `evidence_contract`,
`abort_conditions`) — als docs-only Proposal, kein Runtime-Code.
