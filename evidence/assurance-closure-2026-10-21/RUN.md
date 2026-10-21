# MAWS — bounded assurance closure run (2026-10-21)

Date: 2026-10-21. This run works the three focuses of the owner ticket:
**durable persistence of the exact test and readback evidence**, **negative
probes of the remaining content/TOCTOU boundaries**, and an **independent
qualification of the security baseline**.

It is a NEW bounded change on top of the merged state. The S5, S8 and S9
closures are **not** re-opened: their closures stay pinned to their
published commits, and the gates they closed are re-verified, not reopened.
No provider call, no activation, no promotion, no authority grant.

The owner ticket is the source of authority. It authorizes no canonical
adoption of any specification, no runtime activation, no authority change,
no capability grant and no promotion.

---

## 1. The gap this run closed

Every run record this repository had written was **prose**: a sentence
claiming "21/21 steps exit 0", with the raw output produced in a temporary
directory and then gone. The runs that verified the path-confinement,
evidence-admission and source-security lanes are exactly the runs whose
output no longer exists anywhere. A claim that cannot be re-checked is not
evidence, and the next reader had to take it on faith.

Three surfaces now carry the evidence.

## 2. Focus 1 — the exact test and readback evidence, durably

`core/contracts/assurance-run-record.schema.json` (contract
`assurance-run-record.v1`) defines a run record; `scripts/tools/
capture-assurance-run.mjs` (npm `capture:assurance-run`) produces one;
`scripts/tools/validate-assurance-run-record.mjs` (npm
`validate:assurance-run`) re-derives every claim in it.

- The **gate list lives in the repository**, so the set of executed gates is
  reviewable and versioned like any other source.
- Every gate's stdout and stderr are stored **verbatim** in
  `evidence/assurance-closure-2026-10-21/gates/`, with its exit code
  committed next to them as a `.exit` file. Nothing is summarised on the way
  in.
- The record names each output by **digest**, so an output edited after the
  capture is detected.
- The test counts are **re-derived from the raw log**, not typed in: the
  validator parses the log's own summary and compares.
- The record is **bound to a commit**: every artifact digest is recomputed
  from the blob at that commit, so the record stays checkable after the
  working tree has moved on.
- The **environment claim is checked for self-consistency**: a record that
  claims hosted CI parity while stating that no hosted run was executed is
  refused, and so is the reverse.
- A record **must state at least one limit it does not claim** — a run that
  claims everything claims nothing.

The validator is wired into the hosted workflow (`--all`: every committed
run record is checked), so the evidence stays honest as the repository moves
on rather than decaying into a claim.

**This run's record**: `evidence/assurance-closure-2026-10-21/run-record.json`,
bound to commit `c25958111494c8c6c12a20436eee25366ef2ee29`.

| | |
|---|---|
| Gates | **15 / 15 passed**, 0 failed |
| Tests | **802 passed, 0 failed** (781 in the vNext suite, 14 security regressions, 1 provider adapter import, 6 skill frontdoor) |
| Runtime | Node v24.19.0 (the workflow's pinned major), linux x64 |
| Parity | `LOCAL_REPLICATION` — `hosted_ci_executed: false` |
| Validator | `passed: true`, no issue, on the committed record |

The raw output of every gate is in `gates/`. It is committed, not
regenerated on demand: that is the point.

## 3. Focus 2 — negative probes of the remaining boundaries

A gate-by-gate map of the two evidence surfaces found **43 refusal branches
that no test exercised**. The run closed 25 of them with negative tests, each
one proven load-bearing by a reverted mutation probe.

**S9 (trusted evidence admission)** — the committed-bytes comparison of the
admitted behavioral eval record, the corpus **file set** comparison, the
per-file "not carried" refusal, the subject binding, the double-binding
refusal, the runtime's own contract check, the runtime's own shape checks
without an injected validator, a retracted published history, an admission
that is never implied, an admission artifact that is a symlink out of the
tree, and an admitted record that became one.

**S8 (evidence provenance)** — the **baseline half** of the gates, which had
never been tampered with: its own seal, its re-execution, its subject; plus
the corpus identity, the variant gate, the clock gate, the shape of a
caller's digest, a record reference that must be given, a symlinked record, a
record that is not JSON, a corpus that is not a directory, and a record whose
subject is not the subject the corpus measures.

The suites go from **26 to 39** (S9) and from **29 to 41** (S8) tests.

### The residual matrix

`evidence/assurance-closure-2026-10-21/residual-matrix.json` is the
machine-checked inventory of every boundary and the **proof** it carries.
`tests/tools/assurance-residual-matrix.test.mjs` refuses a matrix that

- claims a test which does not exist in the file it names,
- names a test for a boundary the matrix does not prove,
- attributes a refusal code to a surface that does not contain it, or
- leaves out a residual class that a surface declares in its own header.

**What stays UNMEASURED, and is named as such rather than closed:**

| Residual | Why it stays open |
|---|---|
| **R3** — a hung filesystem | cannot be constructed deterministically in this runtime; no user-space flag prevents a hung mount from blocking a read |
| **R4** — a bind mount inside the base | requires privileges that already exceed the read |
| **S8 corpus replaced WHILE it is being verified** | a race is not a test; the branch `EVIDENCE_CORPUS_CHANGED` is real and unmeasured |
| **S8 execution failure** | the re-execution of a loaded corpus does not fail for the fixture shapes this repository ships |
| **R1** (in-place rewrite) | NOT closed — but **measured**: an existing test binds it, proving the rewritten content is read back. A limit that is asserted in prose is a claim; a limit that a test measures is a fact. |
| **R2** | narrowed by construction (the rooted descriptor binding refuses a swap at any component); the same-name race inside ONE component resolution remains |

## 4. Focus 3 — the independent qualification of the security baseline

The gate and its baseline were qualified by a reviewer that did **not** write
them. The record is `evidence/assurance-closure-2026-10-21/baseline-qualification.md`.
The qualification found real defects, and they were repaired:

1. **A live command injection.** `scripts/tools/baum-loop-repo.mjs` read the
   repository state with `execSync` and a shell string that carried the
   target path inside double quotes — and the path arrives from the command
   line, and through `scripts/tools/ci-gate.mjs` from a caller that passes a
   repository path. A path containing a quote or a command substitution
   escaped the quotes and ran. The call is now
   `execFileSync('git', ['-C', targetPath, ...])`, the repository's own
   policy for `child_process`. Three new tests bind the closed form.
2. **Two false justifications** in the baseline: one denied the
   interpolation that was actually there; the other claimed a path
   confinement of the dynamically imported executor module that never
   happens and that the module's own header documents as the opposite.
   Both are corrected — the second now states the operator authority.
3. **The rules could not see the repository's own egress.** Every rule
   matched only the bare call, so `globalThis.fetch(...)` escaped the rule
   that names its defect class, and the egress rule matched **zero** real
   egress call sites in the repository. The member forms are part of the
   rules now, and the two real sites are disclosed with the transport's own
   host-allowlist guard named.
4. **One unbalanced `/*` inside a string literal hid every rule at once**:
   the comment stripper was blind to string literals. It is a string-aware
   lexer now.
5. **A baseline entry without a justification silenced a finding on its
   own.** An entry without a justification now covers nothing, and the gate
   reports it.
6. **The header overstated the gate in four places**, and the gate's own
   test file ran in **no** CI step — it is in the workflow's security step
   now.

After the repair: **238 files analysed, required coverage 4/4, PASS** with 5
source-level disclosures and 34 entries, none without a justification. The
scanner's suite is 11 → 15 tests, and the injection regression is a new
3-test file.

## 5. The probes

**29 reverted mutation probes** in total, each of which neutered exactly one
guard and had to fail exactly the designed test. 25 of them bind the new
evidence gates; 3 bind the new scanner guards; 1 binds the injection
repair. All 25 evidence-boundary probes are load-bearing; P09 and P23
cascade (the neutering breaks the module's input, so every downstream test
fails as well) and the cascade is recorded.

`evidence/assurance-closure-2026-10-21/mutation-probes.json` carries the
result of every probe: the guard, the designed test, the full failing set.

One probe earned its place by finding a false pass: the first version of the
injection test **passed against the old code**, because the adapter refuses a
target it cannot read anything from before it reaches the state read. The
fixture now carries a file the scanner accepts, and the probe fails against
the old code as it must.

## 6. What this run does NOT claim

- **No hosted CI result.** The account's GitHub Actions admission is closed
  by a billing lock. The wired steps are **published** and have **not run
  there**. Every measurement in this run is a local run under Node v24.19.0,
  the workflow's pinned major. The run record says so in its own
  environment claim, and the validator refuses a record that says otherwise.
- **No independent human approval.** The verification is tool-based: suites,
  mutation probes, a self-validating run record. The qualification of the
  source security gate was performed by a **reviewer agent**, not by a human
  owner.
- **No closure of R3, R4 or the corpus-change race.** They are UNMEASURED and
  named in the residual matrix.
- **No semantic vulnerability analysis.** The source security gate is a
  static rule scan with a bounded rule set. It does not analyse non-regular
  files, and it does not analyse files outside the governed roots
  `runtime/`, `scripts/`, `providers/`, `tests/` — eight `.mjs` files
  (five live tracer scripts under `evidence/`, three under `examples/snake/`)
  are outside them.
- **No re-opening of S5, S8 or S9.** Their closures remain pinned to their
  published commits.
- **No authority.** The run grants no permission, promotes no skill,
  activates no runtime and creates no authority.

## 7. The registration surfaces

The owner-side classification is `registry-disposition.v1` with status
`NO_CHANGE` and `affected_records` empty: the change adds tool surfaces, a
repo-local contract for the repo's own run records, tests and evidence, and
alters no adopted registered binding, contract record, provenance or
supersession class. The change registration in the Unitera Registry and the
representation in the Unitera Atlas are still required for every change by
the project routing layer, and both are made.

## 8. How to re-check this run

```bash
node scripts/tools/validate-assurance-run-record.mjs \
  evidence/assurance-closure-2026-10-21/run-record.json --current
node --test tests/tools/assurance-residual-matrix.test.mjs
node --test tests/tools/assurance-run-record.test.mjs
node --test tests/tools/source-security-scan.test.mjs
node --test tests/tools/loop-repo-command-injection.test.mjs
```

The raw output of every gate is in `gates/`: the file names, the `.exit`
codes and the digests are in the record, and the validator re-derives all of
it from the committed material.
