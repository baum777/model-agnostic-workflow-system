# Daily Reverse-Prompting Routine

Class: canonical.
Use rule: use this workflow to derive reusable prompts, templates, skills, agent candidates, automations, and product signals from observed daily work without executing those proposals.

## Objective

Turn evidence from completed work into a small, prioritized discovery report. The routine is advisory and prose-governed: it proposes reusable assets but does not create skills, activate agents, schedule automation, make product decisions, or change production systems.

## Trigger And Inputs

Run at session close or day close, normally after the consumer has produced its daily log. A minimal input is:

```text
Done today:
- ...
Friction:
- ...
Repeated explanations:
- ...
Decisions or uncertainty:
- ...
Tomorrow pressure:
- ...
```

Optional read-only evidence may include daily logs, session closure reports, git summaries, open tasks, approved chat summaries, and consumer-owned product documents. Label unsupported statements as assumptions. Never infer completed work from plans or proposals.

Consumers may configure signal lanes such as `Product`, `Operating System`, `Sales / Outreach`, and `Personal Workflow`. For example, a consumer may map `Product` to Bevero and `Operating System` to Baum-OS. Product names are consumer context, not shared-core defaults.

## Friction Classes

| Class | Meaning |
| --- | --- |
| `manual-repeat` | Repeated manual work |
| `context-rebuild` | Context had to be reconstructed or explained again |
| `review-needed` | Output required verification or counter-review |
| `decision-risk` | A decision was uncertain, consequential, or approval-sensitive |
| `doc-gap` | Documentation was missing, stale, or unclear |
| `workflow-gap` | A repeatable process lacked a stable workflow |
| `product-signal` | Evidence may support a product or service capability |
| `sales-signal` | Evidence may support outreach, qualification, or follow-up |
| `security-signal` | Auth, secrets, permissions, production, or data risk appeared |
| `design-signal` | UX, content hierarchy, CTA, responsive, or visual clarity friction appeared |

## Workflow

1. Summarize observed work in five to ten bullets and keep assumptions explicit.
2. Extract friction items and attach evidence or an evidence pointer to each item.
3. Assign one primary friction class and optional secondary classes.
4. Convert each material item into a bounded reverse-prompt candidate with a concrete input, task, output, and stop condition.
5. Route each candidate to the smallest sufficient target:
   - `Chat` for one-off or unstable work.
   - `Prompt Template` for reusable instructions without a stable workflow contract.
   - `Template` for a stable output shape without tool use.
   - `Skill` for a repeatable procedure with stable inputs, outputs, and gates.
   - `Agent Candidate` only when role-specific judgment, routing, or governed memory is required and a skill is insufficient.
   - `Automation Candidate` only when the trigger and deterministic boundaries are known; do not schedule it.
   - `Product Feature` or `Sales Asset` when evidence supports an external-value hypothesis; do not treat it as an approved roadmap decision.
6. Score candidates and record the evidence behind each non-trivial score.
7. Separate findings into the configured signal lanes.
8. End with three concrete next actions and a parking lot.

## Scoring

Score each dimension from `1` to `5`:

| Dimension | Question |
| --- | --- |
| Frequency | How often has this occurred in observed work? |
| Pain | How much time, focus, or momentum did it consume? |
| Leverage | How much future work could reuse the result? |
| Risk | How much error or security exposure could it prevent? |
| Product Value | How strong is the evidence for external value? |
| Build Cost | How expensive is a safe first implementation? |

```text
Priority Score = Frequency + Pain + Leverage + Risk + Product Value - Build Cost
```

The score ranks candidates; it does not approve implementation. Low-confidence inputs must be marked and must not receive false precision.

## Output And Write Boundary

Default output is the structured Markdown report defined by [`daily-reverse-prompting-template.md`](../../templates/codex-workflow/daily-reverse-prompting-template.md). Return it in the active conversation unless the consumer explicitly requests a file write and provides or approves the destination path.

If a consumer adopts persisted daily reports, a suitable local convention is `logs/daily-reverse-prompting/YYYY-MM-DD.md`. That path is not created or governed by this shared-core routine, and consumer-local authority decides retention and access.

## Governance And Stop Conditions

- Read only sources allowed by the consumer's authority and privacy rules.
- Do not store secrets, credentials, sensitive customer data, or unnecessary personal data.
- Redact sensitive evidence; retain a safe pointer when exact content is not required.
- Do not execute repo changes, create or register skills, activate agents, schedule jobs, or make final product decisions.
- Do not promote imported notes, chat summaries, or inferred context to canonical truth.
- Stop and report `BLOCKED` when evidence authority, sensitive-data handling, or the requested write boundary is unclear.
- Report `partial` when inputs are incomplete but a bounded advisory analysis remains safe.

## MVP Maturity And Next Gate

- `prose-governed`: this workflow and its templates define the advisory process.
- `contract-backed`: not claimed.
- `validator-backed`: repository structure and links may be validated; discovery quality is not validator-backed.
- `runtime-implemented`: not claimed.

Pilot the routine with three to five real daily inputs. Promote a repeated candidate to a skill, agent, automation, product feature, or sales asset only through a separate reviewed task with its own authority and validation gates.
