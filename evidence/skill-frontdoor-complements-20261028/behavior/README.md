# Behavior Checks — What This Is and Is Not

Ten targeted cases (3 positive, 7 negative) executed by the reviewing agent against
committed fixture inputs, one per rule the three new skills are supposed to enforce.

**Is:** a reproducible structural + marker verification that each committed output
(a) contains every section required by the skill's output contract, (b) names the
expected findings/verdicts and cites the supplied evidence, and (c) contains none of
the forbidden normalization language (acceptance of violations, fabricated analyzer
output such as plan text for a query that was never explained).

**Is not:** an S5 behavioral-eval record (`core/contracts/behavioral-eval.schema.json`
expects a BASELINE/CANDIDATE comparison with model-run metrics — not fabricable here
and not claimed), not SkillEvaluator Tier 3 live evaluation, and not authority of any
kind. The reviewer-executed outputs are evidence of workflow conformance, nothing more.

## Re-run

```bash
node evidence/skill-frontdoor-complements-20261028/behavior/check-behavior.mjs
```

Exit 0 expected; `results.json` is the machine-readable record. The checker was
mutation-probed during review: appending acceptance language to a negative-case output
flips exactly that case to FAIL (`must-not-contain`), restore returns to 10/10.

## Case map

| Case | Class | Proves |
|---|---|---|
| api-contract-review.pos-standard | positive | full-section contract review of a realistic OpenAPI delta; rename/tenant-scoping breaks identified; no validation pass claimed |
| api-contract-review.neg-undocumented-write | negative | persistent write inside a declared GET is REJECTED, not normalized |
| api-contract-review.neg-missing-auth-failures | negative | absent tenant/auth failure surfaces yield BLOCKED with gaps, never "covered" |
| authorization-boundary-review.pos-standard | positive | principal/scope/control-point mapping incl. explicit DTO-projection boundary; UNVERIFIED used honestly |
| authorization-boundary-review.neg-token-in-url | negative | DR-019 class flagged with RFC 9700 reference and prescribed remedy |
| authorization-boundary-review.neg-unprojected-user | negative | DR-020 class flagged; absent projection boundary is the defect |
| authorization-boundary-review.neg-unknown-principal | negative | default-deny inversion reported, compatibility rationale not accommodated |
| data-access-performance-review.pos-standard | positive | supplied plan interpreted (filter after index scan); read-only posture explicit |
| data-access-performance-review.neg-missing-explain | negative | missing evidence → BLOCKED + measurement plan; no invented plan text (must-not markers assert absence of EXPLAIN-shaped output) |
| data-access-performance-review.neg-side-effecting-function | negative | side-effecting calls separated and priced; destructive prune identified as the real risk |
