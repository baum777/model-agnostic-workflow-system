---
name: supabase-deployment
description: Plan and execute fail-closed Supabase deployments with explicit project, environment, migration, and verification gates.
version: 1.0.0
classification: shared-with-local-inputs
requires_repo_inputs: true
produces_structured_output: true
safe_to_auto_run: false
owner: codex-workflow-core
status: extracted
output_contract_path: core/contracts/output-contracts.json
tool_contract_catalog_path: core/contracts/tool-contracts/catalog.json
provider_projection_path: core/contracts/portable-skill-manifest.json
eval_profile_path: evals/catalog.json
---

# Supabase Deployment

## Trigger

Use this skill when a repository uses Supabase and a deployment, sync, migration, or release gate needs to be executed or assessed with explicit evidence.

## When Not To Use

- Do not use for non-Supabase hosting or generic app deployment.
- Do not use when the repo has no Supabase project, migrations, functions, or configuration surfaces.
- Do not use to claim success without linked-project evidence and remote verification.
- Do not use when the target environment cannot be proven from repo evidence.
- Do not use when a write or deploy action would be made implicitly from incomplete state.

## Non-Goals

- This skill does not design application schema or product behavior.
- This skill does not invent missing Supabase resources or credentials.
- This skill does not treat a local CLI success as a completed remote deploy.
- This skill does not mix preview, staging, and production evidence.
- This skill does not replace the repo's own runtime or release policy.

## Workflow

1. Inspect repo truth: `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`, package scripts, env samples, and deployment notes.
2. Classify the requested Supabase surface: database, edge functions, auth, storage, generated types, seeds, or secrets.
3. Verify the target project binding, environment inventory, and migration order before any remote change.
4. Fail closed if the project ref, environment values, or release target cannot be proven from evidence.
5. Apply the smallest safe Supabase command set for the confirmed scope, such as link, migration push, function deploy, type generation, or secret updates.
6. Re-check the remote state after each mutating step and stop on the first mismatch.
7. Return a bounded deployment summary with explicit blockers, verification evidence, and the next gate.

## Local Inputs

- repository root
- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/functions/`
- env examples or deployment notes that identify required secrets and project refs
- CI or release workflow files that affect Supabase release behavior

## Tool Requirements

- `supabase`
- `repo-audit`
- `readiness-check`
- `test-matrix-builder`

## Approval Mode

- approval-required
- require explicit approval for any remote-state change, including link, migration push, secrets mutation, or production deploy.
- treat ambiguous preview-to-production promotion as blocked until proven otherwise.

## Provider Projections

- OpenAI/Codex: native
- Claude: adapter
- Qwen Code: adapter
- Kimi K2.5: adapter

## Eval Scaffolding

- routing
- schema conformance
- tool selection
- approval boundary
- provider parity
- failure modes

## Output

- `SUMMARY`
- `OBSERVED TRUTH`
- `ENV INVENTORY`
- `GATES`
- `EXECUTION SEQUENCE`
- `VERIFICATION`
- `ROLLBACK`
- `OPEN GAPS`

## Quality Checks

- Do not label a remote Supabase deploy as successful without a concrete remote verification path.
- Separate preview, staging, and production evidence explicitly.
- Fail closed on missing project binding, secret inventory, or migration ordering.
- Cite exact file paths and command outputs that support the decision.
