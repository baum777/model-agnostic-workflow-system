# Local Obsidian / LLM-Wiki Audit Log

## 1. Result
- Status: partial
- Kurzfazit: Observed: Der geprüfte Root ist kein technisch erkennbarer Obsidian-Vault-Root, weil keine `.obsidian/`-Konfiguration und keine Obsidian-Wikilinks `[[...]]` gefunden wurden. Observed: Der Root ist ein governance-orientiertes Markdown-/Workflow-Repository mit 202 Markdown-Dateien und klaren logischen Authority-Klassen. Observed: Die wichtigsten Wissensbereiche sind Governance/Authority, portable Skills, Kompatibilitäts-Skills, Verträge, Provider-Exports, Runtime/Memory, Templates, Beispiele und repo-spezifische Skill-Bibliotheken. Inferred: Als lokales LLM-Wiki eignet sich die Struktur gut, wenn Authority-Klasse, Quelle, Ableitung und Privatheit weiterhin getrennt bleiben. Inferred: Der größte Struktur-Risikobereich ist nicht fehlendes Material, sondern Vermischung von canonical/operational/derived/archive in denselben physischen Zonen. Verified: Der vorhandene Secret-Scanner meldete keine Secret-Funde. BLOCKED: Eine endgültige Obsidian-Zielstruktur oder automatische Reorganisation ist nicht ableitbar, ohne menschliche Entscheidungen zu Privatheit, Vault-Scope und Kanonizität.
- Was wurde geprüft? Root-Struktur, Markdown-Dateipfade, Hauptordner, vorhandene Index-/Playbook-/Template-/Example-/Skill-/Memory-Flächen, Authority-Dokumente, Obsidian-Indikatoren, Secret-Scan-Ergebnis und vorhandene Audit-/Skill-Analyse-Skripte.
- Was wurde nicht geprüft? Kein vollständiger semantischer Review jeder Markdown-Zeile, kein Review aller JSON-/JS-/TS-Inhalte, keine Prüfung externer Repositories, keine Live-Obsidian-Konfiguration, keine `.git/`-Historie und keine lokalen Codex-App-State-Inhalte unter `.codex/`.

## 2. Scope
- Root-Pfad / Vault-Pfad: `/home/baum/Schreibtisch/workspace/main_projects/model-agnostic-workflow-system`
- Gelesene Hauptordner: `.agents/skills/`, `core/`, `docs/`, `skills/`, `memory/`, `templates/`, `examples/`, `repo-skill-libraries/`, `contracts/`, `providers/`, `evals/`, `scripts/tools/`, `policies/`, `runtime/`.
- Nicht gelesene oder ausgelassene Bereiche: `.git/`, `.codex/`, vollständige `node_modules`-ähnliche externe Abhängigkeiten (nicht vorhanden im Scan), vollständige Quellcode-Implementierungen unter `runtime/`, `scripts/tools/` und `templates/discord-fetch-mcp/src/`, vollständige große JSON-Vertragsflächen.
- Gründe für Auslassungen: `.git/` und `.codex/` sind lokale Tool-/Historienflächen und nicht erforderlich für das Markdown-Struktur-Audit. Code und JSON wurden strukturell erfasst, aber nicht zeilenweise auditiert, weil der Auftrag Obsidian-/Markdown-Struktur fokussiert. Sensible Inhalte sollten nicht übernommen werden; deshalb wurden nur Kategorien, Pfade und Scanner-Ergebnisse verwendet.

## 3. Existing Structure Map

```text
model-agnostic-workflow-system/
  AGENTS.md                         # Zweck erkennbar: root operating contract; menschlich/gepflegt; stabil/canonical
  README.md                         # Zweck erkennbar: Frontdoor; menschlich/gepflegt; stabil/canonical
  WORKFLOW.md                       # Zweck erkennbar: workflow entry; menschlich/gepflegt; stabil/canonical
  CHANGELOG.md                      # Zweck erkennbar: Verlauf; menschlich/gepflegt; archive
  .agents/
    skills/                         # Zweck erkennbar: repo-lokale Control-Plane-Skills; gemischt; stabil
      workflow-core-router/
      skill-tool-mcp-builder/
      skill-creator-orchestrator/
  .codex/                           # Zweck unklar im Audit; lokale App-/Tool-State-Fläche; ausgelassen
  .codex-plugin/                    # Zweck erkennbar: Plugin-Metadaten; maschinen-/agentennah; stabil
  artifacts/
    runtime-runs/                   # Zweck erkennbar: generierte Runtime-Evidenz; agent-/tool-generiert; experimentell/lokal
  contracts/                        # Zweck erkennbar: Compatibility-Mirrors; maschinenlesbar; redundant-by-design
  core/
    contracts/                      # Zweck erkennbar: canonical machine-readable contracts; stabil/canonical
    skills/                         # Zweck erkennbar: portable shared skills; gemischt; stabil
    evals/                          # Zweck erkennbar: core eval notes; stabil
    overlays/                       # Zweck erkennbar: overlay boundary notes; stabil
  docs/
    governance/                     # Zweck erkennbar: source hierarchy and external portfolio boundary; stabil/canonical
    mcp/                            # Zweck erkennbar: MCP policy; stabil/canonical
    workflows/                      # Zweck erkennbar: workflow class deep dives; stabil/canonical
    tool-contracts/                 # Zweck erkennbar: compatibility/export catalog; redundant-by-design
    ui-ux-composition/              # Zweck erkennbar: branch taxonomy, modules, policies, examples; gemischt/derived
    *.md                            # Zweck gemischt: canonical, operational, derived, archive in one physical docs zone
  evals/
    fixtures/                       # Zweck erkennbar: deterministic eval fixtures; maschinenlesbar; stabil/testnah
    README.md                       # Zweck erkennbar: eval entrypoint; operational
  examples/
    codex-workflow/                 # Zweck erkennbar: derived workflow examples; stabil/derived
    mahp/ rgc/ tsc/ snake/          # Zweck erkennbar: examples and small runnable reference app; derived/gemischt
  memory/
    README.md
    MEMORY_CONTRACT.md
    policies/                       # Zweck erkennbar: memory policies; operational
    scopes/                         # Zweck erkennbar: operator/project/runtime/decision scopes; privatheitsrelevant
    schemas/                        # Zweck erkennbar: memory schemas; maschinenlesbar
    stores/jsonl/                   # Zweck erkennbar: local-only store skeleton; experimentell
  policies/                         # Zweck erkennbar: machine-readable policy layer; stabil/canonical-linked
  providers/                        # Zweck erkennbar: provider exports and compatibility adapters; redundant-by-design
  repo-skill-libraries/
    organoid-symbionts/
    sparkfined-tradeapp/            # Zweck erkennbar: derived repo-specific skill libraries; importiertes Projektwissen
  runtime/                          # Zweck erkennbar: local runtime implementation and validators; tool/code, not wiki-first
  scripts/
    tools/                          # Zweck erkennbar: validators/builders/scanners; tool authority
  skills/                           # Zweck erkennbar: legacy compatibility and shared skills; gemischt/redundant-by-design
  templates/
    codex-workflow/                 # Zweck erkennbar: workflow artifact templates; operational
    discord-fetch-mcp/              # Zweck erkennbar: MCP template bundle; template/source mix
    qwen-bootstrap/                 # Zweck erkennbar: bootstrap template with .qwen resources; template/agent config mix
  tests/                            # Zweck erkennbar: runtime tests; code/test, not wiki-first
```

Observed Markdown-Verteilung nach Top-Level:

| Bereich | Markdown-Dateien |
| --- | ---: |
| `docs/` | 73 |
| `repo-skill-libraries/` | 31 |
| `skills/` | 23 |
| `core/` | 21 |
| `templates/` | 18 |
| `memory/` | 11 |
| `providers/` | 10 |
| `examples/` | 8 |
| `.agents/` | 3 |
| `evals/`, `contracts/`, Root-Dateien | 5 |

## 4. Knowledge Domain Map

| Bereich | Vermuteter Zweck | Inhaltstyp | Stabilität | Risiko | Empfehlung |
| --- | --- | --- | --- | --- | --- |
| `AGENTS.md`, `WORKFLOW.md`, `README.md` | Einstieg, Governance, Workflow-Reihenfolge | Projektwissen / Playbook / Entscheidungsrahmen | stabil | Wird als Obsidian-Notiz missverstanden statt als Authority | Als canonical Frontdoor belassen |
| `docs/architecture.md`, `docs/authority-matrix.md` | Authority, Klassen, Statusledger | Projektwissen / Entscheidungsnotiz | stabil | Physische und logische Ordnung könnten verwechselt werden | Für Wiki als Authority-Referenz geeignet |
| `docs/governance/` | Source hierarchy und externe Portfolio-Grenze | Projektwissen / Playbook | stabil | Externe Portfolio-Regeln könnten importiert statt referenziert werden | Nur Pointer übernehmen, keine externen Inhalte kopieren |
| `docs/mcp/` | MCP Policy und Boundary | Playbook / Projektwissen | stabil | Tool-/MCP-Claims könnten über Runtime hinausgehen | Als canonical policy behalten |
| `docs/workflows/` | Workflow-Deep-Dives | Playbook | stabil | Doppelte Workflow-Regeln möglich, wenn Root nicht beachtet wird | Als Wiki-Runbook-Zone geeignet |
| `docs/ui-ux-composition/` | UI/UX Branch Taxonomie, Module, Policies, Beispiele | Wiki / Playbook / Beispiel / Output | gemischt | Derived/advisory Material könnte canonical wirken | Gute LLM-Wiki-Zone mit klarer Derived-Markierung |
| `docs/model-agnostic-core-prompt-system.md` | Zielzustand für Prompt-Core | Prompt / Projektwissen / Entwurf | stabil, aber lang | Sehr lange Sammeldatei mit Architektur, Prompt, Policy und Template-Anteilen | Menschlich kuratieren, ggf. später in referenzierte Wissensseiten splitten |
| `core/contracts/` | Kanonische maschinenlesbare Verträge | Quelle / Vertrag | stabil | JSON kann als Wiki-Prosa schwer nutzbar sein | Als raw/canonical source referenzieren, nicht paraphrasieren |
| `core/skills/` | Portable Skills | Playbook / wiederverwendbarer Inhalt | stabil | Skill-Text kann mit operational docs doppeln | Gute LLM-Wiki-Basis mit Contract-Linking |
| `skills/` | Legacy/shared compatibility skills | Playbook / wiederverwendbarer Inhalt | redundant-by-design | Compatibility kann mit portable core verwechselt werden | Nur mit Status "compatibility" in Wiki indexieren |
| `.agents/skills/` | Repo-lokale Routing-/Control-Skills | Playbook / Agent-generated policy surface | stabil lokal | Lokale Orchestration könnte als portable Skill missverstanden werden | Separat als local-only markieren |
| `memory/` | Lokale Memory-Skeleton-Zone | Log / persönliche Notiz / Projektwissen / Entscheidungskandidat | experimentell | Operator-/Projekt-/Runtime-Wissen kann vermischen | Nur nach Privacy-Review für Wiki nutzen |
| `templates/codex-workflow/` | Wiederverwendbare Workflow-Artefaktvorlagen | Template / Output | stabil | Templates könnten als ausgefüllte Reports verwechselt werden | Gute Wiki-Referenz für Output-Formate |
| `examples/codex-workflow/` | Repräsentative Beispiele | Beispiel / Output | derived | Beispiele könnten als Authority verwendet werden | Als Beispielzone mit Warnhinweis geeignet |
| `templates/discord-fetch-mcp/` | MCP-Server-Template | Quelle / Template / Prompt-nah | experimentell/stabil | Enthält `.env.example` und template-spezifische Codeflächen | Nicht automatisch in Wiki übernehmen; nur README/Boundary |
| `templates/qwen-bootstrap/` | Qwen Bootstrap-Ressourcen und Skills | Prompt / Playbook / Agent config | experimentell | `.qwen`-Template kann mit lokaler Live-Konfiguration verwechselt werden | Nur als template/raw kennzeichnen |
| `repo-skill-libraries/` | Aus lokalen Repos abgeleitete Skill-Bibliotheken | Projektwissen / Quelle / abgeleitete Zusammenfassung | gemischt | Importiertes Projektwissen kann privat oder veraltet sein | Nur nach Human-Review ins Wiki aufnehmen |
| `providers/` | Provider-Bundles und Adapter | Output / Quelle / Kompatibilitätsfläche | redundant-by-design | Provider exports als canonical missverstanden | Im Wiki als generated/export klassifizieren |
| `contracts/` | Compatibility Mirrors | Quelle / abgeleitete Zusammenfassung | redundant-by-design | Doppelte Wahrheit neben `core/contracts/` | Nur als mirror verlinken |
| `evals/` | Fixtures und Eval-Index | Quelle / Test / Log-nahe Evidenz | stabil | Fixtures mit synthetischen Secrets können falsch interpretiert werden | Als test evidence/raw behandeln |
| `scripts/tools/` | Validatoren, Scanner, Builder | Playbook / Tool / Quelle | stabil | Tool-Output kann mehr Authority haben als Prosa | Tool-Evidenz im Wiki getrennt führen |
| `artifacts/runtime-runs/` | Generierte Runtime-Evidenz | Log / Output | lokal/experimentell | Logs können sensible Details oder unreviewed state enthalten | Standardmäßig privat/raw halten |

## 5. Candidate LLM-Wiki Areas

| Kandidat | Warum geeignet? | Benötigte Klärung | Priorität |
| --- | --- | --- | --- |
| `docs/README.md` + `README.md` | Bereits Navigations- und Frontdoor-Funktion | Soll das LLM-Wiki Repo-Frontdoor oder eigene Wiki-Frontdoor bekommen? | hoch |
| `docs/architecture.md` + `docs/authority-matrix.md` | Klare Authority- und Klassenlogik | Soll die Wiki-Indexierung Authority-Klassen als Pflichtmetadaten übernehmen? | hoch |
| `docs/workflows/` | Saubere Playbook-/Runbook-ähnliche Deep-Dives | Welche Workflow-Klassen sollen zuerst indexiert werden? | hoch |
| `core/skills/` | Portable, wiederverwendbare Skills mit Metadaten | Soll nur `core/skills/` canonical sein und `skills/` als compatibility erscheinen? | hoch |
| `templates/codex-workflow/` | Wiederverwendbare Artefaktformen | Sollen Templates als Output-Contracts oder als praktische Schreibvorlagen erscheinen? | mittel |
| `examples/codex-workflow/` | Konkrete Beispiele für Plan/Review/Handoff | Wie stark sollen Beispiele gegen Authority-Flächen abgegrenzt werden? | mittel |
| `docs/ui-ux-composition/` | Reiche Wissensdomäne mit Modulen, Policies, Testfällen | Derived/advisory Status muss sichtbar bleiben | mittel |
| `memory/policies/` und `memory/scopes/` | Gute Grundlage für lokales Memory-/LLM-Wiki-Regelwerk | Was ist privat, was darf agentisch verarbeitet werden? | mittel |
| `repo-skill-libraries/` | Wertvolle projektbezogene Skill-Landkarten | Eigentümer, Privatheit und Aktualität der importierten Repo-Erkenntnisse prüfen | niedrig bis mittel |
| `docs/model-agnostic-core-prompt-system.md` | Umfangreicher Prompt-Core-Zielzustand | Muss als canonical design contract, nicht als Live-Bundle, indexiert werden | mittel |

## 6. Separation Issues

### Befund 1
- Datei/Ordner: `docs/`
- Problem: Canonical, operational, derived und archive Markdown-Dateien liegen physisch im selben Ordner. Die Klasse ist über `Class:` und `Use rule:` dokumentiert, aber nicht physisch getrennt.
- Risiko: Ein LLM-Wiki oder Mensch könnte abgeleitete oder archivierte Inhalte als aktuelle Authority behandeln.
- Empfohlene Klärungsfrage: Soll das spätere Wiki die bestehende logische Klasse als Metadatum erzwingen, statt physische Ordner umzubauen?

### Befund 2
- Datei/Ordner: `docs/model-agnostic-core-prompt-system.md`
- Problem: Sehr lange Sammeldatei mit Zielzustand, Architektur, Prompt-System, Policies, Templates und visueller Mapping-Sektion.
- Risiko: Unterschied zwischen canonical design contract, Prompt-Entwurf und zukünftiger Umsetzung kann verschwimmen.
- Empfohlene Klärungsfrage: Welche Abschnitte sind kanonischer Zielzustand und welche sind nur Implementierungs- oder Prompt-Bausteine?

### Befund 3
- Datei/Ordner: `docs/qwen-3-6-intro.md`, `templates/qwen-bootstrap/`
- Problem: Provider-/Umgebungsbezogene Beratung und Bootstrap-Template liegen im selben Wissensraum wie provider-neutrale Core-Governance.
- Risiko: Externe oder provider-spezifische Annahmen könnten als repo-kanonische Wahrheit gelesen werden.
- Empfohlene Klärungsfrage: Soll Qwen-bezogenes Material im Wiki als `provider-advisory` oder als `template/raw` markiert werden?

### Befund 4
- Datei/Ordner: `repo-skill-libraries/`
- Problem: Enthält aus lokalen Repositories abgeleitete Skill-Bibliotheken und Zusammenfassungen.
- Risiko: Importiertes Projektwissen kann privat, veraltet oder außerhalb dieses Repo-Scopes sein.
- Empfohlene Klärungsfrage: Welche dieser repo-spezifischen Skills dürfen agentisch verarbeitet oder als LLM-Wiki-Wissen wiederverwendet werden?

### Befund 5
- Datei/Ordner: `memory/`
- Problem: Memory-Scope nennt operator, project, runtime und decision-candidates; das ist absichtlich nicht-kanonisch, aber wissensnah.
- Risiko: Persönliche/operatorische Präferenzen, Projektwissen und Runtime-Fakten könnten vermischt werden.
- Empfohlene Klärungsfrage: Welche Memory-Scopes sind privat und welche dürfen in eine lokale Wiki-Suche aufgenommen werden?

### Befund 6
- Datei/Ordner: `contracts/`, `docs/tool-contracts/`, legacy `providers/*`
- Problem: Compatibility Mirrors und Exportflächen duplizieren canonical `core/contracts/*`-Wahrheit absichtlich.
- Risiko: Doppelte Wahrheit, falls Wiki-Indexierung Mirror-Flächen gleichrangig behandelt.
- Empfohlene Klärungsfrage: Soll das Wiki Mirror-Flächen nur als abgeleitete Referenzen indexieren?

### Befund 7
- Datei/Ordner: `.agents/skills/`, `core/skills/`, `skills/`
- Problem: Drei Skill-Zonen mit unterschiedlichen Ownership-Rollen: repo-local, portable canonical, legacy/contract-bound compatibility.
- Risiko: Wiederverwendbarkeit und Gültigkeitsbereich eines Skills können falsch eingeschätzt werden.
- Empfohlene Klärungsfrage: Soll die Wiki-Navigation zuerst nach `scope` (`local-only`, `portable`, `compatibility`) statt nach Ordner sortieren?

### Befund 8
- Datei/Ordner: `templates/discord-fetch-mcp/.env.example`
- Problem: Template enthält eine Umgebungsdatei-Vorlage; Secret-Scanner meldete keine Funde, aber die Kategorie ist secret-nah.
- Risiko: Spätere echte `.env`-Dateien könnten versehentlich in Wiki-/LLM-Kontext geraten.
- Empfohlene Klärungsfrage: Sollen `.env*`-Dateien grundsätzlich aus Wiki-Verarbeitung ausgeschlossen bleiben, auch wenn sie Beispiele sind?

### Befund 9
- Datei/Ordner: `examples/`
- Problem: Beispiele und kleine Referenzapps liegen neben Audit-/Workflow-Beispielen.
- Risiko: Beispielcode oder Beispieloutputs könnten als produktive Projekttruth gelesen werden.
- Empfohlene Klärungsfrage: Welche Examples sind reine Lern-/Testartefakte und welche sind normative Vorlagen?

### Befund 10
- Datei/Ordner: `artifacts/runtime-runs/`
- Problem: Generierte Runtime-Evidenz ist eine Log-/Output-Zone, aber derzeit nur strukturell erfasst.
- Risiko: Falls später echte Runs entstehen, können Logs private oder unreviewed Details enthalten.
- Empfohlene Klärungsfrage: Sollen Runtime-Artefakte standardmäßig privat/raw bleiben und nur redigierte Summaries ins Wiki?

## 7. Naming and Navigation Issues

- Observed: Keine `.obsidian/`-Konfiguration, keine `[[wikilinks]]`, keine erkennbaren Daily- oder Inbox-Ordner.
- Observed: Navigation erfolgt über README-/Index-Dateien, `Class:` und `Use rule:`, nicht über Obsidian-Graph-Konventionen.
- Observed: `docs/` ist gut indexiert, aber physisch gemischt; die Trennung ist logisch und kann von simplen Wiki-Tools übersehen werden.
- Observed: `docs/model-agnostic-core-prompt-system.md` ist mit 862 Zeilen die längste Markdown-Sammeldatei und dadurch ein Split-/Kurationskandidat.
- Observed: Es gibt mehrere bewusst redundante Flächen: `core/contracts/` versus `contracts/`, `core/skills/` versus `skills/`, canonical provider dirs versus legacy provider dirs.
- Observed: `repo-skill-libraries/` enthält importiertes/abgeleitetes Projektwissen ohne physische `raw/`-Quelle daneben.
- Observed: `memory/` hat klare Policies und Scopes, aber keine sichtbaren echten Memory-Einträge im Audit-Scope.
- Observed: `npm run detect-skill-overlap` meldete keine Overlap-Findings für `core/skills` und `skills`.
- Observed: `npm run lint-skill-contracts` meldete bestehende Skill-Vertragsprobleme, insbesondere 10 Errors für `skills/getdesign-style-router/SKILL.md` und 35 Warnings in Skill-Dateien.
- Inferred: Für ein LLM-Wiki fehlen derzeit dedizierte Navigationszonen wie `raw/`, `wiki/`, `personal/`, `prompts/`, `outputs/`, `logs/`, `decisions/`.
- Inferred: Verwaiste Notizen können ohne Link-Graph oder Backlink-Analyse nicht sicher bestimmt werden.

## 8. Suggested Target Zones

Noch keine Umsetzung. Diese Zonen sind nur Vorschläge für eine spätere menschlich geprüfte Zielstruktur.

### `raw/`
- Zweck: Unveränderte Quellen, importierte Dumps, externe Repo-Auszüge, Scanner-Inputs.
- Welche bestehenden Dateien/Ordner könnten passen? Ausgewählte `repo-skill-libraries/*`-Grounding-Hinweise, `evals/fixtures/`, `core/contracts/`, `policies/`.
- Welche Dateien sollten nicht automatisch verschoben werden? `core/contracts/*`, `policies/*`, `evals/*`, weil Pfade validator- und contract-relevant sind.
- Welche menschliche Entscheidung ist nötig? Welche Quellen sind privat, lizenz-/projektgebunden oder nur referenzierbar?

### `wiki/`
- Zweck: Kuratierte, stabile, menschenlesbare Wissensseiten.
- Welche bestehenden Dateien/Ordner könnten passen? `docs/README.md`, `docs/workflows/`, ausgewählte `docs/ui-ux-composition/`, `core/skills/README.md`, `templates/codex-workflow/README.md`.
- Welche Dateien sollten nicht automatisch verschoben werden? Canonical docs und Skills, weil Pfadstabilität Teil der Repo-Authority ist.
- Welche menschliche Entscheidung ist nötig? Wird das Wiki eine neue Oberfläche oder nur eine Index-/Metadatenansicht über bestehende Pfade?

### `personal/`
- Zweck: Private Gedanken, operatorische Präferenzen, persönliche Notizen.
- Welche bestehenden Dateien/Ordner könnten passen? Potenziell `memory/scopes/operator.md`, aber nur nach Review.
- Welche Dateien sollten nicht automatisch verschoben werden? Alles in `memory/`, solange nicht klar ist, ob es privat, project oder runtime ist.
- Welche menschliche Entscheidung ist nötig? Was bleibt explizit privat und wird aus LLM-Kontext ausgeschlossen?

### `projects/`
- Zweck: Projektbezogenes Wissen, das nicht repo-global canonical ist.
- Welche bestehenden Dateien/Ordner könnten passen? `repo-skill-libraries/*`, `docs/consumer-adoption.md`, projektbezogene Runtime-/adoption playbooks.
- Welche Dateien sollten nicht automatisch verschoben werden? `repo-skill-libraries/*`, weil die Inhalte abgeleitet und potenziell privat sind.
- Welche menschliche Entscheidung ist nötig? Welche externen Projektbibliotheken dürfen in diesem Repo-Wiki sichtbar sein?

### `prompts/`
- Zweck: Prompt-Systeme, Prompt-Fragmente, Provider-/Agent-Kontext.
- Welche bestehenden Dateien/Ordner könnten passen? `docs/model-agnostic-core-prompt-system.md`, `templates/qwen-bootstrap/.qwen/extensions/cheikh-core/resources/`, prompt-bezogene repo-skill-libraries.
- Welche Dateien sollten nicht automatisch verschoben werden? `docs/model-agnostic-core-prompt-system.md`, weil es canonical design contract ist; `.qwen` templates, weil sie Template-Struktur enthalten.
- Welche menschliche Entscheidung ist nötig? Was ist Prompt-Quelle, was ist Prompt-Dokumentation, was ist provider-spezifisches Template?

### `outputs/`
- Zweck: Generierte Ergebnisse, Review-Reports, Beispiele, Handoff-Summaries.
- Welche bestehenden Dateien/Ordner könnten passen? `examples/codex-workflow/*-example.md`, `artifacts/runtime-runs/`, provider `export.json`.
- Welche Dateien sollten nicht automatisch verschoben werden? `providers/*/export.json`, `examples/*`, `artifacts/*`, weil Validatoren und README-Pfade darauf verweisen können.
- Welche menschliche Entscheidung ist nötig? Welche Outputs sind generated, welche reviewed, welche dauerhaft zitierfähig?

### `logs/`
- Zweck: Verlauf, Runtime-Evidenz, Audit-/Review-Historie.
- Welche bestehenden Dateien/Ordner könnten passen? `CHANGELOG.md`, `artifacts/runtime-runs/`, dieses Audit-Artefakt `audit/local-obsidian-audit-log.md`.
- Welche Dateien sollten nicht automatisch verschoben werden? `CHANGELOG.md` und Runtime-Artefakte.
- Welche menschliche Entscheidung ist nötig? Welche Logs dürfen in LLM-Kontext, welche nur redigiert?

### `archive/`
- Zweck: Historische oder nicht mehr aktive Planungsstände.
- Welche bestehenden Dateien/Ordner könnten passen? `docs/extraction-roadmap.md`, `CHANGELOG.md` als historischer Verlauf.
- Welche Dateien sollten nicht automatisch verschoben werden? `docs/extraction-roadmap.md` und `CHANGELOG.md`, weil bestehende Authority-Dokumente auf sie verweisen.
- Welche menschliche Entscheidung ist nötig? Soll Archive eine physische Zone werden oder bleibt `Class: archive` ausreichend?

## 9. Audit Questions for Human Review

1. Ist `/home/baum/Schreibtisch/workspace/main_projects/model-agnostic-workflow-system` tatsächlich der gewünschte Vault-Scope oder nur ein Repo innerhalb einer größeren Obsidian-/Markdown-Struktur?
2. Soll das spätere LLM-Wiki bestehende Pfade indexieren oder eine neue physische Struktur erzeugen?
3. Welche Dateien sind privat und dürfen nicht agentisch verarbeitet werden?
4. Darf `memory/scopes/operator.md` überhaupt in ein LLM-Wiki aufgenommen werden?
5. Welche `repo-skill-libraries/*`-Inhalte sind projektintern, vertraulich oder veraltet?
6. Soll `core/skills/` die einzige portable Skill-Authority sein und `skills/` nur als compatibility erscheinen?
7. Sollen `contracts/` und legacy `providers/*` in Suchergebnissen niedriger gerankt werden als `core/contracts/*`?
8. Welche Inhalte in `docs/model-agnostic-core-prompt-system.md` sind canonical, welche sind Entwurf und welche sind Prompt-Baustein?
9. Soll `docs/ui-ux-composition/` als Wiki-Domäne sichtbar sein, obwohl viele Dateien `derived` sind?
10. Wie sollen generated provider exports und runtime artifacts im Wiki markiert werden?
11. Gibt es echte raw sources außerhalb dieses Repos, die referenziert, aber nicht kopiert werden sollen?
12. Sollen `.env*`, `.codex/`, `.qwen/` und Runtime-Logs grundsätzlich aus LLM-Kontext ausgeschlossen werden?
13. Welche Outputs gelten nach Review als dauerhaft zitierfähig?
14. Soll es eine separate Decision-Zone geben oder reichen vorhandene canonical Docs und Authority-Matrix?
15. Welche Indexdatei soll später die menschliche Einstiegsseite für das lokale Wiki sein?
16. Soll der bestehende Skill-Lint-Befund als separater Cleanup-Track behandelt werden?
17. Werden Obsidian-spezifische Features wie Backlinks, Tags und Frontmatter gewünscht oder soll es Markdown-tool-neutral bleiben?
18. Welche Bereiche dürfen automatisch zusammengefasst werden und welche nur nach manueller Freigabe?

## 10. Recommended Next Iteration

1. Recommended: Human Review des tatsächlichen Vault-Scopes: Repo-Root bestätigen oder größeren lokalen Markdown-/Obsidian-Root benennen.
2. Recommended: Eine Privacy-/Processing-Matrix festlegen: `private`, `agent-readable`, `wiki-candidate`, `canonical-source`, `generated-output`.
3. Recommended: Eine reine Mapping-Datei oder Tabelle entwerfen, die bestehende Pfade auf `raw/wiki/personal/projects/prompts/outputs/logs/archive` abbildet, ohne Dateien zu verschieben.
4. Recommended: `docs/model-agnostic-core-prompt-system.md` und `repo-skill-libraries/` separat menschlich kuratieren, bevor daraus Wiki-Wissen entsteht.
5. Recommended: Den bestehenden Skill-Lint-Befund als eigenen, späteren Cleanup-Task behandeln; nicht mit dem Obsidian-/LLM-Wiki-Audit vermischen.

## Evidence

- Observed command: `rg --files --hidden -g '*.md' -g '!/.git/**' -g '!/.codex/**'` -> 202 Markdown-Dateien nach Top-Level gezählt.
- Observed command: `find . -path ./.git -prune -o -path ./.codex -prune -o -name .obsidian -type d -print` -> kein `.obsidian/`-Verzeichnis gefunden.
- Observed command: `rg -n --hidden -g '*.md' -g '!/.git/**' -g '!/.codex/**' '\\[\\['` -> keine Wikilinks gefunden.
- Observed command: `npm run scan` -> Key directories present: `core`, `docs`, `skills`, `scripts/tools`, `templates/codex-workflow`, `examples/codex-workflow`, canonical provider dirs.
- Observed command: `npm run scan-secrets` -> `ok: true`, `findingCount: 0`.
- Observed command: `npm run detect-skill-overlap` -> `ok: true`, `findingsCount: 0`.
- Observed command: `npm run lint-skill-contracts` -> `ok: false`, `errorCount: 10`, `warningCount: 35`; existing issue, not changed.

