# Three MAWS skill candidates — staged, NOT ADMITTED

Class: non-canonical G0 staging / review-only. Revision baseline: MAWS main commit 3e2577aaf351a42d64f07e1905e30c47621a1891.

## Scope

The three final-form MAWS-authored candidate directories contain a regular SKILL.md each, with no symlinks, tools or binaries. The files are designed for review and local G0 identification, not canonical activation. The existing core/skills, manifests, routing, output contracts, compatibility mirrors and provider exports are deliberately unchanged.

- auth-implementation-patterns: prospective AuthN/AuthZ planning, distinct from authorization-boundary-review.
- api-design-principles: prospective REST/GraphQL design, distinct from api-contract-review.
- browser-interaction-preflight: no-execution origin/operation/data/grant classification; deliberately does NOT install, invoke or authorize agent-browser.

Upstream origin and immutable revisions:
- wshobson/agents commit 0874a27b17a22e2b7c2e2bcd725768e0803cad06 (MIT; Copyright (c) 2024 Seth Hobson), source subtrees plugins/developer-essentials/skills/auth-implementation-patterns and plugins/backend-development/skills/api-design-principles.
- vercel-labs/agent-browser commit 550a59d92c6b66bce60b93ec90a9d7448206f3b8 (Apache-2.0; Copyright 2025 Vercel Inc.), source subtree skills/agent-browser.

All three candidate SKILL.md files are MAWS-authored adaptations: upstream reference examples and CLI workflows have **not** been copied into the staged trees. The immutable upstream commit identifies provenance, but G0 requires SHA-256 of the **actual adapted candidate tree**, calculated locally by the MAWS frontdoor. GitHub blob SHAs are not analyzer reports or MAWS admission records.

## Mandatory exact-target local gate

From a clean and appropriately configured MAWS checkout on this candidate branch, with no user changes overwritten:

    npm run skill:frontdoor -- --skill-id auth-implementation-patterns --target drafts/external-skills-candidates-20261030/auth-implementation-patterns --action implement --source-revision 0874a27b17a22e2b7c2e2bcd725768e0803cad06

    npm run skill:frontdoor -- --skill-id api-design-principles --target drafts/external-skills-candidates-20261030/api-design-principles --action implement --source-revision 0874a27b17a22e2b7c2e2bcd725768e0803cad06

    npm run skill:frontdoor -- --skill-id browser-interaction-preflight --target drafts/external-skills-candidates-20261030/browser-interaction-preflight --action implement --source-revision 550a59d92c6b66bce60b93ec90a9d7448206f3b8

Each invocation must produce real SkillSpector static --no-llm, SkillEvaluator --external --tiers 1, and G3 MAWS deterministic evidence under sandbox/runs. Preserve complete raw reports, analyzer versions, candidate tree digest, SKILL.md SHA-256, final record and decision. The gate passes ONLY on CLEAN / ELIGIBLE. If an analyzer is absent, evidence is unknown or result is INCOMPLETE, stop (not overrideable). Do not mutate a candidate between admission and canonical copy; any byte change requires re-admission.

## Subsequent conditional implementation

Only after each exact candidate is separately CLEAN/ELIGIBLE, implement an independent review branch: copy admitted bytes into core/skills; update portable-skill-manifest, output-contracts and workflow-routing-map if supported by existing routing classes; rebuild generated registry/provider exports with owning scripts; add positive/negative routing tests, behavior evidence, derived instruction digest/re-pin decision, validated registry disposition and full suite. Leave browser preflight unrouted if no safe routing. Browser runtime/package installation remains a different scan and grant.

Related canonical rules: AGENTS.md, docs/skill-frontdoor-contract.md, docs/security/extension-install-safety-policy.md, core/skills/README.md. Original review packet: drafts/external-skills-intake-20261030/.

## Verification and blockers

- Applied: G0 candidate source files staged in a dedicated review branch.
- NOT RUN: SkillSpector, SkillEvaluator Tier 1, G3 disposition, CI, targeted agent behavior tests and provider parity.
- NOT GRANTED: import, implementation into core, publication, activation, browser access or package installation.
- If the frontdoor tools cannot run in this environment, validation outcome is BLOCKED rather than assumed safe.
