# MAWS — the repository-owned .mjs-capable source security gate

Date: 2026-10-21. This run establishes the ticket's third item: a security
check that ACTUALLY covers the `.mjs` material. The external deep scanner's
language packs do not register `.mjs` — measured the same day, its analysed
set for this repository contained no `.mjs` file at all, its
`completeness: partial / runStatus: inconclusive` verdict carried zero
information about the source this repository ships, and a scan narrowed to
the material analysed nothing and reported `complete`. No security claim was
derived from it. This lane replaces that void with a repository-owned,
dependency-free static gate and wires it into the hosted workflow's step
list.

---

## 1. What was established

`scripts/tools/scan-source-security.mjs` (npm: `scan:source-security`,
CI step "Source security scan"):

- **Coverage as part of the verdict.** Every `.mjs`/`.js` file under the
  governed roots (`runtime/`, `scripts/`, `providers/`, `tests/`) is
  enumerated, READ and PARSED (`node --check`); a file that is unreadable or
  does not parse is a FAILURE, never a skip. The report names every analysed
  file, and a REQUIRED-COVERAGE list pins exactly the material whose absence
  made the external scan vacuous — `path-confinement.mjs`,
  `run-skill-effectiveness-evals.mjs`, `evidence-provenance.mjs`,
  `evidence-admission.mjs` — failing the gate if any of it falls out of the
  analysed set.
- **Four rules, each a concrete defect class**, deterministic and
  line-precise: `SOURCE_DYNAMIC_CODE_EXECUTION` (eval / new Function /
  node:vm), `SOURCE_SHELL_INTERPOLATION` (exec/execSync — the repository's
  own policy is execFileSync with argument arrays and no shell),
  `SOURCE_UNPINNED_NETWORK_EGRESS` (fetch / http(s).request / net-tls
  connect), `SOURCE_DYNAMIC_IMPORT_SPECIFIER` (non-literal `import(`).
  Rule regexes are built from string fragments so the scanner never carries
  its own triggers as code and can scan itself; comment shapes are blanked
  before matching with line numbers preserved.
- **A baseline that cannot rot.** `security/source-security-baseline.json`
  discloses every accepted finding with a justification; a baseline entry
  that no longer matches a live finding is STALE and fails the gate, so the
  baseline can never become an amnesty list.
- **Honest scoping.** The required-coverage assertion is enforced where the
  governed roots exist (the repository or a copy of it); a foreign fixture
  tree is reported, not failed for the wrong reason.

## 2. First measurement of the repository

233 `.mjs` files analysed (the scanner counts itself), required coverage
4/4, PASS with **3 baselined findings, zero unbaselined**:

- `baum-loop-repo.mjs:54` and `:133` — `execSync` with constant git command
  strings, no interpolated content (disclosed; the policy for anything
  argument-bearing is execFileSync arrays);
- `run-skill-effectiveness-evals.mjs:723` — non-literal `import(moduleUrl)`
  where the URL is the loader's own construction over a corpus path that has
  passed the shared path-confinement primitive.

No eval, no `new Function`, no `node:vm`, no fetch/request/connect anywhere
in the governed source.

## 3. Tests and probes

`tests/tools/source-security-scan.test.mjs`: 10 tests, all passing — every
rule fires on its class with code and line; benign shapes (literal import,
`RegExp.exec`) do NOT fire (the `.exec(` false-positive class the external
scanner is known for is explicitly excluded); baseline round-trip and stale
detection; parse failure as failure; required-coverage bite; determinism;
the self-scan of the repository; the CLI exit codes.

| Probe | Neutered property | Result |
|---|---|---|
| C1 | an unbaselined `eval(userInput)` planted at `scripts/tools/zz-security-probe.mjs` | gate FAIL, exit 1, finding reported with file:line; restored → PASS |
| C2 | required coverage naming a file that does not exist | gate FAIL with `MISSING REQUIRED COVERAGE`; restored → PASS |

Both probes were reverted; the tracked tree is pristine and the gate is PASS
after restoration.

## 4. Registration surfaces

Owner-side classification: `registry-disposition.v1` NO_CHANGE with
`affected_records` empty — the gate is a tool surface; no contract, corpus,
record format, digest, authority or dependency changes (the scanner adds no
npm dependency). The change registration is the new Registry record
(`MAWS_SOURCE_SECURITY_SCAN_2026_10_21_001`); the Atlas representation
trails it as its own claim.

## 5. Limits — what this run does NOT claim

- The gate is a static rule scan with a bounded rule set; it does NOT claim
  to be a semantic vulnerability analysis, and it does not classify anything
  beyond its four rule codes.
- The baseline's justifications are review judgments recorded at
  observation time, not proofs.
- Hosted GitHub Actions remains blocked account-wide (billing lock); the
  CI wiring is published but has not run there. Every measurement here is a
  LOCAL run under Node v24.19.0.
- The external scanner's gap is not repaired by this lane — it is
  IRRELEVANT to this lane's claim: the coverage the ticket asked for is
  established and measured by the repository's own gate, and Mimosa remains
  unclaimed for `.mjs` material.
