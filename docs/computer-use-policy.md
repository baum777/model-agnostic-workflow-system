# Computer Use Policy

Class: prose-governed (no enforcing validator yet).
Use rule: read this before proposing, scoping, or activating any computer-use, browser-use, or desktop-automation surface for Baum-OS, this repo, or any Pi/Provider adapter. This file defines a default-deny policy boundary. It does not itself activate any runtime capability, tool binding, or agent permission.

## Purpose

Computer-use (direct UI/desktop/browser control by an agent) is the highest-risk interface tier available to an agent. This policy exists to keep computer-use as a last-resort fallback, never a default path, and to make every computer-use action subject to explicit scope, evidence, and human approval before it can run against anything but a low-risk, reversible, sandboxed surface.

## Preferred Interface Order

Agents must prefer interfaces in this order, top to bottom, and may only drop to a lower tier when every higher tier is genuinely unavailable or insufficient for the task:

1. MCP (typed, scoped, audited tool calls)
2. CLI (deterministic, scriptable, repo-local or sandboxed)
3. API (direct, versioned, credential-bound per `policies/tool-capabilities.yaml`)
4. Local files (read/write within an explicitly granted repo/path scope)
5. Browser-Use with an explicitly narrow scope (single site, single task, no credential entry)
6. Deterministic handlers (purpose-built scripts/validators instead of free-form UI control)
7. Computer-Use as fallback only, and only under the constraints below

## Computer-Use Allowed Only If

All of the following must hold before computer-use may even be proposed for execution:

- No higher-tier interface (1–6 above) can accomplish the task.
- The target surface, action, and expected end-state are named explicitly in advance.
- The action is reversible, or its irreversible portion is isolated and named explicitly.
- The scope is a single named task, not an open-ended session.
- No secret material (Class A/B/C per `policies/secret-classes.yaml`) is entered, displayed, or extracted during the action.
- Required Approval (below) has been obtained before execution, not after.
- Evidence Required (below) can actually be produced for this action.

## Forbidden By Default

Computer-use must not be used for, regardless of stated justification or apparent user benefit:

- Password managers or credential vaults
- API-key generation, rotation, or display pages
- Banking, payment, trading, or wallet interfaces
- Productive/production deployments or release actions
- Admin consoles for live systems
- Mass or bulk changes across many records, files, or accounts
- Irreversible actions (deletion, permanent state transitions, one-way sends)
- Account or security settings (email, 2FA, recovery, access control)
- Vault write access of any kind
- Private messages or emails (reading or sending on a human's behalf)
- Any action with invisible side effects (effects not visible in the immediate UI state the agent can observe)

This list is a default-deny floor. It is not exhaustive, and ambiguous cases fail closed (treated as forbidden) rather than being inferred as allowed.

## Required Approval

- Every computer-use action requires explicit, scoped, one-off human approval (Freigabe) naming the exact action and target surface — a standing or session-wide approval does not cover computer-use.
- Approval for one action does not extend to a similar, adjacent, or follow-up action.
- If approval is ambiguous, missing, or implied rather than explicit, the agent must stop with `blocked` and name exactly what approval is missing.
- Human Approval remains the final gate for computer-use per the existing decision record (`docs/pi-agent-kit-adapter-core-anchor-decision.md`, Adapter-Zielbild: "Human Approval: bleibt finale Freigabeinstanz für riskante Schreib-, Credential-, Produktions- und Computer-Use-Aktionen").

## Evidence Required

For any executed computer-use action, the agent must produce and report:

- The exact target surface (URL, application, window/screen) acted on.
- The exact action taken (click, type, navigate, etc.), not a paraphrase.
- The observed before-state and after-state of the relevant UI region.
- Confirmation that no secret material (Class A/B/C) was visible, entered, or captured during the action.
- A reference to the specific human approval that authorized this exact action.

If any of these cannot be produced, the action's execution status may not be reported as `applied` or `verified` (per the Execution Claim Policy in `AGENTS.md`); it must be reported as `BLOCKED`.

## Relation To Skill Contracts

- This policy is independent of, and additive to, the per-skill `write_mode` / `human_approval_required` fields identified as gaps in `docs/pi-agent-kit-adapter-core-anchor-decision.md`.
- A skill with `write_mode: approved_write` does not by itself authorize computer-use; computer-use requires this policy's own approval and evidence gate in addition to any skill-level write gate.
- No skill in `skills/` currently declares a computer-use capability or binding. This file does not change that.

## Runtime Status

Diese Datei aktiviert keine Runtime-Fähigkeit. Es existiert aktuell kein Computer-Use-Tool-Binding, keine Browser-Use-Integration und keine Desktop-Automation in diesem Repo. Diese Datei begründet keinen Computer-Use-Zugriff; sie legt nur die Bedingungen fest, unter denen ein zukünftiger Computer-Use-Vorschlag überhaupt geprüft werden dürfte. Klassifikation: `prose-governed`, kein Validator vorhanden, kein `runtime-implemented`-Nachweis.

## Non-Goals

- Keine Aktivierung eines Computer-Use-, Browser-Use- oder Desktop-Automation-Tools in diesem Slice.
- Keine Änderung an `policies/tool-capabilities.yaml` oder `policies/secret-classes.yaml`.
- Keine Skill-Contract-Schema-Änderung in diesem Slice.
- Keine Human-Approval-Brücke/-Implementierung in diesem Slice (siehe weiterhin offene Gaps in `docs/pi-agent-kit-adapter-core-anchor-decision.md`).
- Keine Pi-Provider-Implementierung.

## Next Gate

Ein separater, kleiner docs-only oder contract-only Slice — noch keine Umsetzung:

- entweder ein Skill-Contract-Gap-Dokument (Feld-für-Feld-Erweiterungsvorschlag, inkl. eines möglichen `computer_use_allowed: bool`-Feldes pro Skill),
- oder eine Human-Approval-Brücke zwischen dem prosa-basierten Tier-Modell und der technischen Review-Policy-Schicht,
- oder eine Pi-Provider-Adapter-Spezifikation nach dem Muster von `providers/minimax/README.md`.

## Verification

Diese Policy ist `prose-governed`. Sie wird nicht durch ein Skript erzwungen. Verifikation bedeutet hier ausschließlich: Diese Datei existiert unter `docs/computer-use-policy.md`, ist von `docs/README.md` aus nicht automatisch verlinkt (kein Eintrag in diesem Slice ergänzt — siehe Nicht-anfassen-Scope), und referenziert ausschließlich bereits bestehende Dateien (`AGENTS.md`, `policies/tool-capabilities.yaml`, `policies/secret-classes.yaml`, `docs/pi-agent-kit-adapter-core-anchor-decision.md`).
