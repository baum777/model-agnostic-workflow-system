import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from preflight import preflight, git
REPO=Path(__file__).resolve().parents[2]
SHA='a905f7435900f7b16ef4bf949b01c5dfb1d17540'
class PreflightTests(unittest.TestCase):
    def test_pinned_repo(self):
        before=git(REPO,'status','--porcelain=v1','-z').stdout
        result=preflight(REPO,SHA,SHA)
        self.assertEqual(result['status'],'PASS')
        self.assertEqual(len(result['checks']),10)
        self.assertEqual(before,git(REPO,'status','--porcelain=v1','-z').stdout)
    def test_missing_repo(self):
        self.assertEqual(preflight(REPO/'nonexistent-uash',SHA,SHA)['status'],'BLOCKED_PREFLIGHT')
    def test_nested_root_rejected(self):
        self.assertEqual(preflight(REPO/'scripts',SHA,SHA)['status'],'BLOCKED_PREFLIGHT')
    def test_symbolic_and_missing_commit_rejected(self):
        for value in ('HEAD','main','-c','f'*40):
            with self.subTest(value=value):
                self.assertEqual(preflight(REPO,value,SHA)['status'],'BLOCKED_PREFLIGHT')
