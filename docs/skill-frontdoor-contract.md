# MAWS Skill Frontdoor Contract

Class: canonical.
Use rule: this contract is the mandatory pre-implementation and pre-install admission boundary for skill candidates entering MAWS.

## Purpose

Every skill candidate must be screened before it is implemented, installed, activated, imported, bound into a runtime, or published through MAWS.

The frontdoor composes two independent evidence producers:

1. **NVIDIA/SkillSpector** — mandatory static security and supply-chain scan (`--no-llm`).
2. **NVIDIA/SkillEvaluator Tier 1** — mandatory deterministic validation using the `external` profile and Tier 1 only.

The frontdoor is intentionally narrower than the full SkillEvaluator pipeline. Tier 2 semantic-overlap analysis and Tier 3 live agent evaluation remain later promotion/effectiveness evidence. Tier 3 is not run on an unadmitted candidate because it executes the candidate in an agent/sandbox context.

## Core Invariants

- `SCAN != INSTALL`
- `PASS != AUTHORITY`
- `EVIDENCE != APPROVAL`
- `ANALYSIS != IMPLEMENTATION`
- `UNKNOWN != SAFE`
- `INCOMPLETE != OVERRIDABLE`

A clean frontdoor record makes the candidate **eligible to continue**. It grants no filesystem, provider, network, execution, approval, installation, or runtime authority. Downstream MAWS permission, approval, qualification, and execution contracts still apply.

## Required Gate Sequence

### G0 — Exact candidate identity

The candidate must be materialized without activation and bound to an immutable source identity.

- Local directory/file: MAWS computes `sha256:<digest>`.
- Remote source: resolve it to an immutable revision before admission, then stage it locally.
- Mutable branch URLs such as `main`/`latest` without an immutable revision are not admissible implementation evidence.
- Symlinks inside a staged candidate are rejected by the frontdoor helper so the hashed object and analyzed object cannot silently diverge.

### G1 — SkillSpector static scan

Required command shape:

    skillspector scan <exact-local-candidate> --no-llm --format json \
      --output sandbox/runs/<timestamp>/skillspector-report.json

Blocking conditions include scanner unavailability, missing/unparseable evidence, unknown severity, any HIGH/CRITICAL finding, or a scanner-declared block.

### G2 — SkillEvaluator Tier 1

Required command shape:

    skillevaluator validate <exact-local-candidate> \
      --external --tiers 1 -r json \
      -o sandbox/runs/<timestamp>/skillevaluator \
      --min-score 70

Tier 1 is the frontdoor quality/static-security gate. A non-zero execution without a conclusive failed report, `overall_status != passed`, `overall_passed != true`, a missing analyzer, or a missing report is fail-closed. A complete failed Tier 1 report is a known block.

### G3 — Deterministic MAWS disposition

The canonical record is validated against `core/contracts/skill-frontdoor-admission.schema.json` and re-derived by `runtime/skills/frontdoor.mjs`.

The caller cannot make a risky record clean by editing disposition or blocker fields; declared and derived dispositions must match.

## Dispositions

| Analysis | Implementation | Meaning |
| --- | --- | --- |
| `CLEAN` | `ELIGIBLE` | mandatory evidence passed; candidate may continue to downstream governance |
| `BLOCKED` | `BLOCKED` | fully analyzed known risk/failure blocks the candidate |
| `INCOMPLETE` | `BLOCKED` | evidence is missing/unknown; fail closed |
| `BLOCKED` | `OWNER_EXCEPTION` | a bounded, explicit, unexpired owner exception accepts known risk only |

An owner exception cannot convert `INCOMPLETE` to eligible. Unknown or missing evidence is not a risk-acceptance decision.

## Operator Command

    npm run skill:frontdoor -- \
      --skill-id <stable-skill-id> \
      --target <staged-local-skill> \
      --action implement

Evidence is written under:

    sandbox/runs/<timestamp>/
      skillspector-report.json
      skillevaluator/
        *.json
      skill-frontdoor-admission.json
      skill-frontdoor-decision.md

## NVIDIA Tool Boundary

The NVIDIA projects are external analyzers, not MAWS authority.

- SkillSpector is used for static security/supply-chain evidence.
- SkillEvaluator Tier 1 is used for deterministic validation and quality/static-security evidence.
- Analyzer versions are recorded in every admission record.
- Analyzer output is normalized into the MAWS-owned admission contract.
- MAWS does not delegate permission, approval, qualification, installation, or execution authority to either analyzer.

## Tier 2 / Tier 3

After frontdoor admission:

- **Tier 2** may be required by a later publication/promotion policy to detect semantic overlap or duplicated guidance.
- **Tier 3** may be used as effectiveness evidence to measure whether the skill improves agent behavior.
- Neither stage weakens the frontdoor. A later pass never retroactively erases a security block.

## Canonical Sources

- `core/contracts/skill-frontdoor-admission.schema.json`
- `runtime/skills/frontdoor.mjs`
- `scripts/tools/skill-frontdoor-check.mjs`
- `docs/security/extension-install-safety-policy.md`
- `scripts/tools/preinstall-skill-risk-check.mjs`
