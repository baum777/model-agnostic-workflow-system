---
zone: operational-playbook
authority: operational
source_path: wiki-overlay/path-map.md
llm_processing: yes
summary_allowed: yes
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: prose-governed
status: active
canonical_source: audit/local-llm-wiki-review-decisions.md
review_gate: none
notes: "Pointer-only path map using approved zone decisions; canonical and operational paths prioritized; excluded paths marked no."
generated_at: "2026-05-09T04:52:11+02:00"
overlay_spec_version: "1.0"
---

# Path Map

> non-migrating overlay · no original file edits · pointer-only index

## Zweck
Diese Datei macht bestehende Repo-Pfade als Overlay-Map sichtbar, ohne Inhalte zu kopieren oder Pfade zu veraendern. Sie priorisiert canonical und operational Zonen und markiert ausgeschlossene Pfade explizit mit `no`.

## Scope
- **Zonen**: `canonical-source`, `operational-playbook`, `exclude-from-llm-context`, `private-or-local`, `runtime-evidence`
- **Authority-Klassen**: `canonical`, `operational`, `private`, `generated`, `local`
- **Ausgeschlossen**: `.git/`, `.codex/`, echte `.env*`, raw runtime artifacts, operator memory, private logs, nicht freigegebene project imports. Diese Pfade werden nicht gelesen, nicht kopiert und nicht zusammengefasst.
- **Fokus**: Nur Pfade mit bestehender Zone-Decision aus `audit/local-llm-wiki-review-decisions.md`; canonical und operational zuerst.

## Map / Entries
| Source Path | Zone | Authority | Copy Policy | LLM Processing | Review Gate | Notes |
|-------------|------|-----------|-------------|----------------|-------------|-------|
| `AGENTS.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Root Operating Contract; hoechste lokale Repo-Authority. |
| `README.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Repo-Frontdoor; nicht als vollstaendige Architecture lesen. |
| `WORKFLOW.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Root Workflow Contract; Parent fuer Workflow-Maps. |
| `docs/architecture.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Klassen-, Merge- und Update-Regeln; keine physische Migration daraus ableiten. |
| `docs/authority-matrix.md` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Claim-/Status-Ledger; trennt doc class von enforcement status. |
| `docs/governance/` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Source hierarchy und externe Boundary; externe Inhalte nur als Pointer. |
| `docs/mcp/` | `canonical-source` | `canonical` | `pointer-only` | `yes` | `none` | Canonical MCP Policy; keine Runtime-Claims ableiten. |
| `core/contracts/` | `canonical-source` | `canonical` | `metadata-only` | `yes` | `none` | Machine-readable canonical contracts; JSON nicht als Prosa kopieren. |
| `policies/` | `canonical-source` | `canonical-linked` | `metadata-only` | `yes` | `none` | Machine-readable policy layer; mit prose authority verlinken. |
| `docs/README.md` | `operational-playbook` | `operational` | `pointer-only` | `yes` | `none` | Docs Navigator; Index only, keine Authority. |
| `docs/workflows/` | `operational-playbook` | `canonical` | `pointer-only` | `yes` | `none` | Workflow-Deep-Dives; muss auf `WORKFLOW.md` zurueckverweisen. |
| `core/skills/` | `operational-playbook` | `portable` | `pointer-only` | `yes` | `none` | Portable Skill-Wissensbasis; Skill-Status sichtbar halten. |
| `memory/policies/` | `operational-playbook` | `operational` | `pointer-only` | `yes` | `none` | Memory-Regeln; canonical Memory Contract nicht ersetzen. |
| `templates/codex-workflow/` | `template-source` | `operational` | `pointer-only` | `yes` | `none` | Workflow-Templates; nicht als ausgefuellte Outputs lesen. |

### Excluded / No
| Source Path | Zone | Authority | Copy Policy | LLM Processing | Wiki Allowed | Notes |
|-------------|------|-----------|-------------|----------------|--------------|-------|
| `.git/` | `exclude-from-llm-context` | `local` | `no-copy` | `no` | `no` | VCS internals/history; nur explizite Git-Review-Befehle ausserhalb dieses Overlay-Kontexts. |
| `.codex/` | `exclude-from-llm-context` | `private` | `no-copy` | `no` | `no` | Lokaler App-/Tool-State. |
| `.env` und echte `.env*` | `exclude-from-llm-context` | `private` | `no-copy` | `no` | `no` | Secret-nahe Runtime-Konfiguration. |
| `artifacts/runtime-runs/` | `runtime-evidence` | `generated` | `no-copy` | `no` | `no` | Raw runtime artifacts/logs; nur redigierte reviewed summaries waeren spaeter erlaubt. |
| `memory/scopes/operator.md` | `private-or-local` | `private` | `no-copy` | `no` | `no` | Operator memory ist privatheitsnah. |
| private logs | `exclude-from-llm-context` | `private` | `no-copy` | `no` | `no` | Keine nicht redigierten Runtime-/Tool-Logs. |
| nicht freigegebene project imports | `project-import` | `unknown` | `no-copy` | `no` | `no` | Owner/Freigabe/Aktualitaet fehlt. |

## Pointer-Only References
- [Path Mapping Audit] → `audit/local-llm-wiki-path-mapping.md` – Quelle fuer bestehende Zone-Entscheidungen und Pfadklassifikation.
- [Review Decisions] → `audit/local-llm-wiki-review-decisions.md` – Entscheidungsvorlage fuer approve/review/exclude.
- [Repository Frontdoor] → `README.md` – canonical Frontdoor nach Repo-Konvention.
- [Documentation Navigator] → `docs/README.md` – operational Docs-Index, nicht Authority.

## Open / Review-Required
- [ ] Entscheiden, ob `docs/` pauschal ueber Class-Auswertung in eine spaetere Doc-Map aufgenommen werden darf – physischer Ordner ist mixed.
- [ ] Entscheiden, welche `review-only` Zonen spaeter eigene Maps bekommen: compatibility, generated-output, runtime-evidence, project-import.
- [ ] Entscheiden, ob excluded Pfade in jeder kuenftigen Overlay-Datei wiederholt oder nur in `private-exclusion-map.md` zentral gefuehrt werden.

## Changelog
- `2026-05-09`: initial proposed – Codex overlay generator, basierend auf `audit/local-llm-wiki-path-mapping.md`, `audit/local-llm-wiki-review-decisions.md` und bestaetigten Gates.
