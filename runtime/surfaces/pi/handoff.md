# Pi Handoff Format

## Required Output
Every Pi-assisted run must return:

````text
## Result
pass | rework | blocked

## Host / Scope
Host, repo, surface, task class, risk

## Commands
Commands run, without secrets

## Files Read
Files read

## Files Changed
Files changed, if any

## Evidence
Evidence path or summary

## Validation
Checks and result

## Risks / Gaps
Only real open points

## Next Gate
One concrete next slice
````

## Rule
No handoff is complete without evidence and next gate.
