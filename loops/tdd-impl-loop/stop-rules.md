# Stop-Regeln — tdd-impl-loop v0.1

Fail-closed. Kein Schritt ohne explizites Gate.

---

## Globale Stop-Bedingungen (jede Phase)

Stoppe sofort mit `blocked`, wenn:

- Scope-Boundary wurde verletzt (Schreibzugriff außerhalb des deklarierten Scope)
- Auth, Secrets, Credentials oder `.env`-Dateien werden benötigt
- Deployment oder Runtime-Ausführung außerhalb der lokalen Testumgebung nötig wäre
- Cross-Repo-Writes ohne explizite Freigabe nötig wären
- Ein HITL-Punkt erreicht wurde und keine Freigabe vorliegt
- Die Done-Kriterien aus Phase 3 nicht prüfbar sind

---

## Phase-spezifische Stop-Bedingungen

### Phase 1 — INTAKE

`blocked` wenn:
- Scope nicht auf eine einzelne Session begrenzbar
- Kein `README.md`, `AGENTS.md` oder `docs/`-Frontdoor lesbar
- Task-Description enthält widersprüchliche Ziele

`failed` wenn:
- Kein `task_description` übergeben
- Repo-Pfad nicht existent (wenn angegeben)

---

### Phase 2 — EINORDNUNG

`blocked` wenn:
- `risk_level: blocked` — Risiko nicht eingrenzbar
- Affected Surfaces können nicht auf bekannte Dateipfade gemappt werden
- Task-Class ist `unknown` und kein Routing möglich

`HITL-Pause` wenn:
- `execution_mode: HITL` erkannt — warten auf explizite Freigabe

---

### Phase 3 — PLANUNG

`blocked` wenn:
- Acceptance Criteria nicht messbar oder reviewbar
- Ungeklärte Dependencies auf externe Systeme
- Mehr als 5 Waves nötig (Scope zu groß — aufteilen)

---

### Phase 4 — TEST SCHREIBEN

`blocked` wenn:
- Kein ausführbares Test-Surface existiert (kein Test-Runner, keine Fixtures)
- Test kann nicht ohne externe Services ausgeführt werden
- Failure Signal kann nicht erzeugt oder beobachtet werden

`SKIP` wenn:
- `task_class: docs` aus Phase 2 gesetzt — Phase 4 wird übersprungen, dokumentiert als `SKIP`

---

### Phase 5 — CODE UMSETZEN

`blocked` wenn:
- Fokussierter Test schlägt nach 3 Implementierungsversuchen weiterhin FAIL
  → Stoppe, übergib an `core/skills/diagnostic-feedback-loop/SKILL.md`
- Regression Gate FAIL — andere Tests brechen
- Notwendige Änderung überschreitet `scope_boundary`

Regel für 3+ fehlgeschlagene Implementierungsversuche:
```text
→ Stoppe Implementierung
→ Wechsle zu diagnostic-feedback-loop
→ Ergebnis als BLOCKED dokumentieren
→ Phase 7 (Closure) mit result: blocked ausführen
```

---

### Phase 6 — DOKUMENTATION

`blocked` wenn:
- `Applied` Einträge ohne `Verified` Gegenstücke
- `evidence/loop-runs/<slug>/` kann nicht geschrieben werden

---

### Phase 7 — RUN ABSCHLUSS

`failed` wenn:
- `closure.md` kann nicht geschrieben werden

`partial` wenn:
- Nicht alle Phasen erfolgreich — aber Closure trotzdem möglich
- Explizit dokumentieren welche Phasen `SKIP`, `BLOCKED` oder `FAIL` sind

---

## Blockierte Begriffe

Diese Begriffe dürfen im generierten Loop-Output nicht als positive Arbeitsanweisung erscheinen:

```text
automatically proceed
continue until everything is done
commit all changes
read .env
deploy automatically
Next smallest step
Next safe gate
fix everything
just try it
```

---

## Nicht-Ziele v0.1

Dieser Loop darf niemals:

- Außerhalb des deklarierten `scope_boundary` schreiben
- Secrets, `.env`-Dateien oder Credentials lesen
- Deployments starten
- Externe APIs ohne explizite Freigabe aufrufen
- Mehrere Slices gleichzeitig ausführen
- Tests abschwächen oder rewritten um einen PASS zu erzwingen
- Regression Gates überspringen um schneller zu sein
