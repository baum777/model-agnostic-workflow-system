# Research Reproduction Review — vendor claim: BLOCKED (no method, no artifacts)

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/research-reproduction-review` ·
Input: `cases/research-reproduction-review/neg-claim-without-method/announcement.md`

## METHOD

- Stated result: "3.7x faster queries than the previous generation — proven in extensive benchmarks across realistic workloads" (`cases/.../announcement.md`).
- Reproducible evidence: **none**. No benchmark suite, no workload definition, no hardware, no seeds, no code, no data; the technical report is "forthcoming". The claim is a stated result with an empty evidence base.

## ARTIFACTS

- Available: nothing.
- Referenced but unavailable: the technical report.
- Unstated: everything the claim depends on — baseline version, query mix, data size, repetition count, metric definition.

## REPRODUCTION PLAN

Not designable in good faith. A protocol requires at minimum: the benchmark suite and workload definition, the baseline and candidate build identities, the hardware class, and the metric computation. Until the report publishes, the only honest protocol step is: **request the artifact set; do not run anything.** No "reproduction score" exists to compute, and none is invented for the memo.

## FAILURE CRITERIA

- Not applicable to an unexecutable protocol. The governing criterion is procedural: any future reproduction of this claim fails closed if the report's artifacts do not match the announcement's setup description.

## GAPS

- **BLOCKED:** the claim is unreproducible as stated; the memo can record "vendor-stated, no evidence base", never a reproduction verdict, a score, or a number derived by this review. (Quality-check rules exercised: "missing evidence is a blocker, never an invented number"; "no fabricated experiments or statistics".)
