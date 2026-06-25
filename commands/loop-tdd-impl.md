# /loop tdd impl <spec>

Du bist der operative BAUM-OS-Agent.

## Trigger

```text
command/ loop tdd impl <spec>
```

Beispiele:

```text
command/ loop tdd impl classifyRisk in packages/policy
command/ loop tdd impl PolicyGateResult persistence in commitment-persistence.repository
command/ loop tdd impl "add validateCommitToken to packages/review"
```

## Was du tust

1. Lies `loops/tdd-impl-loop/command-contract.md` — prüfe ob `<spec>` in Scope passt.
2. Lade Prior Context via `loops/tdd-impl-loop/circling-integration.md` (Phase 1).
3. Führe die 7 Phasen des tdd-impl-loop aus:
   - Phase 1: INTAKE — Spec, Scope, Prior Context
   - Phase 2: RED — Test schreiben, Fail bestätigen
   - Phase 3: GREEN — minimale Implementierung
   - Phase 4: REFACTOR — bereinigen ohne Verhalten zu ändern
   - Phase 5: VALIDATE — Validator-Gates laufen lassen
   - Phase 6: DOCS — Docs/Circling-Aktionen
   - Phase 7: CLOSURE — Stop-Kriterien prüfen, Ergebnis festhalten
4. Prüfe Stop-Kriterien nach jeder Phase via `loops/tdd-impl-loop/stop-rules.md`.
5. Schreibe Evidence per `loops/tdd-impl-loop/memory-save-schema.md`.

## Regeln

- Kein Scope Creep: genau eine Implementierungseinheit pro Loop-Run
- Red vor Green — niemals Code ohne vorherigen fehlschlagenden Test
- Keine externen API-Calls, keine Secrets, keine `.env`-Dateien
- Kein Deployment, kein Cross-Repo-Write ohne explizite Freigabe
- Phase 4 (REFACTOR) nur wenn Phase 3 (GREEN) vollständig bestätigt
- Fehlender Spec → BLOCKED

## Output

```json
{
  "result": "pass | partial | blocked | failed",
  "spec": "<spec>",
  "phase_reached": "intake | red | green | refactor | validate | docs | closure",
  "files_changed": ["<path>", "..."],
  "tests_added": ["<path>", "..."],
  "closure_summary": "<summary>",
  "memory_saved": true | false,
  "evidence_path": "<optional baum-os evidence path>"
}
```

## Weiterführend

- Contract: `loops/tdd-impl-loop/command-contract.md`
- Stop-Regeln: `loops/tdd-impl-loop/stop-rules.md`
- Template: `loops/tdd-impl-loop/prompt-template.md`
- Circling: `loops/tdd-impl-loop/circling-integration.md`
- Memory Schema: `loops/tdd-impl-loop/memory-save-schema.md`
