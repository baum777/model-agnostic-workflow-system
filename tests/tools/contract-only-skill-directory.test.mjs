import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isDeclaredContractOnlySkillDirectory } from '../../scripts/tools/validate-shared-core-scaffold.mjs';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-only-skill-'));
  const directory = path.join(root, 'skills', 'harness');
  fs.mkdirSync(directory, { recursive: true });
  return { root, directory };
}

test('accepts the explicitly declared harness contract-only directory', () => {
  const { root, directory } = makeFixture();
  fs.writeFileSync(path.join(directory, 'weakness-mining.skill.yaml'), 'skill_id: harness.weakness_mining\n', 'utf8');

  assert.equal(isDeclaredContractOnlySkillDirectory(root, directory), true);
});

test('rejects contract-only directories with undeclared extra files', () => {
  const { root, directory } = makeFixture();
  fs.writeFileSync(path.join(directory, 'weakness-mining.skill.yaml'), 'skill_id: harness.weakness_mining\n', 'utf8');
  fs.writeFileSync(path.join(directory, 'README.md'), '# undeclared surface\n', 'utf8');

  assert.equal(isDeclaredContractOnlySkillDirectory(root, directory), false);
});

test('rejects unlisted contract-only skill directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-only-skill-unlisted-'));
  const directory = path.join(root, 'skills', 'other');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'other.skill.yaml'), 'skill_id: other.skill\n', 'utf8');

  assert.equal(isDeclaredContractOnlySkillDirectory(root, directory), false);
});
