# model-agnostic-workflow-system

Provider-neutrales Shared-Core-Repository fuer governte, agentische Workflow-Artefakte.  
Dieses Repository ist ein Core-/Contract-/Export-/Validation-System, kein Endnutzerprodukt.

## Was dieses Repository ist

Dieses Repo buendelt wiederverwendbare, provider-neutrale Workflow-Bausteine und ihre Governance:

- portable Skills und Skill-Metadaten
- maschinenlesbare Contracts und Registry-Snapshots
- Provider-Adapter-Exporte (canonical + compatibility)
- Validatoren, Build-Skripte und Certification-Evals
- Templates und Beispiele fuer Adoption
- repo-lokale Orchestrierungs-Skills zur Steuerung von Routing/Surface-Entscheidungen

Zielgruppen:

- Maintainer dieses Shared Core
- Consumer-Repositories, die den Core adoptieren
- Provider-/Adapter-Autoren, die Exporte und Packaging-Grenzen pflegen

## Was dieses Repository nicht ist

- keine einzelne Produkt-App oder Endnutzer-UI
- kein reines Codex-Repository
- kein provider-spezifischer Monolith
- kein Ersatz fuer consumer-lokale Governance/Overlay-Dateien
- keine Aussage ueber "live runtime readiness", sofern nicht validator-/artifact-basiert belegt

## Systemmodell / Architektur auf einen Blick

1. Portable Core: Semantik, Skills, Contracts und neutrale Registry (`core/`).
2. Compatibility Mirrors: Uebergangs-/Kompatibilitaetsflaechen fuer aeltere Konsumenten (`skills/`, `contracts/`, legacy `providers/*`, `docs/tool-contracts/catalog.json`).
3. Provider Exports: generierte provider-spezifische Bundles unter `providers/<provider>/export.json`.
4. Governance + Authority: dokumentierte Klassen- und Claim-Logik in `docs/architecture.md` und `docs/authority-matrix.md`.
5. Enforcement/Gates: Validatoren und Evals in `scripts/tools/` und `evals/`.
6. Workflow Entry: root workflow guidance in `WORKFLOW.md` plus repo-lokale Routing-Skills unter `.agents/skills/`.

Wichtig: Das Klassenmodell (canonical/operational/derived/archive) ist logisch; es impliziert keine physische Verzeichnisaufteilung nach diesen Klassen.

## Repository-Struktur (Bedeutung der Hauptverzeichnisse)

- `core/`  
  Provider-neutrale Kernflaeche (Skills, Contracts, Core-Eval-Scaffolding, Overlay-Boundary-Notes).

- `core/contracts/`  
  Canonical machine-readable Contracts:
  - `core-registry.json` (neutraler Registry-Snapshot)
  - `provider-capabilities.json`
  - `output-contracts.json`
  - `tool-contracts/catalog.json`
  - `portable-skill-manifest.json`

- `contracts/`  
  Compatibility Mirrors (u. a. Registry-/Capability-Mirror waehrend Migration).

- `providers/`  
  Adapter-Boundary und Export-Bundles:
  - canonical Adapter: `openai-codex`, `anthropic-claude`, `qwen-code`, `kimi-k2_5`
  - legacy compatibility mirrors: `openai`, `anthropic`, `qwen`, `kimi`, `codex`

- `docs/`  
  Governance-, Authority-, Boundary- und Operations-Dokumentation.

- `evals/`  
  Deterministische Certification-Fixtures und Eval-Katalog (`evals/catalog.json`).

- `scripts/tools/`  
  Validatoren, Registry-/Export-Builder und helper scripts.

- `.agents/skills/`  
  Repo-lokale Control-Plane-Skills (Routing/Surface-Entscheidungen), nicht portable shared skills.

- `skills/`  
  Legacy/compatibility und contract-bound shared skills (inkl. shared-with-local-inputs Muster).

- `templates/`  
  Wiederverwendbare Vorlagen (z. B. `templates/codex-workflow/`, `templates/discord-fetch-mcp/`, `templates/qwen-bootstrap/`).

- `examples/`  
  Beispielartefakte und kleine Referenzbeispiele.

## Authority- und Governance-Modell

Normative Orientierung:

- Root Operating Contract: `AGENTS.md`
- Root Workflow Contract: `WORKFLOW.md`
- Docs-Hierarchie/Regeln: `docs/architecture.md`
- Claim-/Status-Ledger: `docs/authority-matrix.md`
- Source Hierarchy: `docs/governance/source-hierarchy.md`
- MCP Boundary Policy: `docs/mcp/policy.md`

Doc-Klassen:

- canonical
- operational
- derived
- archive

Wichtig: Doc-Klasse und Enforcement-Status sind getrennt.  
Eine canonical Aussage ist nicht automatisch script-enforced. Enforced Truth liegt bei Validatoren/Skripten.

Praktische Regel:

- Bei Konflikt zwischen Prosa und Validator-Verhalten gilt die Enforcement-Surface; Status wird in der Authority-Matrix transparent gemacht.

Capability-Maturity-Labels:

- `prose-governed`
- `contract-backed`
- `validator-backed`
- `runtime-implemented`

Diese Labels beschreiben Reifegrad, nicht die Claim-Status-Werte der Authority-Matrix.

## Portable Core vs Compatibility Mirrors vs Provider Exports

- Portable Core (`core/`)  
  Heimat gemeinsamer Semantik und neutraler Contracts.

- Compatibility Mirrors (`skills/`, `contracts/`, legacy provider dirs, `docs/tool-contracts/catalog.json`)  
  Stabilitaets-/Migrationsflaechen fuer bestehende Consumer; nicht die primaere Quelle neuer Shared-Semantik.

- Provider Exports (`providers/<provider>/export.json`)  
  Generierte Packaging/Transport-Projektion aus neutraler Registry und Provider-Capability-Profilen.

Boundary-Regel:

- Shared-Semantik aendert man im Core.
- Provider-spezifische Packaging-Projektion gehoert in `providers/`.
- Rueckwaertskompatibilitaet bleibt explizit als Mirror markiert.
- `core/contracts/tool-contracts/catalog.json` ist der kanonische machine-readable Tool-Katalog.
- `docs/tool-contracts/catalog.json` bleibt eine explizite compatibility/export surface und ist keine zweite kanonische Tool-Wahrheit.

## Validation, Registry-Build, Export-Build und Evals

Zentrale Kommandos:

- `npm run validate`  
  Repo-Surface-Validation (kombinierte Hauptpruefung).

- `npm run validate-neutral`  
  Neutral-Core-Validation (Registry, Provider-Capabilities, Adapter-Scaffolds, Konsistenz).

- `npm run build-registry`  
  Regeneriert neutralen Registry-Snapshot (+ Mirror).

- `npm run build-exports`  
  Regeneriert Provider-Export-Bundles.

- `npm run eval`  
  Laeuft deterministische Certification-Evals gegen Fixtures.

Wichtige Slices:

- `npm run eval:skill-routing`
- `npm run eval:semantic-layout`
- `npm run eval:render-layout`
- `npm run eval:wcag-a11y`

Render/A11y-Modi:

- certification: lokale Fixtures, deterministisch, blocking
- operator-evidence: externe URLs erlaubt, advisory/non-blocking

## Einstiegspfade

### Fuer neue Maintainer

1. `README.md` (diese Front Door)
2. `AGENTS.md`
3. `WORKFLOW.md`
4. `docs/architecture.md`
5. `docs/authority-matrix.md`
6. `docs/governance/source-hierarchy.md`
7. `docs/mcp/policy.md`
8. `docs/usage.md`
9. `docs/maintainer-commands.md`
10. `docs/validation-checklist.md`

### Fuer Consumer-Repositories

1. `docs/repo-overlay-contract.md`
2. `docs/adoption-playbook.md` (erstmalige Adoption)
3. `docs/consumer-rollout-playbook.md` (bestehender Consumer)
4. Bei contract-bound Skills:
   - `docs/shared-with-local-inputs.md`
   - `docs/repo-intake-skill-contract.md`
   - `docs/runtime-policy-skill-contract.md`
5. Danach: `npm run validate-consumer`

### Fuer Provider-/Adapter-Arbeit

1. `providers/README.md`
2. `docs/portability.md`
3. `docs/provider-capability-matrix.md`
4. `core/contracts/provider-capabilities.json`
5. `npm run build-registry`
6. `npm run build-exports`
7. `npm run validate-neutral`
8. `npm run eval`

## Beispiele, Templates und lokale Repo-Steuerung

- `templates/` und `examples/` sind Support-/Onboarding-Surfaces, nicht canonical Governance.
- Consumer-lokale Overlays bleiben ausserhalb des Shared Core als lokale Verantwortung.
- `.agents/skills/` sind repo-lokale Orchestrierungsregeln dieses Repos; sie sind nicht automatisch portable in Consumer-Repos.
- Optionale Bootstrap-/Overlay-Flaechen (z. B. `.qwen`) sind consumer-lokal und keine globale Shared-Core-Authority.

## Start Here / Next Reading

Core Navigation:

- `docs/README.md`
- `WORKFLOW.md`
- `docs/architecture.md`
- `docs/authority-matrix.md`
- `docs/governance/source-hierarchy.md`
- `docs/mcp/policy.md`
- `docs/usage.md`
- `core/README.md`
- `core/contracts/README.md`
- `contracts/README.md`
- `providers/README.md`
- `evals/README.md`

Boundary-spezifisch:

- Portability: `docs/portability.md`
- Compatibility: `docs/compatibility.md`
- Source Hierarchy: `docs/governance/source-hierarchy.md`
- MCP Policy: `docs/mcp/policy.md`
- Overlay-Trennung: `docs/repo-overlay-contract.md`
- Maintainer-Befehle: `docs/maintainer-commands.md`

## Pflegehinweise (kurz)

- Neue Regeln/Authority nicht parallel an mehreren Stellen normativ definieren.
- Bei neuen oder geaenderten Shared-Semantics immer Core + Validation + relevante Docs gemeinsam aktualisieren.
- Claims zu Readiness/Coverage nur treffen, wenn sie artifact- oder validator-basiert belegt sind.
- Die Phase-1-Spec-Adoption ist ein Overlay auf die aktuelle kanonische Repo-Struktur, nicht die Uebernahme eines zweiten illustrativen Verzeichnisbaums.
