#!/usr/bin/env python3
"""
Baum-OS Contract Schema Validator
Validates hardcoded YAML contract files against their JSON schemas.
No network calls. No file writes. No secret access. No Pi execution.
"""

import json
import sys
from pathlib import Path

import yaml
import jsonschema
from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).parent.parent.parent

CONTRACTS = [
    ("skills/pi/tier1-docs-draft.skill.yaml", "schemas/skill.schema.json"),
    ("tools/pi-cli.tool.yaml", "schemas/tool.schema.json"),
    ("policies/write-modes.policy.yaml", "schemas/policy.schema.json"),
]


def load_yaml(path: Path) -> object:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    failures = 0

    for contract_rel, schema_rel in CONTRACTS:
        contract_path = REPO_ROOT / contract_rel
        schema_path = REPO_ROOT / schema_rel

        print(f"\n--- {contract_rel}")

        if not contract_path.exists():
            print(f"  FAIL  contract not found: {contract_path}")
            failures += 1
            continue

        if not schema_path.exists():
            print(f"  FAIL  schema not found: {schema_path}")
            failures += 1
            continue

        schema = load_json(schema_path)
        try:
            Draft202012Validator.check_schema(schema)
        except jsonschema.SchemaError as e:
            print(f"  FAIL  schema invalid ({schema_rel}): {e.message}")
            failures += 1
            continue

        instance = load_yaml(contract_path)
        validator = Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))

        if not errors:
            print(f"  PASS  {contract_rel}")
        else:
            for err in errors:
                path = ".".join(str(p) for p in err.absolute_path) or "(root)"
                print(f"  FAIL  {path}: {err.message}")
            failures += 1

    print()
    if failures == 0:
        print("ALL CONTRACTS VALID")
        return 0
    else:
        print(f"VALIDATION FAILED: {failures} contract(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
