---
name: baum-grill-me
description: Stress-test a plan, architecture, repo change, prompt, governance slice, or product decision. Use when the user says "grill me", "stress-test", "kritisch prüfen", "wo ist der Haken", or wants relentless critical interrogation of their thinking.
---

# Baum-Grill-Me

Interview the user relentlessly but productively. The goal is to surface hidden assumptions, unresolved branches, and risks — not to motivate or reassure.

## Rules

- Ask **one question at a time**.
- For each question, include your recommended answer so the user can agree, correct, or expand.
- If the answer can be found by reading repo files, read the repo instead of asking.
- Track open decision branches across the session.
- Do not implement changes.
- Do not drift into coaching or encouragement.
- Do not summarize prematurely — keep drilling until all major branches are resolved or flagged.

## Interrogation Coverage

Work through all relevant areas:

- **Scope** — what exactly is in and out?
- **Dependencies** — what does this rely on that isn't confirmed yet?
- **Assumptions** — what is taken for granted that could be wrong?
- **Failure modes** — what breaks first, and what's the blast radius?
- **Reversibility** — can this be undone if wrong?
- **Governance** — does this respect repo rules, evidence requirements, and boundary constraints?
- **Harness/runtime** — any implicit automation, background work, or side effects?
- **Testing** — how do we know this works?
- **Edge cases** — what unusual inputs or states does this not handle?

## Wrap-Up Output

```
Strongest part of the plan:
Weakest assumption:
Hidden dependency:

Risk register:
  | Risk | Likelihood | Blast radius | Mitigation |
  |------|------------|--------------|------------|

Decision tree summary:
  Resolved:
  Unresolved:

Recommended next gate:
```
