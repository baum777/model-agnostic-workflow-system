"""Progressive pinned context with explicit request reasons and bounded diff."""
import hashlib
from preflight import git
from pathlib import PurePosixPath

EXCLUDED = {"node_modules", "vendor", "dist", "build", "coverage", "generated"}
LOCKFILES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.lock"}

def excluded(path):
    parts=PurePosixPath(path).parts
    return bool(set(parts) & EXCLUDED) or parts[-1] in LOCKFILES or parts[-1].endswith(".min.js")



def collect_diff(repo, max_bytes=1048576):
    result=git(repo.repo,'diff','--no-ext-diff','--no-textconv','--no-renames','--binary',repo.base_sha,repo.head_sha,'--')
    if result.returncode or len(result.stdout)>max_bytes:
        raise ValueError('BLOCKED_PREFLIGHT: diff unavailable or exceeds bounded context')
    changed=git(repo.repo,'diff','--no-ext-diff','--no-textconv','--no-renames','--name-status','-z',repo.base_sha,repo.head_sha,'--')
    if changed.returncode: raise ValueError('changed file inventory unavailable')
    tokens=changed.stdout.decode('utf-8',errors='strict').split('\0')
    if tokens[-1]=='': tokens.pop()
    if len(tokens)%2: raise ValueError('invalid changed file inventory')
    files=[]
    for i in range(0,len(tokens),2):
        path=repo.path(tokens[i+1]); status=tokens[i]
        files.append({'path':path,'status':status})
    included=[f['path'] for f in files if not excluded(f['path'])]
    context_patch=b''
    if included:
        context=git(repo.repo,'diff','--no-ext-diff','--no-textconv','--no-renames',repo.base_sha,repo.head_sha,'--',*included)
        if context.returncode or len(context.stdout)>max_bytes: raise ValueError('context diff unavailable')
        context_patch=context.stdout
    return {'patch':result.stdout,'context_patch':context_patch,'changed_files':files,
            'excluded_context_paths':[f['path'] for f in files if excluded(f['path'])],
            'patch_digest':hashlib.sha256(result.stdout).hexdigest()}


class ContextCollector:
    def __init__(self, repo, max_total_bytes=1048576):
        self.repo=repo; self.remaining=max_total_bytes; self.requests=[]

    def request(self, path, reason, *, revision='head'):
        if not isinstance(reason,str) or not reason.strip():
            raise ValueError('context expansion requires a reason')
        if excluded(path): raise ValueError('generated or third-party context excluded')
        data=self.repo.read(path,revision=revision,max_bytes=min(self.remaining,262144))
        if b'\0' in data: raise ValueError('binary source excluded')
        content=data.decode('utf-8',errors='strict')
        self.remaining-=len(data)
        item={'path':path,'sha':self.repo.head_sha if revision=='head' else self.repo.base_sha,
              'reason':reason,'content':content,'digest':hashlib.sha256(data).hexdigest(),
              'trust':'UNTRUSTED_REPOSITORY_EVIDENCE'}
        self.requests.append({k:v for k,v in item.items() if k!='content'})
        return item
