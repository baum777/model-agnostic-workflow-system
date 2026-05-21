# Local LLM-Wiki Overlay Spec

## 1. Overlay-Ziel

Ziel ist ein nicht-migrierendes Overlay-Konzept fuer ein lokales LLM-Wiki / Obsidian-kompatibles Indexsystem. Das Overlay darf bestehende Repo-Pfade nur referenzieren und mit Metadaten klassifizieren. Es darf keine bestehenden Dateien veraendern, keine Inhalte verschieben, keine Repo-Struktur umbauen und keine neuen Authority-Quellen erfinden.

Das Overlay soll falsche Autoritaetslesung verhindern:

- canonical source bleibt canonical source.
- operational playbook bleibt abhaengig von canonical source.
- derived knowledge bleibt non-canonical.
- compatibility mirror bleibt mirror.
- generated output bleibt generated.
- private/local und excluded bleiben ausserhalb des LLM-Kontexts.

Nicht-Ziele:

- kein echtes Obsidian-Vault aus diesem Repo machen
- keine Migration nach `wiki/`, `raw/`, `personal/` oder aehnlichen Zonen
- kein Frontmatter in Originaldateien schreiben
- keine Inhalte aus ausgeschlossenen Pfaden lesen, kopieren oder zusammenfassen

## 2. Geplante Overlay-Dateien

Diese Dateien sind nur geplant. Diese Spezifikation erstellt sie nicht.

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

| Geplante Datei | Zweck | Inhaltstyp | Copy Policy | Status |
| --- | --- | --- | --- | --- |
| `wiki-overlay/index.md` | Einstieg in das Overlay | Pointer und kurze Orientierung | pointer-only | proposed |
| `wiki-overlay/authority-map.md` | Authority-Rangfolge und Klassen sichtbar machen | Map / Metadaten | pointer-only | proposed |
| `wiki-overlay/path-map.md` | Bestehende Pfade auf Zonen abbilden | Tabelle / Metadaten | pointer-only | proposed |
| `wiki-overlay/skill-map.md` | Portable, compatibility und local-only Skills trennen | Map / Metadaten | pointer-only | proposed |
| `wiki-overlay/workflow-map.md` | Workflow-Quellen, Gates und Templates verbinden | Map / Metadaten | pointer-only | proposed |
| `wiki-overlay/template-map.md` | Templates und Examples trennen | Map / Metadaten | pointer-only | proposed |
| `wiki-overlay/generated-output-map.md` | Generated, mirror und export Flächen sichtbar machen | Map / Metadaten | pointer-only / metadata-only | proposed |
| `wiki-overlay/private-exclusion-map.md` | Harte Ausschluesse und Review-Gates festhalten | Gate Map | no-copy | proposed |
| `wiki-overlay/project-import-map.md` | Project imports kontrolliert bewerten | Review Map | pointer-only / review-only | proposed |
| `wiki-overlay/frontmatter-schema.md` | Overlay-only Frontmatter-Felder definieren | Schema-Vorschlag | no original edits | proposed |

## 3. Erlaubte Quellen pro Overlay-Datei

| Overlay-Datei | Erlaubte Quellen | Erlaubte Verarbeitung | Bedingung |
| --- | --- | --- | --- |
| `index.md` | `README.md`, `docs/README.md`, `WORKFLOW.md`, `audit/local-llm-wiki-review-decisions.md` | Pointer und Kurzorientierung | Keine Volltextkopie canonical docs |
| `authority-map.md` | `AGENTS.md`, `WORKFLOW.md`, `docs/architecture.md`, `docs/authority-matrix.md`, `docs/governance/`, `docs/mcp/` | Authority-Pointer, Class-/Use-rule-Metadaten | Canonical bleibt Quelle; Overlay bleibt Index |
| `path-map.md` | `audit/local-llm-wiki-path-mapping.md`, `audit/local-llm-wiki-review-decisions.md` | Pfad-zu-Zone-Metadaten | Keine Verarbeitung ausgeschlossener Pfade |
| `skill-map.md` | `core/skills/`, `skills/`, `.agents/skills/`, `core/skills/README.md` | Skill-ID, Scope, Authority-Status, Pointer | Keine Skill-Promotion; local-only sichtbar markieren |
| `workflow-map.md` | `WORKFLOW.md`, `docs/workflows/`, `templates/codex-workflow/`, `core/contracts/workflow-routing-map.json` | Workflow-Klasse, Gate, Template-Pointer | Contract JSON nur pointer-first / metadata-only |
| `template-map.md` | `templates/codex-workflow/`, `examples/codex-workflow/`, `examples/` | Template-vs-example-Metadaten | Examples als derived markieren |
| `generated-output-map.md` | `providers/`, `contracts/`, `docs/tool-contracts/`, `evals/`, `core/contracts/` | Generated/mirror/export Marker und canonical links | Keine generated JSON-Vollkopien |
| `private-exclusion-map.md` | `audit/local-llm-wiki-review-decisions.md`, `audit/local-llm-wiki-path-mapping.md` | Exclusion-Regeln und Pfadpatterns | Keine Inhalte aus excluded Pfaden |
| `project-import-map.md` | `repo-skill-libraries/README.md`, `repo-skill-libraries/summary-comparison.md` | Review-Status, Owner/Freigabe-Felder, Pointer | Keine Project-Import-Inhalte ohne Freigabe kopieren |
| `frontmatter-schema.md` | `audit/local-llm-wiki-review-decisions.md`, `audit/local-llm-wiki-path-mapping.md` | Schema-Vorschlag und Enum-Werte | Overlay-only; keine Originaldatei-Edits |

## 4. Verbotene Quellen pro Overlay-Datei

| Overlay-Datei | Verbotene Quellen | Grund |
| --- | --- | --- |
| alle Overlay-Dateien | `.git/`, `.codex/`, echte `.env*`, private logs, raw secrets, tokens, credentials | hard exclusion |
| alle Overlay-Dateien | raw runtime artifacts unter `artifacts/runtime-runs/` | runtime evidence darf nur redigiert und reviewed erscheinen |
| alle Overlay-Dateien | `memory/scopes/operator.md` und operator memory | privatheitsnah |
| alle Overlay-Dateien | nicht freigegebene project imports | Owner/Freigabe fehlt |
| `authority-map.md` | generated provider exports als Authority | generated output ist keine canonical source |
| `skill-map.md` | Skill-Bodies ohne Scope-/Authority-Kontext | kann portable, compatibility und local-only vermischen |
| `workflow-map.md` | Contract JSON als Prosaersatz | JSON bleibt machine-readable source |
| `template-map.md` | secret-nahe Template-Dateien wie `.env.example` | secret-nahe Kategorie |
| `generated-output-map.md` | Vollkopien aus `providers/*/export.json` oder compatibility JSONs | generated/mirror Inhalte sollen pointer-only bleiben |
| `project-import-map.md` | Detailinhalte aus nicht freigegebenen Projektbibliotheken | project-import review fehlt |
| `frontmatter-schema.md` | automatische Frontmatter-Einfuegung in Originaldateien | Frontmatter Policy ist overlay-only |

## 5. Frontmatter-Schema als Vorschlag

Dieses Schema ist overlay-only. Es darf nicht automatisch in Originaldateien geschrieben werden.

```yaml
zone: canonical-source | operational-playbook | derived-knowledge | compatibility-mirror | generated-output | template-source | runtime-evidence | private-or-local | project-import | archive-reference | exclude-from-llm-context | needs-human-review
authority: canonical | operational | derived | archive | compatibility | generated | local-only | private | mixed | unknown
source_path: "relative/path/from/repo/root"
llm_processing: yes | no | review-only
summary_allowed: yes | no | review-only
wiki_allowed: yes | no | pointer-only | review-only
copy_policy: pointer-only | metadata-only | no-copy | redacted-summary-only
privacy: public | internal | private | local | review
maturity: prose-governed | contract-backed | validator-backed | runtime-implemented | not-claimed
status: active | proposed | review-only | excluded | archived
canonical_source: "relative/path/or-null"
review_gate: none | human-review-required | exclusion-lock | owner-approval-required
notes: "short rationale"
```

Required fields for every overlay entry:

- `zone`
- `authority`
- `source_path`
- `llm_processing`
- `wiki_allowed`
- `copy_policy`
- `privacy`
- `status`
- `review_gate`

Default values:

- Unknown or mixed path: `zone: needs-human-review`
- Generated or mirror path: `copy_policy: pointer-only`
- Private/local path: `llm_processing: no`
- Excluded path: `wiki_allowed: no`
- Canonical JSON contract: `copy_policy: metadata-only`

## 6. Exclusion-Gates

Gate 0: Hard exclusion check

- Reject any source under `.git/`.
- Reject any source under `.codex/`.
- Reject real `.env*` files.
- Reject raw runtime artifacts.
- Reject operator memory.
- Reject private logs.
- Reject non-freigegebene project imports.

Gate 1: Authority check

- Determine whether the source is canonical, operational, derived, archive, compatibility, generated, local/private, template, or runtime evidence.
- If authority is mixed or missing, assign `needs-human-review`.

Gate 2: Copy policy check

- Canonical source: pointer-first.
- Machine-readable contracts: metadata-only.
- Generated output: pointer-only.
- Runtime evidence: redacted-summary-only after review.
- Private/local: no-copy.

Gate 3: LLM processing check

- `yes` only for approved canonical/operational/derived/template surfaces with restrictions.
- `review-only` for generated, compatibility, runtime, project-import and mixed paths.
- `no` for hard exclusions and private/local paths.

Gate 4: Human review check

- No file under `wiki-overlay/` may be created from `review-only` or `needs-human-review` sources unless the future prompt states the accepted decision file and exact allowed source paths.

## 7. Human Review Gates vor jeder spaeteren Datei unter `wiki-overlay/`

Before creating any future file under `wiki-overlay/`, require:

1. Confirm the target file path is new and under `wiki-overlay/`.
2. Confirm no existing repo file will be changed.
3. List every source path to be referenced.
4. Confirm none of the source paths match the Hard Exclusion Lock.
5. Confirm each source has a zone decision from `audit/local-llm-wiki-review-decisions.md`.
6. Confirm the planned output is pointer/map/metadata only.
7. Confirm no generated JSON, runtime artifact, secret, token, credential, private log or operator memory content will be copied.
8. Confirm any `review-only` source has explicit human approval in the prompt.
9. Confirm frontmatter remains overlay-only.
10. Confirm the output states `non-migrating overlay` and `no original file edits`.

If any gate fails, report `BLOCKED` and do not create the `wiki-overlay/` file.

## 8. Evidence

- Observed: User stated `audit/local-llm-wiki-review-decisions.md` was accepted as prerequisite.
- Observed file read: `audit/local-llm-wiki-review-decisions.md`.
- Observed decision: `Overlay Decision: only-after-review`.
- Observed decision: `Frontmatter Policy: overlay-only`.
- Observed decision: hard exclusions include `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs and non-freigegebene project imports.
- Observed command: `test -e audit/local-llm-wiki-overlay-spec.md; echo $?` returned non-existing before write.
- Observed command: `git status --short` before write showed only untracked `audit/`.
- Not read by design: `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs, non-freigegebene project-import details and generated JSON exports.
- Inferred: The safest next implementation shape is a future `wiki-overlay/` containing only pointer/map/metadata files after per-file human review.

