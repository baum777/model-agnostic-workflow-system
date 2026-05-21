# Local LLM-Wiki Review Decisions

## 1. Result
- Status: partial
- Kurzfazit: Observed: `audit/local-llm-wiki-path-mapping.md` legt bereits eine sichere Nicht-Migrationslinie fest. Recommended: Das Repo sollte vorerst als referenziertes Knowledge-Repo behandelt werden, nicht als echter Obsidian-Vault. Die tragfähige Entscheidung ist ein Overlay-/Index-Modell mit Pointer, Maps und Metadaten statt Kopien oder Pfadverschiebungen. Canonical- und operational-Flächen können begrenzt LLM-readable werden, wenn Authority-Status sichtbar bleibt. Generated, compatibility, runtime, private/local und project-import Flächen brauchen strengere Gates. Ausgeschlossene Pfade bleiben gesperrt, bis eine explizite menschliche Ausnahme dokumentiert ist.
- Wichtigste Entscheidung: `wiki-overlay/` nur als nicht-migrierendes Pointer-/Metadaten-Overlay vorbereiten, nicht als neue physische Repo-Ordnung.
- Wichtigster Blocker: Menschliche Freigabe fuer `review-only`-Zonen, besonders `memory/`, `repo-skill-libraries/`, provider/template-nahe Flächen und runtime evidence.

## 2. Approved Zone Matrix

| Zone | Decision | LLM-readable | Summary allowed | Wiki allowed | Restriction |
| --- | --- | --- | --- | --- | --- |
| `canonical-source` | approve-with-limits | yes | review-only | yes | Pointer-first; keine canonical Inhalte umschreiben oder als neue Authority duplizieren. |
| `operational-playbook` | approve | yes | yes | yes | Muss auf canonical Quellen zurueckverweisen; keine Originaldateien veraendern. |
| `derived-knowledge` | approve-with-limits | yes | yes | yes | Immer als non-canonical/advisory markieren. |
| `compatibility-mirror` | approve-with-limits | yes | review-only | pointer-only | Muss niedriger gerankt werden als canonical source. |
| `generated-output` | review-only | review-only | review-only | pointer-only | Keine Rohkopien; nur Metadaten und canonical-source Links. |
| `template-source` | approve-with-limits | yes | review-only | yes | Secret-nahe Template-Teile und `.env*` ausgeschlossen. |
| `runtime-evidence` | review-only | review-only | review-only | no, ausser redigierte Summaries | Rohartefakte und Logs default excluded. |
| `private-or-local` | exclude | no | no | no | Nur explizit freigegebene, nicht-sensitive Metadaten duerfen referenziert werden. |
| `project-import` | review-only | review-only | review-only | review-only | Owner/Freigabe/Aktualitaet vor Verarbeitung klaeren. |
| `archive-reference` | approve-with-limits | yes | yes | pointer-only | Als Historie markieren; nicht als aktuellen Zustand lesen. |
| `exclude-from-llm-context` | exclude | no | no | no | Keine Ausnahme ohne dokumentierte menschliche Freigabe. |
| `needs-human-review` | review-only | review-only | review-only | review-only | Erst nach Class-/Privacy-/Authority-Review aufwerten. |

## 3. Path Decisions

| Path | Decision | Reason | Restriction | Next Action |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | approve-with-limits | Root Operating Contract. | Pointer-first; keine Generalisierung ausserhalb dieses Repos. | In `authority-map` als hoechste lokale Authority referenzieren. |
| `README.md` | approve | Frontdoor und Orientierung. | Darf nicht als vollstaendige Architecture gelten. | In Overlay-Index referenzieren. |
| `WORKFLOW.md` | approve-with-limits | Root Workflow Contract. | Deep-Dives duerfen ihn nicht ueberstimmen. | In `workflow-map` als Parent eintragen. |
| `CHANGELOG.md` | approve-with-limits | Historischer Verlauf. | Nur archive/timeline; nicht aktueller SOT. | In archive/timeline Pointer aufnehmen. |
| `docs/` | review-only | Physisch gemischte Klassen. | Ohne `Class:`-Auswertung nicht pauschal LLM-readable. | Class-basierte Doc-Map erstellen. |
| `docs/architecture.md` | approve-with-limits | Canonical Klassen- und Merge-Regeln. | Keine neue physische Klassenstruktur daraus ableiten. | In `authority-map` referenzieren. |
| `docs/authority-matrix.md` | approve-with-limits | Canonical Claim-/Status-Ledger. | Nicht durch Overlay-Entscheidungen ersetzen. | In `authority-map` referenzieren. |
| `docs/governance/` | approve-with-limits | Source hierarchy und externe Boundary. | Externe Portfolio-Inhalte nur als Pointer. | In `authority-map` referenzieren. |
| `docs/mcp/` | approve-with-limits | Canonical MCP Policy. | Keine Runtime-Claims ableiten. | Maturity-Feld `prose-governed` aufnehmen. |
| `docs/workflows/` | approve | Workflow-Deep-Dives. | Muss auf `WORKFLOW.md` zurueckverweisen. | In `workflow-map` aufnehmen. |
| `docs/ui-ux-composition/` | approve-with-limits | Nutzbare derived/advisory Wissensdomain. | Derived/advisory sichtbar markieren. | Subfolder nach `MODULES`, `POLICIES`, `TEST_CASES`, `EXAMPLES` mappen. |
| `docs/model-agnostic-core-prompt-system.md` | review-only | Lange canonical Zielzustandsdatei mit Prompt-Anteilen. | Keine automatische Abschnittsextraktion. | Separaten Abschnitts-/Pointer-Review planen. |
| `docs/qwen-3-6-intro.md` | review-only | Provider-advisory Material. | Nicht als provider-neutrale Policy lesen. | Mit Qwen-Template-Material gemeinsam pruefen. |
| `docs/tool-contracts/catalog.json` | approve-with-limits | Compatibility/export catalog. | Nur mirror; canonical ist `core/contracts/tool-contracts/catalog.json`. | In generated/compatibility map pointer-only aufnehmen. |
| `core/contracts/` | approve-with-limits | Canonical machine-readable contracts. | Zusammenfassungen review-only; JSON nicht paraphrasierend kopieren. | In `authority-map` und `workflow-map` pointer-first aufnehmen. |
| `core/contracts/tool-contracts/catalog.json` | approve-with-limits | Canonical tool catalog. | Als machine-readable source behandeln. | Gegen docs mirror abgrenzen. |
| `core/skills/` | approve | Portable Skill-Wissensbasis. | Skill-Status und Contract-Link sichtbar halten. | In `skill-map` als portable aufnehmen. |
| `skills/` | approve-with-limits | Legacy/contract-bound compatibility skills. | Niedriger ranken als `core/skills/`. | In `skill-map` als compatibility aufnehmen. |
| `.agents/skills/` | approve-with-limits | Repo-local control-plane skills. | `local-only`; nicht exportieren. | In `skill-map` separat markieren. |
| `memory/` | review-only | Non-canonical Memory Skeleton. | Keine Scope-Inhalte pauschal lesen. | Scope-Entscheidungen einzeln reviewen. |
| `memory/scopes/` | review-only | Operator/project/runtime Scopes koennen privat sein. | `operator` default excluded. | Private/LLM-readable Scope-Matrix erstellen. |
| `memory/scopes/operator.md` | exclude | Operator memory ist privatheitsnah. | Keine Verarbeitung ohne Abschnittsfreigabe. | In Hard Exclusion Lock aufnehmen. |
| `memory/policies/` | approve-with-limits | Memory-Regeln sind operational nutzbar. | Muss auf canonical Memory Contract verweisen. | In `private-exclusion-map` referenzieren. |
| `memory/stores/jsonl/` | exclude | Durable/local store oder spaetere Eintraege. | Keine Eintragsinhalte verarbeiten. | Nur Schema/Policy pointer erlauben. |
| `templates/codex-workflow/` | approve | Gute wiederverwendbare Template-Quelle. | Als Template markieren; nicht als ausgefuellter Output. | In `template-map` aufnehmen. |
| `templates/discord-fetch-mcp/` | review-only | Template bundle mit secret-naher Env-Beispielkategorie. | Nur README/Metadaten bis Review. | `.env.example` excluded lassen. |
| `templates/discord-fetch-mcp/.env.example` | exclude | Secret-nahe Beispielkonfiguration. | Keine Werte oder Variablendetails kopieren. | Nur Kategorie/Risiko referenzieren. |
| `templates/qwen-bootstrap/` | review-only | Provider/bootstrap template. | Nicht als lokale Live-Konfiguration lesen. | Nach Provider-Advisory-Review entscheiden. |
| `templates/qwen-bootstrap/.qwen/` | review-only | Template-local agent config. | Nicht mit echter lokaler `.qwen` verwechseln. | Nur Metadaten nach Review. |
| `examples/` | approve-with-limits | Beispiele sind nützlich fuer Orientierung. | Immer `derived/example`, nicht normative Truth. | In `template-map` oder examples map aufnehmen. |
| `repo-skill-libraries/` | review-only | Importiertes Projektwissen aus lokalen Repos. | Keine Verarbeitung ohne Owner/Freigabe. | Project-import review vorbereiten. |
| `contracts/` | approve-with-limits | Compatibility mirrors. | Pointer-only; canonical link erforderlich. | In `generated-output-map` oder compatibility map aufnehmen. |
| `contracts/*.json` | approve-with-limits | Mirror JSONs. | Nicht als canonical Quelle verwenden. | Canonical Zielpfad angeben. |
| `providers/` | review-only | Provider exports und legacy mirrors. | Keine generated JSON-Vollkopien. | Export map mit canonical-source Links vorbereiten. |
| `providers/*/export.json` | review-only | Generated provider exports. | Metadata-only oder pointer-only. | Generated-output map vorbereiten. |
| `evals/` | approve-with-limits | Fixtures und Eval-Evidence. | Fixtures nicht als Projekttruth behandeln. | In evidence map mit Testfixture-Status aufnehmen. |
| `evals/fixtures/` | approve-with-limits | Deterministische Testfixtures. | Synthetic/test markers sichtbar halten. | Secret policy verlinken. |
| `policies/` | approve-with-limits | Machine-readable policy layer. | Mit prose authority verlinken. | In authority map aufnehmen. |
| `runtime/` | review-only | Code/Runnable boundary und activation-sensitive Bereich. | Keine Runtime-Faehigkeit ohne Evidence ueberclaimen. | Nur docs/command map, nicht Code-Kopie. |
| `scripts/tools/` | approve-with-limits | Validatoren und enforced truth. | Tool-Zweck/Gate-Status statt Code-Vollkopie. | In validator/evidence map aufnehmen. |
| `artifacts/runtime-runs/` | exclude | Raw runtime artifacts/logs. | Keine Rohartefakte; nur redigierte summaries nach Freigabe. | In Hard Exclusion Lock aufnehmen. |
| `.codex/` | exclude | Lokaler App-/Tool-State. | Keine Verarbeitung. | In Hard Exclusion Lock aufnehmen. |
| `.git/` | exclude | VCS internals/history. | Keine Verarbeitung ausser explizite Git-Review-Befehle. | In Hard Exclusion Lock aufnehmen. |
| `.obsidian/` | blocked | Nicht beobachtet; waere lokale Vault-Konfiguration. | Falls spaeter vorhanden: review-only, keine Plugin-State-Inhalte. | Nicht anlegen; nur bei Existenz neu bewerten. |
| `.env` und echte `.env*` | exclude | Secret-nahe Runtime-Konfiguration. | Keine Inhalte lesen oder kopieren. | In Hard Exclusion Lock aufnehmen. |
| echte Logs ausserhalb `audit/` | exclude | Potenziell privat oder transient. | Nur redigierte reviewed summaries. | Logging-/Redaction-Regel definieren. |
| secret-nahe Patterns `*secret*`, `*token*`, `*credential*` | review-only | Hohe Fehlaufnahme-Gefahr. | Inhalte nicht kopieren; erst Secret-Scan und Freigabe. | In Exclusion Gate aufnehmen. |

## 4. Hard Exclusion Lock

Diese Bereiche bleiben ausgeschlossen:

- `.git/`
- `.codex/`
- echte `.env*`
- raw runtime artifacts, besonders `artifacts/runtime-runs/`
- operator memory, besonders `memory/scopes/operator.md`
- private logs und nicht redigierte Runtime-/Tool-Logs
- nicht freigegebene project imports, besonders `repo-skill-libraries/`
- raw secrets, credentials, tokens, private keys und rekonstruierbare secret-nahe Inhalte
- lokale Tool-/App-State-Flächen ausserhalb explizit freigegebener, nicht-sensibler Metadaten

## 5. Overlay Decision

- Decision: only-after-review
- Begründung: Ein nicht-migrierendes `wiki-overlay/` ist fachlich sinnvoll, aber erst nach menschlicher Freigabe dieser Entscheidungsdatei. Bis dahin duerfen nur Audit-/Planungsartefakte entstehen. Wenn freigegeben, darf `wiki-overlay/` ausschliesslich Pointer, Maps und Metadaten enthalten; keine Originalinhalte, keine Migration und keine Inhalte aus Hard-Exclusion-Pfaden.

## 6. Frontmatter Policy

- Decision: overlay-only
- Begründung: Frontmatter soll vorerst nicht in Originaldateien geschrieben werden, weil Originalpfade Authority-, Validator- und Compatibility-Bedeutung haben. Ein Overlay-only Schema kann `zone`, `authority`, `source_path`, `llm_processing`, `privacy`, `status`, `maturity` und `copy_policy` vorschlagen, ohne Repo-Dateien zu veraendern.

## 7. Next Safe Codex Prompt

```md
Du arbeitest weiter als lokaler LLM-Wiki Overlay-Spezifikationsagent.

Voraussetzung:
`audit/local-llm-wiki-review-decisions.md` wurde menschlich akzeptiert.

Aufgabe:
Erstelle ein nicht-migrierendes Overlay-Konzept. Du darfst nur neue Dateien unter `audit/` oder `wiki-overlay/` erstellen. Du darfst keine bestehenden Repo-Dateien veraendern, verschieben, loeschen oder umbenennen.

Erlaubt:
- Pointer, Maps und Metadaten
- Overlay-only Frontmatter-Schema
- Authority-Map, Path-Map, Skill-Map, Workflow-Map, Template-Map, Generated-Output-Map und Private-Exclusion-Map
- Verweise auf bestehende Pfade ohne Inhalte zu kopieren

Verboten:
- Migration
- Umbenennung
- Aenderung bestehender Repo-Dateien
- Verarbeitung oder Inhaltsauswertung von `.git/`, `.codex/`, echten `.env*`, raw runtime artifacts, operator memory, private logs oder nicht freigegebenen project imports
- Kopieren von generated JSON-Exports, Runtime-Artefakten, Secrets, Tokens oder privaten Daten

Erstelle nur:
`audit/local-llm-wiki-overlay-spec.md`

Die Datei soll definieren:
1. Overlay-Ziel
2. geplante Overlay-Dateien
3. erlaubte Quellen pro Overlay-Datei
4. verbotene Quellen pro Overlay-Datei
5. Frontmatter-Schema als Vorschlag
6. Exclusion-Gates
7. Human Review Gates vor jeder spaeteren Datei unter `wiki-overlay/`
8. Evidence
```

