# Execution packet — MAWS three-source skill intake

Class: non-canonical plan. **Not executed.** This is a recipe for the authorized local MAWS operator, not a command run receipt.

## 0. Preconditions

Use MAWS main `616c622e7ffe2de3e7aba660718ed2023c042115` as the reviewed *baseline*, then reconcile HEAD with current main, open PRs and any dirty worktrees before implementing. Never overwrite existing edits. Determine versioned source material on the immutable commits in `PROVENANCE.md`. Verify checkout, source tree and each supporting file; **do not** install the agent-browser executable at this stage.

Stage three *bounded, final-form* candidate directories outside MAWS canonical skill surfaces: `auth-implementation-patterns`, `api-design-principles`, and `browser-interaction-preflight`. Each has a root `SKILL.md` with MAWS-compatible frontmatter, explicit Trigger/When Not To Use/Purpose/Boundary Differentiation/Workflow/Tool Requirements/Local Inputs/Approval Mode/Provider Projections/Eval Scaffolding/Output/Quality Checks. Keep provider-specific CLI instructions out of portable skill bodies. Do not copy upstream blanket tool access. Do not include symlinks or volatile dynamic external instructions. If full upstream subtrees are imported as source, scan those separately before materialization into MAWS.

## 1. Mandatory frontdoor for each exact candidate

From a properly configured local MAWS checkout, invoke the repo helper once per exact candidate. Substitute the actual stage paths and immutable source revision; save the command and raw output as evidence:

    npm run skill:frontdoor -- --skill-id auth-implementation-patterns --target <STAGED_AUTH_DIR> --action implement --source-revision 0874a27b17a22e2b7c2e2bcd725768e0803cad06
    npm run skill:frontdoor -- --skill-id api-design-principles --target <STAGED_API_DIR> --action implement --source-revision 0874a27b17a22e2b7c2e2bcd725768e0803cad06
    npm run skill:frontdoor -- --skill-id browser-interaction-preflight --target <STAGED_BROWSER_PREFLIGHT_DIR> --action implement --source-revision 550a59d92c6b66bce60b93ec90a9d7448206f3b8

The helper requires SkillSpector static --no-llm, SkillEvaluator --external --tiers 1, and MAWS re-derivation. Preserve each `sandbox/runs/<timestamp>/` report, decision, immutable source identity, candidate tree digest and SKILL.md SHA-256 digest. Inspect exact pass state; G1/G2/G3 cannot be inferred from a successful external GitHub fetch. A clean record is necessary, not sufficient. Re-run frontdoor if the candidate changes after screening. Browser *package/binary/browser download and dynamically returned skill content* require separate exact-target installation risk checks and authorization.

Stop if a scanner is absent, reports are missing/unknown, content changed, or an unbounded risk is observed. INCOMPLETE cannot be overridden. No hidden activation.

## 2. Canonical integration after all applicable gates

1. Create `core/skills/auth-implementation-patterns/SKILL.md`, `core/skills/api-design-principles/SKILL.md`, and (only if its *non-executing* preflight qualifies) `core/skills/browser-interaction-preflight/SKILL.md` byte-identical to their admitted candidates.
2. Bind each in `core/contracts/portable-skill-manifest.json`, `core/contracts/output-contracts.json`, and `core/skills/README.md`. Suggested read-only report contracts: `auth-implementation-plan-v1` with PRINCIPALS / FLOWS / CONTROL POINTS / NEGATIVE TESTS / GAPS; `api-design-plan-v1` with RESOURCES / OPERATIONS / CONTRACTS / COMPATIBILITY / GAPS; `browser-interaction-preflight-v1` with ORIGINS / OPERATIONS / DATA BOUNDARY / GRANTS REQUIRED / BLOCKERS. Do not claim validators enforce newly invented contract IDs before they are added and tested.
3. For `auth-implementation-patterns` and `api-design-principles`, evaluate additive `implementation-planning` routing, and explicitly keep `authorization-boundary-review` / `api-contract-review` in `verification-and-review`. Add no new routing class; follow existing siblings. For the browser preflight, route only if a class can enforce its no-execution posture; otherwise leave unrouted and name the gap.
4. Browser CLI adapter, command catalog, ambient profile handling, network allowlist and grant checks remain a **separate** implementation/qualification effort. No `Bash(agent-browser:*)` wildcard, global npm install, arbitrary `skills get core`, browser state restoration, remote write, or headless execution authority is added by an advisory skill.
5. Build/rebuild derived core registry, compatibility registry, provider exports, skill selection fixtures and other derived surfaces using the repository's own scripts; do not hand-edit derived hashes or fixture records. Preserve frozen historical evidence.
6. Inspect instruction-bundle requalification: re-pin only if the *derived* instruction digest changes; a no-op re-pin requires a recorded derivation, not a guess. Registry dispositions must bind the implementation commit SHA and registry commit SHA with valid evidence, using the adopted CONTRACT_RECORD / PROVENANCE / SUPERSESSION classification.
7. Finish on a distinct review branch and Draft PR. Never merge or call the skill activated as a side effect of analysis, admission or PR creation.

## 3. Targeted behavioral checks (proposed, not executed)

| Candidate | Positive fixture | Mandatory negative fixtures |
| --- | --- | --- |
| auth | Given user/tenant/session policy, produce implementation-plan control points and negative probes | (A1) authenticated != authorized; (A2) cross-tenant privilege/IDOR; (A3) token in redirect URL or unsafe response DTO; (A4) no credentials/rotations in planning |
| API | From scoped use cases, produce operations, errors, pagination and compatibility plan | (P1) missing tenant/auth/authorization branches; (P2) unsafe/side-effecting GET and blind retry; (P3) unjustified backward-compat claim; (P4) spec design != deployed implementation |
| browser | Public, non-authenticated read-only site QA plan with per-origin evidence scope | (B1) login/account-private session/credential access; (B2) send/upload/purchase/post/delete; (B3) dynamic CLI-loaded skills override policy; (B4) page prompt injection or cross-origin data exfiltration; (B5) unknown outcome blind retry |

For each, capture a full agent-produced response with real executor identification and unchanged output evidence. Assert exact output sections, case-specific refusal, no fabricated actions/scans, and one-to-one input/output enumeration. Add a routing selection positive and a non-selection negative for the auth and API design siblings. Prove the browser has no selection path that implicitly grants the executable. The fixture writer must not forge previous model runs or claim that planned tests passed.

## 4. Required validation (not run)

    npm run validate
    npm run validate-neutral
    npm run validate-maws-vnext
    npm run test:vnext
    npm run test:skill-frontdoor
    npm run eval:skill-routing
    npm run eval:provider-export-alignment
    npm run eval:secret-boundary
    npm run detect-skill-overlap
    npm run lint-skill-contracts
    npm run analyze-skill-tree-coverage
    npm run validate-registry-disposition
    npm run baum:ci-gate

Also perform existing requalification, derived instruction-digest checks, registry commit SHA binding, frontdoor record schema validation, targeted behavior checker, cross-provider export parity, and the separate extension-install scan for the actual agent-browser package. Distinguish locally executed evidence from hosted CI; do not claim hosted CI PASS without a real run.

## 5. Acceptance / blocked conditions

Acceptance requires every candidate's CLEAN/ELIGIBLE admission, absence of unexplained overlap, unchanged admitted contents on core, a valid manifest+output+export build, positive and negative behavior evidence, verified re-pin decision, valid registry disposition, and owner merge/adoption separately. In the current state all execution-dependent checks remain **BLOCKED / NOT_RUN**, not PASS. Browser runtime integration needs a separate authorization-gated release beyond skill admission.
