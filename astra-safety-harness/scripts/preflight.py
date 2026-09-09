"""Read-only deterministic inspection. Never executes discovered project commands."""
import os
import json
import re
import subprocess
from pathlib import Path

SHA = re.compile(r'(?:[0-9a-f]{40}|[0-9a-f]{64})\Z')


def git(repo, *args):
    env = {'PATH': os.defpath, 'LANG': 'C', 'GIT_CONFIG_NOSYSTEM': '1',
           'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_OPTIONAL_LOCKS': '0',
           'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_TERMINAL_PROMPT': '0'}
    return subprocess.run(['git', '--no-pager', '--literal-pathspecs', '-C', str(repo), *args],
                          env=env, capture_output=True, timeout=30, check=False)


def preflight(repo, base_sha, head_sha):
    checks = []
    details = {}
    def check(id, passed, reason):
        checks.append({'id': id, 'result': 'PASS' if passed else 'FAIL', 'reason': reason})
        return passed
    repo = Path(repo).resolve()
    if not check('P0-01', repo.is_dir(), 'repository directory exists'):
        return {'status':'BLOCKED_PREFLIGHT','checks':checks,'details':details}
    root = git(repo, 'rev-parse', '--show-toplevel')
    if not check('P0-02', root.returncode == 0 and root.stdout.decode().strip() == str(repo), 'exact worktree root required'):
        return {'status':'BLOCKED_PREFLIGHT','checks':checks,'details':details}
    for id, sha in [('P0-03',base_sha), ('P0-04',head_sha)]:
        valid = isinstance(sha,str) and bool(SHA.fullmatch(sha))
        obj = git(repo,'cat-file','-t',sha) if valid else None
        check(id, bool(obj and obj.returncode == 0 and obj.stdout.strip() == b'commit'), 'immutable commit object required')
    if any(c['result']=='FAIL' for c in checks):
        return {'status':'BLOCKED_PREFLIGHT','checks':checks,'details':details}
    reachable = git(repo,'merge-base','--is-ancestor',base_sha,head_sha)
    check('P0-05', reachable.returncode == 0, 'BASE must be ancestor of HEAD')
    diff = git(repo,'diff','--no-ext-diff','--no-textconv','--binary',base_sha,head_sha,'--')
    check('P0-06',diff.returncode == 0,'pinned diff generated')
    status = git(repo,'status','--porcelain=v1','-z','--untracked-files=all')
    check('P0-07',status.returncode == 0,'worktree status recorded as receipt only')
    details['worktree_status'] = status.stdout.decode('utf-8', errors='backslashreplace').split('\0')
    tree = git(repo,'ls-tree','-r','--name-only','-z',head_sha)
    paths = tree.stdout.decode('utf-8', errors='strict').split('\0') if tree.returncode==0 else []
    details['dependency_manifests'] = [p for p in paths if Path(p).name in ('package.json','pyproject.toml','requirements.txt','Cargo.toml','go.mod')]
    check('P0-08',tree.returncode==0,'manifest inventory recorded, including empty inventory')
    # Discovery is data only; target policy will bind command authority in UASH-05.
    details['check_configuration'] = [p for p in paths if Path(p).name in ('package.json','Makefile','pyproject.toml','tox.ini','Cargo.toml')]
    discovered = []
    for config in details['check_configuration']:
        if Path(config).name != 'package.json':
            continue
        content = git(repo, 'show', f'{head_sha}:{config}')
        try:
            scripts = json.loads(content.stdout).get('scripts', {})
            for name, command in scripts.items():
                if any(word in name for word in ('test', 'eval', 'check', 'validate')) and isinstance(command, str):
                    discovered.append({'source': config, 'name': name, 'command': command, 'class': 'DISCOVERED'})
        except (ValueError, AttributeError):
            continue
    details['discovered_checks'] = discovered
    check('P0-09',bool(discovered),'test/check commands discovered as data; execution binding deferred')
    details['security_configuration'] = [p for p in paths if any(x in p.lower() for x in ('security','policy','policies','rls'))]
    check('P0-10',tree.returncode==0,'security configuration inventory recorded, including empty inventory')
    return {'status':'PASS' if all(c['result']=='PASS' for c in checks) else 'BLOCKED_PREFLIGHT', 'checks':checks,'details':details}
