# Prompt Template — loop repo v0.1

Dieses Template erzeugt immer drei Sektionen:

1. **Task Start** — Rahmen setzen
2. **Arbeitsblock** — 3–7 konkrete, erlaubte Schritte
3. **Task Closure** — Abschlussbericht

---

## Template

```text
# Task Start

Name:
Baum-OS Repo Workloop für <repo-name>

Ziel:
Repo <repo-name> kontrolliert einlesen und einen sicheren Arbeitsblock erzeugen.

Modus:
<read-only | docs-only | implementation | validation | review>

Scope:
Nur <repo_path> und zulässige Frontdoor-/Governance-/Log-Dateien.

Boundaries:
- Keine Dateiänderungen im Zielrepo
- Keine Commits
- Keine Secrets, Auth, Credentials
- Kein Deployment
- Keine Runtime-Ausführung
- Kein Cross-Repo-Scope

Done-Kriterium:
<klarer messbarer Endzustand>

# Arbeitsblock

1. <erlaubter Schritt>
2. <erlaubter Schritt>
3. <erlaubter Schritt>
4. <optional>
5. <optional>
6. <optional>
7. <optional>

# Checkpoints

Nur verwenden, wenn Risiko besteht:
- Dirty State erkannt → klassifizieren oder blocked
- Auth/Secrets/Credentials erforderlich → blocked
- Runtime-Ausführung erforderlich → blocked
- Deployment-Scope erkannt → blocked
- Cross-Repo-Auswirkung erkannt → blocked
- Slice Closure offen → partial

# Stop-Regeln

Stoppe mit blocked, wenn:
- <spezifische Bedingung aus stop-rules.md>
- <spezifische Bedingung aus stop-rules.md>
- <spezifische Bedingung aus stop-rules.md>

# Task Closure

Result:
pass | partial | blocked | failed

Owner / Scope:
<repo + betroffene Surface>

Files Read:
- <Datei 1>
- <Datei 2>

Files Changed:
none (v0.1 read-only)

Verification:
<Checks / manuelle Prüfung / Evidence>

Risks / Gaps:
<offene Punkte>

Status:
clean | dirty | uncommitted | waiting for decision
```

---

## Regeln für Template-Verwendung

- Arbeitsblock muss exakt 3–7 nummerierte Schritte enthalten
- Jeder Schritt ist eine einzelne, erlaubte Aktion
- Keine Weiterarbeit ohne Nutzerimpuls
- `Files Changed` ist in v0.1 immer `none`
- `Risks / Gaps` immer befüllen — auch wenn leer: `keine bekannten Risiken`
- Checkpoints weglassen, wenn kein Risiko besteht

---

## Schritt-Auswahl für den Arbeitsblock

Der Loop wählt 3–7 Schritte aus diesen sieben Möglichkeiten:

```text
1. Prüfe, ob <path> existiert und ein Repo oder Projektordner ist.
2. Lies die lokalen Einstiegspunkte: README.md, AGENTS.md, docs/,
   Package-/Test-Metadaten, Governance-Dateien.
3. Suche nach offenen Logs, Closure-Berichten, Evidence Contracts
   und lokalen Arbeitsregeln.
4. Klassifiziere den Repo-Zustand: clean | dirty | unknown | blocked.
5. Klassifiziere die wahrscheinliche Task-Klasse:
   docs-only | implementation | validation | runtime | deployment | review | unknown.
6. Erzeuge einen begrenzten Arbeitsblock mit klaren Grenzen, Stop-Regeln
   und Done-Kriterium.
7. Schreibe den finalen Prompt für Codex, Claude oder Pi.
```
