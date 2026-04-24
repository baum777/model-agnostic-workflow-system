# Consumer Adoption Guide

Class: operational.
Use rule: use this guide for explicit, opt-in consumer checks of shared-core extension contracts without introducing runtime or blocking-gate claims.

## Purpose

Consumer adoption means a concrete consumer repository explicitly opts in to shared-core extension contracts to test practical fit, fixtures, overlays, and workflow boundaries, without blocking existing consumers.

## Current Boundary

- Shared core provides contracts and deterministic eval slices.
- Consumer adoption is opt-in.
- No runtime is enabled by this guide.
- No enforcement engine is enabled by this guide.
- No global blocking gate is enabled by this guide.
- Consumer overlays remain the adoption boundary.

## What Adoption May Include

- Select a consumer repository.
- Select relevant extension modules.
- Create consumer overlay notes or adoption notes.
- Add example fixtures for dry-run checks.
- Run dry-run validation and shared-core eval slices.
- Mark deferred checks explicitly.
- Record outcomes in compatibility/adoption notes.

## What Adoption Must Not Claim

- No runtime readiness claim.
- No permission enforcement claim.
- No memory store claim.
- No scheduler runtime claim.
- No budget enforcement runtime claim.
- No transport/handoff runtime claim.
- No global consumer-blocking gate claim.

## Suggested Adoption Flow

1. Select consumer repo.
2. Select extension modules.
3. Map required contracts.
4. Create consumer overlay notes.
5. Add dry-run fixtures.
6. Run shared-core evals.
7. Record gaps/deferred checks.
8. Decide whether further adoption is justified.

## Maturity Labels

- `contract-backed`: contract exists as shared-core machine-readable surface.
- `validator-backed candidate`: deterministic eval/validator evidence exists, but not a default consumer-blocking global gate.
- `consumer opt-in evidence`: explicit consumer-repo adoption artifacts and outcomes are recorded.
- `runtime-implemented`: real runtime path exists and is independently evidenced.

## Exit Criteria

Consumer adoption is successful when:

- one concrete consumer repository was evaluated;
- opt-in scope is documented;
- fixtures or examples exist;
- no runtime/enforcement claims were introduced;
- deferred checks are visible;
- existing consumers remain unblocked.

## Related Surfaces

- [compatibility.md](compatibility.md)
- [adoption-playbook.md](adoption-playbook.md)
- [consumer-rollout-playbook.md](consumer-rollout-playbook.md)
- [repo-overlay-contract.md](repo-overlay-contract.md)
- [authority-matrix.md](authority-matrix.md)
