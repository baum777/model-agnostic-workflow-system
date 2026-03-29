# Repo Skill Libraries

This package contains repo-specific Codex skill libraries derived from the actual local repositories in `C:\workspace\main_projects\solana_tools\`.

It is not a generic prompt pack. Each skill folder is grounded in concrete surfaces from the inspected repository: README files, package scripts, deploy manifests, CI workflows, runtime entrypoints, state stores, contract files, and operational docs.

## How To Use

1. Open the repo-specific `README.md` first.
2. Use the `skill-tree.md` to pick the smallest skill that matches the task.
3. Read the matching `SKILL.md` before planning or editing.
4. Prefer the narrowest skill that covers the current boundary instead of reaching for a broad repo summary.

## Grounding Method

The skill systems were derived from:

- root `README.md` and operator docs
- `package.json` and nested package scripts
- deployment manifests such as `render.yaml`, `railway.toml`, and `vercel.json`
- CI and PR workflows in `.github/workflows/`
- runtime entrypoints, HTTP handlers, state stores, prompt assets, and shared contracts
- docs that describe actual runtime posture, not future roadmap intent

## Inference Policy

- Directly supported surfaces are listed by filename in each skill's `Repo grounding notes`.
- If a skill covers a behavior that is only implied by the repo structure, the manifest scopes it conservatively and flags the boundary as inferred in the repo README.
- No skill assumes hidden services, undocumented deploy targets, or architecture that is not visible in the local copy.

## Libraries

- `organoid-symbionts/` - fail-closed worker runtime with Render deployment topology, prompt/lore surfaces, and a separate landing app
- `sparkfined-tradeapp/` - canonical backend, frontend shell, shared contracts, governance layer, and multi-target deploy model

