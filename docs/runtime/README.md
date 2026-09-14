# Generic Runtime Core — Freeze Surface

Class: canonical freeze frontdoor (2026-09-14).
Use rule: entry point for the frozen generic runtime core baseline. Read
[GENERIC-RUNTIME-BASELINE.md](GENERIC-RUNTIME-BASELINE.md) first. Freeze is not
production readiness, not domain activation, and not security certification.

## Artifacts

| Artifact | Purpose |
| --- | --- |
| [GENERIC-RUNTIME-BASELINE.md](GENERIC-RUNTIME-BASELINE.md) | FROZEN_BASELINE: scope, version pins, test/validation baseline, durability vocabulary, architecture invariants |
| [GENERIC-RUNTIME-CAPABILITY-MATRIX.md](GENERIC-RUNTIME-CAPABILITY-MATRIX.md) | per-capability state at freeze; assurance family map (what proves what) |
| [GENERIC-RUNTIME-OPEN-GAPS.md](GENERIC-RUNTIME-OPEN-GAPS.md) | open-point register with exactly one work class per gap; non-gaps documented |
| [GENERIC-RUNTIME-CHANGE-POLICY.md](GENERIC-RUNTIME-CHANGE-POLICY.md) | freeze invariants + per-change gates + claim discipline |
| [ADAPTER-ACTIVATION-GATES.md](ADAPTER-ACTIVATION-GATES.md) | G1–G5 adapter gate sequence, surface matrix, explicit non-claims |

## Provenance

Freeze decision evidence: `CLG-POST-P11-FINAL-CORE-ASSURANCE-RECON-01.md` and
`CLG-GENERIC-CORE-FREEZE-01-RUN.md` in the parent workspace
(`runtime/context-loop-kernel/`). Chain: P0–P11 CLOSED_PASS, pre-freeze shared
core `7fcbbbc`.

## Quick Rules

- New capability → architecture disposition required (CHANGE-POLICY).
- Contract/artifact change → compatibility analysis + version decision.
- Adapter → G1–G5 gates; conformance PASS is not authorization.
- State machine → owner disposition only (SM-GAP-1..4 stay open).
