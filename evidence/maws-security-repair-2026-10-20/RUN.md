# MAWS F-01–F-07 Repair Run (2026-10-20)

**Execution:** applied on branch `repair/maws-full-codebase-f01-f07-20261020`  
**PR:** https://github.com/baum777/model-agnostic-workflow-system/pull/18 (Draft; DO NOT MERGE until independent review)  
**Audit source:** `d7c84914ea3ba339a0a96454dd06fa18904527d0`  
**Repair branch base:** `29fafcbea79ce220d252e54e5d33f8e5b0a2361b`

## Scope / final DoD

- [x] F-01 Strict parser for NVIDIA SkillSpector 2.12.0: incomplete, schema-unknown, unqualified version and caution report never become PASS.
- [x] F-02 Verify evidence path, symlink ancestors and report path before any write. Invalid paths are blocked without side effects.
- [x] F-03 Credential-bearing OpenRouter requests require HTTPS, no custom port/URL userinfo; redirects disabled.
- [x] F-04 Shared `run_id` and symlink-aware artifacts boundary for run, replay, validation and latest.
- [x] F-05 MiniMax adapter base import points to canonical runtime adapter.
- [x] F-06 CI runner uses literal argv and `shell:false`; adversarial shell syntax cannot be evaluated by a shell.
- [x] F-07 GitHub CI includes full Runtime VNext, per-install security tests, secrets, import, and narrowed contract/security evals.

## Evidence and limits

- Isolated local Node22: 280/280 VNext tests PASS; 14/14 focused security/provider tests PASS; `validate`, `validate-neutral`, `validate-maws-vnext`, `validate-secrets`, `scan-secrets` and syntax PASS.
- GitHub Actions Node24: `loop-repo-ci` success on `45f013f793895fd1f8363aad32bf56f9f2e9727f` — run https://github.com/baum777/model-agnostic-workflow-system/actions/runs/39351998469 — security 13/13, VNext 287/287, Frontdoor 6/6, all configured checks PASS.
- New HEADs after that verification must re-run the full workflow. The above green run is **not** automatically evidence for later HEADs or a moving `main`.
- No actual provider auth/live execution or remote E2E. F-01 parser schema pinned to SkillSpector 2.12.0; later versions block until separately qualified.
- Real original SkillSpector JSON samples were reproduced in the local audit test suite. The committed regression cases use representative 2.12.0 schema shapes. The full raw scan remains in the original 2026-10-20 SkillSpector Actions artifact.
- Path handling remains subject to ordinary local filesystem race residuals; no adversarial parallel symlink swap penetration test is claimed.
- F-07 is **CI coverage**, not security certification for every live transport.

## Merge/Release gate

- [ ] Resolve drift against current protected main; recheck merge-base and overlaps in `runtime/cli/runtime-run.mjs`.
- [ ] PASS on final PR head with full Node24 CI and independent exact-head review.
- [ ] Approve merge through repo rules; no production activation or platform promotion implied.

## Registry relevance

The change modifies implementation, tests and CI wiring only. It adds no registry-relevant `SOURCE_RECORD`, `CONTRACT_RECORD`, `AUTHORITY_MAPPING`, `DEPENDENCY_BINDING`, `LIFECYCLE_BINDING`, `SUPERSESSION`, `PROVENANCE` or `REGISTERED_IMPLEMENTATION_BINDING` definition. Based on the closed taxonomy in `docs/governance/registry-disposition.md`, proposed disposition is `NO_CHANGE` (no external Registry write).
