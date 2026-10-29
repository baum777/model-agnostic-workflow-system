# Input: scheduler-benchmark paper excerpt (fixture)

Source: `cases/research-reproduction-review/pos-standard/paper-excerpt.md` (fixture, self-contained)

```text
Paper: "Latency-Aware Scheduling for Mixed Workloads" (arXiv-style preprint v3, 2026-09-14)
Claim C1: scheduler B reduces p99 queueing latency by 38–42% vs. baseline A
  under mixed CPU/IO workloads at 80% utilization.
Claim C2: throughput is unchanged within noise (<2%) across the same range.

Method (as stated):
- Testbed: 16-core server, NVMe storage, kernel 6.1; workload generator W-Gen v2.3;
  utilization swept 40/60/80%; 5 seeds per point; 10-minute runs; 3 repetitions.
- Baseline A: stock scheduler, config default.
- Candidate B: the paper's patch, commit e3a1f, config flags "--burst=64 --cohort=8".
- Metric: p99 queueing latency from W-Gen's queue log; throughput from the same log.

Artifacts:
- Code: repository public, tag v3-artifact (patch commit e3a1f present).
- Configs: sweep scripts and flag files included in the tag.
- Data: W-Gen v2.3 downloadable; seeds 1–5 listed in configs/seeds.txt.
- NOT provided: the raw queue logs of the paper's own runs, and the exact
  kernel .config used on the testbed.
```

Research question to reproduce: C1 (the latency claim). Compute constraint: one
16-core machine for at most 24 h; no cluster available.
