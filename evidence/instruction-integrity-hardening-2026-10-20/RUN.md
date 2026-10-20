# SII Instruction Integrity Hardening (2026-10-20)

Triages the ten `STALE_REFERENCE` findings observed by the S3 auditor at the
S3 repair revision, repairs the one real defect they contained, and makes
the audit surfaces that produced them precise. Follow-up to
`evidence/instruction-auditor-2026-10-20/RUN.md`.

## Triage of the ten observed findings

The S3 auditor reported ten `STALE_REFERENCE` findings at revision
`866ab49`. Nine of them were not defects; one was a real error in a
canonical source. The distinction was made by reading each finding in its
source context, not by pattern-matching the target path.

| Source | Target | Triage |
|---|---|---|
| `docs/governance/source-hierarchy.md:29` | `core/skills/*/SKILL.md` | glob pattern — a selection rule, not a file |
| `docs/governance/source-hierarchy.md:29` | `skills/*/SKILL.md` | glob pattern — a selection rule, not a file |
| `core/skills/supabase-deployment/SKILL.md:41` | `supabase/config.toml` | workspace path — the skill operates on a consumer workspace |
| `core/skills/supabase-deployment/SKILL.md:52` | `supabase/config.toml` | workspace path — same |
| `docs/model-agnostic-core-prompt-system.md:40` | `.codex/shared-core-map.json` | documented absence — the source states it "was not present in the inspected repo" |
| `docs/authority-matrix.md:195` | `.codex/repo-intake-inputs.json` | consumer-local contract — lives in the consumer repository |
| `docs/authority-matrix.md:196` | `.codex/runtime-policy-inputs.json` | consumer-local contract — same |
| `docs/authority-matrix.md:212` | `.codex/repo-intake-inputs.json` | consumer-local contract — same |
| `docs/authority-matrix.md:213` | `.codex/runtime-policy-inputs.json` | consumer-local contract — same |
| `docs/authority-matrix.md:161` | `core/skills/neon-db-setup/SKILL.md` | **real defect** — the skill and any manifest entry for it do not exist |

## What changed

**1. Reference classification (`runtime/instructions/instruction-resolver.mjs`).**
A reference that names no resolvable file now carries one of five recorded
statuses instead of one bucket:

- `resolved` — the target exists in this repository;
- `glob_pattern` — the target names a selection pattern, not a file;
- `git_range` — the target names a revision range (`origin/main..main`),
  whose apparent file extension belongs to the revision name;
- `documented_absence` — the source states that the target does not exist;
- `external_workspace` — the target belongs to a consumer repository
  (`.codex/`, `.qwen/`) or to the workspace a skill operates on (`supabase/`);
- `dangling` — the target should exist here and does not. **Only this class
  produces a finding.**

The other classes stay visible in the audit coverage with a stated reason
instead of being silently dropped or reported as defects.

**2. Resolution order.** A reference now resolves against the referencing
document's own directory first, and against the repository root second. A
skill pointing at `references/style-selection-map.md` means the file next
to it; a governance document pointing at `core/skills/repo-audit/SKILL.md`
means the repository path. Resolving only one base produced false dangling
references in both directions — including two findings inside
`skills/getdesign-style-router/SKILL.md` that pointed at a file which does
exist.

**3. Inventory coverage (`runtime/instructions/instruction-inventory.mjs`).**
The `skills/` tree joins the declared source set. It is not an optional
addition: the repo root contract lists `skills/` among the canonical
reusable surfaces, and `docs/governance/source-hierarchy.md` names
`skills/*/SKILL.md` as instruction sources at level 4 alongside
`core/skills/*/SKILL.md`. Its absence made the inventory — and every audit
built on it — blind to 22 instruction files. The source count goes from 29
to 51 (8 fixed sources, 18 `core/skills`, 22 `skills`, 3 `.agents/skills`).
The extended coverage is what surfaced the two `getdesign-style-router`
false positives at all.

**4. One real defect repaired (`docs/authority-matrix.md`).** The row
`| core/skills/neon-db-setup/SKILL.md | shared-exported-skill | n/a |
extracted | core/contracts/portable-skill-manifest.json | ... |` asserted
an extracted shared skill with a manifest reference. The skill does not
exist, and `core/contracts/portable-skill-manifest.json` carries no entry
for it either — `neon` appears nowhere in the repository outside this row.
The row is removed so the canonical authority map no longer asserts a source
that is not there.

Adding the skill instead of removing the row would be a separate owner
decision (skill authoring, manifest entry, export surface) and is not
taken here.

## Results at this worktree (main pin 9fc2ae80, implementation commit f5a0d716f23725e3b277f8984beb28e8405dc53b)

- Re-audit at the signed implementation commit:
  `ia_e01a2196431a30ba` — **0 findings** (0 blocker), 0 contract
  violations, 2 taxonomy classes analyzed, 8 declared not statically
  analyzable. Reference classes: 395 resolved, 2 glob_pattern, 1 git_range,
  1 documented_absence, 11 external_workspace, **0 dangling**. Report:
  `evidence/audit-report-f5a0d716.json`.
- `node --test tests/vnext/instruction-auditor.test.mjs` — 10/10;
  `tests/vnext/instruction-resolver.test.mjs` — 6/6;
  `tests/vnext/instruction-inventory.test.mjs` — 6/6.
- `npm run test:vnext` — 319/319 pass, 0 fail.
- `npm run validate` / `validate-neutral` / `validate-maws-vnext` /
  `validate-secrets` / `scan-secrets` — PASS (exit 0 each);
  `npm run eval:maws-vnext` — exit 0; `npm run validate-instruction-integrity`
  — 21 cases, 0 unexpected results.

## Signing disclosure correction

The S3 run record stated that every other commit of that change set was
signed. That was wrong for `bc4b9fb` (the S3 evidence commit) and for
`3ace733` (the disposition rebind). Both were produced after the local
gpg-agent lost its passphrase cache, together with the repair commit
`82a638a`. The record is corrected in place rather than left standing, and
the correction states the scope honestly: the disclosure does not make the
three commits policy-conform, and a later signed commit does not sign an
earlier one retroactively.

For this change set the signing path works again: the implementation commit
`f5a0d716` is validly signed (`git log --format='%G?'` reports `G`).

## Posture

Same posture as the S3 slice it follows: the auditor and the resolver are
analysis surfaces. They mutate nothing outside their own output, grant no
permission, activate nothing, and replace no authority or approval
decision. The one content change in this slice is the removal of a false
row from a canonical document, and the audit reports that follow are
observations, not repairs.
