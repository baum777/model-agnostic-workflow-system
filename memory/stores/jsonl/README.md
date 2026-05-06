# JSONL Memory Store

Class: operational.
Use rule: this directory is the local JSONL store surface for controlled runtime-scoped memory entries.

## Boundary

- `runtime-memory.jsonl` is generated local evidence and is ignored by git.
- Entries must use `runtime` scope.
- Entries must point provenance to a runtime run artifact.
- Entries must not promote canonical truth.
- Secret-bearing content is blocked before write.

No SQLite, scheduler, remote store, or canonical promotion is implemented here.

## Generated File

```text
memory/stores/jsonl/runtime-memory.jsonl
```

This file is local evidence and must not be staged by default.
