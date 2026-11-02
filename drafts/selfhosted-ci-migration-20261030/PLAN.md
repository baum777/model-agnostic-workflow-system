# MAWS complete self-hosted CI migration — gated cutover

Status: DRAFT / NOT IMPLEMENTED / NOT QUALIFIED / NO CUTOVER AUTHORITY.

## Objective

End state: all MAWS mandatory CI gates execute on the dedicated t-wim self-hosted runner inside disposable isolated VMs. The source repository's GitHub-hosted test workflow is removed only after complete verified parity, independent evidence, source-SHA-bound status reporting and enforced merge protection. GitHub can remain the PR/dispatch/status control plane; it must not provide hosted test compute after cutover.

MAWS baseline: db2368e8d3f4dad88552dab5f00fae5f01515964. Legacy workflow blob: 18f8256b787a5e46c3c49e4004877793ef69ff91. Source workflow: .github/workflows/loop-repo-ci.yml. The exact **23 legacy steps** (2 GitHub infrastructure actions, 21 shell-command groups) and full multiline command bodies are inventoried in required-gates.json. There are **20 supplementary MAWS policy gates**, some change-dependent; not every package.json utility command is automatically a mandatory gate.

## Non-negotiable execution constraints

1. Fetch and verify the exact immutable MAWS source HEAD, tree and complete Git ancestry. Checkout currently uses fetch-depth=0; a commit archive without history cannot prove merge:audit parity.
2. Use a distinct MAWS-specific VM profile, pinned Node 24/npm, frozen npm dependencies and Python 3/Git/shell utilities. Do not assume the Unitera_Systems pnpm 10.5.2 VM or baum-os pnpm 11.9 VM qualifies MAWS.
3. Never execute repository-supplied code, npm lifecycle scripts or shell commands on the self-hosted runner host. Only inside the isolated VM with credentials, host mounts, sockets, profiles and outbound access denied by default.
4. Preserve the actual tested run bodies, options, exit codes, timeouts, per-gate logs/digests and source/plan/toolchain lock identities. No gate may pass solely because its name appears in output. No skipped or unknown gate can count as PASS.
5. New/modified skills require actual exact-target G0 source identity, G1 NVIDIA SkillSpector --no-llm, G2 NVIDIA SkillEvaluator --external --tiers 1, G3 MAWS-derived disposition BEFORE implementation or import. These are distinct from the existing test:skill-frontdoor regression suite. Missing evidence is BLOCKED and cannot be overridden as an incomplete scan.
6. Run the remaining repo security, contract, model neutrality, provider parity, runtime, routing, overlap, instruction, regression, Registry and merge checks (see the 23+20 manifest). Apply conditional gates only based on explicit observed change classification, not guesses or automatically fabricated NOT_APPLICABLE records.
7. A separate independent verifier must re-derive the required gate set and execution evidence, detect duplicates/omissions, mismatched SHA, tampering, replay, timeout, cancellation and incomplete cleanup.
8. GitHub status writeback is a separate least-privileged action outside the VM, after independent verification. Bind source HEAD SHA, executor revision, gate-set version, evidence digest and immutable status context. No guest credentials or status tokens.
9. The existing MAWS main ruleset 25655868 has no required_status_checks. Configure and prove an enforced relay-required status before turning off hosted CI. PR #127 merged while its hosted workflow conclusion was failure; this is a demonstrated gap.
10. The relay's workflow_dispatch does not automatically cover MAWS PR/push events. Define a reviewed GitHub App webhook/dispatcher (preferred) with event signature verification, no replay, exact SHA routing and source-repo permissions; or gain explicit owner acceptance for a minimal no-compute source dispatcher.
11. The relay repository belongs to t-wim and enforces its own publication and quarantine policy. A MAWS owner decision cannot alone grant t-wim runner/host execution or modify runner admission.

## Legacy 23-step gate families

| IDs | Source workflow requirements |
| --- | --- |
| 01–02 | Exact source checkout WITH history; Node 24 setup and toolchain |
| 03–05 | Node syntax, npm ci --ignore-scripts, runtime/source syntax sweep |
| 06–09 | Secrets, source security, assurance evidence, persisted evidence checks |
| 10–11 | Merge executor/attestation tests and merge:audit with full history |
| 12–15 | Runtime vNext, provider neutrality, adapter, MAWS and security evals, contracts |
| 16–17 | S9 regression/rollback and S10 cross-model |
| 18 | Skill frontdoor regression tests (NOT admission of individual candidate skills) |
| 19–22 | Four existing historical Registry disposition validations |
| 23 | Loop repository CI evidence/quality gate |

The required-gates.json file is the exact machine-readable inventory, including 20 additional MAWS gates (repo validation, skill/workflow routing and evidence, skill overlap/lint/tree coverage, instruction integrity, real candidate frontdoor, change-specific registry and provider checks, activation/effectiveness when applicable).

## Qualification and rollout phases

- **W0 Inventory (draft applied)**: 23 legacy steps, supplementary gates, exact Git blob binding, read-only drift validator and negative tests. Not an execution or admission receipt.
- **W1 VM qualification (BLOCKED)**: pinned source/toolchain, trusted image, Git ancestry custody, isolation, memory/CPU/time limits, cancellation/timeout and clean successor checks. Prove with five-run adversarial battery and no source execution on host.
- **W2 Full gate parity (BLOCKED)**: run every required gate with real exits and complete logs. Independent verifier must reject missing/duplicated steps, conditional gate omission, wrong source SHA, truncated evidence and fake PASS. Two reconciled complete green reference runs are a proposed additional cutover criterion, not an existing canonical rule.
- **W3 Dispatch/writeback (BLOCKED)**: event delivery, exact-head routing, replay tests, least-privileged status publisher and denial cases verified. Any missing status fails closed.
- **W4 Enforced ruleset (BLOCKED)**: require one stable relay status context for merges, test red PR cannot merge and green PR can merge only after verified gate completion.
- **W5 Removal (BLOCKED)**: only after W1–W4 and separately reviewed t-wim/MAWS owner decisions delete .github/workflows/loop-repo-ci.yml in a distinct PR. Avoid a gap with no protected CI.
- **W6 Post-cutover (BLOCKED)**: prove no hosted MAWS jobs remain, dispatch covers PR and main/push, status is SHA-bound, negative cases block, cleanup and rollback function.

## Exit / stop / rollback

Do not remove GitHub CI, activate relay workflows, use unscreened packages, grant ambient runner credentials or merge a relay PASS based on a draft inventory. The current MAWS candidate cannot claim any VM, NVIDIA analyzer, operator approval, GitHub writeback or real CI execution. If the relay or required status fails, **freeze merges** and restore the prior workflow via an owner-approved recovery PR; never revert to unprotected merging.

Evidence needs source commit+tree, runner/controller/VM digest, toolchain+lock digest, immutable gate set, exit/timeout/cleanup and independent verification receipts. Keep raw private data outside public repositories.

Sources: AGENTS.md; docs/skill-frontdoor-contract.md; docs/security/extension-install-safety-policy.md; source workflow and package.json; t-wim/unitera-ci-relay docs/SOURCE_CI.md; MAWS ruleset 25655868.

**Decision:** Migration remains BLOCKED until qualified executor and verified enforced check replace the hosted CI. This document and inventory are pre-qualification work only.
