# Scope Policy

Class: operational.
Use rule: memory entries must use a known scope.

## Known Scopes

- `runtime`
- `project`
- `operator`
- `decision-candidate`

## Rule

Unknown scope is `BLOCKED`.

Known scope does not imply write permission. Phase 2 defines the scope vocabulary only.
