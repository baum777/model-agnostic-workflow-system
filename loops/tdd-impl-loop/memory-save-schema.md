# memory_save Schema — tdd-impl-loop

Version: v0.1
Status: canonical
Gilt für: Phase 6 (DOCS) und Phase 7 (CLOSURE) des tdd-impl-loop

---

## Grundregel

`memory_save` wird im tdd-impl-loop an exakt definierten Trigger-Punkten aufgerufen.
Kein freier Call — jeder Call hat einen Auslöser, einen Typ und ein TTL-Profil.

Required fields: `type`, `title`, `content`

---

## Trigger-Tabelle

| Trigger | Wann | Typ | TTL | Importance | is_global |
|---|---|---|---|---|---|
| Slice abgeschlossen (PASS) | Phase 6, nach Verified | `decision` | 90 | 7 | false |
| Bugfix (task_class: bugfix) | Phase 6, nach PASS | `bugfix` | 180 | 8 | false |
| Neue Konvention entdeckt | Phase 6, wenn erkennbar | `convention` | 365 | 6 | true |
| Scope bewusst ausgeschlossen | Phase 6, Out-of-Scope-Liste | `ruled_out` | 60 | 5 | false |
| Stop-Bedingung ausgelöst | Phase 6/7, wenn BLOCKED | `guardrail` | 180 | 9 | true |
| 3x FAIL — Root Cause offen | Phase 5→7, wenn blocked | `error_pattern` | 90 | 9 | false |
| Closure + Next Gate | Phase 7, immer | `project` | 30 | 6 | false |

---

## Call-Muster pro Typ

### `decision` — Slice abgeschlossen

```python
memory_save(
  type       = "decision",
  title      = "<task_slug>: <was entschieden>",
  content    = "<was wurde implementiert — Observable Terms>",
  why        = "<warum diese Herangehensweise — nicht 'weil es funktioniert'>",
  how_to_apply = "<wann gilt diese Entscheidung wieder — Bedingung>",
  symbol     = "<Haupt-Symbol das geändert wurde | None>",
  file_path  = "<primäre betroffene Datei | None>",
  tags       = ["tdd-impl-loop", "<task_class>", "<betroffenes Modul>"],
  importance = 7,
  ttl_days   = 90,
  is_global  = False,
  facts      = '["<Fakt 1>", "<Fakt 2>"]',
)
```

**title-Format:** `<Modul/Symbol>: <Verb + was>` — z.B. `loop-contract: intake phase uses token-savior exclusively`

---

### `bugfix` — task_class: bugfix

```python
memory_save(
  type       = "bugfix",
  title      = "<Symbol/Datei>: <was war kaputt>",
  content    = "<Root Cause — direkt beobachtet, nicht inferiert>",
  why        = "<warum dieser Bug entstanden ist — Pattern wenn erkennbar>",
  how_to_apply = "<wie ähnliche Bugs in Zukunft zu erkennen sind>",
  symbol     = "<betroffenes Symbol>",
  file_path  = "<betroffene Datei>",
  context    = "Failing check: <Test-Pfad + Failure Signal>",
  tags       = ["tdd-impl-loop", "bugfix", "<Modul>"],
  importance = 8,
  ttl_days   = 180,
  is_global  = False,
  facts      = '["Root cause: <...>", "Fix: <...>", "Test: <...>"]',
)
```

---

### `convention` — Neue Konvention erkannt

Nur aufrufen wenn die Konvention in mehr als einem Consumer-Repo relevant ist.

```python
memory_save(
  type       = "convention",
  title      = "<Bereich>: <Konvention in einem Satz>",
  content    = "<vollständige Beschreibung der Konvention>",
  why        = "<warum diese Konvention — nicht nur 'so haben wir es gemacht'>",
  how_to_apply = "<wann und wo gilt sie — Scope>",
  tags       = ["tdd-impl-loop", "convention", "<betroffener Bereich>"],
  importance = 6,
  ttl_days   = 365,
  is_global  = True,           # global: gilt repo-übergreifend
  concepts   = "<betroffene Konzepte, comma-separated>",
)
```

---

### `ruled_out` — Bewusst ausgeschlossen

```python
memory_save(
  type       = "ruled_out",
  title      = "<was>: bewusst nicht implementiert in <task_slug>",
  content    = "<was ausgeschlossen wurde und warum>",
  why        = "<Grund — Scope, Risk, fehlende Deps, HITL-Entscheidung>",
  how_to_apply = "<unter welchen Bedingungen könnte es doch umgesetzt werden>",
  tags       = ["tdd-impl-loop", "ruled-out", "<Modul>"],
  importance = 5,
  ttl_days   = 60,
  is_global  = False,
)
```

---

### `guardrail` — Stop-Bedingung ausgelöst

Nur aufrufen wenn die Bedingung in zukünftigen Sessions vermieden werden sollte.

```python
memory_save(
  type       = "guardrail",
  title      = "BLOCKED: <was hat den Stop ausgelöst>",
  content    = "<genaue Bedingung + Kontext>",
  why        = "<warum ist das ein Guardrail — nicht nur 'es hat nicht funktioniert'>",
  how_to_apply = "<wann gilt dieser Guardrail — erkennbare Bedingung>",
  context    = "Phase: <Phasenname> / result: blocked",
  tags       = ["tdd-impl-loop", "guardrail", "<Auslöser-Kategorie>"],
  importance = 9,             # höchste Priorität
  ttl_days   = 180,
  is_global  = True,          # global: auch für andere Loops relevant
)
```

**Auslöser-Kategorien für Tags:**
`scope-violation`, `auth-required`, `no-test-surface`, `regression-fail`, `3x-impl-fail`, `hitl-required`, `cross-repo-scope`

---

### `error_pattern` — 3x FAIL ohne Root Cause

```python
memory_save(
  type       = "error_pattern",
  title      = "<Symbol/Datei>: 3x impl-fail — root cause unknown",
  content    = "<was wurde versucht — alle 3 Versuche explizit>",
  why        = "<was die Diagnose bisher ergeben hat — oder 'unresolved'>",
  how_to_apply = "Starte nächsten Anlauf mit diagnostic-feedback-loop, nicht mit Impl",
  symbol     = "<betroffenes Symbol>",
  file_path  = "<betroffene Datei>",
  context    = "Failing check: <Test-Pfad + letztes Failure Signal>",
  tags       = ["tdd-impl-loop", "error-pattern", "impl-fail", "<Modul>"],
  importance = 9,
  ttl_days   = 90,
  is_global  = False,
  narrative  = "<Freitext: Was wurde beobachtet, was ist unklar>",
)
```

---

### `project` — Closure + Next Gate (Phase 7, immer)

```python
memory_save(
  type       = "project",
  title      = "<task_slug>: closure <YYYY-MM-DD>",
  content    = "<closure_summary — 2-5 Sätze: was gemacht, was Ergebnis, was offen>",
  why        = "tdd-impl-loop Phase 7 closure record",
  how_to_apply = "Nächste Session: lies diesen Record via memory_search vor Phase 1",
  context    = "next_gate: <konkreter Pointer oder 'none'>",
  tags       = ["tdd-impl-loop", "closure", "<task_class>", "<result>"],
  importance = 6,
  ttl_days   = 30,             # kurze TTL — wird von nächster Closure überschrieben
  is_global  = False,
  facts      = '["result: <pass|partial|blocked|failed>", "evidence: evidence/loop-runs/<slug>/", "phases: <Phasen-Übersicht>"]',
)
```

---

## Tags-Konvention

Alle tdd-impl-loop memory_save Calls haben mindestens diese Tags:

```
["tdd-impl-loop", "<type>", "<modul-oder-bereich>"]
```

Zusätzliche Tags nach Bedarf:
- `<task_class>` — `implementation`, `bugfix`, `contract-change`, `docs`, `validation`
- `<result>` — `pass`, `partial`, `blocked`, `failed`
- `token-savior` — wenn die Observation die MCP-Nutzung selbst betrifft

---

## Importance-Skala (1–10)

| Wert | Bedeutung | Typen |
|---|---|---|
| 9–10 | Blocker / Guardrail — immer zuerst lesen | `guardrail`, `error_pattern` |
| 7–8 | Entscheidung oder Bugfix mit Wiederholungsrisiko | `decision`, `bugfix` |
| 5–6 | Nützlich aber nicht kritisch | `convention`, `ruled_out`, `project` |
| 1–4 | Hintergrund, Recherche, Ideen | `note`, `research`, `idea` |

---

## TTL-Profil

| TTL | Bedeutung |
|---|---|
| 30 Tage | Kurzlebige Closure-Records — überschrieben bei nächster Session |
| 60 Tage | Temporäre Ausschlüsse — Scope-Entscheidungen die sich ändern können |
| 90 Tage | Technische Entscheidungen eines Slices |
| 180 Tage | Bugfixes und Guardrails die Monate relevant bleiben |
| 365 Tage | Konventionen die repo-übergreifend gelten |

Kein TTL setzen = kein Ablaufdatum (persistiert unbegrenzt).
Nur für Konventionen mit hoher Stabilität verwenden.

---

## is_global Entscheidungsregel

```
is_global = True   wenn:
  - die Observation in anderen Repos oder anderen Loops relevant ist
  - Typen: convention, guardrail

is_global = False  wenn:
  - die Observation nur für dieses Repo / diesen Task gilt
  - Typen: decision, bugfix, ruled_out, error_pattern, project
```

---

## Minimalaufruf (wenn Zeit knapp)

Wenn nur Phase 7 einen Call erlaubt:

```python
memory_save(
  type       = "project",
  title      = "<task_slug>: closure <YYYY-MM-DD>",
  content    = "<closure_summary>",
  tags       = ["tdd-impl-loop", "closure"],
  importance = 6,
  ttl_days   = 30,
)
```

Dieser eine Call ist besser als kein Call.
