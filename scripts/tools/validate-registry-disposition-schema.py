#!/usr/bin/env python3
"""Validate Registry Disposition fixtures directly against the canonical JSON Schema."""

import argparse
import json
from pathlib import Path

from jsonschema import Draft202012Validator


def validate_fixture(schema: object, fixture: object) -> dict:
    issues = []
    results = []
    if not isinstance(fixture, dict):
        return {"passed": False, "issues": ["Fixture must be an object."], "results": results}
    cases = fixture.get("cases")
    if not isinstance(cases, list) or not cases:
        return {"passed": False, "issues": ["Fixture must contain a non-empty cases array."], "results": results}

    seen_ids = set()
    validator = Draft202012Validator(schema)
    for case in cases:
        if not isinstance(case, dict):
            issues.append("Case must be an object.")
            continue
        case_id = case.get("id")
        if not isinstance(case_id, str) or not case_id.strip():
            issues.append("Case id must be a non-empty string.")
            continue
        if case_id in seen_ids:
            issues.append(f"Duplicate case id: {case_id}")
            continue
        seen_ids.add(case_id)
        expected_pass = case.get("expectedPass")
        if not isinstance(expected_pass, bool):
            issues.append(f"{case_id}: expectedPass must be boolean.")
            continue
        validation_passed = not list(validator.iter_errors(case.get("input")))
        matched = validation_passed is expected_pass
        results.append({"id": case_id, "validationPassed": validation_passed, "matchedExpected": matched})
        if not matched:
            issues.append(f"{case_id}: expected schema validation {expected_pass}, observed {validation_passed}")
    return {"passed": not issues, "issues": issues, "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", required=True)
    parser.add_argument("--fixture", required=True)
    args = parser.parse_args()

    schema = json.loads(Path(args.schema).read_text(encoding="utf-8"))
    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    result = validate_fixture(schema, fixture)
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
