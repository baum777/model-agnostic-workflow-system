# Research Reproduction Review — scheduler-benchmark, claim C1

Executed by: agent (reviewer run, 2026-10-28) · Skill: `core/skills/research-reproduction-review` ·
Input: `cases/research-reproduction-review/pos-standard/paper-excerpt.md` ·
Nothing was executed, installed, or fetched in this review; no reproduction is claimed.

## METHOD

- Stated method (paper v3, 2026-09-14): 16-core/NVMe/kernel-6.1 testbed; W-Gen v2.3 workload generator; utilization sweep 40/60/80%; 5 seeds × 10-min runs × 3 repetitions; baseline A = stock scheduler (default config); candidate B = patch commit `e3a1f` with `--burst=64 --cohort=8`; metric p99 queueing latency and throughput from W-Gen's queue log (`cases/.../paper-excerpt.md`, Method).
- Reproducible portion: testbed class, generator version, seed list, patch commit, and flags are all concretely identified — the experimental *shape* is reproducible from the stated method.
- Not reproducible from the statement alone: the exact kernel `.config` and the paper's own raw queue logs (see ARTIFACTS); reviewer inference (distinct from stated results): kernel config may affect scheduler behavior enough to shift p99.

## ARTIFACTS

- Available: code at tag `v3-artifact` (contains patch `e3a1f`), sweep scripts, flag files, seeds in `configs/seeds.txt`; W-Gen v2.3 downloadable.
- Referenced but not provided: paper's raw queue logs (would allow direct number comparison).
- Unstated: kernel `.config`; NVMe model/firmware; W-Gen workload mixture parameters ("mixed CPU/IO" is not parameterized in the excerpt).

## REPRODUCTION PLAN

Bounded to claim C1 under the 24 h single-machine constraint:

1. Pin environment: kernel 6.1 with the testbed's config (request from authors or derive and record deviations), NVMe noted, W-Gen v2.3 hash-pinned at install.
2. Execute the 80%-utilization point first (the claim's headline regime): 5 seeds × 10 min × 3 reps for A and B — 2 × 2.5 h ≈ 5 h; checkpoint after this stage alone.
3. If C1 reproduces at 80%, extend to 60% and 40% (further ~10 h) to bound the range; otherwise stop and report the single-point result.
4. Execution governance: runs are scripted, deterministic, and executed only after artifact admission; unattended runs (if used) run sandboxed with approvals enabled — approvals for the kernel patch step are explicit and interactive, not bypassed.
5. Total worst case ≈ 15 h of runs + setup — inside the 24 h budget with margin for one retry of a single stage.

## FAILURE CRITERIA

Agreed before execution (per-claim, per-utilization point):

- C1 reproduced at a point: B's p99 reduction falls within 38–42% with overlapping seed variance.
- C1 partially reproduced: reduction outside 38–42% but >0 with consistent direction across seeds → report as directional-only, not the paper's claim.
- C1 not reproduced: reduction ≤ 0 or inconsistent direction on ≥ 3 of 5 seeds.
- Any stage aborts (patch fails, environment mismatch beyond recorded deviations) → the affected point is UNREPRODUCED, never interpolated.

## GAPS

- Kernel `.config` unknown until authors respond or a deviation record is accepted; this is the largest fidelity risk.
- "Mixed CPU/IO" workload mixture parameters unstated in the excerpt; W-Gen defaults are an assumption, not the paper's setting.
- The paper's own logs unavailable → comparison is against the stated range only, not against their raw data.
- Nothing above has been executed; this is a protocol, and it stays one until run under the stated governance.
