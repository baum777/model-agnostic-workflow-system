# Independent qualification of the source security gate and its baseline

Date: 2026-10-21. This is the record of the third focus of the bounded MAWS
assurance closure run: the repository-owned static security gate and its
baseline were qualified by a reviewer that did **not** write them, and the
defects the qualification found were repaired.

The qualification was executed against the committed state of the gate
(`scripts/tools/scan-source-security.mjs`, `security/source-security-baseline.json`,
`tests/tools/source-security-scan.test.mjs` at `b1c0356`), reading the
governed tree and building fixture trees under a temporary directory. No
repository file was modified by the reviewer.

**What the reviewer did not qualify** is stated in section 6. The most
important of those gaps: the reviewer could not observe the tree in a
quiescent state, because the run was changing it at the same time — which is
the documented threat model of the repository, not a defect of the gate.

---

## 1. Verdict

| Question | Answer |
|---|---|
| Q1 — false negatives | 23 evasion shapes were demonstrated by execution across the four rules. Four are rule-set gaps that no regex closes, four are not regex-closable at all, and one is a cross-cutting hole in the comment stripper that defeated **all four** rules at once. The most serious finding: the egress rule matched **zero** real egress call sites in the repository. |
| Q2 — the baseline | 18 entries: 16 justified, 1 overstated, 1 wrong, 0 obsolete. All 18 excerpts matched the cited source byte-for-byte and all 18 cited lines agreed with the finding line — but **two justifications were factually false**, and the baseline MECHANISM had a hole: a new finding could be silenced with one silent line, and the gate would report PASS. |
| Q3 — the verdict's honesty | The gate could pass vacuously in five distinct ways. Its own test file was executed by no CI step, so the coverage assertions were unenforced where it matters most. |

## 2. What was repaired

### 2.1 A live command injection (the material finding)

`scripts/tools/baum-loop-repo.mjs` read the repository state with:

```js
const status = execSync(
  `git -C "${targetPath}" status --short --ignore-submodules=none`,
  { encoding: 'utf8', timeout: 5000 }
).trim();
```

`targetPath` arrives from the command line (`parseCommand` → `resolve`), and
through `scripts/tools/ci-gate.mjs:46` from a caller that passes a repository
path. A path containing a double quote escaped the quotes and ran; the
reviewer demonstrated it live — the injected command executed and the tool
still reported `Result: pass`. A path containing `$(...)` runs inside double
quotes as well.

The call is now the repository's own policy for `child_process`:

```js
const status = execFileSync(
  'git',
  ['-C', targetPath, 'status', '--short', '--ignore-submodules=none'],
  { encoding: 'utf8', timeout: 5000 }
).trim();
```

`tests/tools/loop-repo-command-injection.test.mjs` binds the closed form
with three cases: a payload path, a command-substitution path, and a plain
path that must still work. The first version of the test **passed against the
old code** — the adapter refuses a target it cannot read anything from
before it reads the state, so the sink was never reached. The fixture now
carries a file the scanner accepts. With the fix reverted, both injection
cases fail: the repair is proven load-bearing.

### 2.2 Two false justifications

- `security/source-security-baseline.json` claimed for the second `execSync`
  that "no caller-supplied or derived content is interpolated into the shell
  string". That was false, and the entry is gone with the call it described.
- The entry for the dynamically imported executor module in
  `run-skill-effectiveness-evals.mjs` claimed that the specifier "has passed
  the shared path-confinement primitive" and is "verified on a descriptor
  before this import is reached". It never does: the confinement governs the
  CORPUS files, the `--executor-module` argument is an operator surface that
  the module's own header describes as "deliberately NOT confined to the
  repository" and "code execution by design", and the corpus is loaded
  *after* the import. The justification now states the operator authority
  instead of a confinement that does not exist.

### 2.3 The rules could not see the repository's own egress

Every rule matched only the BARE call (`(?<!\.)\bexec(?:Sync)?\s*\(` and
friends), so the MEMBER call escaped the rule that names its defect class.
The repository binds the platform fetch as its default transport in two
files, and both bindings were invisible:

- `runtime/executors/openrouter-executor.mjs:62` — `fetchImpl = globalThis.fetch?.bind(globalThis)`
- `runtime/decision-engine/jev/client.mjs:126` — the same binding, twice on one line

So `SOURCE_UNPINNED_NETWORK_EGRESS` matched **zero** real egress call sites
in the whole repository; its only hits anywhere were two fixture strings in
the gate's own test file. The member forms are part of the rules now, and
the two real sites are disclosed with the transport's own host-allowlist
guard named. The disclosure says what the gate can and cannot do: it reports
the BINDING; it does not verify the guard, which lives in the transport.

### 2.4 One unbalanced `/*` inside a string literal hid every rule

The comment stripper blanked block comments with a regular expression that
did not know about strings. A string literal containing `/*` therefore opened
a "comment" that swallowed the rest of the file — and every rule was blind
from that point on. The cheapest possible evasion of the whole gate, one
line long. The stripper is a string-aware lexer now: it tracks code, line
comment, block comment, string and template modes, and recognises regular
expression literals so a quote inside a regex cannot derail the walk.

### 2.5 A baseline entry without a justification silenced a finding

The matching key is `file + rule + excerpt`; the justification was optional
(`entry.justification ?? ''`), and the baseline file itself was parsed without
any validation. A developer could add a new finding and one silent line to
the baseline, and the gate would report PASS. An entry without a
justification now covers nothing; the finding stays uncovered and the gate
reports the entry explicitly.

### 2.6 Claims that overstated the gate

- The header said the rule set covers `exec/execSync` and `fetch`; it
  covered only the bare form. Corrected in the header and in the rule list.
- The header said the baseline "carries exactly that file, line and rule":
  the key is `file + rule + excerpt`, and the cited line is decorative. The
  header now says so.
- The header said the baseline "cannot rot into an amnesty list". It cannot
  ROT (a stale entry fails the gate); it could be EXTENDED silently, which
  is what 2.5 closes. The header now says "cannot ROT".
- The header said it "enumerates every .mjs and .js file under the governed
  roots". A symbolic link, a FIFO or any other non-regular file is not
  analysed, and a governed root that does not exist is not a failure. The
  header now says "every REGULAR .mjs and .js file" and names the gap.

### 2.7 The gate's own test file ran in no CI step

`tests/tools/source-security-scan.test.mjs` was executed by no workflow step,
so the assertions that matter most — the gate's own `ok`, the analysed file
count, the required coverage — were unenforced in CI. The file is now in the
workflow's security step, next to the gate it tests.

### 2.8 A duplicated disclosure that a reviewer would have "fixed"

The fixture line at `tests/tools/source-security-scan.test.mjs:148` carries
the trigger twice, so the scanner reports two findings with the same excerpt
and the consumption model requires two entries. A reviewer who deduplicated
them would have broken the gate with a spurious unbaselined finding. Both
entries now carry a note saying so.

## 3. What was confirmed and is not to be re-opened

1. All 18 original excerpts matched their cited source byte-for-byte, and all
   18 cited lines agreed with the finding line.
2. The consumption model is correct: one entry cannot cover two findings.
3. Stale-entry detection works.
4. An unreadable or unparseable file is fail-closed, never a skip. This is
   the gate's strongest property.
5. The gate's own file is analysed and does not self-match; `RegExp.exec`
   and a literal `import()` remain non-findings.
6. The `node --check` parse validation is the right mechanism — the engine's
   own parser, not a re-implementation.
7. All 15 original test-fixture disclosures are genuinely inert: the
   fixture strings are written into a temporary tree and only ever parsed
   and regex-scanned, never executed.
8. The `run-skill-effectiveness-evals.mjs` disclosure is a true positive:
   there genuinely is a non-literal `import()` there.

## 4. What remains open after the repair

These are named, not closed:

- **The gate is a static rule scan with a bounded rule set.** It is not a
  semantic vulnerability analysis, and it does not claim to be.
- **A governed path that is a symbolic link, a FIFO or any other
  non-regular file is not analysed.** The report names the files it
  analysed, and a replacement of a governed file by a link therefore removes
  it from the coverage without an error. Closing that needs the file identity
  to be checked against a committed manifest, which this gate does not have.
- **A governed root that does not exist is not a failure.** The coverage
  assertion is enforced when at least one governed root exists, so a tree
  that carries only `scripts/` would pass while `runtime/`, `providers/` and
  `tests/` are absent.
- **The required coverage names four files.** It is a floor, not a manifest.
  Eight `.mjs` files outside the governed roots — five live tracer scripts
  under `evidence/` and three under `examples/snake/` — are not analysed.
- **Four evasion shapes are not regex-closable**: a destructured or aliased
  binding (`const { eval: ev } = globalThis`), a computed member
  (`obj['ev'+'al']`), an escaped identifier (`eval`) and a namespace import
  with an aliased call (`import { execSync as e }`). Closing them needs
  import-graph or AST analysis, which is a different tool.
- **The baseline can still be extended.** It can no longer be extended
  SILENTLY, and every entry must carry a justification, but the justification
  is a review judgment, not a proof.

## 5. The probes

Four new mutation probes bind the repairs; all four were executed and
reverted. The gate is unchanged by the probe.

| Probe | Neutered | Designed test that must fail |
|---|---|---|
| P26 | the justification requirement (`if (justificationOf(entry))` → `if (true)`) | "a disclosure without a justification does not cover its finding" |
| P27 | the string-aware stripper (reverted to the blind regular-expression stripper) | "an unbalanced comment marker inside a string literal cannot hide a trigger" |
| P28 | the member form of the egress rule | "the member form of a call is the defect class its rule names" |
| P29 | the `execFileSync` repair in `baum-loop-repo.mjs` | the two injection cases of `tests/tools/loop-repo-command-injection.test.mjs` |

P27 and P28 also break the repository's own self-scan, because the blind
stripper and the missing member rule hide the repository's real egress
bindings. That cascade is the point: the two repairs are what make the
repository's own egress visible to the gate.

## 6. What the reviewer could not qualify

1. The reviewer could not observe the governed tree in a quiescent state:
   the analysed file count moved from 233 to 236 to 237 during the audit,
   because this run was writing the assurance tooling into the same tree.
   The gate files themselves were unmodified, so the findings hold against
   the committed state, but the counts in the reviewer's notes are not
   measurements of a stable tree.
2. The reviewer could not verify the Registry or Atlas registration of this
   change from inside the repository. The owner-side disposition of the
   earlier source-security lane said the Atlas representation "trails" the
   Registry record; that gap belonged to that lane and is not asserted here.
3. The reviewer could not verify the external deep scanner's behaviour
   (the one that reported zero findings over `completeness: partial`); its
   output and language-pack registry are not in this repository. Only the
   premise recorded in the scanner's header was taken over.
4. The reviewer proved that the `baum-loop-repo.mjs` sink is injectable from
   the command line but did not enumerate which repository components pass
   attacker-influenced paths into it. `scripts/tools/ci-gate.mjs` passes its
   `--repo` argument there and is the obvious candidate.
5. The reviewer did not run the repository's test suites; that is the run's
   own job, and the run record carries their exact output.
