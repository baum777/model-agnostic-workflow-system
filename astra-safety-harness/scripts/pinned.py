"""Pinned Git object access; working-tree files and Git symlinks are never evidence."""
from pathlib import Path, PurePosixPath
from preflight import git, SHA


class PinnedRepository:
    def __init__(self, repo, base_sha, head_sha):
        self.repo = Path(repo).resolve(strict=True)
        root = git(self.repo, 'rev-parse', '--show-toplevel')
        if root.returncode or root.stdout.decode().strip() != str(self.repo):
            raise ValueError('exact repository root required')
        for sha in (base_sha, head_sha):
            if not isinstance(sha, str) or not SHA.fullmatch(sha):
                raise ValueError('full immutable SHA required')
            result = git(self.repo, 'cat-file', '-t', sha)
            if result.returncode or result.stdout.strip() != b'commit':
                raise ValueError('commit unavailable')
        self._base = base_sha
        self._head = head_sha

    @property
    def base_sha(self): return self._base

    @property
    def head_sha(self): return self._head

    @staticmethod
    def path(path):
        if (not isinstance(path,str) or not path or path.startswith('/') or '\\' in path
                or any(ord(c)<32 for c in path) or any(c in ('..','.') for c in path.split('/'))
                or str(PurePosixPath(path)) != path):
            raise ValueError('unsafe repository path')
        return path

    def read(self, path, *, revision='head', max_bytes=262144):
        path = self.path(path)
        if revision not in ('head','base'):
            raise ValueError('only bound revisions allowed')
        sha = self.head_sha if revision=='head' else self.base_sha
        entry = git(self.repo,'ls-tree','-z',sha,'--',path)
        records = entry.stdout.split(b'\0')
        record = next((r for r in records if b'\t' in r and r.split(b'\t',1)[1].decode()==path),None)
        if record is None:
            raise ValueError('source not present at pinned revision')
        header = record.split(b'\t',1)[0].split()
        if header[0] not in (b'100644',b'100755') or header[1]!=b'blob':
            raise ValueError('symlink, submodule or non-regular source rejected')
        oid = header[2].decode()
        size = git(self.repo,'cat-file','-s',oid)
        if size.returncode or int(size.stdout)>max_bytes:
            raise ValueError('source exceeds context limit')
        result = git(self.repo,'cat-file','blob',oid)
        if result.returncode or len(result.stdout)>max_bytes:
            raise ValueError('source unavailable or oversized')
        return result.stdout
