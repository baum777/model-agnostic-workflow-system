"""MAWS vNext — the merge lane authorization contract.

The contract and the implementation are two statements of the same thing, so
a silent drift between them would make the contract a decoration. This test
binds the contract: it accepts the shapes the executor accepts and refuses
the shapes the executor refuses, and it pins the rules the incident of
2026-10-21 needed.

Version 1.1.0 adds the LIFECYCLE of a lane:

  * a lifecycle-aware lane binds the EXACT reviewed head it authorizes —
    without that binding the reviewed head would be an operator-declared
    number, which is the shape the incident had;
  * a lane carries its state (active or closed), a closed lane authorizes
    no further merge and carries the merge it was closed by;
  * a lane may name the lane it supersedes;
  * the published history of version 1.0.0 stays valid as history and
    carries no lifecycle field: a 1.0.0 record that claims a state would be
    a record of two generations at once.
"""
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "core/contracts/merge-lane-authorization.schema.json").read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA)

HEAD_SHA = "c" * 40


def lane(**overrides):
    """A lifecycle-aware lane authorization of the current generation."""
    record = {
        "schema_version": "1.1.0",
        "lane_id": "merge-executor-hardening-20261021",
        "authority": "canonical_owner",
        "base_ref": "main",
        "head_ref": "evidence/merge-executor-hardening-20261021",
        "required_checks": ["loop-repo-ci"],
        "state": "active",
        "authorized_head_sha": HEAD_SHA,
    }
    record.update(overrides)
    return record


def legacy_lane(**overrides):
    """The published history of the first generation of lane authorizations."""
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


def consumption(**overrides):
    record = {
        "pull_request": 78,
        "merge_commit": "d" * 40,
        "head_sha": HEAD_SHA,
        "closed_at": "2026-10-21T12:00:00Z",
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

    # --- the lifecycle --------------------------------------------------------

    def test_accepts_the_published_history_of_the_first_generation(self):
        # Version 1.0.0 stays valid as history.
        self.assert_valid(legacy_lane())

    def test_refuses_a_first_generation_lane_that_claims_a_lifecycle_field(self):
        self.assert_invalid(legacy_lane(state="active"))
        self.assert_invalid(legacy_lane(supersedes="merge-incident-closure-20261021"))
        self.assert_invalid(legacy_lane(closed_by=consumption()))

    def test_refuses_a_lifecycle_aware_lane_without_a_state(self):
        record = lane()
        del record["state"]
        self.assert_invalid(record)

    def test_refuses_a_lifecycle_aware_lane_without_a_head_binding(self):
        record = lane()
        del record["authorized_head_sha"]
        self.assert_invalid(record)

    def test_refuses_an_unknown_state(self):
        self.assert_invalid(lane(state="paused"))

    def test_accepts_a_closed_lane_with_its_consumption_record(self):
        self.assert_valid(lane(state="closed", closed_by=consumption()))

    def test_refuses_a_closed_lane_without_its_consumption_record(self):
        self.assert_invalid(lane(state="closed"))

    def test_refuses_a_consumption_record_on_an_open_lane(self):
        self.assert_invalid(lane(closed_by=consumption()))

    def test_refuses_a_malformed_consumption_record(self):
        self.assert_invalid(lane(state="closed", closed_by=consumption(pull_request=0)))
        self.assert_invalid(lane(state="closed", closed_by=consumption(merge_commit="nope")))
        self.assert_invalid(lane(state="closed", closed_by=consumption(head_sha="nope")))
        self.assert_invalid(lane(state="closed", closed_by=consumption(closed_at="")))
        self.assert_invalid(lane(state="closed", closed_by=consumption(surprise=True)))

    def test_accepts_a_lane_that_supersedes_another_one(self):
        self.assert_valid(lane(supersedes="merge-incident-closure-20261021"))

    def test_refuses_a_malformed_supersedes_lane_id(self):
        self.assert_invalid(lane(supersedes="../escape"))
        self.assert_invalid(lane(supersedes="UPPER"))

    def test_refuses_an_unknown_schema_version(self):
        self.assert_invalid(lane(schema_version="2.0.0"))
        self.assert_invalid(lane(schema_version="1.0.5"))


if __name__ == "__main__":
    unittest.main()
