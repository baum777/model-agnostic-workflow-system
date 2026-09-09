"""Pure run identity mechanics. No model invocation or repository mutation."""
import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]


def validate_manifest(manifest):
    schema = json.loads((ROOT / 'schemas/manifest.schema.json').read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(manifest)
    stamp = datetime.fromisoformat(manifest['started_at'].replace('Z', '+00:00'))
    if stamp.utcoffset().total_seconds() != 0:
        raise ValueError('run timestamp must be UTC')
    expected = run_id(manifest['repository'], manifest['base_sha'], manifest['head_sha'], stamp)
    if expected != manifest['run_id']:
        raise ValueError('run identity mismatch')
    if not Path(manifest['repository_path']).is_absolute():
        raise ValueError('repository path must be absolute')
    return manifest


def run_id(repository, base_sha, head_sha, stamp):
    return f'UASH-{repository}-{base_sha[:12]}-{head_sha[:12]}-{stamp:%Y%m%dT%H%M%S%fZ}'


def create_manifest(repository, repository_path, base_sha, head_sha, *, synthetic, now=None):
    stamp = now or datetime.now(timezone.utc)
    if stamp.tzinfo is None:
        raise ValueError('timezone required')
    stamp = stamp.astimezone(timezone.utc)
    result = dict(schema='unitera.astra.run-manifest.v1', schema_version='1.0.0',
                  prompt_contract_version='1.0.0', repository=repository,
                  repository_path=str(repository_path), base_sha=base_sha, head_sha=head_sha,
                  model='gpt-6-astra', reasoning_effort='low', mode='read_only_verification',
                  authority='NON_RELEASE_AUTHORITY', synthetic=synthetic,
                  started_at=stamp.isoformat().replace('+00:00', 'Z'),
                  run_id=run_id(repository, base_sha, head_sha, stamp))
    return validate_manifest(result)


class RunBinding:
    """Defensive copy and identity seal, independent of mutable caller objects."""
    def __init__(self, manifest):
        self._manifest = copy.deepcopy(validate_manifest(manifest))
        self._seal = self.seal(self._manifest)

    @staticmethod
    def seal(value):
        # Internal identity comparison only; NOT the RFC8785 evidence digest.
        return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

    def snapshot(self):
        return copy.deepcopy(self._manifest)

    def check(self, candidate):
        validate_manifest(candidate)
        if self.seal(candidate) != self._seal:
            raise ValueError('INVALID_RUN: manifest identity mutation')
        return True
