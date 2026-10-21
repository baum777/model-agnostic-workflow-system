"""MAWS vNext — the merge lane authorization contract.

The contract and the implementation are two statements of the same thing, so
a silent drift between them would make the contract a decoration. This test
binds the contract: it accepts the shapes the executor accepts and refuses
the shapes the executor refuses, and it pins the "a lane must demand
something" rule that the incident of 2026-10-21 needed.
"""
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "core/contracts/merge-lane-authorization.schema.json").read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA)


def lane(**overrides):
    record = {
        "schema_version": "1.0.0",
        "lane_id": "merge-incident-closure-20261021",
        "authority": "canonical_owner",
        "base_ref": "main",
        "head_ref": "docs/merge-incident-closure-20261021",
        "required_checks": ["loop-repo-ci"],
    }
    record.update(overrides)
    return record


class MergeLaneAuthorizationSchemaTest(unittest.TestCase):
    def assert_valid(self, record):
        errors = sorted(VALIDATOR.iter_errors(record), key=lambda error: list(error.path))
        self.assertEqual(errors, [], f"the record must be valid: {[error.message for error in errors]}")

    def assert_invalid(self, record):
        errors = list(VALIDATOR.iter_errors(record))
        self.assertTrue(errors, "the record must be refused")

    def test_accepts_a_lane_that_demands_a_hosted_check(self):
        self.assert_valid(lane())

    def test_accepts_a_lane_that_demands_a_local_gate(self):
        self.assert_valid(lane(required_checks=[], required_local_gates=["test:vnext"]))

    def test_accepts_the_optional_pins(self):
        self.assert_valid(lane(
            head_repository="baum777",
            authorized_commit="a" * 40,
            authorized_head_sha="b" * 40,
        ))

    def test_refuses_a_lane_that_demands_nothing(self):
        # The incident's precondition: a merge that needs no green check.
        self.assert_invalid(lane(required_checks=[]))
        self.assert_invalid(lane(required_checks=[], required_local_gates=[]))

    def test_refuses_another_authority(self):
        self.assert_invalid(lane(authority="self_declared_owner"))

    def test_refuses_an_unknown_field(self):
        self.assert_invalid(lane(surprise=True))

    def test_refuses_a_traversing_lane_id(self):
        self.assert_invalid(lane(lane_id="../escape"))

    def test_refuses_a_malformed_digest(self):
        self.assert_invalid(lane(authorized_commit="not-a-sha"))
        self.assert_invalid(lane(authorized_head_sha="not-a-sha"))

    def test_refuses_a_malformed_ref(self):
        self.assert_invalid(lane(head_ref=""))
        self.assert_invalid(lane(base_ref="with space"))


if __name__ == "__main__":
    unittest.main()
