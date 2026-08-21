import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "registry_disposition_schema_validator",
    ROOT / "scripts/tools/validate-registry-disposition-schema.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SCHEMA = json.loads((ROOT / "core/contracts/registry-disposition.schema.json").read_text(encoding="utf-8"))


class RegistryDispositionSchemaFixtureTest(unittest.TestCase):
    def test_rejects_empty_case_suite(self):
        result = MODULE.validate_fixture(SCHEMA, {"cases": []})
        self.assertFalse(result["passed"])
        self.assertIn("non-empty cases array", result["issues"][0])

    def test_rejects_duplicate_ids_and_non_boolean_expectation(self):
        result = MODULE.validate_fixture(SCHEMA, {"cases": [
            {"id": "duplicate", "expectedPass": "true", "input": {}},
            {"id": "duplicate", "expectedPass": False, "input": {}},
        ]})
        self.assertFalse(result["passed"])
        self.assertTrue(any("expectedPass must be boolean" in issue for issue in result["issues"]))
        self.assertTrue(any("Duplicate case id" in issue for issue in result["issues"]))


if __name__ == "__main__":
    unittest.main()
