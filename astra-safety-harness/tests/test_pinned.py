import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from pinned import PinnedRepository
REPO=Path(__file__).resolve().parents[2]
SHA='a905f7435900f7b16ef4bf949b01c5dfb1d17540'
class PinnedTests(unittest.TestCase):
    def setUp(self): self.repo=PinnedRepository(REPO,SHA,SHA)
    def test_pinned_source(self):
        self.assertIn(b'model-agnostic',self.repo.read('README.md'))
        self.assertEqual(self.repo.read('README.md'),self.repo.read('README.md',revision='base'))
    def test_no_worktree_leak(self):
        with self.assertRaises(ValueError): self.repo.read('astra-safety-harness/scripts/manifest.py')
    def test_unsafe_paths_and_revisions(self):
        for path in ('../README.md','/etc/passwd','./README.md','a//b','a\\b','README.md\n'):
            with self.subTest(path=path),self.assertRaises(ValueError): self.repo.read(path)
        with self.assertRaises(ValueError): self.repo.read('README.md',revision='main')
    def test_limits(self):
        with self.assertRaises(ValueError): self.repo.read('README.md',max_bytes=1)
    def test_immutable_api(self):
        with self.assertRaises(AttributeError): self.repo.head_sha='main'
