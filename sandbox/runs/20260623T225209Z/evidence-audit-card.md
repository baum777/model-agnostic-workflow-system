# Evidence Audit Card

## Result

rework

## Audited Run

`sandbox/runs/20260623T225209Z/`

## Contract Used

- `docs/evidence-path-contract.md`
- `skills/pi/tier1-evidence-audit.skill.yaml`

## Evidence Presence

| Artifact | Status | Notes |
|----------|--------|-------|
| `intent.md` | present | Concrete — names skill, goal, boundaries |
| `commands-run.md` | present | Concrete — full Pi command, exit code 0, no secrets confirmed |
| `files-read.md` | present | Concrete — "None" (Pi invoked with `--no-session --print`, no repo files read) |
| `files-changed.md` | present | Lists `docs/proposals/pi-tier1-docs-draft-proposal.md` as created |
| `validation.md` | present | Has explicit "pass" verdict; secret-check fields embedded in table |
| `diff.patch` | weak | File exists but is empty (0 bytes) — see Consistency Checks |
| `risks.md` | present | Three concrete, well-scoped findings |
| `next-gate.md` | present | Concrete — names the proposal review decision and correct promotion gate |

## Consistency Checks

| Check | Result | Detail |
|-------|--------|--------|
| `commands-run.md` — no secrets | pass | No `--api-key`, no env vars, no credentials in command |
| `files-changed.md` vs `diff.patch` | **inconsistent** | `files-changed.md` lists `docs/proposals/pi-tier1-docs-draft-proposal.md` as created; `diff.patch` is empty (0 bytes). The created file does exist in the repo, but no diff was captured in evidence. |
| `validation.md` contains explicit verdict | pass | "Outcome: pass" present |
| `validation.md` secret-check fields | pass | All secret-adjacent checks in validation table show negative (no, false, confirmed) |
| `risks.md` — only real gaps | pass | Three concrete findings, no vague placeholders |
| `next-gate.md` — concrete | pass | Owner decision points named, promotion gate named |
| Pi output file exists in repo | pass | `docs/proposals/pi-tier1-docs-draft-proposal.md` confirmed present |

## Boundary Checks

| Boundary | Status | Detail |
|----------|--------|--------|
| Pi execution | within contract | Real Pi session executed; approved Tier-1 run with minimax/MiniMax-M3 |
| Provider | within contract | minimax/MiniMax-M3 — matches `allowed_models` in skill contract |
| `--no-tools` flag | not enforced | Pi generated text-only output without tool invocation, but `--no-tools` was not passed. Noted in risks.md. Within this audit: behavioral boundary held; flag contract not held. |
| Vault | pass | No evidence of Vault access |
| Secrets | pass | No `.env` read, no API keys in command or output |
| Network | pass | No network request evidence |
| CI / Hook | pass | No CI or hook files touched |
| Runtime | pass | No runtime files changed |
| `providers/pi/` | pass | Absent — confirmed by pre-check |
| Canonical docs | pass | No canonical source files mutated |

## Findings

**F1 — INCONSISTENCY (evidence gap): `diff.patch` is empty despite file creation**
`files-changed.md` states that `docs/proposals/pi-tier1-docs-draft-proposal.md` was created. The file exists in the repo. `diff.patch` is 0 bytes — no diff was captured for the created file. Per the Evidence Path Contract consistency rule: "if files are listed, diff.patch must reference them." This gap means the run's filesystem change is not independently verifiable from evidence alone.

**F2 — WEAK (behavioral): `--no-tools` not passed to Pi**
`commands-run.md` shows the Pi invocation without `--no-tools`. Pi did not invoke tools (output is text-only), so the behavioral boundary held. However, the `pi.tier1.docs_draft` skill contract specifies `allowed_tools: []` and the Tier-1 workflow references `--no-tools`. The flag was absent, making enforcement implicit rather than explicit. Noted in `risks.md` — not reconstructed here.

**F3 — INFO: Secret-check block not in standalone field**
The Evidence Path Contract template (`sandbox/runs/run-evidence-template.md`) defines a separate `## Secret Check` section. In this run the secret-check fields are embedded in the `validation.md` table. The information is present and complete; the structural deviation is minor. No security concern.

## Verdict Reason

All eight required artifact files are present and the run's intent, commands, and outcome are clearly documented. The explicit "pass" verdict in `validation.md` is present, the secret boundary was maintained, and the created draft file exists. One inconsistency (F1) means the evidence is not self-contained: `diff.patch` is empty despite a file being listed in `files-changed.md`. Per contract, this makes the evidence incomplete for audit purposes. A follow-up diff capture or explicit explanation for the empty patch is needed before this run evidence can be considered fully closed.

Verdict: **rework** — evidence is strong on 7/8 dimensions; F1 inconsistency prevents a clean pass.

## Recommended Next Gate

**Evidence Patch Supplement Slice** (docs-only, no Pi, no runtime):

Add or annotate the empty `diff.patch` in `sandbox/runs/20260623T225209Z/` — either:
- capture the actual git diff of `docs/proposals/pi-tier1-docs-draft-proposal.md` and write it into `diff.patch`, or
- add an explicit note in `files-changed.md` or a supplement file explaining why the patch is empty (e.g., file was committed separately before diff was captured).

This is a read-only evidence documentation fix, not a re-run. After patch: re-audit for pass.
