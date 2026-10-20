// Governance gate: every recorded run disposition under evidence/ must
// satisfy this repository's own registry-disposition.v1 contract.
//
// A disposition artifact is the declaration of a run's Registry consequence.
// An artifact that does not satisfy the contract cannot declare anything:
// it is neither a valid REQUIRED_BUT_BLOCKED (which needs a reason and at
// least one evidence ref) nor a valid UPDATED (which needs the registry
// commit sha and the classified affected records). Such an artifact must
// fail here rather than at the Registry.
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateRegistryDisposition } from '../../scripts/tools/validate-registry-disposition.mjs';
import { validateInstanceAgainstContract } from '../../scripts/tools/validate-maws-vnext-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const evidenceRoot = path.join(root, 'evidence');
const DISPOSITION_CONTRACT = 'core/contracts/registry-disposition.schema.json';

function dispositionArtifacts() {
  const artifacts = [];
  for (const entry of fs.readdirSync(evidenceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(evidenceRoot, entry.name, 'registry-disposition.json');
    if (fs.existsSync(candidate)) artifacts.push(candidate);
  }
  return artifacts.sort();
}

test('every recorded run disposition satisfies the registry-disposition.v1 contract', () => {
  const artifacts = dispositionArtifacts();
  assert.ok(artifacts.length >= 20, `expected the recorded dispositions to be present, found ${artifacts.length}`);
  const failures = [];
  for (const artifact of artifacts) {
    const relative = path.relative(root, artifact);
    const payload = JSON.parse(fs.readFileSync(artifact, 'utf8'));
    const result = validateRegistryDisposition(payload);
    if (!result.passed) {
      failures.push(`${relative}: ${result.issues.join('; ')}`);
    }
    const schemaIssues = validateInstanceAgainstContract(payload, DISPOSITION_CONTRACT, root);
    if (schemaIssues.length > 0) {
      failures.push(`${relative} (schema): ${schemaIssues.join('; ')}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the disposition gate is not vacuous: a non-canonical artifact is rejected', () => {
  const broken = {
    registry_disposition: {
      contract: 'registry-disposition.v1',
      disposition_status: 'UPDATED',
      affected_records: []
    }
  };
  const result = validateRegistryDisposition(broken);
  assert.equal(result.passed, false);
  const schemaIssues = validateInstanceAgainstContract(broken, DISPOSITION_CONTRACT, root);
  assert.ok(schemaIssues.length > 0);
});

test('the validator CLI answers an explicitly named file, even next to --fixture', () => {
  // `npm run validate-registry-disposition <file>` appends <file> to the
  // hard-wired `--fixture <corpus>` invocation. The named file must be the
  // artifact that gets validated: a silently ignored argument would let a
  // broken artifact pass unnoticed behind a green corpus run.
  const cliPath = path.join(root, 'scripts', 'tools', 'validate-registry-disposition.mjs');
  const corpusPath = path.join(root, 'evals', 'fixtures', 'registry-disposition-contract.json');
  const artifact = dispositionArtifacts()[0];

  const explicit = spawnSync(process.execPath, [cliPath, '--fixture', corpusPath, artifact], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.deepEqual(JSON.parse(explicit.stdout), { passed: true, issues: [] });

  // The corpus itself keeps validating in the corpus mode.
  const corpus = spawnSync(process.execPath, [cliPath, '--fixture', corpusPath], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(corpus.status, 0, corpus.stderr);
  assert.equal(JSON.parse(corpus.stdout).passed, true);
});
