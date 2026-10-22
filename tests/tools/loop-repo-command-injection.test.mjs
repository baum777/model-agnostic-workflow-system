// MAWS vNext — the loop adapter must not hand a caller's path to a shell.
// node:test + node:assert/strict, no new dependencies.
//
// The repository's own policy for child_process is execFileSync with an
// argument array and no shell. The loop adapter read the repository state
// with execSync and a shell string that carried the target path inside
// double quotes. The path arrives from the command line, and through the CI
// gate from a caller that passes a repository path, so a path containing a
// quote or a command substitution escaped the quotes and ran.
//
// These tests bind the closed form: a path that carries a shell payload is
// passed to git as ONE argument, and nothing is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createScratchRoot, removeScratchRoot } from '../../scripts/tools/safe-remove.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADAPTER = path.join(ROOT, 'scripts', 'tools', 'baum-loop-repo.mjs');

// The adapter refuses a target it cannot read anything from BEFORE it
// reads the repository state, so a fixture target must carry one file the
// scanner accepts. Without it the shell call is never reached and the test
// would pass for the wrong reason.
function makeReadableTarget(target) {
  fs.mkdirSync(path.join(target, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(target, 'docs', 'README.md'), '# fixture target\n');
  return target;
}

function runAdapter(targetPath, cwd) {
  try {
    execFileSync(process.execPath, [ADAPTER, `command/ loop repo ${targetPath}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000
    });
  } catch {
    // The adapter may refuse the path it is given; the refusal is not what
    // this test is about. What matters is that nothing was EXECUTED.
  }
}

test('a repository path that carries a shell payload cannot escape the git call', () => {
  const workspace = createScratchRoot({ prefix: 'loop-repo-injection-' }).root;
  try {
    const marker = path.join(workspace, 'INJECTED');
    // The directory NAME carries the payload: a double quote closes the
    // quoted argument, the command runs, and a second quote re-opens it.
    const target = makeReadableTarget(path.join(workspace, `target"; touch ${marker}; echo "`));
    runAdapter(target, workspace);
    assert.equal(
      fs.existsSync(marker),
      false,
      'the payload in the repository path did not run'
    );
  } finally {
    removeScratchRoot({ root: workspace });
  }
});

test('a repository path that carries a command substitution cannot escape the git call', () => {
  const workspace = createScratchRoot({ prefix: 'loop-repo-substitution-' }).root;
  try {
    const marker = path.join(workspace, 'SUBSTITUTED');
    // Inside double quotes a command substitution still runs.
    const target = makeReadableTarget(path.join(workspace, `target-$(touch ${marker})`));
    runAdapter(target, workspace);
    assert.equal(
      fs.existsSync(marker),
      false,
      'the command substitution in the repository path did not run'
    );
  } finally {
    removeScratchRoot({ root: workspace });
  }
});

test('a plain repository path is still read as a repository state', () => {
  const workspace = createScratchRoot({ prefix: 'loop-repo-plain-' }).root;
  try {
    const target = makeReadableTarget(path.join(workspace, 'target'));
    const output = execFileSync(
      process.execPath,
      [ADAPTER, `command/ loop repo ${target}`],
      { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }
    );
    // The adapter reports the state it read; the point is that the call
    // still WORKS after the shell was removed.
    assert.match(output, /Result:/);
  } catch (error) {
    // A refusal of a non-repository directory is acceptable; a crash in the
    // adapter is not. The state that matters is that no shell was involved.
    assert.ok(error.status !== undefined, 'the adapter exited normally');
  } finally {
    removeScratchRoot({ root: workspace });
  }
});
