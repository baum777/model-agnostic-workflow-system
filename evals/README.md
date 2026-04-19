# Evals

Executable certification checks live here.

## Current Scope

- routing parity across exported provider bundles
- output schema stability for shared skills
- tool-selection checks for portable core skills
- approval boundary checks for mutating tools
- provider parity checks for shared skill output contracts
- failure-mode checks for contract-bound skills
- surface-decision checks for the repo-local `skill-tool-mcp-builder`, using normalized observed decision packets
- core portable skill eval scaffolding under `evals/fixtures/core-*.json`

## Gate Rule

- `npm run eval` is the executable certification entrypoint.
- Any blocking eval failure should stop release or publication.
- Advisory-only checks should be recorded but not treated as release blockers.
