# Portable-Skill Migration — Frontdoor Admission Run (2026-09-28)

- **Scope:** all 45 migrated skill directories under `core/skills/` (uncommitted portable-skill migration, working tree @ MAWS main `0301a98`).
- **Gate:** `scripts/tools/skill-frontdoor-check.mjs` (`npm run skill:frontdoor`) per skill, `--action implement`; receipts in `sandbox/runs/<timestamp>/` (runtime-only; admission IDs recorded in `categorized.json`).
- **Analyzer provisioning (this run):** SkillSpector **2.12.0** (`uv tool install git+https://github.com/NVIDIA/SkillSpector.git` — 2.3.9 was rejected by the evaluator's ≥2.10 report schema), SkillEvaluator **0.3.0** (`uv tool install "skillevaluator[all] @ git+https://github.com/NVIDIA/SkillEvaluator.git"`), gitleaks **8.30.1** (`~/.local/bin`). MAWS gates unaffected: `test:vnext` 254/254 post-upgrade.
- **Raw evidence:** `results.jsonl` (per-skill frontdoor outcomes), `categorized.json` (latest receipt per skill with analyzer detail).

## Result: 0/45 admitted — migration held at its admission threshold

| Disposition | Count | Cause |
|---|---|---|
| INCOMPLETE (non-overridable) | 33 | SkillSpector reports `analysis_completeness: partial` — `reference_missing`: SKILL.md text references local paths that are not bundled artifacts (e.g., files the skill writes at runtime). The evaluator treats partial analysis as INCOMPLETE; per contract, INCOMPLETE cannot be owner-exceptioned. |
| BLOCKED (known risk) | 12 | Complete scans; SkillEvaluator Tier 1 `overall: failed` — dominant error-class finding: `author_missing` (high) in SKILL.md frontmatter; plus non-gating warnings (line_count > 500, missing recommended sections). |
| — of which security-flagged | 4 | SkillSpector BLOCKED with HIGH findings: `impeccable` (10 high / 40 medium), `imagegen-frontend-web` (3 high / 3 medium), `design-taste-frontend` (2 high / 4 medium), `diagnosing-bugs` (1 high / 2 medium). Finding details in the per-skill receipts (paths in `categorized.json`). |

`authority_granted: false` on every record; PASS != authority per contract.

## What worked

- Provisioned stack is functionally correct: MAWS skillspector lane PASSes (no SKILLSPECTOR evidence blockers on 41/45), evaluator Tier 1 runs complete on 12/45, receipts/decisions written and schema-valid (`schema_issues: []`).
- The gate behaves exactly per `docs/skill-frontdoor-contract.md`: `UNKNOWN != SAFE`, `INCOMPLETE != OVERRIDABLE`, `PASS != AUTHORITY`.

## Decision required before the migration can cross the gate (owner)

1. **Author metadata policy:** add `author` (and related frontmatter) to SKILL.md files — value/attribution policy is an owner decision (third-party upstream vs. baum777 import). This alone unblocks the 12 known-risk cases toward Tier-1 pass, subject to warnings (warnings do not gate).
2. **Partial-analysis handling (33 skills):** either (a) remediate SKILL.md references that don't resolve to bundled artifacts, or (b) owner decides the strictness posture for `reference_missing` ledger exceptions (scanner-config/content change — both are owner-repository concerns).
3. **4 security-flagged skills:** review SkillSpector HIGH findings per receipt; disposition: exclude from migration, remediate, or structured owner-exception (`owner_exception` requires BLOCKED analysis disposition with accepted risks + expiry; these 4 qualify as BLOCKED, the 33 INCOMPLETE do not by design).

The migration working tree remains uncommitted; nothing was mutated inside `core/skills/` during this run.
