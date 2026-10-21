# Addendum — the baseline match key is the reported content, not the line

Date: 2026-10-21, same day as the gate's establishment. Recorded here rather
than in a new evidence set because it is the same lane's surface adjusting
to the first real collision.

## What happened

While this run's final cross-surface readback was being prepared, the
s5-frontdoor-evidence lane's pull request 68 (`df8c683`) merged to main
ahead of the gate's own merge and edited
`scripts/tools/run-skill-effectiveness-evals.mjs`, moving the baselined
non-literal `import(moduleUrl)` from line 723 to line 788. The line-keyed
baseline went STALE and the gate went red on the merged main — the first
real collision between the gate and a co-lane's legitimate edit.

## The repair

The baseline match key is now `file + rule + EXCERPT` (the reported code
line, verbatim): the excerpt pins the content that was reviewed, so a
disclosure survives another writer moving the code to a different line, a
CHANGED line can no longer hide behind an old line number (an excerpt
mismatch is stale and fails), and a SECOND identical occurrence in the same
file is still unbaselined because matching consumes the entry. An entry
without an excerpt (legacy shape) matches on file + line + rule as before.
The CLI detection tolerates stdin invocation. All twelve existing baseline
entries were rebound to their excerpts from a live scan and six new fixture
entries were appended for the drift test's own fixture content (18 entries
total). The run at `origin/main` answers PASS again: 233 files, required
coverage 4/4, zero unbaselined, zero stale.

## Binding

`tests/tools/source-security-scan.test.mjs` grew a dedicated test: a
disclosure survives another writer moving the code (the interleaved-lane
case, verified down to the moved line number), a changed line content is
stale, and a doubled occurrence is not covered by one disclosure. Suite:
11 pass / 0 fail. The gate's verdict and the failure modes are unchanged
otherwise; the report schema gains nothing that was not already displayed
(the excerpt was already the finding's field).

## Registration

This addendum and the code change it describes are registered as their own
change (Registry record and Atlas claim trailing the owner pull request),
classified NO_CHANGE like the establishment itself: a tool surface adjusting
its matching rule, no contract, corpus, record format, digest, authority or
dependency touched.
