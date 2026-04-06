# Extraction Roadmap

This repository is currently in the first safe extraction slice.

## Completed in This Slice

- shared-core staging folder
- shared-core asset map
- mirrored generic docs
- mirrored generic examples and templates
- mirrored safe skills
- shared-core validator
- `repo-intake-sot-mapper` extracted as `shared-with-local-inputs`
- `runtime-policy-auditor` extracted as `shared-with-local-inputs`
- local input contract validators for repo-intake and runtime-policy

## Next Candidate Slice

1. broaden shared helper scripts
2. normalize additional skill metadata
3. add overlay generation helpers
4. test adoption in a second repository

## Deferred Assets

- paper-to-live readiness review
- journal-to-learning extraction
- repo-local canonical source maps
- repo-local evidence logs

## Planned-But-Unimplemented Shared Skills

- `paper-to-live-readiness-reviewer` (referenced as deferred in consumer overlay bootstrap, not present in `skills/`)
- `journal-to-learning-extractor` (referenced as deferred in consumer overlay bootstrap, not present in `skills/`)

## Exit Criteria for the Roadmap

The extraction is ready to leave staging when a second repository can adopt the shared core with only overlay files and no manual edits to shared assets.
