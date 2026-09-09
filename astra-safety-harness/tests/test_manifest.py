import copy
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from jsonschema import ValidationError
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from manifest import create_manifest, validate_manifest, RunBinding

class ManifestTests(unittest.TestCase):
    def sample(self):
        return create_manifest('synthetic', '/synthetic/repo', 'a'*40, 'b'*40,
                               synthetic=True, now=datetime(2026,9,7,tzinfo=timezone.utc))

    def test_identity(self):
        m=self.sample()
        self.assertEqual(m['run_id'], 'UASH-synthetic-aaaaaaaaaaaa-bbbbbbbbbbbb-20260907T000000000000Z')
        self.assertEqual(m['reasoning_effort'], 'low')

    def test_reject_invalid_bindings(self):
        for field, value in [('base_sha','main'), ('head_sha','HEAD'), ('repository','../escape'),
                             ('reasoning_effort','high'), ('model','fallback'), ('synthetic',None),
                             ('repository_path','relative'), ('started_at','yesterday')]:
            with self.subTest(field=field), self.assertRaises((ValueError, ValidationError)):
                m=self.sample(); m[field]=value; validate_manifest(m)

    def test_required_and_extra_fields(self):
        for field in self.sample():
            m=self.sample(); del m[field]
            with self.assertRaises(ValidationError): validate_manifest(m)
        m=self.sample(); m['release_authority']=True
        with self.assertRaises(ValidationError): validate_manifest(m)

    def test_mutation_and_copy(self):
        m=self.sample(); binding=RunBinding(m)
        m['authority']='release'; self.assertEqual(binding.snapshot()['authority'],'NON_RELEASE_AUTHORITY')
        candidate=binding.snapshot(); candidate['repository_path']='/different'
        with self.assertRaisesRegex(ValueError,'identity mutation'): binding.check(candidate)
        self.assertTrue(binding.check(binding.snapshot()))

if __name__=='__main__': unittest.main()
