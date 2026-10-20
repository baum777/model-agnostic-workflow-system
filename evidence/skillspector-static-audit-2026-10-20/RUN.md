# SkillSpector Static Audit Run — 2026-10-20 (Evidence Retention Copy)

**Audit run ID:** `skillspector-static-audit-2026-10-20`
**Status:** CLOSED_AS_HISTORICAL_AUDIT_RUN (evidence retained; temporary audit vehicle PR #15 closed without merge)

## What this run is

A one-shot, static-only security audit of this repository executed through three
temporary GitHub Actions workflows on draft PR #15
(`audit/skillspector-static-20261020`, head `8825a0e14390eee34d11267f1f34ada7e62df0fb`),
per closure plan A1 of 2026-10-20. The workflows were a temporary audit vehicle
and were never merged to `main`.

- **Audited source (immutable):** `d7c84914ea3ba339a0a96454dd06fa18904527d0`
- **Scanner:** NVIDIA/SkillSpector v2.12.0, pinned to commit `95a52d89fa16f608f0b18ccee76b0918ea4b7eef`
- **Mode:** static only (`--no-llm`), no repository write permission, isolated runner, no secrets
- **Scope:** whole-repository attempt plus each of the 80 discovered `SKILL.md` directories,
  including the explicitly marked known-risk test fixture `tests/fixtures/risky_skill`

## Canonical Actions evidence (retention-limited; copied verbatim below)

| Surface | Run | Artifact ID | Archived under |
| --- | --- | --- | --- |
| NVIDIA SkillSpector static scan | [39348636394](https://github.com/baum777/model-agnostic-workflow-system/actions/runs/39348636394) (conclusion `failure` = by-design exit on 2 non-clean entries) | `12232616376` (`skillspector-static-maws-20261020`, 195297 B, 14-day retention) | `artifacts/skillspector-static-maws-20261020/` |
| Full-source audit snapshot | [39348636408](https://github.com/baum777/model-agnostic-workflow-system/actions/runs/39348636408) (snapshot job success; tests job executed, artifact upload failed — see gap below) | `12231708479` (`maws-full-source-audit-d7c84914`, 1271629 B, 7-day retention) | `artifacts/maws-full-source-audit-d7c84914/` |
| Comprehensive eval verification | [39348636467](https://github.com/baum777/model-agnostic-workflow-system/actions/runs/39348636467) (success) | `12231823321` (`maws-eval-verification-d7c84914`, 5059 B, 7-day retention) | `artifacts/maws-eval-verification-d7c84914/` |

Superseded earlier waves on prior branch heads (same conclusions, retained on
Actions until their retention expires, not re-archived): runs `39346473587`,
`39347870360`, `39347870437` with artifacts `12231473001`, `12231571077`,
`12231598457`, `12232041555`.

## Evidence inventory

- `artifacts/skillspector-static-maws-20261020/` — 80 raw per-target SkillSpector
  JSON reports plus `audit-summary.json`, byte-verbatim from the Actions artifact.
  These are the **original scanner warnings** and are preserved unchanged; all
  downstream adjudication lives in separate documents.
- `artifacts/maws-full-source-audit-d7c84914/` — `maws-source.zip` (complete
  tracked tree of `d7c84914`), `tracked-files.txt` (795 files), `commit-sha.txt`,
  `archive-sha256.txt`. Integrity re-verified at archival time:
  downloaded zip SHA-256 `49e560e11536d68e64f057add878e4a9bd381369f8a3f43df1bfe48d902ffdf0`
  matches the value recorded by the workflow.
- `artifacts/maws-eval-verification-d7c84914/` — eval matrix logs and exit codes
  on `d7c84914` (observed): `eval_maws-vnext`, `eval_secret-boundary`,
  `eval_provider-export-alignment`, `test_activation` exit 0; `eval` exit 1.
  Post-repair eval gates were re-verified separately through PR #18 CI
  (see `FINDINGS_LEDGER.md`).
- `artifacts/maws-audit-tests-joblog-39348636408.txt` — full log of the
  full-source `tests` job (job `118387250618`), containing the per-task
  `tail -40` excerpts and step outcomes.
- `rescan-f6621251/` — post-repair rescan (closure plan A4), see below.
- `FINDINGS_LEDGER.md` — audit findings F-01..F-07 reconciled against repair PR #18.
- `GATE_VERIFICATION.md` — closure gate (A5): 56 incomplete analyses and the
  seven HIGH findings adjudicated, residual work recorded.
- `registry-disposition.json` — validated `registry-disposition.v1` record for this run.

## Known evidence gap (tests artifact)

The `tests` job of run `39348636408` executed all npm tasks but its artifact
upload step failed: upload-artifact v4 rejects file names containing `:`
(`test:skill-frontdoor.exit` etc.), so the artifact
`maws-audit-test-results-d7c84914` was never published (run artifact count = 1).
Mitigation: the complete job log (archived above) contains the per-task tails
and step results; the eval-verification artifact covers the evaluation matrix;
the audited source snapshot permits local reproduction at any time.

## Post-repair rescan (A4)

`rescan-f6621251/` holds a local re-execution of the pinned scanner
(NVIDIA/SkillSpector v2.12.0, `--no-llm`) against repair merge commit
`f66212514483fc39770e8db4615731d736b379ef` (PR #18), executed 2026-10-20 with
split scopes and a 600-second per-target budget — the original whole-repository
target had timed out at 120 s in Actions:

- directory scopes: `runtime/`, `scripts/`, `providers/`
- every `SKILL.md` directory (80 targets), including the marked test fixture

See `rescan-f6621251/rescan-summary.json` for the machine-readable record.
Top-level scopes outside the named set (e.g. `core/`, `tools/`, `templates/`,
`tests/`, `docs/`, `sandbox/`) were not part of the A4 scope and remain residual
coverage if a whole-tree static pass is wanted.

## Registry relevance

Evidence-retention and PR-closure documentation only; no adopted
registry-disposition class (`CONTRACT_RECORD`, `PROVENANCE`, `SUPERSESSION`)
changed. Disposition: `NO_CHANGE` — see `registry-disposition.json`
(validated with `scripts/tools/validate-registry-disposition.mjs`).
