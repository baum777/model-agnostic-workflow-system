# Source Cleanup Decision — Repo Loop

Date: 2026-06-25

The Repo Loop implementation was migrated into the actual core:

`/home/baum/workspace/baum-os/agentic_workflow/model-agnostic-workflow-system`

The previous implementation in the parent/source repo remains untouched at:

`/home/baum/workspace/baum-os`

Affected source files (do not delete without explicit decision):
- `commands/loop-repo.md`
- `loops/repo-loop/`
- `scripts/baum-loop-repo.mjs`
- `scripts/validate-loop-run.mjs`
- `scripts/ci-gate.mjs`
- `evidence/loop-runs/2026-06-25-baum-os-pass*`

## Parent Submodule Pointer

The parent repo tracks this core as a submodule.
Current registered pointer: `8e44db9`
Migration commit: `cc01b0d`

The parent shows `M agentic_workflow/model-agnostic-workflow-system` (dirty submodule pointer).

Parent decision needed (separate step, not part of this slice):

**A** — Commit submodule pointer `8e44db9` → `cc01b0d` in parent, signalling migration is accepted.
**B** — Leave parent pointer pending review; keep old pointer until target core is reviewed.

## Source File Decision

**A** — Keep old source implementation temporarily as migration backup.
**B** — Remove old source implementation in a separate cleanup slice after confirming the target core is canonical.
**C** — Convert old source implementation into a pointer-only note to the target core.

## Recommendation

Parent: **A** (commit pointer), after confirming this target state is correct.
Source: **B** (cleanup slice), after parent pointer is committed and target evidence is stable.
