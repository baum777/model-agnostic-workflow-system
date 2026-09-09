import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from pinned import PinnedRepository
from collect import collect_diff,ContextCollector
REPO=Path(__file__).resolve().parents[2]
SHA='a905f7435900f7b16ef4bf949b01c5dfb1d17540'
class CollectorTests(unittest.TestCase):
    def setUp(self): self.repo=PinnedRepository(REPO,SHA,SHA)
    def test_empty_delta(self):
        d=collect_diff(self.repo);self.assertEqual(d['patch'],b'');self.assertEqual(d['changed_files'],[])
    def test_progressive(self):
        c=ContextCollector(self.repo);item=c.request('README.md','check ownership')
        self.assertEqual(item['sha'],SHA);self.assertEqual(len(c.requests),1)
        self.assertNotIn('content',c.requests[0])
    def test_limits_and_reason(self):
        with self.assertRaises(ValueError):ContextCollector(self.repo).request('README.md','')
        with self.assertRaises(ValueError):ContextCollector(self.repo,1).request('README.md','bounded')
