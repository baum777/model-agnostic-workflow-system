# Stop-Regeln — loop repo v0.1

Fail-closed. Kein Arbeitsblock ohne sicheren Konsens.

## `blocked` — Loop muss abbrechen

Stoppe mit `blocked`, wenn:

- der Repo-Pfad nicht existiert
- keine sinnvolle Frontdoor gefunden wird (`README.md`, `AGENTS.md`, `docs/` fehlen oder unleserlich)
- das Repo dirty ist und der Dirty State nicht klassifizierbar ist
- Secrets, Auth, Credentials, Deployment oder Runtime-Zugriff nötig wäre
- Cross-Repo-Arbeit nötig wäre
- der User-Scope zu breit ist, um in 3–7 Schritten abgrenzbar zu sein
- eine Dateiänderung nötig wäre (v0.1 ist strikt read-only)
- Evidence fehlt, aber für eine Behauptung zwingend nötig wäre
- das Done-Kriterium nicht prüfbar ist

## `partial` — Loop darf mit Annahmen enden

Stoppe mit `partial`, wenn:

- nur ein Teil der relevanten Dateien lesbar ist
- die Task-Klasse unsicher bleibt, aber eingegrenzt werden kann
- ein Arbeitsblock möglich ist, aber mit klar markierten Annahmen versehen wird

## `failed` — Loop kann nicht starten

Stoppe mit `failed`, wenn:

- Repo-Pfad nicht angegeben
- Repo-Pfad syntaktisch ungültig
- Basisanalyse auch nach Frontdoor-Suche unmöglich

## Blockierte Begriffe (Negativliste)

Diese Begriffe dürfen im generierten Workblock und in positiven Arbeitsanweisungen nicht erscheinen.
Sie sind hier und in `validator-spec.md` ausschließlich als Negativliste erlaubt.

```text
Next smallest step
Next safe gate
automatically proceed
continue until everything is done
read .env
deploy automatically
commit all changes
```

Vorkommen als positive Regel → Workblock gilt als ungültig gemäß `validator-spec.md`.

## Nicht-Ziele v0.1

Dieser Loop darf niemals:

- Dateien im Zielrepo ändern
- Commits erstellen
- Secrets lesen
- `.env`-Dateien öffnen
- Deployments starten
- externe APIs ausführen
- Cross-Repo-Scope erweitern
- automatisch Runtime-Claims machen
