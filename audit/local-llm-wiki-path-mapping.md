# Local LLM-Wiki Path Mapping

## 1. Result
- Status: partial
- Kurzfazit: Observed: Der geprüfte Root bleibt ein governance-orientiertes Markdown-/Workflow-Repository, kein klassischer Obsidian-Vault. Observed: Die bestehende Struktur hat bereits klare logische Authority-Signale über `Class:`, `Use rule:`, `docs/architecture.md` und `docs/authority-matrix.md`. Applied: Diese Datei bildet bestehende Pfade auf logische LLM-Wiki-Zonen ab, ohne Pfade zu verschieben oder bestehende Inhalte zu verändern. Inferred: Die wichtigste Mapping-Entscheidung ist ein nicht-migrierendes Overlay, das bestehende Repo-Pfade referenziert und Authority-/Processing-Metadaten ergänzt. Das wichtigste Risiko bleibt falsche Autoritätslesung: generated, compatibility, derived, local/private und canonical Flächen dürfen nicht gleichrangig in den LLM-Kontext geraten. Neu gegenüber dem ersten Audit ist die konkrete Pfad-zu-Zone-Entscheidung samt Exclusion-Regeln und Obsidian-Frontmatter-Vorschlägen. BLOCKED für Migration: Eine echte Obsidian- oder Vault-Struktur darf erst nach menschlicher Review von Scope, Privatheit und Canonicalität entstehen.
- Wichtigste Mapping-Entscheidung: Bestehende Pfade bleiben unverändert; ein späteres Wiki sollte als Overlay/Index-System arbeiten.
- Wichtigstes Risiko: LLM oder Mensch könnten physische Nähe im Repo als gleiche Authority interpretieren.
- Was wurde neu geklärt? Die wichtigsten Repo-Pfade wurden logischen Wissenszonen, Processing-Regeln, Wiki-Eignung und Review-Gates zugeordnet.

## 2. Mapping Principles

Diese Regeln beschreiben nur eine logische Zuordnung. Sie ändern keine bestehenden Pfade.

| Zone | Zweck | LLM lesen? | LLM zusammenfassen? | Wiki-Wissen daraus? | Automatisch umstrukturieren? | Typische Beispiele |
| --- | --- | --- | --- | --- | --- | --- |
| `canonical-source` | Verbindliche Quelle fuer Governance, Architektur, Verträge oder Authority | yes | review-only | yes, als Pointer oder redigierte Zusammenfassung | no | `AGENTS.md`, `WORKFLOW.md`, `docs/architecture.md`, `core/contracts/` |
| `operational-playbook` | Ablauf-, Runbook-, Checklist- oder Bedienwissen, das canonical Regeln anwendet | yes | yes | yes | no | `docs/workflows/`, `docs/usage.md`, `docs/validation-checklist.md`, `templates/codex-workflow/README.md` |
| `derived-knowledge` | Abgeleitete Orientierung, Beispiele, Baselines, advisory Material | yes | yes | yes, mit non-canonical Markierung | no | `docs/overview.md`, `docs/eval-baseline.md`, `docs/ui-ux-composition/`, `examples/codex-workflow/` |
| `compatibility-mirror` | Bewusst redundante Legacy- oder Export-Mirror-Fläche | yes | review-only | pointer-only | no | `contracts/`, `skills/`, `docs/tool-contracts/`, legacy `providers/*` |
| `generated-output` | Aus Verträgen oder Build-Skripten erzeugte Artefakte und Exporte | review-only | review-only | pointer-only | no | `providers/*/export.json`, Registry-Snapshots |
| `template-source` | Wiederverwendbare Vorlage oder Bootstrap-Material | yes | review-only | yes, wenn Template-Status sichtbar bleibt | no | `templates/codex-workflow/`, `templates/discord-fetch-mcp/`, `templates/qwen-bootstrap/` |
| `runtime-evidence` | Laufzeitbelege, Receipts, Run-Artefakte, Replay-/Validation-Ausgaben | review-only | review-only | no, nur redigierte Summaries | no | `artifacts/runtime-runs/`, Runtime receipts |
| `private-or-local` | Lokale Tool-State-, Operator-, Arbeits- oder private Kontextflächen | no | no | no | no | `.codex/`, `memory/scopes/operator.md`, lokale Logs |
| `project-import` | Aus anderen lokalen Projekten abgeleitete Wissens- oder Skill-Bibliotheken | review-only | review-only | review-only | no | `repo-skill-libraries/` |
| `archive-reference` | Historische, eingefrorene oder changelogartige Referenz | yes | yes | pointer-only oder timeline | no | `CHANGELOG.md`, `docs/extraction-roadmap.md` |
| `exclude-from-llm-context` | Standardmäßig nicht in Modellkontext aufnehmen | no | no | no | no | `.git/`, echte `.env*`, private Logs, raw secrets |
| `needs-human-review` | Unklare, gemischte oder privatheitsrelevante Fläche | review-only | review-only | review-only | no | `docs/`, `memory/`, `templates/*/.codex`, project imports |

Default-Regel: Wenn zwei Zonen passen, gewinnt die vorsichtigere Zone. `exclude-from-llm-context` und `private-or-local` schlagen alle anderen Zonen, bis eine menschliche Review eine enge Ausnahme freigibt.

## 3. Path-to-Zone Mapping Table

| Existing Path | Proposed Zone | Authority Status | LLM Processing Rule | Wiki Use | Risk | Human Decision Needed |
| --- | --- | --- | --- | --- | --- | --- |
| `AGENTS.md` | `canonical-source` | canonical root operating contract | Lesen yes; Zusammenfassung review-only | High, als Authority-Pointer | Repo-Regeln koennen als generische Wiki-Regeln missverstanden werden | Soll als hoechste lokale Repo-Authority markiert werden? |
| `README.md` | `canonical-source` | canonical frontdoor by repo convention | Lesen yes; Zusammenfassung yes mit Authority-Hinweis | High, als Entry-Index | Frontdoor kann als vollstaendige Architecture gelesen werden | Soll Wiki-Index auf README oder separaten Overlay-Index zeigen? |
| `WORKFLOW.md` | `canonical-source` | canonical root workflow contract | Lesen yes; Zusammenfassung review-only | High, als Workflow-Authority | Workflow-Klassen koennen mit Zielzonen verwechselt werden | Soll jedes Wiki-Topic Workflow-Bezug optional ausweisen? |
| `CHANGELOG.md` | `archive-reference` | archive/history | Lesen yes; Zusammenfassung yes | Medium, timeline-only | Historische Eintraege koennen als aktueller Zustand wirken | Soll Changelog nur als Verlauf, nicht als Authority indexiert werden? |
| `docs/` | `needs-human-review` | mixed: canonical, operational, derived, archive | Review-only, bis `Class:` ausgewertet ist | Medium bis high mit Frontmatter | Physischer Ordner verschleiert logische Klassen | Soll ein Class-basierter Index Pflicht werden? |
| `docs/governance/` | `canonical-source` | canonical governance/source hierarchy; external pointer | Lesen yes; Zusammenfassung review-only | High, als Authority-Map | Externe Portfolio-Regeln koennten kopiert statt referenziert werden | Welche externen Governance-Inhalte duerfen nur als Pointer erscheinen? |
| `docs/mcp/` | `canonical-source` | canonical MCP boundary policy | Lesen yes; Zusammenfassung review-only | High, policy pointer | MCP-Policy kann als Runtime-Implementierung missverstanden werden | Soll Wiki Maturity-Feld `prose-governed` erzwingen? |
| `docs/workflows/` | `operational-playbook` | canonical workflow deep dives | Lesen yes; Zusammenfassung yes | High | Deep dives koennen Root `WORKFLOW.md` ueberstimmen, wenn isoliert gelesen | Soll jeder Eintrag auf `WORKFLOW.md` rueckverlinken? |
| `docs/ui-ux-composition/` | `derived-knowledge` | mixed, ueberwiegend derived/advisory; einzelne operational contracts | Lesen yes; Zusammenfassung yes mit derived Marker | Medium bis high | Advisory branch taxonomy kann canonical wirken | Welche Dateien sind Wiki-Kandidaten und welche nur branch-intern? |
| `docs/model-agnostic-core-prompt-system.md` | `canonical-source` + `needs-human-review` | canonical target-state design contract | Review-only | Medium, nur kuratiert | Lange Sammeldatei mischt Design Contract, Prompt, Architektur und Empfehlungen | Welche Abschnitte duerfen als Prompt-Wiki extrahiert werden? |
| `core/contracts/` | `canonical-source` | canonical machine-readable contracts | Lesen yes; Zusammenfassung review-only | High, pointer-first | JSON-Vertraege koennen durch Prosa-Summary verfälscht werden | Soll Wiki nur Pfad, Owner und Zweck spiegeln statt Inhalte zu kopieren? |
| `core/skills/` | `operational-playbook` | portable shared skill source; contract-linked | Lesen yes; Zusammenfassung yes | High | Skill-Inhalte koennen mit legacy `skills/` kollidieren | Soll `portable` als Pflicht-Tag gesetzt werden? |
| `skills/` | `compatibility-mirror` | legacy/contract-bound compatibility skill surface | Lesen yes; Zusammenfassung review-only | Medium, mit compatibility-Warnung | Legacy Skill kann fuer canonical portable Skill gehalten werden | Welche Skills bleiben compatibility, welche sind canonical? |
| `.agents/skills/` | `operational-playbook` + `private-or-local` | repo-local control-plane skills | Lesen yes; Zusammenfassung review-only | Medium, local-only | Lokale Routing-Skills koennen als portable Skills missverstanden werden | Soll `local-only` in Frontmatter/Tags erzwungen werden? |
| `memory/` | `needs-human-review` | operational, non-canonical memory skeleton | Review-only | Low bis medium | Memory kann private, operatorische und runtime Fakten vermischen | Welche Scopes sind indexierbar? |
| `memory/scopes/` | `private-or-local` | non-canonical scope notes | No by default; review-only Ausnahme | Low, nur nach Review | Operator/project/runtime Grenzen koennen private oder unreviewed Inhalte tragen | Welche Scope-Dateien duerfen LLM-readable sein? |
| `memory/policies/` | `operational-playbook` | memory policy docs | Lesen yes; Zusammenfassung yes | Medium | Policy kann canonical `core/contracts/workflow-memory-contract.json` ersetzen wollen | Soll Wiki auf canonical Contract verweisen? |
| `templates/codex-workflow/` | `template-source` | operational template scaffolds | Lesen yes; Zusammenfassung yes | High | Template kann als ausgefuellter Output missverstanden werden | Soll `template-source` in Frontmatter Pflicht sein? |
| `templates/discord-fetch-mcp/` | `template-source` + `needs-human-review` | template bundle; includes secret-near `.env.example` | Review-only | Medium | Template-Code und Env-Beispiel koennen secret-nahe Muster enthalten | Soll nur README plus manifestartige Metadaten indexiert werden? |
| `templates/qwen-bootstrap/` | `template-source` + `needs-human-review` | provider/bootstrap template | Review-only | Medium | `.qwen`-Template kann als lokale Live-Konfiguration wirken | Soll Qwen-Material provider-advisory bleiben? |
| `examples/` | `derived-knowledge` | examples and reference artifacts | Lesen yes; Zusammenfassung yes | Medium | Beispiele koennen als normative Produkttruth gelesen werden | Welche Beispiele sind repräsentativ genug fuer Wiki? |
| `repo-skill-libraries/` | `project-import` | derived from local external repos | Review-only | Review-only | Kann private, veraltete oder projektgebundene Erkenntnisse enthalten | Wer besitzt Freigabe und Aktualitaetsstatus? |
| `contracts/` | `compatibility-mirror` | compatibility mirrors of core contracts | Lesen yes; Zusammenfassung review-only | Pointer-only | Doppelte Wahrheit neben `core/contracts/` | Soll Wiki sie niedriger ranken als canonical? |
| `providers/` | `generated-output` + `compatibility-mirror` | provider exports; canonical provider dirs plus legacy mirrors | Review-only | Pointer-only | Generated exports koennen als manuelle Authority erscheinen | Soll Exportstatus maschinenlesbar markiert werden? |
| `evals/` | `runtime-evidence` + `derived-knowledge` | fixtures and eval catalog | Lesen yes; Zusammenfassung review-only | Medium | Fixtures, synthetic placeholders und Tests koennen fehlinterpretiert werden | Welche Fixtures duerfen in Wiki-Suche auftauchen? |
| `policies/` | `canonical-source` | machine-readable policy layer | Lesen yes; Zusammenfassung review-only | High, pointer-first | YAML Policies koennen losgeloest von `docs/secret-handling.md` gelesen werden | Soll jede Policy einen prose-authority Link bekommen? |
| `runtime/` | `runtime-evidence` + `operational-playbook` | local runtime implementation and validators | Review-only | Low bis medium | Code koennte als aktivierte Runtime-Faehigkeit ueberclaimt werden | Welche runtime docs statt code sollen indexiert werden? |
| `scripts/tools/` | `operational-playbook` + `canonical-source` for enforcement | validator/helper/build scripts | Review-only | Medium, evidence pointer | Tool-Verhalten ueberstimmt Prosa, ist aber nicht Wiki-Prosa | Soll Wiki nur Tool-Zweck und Gate-Status listen? |
| `artifacts/runtime-runs/` | `runtime-evidence` + `private-or-local` | generated local run artifacts | No by default; review-only redacted summaries | Exclude by default | Logs koennen private oder unreviewed Daten enthalten | Welche Redaction-Regel gilt fuer run summaries? |
| `.codex/` | `private-or-local` + `exclude-from-llm-context` | local app/tool state | no | exclude | Lokaler Tool-State kann private Kontextdaten enthalten | Gibt es ueberhaupt eine Ausnahme? |
| `.git/` | `exclude-from-llm-context` | VCS internals/history | no | exclude | History/Diffs koennen private oder entfernte Inhalte enthalten | Nur explizite Git-Befehle fuer konkrete Review-Aufgaben? |

## 4. Obsidian Suitability Matrix

Frontmatter ist hier nur vorgeschlagen, nicht eingefuegt.

Beispiel-Frontmatter:

```yaml
zone: derived-knowledge
authority: non-canonical
source_path: docs/example.md
llm_processing: review-only
privacy: internal
status: draft
```

| Path | Obsidian Suitability | Why | Suggested Frontmatter | Suggested Tags | Notes |
| --- | --- | --- | --- | --- | --- |
| `README.md` | high | Natuerlicher Einstiegspunkt | `zone: canonical-source; authority: canonical; llm_processing: yes; privacy: internal; status: active` | `#frontdoor #canonical #repo` | Als Pointer nutzen, nicht duplizieren |
| `AGENTS.md` | high | Root Operating Contract | `zone: canonical-source; authority: canonical; llm_processing: review-only; status: active` | `#authority #governance #canonical` | Hohe Prioritaet in Search/Graph |
| `WORKFLOW.md` | high | Workflow Taxonomy und Gates | `zone: canonical-source; authority: canonical; llm_processing: review-only; status: active` | `#workflow #canonical #gates` | Muss Deep-Dives ueberranken |
| `docs/architecture.md` | high | Definiert Klassen und Merge-Regeln | `zone: canonical-source; authority: canonical; class: canonical; status: active` | `#architecture #authority #canonical` | Zentral fuer Wiki-Metadatenmodell |
| `docs/authority-matrix.md` | high | Claim/Status Ledger | `zone: canonical-source; authority: canonical; status: active` | `#authority #status-ledger #canonical` | Kann als Authority Map dienen |
| `docs/` | review-only | Physisch gemischt, logisch klassifiziert | `zone: needs-human-review; authority: mixed; llm_processing: review-only` | `#mixed #review-needed` | Subpath- oder Class-basiert indexieren |
| `docs/governance/` | high | Source hierarchy und Portfolio-Boundary | `zone: canonical-source; authority: canonical; privacy: internal` | `#governance #sources #boundary` | Externe Inhalte nicht kopieren |
| `docs/mcp/` | high | MCP Boundary Policy | `zone: canonical-source; authority: canonical; maturity: prose-governed` | `#mcp #policy #canonical` | Keine Runtime-Claims ableiten |
| `docs/workflows/` | high | Runbook-/Workflow-Wissen | `zone: operational-playbook; authority: canonical; parent: WORKFLOW.md` | `#workflow #playbook #gates` | Gute Obsidian-Navigation |
| `docs/ui-ux-composition/` | medium | Reiche branch-spezifische Wissensbasis | `zone: derived-knowledge; authority: advisory; parent: docs/ui-ux-composition-branch.md` | `#ui-ux #derived #design-system` | Derived sichtbar machen |
| `docs/model-agnostic-core-prompt-system.md` | review-only | Sehr langes canonical design document mit Prompt-Anteilen | `zone: canonical-source; authority: canonical; llm_processing: review-only` | `#prompt-core #canonical #review-needed` | Nur kuratierte Abschnitts-Maps |
| `core/contracts/` | medium | Wichtigste maschinenlesbare Quelle | `zone: canonical-source; authority: canonical; content_type: contract` | `#contracts #canonical #machine-readable` | Pointer statt Kopie |
| `core/skills/` | high | Portable Skill-Wissensbasis | `zone: operational-playbook; authority: portable; llm_processing: yes` | `#skills #portable #playbook` | Sehr guter LLM-Wiki-Kandidat |
| `skills/` | medium | Legacy/Compatibility Skills | `zone: compatibility-mirror; authority: compatibility; llm_processing: review-only` | `#skills #compatibility #legacy` | Nicht gleichrangig mit `core/skills/` |
| `.agents/skills/` | medium | Lokale Control-Plane-Skills | `zone: operational-playbook; authority: local-only; llm_processing: review-only` | `#skills #local-only #routing` | Nicht exportieren |
| `memory/` | review-only | Non-canonical Memory Skeleton | `zone: needs-human-review; authority: non-canonical; privacy: mixed` | `#memory #review-needed #local` | Scopeweise entscheiden |
| `memory/policies/` | medium | Klare Memory-Regeln | `zone: operational-playbook; authority: operational; privacy: internal` | `#memory #policy #playbook` | Mit canonical Contract verlinken |
| `memory/scopes/` | review-only | Operator/project/runtime Scopes | `zone: private-or-local; authority: non-canonical; privacy: review` | `#memory #privacy #scope` | Operator-Scope default exclude |
| `templates/codex-workflow/` | high | Wiederverwendbare Vorlagen | `zone: template-source; authority: operational; status: active` | `#template #workflow #output-contract` | Gute Overlay-Map |
| `templates/discord-fetch-mcp/` | review-only | Template mit secret-naher Env-Beispielkategorie | `zone: template-source; authority: template; llm_processing: review-only` | `#template #mcp #secret-near` | `.env*` nicht in Kontext |
| `templates/qwen-bootstrap/` | review-only | Provider/bootstrap template | `zone: template-source; authority: template; provider: qwen; llm_processing: review-only` | `#template #provider #qwen` | Nicht als Live-Konfig lesen |
| `examples/` | medium | Bounded examples | `zone: derived-knowledge; authority: example; llm_processing: yes` | `#examples #derived` | Mit canonical Quelle rueckverlinken |
| `repo-skill-libraries/` | review-only | Importiertes Projektwissen | `zone: project-import; authority: derived; privacy: review` | `#project-import #review-needed` | Freigabe/Owner noetig |
| `providers/` | low | Generated/export + adapter docs | `zone: generated-output; authority: derived-export; llm_processing: review-only` | `#provider #generated #export` | Keine canonical Summary ohne Contract-Link |
| `contracts/` | low | Compatibility mirrors | `zone: compatibility-mirror; authority: mirror; llm_processing: review-only` | `#contracts #compatibility #mirror` | Nur pointer-only |
| `evals/` | medium | Testfixtures und evidence | `zone: runtime-evidence; authority: validator-backed; llm_processing: review-only` | `#evals #evidence #fixtures` | Synthetic fixture policy beachten |
| `policies/` | high | Machine-readable policy layer | `zone: canonical-source; authority: canonical-linked; llm_processing: review-only` | `#policy #canonical #machine-readable` | Mit prose authority verlinken |
| `runtime/` | low | Code/Runnable boundary | `zone: runtime-evidence; authority: implementation; llm_processing: review-only` | `#runtime #implementation #review-needed` | Keine Aktivierungsclaims uebernehmen |
| `scripts/tools/` | medium | Enforced truth via validators | `zone: operational-playbook; authority: enforced; llm_processing: review-only` | `#tools #validators #evidence` | Tool-Gates statt Code kopieren |
| `artifacts/runtime-runs/` | exclude | Local generated run state | `zone: runtime-evidence; authority: generated; privacy: local; llm_processing: no` | `#runtime #logs #exclude` | Nur redigierte summaries |
| `.codex/` | exclude | Lokaler App-/Tool-State | `zone: exclude-from-llm-context; privacy: local; llm_processing: no` | `#exclude #local` | Nicht indexieren |
| `.git/` | exclude | VCS internals/history | `zone: exclude-from-llm-context; privacy: local; llm_processing: no` | `#exclude #git` | Nur explizite Git-Review-Befehle |

## 5. Authority Collision Risks

### Collision 1
- Existing path: `core/contracts/` vs `contracts/`
- Collision: Canonical machine-readable contracts liegen in `core/contracts/`; `contracts/` enthaelt Compatibility Mirrors.
- Why it matters: Ein Wiki kann beide als gleichrangige Contract-Quelle indexieren.
- Safe interpretation: `core/contracts/` ist canonical; `contracts/` ist mirror/pointer-only.
- Human review question: Soll jede Mirror-Seite automatisch einen canonical-source Link anzeigen muessen?

### Collision 2
- Existing path: `core/skills/` vs `skills/`
- Collision: Portable skills und legacy/contract-bound shared skills liegen in verschiedenen Zonen mit aehnlicher Form.
- Why it matters: Ein LLM koennte legacy Skill-Inhalte als canonical portable surface behandeln.
- Safe interpretation: `core/skills/` zuerst; `skills/` als compatibility oder contract-bound nur mit klarer Markierung.
- Human review question: Welche `skills/`-Eintraege duerfen spaeter promoted oder nur gespiegelt werden?

### Collision 3
- Existing path: `.agents/skills/` vs portable skills
- Collision: Repo-lokale Control-Plane-Skills sehen formal wie wiederverwendbare Skills aus.
- Why it matters: Lokale Routingregeln koennten in andere Repos exportiert werden.
- Safe interpretation: `.agents/skills/` ist `local-only` und nur fuer dieses Repo.
- Human review question: Soll `local-only` in jeder Wiki-Ansicht vor Skill-Namen sichtbar sein?

### Collision 4
- Existing path: `docs/`
- Collision: Ein physischer Ordner enthaelt canonical, operational, derived und archive Dateien.
- Why it matters: Ordnerpfad allein reicht nicht, um Authority zu bestimmen.
- Safe interpretation: `Class:` und `Use rule:` schlagen den physischen Pfad.
- Human review question: Soll ein Index alle Docs zuerst nach `Class:` und erst danach nach Pfad sortieren?

### Collision 5
- Existing path: `memory/`
- Collision: Memory-Skeleton beschreibt operator, project, runtime und decision-candidate Scopes.
- Why it matters: Private/operatorische Informationen koennten als Projektwissen erscheinen.
- Safe interpretation: `memory/` ist non-canonical und default review-only; operator scope default exclude.
- Human review question: Welche Memory-Scopes sind LLM-readable, welche bleiben privat?

### Collision 6
- Existing path: `providers/`
- Collision: Provider export bundles sind generated/derived, koennen aber canonical wirken.
- Why it matters: Generated exports koennen von canonical contracts abweichen oder veraltet sein.
- Safe interpretation: Provider exports sind nur Projektionen; canonical Quelle bleibt `core/contracts/`.
- Human review question: Soll das Wiki generated provider exports nur ueber eine Export-Map zeigen?

### Collision 7
- Existing path: `docs/tool-contracts/catalog.json` vs `core/contracts/tool-contracts/catalog.json`
- Collision: Beide sehen wie Tool-Catalogs aus.
- Why it matters: Der docs-Catalog ist Compatibility/Export, nicht canonical truth.
- Safe interpretation: `core/contracts/tool-contracts/catalog.json` ist canonical machine-readable; `docs/tool-contracts/catalog.json` ist mirror/export.
- Human review question: Soll der Compatibility-Catalog aus normalen Suchergebnissen ausgeschlossen werden?

### Collision 8
- Existing path: `templates/qwen-bootstrap/` and `docs/qwen-3-6-intro.md`
- Collision: Provider-/Bootstrap-Material kann als repo-neutrale Policy gelesen werden.
- Why it matters: Provider-specific posture darf die provider-neutrale Core-Governance nicht ueberschreiben.
- Safe interpretation: Qwen-Material ist provider-advisory/template-source, sofern keine canonical contract path es belegt.
- Human review question: Welche Provider-spezifischen Notizen duerfen in das LLM-Wiki?

### Collision 9
- Existing path: `examples/` vs `templates/`
- Collision: Beispiele koennen wie Vorlagen wirken; Vorlagen koennen wie ausgefuellte Outputs wirken.
- Why it matters: Ein LLM koennte Beispielentscheidungen auf neue Aufgaben uebertragen.
- Safe interpretation: Templates sind reusable scaffold; Examples sind derived demonstrations.
- Human review question: Soll jedes Example einen `do-not-treat-as-authority` Marker bekommen?

### Collision 10
- Existing path: `runtime/` and `artifacts/runtime-runs/`
- Collision: Runtime code, command docs und generated run evidence liegen im selben Themenbereich.
- Why it matters: Code-Vorhandensein beweist nicht automatisch aktivierte Runtime-Faehigkeit.
- Safe interpretation: Claims nur aus docs/authority-matrix plus Validator-/Run-Evidence ableiten.
- Human review question: Welche Runtime-Artefakte duerfen nach Redaction in ein Wiki?

## 6. Suggested Non-Migrating Wiki Overlay

Diese Overlay-Struktur ist ein spaeterer Vorschlag. Sie referenziert bestehende Pfade und verschiebt nichts.

```text
wiki-overlay/
  index.md
  authority-map.md
  path-map.md
  skill-map.md
  workflow-map.md
  template-map.md
  generated-output-map.md
  private-exclusion-map.md
  project-import-map.md
  frontmatter-schema.md
```

| Overlay-Datei | Zweck | Referenzierte bestehende Pfade | Darf nicht kopieren | Vorher noetige menschliche Entscheidung |
| --- | --- | --- | --- | --- |
| `index.md` | Einstieg in das Overlay | `README.md`, `docs/README.md`, `WORKFLOW.md` | Volltexte canonical docs | Ist Overlay im Repo oder separatem Vault? |
| `authority-map.md` | Authority-Klassen und Rangfolge | `AGENTS.md`, `docs/architecture.md`, `docs/authority-matrix.md`, `docs/governance/` | Generated exports als Authority | Soll `Class:` Pflichtmetadatum sein? |
| `path-map.md` | Pfad-zu-Zone-Tabelle | Diese Mapping-Datei, Root-Pfade | Inhalte privater/excluded Bereiche | Welche Zonen sind final? |
| `skill-map.md` | Skills nach portable, compatibility, local-only | `core/skills/`, `skills/`, `.agents/skills/` | Skill-Bodies ohne Statuskontext | Wie werden legacy Skills gerankt? |
| `workflow-map.md` | Workflow-Klassen, Gates, Templates | `WORKFLOW.md`, `docs/workflows/`, `core/contracts/workflow-routing-map.json` | Contract JSON als Prosaersatz | Soll JSON nur pointer-first erscheinen? |
| `template-map.md` | Vorlagen und Beispiele trennen | `templates/codex-workflow/`, `examples/codex-workflow/` | Ausgefuellte private Outputs | Welche Templates sind public/internal? |
| `generated-output-map.md` | Generated/derived Exports sichtbar machen | `providers/`, `contracts/`, `docs/tool-contracts/`, `evals/` | Generated JSON-Vollkopien | Wie werden stale/generated Zustände markiert? |
| `private-exclusion-map.md` | Exclusion-Regeln und Review-Gates | `.git/`, `.codex/`, `.env*`, `artifacts/runtime-runs/`, `memory/scopes/` | Inhalte der ausgeschlossenen Pfade | Welche Ausnahmen sind erlaubt? |
| `project-import-map.md` | Importiertes Projektwissen kontrollieren | `repo-skill-libraries/` | Projektinterne Details ohne Freigabe | Welche Projektimporte sind LLM-readable? |
| `frontmatter-schema.md` | Vorschlag fuer Obsidian/LLM-Metadaten | Alle Zonen | Bestehende Dateien ohne Freigabe veraendern | Soll Frontmatter als Overlay oder in Originaldateien leben? |

## 7. Exclusion Rules

| Pattern / Path | Grund | Ausnahme moeglich? | Review-Bedingung |
| --- | --- | --- | --- |
| `.git/` | VCS-Interna und Historie koennen entfernte/private Inhalte enthalten | ja | Nur explizite Git-Review-Aufgabe mit konkretem Befehl und Ergebniszusammenfassung |
| `.codex/` | Lokaler App-/Tool-State; potenziell private Session-/Konfigurationsdaten | nein, default | Nur wenn ein konkretes, nicht-sensibles Manifest ausdruecklich freigegeben wird |
| `.obsidian/` | Falls spaeter vorhanden: lokale Vault-Konfiguration und Plugins | review-only | Nur Struktur/Plugin-Kategorien, keine privaten Sync- oder Plugin-State-Inhalte |
| `.env` und echte `.env*` | Secret-nahe oder secret-tragende Runtime-Konfiguration | nein | Keine Aufnahme; nur `.env.example` nach Secret-Scan und Review |
| `templates/**/.env.example` | Beispiel, aber secret-nah | ja | Nur Pfad/Kategorie und redigierte Variablennamen; keine echten Werte |
| `artifacts/runtime-runs/` | Generated Runtime-State und potenzielle private Logs | ja | Nur redigierte, reviewed Summary; keine Rohartefakte |
| `memory/scopes/operator.md` | Operator-nahe, potenziell private Praeferenzen | ja | Explizite menschliche Freigabe pro Abschnitt |
| `memory/stores/jsonl/` | Durable/local memory store skeleton oder spaetere Eintraege | nein | Nur Schema/Policy, keine Eintragsinhalte |
| `repo-skill-libraries/` | Aus externen lokalen Projekten abgeleitet | ja | Owner/Freigabe, Aktualitaet und Privatheit geklaert |
| `providers/*/export.json` | Generated exports, koennen gross und derived sein | ja | Pointer-only oder maschinell erzeugte Metadata-Summary |
| `contracts/*.json` | Compatibility mirrors | ja | Nur mit canonical link zu `core/contracts/*` |
| `evals/fixtures/` | Synthetic/test data, nicht Projekttruth | ja | Nur als Testfixture markiert; Secret policy beachten |
| echte Logs ausserhalb `audit/` | Koennen private oder transient Daten enthalten | ja | Redaction, Zweck und Retention geklaert |
| Secret-nahe Dateinamen `*secret*`, `*token*`, `*credential*` | Hohe Fehlaufnahme-Gefahr | review-only | Secret-Scan und menschliche Freigabe; Inhalte nicht kopieren |

## 8. Human Review Checklist

1. Ist dieser Repo-Root der einzige Scope fuer das Wiki-Overlay? ja/nein
2. Soll ein separates Vault/Overlay ausserhalb des Repos entstehen? ja/nein
3. Darf `README.md` als oberster Wiki-Einstieg dienen? ja/nein
4. Soll `AGENTS.md` als hoechste lokale Authority im Wiki markiert werden? ja/nein
5. Soll `Class:` als Pflichtfeld fuer alle Docs im Wiki-Index gelten? ja/nein
6. Sollen Dateien ohne `Class:` automatisch `needs-human-review` werden? ja/nein
7. Darf `core/contracts/` von LLMs direkt gelesen werden? yes/review-only/no
8. Duerfen Contract-JSONs zusammengefasst werden oder nur pointer-first erscheinen? summary/pointer-only
9. Soll `core/skills/` als LLM-readable gelten? ja/nein
10. Soll `skills/` niedriger gerankt werden als `core/skills/`? ja/nein
11. Sollen `.agents/skills/` in einem Wiki sichtbar sein? yes/review-only/no
12. Duerfen `docs/ui-ux-composition/` Dateien als derived Wiki-Wissen erscheinen? ja/nein
13. Welche `docs/ui-ux-composition/` Subfolder sind geeignet: `MODULES`, `POLICIES`, `TEST_CASES`, `EXAMPLES`?
14. Soll `docs/model-agnostic-core-prompt-system.md` nur abschnittsweise indexiert werden? ja/nein
15. Duerfen Prompt-nahe Inhalte in `templates/qwen-bootstrap/` verarbeitet werden? yes/review-only/no
16. Duerfen `templates/discord-fetch-mcp/` Inhalte ausser README verarbeitet werden? yes/review-only/no
17. Sollen `.env.example` Dateien grundsaetzlich excluded bleiben? ja/nein
18. Duerfen `examples/` als LLM-Kontext verwendet werden? yes/review-only/no
19. Duerfen `repo-skill-libraries/` Inhalte in ein Wiki? yes/review-only/no
20. Wer bestaetigt Owner/Freigabe fuer importiertes Projektwissen?
21. Duerfen `memory/policies/` in ein Wiki? ja/nein
22. Duerfen `memory/scopes/project.md` und `memory/scopes/runtime.md` in ein Wiki? yes/review-only/no
23. Bleibt `memory/scopes/operator.md` default excluded? ja/nein
24. Duerfen generated provider exports indexiert werden? metadata-only/review-only/no
25. Sollen Runtime-Artefakte nur nach Redaction in Summaries erscheinen? ja/nein
26. Soll es ein `frontmatter-schema.md` als Overlay-Datei geben? ja/nein
27. Wird Frontmatter in Originaldateien geschrieben oder nur im Overlay gepflegt? original/overlay-only
28. Soll ein Exclusion-Map-Check vor jeder LLM-Wiki-Aufnahme Pflicht sein? ja/nein
29. Welche Zonen sind fuer automatische Zusammenfassung erlaubt: canonical-source, operational-playbook, derived-knowledge, template-source?
30. Welche Zonen duerfen niemals kopiert werden: exclude-from-llm-context, private-or-local, runtime-evidence raw?

## 9. Recommended Next Iteration

1. Recommended: Diese Mapping-Datei menschlich reviewen und die Zonen `LLM-readable`, `review-only` und `exclude` final freigeben.
2. Recommended: Ein Frontmatter-Konzept als Overlay-only Entwurf definieren, ohne bestehende Dateien zu veraendern.
3. Recommended: Eine Exclusion-Map fuer `.git/`, `.codex/`, `.env*`, Runtime-Artefakte, operator memory und project imports als Gate verwenden.
4. Recommended: Eine `path-map`/`authority-map` als nicht-migrierendes Overlay planen, das nur auf bestehende Pfade zeigt.
5. Recommended: `docs/model-agnostic-core-prompt-system.md`, `memory/` und `repo-skill-libraries/` separat priorisiert reviewen, bevor diese Bereiche LLM-readable werden.

## 10. Evidence

- Observed files: `AGENTS.md`, `WORKFLOW.md`, `docs/architecture.md`, `docs/README.md`, `core/skills/repo-audit/SKILL.md`, `audit/local-obsidian-audit-log.md`.
- Observed command: `rg -n '^Class:|^Use rule:' AGENTS.md WORKFLOW.md README.md CHANGELOG.md docs/*.md docs/**/*.md memory/*.md templates/codex-workflow/*.md examples/codex-workflow/*.md` -> vorhandene Class-/Use-rule-Signale fuer zentrale Markdown-Flächen.
- Observed command: `find . -path ./.git -prune -o -path ./.codex -prune -o -type d -maxdepth 3 -print` -> Hauptstruktur ohne inhaltliches Lesen von `.git/` und `.codex/`.
- Observed command: `find . -path ./.git -prune -o -path ./.codex -prune -o -type f \( -name '.env' -o -name '.env.*' -o -name '*secret*' -o -name '*token*' -o -name '*credential*' \) -print` -> secret-nahe Pfadkategorien identifiziert, ohne Inhalte zu uebernehmen.
- Observed command: `npm run scan-secrets` -> `ok: true`, `findingCount: 0`.
- Observed command: `find artifacts/runtime-runs -maxdepth 3 -type f -print` -> nur `.gitkeep` im aktuellen Audit-Scope beobachtet.
- Observed command: `test -d .git`, `test -d .codex`, `test -d .obsidian` -> `.git/` und `.codex/` existieren; `.obsidian/` wurde nicht beobachtet.
- Ausgelassene Bereiche: `.git/`, `.codex/`, echte Runtime-State-Inhalte, echte `.env*`-Inhalte, vollstaendige Code-/JSON-Semantik in `runtime/`, `scripts/tools/`, `providers/` und `core/contracts/`.
- Inferred statt observed: Obsidian-Eignung, Frontmatter-Vorschlaege, Prioritaet einzelner Wiki-Zonen und spaetere Overlay-Dateien.
- Unresolved risks: Menschliche Freigabe fuer project imports, operator memory, generated runtime evidence und provider-/template-nahe Flächen steht aus.

