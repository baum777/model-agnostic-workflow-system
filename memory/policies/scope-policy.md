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

Known scope does not imply write permission.

Runtime writes are allowed only for `runtime` scope. Non-runtime write attempts are `BLOCKED`.
