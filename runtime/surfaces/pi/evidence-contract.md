# Pi Evidence Contract

## Allowed Evidence
Evidence may include:
- host label
- Pi version
- provider
- model
- command shape without secrets
- tool mode
- approval tier
- exit status
- expected marker
- redacted output

## Forbidden Evidence
Evidence must not include:
- API keys
- tokens
- `.env` contents
- shell history
- auth files
- raw secret-bearing output
- browser profiles
- private credentials

## Required Report Shape
Every Pi run must report:
- Result
- Host / Scope
- Command shape
- Tool mode
- Provider / model
- Output marker
- Exit status
- Secret check
- Risks / gaps
- Next gate
