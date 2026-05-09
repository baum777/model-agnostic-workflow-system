import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateWikiOverlay } from '../../scripts/tools/validate-wiki-overlay.mjs';

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-validator-'));
  fs.mkdirSync(path.join(root, 'wiki-overlay'), { recursive: true });
  return root;
}

function writeOverlay(root, relativePath, body) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, body, 'utf8');
}

function validOverlay(relativePath = 'wiki-overlay/index.md') {
  return `---
zone: operational-playbook
authority: operational
source_path: ${relativePath}
llm_processing: yes
summary_allowed: yes
wiki_allowed: pointer-only
copy_policy: pointer-only
privacy: internal
maturity: prose-governed
status: active
canonical_source: README.md
review_gate: none
notes: "Test overlay."
generated_at: "2026-05-09T00:00:00+02:00"
overlay_spec_version: "1.0"
---

# Overlay Test

> non-migrating overlay - no original file edits - pointer-only index

## Pointer-Only References

- \`README.md\` - pointer-only reference.
`;
}

test('valid overlay frontmatter and pointer policy pass', () => {
  const root = makeTempRepo();
  writeOverlay(root, 'wiki-overlay/index.md', validOverlay());

  const report = validateWikiOverlay(root);

  assert.equal(report.ok, true);
  assert.equal(report.errorCount, 0);
  assert.equal(report.filesChecked, 1);
});

test('missing required frontmatter field fails', () => {
  const root = makeTempRepo();
  writeOverlay(root, 'wiki-overlay/index.md', validOverlay().replace('copy_policy: pointer-only\n', ''));

  const report = validateWikiOverlay(root);

  assert.equal(report.ok, false);
  assert(report.findings.some((finding) => finding.code === 'frontmatter.required_field_missing'));
});

test('hard exclusion reference requires lock marker', () => {
  const root = makeTempRepo();
  writeOverlay(root, 'wiki-overlay/index.md', `${validOverlay()}
## Bad Reference

- Read \`.git/\` as context.
`);

  const report = validateWikiOverlay(root);

  assert.equal(report.ok, false);
  assert(report.findings.some((finding) => finding.code === 'hard_exclusion.unlocked_reference'));
});

test('json path references require pointer or metadata marker', () => {
  const root = makeTempRepo();
  writeOverlay(root, 'wiki-overlay/index.md', `${validOverlay()}
## Bad JSON Reference

- \`providers/openai-codex/export.json\` contains provider export data.
`);

  const report = validateWikiOverlay(root);

  assert.equal(report.ok, false);
  assert(report.findings.some((finding) => finding.code === 'pointer_policy.json_reference_unmarked'));
});
