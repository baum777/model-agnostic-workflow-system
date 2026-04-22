# Adoption Playbook

Class: operational.
Use rule: use this playbook for first-time consumer setup; canonical ownership stays in `core/contracts/*`, `core/skills/*`, and `policies/*`.

## Scope

- initialize a consumer overlay
- pin shared-core version and fingerprint
- adopt only required shared skills/contracts
- keep compatibility surfaces derived and non-authoritative

## Canonical Inputs

- [repo-overlay-contract.md](repo-overlay-contract.md)
- [compatibility.md](compatibility.md)
- [shared-with-local-inputs.md](shared-with-local-inputs.md)
- [repo-intake-skill-contract.md](repo-intake-skill-contract.md)
- [runtime-policy-skill-contract.md](runtime-policy-skill-contract.md)
- [validation-checklist.md](validation-checklist.md)

## Consumer First-Time Flow

1. Initialize consumer overlay with `npm run init-consumer -- --consumer <consumer-root>`.
2. Initialize consumer-local Qwen bootstrap only if the consumer explicitly adopts that local overlay.
3. Customize only consumer-local overlay files and adopted local input contracts.
4. Validate consumer linkage and adopted input contracts:
   - `npm run validate-consumer -- --consumer <consumer-root>`
   - `npm run validate-input-contract -- --contract <consumer-root>/.codex/repo-intake-inputs.json` (if adopted)
   - `npm run validate-runtime-policy-input-contract -- --contract <consumer-root>/.codex/runtime-policy-inputs.json` (if adopted)
5. Run shared-core gates before migration handoff:
   - `npm run validate`
   - `npm run validate-neutral`
   - `npm run eval`

## Canonical Versus Compatibility Rule

- Do not import compatibility mirrors as canonical source.
- Do not copy compatibility docs/contracts into consumer-local canonical truth when canonical shared-core source already exists.
- If consumer behavior needs extension, update canonical shared-core surfaces first and regenerate projections.

## Handoff Checklist

1. Consumer manifest points to the intended shared-core source/version/fingerprint.
2. Adopted skills are explicit; deferred skills are explicit.
3. Local overlay file ownership is explicit.
4. Validator and eval evidence is attached in handoff notes.

## Bounded Certification Handoff Record

At first-time adoption handoff, include:

1. canonical surfaces trusted for adoption decisions (`core/contracts/*`, `core/skills/*`, `policies/*`)
2. compatibility/export surfaces consumed as derived projections only
3. shared-core gate outcomes (`validate`, `validate-neutral`, `eval`)
4. explicit statement of still-planned/still-missing repo-root surfaces (`memory/`, `mcp/`, `tools/`)

## Notes

- This is an operational playbook; authority boundaries remain in [architecture.md](architecture.md), [authority-matrix.md](authority-matrix.md), and [compatibility.md](compatibility.md).
- Exact command usage and flags remain in [maintainer-commands.md](maintainer-commands.md).
- `.qwen` remains consumer-local overlay and not shared-core authority.

## Maturity Posture

- `prose-governed`: first-time adoption and handoff sequence in this playbook.
- `contract-backed`: consumer manifest and input-contract shapes consumed by validator scripts.
- `validator-backed`: `validate-consumer-linkage.mjs`, `validate-local-input-contract.mjs`, and `validate-runtime-policy-input-contract.mjs`.
- `runtime-implemented`: bounded to initializer/validator scripts; no runtime workflow engine or runtime migration plane claimed.
