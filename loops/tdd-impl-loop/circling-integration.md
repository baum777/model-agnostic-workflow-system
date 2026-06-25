# Circling Integration — tdd-impl-loop

Version: v0.1
Status: canonical
Betrifft: Phase 1 (INTAKE), Phase 6 (DOCS), Phase 7 (CLOSURE)
Circling-Root: `~/circling/`

---

## Was ist ~/circling/

Eine persönliche Haltebahn (BAUM-OS-Ebene) für Items die noch nicht bereit
für `priorities/` sind aber nicht vergessen werden sollen.

Kategorien:

| Ordner | Inhalt |
|---|---|
| `ideas/` | Rohe Impulse und Ansätze |
| `decisions/` | Offene Entscheidungen |
| `patterns/` | Wiederkehrende Probleme |
| `tensions/` | Ungeklärte Spannungen zwischen Ansätzen |
| `next-projects/` | Projekt-Seeds |
| `questions/` | Offene Fragen |

---

## Welche Circling-Dateien in welcher Phase eingebunden werden

### Phase 1 — INTAKE

Circling-Items die **task-relevant** sind, werden in den Prior Context geladen.

**Via token-savior (primär):**

```
memory_search(query="<task_description>", type_filter="idea|decision|note")
  → Circling-Items die bereits via memory_save gespiegelt wurden
```

**Via direktem File-Read (fallback, wenn nicht in memory):**

Erlaubte Reads in Phase 1:

| Kategorie | Wann lesen |
|---|---|
| `~/circling/patterns/` | Immer — Pattern-Matches verhindern bekannte Sackgassen |
| `~/circling/decisions/` | Wenn task eine Entscheidung tangiert |
| `~/circling/tensions/` | Wenn task eine bekannte Architektur-Spannung berührt |
| `~/circling/questions/` | Wenn task eine offene Frage beantworten könnte |
| `~/circling/ideas/` | Nicht in Phase 1 — zu viel Noise |
| `~/circling/next-projects/` | Nicht in Phase 1 |

**Was aus Circling in den Intake Record fließt:**

```json
{
  "prior_context": {
    "patterns": ["<Pattern-Name wenn relevant>"],
    "open_decisions": ["<Entscheidungs-Titel wenn relevant>"],
    "tensions": ["<Spannungs-Titel wenn relevant>"],
    "source": "circling | memory | none"
  }
}
```

---

### Phase 6 — DOCS (Circling-Aktionen nach Implementierung)

Nach einem erfolgreichen Slice gibt es drei mögliche Circling-Aktionen:

#### 6a — Item landet (promote to priority oder close)

Wenn der Slice eine offene Circling-Entscheidung oder -Frage beantwortet:

```markdown
# In der Circling-Datei:
Status: landed
Verlauf:
- <YYYY-MM-DD>: Landed via tdd-impl-loop <task_slug> — <kurze Begründung>
```

```python
# In token-savior:
memory_save(
  type       = "decision",
  title      = "<Circling-Titel>: landed",
  content    = "<was entschieden oder beantwortet wurde>",
  why        = "<durch welchen Slice>",
  tags       = ["tdd-impl-loop", "circling-landed", "<Kategorie>"],
  importance = 7,
  ttl_days   = 90,
)
```

#### 6b — Neues Item entsteht (aus Out-of-Scope oder Beobachtung)

Wenn die Implementierung etwas Neues aufdeckt das nicht in diesen Slice gehört:

```markdown
# Neue Datei in ~/circling/<kategorie>/<slug>.md
Status: circling
Quelle: tdd-impl-loop <task_slug>
Datum: <YYYY-MM-DD>
```

```python
# In token-savior spiegeln:
memory_save(
  type       = "idea" | "note" | "decision",
  title      = "<was aufgedeckt wurde>",
  content    = "<Beschreibung>",
  context    = "Quelle: tdd-impl-loop <task_slug>, Phase 6",
  tags       = ["tdd-impl-loop", "circling", "<Kategorie>"],
  importance = 5,
  ttl_days   = 60,
)
```

#### 6c — Pattern bestätigt

Wenn ein bekanntes Pattern aus `~/circling/patterns/` in diesem Slice wieder auftrat:

```markdown
# In der Pattern-Datei:
Aufgetreten: <N+1> mal
Verlauf:
- <YYYY-MM-DD>: Wieder in <task_slug> — <Kontext>
```

```python
memory_save(
  type       = "error_pattern",
  title      = "<Pattern-Name>: wieder aufgetreten",
  content    = "<Kontext dieses Auftretens>",
  tags       = ["tdd-impl-loop", "circling", "pattern-confirmed"],
  importance = 8,
  ttl_days   = 90,
)
```

---

### Phase 7 — CLOSURE (Circling-Summary)

Am Ende jedes Loops wird geprüft:

1. **Items promoted?** → Liste in closure.md aufnehmen
2. **Neue Items entstanden?** → Liste in closure.md aufnehmen
3. **Patterns bestätigt?** → Liste in closure.md aufnehmen

```markdown
# Im closure.md:

## Circling-Aktionen
- Landed: <Titel> (→ priorities/ oder closed)
- Neu angelegt: <Titel> (~/circling/<kategorie>/<slug>.md)
- Pattern bestätigt: <Pattern-Name> (Auftritte: N)
- Keine Circling-Aktionen
```

---

## Pflege-Rhythmus: Circling × BAUM-OS

| Zeitpunkt | Circling-Aktion |
|---|---|
| `/start` einer Session | Phase 1: patterns/ und decisions/ scannen wenn task-relevant |
| Phase 6 nach PASS | Aktionen 6a / 6b / 6c |
| `/weekly-review` | Alle Items prüfen: landen / fallen / weitercirceln |
| Neues Item entsteht | Sofort in passende Kategorie schreiben + memory_save |

---

## Welche Circling-Dateien NICHT in den Loop fließen

| Datei / Ordner | Grund |
|---|---|
| `~/circling/ideas/` | Zu unstrukturiert für Phase 1 — nur via `/weekly-review` |
| `~/circling/next-projects/` | Nicht task-relevant während Implementierung |
| Items mit `Status: dropped` | Nicht mehr relevant |
| Items mit `Status: landed` | Abgeschlossen — nicht nochmal laden |

---

## memory_save-Typen für Circling

| Circling-Kategorie | Empfohlener memory_save type |
|---|---|
| `ideas/` | `idea` |
| `decisions/` | `decision` |
| `patterns/` | `error_pattern` |
| `tensions/` | `warning` |
| `next-projects/` | `idea` + tag `next-project` |
| `questions/` | `note` |

---

## Verweise

- Circling Root: `~/circling/README.md`
- memory_save Schema: `memory-save-schema.md`
- Loop Contract: `command-contract.md`
- BAUM-OS Weekly Review: `~/workspace/baum-os/commands/weekly-review.md`
